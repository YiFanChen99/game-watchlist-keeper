import type { SheetApi } from '@watchlist/sheet-api';
import { describe, expect, it, vi } from 'vitest';

import { formatPrice, lookupPrices, priceColumns, toPrices } from '../src';

describe('toPrices', () => {
    it('reads 最低$ and 目標價 as numbers', () => {
        expect(toPrices({ '最低$': 90, '目標價': 49.6 })).toEqual({ historicalLow: 90, wanted: 49.6 });
        expect(toPrices({ '最低$': ' 90 ', '目標價': '50' })).toEqual({ historicalLow: 90, wanted: 50 });
    });

    it('gives null for a blank cell, or text such as 最低$ without a 最低off', () => {
        expect(toPrices({ '最低$': '-', '目標價': ' ' })).toEqual({ historicalLow: null, wanted: null });
        expect(toPrices({})).toEqual({ historicalLow: null, wanted: null });
    });
});

describe('lookupPrices', () => {
    it('reads only the price columns of the app id', async () => {
        const readRow = vi.fn<SheetApi['readRow']>().mockResolvedValue({ row: 5, values: { '最低$': 90, '目標價': 50 } });
        const api = { readRow } as unknown as SheetApi;
        await expect(lookupPrices(api, 570)).resolves.toEqual({ historicalLow: 90, wanted: 50 });
        expect(readRow).toHaveBeenCalledWith(570, priceColumns);
    });
});

describe('formatPrice', () => {
    it('rounds to whole TWD', () => {
        expect(formatPrice(49.6)).toBe('50');
        expect(formatPrice(90)).toBe('90');
    });

    it('shows null as -', () => {
        expect(formatPrice(null)).toBe('-');
    });
});
