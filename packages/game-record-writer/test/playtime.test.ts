import { describe, expect, it } from 'vitest';

import { computePlaytimeStats, playtimePercentRank } from '../src';

const hours = (...values: number[]) => values.map(value => value * 60);
/** `count` reviewers playing 1, 2, …, `count` hours, so each one's hours minus 1 is how many play less. */
const oneToN = (count: number) => hours(...Array.from({ length: count }, (_, index) => index + 1));

describe('computePlaytimeStats', () => {
    it('takes the middle value of an odd count, regardless of input order', () => {
        expect(computePlaytimeStats(hours(50, 1, 9, 3, 20)).medianHours).toBe(9);
    });

    it('averages the two middle values of an even count', () => {
        // (4 + 7) / 2 = 5.5
        expect(computePlaytimeStats(hours(1, 2, 4, 7, 30, 100)).medianHours).toBe(6);
    });

    it('takes the first reviewer playing longer than playtimePercentRank percent of the sample, at any count', () => {
        for (let count = 1; count <= 100; count++) {
            const result = computePlaytimeStats(oneToN(count)).percentRankHours;
            // In whole numbers: `below / count >= percent / 100` without floating point error.
            const isEnough = (below: number) => below * 100 >= count * playtimePercentRank;
            if (result === null) {
                expect(isEnough(count - 1), `${count} samples`).toBe(false);
            } else {
                expect(isEnough(result - 1), `${count} samples`).toBe(true);
                expect(isEnough(result - 2), `${count} samples`).toBe(false);
            }
        }
    });

    it('rounds to whole hours', () => {
        const stats = computePlaytimeStats([89, 90, 91, ...Array.from({ length: 17 }, () => 1000)]);
        expect(stats).toEqual({ medianHours: 17, percentRankHours: 17 });
    });

    it('returns nulls without samples', () => {
        expect(computePlaytimeStats([])).toEqual({ medianHours: null, percentRankHours: null });
    });
});

