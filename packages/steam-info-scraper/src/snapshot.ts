import type { FetchText } from '@watchlist/core';

import { parseReviewSample, parseReviewSummary, type AppReviewsInfo } from './appReviews';
import { matchesFetchedStorePage, parseStorePage, type StorePageInfo } from './storePage';
import { appReviewsUrl, reviewSampleDayRanges, reviewSampleSize, reviewSummaryUrl, storePageFetchUrl } from './urls';

/** Everything fetched from Steam for one app. */
export interface SteamSnapshot {
    page: StorePageInfo;
    reviews: AppReviewsInfo;
}

export type ParseHtml = (html: string) => Document;

const parseWithDomParser: ParseHtml = html => new DOMParser().parseFromString(html, 'text/html');

/**
 * Each sampled reviewer's total playtime, in minutes: the first day range holding a full sample,
 * else the largest one found.
 */
export async function fetchPlaytimeSample(appId: number, fetchText: FetchText): Promise<number[]> {
    let sample: number[] = [];
    for (const dayRange of reviewSampleDayRanges) {
        const minutes = parseReviewSample(await fetchText(appReviewsUrl(appId, dayRange)));
        if (minutes.length > sample.length) {
            sample = minutes;
        }
        if (sample.length >= reviewSampleSize) {
            break;
        }
    }
    return sample;
}

/**
 * Fetch the store page, the review counts and a playtime sample of one app.
 * The sample is fetched alongside the page; the counts wait for the page, which tells
 * whether the game is free (see `ReviewPurchaseType`).
 *
 * @param parseHtml Defaults to the browser's `DOMParser`.
 * @param openPage `appId`'s store page the user has open: parsed instead of fetching the page
 *   when it `matchesFetchedStorePage`.
 */
export async function fetchSteamSnapshot(
    appId: number,
    fetchText: FetchText,
    parseHtml: ParseHtml = parseWithDomParser,
    openPage?: Document,
): Promise<SteamSnapshot> {
    const pagePromise = openPage && matchesFetchedStorePage(openPage)
        ? Promise.resolve(parseStorePage(openPage))
        : fetchText(storePageFetchUrl(appId)).then(html => parseStorePage(parseHtml(html)));
    const summaryPromise = pagePromise.then(async page =>
        parseReviewSummary(await fetchText(reviewSummaryUrl(appId, page.originalPrice === 0 ? 'all' : 'steam'))));
    const [page, summary, playtimeMinutes] = await Promise.all([
        pagePromise,
        summaryPromise,
        fetchPlaytimeSample(appId, fetchText),
    ]);
    return { page, reviews: { ...summary, playtimeMinutes } };
}
