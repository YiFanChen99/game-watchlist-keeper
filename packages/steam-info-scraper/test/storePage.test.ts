import { describe, expect, it } from 'vitest';

import { matchesFetchedStorePage, parseStorePage, type CalendarDate } from '../src';
import { loadStorePage } from './fixtures';

interface Expected {
    name: string;
    originalPrice: number | null;
    releaseDate: CalendarDate;
    isEarlyAccess: boolean;
    hasDemo: boolean;
    /** Interface languages that must, and must not, be listed. */
    supports: string[];
    lacks: string[];
    firstTags: string[];
    categories: string[];
    genres: string[];
}

const cases: Record<number, Expected> = {
    1145360: {
        name: 'Hades',
        originalPrice: 408,
        releaseDate: { year: 2020, month: 9, day: 17 },
        isEarlyAccess: false,
        hasDemo: false,
        supports: ['簡體中文', '英文'],
        lacks: ['繁體中文'],
        firstTags: ['動作類 Rogue', '輕度 Rogue'],
        categories: ['單人', 'Steam 成就', 'Steam 交換卡片', '有字幕', 'Steam 雲端', '在手機上遠端暢玩', '在平板上遠端暢玩', '在電視上遠端暢玩', '親友同享'],
        genres: ['動作', '獨立製作', '角色扮演'],
    },
    1562430: {
        name: 'DREDGE',
        // The base game's block, not the Digital Deluxe Edition's (799) above it.
        originalPrice: 749,
        releaseDate: { year: 2023, month: 3, day: 30 },
        isEarlyAccess: false,
        hasDemo: false,
        supports: ['繁體中文'],
        lacks: [],
        firstTags: ['探索', '釣魚'],
        categories: ['單人', 'Steam 成就', 'Steam 交換卡片', 'Steam 雲端', '親友同享'],
        genres: ['冒險', '角色扮演'],
    },
    2868840: {
        name: 'Slay the Spire 2',
        originalPrice: 499,
        releaseDate: { year: 2026, month: 3, day: 5 },
        isEarlyAccess: true,
        hasDemo: false,
        supports: ['簡體中文'],
        lacks: ['繁體中文'],
        firstTags: ['類 Rogue', '卡牌遊戲'],
        categories: ['單人', '線上合作', 'Steam 雲端', '統計', 'Steam 排行榜', '親友同享'],
        genres: ['獨立製作', '策略', '搶先體驗'],
    },
    1966720: {
        name: 'Lethal Company',
        originalPrice: 188,
        releaseDate: { year: 2023, month: 10, day: 23 },
        isEarlyAccess: true,
        hasDemo: false,
        supports: ['英文'],
        lacks: ['繁體中文', '簡體中文'],
        firstTags: ['線上合作', '恐怖'],
        categories: ['單人', '線上合作', '親友同享'],
        genres: ['動作', '冒險', '獨立製作', '搶先體驗'],
    },
    3669620: {
        name: 'Warhammer Survivors',
        originalPrice: null,
        releaseDate: { year: 2026, month: 11, day: 10 },
        isEarlyAccess: false,
        hasDemo: true,
        supports: ['簡體中文'],
        lacks: ['繁體中文'],
        firstTags: ['動作', '逆彈幕'],
        categories: ['單人', 'Steam 成就', 'Steam 雲端', '親友同享'],
        genres: ['動作', '休閒', '獨立製作', '角色扮演'],
    },
    570: {
        name: 'Dota 2',
        originalPrice: 0,
        releaseDate: { year: 2013, month: 7, day: 9 },
        isEarlyAccess: false,
        hasDemo: false,
        supports: ['繁體中文'],
        lacks: [],
        firstTags: ['免費遊玩', '多人線上戰術競技'],
        categories: ['合作', 'Steam 交換卡片', 'Steam 工作坊', 'SteamVR 收藏品', '應用程式內購買', 'Steam 時間軸'],
        genres: ['動作', '策略', '免費遊玩'],
    },
    900270: {
        name: 'Reventure',
        originalPrice: 261,
        releaseDate: { year: 2019, month: 6, day: 4 },
        isEarlyAccess: false,
        hasDemo: false,
        supports: ['簡體中文', '英文'],
        lacks: ['繁體中文'],
        firstTags: ['冒險', '獨立'],
        categories: ['單人', 'Steam 成就', 'Steam 交換卡片', 'Steam 雲端', '親友同享'],
        genres: ['冒險', '獨立製作'],
    },
    1061880: {
        name: 'Conan Chop Chop',
        originalPrice: 269,
        releaseDate: { year: 2022, month: 3, day: 1 },
        isEarlyAccess: false,
        // In the side column, not above the purchase area.
        hasDemo: true,
        supports: ['簡體中文', '英文'],
        lacks: ['繁體中文'],
        firstTags: ['輕度 Rogue', '動作類 Rogue'],
        categories: ['單人', '線上合作', '共享 / 分割螢幕合作', 'Steam 成就', 'Steam 交換卡片', 'Steam 雲端', '遠端同樂', '親友同享'],
        genres: ['動作', '冒險', '獨立製作'],
    },
};

describe('parseStorePage', () => {
    it.each(Object.entries(cases))('parses app %s', (appId, expected) => {
        const { supports, lacks, firstTags, releaseDate, ...fields } = expected;
        const info = parseStorePage(loadStorePage(Number(appId)));

        expect(info).toMatchObject(fields);
        expect(info.releaseDate?.date).toEqual(releaseDate);
        expect(info.interfaceLanguages).toEqual(expect.arrayContaining(supports));
        for (const language of lacks) {
            expect(info.interfaceLanguages).not.toContain(language);
        }
        expect(info.tags.slice(0, firstTags.length)).toEqual(firstTags);
        expect(new Set(info.tags).size).toBe(info.tags.length);
    });

    it('returns nulls on a page without those sections', () => {
        const doc = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
        expect(parseStorePage(doc)).toEqual({
            name: null,
            originalPrice: null,
            releaseDate: null,
            isEarlyAccess: false,
            hasDemo: false,
            interfaceLanguages: null,
            tags: [],
            categories: [],
            genres: [],
            isDelisted: false,
        });
    });

    it('marks a page no longer sold on Steam, which shows no price or demo', () => {
        expect(parseStorePage(loadStorePage(1860960))).toMatchObject({
            name: '埃拉的呼喚',
            originalPrice: null,
            hasDemo: false,
            isDelisted: true,
        });
        for (const appId of Object.keys(cases)) {
            expect(parseStorePage(loadStorePage(Number(appId))).isDelisted).toBe(false);
        }
    });

    it('takes the original price of the base game on sale', () => {
        const block = (title: string, price: string) => `
            <div class="game_area_purchase_game"><h2 class="title">${title}</h2>
                <div class="game_purchase_action">${price}</div></div>`;
        const doc = new DOMParser().parseFromString(`
            <div class="apphub_AppName">Game</div>
            ${block('購買 Game - Deluxe Edition', '<div class="game_purchase_price price">NT$ 500</div>')}
            ${block('購買 Game', '<div class="discount_original_price">NT$ 1,190</div><div class="discount_final_price">NT$ 595</div>')}`, 'text/html');
        expect(parseStorePage(doc).originalPrice).toBe(1190);
    });

    it('lists only languages with a check mark in the interface column', () => {
        const doc = new DOMParser().parseFromString(`
            <div id="languageTable"><table>
                <tr><th></th><th>介面</th></tr>
                <tr><td>繁體中文</td><td colspan="3">不支援</td></tr>
                <tr><td>英文</td><td></td><td><span>&#10004;</span></td></tr>
                <tr><td>日文</td><td><span>&#10004;</span></td></tr>
            </table></div>`, 'text/html');
        expect(parseStorePage(doc).interfaceLanguages).toEqual(['日文']);
    });
});

describe('matchesFetchedStorePage', () => {
    it('accepts a 繁中 page priced in TWD, free, or without a price', () => {
        expect(matchesFetchedStorePage(loadStorePage(2868840))).toBe(true);
        expect(matchesFetchedStorePage(loadStorePage(570))).toBe(true);
        // Not released yet: no price, so no currency either.
        expect(matchesFetchedStorePage(loadStorePage(3669620))).toBe(true);
    });

    it('refuses another language or currency', () => {
        const english = loadStorePage(2868840);
        english.documentElement.lang = 'en';
        expect(matchesFetchedStorePage(english)).toBe(false);

        const dollars = loadStorePage(2868840);
        dollars.querySelector('meta[itemprop="priceCurrency"]')!.setAttribute('content', 'USD');
        expect(matchesFetchedStorePage(dollars)).toBe(false);
    });

    it('refuses a price without a stated currency', () => {
        const unstated = loadStorePage(2868840);
        unstated.querySelector('meta[itemprop="priceCurrency"]')!.remove();
        expect(matchesFetchedStorePage(unstated)).toBe(false);
    });
});
