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
import { defaultLowestOff, planLowestOff } from './lowestOff';
import { computePlaytimeStats } from './playtime';
import { planNewRow } from './newRow';
import { planRefresh, refreshReadColumns, type RefreshPlan } from './refresh';
import { matchTagRules, type TagRule } from './tagRules';

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
    itadApiKey?: string | undefined;
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

export interface LowestOffNoteContext {
    /** Whether the row was added (a missing lowest price writes `defaultLowestOff`) or refreshed. */
    action: 'add' | 'refresh';
    /** Whether ITAD was asked: false without an API key. */
    hasItadApiKey: boolean;
    /** Whether ITAD refused the key, e.g. `ItadApiKey.forgetIfRefused`. */
    isItadApiKeyRefused: boolean;
    /** Whether the SteamDB block was read. */
    hasSteamDb: boolean;
}

/** ITAD's answer, and why 最低off has `!` (`LowestOffPlan`). */
export interface LowestOffOutcome extends ItadOutcome {
    lowestOffDoubts: readonly string[];
}

/**
 * Why ITAD gave no price records, and what 最低off went by instead; `null` when it gave some.
 * A game ITAD knows may have no Steam TW records, which leaves 最低off as nothing does.
 */
function formatNoItadNote(
    { itadHistory, itadError }: ItadOutcome,
    { action, hasItadApiKey, isItadApiKeyRefused, hasSteamDb }: LowestOffNoteContext,
): string | null {
    if (itadHistory !== null && itadHistory.length > 0) {
        return null;
    }
    const reason = isItadApiKeyRefused
        ? 'ITAD 拒絕了 API key（下次會重新詢問）'
        : itadError
            ? `ITAD 沒有回應（${itadError.message}）`
            : itadHistory
                ? 'ITAD 沒有這個遊戲在 Steam TW 的價格紀錄'
                : hasItadApiKey ? 'ITAD 沒有這個遊戲' : '沒有 ITAD 的 API key';
    if (hasSteamDb) {
        return `${reason}，最低off 只看 SteamDB 區塊，前面加上 !。`;
    }
    return action === 'add'
        ? `${reason}，也沒有 SteamDB 區塊，最低off 寫 ${defaultLowestOff}。`
        : `${reason}，也沒有 SteamDB 區塊，最低off 沒有更新（原本是數字的話前面加上 !，表示可能過時）。`;
}

/**
 * The lines a userscript shows about 最低off: why ITAD gave nothing and what 最低off went by
 * instead, and why it has `!`.
 *
 * @returns e.g. `沒有 ITAD 的價格紀錄，也沒有 SteamDB 區塊，最低off 沒有更新（…）。` or
 * `最低off 加上 !：ITAD 現在的原價是 749，不是商店頁的 799，可能追蹤別的方案。`; empty when there is nothing to tell.
 */
export function formatLowestOffNotes(outcome: LowestOffOutcome, context: LowestOffNoteContext): string[] {
    const noItad = formatNoItadNote(outcome, context);
    const doubts = outcome.lowestOffDoubts.length === 0 ? null : `最低off 加上 !：${outcome.lowestOffDoubts.join('；')}。`;
    return [noItad, doubts].filter(note => note !== null);
}

export interface RefreshResult extends RefreshPlan, LowestOffOutcome {}

/**
 * Refresh one game's sheet row from Steam and ITAD.
 *
 * @returns The written cells, the price / release date changes to show the user, ITAD's answer, and why 最低off has `!`.
 */
export async function refreshGame(appId: number, deps: RefreshDeps): Promise<RefreshResult> {
    const [snapshot, oldRow, itad] = await Promise.all([
        fetchSteamSnapshot(appId, deps.fetchText, deps.parseHtml, deps.openStorePage),
        deps.store.read(appId, refreshReadColumns),
        fetchItad(appId, deps),
    ]);
    const today = deps.now?.() ?? new Date();
    const lowestOff = planLowestOff(snapshot.page, { itadHistory: itad.itadHistory, steamDb: deps.steamDb ?? null }, oldRow, today);
    const plan = planRefresh(snapshot, oldRow, today, { lowestOff: lowestOff.cell });
    await deps.store.write(appId, plan.updates);
    return { ...plan, ...itad, lowestOffDoubts: lowestOff.doubts };
}

export interface AddDeps extends RefreshDeps {
    /** The tag rules (`parseTagRules`) that fill 模式 and the start of 備註; without them, both get `TODO`. */
    tagRules?: readonly TagRule[];
}

export interface AddResult extends LowestOffOutcome {
    /** The written cells. */
    row: SheetRowValues;
}

/**
 * Add a row for a game the sheet does not have yet; see `planNewRow`.
 *
 * @returns The written cells, ITAD's answer, and why 最低off has `!`.
 */
export async function addGame(appId: number, deps: AddDeps): Promise<AddResult> {
    const [snapshot, itad] = await Promise.all([
        fetchSteamSnapshot(appId, deps.fetchText, deps.parseHtml, deps.openStorePage),
        fetchItad(appId, deps),
    ]);
    const today = deps.now?.() ?? new Date();
    const lowestOff = planLowestOff(snapshot.page, { itadHistory: itad.itadHistory, steamDb: deps.steamDb ?? null }, null, today);
    const tagMatch = matchTagRules(deps.tagRules ?? [], snapshot.page);
    const row = planNewRow({ appId, snapshot, lowestOff: lowestOff.cell, today, tagMatch });
    await deps.store.append(appId, row);
    return { row, ...itad, lowestOffDoubts: lowestOff.doubts };
}

/**
 * Only the playtime part of 備註, from a fresh review sample; nothing is read or written in the sheet.
 *
 * @returns e.g. `中位12H，PR84 30H。`
 */
export async function fetchPlaytime(appId: number, fetchText: FetchText): Promise<string> {
    return formatPlaytime(computePlaytimeStats(await fetchPlaytimeSample(appId, fetchText)));
}
