import { storePageUrl } from '@watchlist/core';

/** Store page URL pinned to traditional Chinese and the TW store, which the parsers expect. */
export function storePageFetchUrl(appId: number): string {
    return `${storePageUrl(appId)}?l=tchinese&cc=tw`;
}

/** Reviews per playtime sample request. */
export const reviewSampleSize = 40;

/**
 * Share of `reviewSampleSize` a playtime sample needs to be kept; a smaller one moves on to the
 * next of `reviewSampleQueries`.
 */
export const reviewSampleMinimumRatio = 0.8;

/**
 * Which reviews one playtime sample request takes: the most helpful within `dayRange` days, or
 * the most recently written of all time.
 */
export type ReviewSampleQuery = { filter: 'all'; dayRange: number } | { filter: 'recent' };

/**
 * Queries the playtime sample tries in turn: the store page's own 30 days, then the widest
 * `dayRange` the API takes, then the most recent reviews, which reach past a year for a game
 * with only a few reviews in it. Steam already widens `dayRange` to all time when it holds no
 * review at all; with a few, it returns just those.
 */
export const reviewSampleQueries: readonly ReviewSampleQuery[] = [
    { filter: 'all', dayRange: 30 },
    { filter: 'all', dayRange: 365 },
    { filter: 'recent' },
];

/** Reviews API that replaced the store's deprecated `/appreviews/<appid>`; no key needed. */
const getAppReviewsUrl = 'https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/';

/**
 * Whose reviews the store page's 「所有評論」 counts: Steam purchasers (not key activations),
 * or everyone for a free game, which has no purchasers to speak of.
 */
export type ReviewPurchaseType = 'steam' | 'all';

/** `GetAppReviews` takes its enums as numbers. */
const reviewFilterValues = { all: 0, recent: 1 } as const;
const allReviewTypes = 0;
const purchaseTypeValues: Record<ReviewPurchaseType, number> = { steam: 0, all: 1 };

/**
 * The playtime and Steam Deck filters, left at "any" and spelled out so a Steam default change
 * cannot narrow the reviews. The date range and hardware filters only apply when given.
 */
const unfilteredReviewInput = {
    playtime_min_hours: 0,
    playtime_max_hours: 0,
    primarily_steam_deck: false,
};

function reviewsUrl(input: Record<string, unknown>): string {
    return `${getAppReviewsUrl}?input_json=${encodeURIComponent(JSON.stringify(input))}`;
}

/**
 * The store page's own review query (review quality on, off-topic activity kept), except for
 * every language instead of the visitor's and `sampleQuery` for which reviews. Every parameter
 * is spelled out so a Steam default change cannot move the sample.
 */
export function appReviewsUrl(appId: number, sampleQuery = reviewSampleQueries[0]!): string {
    return reviewsUrl({
        appid: appId,
        filter: reviewFilterValues[sampleQuery.filter],
        ...(sampleQuery.filter === 'all' ? { day_range: sampleQuery.dayRange } : {}),
        ...unfilteredReviewInput,
        languages: ['all'],
        review_type: allReviewTypes,
        purchase_type: purchaseTypeValues.all,
        filter_offtopic_activity: false,
        use_review_quality: true,
        num_per_page: reviewSampleSize,
    });
}

/**
 * The counts behind the store page's 「所有評論」: every language and all time, off-topic review
 * activity left out. Only `query_summary` is read; one review comes along, since `num_per_page: 0`
 * means the default 20.
 */
export function reviewSummaryUrl(appId: number, purchaseType: ReviewPurchaseType): string {
    return reviewsUrl({
        appid: appId,
        filter: reviewFilterValues.all,
        ...unfilteredReviewInput,
        languages: ['all'],
        review_type: allReviewTypes,
        purchase_type: purchaseTypeValues[purchaseType],
        filter_offtopic_activity: true,
        num_per_page: 1,
    });
}
