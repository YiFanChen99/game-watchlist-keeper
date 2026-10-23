/** The subset of the `/ajaxappreviews/<appid>?json=1` response that is read. */
export interface AppReviewsResponse {
    success: number;
    query_summary: {
        total_positive: number;
        total_reviews: number;
    };
    reviews: {
        author: {
            /** Total playtime, in minutes. */
            playtime_forever: number;
        };
    }[];
}

/** The review counts the store page shows as 「所有評論」. */
export interface ReviewSummary {
    totalPositive: number;
    totalReviews: number;
}

export interface AppReviewsInfo extends ReviewSummary {
    /** Each sampled reviewer's total playtime, in minutes. */
    playtimeMinutes: number[];
}

function parseResponse(json: string): AppReviewsResponse {
    const data = JSON.parse(json) as AppReviewsResponse;
    if (data.success !== 1) {
        throw new Error(`appreviews failed: success=${data.success}`);
    }
    return data;
}

/**
 * @param json Body of `reviewSummaryUrl(appId, ...)`.
 */
export function parseReviewSummary(json: string): ReviewSummary {
    const { query_summary: summary } = parseResponse(json);
    return { totalPositive: summary.total_positive, totalReviews: summary.total_reviews };
}

/**
 * @param json Body of `appReviewsUrl(appId, ...)`.
 * @returns Each fetched reviewer's total playtime, in minutes.
 */
export function parseReviewSample(json: string): number[] {
    return parseResponse(json).reviews.map(review => review.author.playtime_forever);
}
