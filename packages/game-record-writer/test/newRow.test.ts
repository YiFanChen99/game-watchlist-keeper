import { describe, expect, it } from 'vitest';

import type { SteamSnapshot } from '@watchlist/steam-info-scraper';

import { buildNameFormula, Column, MissingValueError, planLowestOff, planNewRow } from '../src';

describe('planLowestOff (COLUMNS.md 最低off)', () => {
    it('turns the lowest price into a discount off the original price', () => {
        expect(planLowestOff({ lowestPrice: 149 }, 499)).toBe(70);
        expect(planLowestOff({ lowestPrice: 1190 }, 1490)).toBe(20);
        expect(planLowestOff({ lowestPrice: 888.3 }, 888.3)).toBe(0);
    });

    it('never goes below 0 when the price has gone up since', () => {
        expect(planLowestOff({ lowestPrice: 590 }, 499)).toBe(0);
    });

    it('writes 100 for a free game', () => {
        expect(planLowestOff(null, 0)).toBe(100);
        expect(planLowestOff({ lowestPrice: null }, 0)).toBe(100);
    });

    it('leaves the cell blank without an original price, or when the block shows no price', () => {
        expect(planLowestOff({ lowestPrice: 149 }, null)).toBeNull();
        expect(planLowestOff({ lowestPrice: null }, 499)).toBeNull();
    });

    it('defaults to 0 without a SteamDB block', () => {
        expect(planLowestOff(null, 499)).toBe(0);
    });
});

describe('buildNameFormula', () => {
    it('links the canonical store URL and escapes quotes', () => {
        expect(buildNameFormula(1145360, 'Hades')).toBe('=HYPERLINK("https://store.steampowered.com/app/1145360/","Hades")');
        expect(buildNameFormula(1, 'The "Game"')).toBe('=HYPERLINK("https://store.steampowered.com/app/1/","The ""Game""")');
    });
});

describe('planNewRow', () => {
    const snapshot: SteamSnapshot = {
        page: {
            name: 'Slay the Spire 2',
            originalPrice: 499,
            releaseDate: { text: '2026 年 3 月 5 日', date: { year: 2026, month: 3, day: 5 } },
            isEarlyAccess: true,
            hasDemo: false,
            interfaceLanguages: ['簡體中文'],
            tags: [],
            isDelisted: false,
        },
        reviews: { totalPositive: 61, totalReviews: 100, playtimeMinutes: [1, 2, 3, 125, 725, 800, 900].map(hours => hours * 60) },
    };
    const today = new Date(2026, 9, 17);

    it('fills every cell a refresh would, plus name, lowest discount, an unrated want level and a TODO mode', () => {
        expect(planNewRow({ appId: 2868840, snapshot, lowestOff: 30, today })).toEqual({
            [Column.name]: '=HYPERLINK("https://store.steampowered.com/app/2868840/","Slay the Spire 2")',
            [Column.originalPrice]: 499,
            [Column.lowestOff]: 30,
            [Column.releaseDate]: '2026/3/5',
            [Column.reviewScore]: 61,
            [Column.updatedOn]: '2026/10/17',
            [Column.wantLevel]: '?',
            [Column.mode]: 'TODO',
            [Column.special]: '簡',
            [Column.detail]: 'TODO。26/03EA。中位125H，3rd.高725H。',
        });
    });

    it('writes the price placeholder and no lowest discount without a price', () => {
        const unpriced: SteamSnapshot = { ...snapshot, page: { ...snapshot.page, originalPrice: null } };
        const row = planNewRow({ appId: 42, snapshot: unpriced, lowestOff: planLowestOff({ lowestPrice: 1 }, null), today });

        expect(row[Column.originalPrice]).toBe(10000);
        expect(row).not.toHaveProperty(Column.lowestOff);
    });

    it('refuses a row without a name or release date: both 必有 without a default', () => {
        const unnamed: SteamSnapshot = { ...snapshot, page: { ...snapshot.page, name: null } };
        const undated: SteamSnapshot = { ...snapshot, page: { ...snapshot.page, releaseDate: null } };

        expect(() => planNewRow({ appId: 42, snapshot: unnamed, lowestOff: null, today }))
            .toThrow(new MissingValueError(Column.name));
        expect(() => planNewRow({ appId: 42, snapshot: undated, lowestOff: null, today }))
            .toThrow(new MissingValueError(Column.releaseDate));
    });
});
