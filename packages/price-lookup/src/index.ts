import { Column } from '@watchlist/game-record-writer';
import type { RowValues, SheetApi } from '@watchlist/sheet-api';

/** Header of the sheet's Ceiling column: the wanted price, a formula from AnyDeal, Regular and 原價. */
export const ceilingColumn = 'Ceiling';

/** The columns `toPrices` reads; add them to a row read that wants other cells as well. */
export const priceColumns: readonly string[] = [Column.lowestPrice, ceilingColumn];

/**
 * A game's prices from its sheet row, in TWD as the sheet computes them (maybe with decimals).
 * null for a blank cell, or text such as the `-` 最低$ shows without a 最低off.
 */
export interface Prices {
    /** 最低$: the lowest price seen, from 原價 and 最低off. */
    historicalLow: number | null;
    /** Ceiling: the price the game is wanted at. */
    wanted: number | null;
}

function toPrice(value: string | number | undefined): number | null {
    if (typeof value === 'number') {
        return value;
    }
    const text = String(value ?? '').trim();
    const number = Number(text);
    return text !== '' && Number.isFinite(number) ? number : null;
}

/** The prices in a row read that included `priceColumns`. */
export function toPrices(values: RowValues): Prices {
    return {
        historicalLow: toPrice(values[Column.lowestPrice]),
        wanted: toPrice(values[ceilingColumn]),
    };
}

/**
 * Read the prices of the row whose name links `appId`. Rejects with a `SheetApiError` of code
 * `not-found` when there is no such row.
 */
export async function lookupPrices(api: SheetApi, appId: number): Promise<Prices> {
    return toPrices((await api.readRow(appId, priceColumns)).values);
}

/** One price for display: rounded, since TWD is shown without decimals; `-` for null. */
export function formatPrice(price: number | null): string {
    return price === null ? '-' : String(Math.round(price));
}
