import type { FetchText } from '@watchlist/core';
import type { SheetApi } from '@watchlist/sheet-api';
import { fetchPlaytimeSample, fetchSteamSnapshot, type ParseHtml, type SteamDbPrices } from '@watchlist/steam-info-scraper';

import type { ColumnName, SheetRowValues } from './columns';
import { formatPlaytime } from './detail';
import { planLowestOff } from './lowestOff';
import { computePlaytimeStats } from './playtime';
import { planNewRow } from './newRow';
import { planRefresh, refreshReadColumns, type RefreshPlan } from './refresh';

/**
 * Where refreshed rows are read from and written to, keyed by Steam app id.
 * Implementations resolve the row themselves and must refuse to write when the row
 * no longer holds `appId` (rows move as the sheet is edited by hand).
 */
export interface SheetRowStore {
    /** The row's current values for `columns`. Rejects when no row has `appId`. */
    read(appId: number, columns: readonly ColumnName[]): Promise<SheetRowValues>;
    /** Write only the given cells, leaving the rest of the row alone. */
    write(appId: number, values: SheetRowValues): Promise<void>;
    /** Add a row for `appId`. Rejects when a row already has it. */
    append(appId: number, values: SheetRowValues): Promise<void>;
}

/** A `SheetRowStore` backed by the web app. */
export function sheetApiRowStore(api: SheetApi): SheetRowStore {
    return {
        read: async (appId, columns) => (await api.readRow(appId, columns)).values,
        write: async (appId, values) => {
            await api.updateRow(appId, values);
        },
        append: async (appId, values) => {
            await api.appendRow(appId, values);
        },
    };
}

export interface RefreshDeps {
    fetchText: FetchText;
    store: SheetRowStore;
    /** Defaults to the browser's `DOMParser`. */
    parseHtml?: ParseHtml;
    /** Defaults to the current time; decides the update date. */
    now?: () => Date;
    /**
     * The SteamDB block (`readSteamDbPrices`), where the page has one.
     * Refresh: null or absent leaves 最低off alone. Add: null writes `defaultLowestOff` (0).
     */
    steamDb?: SteamDbPrices | null;
    /**
     * The app's store page, when the caller is on it (userscript-steam): parsed instead of
     * fetched when it reads the same as a fetched one (`matchesFetchedStorePage`: 繁中, TWD).
     */
    openStorePage?: Document;
}

/**
 * Refresh one game's sheet row from Steam.
 *
 * @returns The written cells, and the price / release date changes to show the user.
 */
export async function refreshGame(appId: number, deps: RefreshDeps): Promise<RefreshPlan> {
    const [snapshot, oldRow] = await Promise.all([
        fetchSteamSnapshot(appId, deps.fetchText, deps.parseHtml, deps.openStorePage),
        deps.store.read(appId, refreshReadColumns),
    ]);
    const lowestOff = deps.steamDb == null ? null : planLowestOff(deps.steamDb, snapshot.page.originalPrice);
    const plan = planRefresh(snapshot, oldRow, deps.now?.() ?? new Date(), { lowestOff });
    await deps.store.write(appId, plan.updates);
    return plan;
}

/**
 * Add a row for a game the sheet does not have yet; see `planNewRow`.
 *
 * @returns The written cells.
 */
export async function addGame(appId: number, deps: RefreshDeps): Promise<SheetRowValues> {
    const snapshot = await fetchSteamSnapshot(appId, deps.fetchText, deps.parseHtml, deps.openStorePage);
    const row = planNewRow({
        appId,
        snapshot,
        lowestOff: planLowestOff(deps.steamDb ?? null, snapshot.page.originalPrice),
        today: deps.now?.() ?? new Date(),
    });
    await deps.store.append(appId, row);
    return row;
}

/**
 * Only the playtime part of 備註, from a fresh review sample; nothing is read or written in the sheet.
 *
 * @returns e.g. `中位12H，PR84 30H。`
 */
export async function fetchPlaytime(appId: number, fetchText: FetchText): Promise<string> {
    return formatPlaytime(computePlaytimeStats(await fetchPlaytimeSample(appId, fetchText)));
}
