import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { HttpStatusError, type FetchText } from '@watchlist/core';

const dir = join(import.meta.dirname, 'fixtures');

/** A saved store page's HTML. */
export function loadStorePageHtml(appId: number): string {
    return readFileSync(join(dir, 'store', `${appId}.html`), 'utf8');
}

/** A saved store page, parsed the same way userscripts parse fetched HTML. */
export function loadStorePage(appId: number): Document {
    return new DOMParser().parseFromString(loadStorePageHtml(appId), 'text/html');
}

/** A saved, trimmed `/appreviews` response body with the playtime sample. */
export function loadAppReviewsJson(appId: number): string {
    return readFileSync(join(dir, 'appreviews', `${appId}.json`), 'utf8');
}

/** A saved `reviewSummaryUrl` response body: counts only. */
export function loadReviewSummaryJson(appId: number): string {
    return readFileSync(join(dir, 'reviewsummary', `${appId}.json`), 'utf8');
}

/** A saved, trimmed `itadLookupUrl` response body. */
export function loadItadLookupJson(appId: number): string {
    return readFileSync(join(dir, 'itad', 'lookup', `${appId}.json`), 'utf8');
}

/** A saved, trimmed `itadHistoryUrl` response body, for the app it is named after. */
export function loadItadHistoryJson(appId: number): string {
    return readFileSync(join(dir, 'itad', 'history', `${appId}.json`), 'utf8');
}

/** The API key `fixtureFetchText` takes for ITAD; any other is refused, as ITAD would. */
export const fixtureItadApiKey = 'fixture-itad-api-key';

/** Apps with a saved ITAD lookup. */
const itadLookupApps = readdirSync(join(dir, 'itad', 'lookup')).map(file => Number(file.replace('.json', '')));

/** ITAD game id → the app id its saved history is named after. */
const itadGameApps = new Map(itadLookupApps.flatMap((appId) => {
    const lookup = JSON.parse(loadItadLookupJson(appId)) as { game?: { id: string } };
    return lookup.game ? [[lookup.game.id, appId] as const] : [];
}));

/** Serves the saved ITAD lookups and histories; an app without a saved lookup is not known to ITAD. */
function fetchItadFixture(url: URL, headers: Record<string, string> | undefined): Promise<string> {
    if (headers?.['ITAD-API-Key'] !== fixtureItadApiKey) {
        return Promise.reject(new HttpStatusError(`Failed to GET ${url.origin}${url.pathname}: 403`, 403));
    }
    if (url.pathname === '/games/lookup/v1') {
        const appId = Number(url.searchParams.get('appid'));
        return Promise.resolve(itadLookupApps.includes(appId) ? loadItadLookupJson(appId) : '{"found":false}');
    }
    const appId = itadGameApps.get(url.searchParams.get('id') ?? '');
    if (url.pathname === '/games/history/v2' && appId !== undefined) {
        return Promise.resolve(loadItadHistoryJson(appId));
    }
    return Promise.reject(new Error(`unexpected URL ${url}`));
}

/**
 * Serves the saved store page and reviews of any fixture app, as `fetchSteamSnapshot` requests them,
 * and its ITAD lookup and history, as `fetchItadPriceHistory` requests them with `fixtureItadApiKey`.
 * The one saved sample answers every day range. Other packages' tests use it too.
 */
export const fixtureFetchText: FetchText = (url, headers) => {
    if (url.startsWith('https://api.isthereanydeal.com/')) {
        return fetchItadFixture(new URL(url), headers);
    }
    const appId = Number(/\/(?:app|appreviews)\/(\d+)/.exec(url)?.[1]);
    if (url.startsWith('https://store.steampowered.com/appreviews/')) {
        const isSummary = new URL(url).searchParams.get('num_per_page') === '0';
        return Promise.resolve(isSummary ? loadReviewSummaryJson(appId) : loadAppReviewsJson(appId));
    }
    if (url.startsWith('https://store.steampowered.com/app/')) {
        return Promise.resolve(loadStorePageHtml(appId));
    }
    return Promise.reject(new Error(`unexpected URL ${url}`));
};
