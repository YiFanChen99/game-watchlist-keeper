import type { SheetApi } from '@watchlist/sheet-api';
import { describe, expect, it, vi } from 'vitest';

import { fixtureFetchText, fixtureItadApiKey, loadStorePage } from '../../steam-info-scraper/test/fixtures';
import {
    addGame,
    Column,
    extractPlaytime,
    fetchPlaytime,
    formatLowestOffNotes,
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
        expect(updates[Column.detail]).toMatch(/^手寫的遊戲特點。26\/03EA。中位\d+H，PR\d+ \d+H。$/);
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

    it('writes - for a game no longer sold on Steam, keeping the other cells', async () => {
        const { store, write } = fakeStore({ [Column.originalPrice]: 459, [Column.lowestOff]: 30, [Column.special]: '繁' });

        const { changes } = await refreshGame(1860960, { fetchText: fixtureFetchText, store, now: () => new Date(2026, 9, 18) });

        expect(write.mock.calls[0]![1]).toMatchObject({ [Column.originalPrice]: '-', [Column.lowestOff]: '-', [Column.special]: '繁' });
        expect(changes).toContainEqual({ column: Column.originalPrice, oldValue: 459, newValue: '-', delta: null });
    });

    it('takes 最低off from ITAD, and still refreshes when ITAD fails', async () => {
        const row = { [Column.originalPrice]: 261, [Column.lowestOff]: 90 };
        const refresh = (itadApiKey: string) =>
            refreshGame(900270, { fetchText: fixtureFetchText, store: fakeStore(row).store, itadApiKey, now: () => new Date(2026, 9, 20) });

        const answered = await refresh(fixtureItadApiKey);
        expect(answered.updates[Column.lowestOff]).toBe('!96');
        expect(answered.itadHistory).not.toBeNull();
        expect(answered.itadError).toBeNull();
        expect(answered.lowestOffDoubts).toEqual(['ITAD 的最低價 11 是原價 22 時的價格，之後漲到 261']);

        const refused = await refresh('wrong');
        expect(refused.updates[Column.lowestOff]).toBe('!90');
        expect(refused.itadHistory).toBeNull();
        expect(refused.itadError?.message).toContain('403');
        expect(refused.lowestOffDoubts).toEqual([]);
    });

    it('asks ITAD nothing without an API key', async () => {
        const fetchText = vi.fn(fixtureFetchText);
        const { itadHistory, itadError } = await refreshGame(2868840, { fetchText, store: fakeStore({}).store });

        expect(fetchText.mock.calls.map(([url]) => url)).not.toContainEqual(expect.stringContaining('isthereanydeal'));
        expect({ itadHistory, itadError }).toEqual({ itadHistory: null, itadError: null });
    });

    it('writes nothing when a fetch fails', async () => {
        const { store, write } = fakeStore({});
        const failing = () => Promise.reject(new Error('offline'));

        await expect(refreshGame(2868840, { fetchText: failing, store })).rejects.toThrow('offline');
        expect(write).not.toHaveBeenCalled();
    });
});

describe('addGame', () => {
    it('appends a full row, with the lowest discount from the SteamDB block marked when ITAD is not asked', async () => {
        const { store, append } = fakeStore({});

        const { row } = await addGame(2868840, {
            fetchText: fixtureFetchText,
            store,
            steamDb: { lowestPrice: 349 },
            now: () => new Date(2026, 9, 17),
        });

        expect(append).toHaveBeenCalledWith(2868840, row);
        expect(row).toMatchObject({
            [Column.name]: '=HYPERLINK("https://store.steampowered.com/app/2868840/","Slay the Spire 2")',
            [Column.originalPrice]: 499,
            // SteamDB alone: no original price of its time to check it against.
            [Column.lowestOff]: '!30',
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

        expect(fetchText.mock.calls.every(([url]) => url.includes('/ajaxappreviews/'))).toBe(true);
        const { updates } = await refreshGame(2868840, { fetchText: fixtureFetchText, store: fakeStore({}).store });
        expect(playtime).toBe(extractPlaytime(String(updates[Column.detail])));
        expect(playtime).toMatch(/^中位\d+H，PR\d+ \d+H。$/);
    });
});

describe('formatLowestOffNotes', () => {
    const records = { itadHistory: [{ time: new Date(2026, 0, 1), price: 82, regular: 82 }], itadError: null, lowestOffDoubts: [] };
    const none = { itadHistory: null, itadError: null, lowestOffDoubts: [] };
    const context = { action: 'refresh', hasItadApiKey: true, isItadApiKeyRefused: false, hasSteamDb: false } as const;

    it('says nothing when ITAD answered and 最低off has no !', () => {
        expect(formatLowestOffNotes(records, context)).toEqual([]);
    });

    it('tells why ITAD gave nothing, and what 最低off went by instead', () => {
        expect(formatLowestOffNotes(none, { ...context, hasItadApiKey: false }))
            .toEqual(['沒有 ITAD 的 API key，也沒有 SteamDB 區塊，最低off 沒有更新（原本是數字的話前面加上 !，表示可能過時）。']);
        expect(formatLowestOffNotes(none, { ...context, action: 'add' })).toEqual(['ITAD 沒有這個遊戲，也沒有 SteamDB 區塊，最低off 寫 0。']);
        expect(formatLowestOffNotes({ ...none, itadError: new Error('Failed: 429') }, { ...context, hasSteamDb: true }))
            .toEqual(['ITAD 沒有回應（Failed: 429），最低off 只看 SteamDB 區塊，前面加上 !。']);
        expect(formatLowestOffNotes({ ...none, itadError: new Error('Failed: 403') }, { ...context, isItadApiKeyRefused: true })[0])
            .toMatch(/^ITAD 拒絕了 API key（下次會重新詢問），/);
    });

    it('tells of a game ITAD knows without Steam TW records, as it leaves 最低off as nothing does', () => {
        // IDLE DEVILS: the old 26 became !26 from the Sheet without a word.
        expect(formatLowestOffNotes({ ...none, itadHistory: [] }, context))
            .toEqual(['ITAD 沒有這個遊戲在 Steam TW 的價格紀錄，也沒有 SteamDB 區塊，最低off 沒有更新（原本是數字的話前面加上 !，表示可能過時）。']);
        expect(formatLowestOffNotes({ ...none, itadHistory: [] }, { ...context, hasSteamDb: true }))
            .toEqual(['ITAD 沒有這個遊戲在 Steam TW 的價格紀錄，最低off 只看 SteamDB 區塊，前面加上 !。']);
    });

    it('tells why 最低off has !, on one line', () => {
        const doubts = ['SteamDB 區塊的最低價 35 比 ITAD 近 2.5 年的 41 低', 'ITAD 現在的原價是 78，不是商店頁的 82，可能追蹤別的方案'];
        expect(formatLowestOffNotes({ ...records, lowestOffDoubts: doubts }, context))
            .toEqual(['最低off 加上 !：SteamDB 區塊的最低價 35 比 ITAD 近 2.5 年的 41 低；ITAD 現在的原價是 78，不是商店頁的 82，可能追蹤別的方案。']);
    });
});
