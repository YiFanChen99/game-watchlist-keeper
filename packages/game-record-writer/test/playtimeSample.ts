import { playtimePercentRank } from '../src';

/** The label 備註 writes before the `playtimePercentRank` playtime, e.g. `PR84`. */
export const percentRank = `PR${playtimePercentRank}`;

/** A label from another `playtimePercentRank`, as cells keep it after the standard changes. */
export const otherPercentRank = `PR${playtimePercentRank < 99 ? playtimePercentRank + 1 : playtimePercentRank - 1}`;

/**
 * 20 reviewers' playtime, in minutes: median 125H, and 725H at any `playtimePercentRank` from 56
 * to 95, so tests expecting `中位125H，PR<n> 725H。` hold when it changes.
 */
export const playtimeSample = [1, 2, 3, 4, 5, 6, 7, 8, 9, 125, 125, 300, 725, 725, 725, 725, 725, 725, 725, 725]
    .map(hours => hours * 60);
