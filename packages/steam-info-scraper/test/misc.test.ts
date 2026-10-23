import { describe, expect, it, vi } from 'vitest';

import {
    appReviewsUrl,
    fetchSteamSnapshot,
    parseReleaseDate,
    parseSteamDbPrices,
    readSteamDbPrices,
    reviewSampleSize,
    reviewSummaryUrl,
    storePageFetchUrl,
} from '../src';
import { loadAppReviewsJson, loadReviewSummaryJson, loadStorePage, loadStorePageHtml, reviewsApiUrl, reviewsInput } from './fixtures';

describe('parseReleaseDate', () => {
    it.each([
        ['2020 年 9 月 17 日', { year: 2020, month: 9, day: 17 }],
        ['2026年3月5日', { year: 2026, month: 3, day: 5 }],
        ['2020-09-17', { year: 2020, month: 9, day: 17 }],
        ['2020/9/7', { year: 2020, month: 9, day: 7 }],
        ['17 Sep, 2020', { year: 2020, month: 9, day: 17 }],
        ['Sep 17, 2020', { year: 2020, month: 9, day: 17 }],
    ])('reads %s', (text, date) => {
        expect(parseReleaseDate(text)).toEqual({ text, date });
    });

    it.each(['2026 年第四季', '即將推出', ' 待定 '])('keeps partial date %s as text only', (text) => {
        expect(parseReleaseDate(text)).toEqual({ text: text.trim(), date: null });
    });
});

describe('SteamDB block', () => {
    it('reads the first price, with thousands separators and decimals', () => {
        expect(parseSteamDbPrices('Lowest recorded price: NT$ 149 on 2025-11-26')).toEqual({ lowestPrice: 149 });
        expect(parseSteamDbPrices('歷史最低價 NT$ 1,190').lowestPrice).toBe(1190);
        expect(parseSteamDbPrices('NT$ 888.30').lowestPrice).toBe(888.3);
        expect(parseSteamDbPrices('No price history').lowestPrice).toBeNull();
    });

    it('tells a missing block from one without a price', () => {
        const page = (body: string) => new DOMParser().parseFromString(`<body>${body}</body>`, 'text/html');

        expect(readSteamDbPrices(page(''))).toBeNull();
        expect(readSteamDbPrices(page('<div class="steamdb_prices_top">NT$ 99</div>'))).toEqual({ lowestPrice: 99 });
        expect(readSteamDbPrices(page('<div class="steamdb_prices_top">loading</div>'))).toEqual({ lowestPrice: null });
    });
});

describe('fetchSteamSnapshot', () => {
    /**
     * Serves `appId`'s fixtures; each sample request gets `sample(query)` reviewers, `query` being
     * its day range (`'30'`, `'365'`) or `'recent'`.
     */
    function fakeFetch(appId: number, sample?: (query: string) => number) {
        return vi.fn((url: string) => {
            if (!url.startsWith(reviewsApiUrl)) return Promise.resolve(loadStorePageHtml(appId));
            const input = reviewsInput(url);
            if (input.num_per_page !== reviewSampleSize) return Promise.resolve(loadReviewSummaryJson(appId));
            if (!sample) return Promise.resolve(loadAppReviewsJson(appId));
            const query = input.filter === 1 ? 'recent' : String(input.day_range);
            const reviews = Array.from({ length: sample(query) }, () => ({ author: { playtime_forever: 60 } }));
            return Promise.resolve(JSON.stringify({ response: { query_summary: { total_positive: 0, total_reviews: 0 }, reviews } }));
        });
    }
    const urls = (fetchText: ReturnType<typeof fakeFetch>) => fetchText.mock.calls.map(([url]) => url).sort();

    it("fetches the tchinese TW store page, the Steam purchasers' counts and a 30-day sample", async () => {
        const fetchText = fakeFetch(2868840);

        const snapshot = await fetchSteamSnapshot(2868840, fetchText);

        expect(urls(fetchText)).toEqual(
            [appReviewsUrl(2868840), reviewSummaryUrl(2868840, 'steam'), storePageFetchUrl(2868840)].sort(),
        );
        expect(storePageFetchUrl(570)).toBe('https://store.steampowered.com/app/570/?l=tchinese&cc=tw');
        expect(reviewsInput(appReviewsUrl(570))).toMatchObject({ filter: 0, day_range: 30 });
        expect(snapshot.page).toMatchObject({ name: 'Slay the Spire 2', originalPrice: 499, isEarlyAccess: true });
        expect(snapshot.reviews).toMatchObject({ totalPositive: 114861, totalReviews: 186485 });
        expect(snapshot.reviews.playtimeMinutes).toHaveLength(50);
    });

    it('parses the open store page instead of fetching it when it reads the same', async () => {
        const fetchText = fakeFetch(2868840);

        const snapshot = await fetchSteamSnapshot(2868840, fetchText, undefined, loadStorePage(2868840));

        expect(urls(fetchText)).not.toContain(storePageFetchUrl(2868840));
        expect(snapshot.page).toMatchObject({ name: 'Slay the Spire 2', originalPrice: 499 });
    });

    it('still fetches the store page when the open one is in another language', async () => {
        const fetchText = fakeFetch(2868840);
        const openPage = loadStorePage(2868840);
        openPage.documentElement.lang = 'en';

        await fetchSteamSnapshot(2868840, fetchText, undefined, openPage);

        expect(urls(fetchText)).toContain(storePageFetchUrl(2868840));
    });

    it('counts every purchase type for a free game', async () => {
        const fetchText = fakeFetch(570);

        const snapshot = await fetchSteamSnapshot(570, fetchText);

        expect(urls(fetchText)).toContain(reviewSummaryUrl(570, 'all'));
        expect(snapshot.reviews).toMatchObject({ totalPositive: 2251569, totalReviews: 2799392 });
    });

    const sampleSizes = (sizes: Record<string, number>) => (query: string) => sizes[query]!;
    const last30Days = { filter: 'all', dayRange: 30 } as const;
    const lastYear = { filter: 'all', dayRange: 365 } as const;
    const recent = { filter: 'recent' } as const;

    it('stops at 30 days when they hold 80% of the sample', async () => {
        const fetchText = fakeFetch(1145360, () => 32);

        const snapshot = await fetchSteamSnapshot(1145360, fetchText);

        expect(urls(fetchText)).not.toContain(appReviewsUrl(1145360, lastYear));
        expect(snapshot.reviews.playtimeMinutes).toHaveLength(32);
    });

    it('samples 365 days when 30 days hold less than 80% of the sample', async () => {
        const fetchText = fakeFetch(1145360, query => (query === '30' ? 31 : 40));

        const snapshot = await fetchSteamSnapshot(1145360, fetchText);

        expect(urls(fetchText)).toEqual(expect.arrayContaining([appReviewsUrl(1145360, last30Days), appReviewsUrl(1145360, lastYear)]));
        expect(urls(fetchText)).not.toContain(appReviewsUrl(1145360, recent));
        expect(snapshot.reviews.playtimeMinutes).toHaveLength(40);
    });

    it('samples the most recent reviews when 365 days hold less than 80% of the sample', async () => {
        const fetchText = fakeFetch(1145360, sampleSizes({ 30: 1, 365: 7, recent: 40 }));

        const snapshot = await fetchSteamSnapshot(1145360, fetchText);

        expect(urls(fetchText)).toContain(appReviewsUrl(1145360, recent));
        expect(reviewsInput(appReviewsUrl(1145360, recent))).not.toHaveProperty('day_range');
        expect(snapshot.reviews.playtimeMinutes).toHaveLength(40);
    });

    it('keeps the largest sample when none holds 80% of it', async () => {
        const snapshot = await fetchSteamSnapshot(1145360, fakeFetch(1145360, sampleSizes({ 30: 3, 365: 12, recent: 10 })));

        expect(snapshot.reviews.playtimeMinutes).toHaveLength(12);
    });
});
