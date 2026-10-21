import { describe, expect, it } from 'vitest';

import type { SteamSnapshot } from '@watchlist/steam-info-scraper';

import { buildNameFormula, Column, MissingValueError, planNewRow } from '../src';
import { percentRank, playtimeSample } from './playtimeSample';

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
            categories: [],
            genres: [],
            isDelisted: false,
        },
        reviews: { totalPositive: 61, totalReviews: 100, playtimeMinutes: playtimeSample },
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
            [Column.detail]: `TODO。26/03EA。中位125H，${percentRank} 725H。`,
        });
    });

    it('writes the price placeholder and no lowest discount without a price', () => {
        const unpriced: SteamSnapshot = { ...snapshot, page: { ...snapshot.page, originalPrice: null } };
        const row = planNewRow({ appId: 42, snapshot: unpriced, lowestOff: null, today });

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
