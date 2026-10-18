import { Column, refreshGame, sheetApiRowStore, type SheetRowStore, type ValueChange } from '@watchlist/game-record-writer';

import { fetchText, withSheetApi } from './tampermonkey';

export interface RefreshResult {
    /** The row's whole name cell, aliases included, as the dump's `B` has it. */
    name: string;
    changes: ValueChange[];
}

/**
 * Refresh the sheet row of `appId` from Steam. 最低off is left alone: SteamGifts has no
 * SteamDB block. Rejects with a `SheetApiError` of code `not-found` when the sheet has no row
 * for it; adding a game is only done on its Steam store page.
 *
 * @param today Becomes the row's 更新日.
 */
export async function refreshRow(appId: number, today: Date): Promise<RefreshResult> {
    let name = '';
    const { changes } = await withSheetApi(api => {
        const store = sheetApiRowStore(api);
        // The name rides along on the read the refresh makes anyway; it locates the dump row.
        const readingName: SheetRowStore = {
            ...store,
            read: async (id, columns) => {
                const values = await store.read(id, [...columns, Column.name]);
                name = String(values[Column.name] ?? '');
                return values;
            },
        };
        return refreshGame(appId, { fetchText, store: readingName, now: () => today });
    });
    return { name, changes };
}
