import {
    Column,
    formatChange,
    refreshGame,
    refreshReadColumns,
    type SheetRowStore,
} from '@watchlist/game-record-writer';
import { SheetApiError, type NumberedRowResponse, type SheetApi } from '@watchlist/sheet-api';

import { Panel } from './panel';
import { parseSelectedRow, parseSheetLocation, type SheetLocation } from './selection';
import { fetchText, withSheetApi } from './tampermonkey';
import { parseHtml } from './trustedHtml';

/**
 * Tampermonkey storage keys:
 *  sheetApiToken: the token the Apps Script web app checks
 *  watchlistSpreadsheetId: the spreadsheet the web app writes, learnt on the first refresh;
 *    from then on the button shows only there
 */
const spreadsheetIdKey = 'watchlistSpreadsheetId';

/** A refusal worded for the user; nothing was written. */
class RefusalError extends Error {}

/** @returns The row the name box at the sheet's top left points at. */
function readSelectedRow(): number {
    const nameBox = document.querySelector<HTMLInputElement>('#t-name-box');
    if (!nameBox) {
        throw new Error('找不到左上角的名稱方塊，Sheet 的版面可能改了。');
    }
    const row = parseSelectedRow(nameBox.value);
    if (row === null) {
        throw new RefusalError(`請只選取一列（左上角的名稱方塊是「${nameBox.value}」）。`);
    }
    return row;
}

/**
 * The selected row as `refreshGame` reads and writes it, without the web app looking the app id up:
 * the read is the one `target` already made, and the write goes to the row by number.
 */
function selectedRowStore(api: SheetApi, target: NumberedRowResponse): SheetRowStore {
    return {
        read: async (_appId, columns) => columns.every(column => column in target.values)
            ? target.values
            : (await api.readRowByNumber(target.row, columns)).values,
        write: async (appId, values) => {
            await api.updateRowByNumber(target.row, appId, values);
        },
        append: () => Promise.reject(new Error('Sheet 上只刷新已有的列')),
    };
}

/** Refresh the selected row from Steam; 最低off is left alone, as Sheets has no SteamDB block. */
async function refreshSelectedRow(page: SheetLocation): Promise<string> {
    const row = readSelectedRow();
    return withSheetApi(async (api) => {
        let target;
        try {
            // The columns the refresh reads come along, so it need not read the row again.
            target = await api.readRowByNumber(row, [Column.name, ...refreshReadColumns]);
        } catch (error) {
            throw describeReadError(error, row);
        }
        // The web app always reads its own worksheet: make sure that is the one on screen.
        const written = parseSheetLocation(target.url);
        if (written?.spreadsheetId !== page.spreadsheetId || written.gid !== parseSheetLocation(location.href)?.gid) {
            throw new RefusalError('這裡不是遊戲清單的工作表，沒有更新。');
        }
        GM_setValue(spreadsheetIdKey, page.spreadsheetId);
        let changes;
        try {
            ({ changes } = await refreshGame(target.appId, { fetchText, store: selectedRowStore(api, target), parseHtml }));
        } catch (error) {
            if (error instanceof SheetApiError && error.code === 'not-found') {
                throw new RefusalError(`第 ${row} 列已經不是這款遊戲（可能插入或刪除了列），沒有更新。`);
            }
            throw error;
        }
        const name = String(target.values[Column.name] ?? '');
        return [`已更新第 ${row} 列 ${name}。`, ...changes.map(formatChange)].join('\n');
    });
}

function describeReadError(error: unknown, row: number): unknown {
    if (!(error instanceof SheetApiError)) {
        return error;
    }
    switch (error.code) {
        case 'not-found':
            return new RefusalError(`第 ${row} 列的名稱沒有連到 Steam 商店頁，找不到 AppID。`);
        case 'invalid':
            // Web app versions before the row-number lookup refuse it as a bad app id: keep their message.
            return error.message.includes('bad row') ? new RefusalError(`第 ${row} 列不是遊戲。`) : error;
        default:
            return error;
    }
}

async function refresh(panel: Panel, page: SheetLocation): Promise<void> {
    panel.setBusy(true);
    panel.showMessage('', false);
    try {
        panel.showMessage(await refreshSelectedRow(page), false);
    } catch (error) {
        if (!(error instanceof RefusalError)) {
            console.error('Sheet Row Refresher:', error);
        }
        panel.showMessage(error instanceof Error ? error.message : String(error), true);
    } finally {
        panel.setBusy(false);
    }
}

function main(): void {
    const page = parseSheetLocation(location.href);
    const known = GM_getValue<string>(spreadsheetIdKey, '');
    if (!page || (known && known !== page.spreadsheetId)) {
        return;
    }
    const panel: Panel = new Panel(() => {
        void refresh(panel, page);
    });
}

main();
