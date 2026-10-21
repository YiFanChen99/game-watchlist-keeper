import { parseItadHistory, type ItadPriceRecord, type StorePageInfo } from '@watchlist/steam-info-scraper';
import { describe, expect, it } from 'vitest';

import { loadItadHistoryJson } from '../../steam-info-scraper/test/fixtures';
import { Column, noLowestOffSources, planLowestOff, type CellValue, type LowestOffSources, type SheetRowValues } from '../src';

const today = new Date(2026, 9, 20);

/** A game out since before ITAD's TW records began on 2024-12-11. */
const page: StorePageInfo = {
    name: 'Game',
    originalPrice: 408,
    releaseDate: { text: '2018 年 9 月 17 日', date: { year: 2018, month: 9, day: 17 } },
    isEarlyAccess: false,
    hasDemo: false,
    interfaceLanguages: [],
    tags: [],
    categories: [],
    genres: [],
    isDelisted: false,
};

const record = (time: string, price: number, regular: number): ItadPriceRecord => ({ time: new Date(time), price, regular });

/** Hades: 408, once 102 (75% off); ITAD's records since 2024-12-11. */
const hades = parseItadHistory(loadItadHistoryJson(1145360));
/** Reventure: 152 → 22 → 102 → 261; the lowest, 11, was 50% off 22. */
const reventure = parseItadHistory(loadItadHistoryJson(900270));

const itad = (itadHistory: readonly ItadPriceRecord[], steamDbPrice?: number): LowestOffSources =>
    ({ itadHistory, steamDb: steamDbPrice === undefined ? null : { lowestPrice: steamDbPrice } });
const steamDbOnly = (lowestPrice: number): LowestOffSources => ({ itadHistory: null, steamDb: { lowestPrice } });
const old = (originalPrice: CellValue, lowestOff: CellValue): SheetRowValues =>
    ({ [Column.originalPrice]: originalPrice, [Column.lowestOff]: lowestOff });

/** The doubts and cell planned for `page` at `originalPrice`; `oldRow` null for a new row. */
function planWithDoubts(sources: LowestOffSources, oldRow: SheetRowValues | null, originalPrice = 408, overrides: Partial<StorePageInfo> = {}) {
    return planLowestOff({ ...page, originalPrice, ...overrides }, sources, oldRow, today);
}

/** The cell planned for `page` at `originalPrice`; `oldRow` null for a new row. */
function plan(sources: LowestOffSources, oldRow: SheetRowValues | null, originalPrice = 408, overrides: Partial<StorePageInfo> = {}) {
    return planWithDoubts(sources, oldRow, originalPrice, overrides).cell;
}

describe('planLowestOff (COLUMNS.md 最低off)', () => {
    describe('a new row', () => {
        it('takes ITAD\'s lowest price, off the current 原價 (#1)', () => {
            expect(plan(itad(hades, 102), null)).toBe(75);
        });

        it('marks a lowest price from before the price rose (#3)', () => {
            expect(plan(itad(reventure), null, 261)).toBe('!96');
        });

        it('trusts a lowest price from before the price dropped (#4)', () => {
            const history = [record('2026-01-01', 300, 300), record('2025-06-01', 500, 500), record('2025-05-01', 250, 500), record('2024-12-11', 500, 500)];
            expect(plan(itad(history), null, 300)).toBe(17);
        });

        it('marks it when the SteamDB block shows a lower one, still going by ITAD (#5)', () => {
            const history = [record('2026-01-01', 400, 400), record('2025-05-01', 100, 400), record('2024-12-11', 400, 400)];
            expect(plan(itad(history, 50), null, 400)).toBe('!75');
            expect(plan(itad(history, 100), null, 400)).toBe(75);
        });

        it('marks it when ITAD\'s current 原價 is not the store page\'s, as it may follow another package (#6)', () => {
            const dredge = [record('2026-10-08', 749, 749), record('2026-10-01', 299, 749), record('2024-12-11', 749, 749)];
            expect(plan(itad(dredge), null, 799)).toBe('!63');
            const otherNow = [record('2026-06-01', 900, 900), record('2025-10-01', 299, 799), record('2024-12-11', 799, 799)];
            expect(plan(itad(otherNow), null, 799)).toBe('!63');
        });

        it('goes by the SteamDB block, marked, without ITAD (#7)', () => {
            expect(plan(steamDbOnly(102), null)).toBe('!75');
        });

        it('defaults to 0 without either (#8)', () => {
            expect(plan(noLowestOffSources, null)).toBe(0);
            expect(plan(itad([]), null)).toBe(0);
        });

        it('writes 100 for a free game, blank without a price, and - when no longer sold (#14)', () => {
            expect(plan(itad(hades), null, 0)).toBe(100);
            expect(planLowestOff({ ...page, originalPrice: null }, itad(hades), null, today).cell).toBeNull();
            expect(planLowestOff({ ...page, originalPrice: null, isDelisted: true }, itad(hades), null, today).cell).toBe('-');
        });
    });

    describe('the lowest price ITAD gives', () => {
        it('leaves out prices from before the last 30 months', () => {
            const history = [record('2026-01-01', 400, 400), record('2024-02-01', 400, 400), record('2024-01-01', 100, 400), record('2023-06-01', 400, 400)];
            expect(plan(itad(history), null, 400)).toBe(0);
        });

        it('counts the price in effect when the 30 months began', () => {
            const history = [record('2026-01-01', 400, 400), record('2024-01-01', 100, 400)];
            expect(plan(itad(history), null, 400)).toBe(75);
        });

        it('takes the newest of equal lowest prices, with the 原價 of its time', () => {
            const history = [record('2026-06-01', 100, 400), record('2026-05-01', 400, 400), record('2025-01-01', 100, 200), record('2024-12-11', 200, 200)];
            expect(plan(itad(history), null, 400)).toBe(75);
        });
    });

    describe('a refresh', () => {
        it('writes the new one when the old one is the same or higher (#2, #11, #12)', () => {
            expect(plan(itad(hades), old(408, 75))).toBe(75);
            expect(plan(itad(hades), old(408, 70))).toBe(75);
            expect(plan(itad(hades), old(408, '!75'))).toBe(75);
        });

        it('keeps a lower old one, marked, while ITAD does not cover 5 years (#10, #13)', () => {
            expect(plan(itad(hades), old(408, 80))).toBe('!80');
            expect(plan(itad(hades), old(408, '!80'))).toBe('!80');
            expect(plan(itad(reventure), old(261, 98), 261)).toBe('!98');
        });

        it('drops a lower old one that no price of 5 years reached, once ITAD covers them (#10\')', () => {
            const sinceRelease = [record('2026-08-01', 102, 408), record('2026-03-05', 408, 408)];
            const released = { releaseDate: { text: '2026 年 3 月 5 日', date: { year: 2026, month: 3, day: 5 } } };
            expect(plan(itad(sinceRelease), old(408, 80), 408, released)).toBe(75);

            const sixYears = [record('2026-08-01', 102, 408), record('2020-01-01', 408, 408)];
            expect(plan(itad(sixYears), old(408, 80))).toBe(75);
            const reached = [record('2026-08-01', 102, 408), record('2023-01-02', 408, 408), record('2023-01-01', 81, 408), record('2020-01-01', 408, 408)];
            expect(plan(itad(reached), old(408, 80))).toBe('!80');
        });

        it('does not count a game released long before its first record as covered', () => {
            const sinceRelease = [record('2026-08-01', 102, 408), record('2026-03-05', 408, 408)];
            expect(plan(itad(sinceRelease), old(408, 80))).toBe('!80');
        });

        it('takes an old one as lower only beyond rounding, as a whole percent of the old 原價 stands for a range', () => {
            // DREDGE: 63 was 299 off the 799 of the Deluxe Edition, which rounds back to 295.6.
            const dredge = [record('2026-10-08', 749, 749), record('2026-10-01', 299, 749), record('2024-12-11', 749, 749)];
            expect(plan(itad(dredge), old(799, 63), 749)).toBe(60);
            expect(plan(itad(dredge), old(799, '!63'), 749)).toBe(60);
            // 64 off 799 stands for 283.6–291.6: lower than 299 whichever it was.
            expect(plan(itad(dredge), old(799, 64), 749)).toBe('!62');
        });

        it('compares prices, taking the old one against the old 原價 (#15)', () => {
            const history = [record('2026-01-01', 300, 300), record('2025-05-01', 100, 400), record('2024-12-11', 400, 400)];
            expect(plan(itad(history), old(400, 75), 300)).toBe(67);
        });

        it('has no old one to compare without an old price and number (#16)', () => {
            expect(plan(itad(hades), old(10000, 0))).toBe(75);
            expect(plan(itad(hades), old('-', '-'))).toBe(75);
            expect(plan(itad(hades), old('', 90))).toBe(75);
            expect(plan(itad(hades), old(408, ''))).toBe(75);
        });

        it('marks an old number outdated without a new one, leaving anything else alone (#9)', () => {
            expect(plan(noLowestOffSources, old(408, 75))).toBe('!75');
            expect(plan(noLowestOffSources, old(408, '0'))).toBe('!0');
            expect(plan(noLowestOffSources, old(408, '!75'))).toBeNull();
            expect(plan(noLowestOffSources, old(408, ''))).toBeNull();
            expect(plan(noLowestOffSources, {})).toBeNull();
        });

        it('marks the old number outdated without a price, and writes - when no longer sold (#14)', () => {
            expect(planLowestOff({ ...page, originalPrice: null }, itad(hades), old(408, 75), today).cell).toBe('!75');
            expect(planLowestOff({ ...page, originalPrice: null, isDelisted: true }, itad(hades), old(408, 75), today).cell).toBe('-');
        });
    });

    describe('why it has !', () => {
        it('tells each doubt about ITAD\'s lowest price', () => {
            expect(planWithDoubts(itad(reventure), null, 261).doubts).toEqual(['ITAD 的最低價 11 是原價 22 時的價格，之後漲到 261']);
            const history = [record('2026-01-01', 400, 400), record('2025-05-01', 100, 400), record('2024-12-11', 400, 400)];
            expect(planWithDoubts(itad(history, 50), null, 400).doubts).toEqual(['SteamDB 區塊的最低價 50 比 ITAD 近 2.5 年的 100 低']);
            const dredge = [record('2026-10-08', 749, 749), record('2026-10-01', 299, 749), record('2024-12-11', 749, 749)];
            expect(planWithDoubts(itad(dredge), null, 799).doubts).toEqual([
                'ITAD 的最低價 299 是原價 749 時的價格，之後漲到 799',
                'ITAD 現在的原價是 749，不是商店頁的 799，可能追蹤別的方案',
            ]);
        });

        it('tells why a lower old one is kept', () => {
            expect(planWithDoubts(itad(hades), old(408, 80)).doubts)
                .toEqual(['保留舊值 80（原價 408 時約 82），比新的最低價 102 低，ITAD 的紀錄不到 5 年，無法排除它']);
            const reached = [record('2026-08-01', 102, 408), record('2023-01-02', 408, 408), record('2023-01-01', 81, 408), record('2020-01-01', 408, 408)];
            expect(planWithDoubts(itad(reached), old(408, 80)).doubts)
                .toEqual(['保留舊值 80（原價 408 時約 82），比新的最低價 102 低，ITAD 5 年內有到 81']);
            expect(planWithDoubts(steamDbOnly(102), old(408, 80)).doubts)
                .toEqual(['保留舊值 80（原價 408 時約 82），比新的最低價 102 低，沒有 ITAD 的紀錄可以排除它']);
            expect(planWithDoubts(itad([], 102), old(408, 80)).doubts)
                .toEqual(['保留舊值 80（原價 408 時約 82），比新的最低價 102 低，沒有 ITAD 的紀錄可以排除它']);
        });

        it('tells nothing without !, or when ITAD gave nothing, which formatLowestOffNotes tells of', () => {
            expect(planWithDoubts(itad(hades, 102), null).doubts).toEqual([]);
            expect(planWithDoubts(steamDbOnly(102), null).doubts).toEqual([]);
            expect(planWithDoubts(noLowestOffSources, old(408, 75)).doubts).toEqual([]);
        });
    });
});
