/**
 * The percent of sampled reviewers `PlaytimeStats.percentRankHours` plays longer than, written as
 * `PR<n>` in 備註. Changing it needs no other code: refreshes read any `PR<n>` and rewrite it.
 */
export const playtimePercentRank = 84;

export interface PlaytimeStats {
    /** `null` without samples. */
    medianHours: number | null;
    /**
     * The playtime of the first reviewer, from the shortest, who plays longer than
     * `playtimePercentRank` percent of the sample. `null` when nobody does, e.g. with fewer than
     * 7 samples at 84.
     */
    percentRankHours: number | null;
}

/**
 * Median and `playtimePercentRank` playtime, in hours, both rounded.
 *
 * @param minutes One entry per reviewer, e.g. `AppReviewsInfo.playtimeMinutes`.
 */
export function computePlaytimeStats(minutes: readonly number[]): PlaytimeStats {
    const hours = minutes.map(value => value / 60).sort((a, b) => a - b);
    if (!hours.length) {
        return { medianHours: null, percentRankHours: null };
    }

    const half = Math.floor(hours.length / 2);
    const median = hours.length % 2 ? hours[half]! : (hours[half - 1]! + hours[half]!) / 2;
    // Integer math: 35 * 0.8 is 28.000000000000004 in floating point.
    const reviewersBelow = Math.ceil((hours.length * playtimePercentRank) / 100);
    return {
        medianHours: Math.round(median),
        percentRankHours: reviewersBelow < hours.length ? Math.round(hours[reviewersBelow]!) : null,
    };
}
