/** The subset of the `GetAppReviews` response that is read. */
export interface AppReviewsResponse {
    response: {
        /** Missing for an unknown app, which still answers 200. */
        query_summary?: {
            total_positive: number;
            total_reviews: number;
        };
        /** Missing when no review matches. */
        reviews?: {
            author: {
                /** Total playtime, in minutes. */
                playtime_forever: number;
            };
        }[];
    };
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

function parseResponse(json: string): Required<AppReviewsResponse['response']> {
    const { response } = JSON.parse(json) as AppReviewsResponse;
    if (!response.query_summary) {
        throw new Error('GetAppReviews returned no query_summary');
    }
    return { query_summary: response.query_summary, reviews: response.reviews ?? [] };
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
