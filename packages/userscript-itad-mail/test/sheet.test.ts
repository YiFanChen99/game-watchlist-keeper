import { Column } from '@watchlist/game-record-writer';
import type { SheetApi, SheetDumpRow } from '@watchlist/sheet-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SheetLookup } from '../src/sheet';

const api = {
    fetchDump: vi.fn<SheetApi['fetchDump']>(),
    readRow: vi.fn<SheetApi['readRow']>(),
};

vi.mock('../src/tampermonkey', () => ({
    withSheetApi: <T>(run: (sheetApi: SheetApi) => Promise<T>) => run(api as unknown as SheetApi),
}));

const smileForMe: SheetDumpRow = { B: 'Smile For Me', K: 4, appId: 1006660 };
const noLink: SheetDumpRow = { B: 'Tacoma', K: 2 };

/** Tampermonkey storage, as `GM_getValue` / `GM_setValue` see it. */
let storage: Record<string, unknown>;

beforeEach(() => {
    storage = {};
    vi.stubGlobal('GM_getValue', (key: string, fallback: unknown) => (key in storage ? storage[key] : fallback));
    vi.stubGlobal('GM_setValue', (key: string, value: unknown) => {
        storage[key] = value;
    });
    api.fetchDump.mockResolvedValue({ games: [smileForMe, noLink], labelMap: {} });
    api.readRow.mockResolvedValue({
        row: 7,
        values: { [Column.wantLevel]: 4, [Column.lowestPrice]: '!90', 目標價: 50 },
        url: 'https://docs.google.com/spreadsheets/d/x/edit#gid=1&range=7:7',
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.useRealTimers();
});

describe('SheetLookup.match', () => {
    it('matches names against the dump, fetched once and cached for a day', async () => {
        const lookup = new SheetLookup();
        expect(await lookup.match('Smile For Me™')).toEqual([smileForMe]);
        expect(await lookup.match('Gone Home')).toEqual([]);
        expect(api.fetchDump).toHaveBeenCalledTimes(1);

        // A later page load within a day uses the cached dump.
        expect(await new SheetLookup().match('Tacoma')).toEqual([noLink]);
        expect(api.fetchDump).toHaveBeenCalledTimes(1);
    });

    it('fetches the dump again after a day', async () => {
        storage.sheetDump = { games: [], time: Date.now() - 25 * 60 * 60 * 1000 };
        expect(await new SheetLookup().match('Smile For Me')).toEqual([smileForMe]);
        expect(api.fetchDump).toHaveBeenCalledTimes(1);
    });

    it('tries the dump again after a failed fetch', async () => {
        api.fetchDump.mockRejectedValueOnce(new Error('沒有輸入 Sheet API 的 token'));
        const lookup = new SheetLookup();
        await expect(lookup.match('Smile For Me')).rejects.toThrow('token');
        expect(await lookup.match('Smile For Me')).toEqual([smileForMe]);
    });
});

describe('SheetLookup.info', () => {
    it("reads the row's want level, prices and link by app id, once per page load", async () => {
        const lookup = new SheetLookup();
        const info = await lookup.info(smileForMe);
        expect(info).toEqual({
            want: '4',
            prices: { historicalLow: 90, historicalLowIsOutdated: true, wanted: 50 },
            url: 'https://docs.google.com/spreadsheets/d/x/edit#gid=1&range=7:7',
        });
        expect(api.readRow).toHaveBeenCalledWith(1006660, [Column.wantLevel, Column.lowestPrice, '目標價']);

        await lookup.info(smileForMe);
        expect(api.readRow).toHaveBeenCalledTimes(1);
    });

    it("gives a row without an app id the dump's want level only", async () => {
        expect(await new SheetLookup().info(noLink)).toEqual({ want: '2', prices: null, url: null });
        expect(api.readRow).not.toHaveBeenCalled();
    });

    it('reads the row again after a failed read', async () => {
        api.readRow.mockRejectedValueOnce(new Error('timeout'));
        const lookup = new SheetLookup();
        await expect(lookup.info(smileForMe)).rejects.toThrow('timeout');
        await expect(lookup.info(smileForMe)).resolves.toMatchObject({ want: '4' });
        expect(api.readRow).toHaveBeenCalledTimes(2);
    });
});
