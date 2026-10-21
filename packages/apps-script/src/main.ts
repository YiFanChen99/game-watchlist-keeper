/**
 * Entry points. scripts/build.mjs declares a global function for each export here,
 * because Apps Script only finds top-level function declarations.
 */
import { extractAppId } from '@watchlist/core';
import { Column, tagRulesWorksheetId } from '@watchlist/game-record-writer';
import {
    type FindResponse,
    type NumberedRowResponse,
    type RowResponse,
    type SheetApiErrorBody,
    type TagRuleCells,
    type WriteRequest,
    type WriteResponse,
} from '@watchlist/sheet-api';

import { createChunkedCache, type ChunkedCache } from './chunkedCache';
import { buildDump, firstColumn, lastColumn, worksheetName, type CellValue } from './dump';
import {
    appendRow,
    columnIndex,
    firstDataRow,
    headerRow,
    indexAppIds,
    indexHeader,
    pickValues,
    planAppend,
    planUpdate,
    RequestError,
    rowUrl,
    shiftAppIds,
    type AppIdIndex,
    type CellWrite,
} from './rows';

/** Script property holding the shared token. Set it in Project Settings → Script Properties. */
const tokenProperty = 'API_TOKEN';

function gzipCache(key: string): ChunkedCache {
    return createChunkedCache({
        store: CacheService.getScriptCache(),
        codec: {
            encode: text => Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(text)).getBytes()),
            decode: stored => Utilities.ungzip(
                Utilities.newBlob(Utilities.base64Decode(stored), 'application/x-gzip'),
            ).getDataAsString(),
        },
        key,
        chunkChars: 90_000,
        expirationInSeconds: 6 * 60 * 60,
    });
}

/** The whole-sheet dump the annotator reads. */
const dumpCache = () => gzipCache('dump:v2');

/** `AppIdIndex` of the name column, so a lookup need not read every name. */
const appIdIndexCache = () => gzipCache('appIds:v1');

/** The tag rules worksheet's cells (`TagRuleCells`). */
const tagRulesCache = () => gzipCache('tagRules:v1');

/** Fails closed: an unset token property rejects every request. */
export function isAuthorized(provided: unknown, expected: string | null): boolean {
    return Boolean(expected) && provided === expected;
}

function getWorksheet(): GoogleAppsScript.Spreadsheet.Sheet {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(worksheetName);
    if (!sheet) {
        throw new Error(`Worksheet ${worksheetName} not found`);
    }
    return sheet;
}

function readDumpText(): string {
    const sheet = getWorksheet();
    const header = sheet.getRange(`${firstColumn}1:${lastColumn}1`).getValues()[0] ?? [];
    const lastRow = sheet.getLastRow();
    const rows = lastRow < 2 ? [] : sheet.getRange(`${firstColumn}2:${lastColumn}${lastRow}`).getValues();
    const nameFormulas = lastRow < 2
        ? []
        : sheet.getRange(`${firstColumn}2:${firstColumn}${lastRow}`).getFormulas().map(cells => String(cells[0] ?? ''));
    // The same formulas make the app id index (the dump's B is the name column), so warm that cache too.
    appIdIndexCache().put(JSON.stringify(indexAppIds(nameFormulas)));
    return JSON.stringify(buildDump(header as CellValue[], rows as CellValue[][], nameFormulas));
}

function jsonOutput(text: string): GoogleAppsScript.Content.TextOutput {
    return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

/** The worksheet's header and the name column's index, the start of every single-row request. */
interface SheetContext {
    sheet: GoogleAppsScript.Spreadsheet.Sheet;
    lastColumn: number;
    columns: Map<string, number>;
    nameColumn: number;
}

function openSheet(): SheetContext {
    const sheet = getWorksheet();
    const lastColumn = sheet.getLastColumn();
    const columns = indexHeader(sheet.getRange(headerRow, 1, 1, lastColumn).getValues()[0] as CellValue[]);
    return { sheet, lastColumn, columns, nameColumn: columnIndex(columns, Column.name) };
}

function nameRange({ sheet, nameColumn }: SheetContext): GoogleAppsScript.Spreadsheet.Range | null {
    const count = sheet.getLastRow() - firstDataRow + 1;
    return count < 1 ? null : sheet.getRange(firstDataRow, nameColumn + 1, count, 1);
}

/**
 * Read every name's HYPERLINK formula and cache the resulting index. Names are always
 * HYPERLINK formulas, never inserted links, so the formulas are the only thing read.
 */
function scanAppIds(context: SheetContext): AppIdIndex {
    const range = nameRange(context);
    const index = range ? indexAppIds(range.getFormulas().map(cells => String(cells[0] ?? ''))) : {};
    appIdIndexCache().put(JSON.stringify(index));
    return index;
}

/** The row whose name links `appId`, read from the sheet itself. */
function scanRow(context: SheetContext, appId: number): number | null {
    return scanAppIds(context)[appId] ?? null;
}

/**
 * The row whose name links `appId`, through the cached index when there is one.
 *
 * A cached row is checked against its name formula before use, since rows inserted or
 * deleted by hand do not fire onEdit; a mismatch rescans. An app id missing from the
 * cache is taken as absent: rows are added by hand edits (which clear the cache) or by
 * `append` (which updates it).
 */
function findRow(context: SheetContext, appId: number): number | null {
    const cached = appIdIndexCache().get();
    if (cached === null) {
        return scanRow(context, appId);
    }
    const row = (JSON.parse(cached) as AppIdIndex)[appId];
    if (row === undefined) {
        return null;
    }
    const formula = context.sheet.getRange(row, context.nameColumn + 1).getFormula();
    return extractAppId(formula) === appId ? row : scanRow(context, appId);
}

function requireRow(context: SheetContext, appId: number): number {
    const row = findRow(context, appId);
    if (row === null) {
        throw new RequestError('not-found', `no row links app ${appId}`);
    }
    return row;
}

function parseAppId(value: unknown): number {
    const appId = Number(value);
    if (!Number.isSafeInteger(appId) || appId <= 0) {
        throw new RequestError('invalid', `bad app id ${String(value)}`);
    }
    return appId;
}

function parseRow(context: SheetContext, value: unknown): number {
    const row = Number(value);
    if (!Number.isSafeInteger(row) || row < firstDataRow || row > context.sheet.getLastRow()) {
        throw new RequestError('invalid', `bad row ${String(value)}`);
    }
    return row;
}

/** The app id the name of `row` links, read from that one cell; no index is needed. */
function rowAppId(context: SheetContext, row: number): number | null {
    return extractAppId(context.sheet.getRange(row, context.nameColumn + 1).getFormula());
}

/** For a write by row number: refuse a row that no longer links `appId`, e.g. after rows moved. */
function requireLinkedRow(context: SheetContext, rowValue: unknown, appId: number): number {
    const row = parseRow(context, rowValue);
    if (rowAppId(context, row) !== appId) {
        throw new RequestError('not-found', `row ${row} does not link app ${appId}`);
    }
    return row;
}

/** The requested columns of `row`, and a link that selects it. */
function readCells(context: SheetContext, row: number, names: readonly string[]): RowResponse & { url: string } {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const url = rowUrl(spreadsheet.getUrl(), context.sheet.getSheetId(), row);
    if (!names.length) {
        return { row, values: {}, url };
    }
    const cells = context.sheet.getRange(row, 1, 1, context.lastColumn).getValues()[0] as CellValue[];
    const timeZone = spreadsheet.getSpreadsheetTimeZone();
    const formatDate = (date: Date) => Utilities.formatDate(date, timeZone, 'yyyy/M/d');
    return { row, values: pickValues(context.columns, names, cells, formatDate), url };
}

/** A POST body as parsed, before any field is checked; see `SheetApiRequestBody`. */
type RequestBody = Record<string, unknown>;

function parseColumns(value: unknown): string[] {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value) || !value.every(name => typeof name === 'string')) {
        throw new RequestError('invalid', 'columns must be an array of header names');
    }
    return value.map(name => name.trim()).filter(Boolean);
}

/** A `RowRequest`: by `row` when given (`NumberedRowResponse`), else by `appId`. */
function readRow(request: RequestBody): RowResponse | NumberedRowResponse {
    const names = parseColumns(request.columns);
    const context = openSheet();
    if (request.row !== undefined) {
        const row = parseRow(context, request.row);
        const appId = rowAppId(context, row);
        if (appId === null) {
            throw new RequestError('not-found', `row ${row} links no app`);
        }
        return { ...readCells(context, row, names), appId };
    }
    const row = requireRow(context, parseAppId(request.appId));
    // Only finding the row (userscripts from before `find`): skip the extra reads.
    return names.length ? readCells(context, row, names) : { row, values: {} };
}

function readTagRules(): TagRuleCells {
    const cache = tagRulesCache();
    const cached = cache.get();
    if (cached !== null) {
        return JSON.parse(cached) as TagRuleCells;
    }
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets().find(each => each.getSheetId() === tagRulesWorksheetId);
    const cells = sheet ? sheet.getDataRange().getDisplayValues() : null;
    cache.put(JSON.stringify(cells));
    return cells;
}

/** A `FindRequest`: the tag rules come along only without a row, since only a new row uses them. */
function find(request: RequestBody): FindResponse {
    const appId = parseAppId(request.appId);
    const row = findRow(openSheet(), appId);
    return row === null ? { row, tagRules: readTagRules() } : { row };
}

function applyWrites(sheet: GoogleAppsScript.Spreadsheet.Sheet, row: number, writes: readonly CellWrite[]): void {
    for (const write of writes) {
        const cell = sheet.getRange(row, write.column + 1);
        if ('formulaR1C1' in write) {
            cell.setFormulaR1C1(write.formulaR1C1);
        } else {
            cell.setValue(write.value);
        }
    }
}

function parseWriteRequest(request: RequestBody): WriteRequest {
    const { action, values } = request;
    if ((action !== 'update' && action !== 'append') || typeof values !== 'object' || values === null) {
        throw new RequestError('invalid', 'body needs action and values');
    }
    return {
        action,
        appId: parseAppId(request.appId),
        values: values as WriteRequest['values'],
        ...(request.row === undefined ? {} : { row: request.row as number }),
    };
}

/** One write at a time, so `append` cannot add the same game twice. */
function writeRow(request: WriteRequest): WriteResponse {
    const lock = LockService.getScriptLock();
    lock.waitLock(20_000);
    try {
        const context = openSheet();
        const { sheet, lastColumn } = context;
        let row: number;
        if (request.action === 'update') {
            row = request.row === undefined
                ? requireRow(context, request.appId)
                : requireLinkedRow(context, request.row, request.appId);
            const rowFormulas = sheet.getRange(row, 1, 1, lastColumn).getFormulas()[0] ?? [];
            applyWrites(sheet, row, planUpdate(context.columns, request.values, rowFormulas));
        } else {
            // Never trust the cache here: a missed duplicate would add the game twice.
            const index = scanAppIds(context);
            const existing = index[request.appId];
            if (existing !== undefined) {
                throw new RequestError('duplicate', `row ${existing} already links app ${request.appId}`);
            }
            row = appendRow;
            // Validate before inserting, so a refused request leaves no blank row behind.
            const template = (sheet.getRange(row - 1, 1, 1, lastColumn).getFormulasR1C1()[0] ?? [])
                .map(formula => formula ?? '');
            const writes = planAppend(context.columns, request.values, template);
            sheet.insertRowAfter(row - 1);
            applyWrites(sheet, row, writes);
            appIdIndexCache().put(JSON.stringify({ ...shiftAppIds(index, row), [request.appId]: row }));
        }
        SpreadsheetApp.flush();
        // Script edits do not fire onEdit.
        dumpCache().invalidate();
        return { row };
    } finally {
        lock.releaseLock();
    }
}

function errorOutput(error: unknown): GoogleAppsScript.Content.TextOutput {
    const body: SheetApiErrorBody = error instanceof RequestError
        ? { error: error.code, message: error.message }
        : { error: 'internal', message: error instanceof Error ? error.message : String(error) };
    return jsonOutput(JSON.stringify(body));
}

function parseBody(contents: string | undefined): RequestBody {
    let body: unknown;
    try {
        body = JSON.parse(contents ?? '');
    } catch {
        throw new RequestError('invalid', 'body is not JSON');
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new RequestError('invalid', 'body is not a JSON object');
    }
    return body as RequestBody;
}

function checkToken(body: RequestBody): void {
    const expected = PropertiesService.getScriptProperties().getProperty(tokenProperty);
    if (!isAuthorized(body.token, expected)) {
        throw new RequestError('unauthorized', 'missing or wrong token');
    }
}

function readDump(): string {
    const cache = dumpCache();
    let text = cache.get();
    if (text === null) {
        text = readDumpText();
        cache.put(text);
    }
    return text;
}

/**
 * Refuses every GET: the token goes only in a POST body, so it never lands in a URL.
 * `invalid` rather than `unauthorized`, so a userscript from before the switch reports an
 * error instead of forgetting its saved token.
 */
export function doGet(): GoogleAppsScript.Content.TextOutput {
    return errorOutput(new RequestError('invalid', 'GET is no longer supported; update the userscript'));
}

/** Every request: a `SheetApiRequestBody` as JSON, dispatched on its `action`. */
export function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
    try {
        const body = parseBody(e.postData.contents);
        checkToken(body);
        switch (body.action) {
            case 'dump':
                return jsonOutput(readDump());
            case 'find':
                return jsonOutput(JSON.stringify(find(body)));
            case 'row':
                return jsonOutput(JSON.stringify(readRow(body)));
            case 'update':
            case 'append':
                return jsonOutput(JSON.stringify(writeRow(parseWriteRequest(body))));
            default:
                throw new RequestError('invalid', `unknown action ${String(body.action)}`);
        }
    } catch (error) {
        return errorOutput(error);
    }
}

function invalidateCaches(): void {
    dumpCache().invalidate();
    appIdIndexCache().invalidate();
    tagRulesCache().invalidate();
}

/**
 * Simple trigger: any hand edit may change the dump, the index and the tag rules; it fires for
 * every worksheet. Edits made by scripts do not fire it.
 */
export function onEdit(): void {
    invalidateCaches();
}

/**
 * Installable trigger (set it up once: editor → 觸發條件 → onChange, 試算表, 變更時): inserting,
 * deleting or sorting rows by hand moves rows without firing onEdit.
 */
export function onChange(): void {
    invalidateCaches();
}

/**
 * Sheet custom function kept from the original project: turns a row of the wishlist
 * into a row for the owned list.
 */
export function WantToOwned(records: unknown[][]): unknown[][] {
    const record = records[0] ?? [];
    return [[
        record[0], undefined, record[11], undefined, undefined, undefined, 'O',
        `${String(record[4])}，${String(record[12])}，${String(record[13])}`,
    ]];
}
