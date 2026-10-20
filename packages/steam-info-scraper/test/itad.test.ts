import { describe, expect, it, vi } from 'vitest';

import { fetchItadPriceHistory, parseItadHistory, parseItadLookup } from '../src';
import { fixtureFetchText, fixtureItadApiKey, loadItadHistoryJson } from './fixtures';

describe('parseItadLookup', () => {
    it('reads the game id, or null when ITAD does not know the app', () => {
        expect(parseItadLookup('{"found":true,"game":{"id":"018d937f-33f0-7200-80fc-87f769196c84","title":"Hades"}}'))
            .toBe('018d937f-33f0-7200-80fc-87f769196c84');
        expect(parseItadLookup('{"found":false}')).toBeNull();
    });
});

describe('parseItadHistory', () => {
    it('reads each price with the original price of its time, newest first', () => {
        const records = parseItadHistory(loadItadHistoryJson(900270));
        // Reventure's original price went 152 → 22 → 102 → 261; 11 was 50% off 22.
        expect(records).toContainEqual({ time: new Date('2025-06-27T00:13:30+02:00'), price: 11, regular: 22 });
        expect(records[0]!.regular).toBe(261);
        expect(records.at(-1)!.time).toEqual(new Date('2024-12-11T16:26:51+01:00'));
        const times = records.map(record => record.time.getTime());
        expect(times).toEqual([...times].sort((a, b) => b - a));
    });
});

describe('fetchItadPriceHistory', () => {
    it('looks the app up and fetches its whole history, with the key in a header', async () => {
        const fetchText = vi.fn(fixtureFetchText);
        const records = await fetchItadPriceHistory(1145360, fetchText, fixtureItadApiKey);

        expect(Math.min(...records!.map(record => record.price))).toBe(102);
        expect(fetchText).toHaveBeenCalledTimes(2);
        for (const [url, headers] of fetchText.mock.calls) {
            expect(url).not.toContain(fixtureItadApiKey);
            expect(headers).toEqual({ 'ITAD-API-Key': fixtureItadApiKey });
        }
        expect(fetchText.mock.calls[1]![0]).toContain('since=2010-01-01');
    });

    it('returns null for an app ITAD does not know, and no records for one without prices yet', async () => {
        await expect(fetchItadPriceHistory(999999999, fixtureFetchText, fixtureItadApiKey)).resolves.toBeNull();
        // Warhammer Survivors: not released yet.
        await expect(fetchItadPriceHistory(3669620, fixtureFetchText, fixtureItadApiKey)).resolves.toEqual([]);
    });

    it('rejects when ITAD refuses the key', async () => {
        await expect(fetchItadPriceHistory(1145360, fixtureFetchText, 'wrong')).rejects.toThrow('403');
    });
});
