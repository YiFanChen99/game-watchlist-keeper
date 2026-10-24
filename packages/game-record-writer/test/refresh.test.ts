import type { SteamSnapshot, StorePageInfo } from '@watchlist/steam-info-scraper';
import { describe, expect, it } from 'vitest';

import {
    buildDetail,
    Column,
    extractPlaytime,
    formatChange,
    mergeDetail,
    mergeSpecial,
    planRefresh,
    type PlaytimeStats,
    type SheetRowValues,
    unknownPricePlaceholder,
} from '../src';
import { otherPercentRank, percentRank, playtimeSample } from './playtimeSample';

const page: StorePageInfo = {
    name: 'Slay the Spire 2',
    originalPrice: 499,
    releaseDate: { text: '2026 年 3 月 5 日', date: { year: 2026, month: 3, day: 5 } },
    isEarlyAccess: true,
    hasDemo: false,
    interfaceLanguages: ['簡體中文', '英文'],
    tags: [],
    categories: [],
    genres: [],
    isDelisted: false,
};
const releasedPage: StorePageInfo = { ...page, isEarlyAccess: false };
const playtime: PlaytimeStats = { medianHours: 125, percentRankHours: 725 };
const snapshot: SteamSnapshot = {
    page,
    reviews: { totalPositive: 61, totalReviews: 100, playtimeMinutes: playtimeSample },
};
const today = new Date(2026, 9, 17);

describe('buildDetail (COLUMNS.md 備註：新增)', () => {
    it('writes YY/MMEA。 for early access, then the playtime', () => {
        expect(buildDetail(page, playtime)).toBe(`TODO。26/03EA。中位125H，${percentRank} 725H。`);
    });

    it('starts with the tag rules\' feature words, separated by spaces', () => {
        expect(buildDetail(page, playtime, ['俯視角', '砍殺'])).toBe(`俯視角 砍殺。26/03EA。中位125H，${percentRank} 725H。`);
    });

    it('keeps Steam text as the early access date when it is not a full date', () => {
        const vague: StorePageInfo = { ...page, releaseDate: { text: '2026 年第四季', date: null } };
        expect(buildDetail(vague, playtime)).toBe(`TODO。2026 年第四季EA。中位125H，${percentRank} 725H。`);
    });

    it('omits the early access part and marks unknown numbers', () => {
        expect(buildDetail(releasedPage, { medianHours: 3, percentRankHours: null })).toBe(`TODO。中位3H，${percentRank} -H。`);
        expect(buildDetail(releasedPage, { medianHours: null, percentRankHours: null })).toBe(`TODO。中位-H，${percentRank} -H。`);
    });
});

describe('mergeDetail (COLUMNS.md 備註：更新)', () => {
    it('replaces only the playtime part, keeping everything else, from the older 3rd.高 format too', () => {
        expect(mergeDetail('Roguelike 牌組構築。26/03EA。中位40H，3rd.高300H。等正式版', releasedPage, playtime))
            .toBe(`Roguelike 牌組構築。26/03EA。中位125H，${percentRank} 725H。等正式版`);
    });

    it('replaces a playtime part in the PR format, written with any percent rank', () => {
        expect(mergeDetail(`好玩。中位40H，${percentRank} 300H。等正式版`, releasedPage, playtime)).toBe(`好玩。中位125H，${percentRank} 725H。等正式版`);
        expect(mergeDetail(`好玩。中位40H，${otherPercentRank} 300H。等正式版`, releasedPage, playtime)).toBe(`好玩。中位125H，${percentRank} 725H。等正式版`);
    });

    it('replaces NaN values left by the legacy scraper', () => {
        expect(mergeDetail('英。中位NaNH，3rd.高NaNH。', releasedPage, playtime)).toBe(`英。中位125H，${percentRank} 725H。`);
    });

    it('replaces a hand-written playtime part missing an H', () => {
        expect(mergeDetail('好玩。中位13，3rd.高28H。等正式版', releasedPage, playtime)).toBe(`好玩。中位125H，${percentRank} 725H。等正式版`);
        expect(mergeDetail(`好玩。中位13H，${percentRank} 28。`, releasedPage, playtime)).toBe(`好玩。中位125H，${percentRank} 725H。`);
    });

    it('appends playtime when the cell has none', () => {
        expect(mergeDetail('等正式版。', releasedPage, playtime)).toBe(`等正式版。中位125H，${percentRank} 725H。`);
    });

    it('separates an appended playtime with 。 unless the cell ends with a full-width symbol', () => {
        expect(mergeDetail('等正式版', releasedPage, playtime)).toBe(`等正式版。中位125H，${percentRank} 725H。`);
        expect(mergeDetail('Roguelike', releasedPage, playtime)).toBe(`Roguelike。中位125H，${percentRank} 725H。`);
        expect(mergeDetail('好玩!', releasedPage, playtime)).toBe(`好玩!。中位125H，${percentRank} 725H。`);
        expect(mergeDetail('好玩！', releasedPage, playtime)).toBe(`好玩！中位125H，${percentRank} 725H。`);
        expect(mergeDetail('（等正式版）', releasedPage, playtime)).toBe(`（等正式版）中位125H，${percentRank} 725H。`);
        expect(mergeDetail('', releasedPage, playtime)).toBe(`中位125H，${percentRank} 725H。`);
    });

    it('adds YY/MMEA。 before the playtime part of an early access game whose cell has no EA', () => {
        expect(mergeDetail('好玩。中位40H，3rd.高300H。等正式版', page, playtime)).toBe(`好玩。26/03EA。中位125H，${percentRank} 725H。等正式版`);
        expect(mergeDetail('好玩', page, playtime)).toBe(`好玩。26/03EA。中位125H，${percentRank} 725H。`);
        expect(mergeDetail('', page, playtime)).toBe(`26/03EA。中位125H，${percentRank} 725H。`);
    });

    it('keeps an EA already in the cell, wherever and however it is written', () => {
        expect(mergeDetail('好玩。23/11EA。中位40H，3rd.高300H。', page, playtime)).toBe(`好玩。23/11EA。中位125H，${percentRank} 725H。`);
        expect(mergeDetail('好玩。中位40H，3rd.高300H。EA 等正式版', page, playtime)).toBe(`好玩。中位125H，${percentRank} 725H。EA 等正式版`);
    });
});

describe('extractPlaytime', () => {
    it('finds the playtime part among hand-written notes', () => {
        expect(extractPlaytime(`好玩。26/03EA。中位40H，${percentRank} 300H。等正式版`)).toBe(`中位40H，${percentRank} 300H。`);
        expect(extractPlaytime(`好玩。中位40H，${otherPercentRank} 300H。`)).toBe(`中位40H，${otherPercentRank} 300H。`);
        expect(extractPlaytime('好玩。26/03EA。中位40H，3rd.高300H。等正式版')).toBe('中位40H，3rd.高300H。');
        expect(extractPlaytime('英。中位NaNH，3rd.高NaNH。')).toBe('中位NaNH，3rd.高NaNH。');
    });

    it('returns null without one', () => {
        expect(extractPlaytime('等正式版。')).toBeNull();
    });
});

describe('mergeSpecial (COLUMNS.md 特)', () => {
    const withLanguages = (...interfaceLanguages: string[]): StorePageInfo => ({ ...page, interfaceLanguages });

    it('例：舊 英，頁面支援簡中、有 Demo → 簡 Demo', () => {
        expect(mergeSpecial('英', { ...withLanguages('簡體中文'), hasDemo: true })).toBe('簡 Demo');
    });

    it('marks a blank cell 繁 > 簡 > 英, X without any of them', () => {
        expect(mergeSpecial('', withLanguages('英文', '繁體中文'))).toBe('繁');
        expect(mergeSpecial('', withLanguages('英文'))).toBe('英');
        expect(mergeSpecial('', withLanguages('日文'))).toBe('X');
    });

    it('replaces the language only with a higher-priority one, never downgrading', () => {
        expect(mergeSpecial('X', withLanguages('英文'))).toBe('英');
        expect(mergeSpecial('繁', withLanguages('簡體中文'))).toBe('繁');
        expect(mergeSpecial('簡', withLanguages('日文'))).toBe('簡');
    });

    it('treats everything but Demo as the language part, hand-written ones included', () => {
        expect(mergeSpecial('簡(機翻) Demo', withLanguages('日文'))).toBe('簡(機翻)');
        expect(mergeSpecial('簡(機翻)', withLanguages('繁體中文'))).toBe('繁');
        expect(mergeSpecial('無', withLanguages('英文'))).toBe('英');
    });

    it('drops Demo once the page has none', () => {
        expect(mergeSpecial('簡 Demo', withLanguages('簡體中文'))).toBe('簡');
    });

    it('keeps the old language without a language table, and writes ! for a blank cell', () => {
        expect(mergeSpecial('繁', { ...page, interfaceLanguages: null })).toBe('繁');
        expect(mergeSpecial('', { ...page, interfaceLanguages: null })).toBe('!');
        expect(mergeSpecial('!', withLanguages('日文'))).toBe('X');
    });
});

describe('planRefresh', () => {
    it('replaces Steam-owned values and merges the tag and detail cells', () => {
        const oldRow = {
            [Column.originalPrice]: 499,
            [Column.releaseDate]: '2026/3/5',
            [Column.special]: '簡',
            [Column.detail]: `TODO。26/03EA。中位125H，${percentRank} 725H。`,
        };
        expect(planRefresh(snapshot, oldRow, today)).toEqual({
            updates: {
                [Column.originalPrice]: 499,
                [Column.releaseDate]: '2026/3/5',
                [Column.reviewScore]: 61,
                [Column.updatedOn]: '2026/10/17',
                [Column.special]: '簡',
                [Column.detail]: `TODO。26/03EA。中位125H，${percentRank} 725H。`,
            },
            changes: [],
        });
    });

    describe('review score (COLUMNS.md 評價度)', () => {
        const withReviews = (totalReviews: number, releaseDate = page.releaseDate): SteamSnapshot => ({
            page: { ...page, releaseDate },
            reviews: { totalPositive: totalReviews, totalReviews, playtimeMinutes: [] },
        });
        const released = (year: number, month: number, day: number) =>
            ({ text: `${year} 年 ${month} 月 ${day} 日`, date: { year, month, day } });
        const score = (snapshot: SteamSnapshot, oldRow: SheetRowValues = {}) =>
            planRefresh(snapshot, oldRow, today).updates[Column.reviewScore];

        it('prefixes ! below 50 reviews', () => {
            expect(score(withReviews(49))).toBe('!100');
            expect(score(withReviews(50))).toBe(100);
        });

        it('prefixes ! below 100 reviews once the game is a year old', () => {
            expect(score(withReviews(99, released(2025, 10, 17)))).toBe('!100');
            expect(score(withReviews(100, released(2025, 10, 17)))).toBe(100);
            expect(score(withReviews(99, released(2025, 10, 18)))).toBe(100);
            expect(score(withReviews(99, { text: '2025 年第四季', date: null }))).toBe(100);
        });

        it('prefixes ! to an old number when Steam has no reviews, and leaves anything else alone', () => {
            expect(score(withReviews(0), { [Column.reviewScore]: 80 })).toBe('!80');
            expect(score(withReviews(0), { [Column.reviewScore]: '80' })).toBe('!80');
            expect(score(withReviews(0), { [Column.reviewScore]: '!80' })).toBeUndefined();
            expect(score(withReviews(0), { [Column.reviewScore]: '' })).toBeUndefined();
            expect(score(withReviews(0))).toBeUndefined();
        });

        it('replaces an old ! score once enough reviews back it', () => {
            expect(score(withReviews(50), { [Column.reviewScore]: '!80' })).toBe(100);
        });
    });

    it('rounds the price to whole TWD', () => {
        const decimal: SteamSnapshot = { ...snapshot, page: { ...page, originalPrice: 888.3 } };
        expect(planRefresh(decimal, {}, today).updates[Column.originalPrice]).toBe(888);
    });

    it('reports changed special and detail cells', () => {
        const oldRow = { [Column.special]: '英 Demo', [Column.detail]: '好玩。中位40H，3rd.高300H。' };

        expect(planRefresh(snapshot, oldRow, today).changes).toEqual([
            { column: Column.special, oldValue: '英 Demo', newValue: '簡', delta: null },
            { column: Column.detail, oldValue: '中位40H，3rd.高300H。', newValue: `中位125H，${percentRank} 725H。`, delta: null },
        ]);
    });

    it('reports an appended playtime part against nothing', () => {
        const oldRow = { [Column.detail]: '等正式版。' };

        expect(planRefresh(snapshot, oldRow, today).changes).toEqual([
            { column: Column.detail, oldValue: null, newValue: `中位125H，${percentRank} 725H。`, delta: null },
        ]);
    });

    it('does not report a detail cell whose playtime is unchanged', () => {
        const oldRow = { [Column.detail]: `好玩。中位125H，${percentRank} 725H。` };
        expect(planRefresh(snapshot, oldRow, today).changes).toEqual([]);
    });

    it.each(['3rd.高', `${otherPercentRank} `])('reports a %s part as changed even with the same numbers, and rewrites it', (label) => {
        const { updates, changes } = planRefresh(snapshot, { [Column.detail]: `好玩。26/03EA。中位125H，${label}725H。` }, today);

        expect(updates[Column.detail]).toBe(`好玩。26/03EA。中位125H，${percentRank} 725H。`);
        expect(changes).toEqual([
            { column: Column.detail, oldValue: `中位125H，${label}725H。`, newValue: `中位125H，${percentRank} 725H。`, delta: null },
        ]);
    });

    it('fills blank cells without reporting them as changes', () => {
        const { updates, changes } = planRefresh(snapshot, { [Column.detail]: '  ' }, today);

        expect(updates[Column.special]).toBe('簡');
        expect(updates[Column.detail]).toBe(`TODO。26/03EA。中位125H，${percentRank} 725H。`);
        expect(changes).toEqual([]);
    });

    it('reports price and release date changes with their deltas', () => {
        const oldRow = { [Column.originalPrice]: '459', [Column.releaseDate]: '2026/2/2' };

        expect(planRefresh(snapshot, oldRow, today).changes).toEqual([
            { column: Column.originalPrice, oldValue: '459', newValue: 499, delta: 40 },
            { column: Column.releaseDate, oldValue: '2026/2/2', newValue: '2026/3/5', delta: 31 },
        ]);
    });

    it('does not report a release date moved by 30 days or less, either way', () => {
        for (const old of ['2026/2/3', '2026/2/26', '2026/4/4']) {
            expect(planRefresh(snapshot, { [Column.releaseDate]: old }, today).changes).toEqual([]);
        }
        expect(planRefresh(snapshot, { [Column.releaseDate]: '2026/4/5' }, today).changes)
            .toEqual([{ column: Column.releaseDate, oldValue: '2026/4/5', newValue: '2026/3/5', delta: -31 }]);
    });

    it('treats the same date in another format as unchanged', () => {
        const oldRow = { [Column.releaseDate]: '2026 年 3 月 5 日' };
        expect(planRefresh(snapshot, oldRow, today).changes).toEqual([]);
    });

    it('reports a change without delta when the old date is not a full date', () => {
        const oldRow = { [Column.releaseDate]: '2026 年第一季' };
        expect(planRefresh(snapshot, oldRow, today).changes).toEqual([
            { column: Column.releaseDate, oldValue: '2026 年第一季', newValue: '2026/3/5', delta: null },
        ]);
    });

    it('writes - as the price of a game no longer sold, reporting the change', () => {
        const delisted: SteamSnapshot = { ...snapshot, page: { ...page, originalPrice: null, isDelisted: true } };

        const { updates, changes } = planRefresh(delisted, { [Column.originalPrice]: 459, [Column.lowestOff]: 30 }, today, { lowestOff: '-' });

        expect(updates).toMatchObject({ [Column.originalPrice]: '-', [Column.lowestOff]: '-' });
        expect(changes).toContainEqual({ column: Column.originalPrice, oldValue: 459, newValue: '-', delta: null });
        for (const old of ['-', unknownPricePlaceholder, '']) {
            expect(planRefresh(delisted, { [Column.originalPrice]: old }, today).changes.map(change => change.column))
                .not.toContain(Column.originalPrice);
        }
    });

    it('writes the lowest discount planned by planLowestOff, and leaves the cell alone without one', () => {
        const oldRow = { [Column.lowestOff]: 25 };
        expect(planRefresh(snapshot, oldRow, today, { lowestOff: '!30' }).updates[Column.lowestOff]).toBe('!30');
        expect(planRefresh(snapshot, oldRow, today, { lowestOff: null }).updates).not.toHaveProperty(Column.lowestOff);
        expect(planRefresh(snapshot, oldRow, today).updates).not.toHaveProperty(Column.lowestOff);
    });

    it('replaces the unknown price placeholder without reporting a change', () => {
        const { updates, changes } = planRefresh(snapshot, { [Column.originalPrice]: 10000 }, today);

        expect(updates[Column.originalPrice]).toBe(499);
        expect(changes).toEqual([]);
    });

    it('leaves cells alone when Steam has no value', () => {
        const unreleased: SteamSnapshot = {
            page: { ...page, originalPrice: null, releaseDate: null },
            reviews: { totalPositive: 0, totalReviews: 0, playtimeMinutes: [] },
        };
        const oldRow = { [Column.originalPrice]: 459, [Column.releaseDate]: '2026 年第一季' };
        const { updates, changes } = planRefresh(unreleased, oldRow, today);

        expect(Object.keys(updates).sort()).toEqual([Column.updatedOn, Column.special, Column.detail].sort());
        expect(changes).toEqual([]);
    });
});

describe('formatChange', () => {
    it('signs the delta, with days for the release date', () => {
        expect(formatChange({ column: Column.originalPrice, oldValue: 459, newValue: 499, delta: 40 })).toBe('原價 459 → 499（+40）');
        expect(formatChange({ column: Column.releaseDate, oldValue: '2026/3/5', newValue: '2026/2/26', delta: -7 }))
            .toBe('上市 2026/3/5 → 2026/2/26（-7 天）');
    });

    it('omits a missing delta and marks a missing old value', () => {
        expect(formatChange({ column: Column.special, oldValue: '英', newValue: '簡 Demo', delta: null })).toBe('特 英 → 簡 Demo');
        expect(formatChange({ column: Column.detail, oldValue: null, newValue: `中位3H，${percentRank} -H。`, delta: null }))
            .toBe(`備註 （無） → 中位3H，${percentRank} -H。`);
    });
});
