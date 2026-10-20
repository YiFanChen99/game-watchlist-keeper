import type { FetchText } from '@watchlist/core';

/** IsThereAnyDeal's id of the Steam shop. */
export const itadSteamShopId = 61;

const itadApiUrl = 'https://api.isthereanydeal.com';

/**
 * Where a price history starts: before any record, so the whole history comes back. ITAD's
 * TW prices start on 2024-12-11; without `since`, the API only returns the last few months.
 */
const itadHistorySince = '2010-01-01T00:00:00Z';

/** Request headers carrying `apiKey`, kept out of the URL so it stays out of error messages. */
export function itadApiKeyHeaders(apiKey: string): Record<string, string> {
    return { 'ITAD-API-Key': apiKey };
}

/** ITAD's game for a Steam app; fetch with `itadApiKeyHeaders`. */
export function itadLookupUrl(appId: number): string {
    return `${itadApiUrl}/games/lookup/v1?appid=${appId}`;
}

/** Every Steam TW price record of an ITAD game; fetch with `itadApiKeyHeaders`. */
export function itadHistoryUrl(gameId: string): string {
    const query = new URLSearchParams({ id: gameId, country: 'TW', shops: String(itadSteamShopId), since: itadHistorySince });
    return `${itadApiUrl}/games/history/v2?${query}`;
}

/** The subset of the `/games/lookup/v1` response that is read. */
interface ItadLookupResponse {
    found: boolean;
    game?: { id: string };
}

/**
 * @param json Body of `itadLookupUrl`.
 * @returns The ITAD game id; `null` when ITAD does not know the app.
 */
export function parseItadLookup(json: string): string | null {
    const data = JSON.parse(json) as ItadLookupResponse;
    return data.found && data.game ? data.game.id : null;
}

/** The subset of a `/games/history/v2` record that is read. */
interface ItadHistoryRecord {
    timestamp: string;
    deal: {
        price: { amount: number };
        regular: { amount: number };
    };
}

/** One Steam TW price of a game, from when it took effect until the next record. */
export interface ItadPriceRecord {
    time: Date;
    /** The price paid, in TWD. */
    price: number;
    /** The price before discount at the time, in TWD. */
    regular: number;
}

/**
 * @param json Body of `itadHistoryUrl`.
 * @returns Newest first, as ITAD lists them.
 */
export function parseItadHistory(json: string): ItadPriceRecord[] {
    return (JSON.parse(json) as ItadHistoryRecord[]).map(record => ({
        time: new Date(record.timestamp),
        price: record.deal.price.amount,
        regular: record.deal.regular.amount,
    }));
}

/**
 * Every Steam TW price record ITAD has of a Steam app, newest first.
 *
 * @returns `null` when ITAD does not know the app.
 */
export async function fetchItadPriceHistory(appId: number, fetchText: FetchText, apiKey: string): Promise<ItadPriceRecord[] | null> {
    const headers = itadApiKeyHeaders(apiKey);
    const gameId = parseItadLookup(await fetchText(itadLookupUrl(appId), headers));
    return gameId === null ? null : parseItadHistory(await fetchText(itadHistoryUrl(gameId), headers));
}
