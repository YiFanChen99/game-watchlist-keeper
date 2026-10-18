import { Column, parseSheetDate } from '@watchlist/game-record-writer';
import { toDumpRow } from '@watchlist/sheet-api';

import { withSheetApi } from './gm';
import type { SheetData } from './types';

const updateDurationMs = 24 * 60 * 60 * 1000; // 24 hours

const storageKey = 'ekkoGames';

function saveData(data: SheetData): void {
    localStorage.setItem(storageKey, JSON.stringify(data));
}

/** Fetch the sheet now, skipping the cache, and cache the result. */
export async function fetchData(): Promise<SheetData> {
    console.log('SteamGifts Annotator: fetchData starting ...');
    const dump = await withSheetApi(api => api.fetchDump());
    const data: SheetData = { ...dump, time: Date.now() };
    saveData(data);
    return data;
}

export async function getOrFetchData(): Promise<SheetData> {
    const old = localStorage.getItem(storageKey);
    if (old) {
        const record = JSON.parse(old) as SheetData;
        const diffMs = Date.now() - record.time;
        if (diffMs > updateDurationMs) {
            return await fetchData();
        } else {
            return record;
        }
    } else {
        return await fetchData();
    }
}

/**
 * After a refresh wrote 更新日, set it on the matching games of `data` in place and save,
 * so the annotation drops its old year without refetching the sheet. The fetch time is
 * kept, so the cache still expires on schedule.
 *
 * @param name The refreshed row's whole name cell, as the dump's `B` has it.
 * @returns Whether any game matched.
 */
export function markUpdated(data: SheetData, name: string, updatedOn: Date): boolean {
    const games = data.games.filter(game => game.B === name);
    for (const game of games) {
        // Same text the web app dumps.
        game.G = updatedOn.toDateString();
    }
    if (games.length) {
        saveData(data);
    }
    return games.length > 0;
}

/** Header names of the cells a dump row is built from (B, G, K and L). */
const dumpRowColumns = [Column.name, Column.updatedOn, Column.wantLevel, Column.anyDeal];

/**
 * Read only the sheet row of `appId`, put it in `data` in place of the games with that app id,
 * and save, so a game just fixed in the sheet need not refetch the whole sheet. The fetch time
 * is kept, so the cache still expires on schedule. The row follows the dump's rules, so a want
 * level of blank or 0 leaves it out.
 *
 * Rejects with a `SheetApiError` of code `not-found` when no row links `appId`.
 */
export async function refetchGame(data: SheetData, appId: number): Promise<void> {
    const { values } = await withSheetApi(api => api.readRow(appId, dumpRowColumns));
    const updatedOn = parseSheetDate(values[Column.updatedOn] ?? '');
    const game = toDumpRow({
        name: values[Column.name],
        // Same text the web app dumps.
        updatedOn: updatedOn ? updatedOn.toDateString() : '',
        want: values[Column.wantLevel],
        anyDeal: values[Column.anyDeal],
        appId,
    });
    data.games = data.games.filter(old => old.appId !== appId);
    if (game) {
        data.games.push(game);
    }
    saveData(data);
}
