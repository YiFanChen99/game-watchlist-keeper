import type { SheetApi } from '@watchlist/sheet-api';
import { describe, expect, it, vi } from 'vitest';

import { fixtureFetchText, loadStorePage } from '../../steam-info-scraper/test/fixtures';
import {
    addGame,
    Column,
    extractPlaytime,
    fetchPlaytime,
    refreshGame,
    refreshReadColumns,
    sheetApiRowStore,
    type SheetRowStore,
    type SheetRowValues,
} from '../src';

function fakeStore(row: SheetRowValues) {
    const read = vi.fn<SheetRowStore['read']>(() => Promise.resolve(row));
    const write = vi.fn<SheetRowStore['write']>(() => Promise.resolve());
    const append = vi.fn<SheetRowStore['append']>(() => Promise.resolve());
    const store: SheetRowStore = { read, write, append };
    return { store, read, write, append };
}

describe('refreshGame', () => {
    it('writes merged updates back to the same app id and reports changes', async () => {
        const { store, read, write } = fakeStore({
            [Column.originalPrice]: 459,
            [Column.special]: '英',
            [Column.detail]: '手寫的遊戲特點。26/03EA。中位1H，3rd.高2H。',
        });

        const { updates, changes } = await refreshGame(2868840, {
            fetchText: fixtureFetchText,
            store,
            now: () => new Date(2026, 9, 17),
        });

        expect(read).toHaveBeenCalledWith(2868840, refreshReadColumns);
        expect(write).toHaveBeenCalledWith(2868840, updates);
        expect(updates).toMatchObject({
            [Column.originalPrice]: 499,
            [Column.releaseDate]: '2026/3/5',
            [Column.reviewScore]: 61,
            [Column.updatedOn]: '2026/10/17',
            [Column.special]: '簡',
        });
        expect(updates[Column.detail]).toMatch(/^手寫的遊戲特點。26\/03EA。中位\d+H，3rd\.高\d+H。$/);
        expect(changes.map(change => change.column)).toEqual([Column.originalPrice, Column.special, Column.detail]);
        expect(changes[0]).toEqual({ column: Column.originalPrice, oldValue: 459, newValue: 499, delta: 40 });
    });

    it('uses the open store page instead of fetching it, with the same result', async () => {
        const row = { [Column.originalPrice]: 459, [Column.special]: '英' };
        const fetched = await refreshGame(2868840, { fetchText: fixtureFetchText, store: fakeStore(row).store, now: () => new Date(2026, 9, 17) });
        const fetchText = vi.fn(fixtureFetchText);

        const open = await refreshGame(2868840, {
            fetchText,
            store: fakeStore(row).store,
            now: () => new Date(2026, 9, 17),
            openStorePage: loadStorePage(2868840),
        });

        expect(fetchText.mock.calls.map(([url]) => url)).not.toContainEqual(expect.stringContaining('/app/2868840/'));
        expect(open).toEqual(fetched);
    });

    it('writes nothing when a fetch fails', async () => {
        const { store, write } = fakeStore({});
        const failing = () => Promise.reject(new Error('offline'));

        await expect(refreshGame(2868840, { fetchText: failing, store })).rejects.toThrow('offline');
        expect(write).not.toHaveBeenCalled();
    });
});

describe('addGame', () => {
    it('appends a full row with the lowest discount from the SteamDB block', async () => {
        const { store, append } = fakeStore({});

        const row = await addGame(2868840, {
            fetchText: fixtureFetchText,
            store,
            steamDb: { lowestPrice: 349 },
            now: () => new Date(2026, 9, 17),
        });

        expect(append).toHaveBeenCalledWith(2868840, row);
        expect(row).toMatchObject({
            [Column.name]: '=HYPERLINK("https://store.steampowered.com/app/2868840/","Slay the Spire 2")',
            [Column.originalPrice]: 499,
            [Column.lowestOff]: 30,
            [Column.wantLevel]: '?',
            [Column.updatedOn]: '2026/10/17',
        });
    });
});

describe('sheetApiRowStore', () => {
    it('reads values and forwards writes to the web app', async () => {
        const api = {
            readRow: vi.fn(() => Promise.resolve({ row: 9, values: { [Column.special]: '英' } })),
            updateRow: vi.fn(() => Promise.resolve({ row: 9 })),
            appendRow: vi.fn(() => Promise.resolve({ row: 10 })),
        };
        const store = sheetApiRowStore(api as unknown as SheetApi);

        expect(await store.read(570, [Column.special])).toEqual({ [Column.special]: '英' });
        await store.write(570, { [Column.special]: '繁' });
        await store.append(571, { [Column.special]: 'X' });

        expect(api.readRow).toHaveBeenCalledWith(570, [Column.special]);
        expect(api.updateRow).toHaveBeenCalledWith(570, { [Column.special]: '繁' });
        expect(api.appendRow).toHaveBeenCalledWith(571, { [Column.special]: 'X' });
    });
});

describe('fetchPlaytime', () => {
    it('fetches only the review sample and formats it as refreshGame does', async () => {
        const fetchText = vi.fn(fixtureFetchText);

        const playtime = await fetchPlaytime(2868840, fetchText);

        expect(fetchText.mock.calls.every(([url]) => url.includes('/appreviews/'))).toBe(true);
        const { updates } = await refreshGame(2868840, { fetchText: fixtureFetchText, store: fakeStore({}).store });
        expect(playtime).toBe(extractPlaytime(String(updates[Column.detail])));
        expect(playtime).toMatch(/^中位\d+H，3rd\.高\d+H。$/);
    });
});
