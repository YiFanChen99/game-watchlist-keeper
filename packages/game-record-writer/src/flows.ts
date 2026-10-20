import type { FetchText } from '@watchlist/core';
import type { SheetApi } from '@watchlist/sheet-api';
import {
    fetchItadPriceHistory,
    fetchPlaytimeSample,
    fetchSteamSnapshot,
    type ItadPriceRecord,
    type ParseHtml,
    type SteamDbPrices,
} from '@watchlist/steam-info-scraper';

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
    /** The SteamDB block (`readSteamDbPrices`), where the page has one; see `planLowestOff`. */
    steamDb?: SteamDbPrices | null;
    /** IsThereAnyDeal's API key; without it, 最低off goes by the SteamDB block alone. */
    itadApiKey?: string;
    /**
     * The app's store page, when the caller is on it (userscript-steam): parsed instead of
     * fetched when it reads the same as a fetched one (`matchesFetchedStorePage`: 繁中, TWD).
     */
    openStorePage?: Document;
}

/** What IsThereAnyDeal answered, for the user to know where 最低off came from. */
export interface ItadOutcome {
    /** Its price records of the game; `null` without them. */
    itadHistory: readonly ItadPriceRecord[] | null;
    /** The failed request, which leaves 最低off to the SteamDB block; `null` when ITAD answered or was not asked. */
    itadError: Error | null;
}

/** ITAD's records, or why there are none. A failure does not fail the refresh: 最低off has other ways. */
async function fetchItad(appId: number, deps: RefreshDeps): Promise<ItadOutcome> {
    if (deps.itadApiKey === undefined) {
        return { itadHistory: null, itadError: null };
    }
    try {
        return { itadHistory: await fetchItadPriceHistory(appId, deps.fetchText, deps.itadApiKey), itadError: null };
    } catch (error) {
        return { itadHistory: null, itadError: error instanceof Error ? error : new Error(String(error)) };
    }
}

export interface RefreshResult extends RefreshPlan, ItadOutcome {}

/**
 * Refresh one game's sheet row from Steam and ITAD.
 *
 * @returns The written cells, the price / release date changes to show the user, and ITAD's answer.
 */
export async function refreshGame(appId: number, deps: RefreshDeps): Promise<RefreshResult> {
    const [snapshot, oldRow, itad] = await Promise.all([
        fetchSteamSnapshot(appId, deps.fetchText, deps.parseHtml, deps.openStorePage),
        deps.store.read(appId, refreshReadColumns),
        fetchItad(appId, deps),
    ]);
    const today = deps.now?.() ?? new Date();
    const lowestOff = planLowestOff(snapshot.page, { itadHistory: itad.itadHistory, steamDb: deps.steamDb ?? null }, oldRow, today);
    const plan = planRefresh(snapshot, oldRow, today, { lowestOff });
    await deps.store.write(appId, plan.updates);
    return { ...plan, ...itad };
}

export interface AddResult extends ItadOutcome {
    /** The written cells. */
    row: SheetRowValues;
}

/**
 * Add a row for a game the sheet does not have yet; see `planNewRow`.
 *
 * @returns The written cells, and ITAD's answer.
 */
export async function addGame(appId: number, deps: RefreshDeps): Promise<AddResult> {
    const [snapshot, itad] = await Promise.all([
        fetchSteamSnapshot(appId, deps.fetchText, deps.parseHtml, deps.openStorePage),
        fetchItad(appId, deps),
    ]);
    const today = deps.now?.() ?? new Date();
    const row = planNewRow({
        appId,
        snapshot,
        lowestOff: planLowestOff(snapshot.page, { itadHistory: itad.itadHistory, steamDb: deps.steamDb ?? null }, null, today),
        today,
    });
    await deps.store.append(appId, row);
    return { row, ...itad };
}

/**
 * Only the playtime part of 備註, from a fresh review sample; nothing is read or written in the sheet.
 *
 * @returns e.g. `中位12H，PR84 30H。`
 */
export async function fetchPlaytime(appId: number, fetchText: FetchText): Promise<string> {
    return formatPlaytime(computePlaytimeStats(await fetchPlaytimeSample(appId, fetchText)));
}
