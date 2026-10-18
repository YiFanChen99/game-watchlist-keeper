import { Column, formatChange, refreshGame, sheetApiRowStore } from '@watchlist/game-record-writer';
import { SheetApiError } from '@watchlist/sheet-api';

import { Panel } from './panel';
import { parseSelectedRow, parseSheetLocation, type SheetLocation } from './selection';
import { fetchText, withSheetApi } from './tampermonkey';

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

/** Refresh the selected row from Steam; 最低off is left alone, as Sheets has no SteamDB block. */
async function refreshSelectedRow(page: SheetLocation): Promise<string> {
    const row = readSelectedRow();
    return withSheetApi(async (api) => {
        let target;
        try {
            target = await api.readRowByNumber(row, [Column.name]);
        } catch (error) {
            throw describeRowError(error, row);
        }
        // The web app always reads its own worksheet: make sure that is the one on screen.
        const written = parseSheetLocation(target.url);
        if (written?.spreadsheetId !== page.spreadsheetId || written.gid !== parseSheetLocation(location.href)?.gid) {
            throw new RefusalError('這裡不是遊戲清單的工作表，沒有更新。');
        }
        GM_setValue(spreadsheetIdKey, page.spreadsheetId);
        const { changes } = await refreshGame(target.appId, { fetchText, store: sheetApiRowStore(api) });
        const name = String(target.values[Column.name] ?? '');
        return [`已更新第 ${row} 列 ${name}。`, ...changes.map(formatChange)].join('\n');
    });
}

function describeRowError(error: unknown, row: number): unknown {
    if (!(error instanceof SheetApiError)) {
        return error;
    }
    switch (error.code) {
        case 'not-found':
            return new RefusalError(`第 ${row} 列的名稱沒有連到 Steam 商店頁，找不到 AppID。`);
        case 'duplicate': {
            const linked = /row (\d+)/.exec(error.message)?.[1];
            return new RefusalError(`${linked ? `第 ${linked} 列` : '更前面的列'}也連到同一款遊戲，更新會寫到那一列，請先處理重複的列。`);
        }
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
