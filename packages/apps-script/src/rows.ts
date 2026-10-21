import { extractAppId } from '@watchlist/core';
import {
    Column,
    updatableColumns,
    type CellValue as RowCellValue,
    type ColumnName,
    type SheetRowValues,
} from '@watchlist/game-record-writer';
import type { SheetApiErrorCode } from '@watchlist/sheet-api';

import type { CellValue } from './dump';

/** Header row of the `STEAM` worksheet. */
export const headerRow = 1;
/** First row that holds a game. */
export const firstDataRow = 2;
/** `append` inserts a blank row here and fills it; the rows from here move down one. */
export const appendRow = 8;

/** A refusal to send back as `SheetApiErrorBody`. */
export class RequestError extends Error {
    constructor(readonly code: SheetApiErrorCode, message: string) {
        super(message);
        this.name = 'RequestError';
    }
}

/**
 * @returns 0-based column index by header name.
 */
export function indexHeader(header: readonly CellValue[]): Map<string, number> {
    const columns = new Map<string, number>();
    header.forEach((name, index) => {
        const key = String(name).trim();
        if (key && !columns.has(key)) {
            columns.set(key, index);
        }
    });
    return columns;
}

export function columnIndex(columns: ReadonlyMap<string, number>, name: string): number {
    const index = columns.get(name);
    if (index === undefined) {
        throw new RequestError('invalid', `no column named ${name}`);
    }
    return index;
}

/** 1-based row by app id, as JSON keys are strings. */
export type AppIdIndex = Record<string, number>;

/**
 * @param links One entry per name cell from `firstDataRow` down: its formula.
 * @returns Each linked app id's row; when several rows link one app id, the first wins.
 */
export function indexAppIds(links: readonly string[]): AppIdIndex {
    const index: AppIdIndex = {};
    links.forEach((link, offset) => {
        const appId = extractAppId(link);
        if (appId !== null && !(appId in index)) {
            index[appId] = offset + firstDataRow;
        }
    });
    return index;
}

/**
 * The index after inserting a row at `row`: rows from `row` down move down one.
 */
export function shiftAppIds(index: AppIdIndex, row: number): AppIdIndex {
    const shifted: AppIdIndex = {};
    for (const [appId, at] of Object.entries(index)) {
        shifted[appId] = at >= row ? at + 1 : at;
    }
    return shifted;
}

/** One cell to set, by 0-based column index. */
export type CellWrite =
    | { column: number; value: RowCellValue }
    | { column: number; formulaR1C1: string };

/** Only cells that may be written, and never a formula except the name. */
function checkValue(name: string, value: unknown, allowName: boolean): RowCellValue {
    const isName = name === Column.name;
    if (!(isName && allowName) && !updatableColumns.has(name as ColumnName)) {
        throw new RequestError('invalid', `column ${name} may not be written`);
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
        throw new RequestError('invalid', `column ${name} needs a string or number`);
    }
    if (!isName && String(value).startsWith('=')) {
        throw new RequestError('invalid', `column ${name} may not get a formula`);
    }
    return value;
}

/**
 * The writes of `update`: only the given cells, and none into a cell holding a formula.
 *
 * @param rowFormulas The target row's formulas, one entry per column (`''` for plain values).
 */
export function planUpdate(
    columns: ReadonlyMap<string, number>,
    values: SheetRowValues,
    rowFormulas: readonly string[],
): CellWrite[] {
    return Object.entries(values).map(([name, value]) => {
        const column = columnIndex(columns, name);
        const checked = checkValue(name, value, false);
        if (rowFormulas[column]) {
            throw new RequestError('invalid', `column ${name} holds a formula`);
        }
        return { column, value: checked };
    });
}

/**
 * The writes of `append`: the formulas of the row above, except its name, then the given cells.
 * A given cell whose column has a formula above is dropped, so computed columns stay computed.
 *
 * @param templateFormulasR1C1 The row above's formulas in R1C1 notation, so relative references move along.
 */
export function planAppend(
    columns: ReadonlyMap<string, number>,
    values: SheetRowValues,
    templateFormulasR1C1: readonly string[],
): CellWrite[] {
    const nameColumn = columnIndex(columns, Column.name);
    if (values[Column.name] === undefined) {
        throw new RequestError('invalid', `append needs ${Column.name}`);
    }

    const writes: CellWrite[] = [];
    templateFormulasR1C1.forEach((formulaR1C1, column) => {
        if (formulaR1C1 && column !== nameColumn) {
            writes.push({ column, formulaR1C1 });
        }
    });
    for (const [name, value] of Object.entries(values)) {
        const column = columnIndex(columns, name);
        const checked = checkValue(name, value, true);
        if (column === nameColumn || !templateFormulasR1C1[column]) {
            writes.push({ column, value: checked });
        }
    }
    return writes;
}

/**
 * Pick named cells of one row for the `row` action, with dates as `YYYY/M/D`.
 *
 * @param formatDate Formats a date cell in the spreadsheet's time zone.
 */
export function pickValues(
    columns: ReadonlyMap<string, number>,
    names: readonly string[],
    row: readonly CellValue[],
    formatDate: (date: Date) => string,
): SheetRowValues {
    const values: SheetRowValues = {};
    for (const name of names) {
        const cell = row[columnIndex(columns, name)] ?? '';
        values[name as ColumnName] = cell instanceof Date
            ? formatDate(cell)
            : typeof cell === 'number' ? cell : String(cell);
    }
    return values;
}

/**
 * Link that opens the sheet with the whole `row` selected.
 *
 * @param spreadsheetUrl `Spreadsheet.getUrl()`, e.g. `https://docs.google.com/spreadsheets/d/<id>/edit`.
 * @param sheetId `Sheet.getSheetId()`, the URL's `gid`.
 */
export function rowUrl(spreadsheetUrl: string, sheetId: number, row: number): string {
    return `${spreadsheetUrl}#gid=${sheetId}&range=${row}:${row}`;
}
