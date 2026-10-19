import { Column } from '@watchlist/game-record-writer';
import { SheetApiError, type SheetApi } from '@watchlist/sheet-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getOrFetchData, markUpdated, refetchGame } from '../src/sheetFetcher';
import type { SheetData } from '../src/types';

const api = {
    fetchDump: vi.fn<SheetApi['fetchDump']>(),
    readRow: vi.fn<SheetApi['readRow']>(),
};

vi.mock('../src/tampermonkey', () => ({
    withSheetApi: <T>(run: (sheetApi: SheetApi) => Promise<T>) => run(api as unknown as SheetApi),
}));

const storageKey = 'ekkoGames';
const dayMs = 24 * 60 * 60 * 1000;

const saved = () => JSON.parse(localStorage.getItem(storageKey) ?? 'null') as SheetData | null;

function data(time = Date.now()): SheetData {
    return {
        games: [
            { B: 'Tacoma', G: 'Wed May 01 2019', K: 3, appId: 343860 },
            { B: 'Gone Home', G: '', K: 2 },
        ],
        labelMap: {},
        time,
    };
}

beforeEach(() => {
    localStorage.clear();
    api.fetchDump.mockResolvedValue({ games: [{ B: 'Fresh', K: 1 }], labelMap: {} });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('getOrFetchData', () => {
    it('fetches and saves the dump when nothing is cached', async () => {
        const fetched = await getOrFetchData();
        expect(fetched.games).toEqual([{ B: 'Fresh', K: 1 }]);
        expect(saved()?.games).toEqual([{ B: 'Fresh', K: 1 }]);
    });

    it('uses the cached dump within a day, and fetches again after', async () => {
        localStorage.setItem(storageKey, JSON.stringify(data(Date.now() - dayMs + 60_000)));
        expect((await getOrFetchData()).games[0]?.B).toBe('Tacoma');
        expect(api.fetchDump).not.toHaveBeenCalled();

        localStorage.setItem(storageKey, JSON.stringify(data(Date.now() - dayMs - 60_000)));
        expect((await getOrFetchData()).games[0]?.B).toBe('Fresh');
        expect(api.fetchDump).toHaveBeenCalledTimes(1);
    });
});

describe('markUpdated', () => {
    it('sets the update date of the games with that whole name cell, keeping the fetch time', () => {
        const cached = data(123);
        expect(markUpdated(cached, 'Tacoma', new Date(2026, 9, 19))).toBe(true);
        expect(cached.games[0]?.G).toBe(new Date(2026, 9, 19).toDateString());
        expect(saved()?.games[0]?.G).toBe(new Date(2026, 9, 19).toDateString());
        expect(saved()?.time).toBe(123);
    });

    it('leaves the cache alone when no name cell is the same', () => {
        expect(markUpdated(data(), 'Tacoma / 塔科馬', new Date())).toBe(false);
        expect(saved()).toBeNull();
    });
});

describe('refetchGame', () => {
    const row = (values: Record<string, string | number>) => ({ row: 7, values });

    it("replaces the app id's games with its row, as the dump has it", async () => {
        api.readRow.mockResolvedValue(row({
            [Column.name]: 'Tacoma / 塔科馬', [Column.updatedOn]: '2026/10/19', [Column.wantLevel]: 4, [Column.anyDeal]: '',
        }));
        const cached = data(123);
        await refetchGame(cached, 343860);
        expect(api.readRow).toHaveBeenCalledWith(343860, [Column.name, Column.updatedOn, Column.wantLevel, Column.anyDeal]);
        expect(cached.games).toEqual([
            { B: 'Gone Home', G: '', K: 2 },
            { B: 'Tacoma / 塔科馬', G: new Date(2026, 9, 19).toDateString(), K: 4, appId: 343860 },
        ]);
        expect(saved()).toEqual(cached);
        expect(saved()?.time).toBe(123);
    });

    it('takes an owned mark in AnyDeal over the want level, as the dump does', async () => {
        api.readRow.mockResolvedValue(row({
            [Column.name]: 'Tacoma', [Column.updatedOn]: '', [Column.wantLevel]: 3, [Column.anyDeal]: '已有',
        }));
        const cached = data();
        await refetchGame(cached, 343860);
        expect(cached.games.find(game => game.appId === 343860)).toMatchObject({ K: '已有', G: '' });
    });

    it('drops the games of a row whose want level is now 0', async () => {
        api.readRow.mockResolvedValue(row({
            [Column.name]: 'Tacoma', [Column.updatedOn]: '', [Column.wantLevel]: 0, [Column.anyDeal]: '',
        }));
        const cached = data();
        await refetchGame(cached, 343860);
        expect(cached.games.map(game => game.B)).toEqual(['Gone Home']);
    });

    it('drops the games of an app id the sheet no longer has, then rejects', async () => {
        api.readRow.mockRejectedValue(new SheetApiError('not-found', 'no row'));
        const cached = data();
        await expect(refetchGame(cached, 343860)).rejects.toMatchObject({ code: 'not-found' });
        expect(cached.games.map(game => game.B)).toEqual(['Gone Home']);
        expect(saved()?.games.map(game => game.B)).toEqual(['Gone Home']);
    });

    it('keeps the cache on any other failure', async () => {
        api.readRow.mockRejectedValue(new Error('timeout'));
        const cached = data();
        await expect(refetchGame(cached, 343860)).rejects.toThrow('timeout');
        expect(cached.games).toHaveLength(2);
        expect(saved()).toBeNull();
    });
});
