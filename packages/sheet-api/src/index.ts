import type { FetchText, PostText } from '@watchlist/core';

/** Cells of one row, keyed by header name. The rules for which cells to send live in game-record-writer. */
export type RowValues = Record<string, string | number>;

/**
 * One row of the whole-sheet dump, keyed by column letter to keep the payload small.
 */
export interface SheetDumpRow {
    /** Game name. May pack several aliases separated by `/`. */
    B: string;
    /** Update date, parseable by `new Date()`. Empty or absent when never updated. */
    G?: string;
    /** How much the game is wanted, or the owned mark taken from the AnyDeal column. */
    K: string | number;
    /** The Steam app id the name HYPERLINK links; absent when the name has none. */
    appId?: number;
}

/** A cell a dump row is built from, as the sheet holds it. */
export type DumpSourceCell = string | number | boolean | Date;

/** The cells of one sheet row that a dump row is built from. */
export interface DumpSourceRow {
    name: DumpSourceCell | undefined;
    /** The update date already as `SheetDumpRow.G` text; `''` when never updated. */
    updatedOn: string;
    want: DumpSourceCell | undefined;
    anyDeal: DumpSourceCell | undefined;
    appId: number | null;
}

const ownedMark = /[^\d]*已有[^\d]*/;

/**
 * One sheet row as the dump has it. Shared by the web app's dump and a client reading a single
 * row, so both apply the same rules: an owned mark (e.g. `已有`) in AnyDeal replaces the want level.
 *
 * @returns null for a row without a name, or whose want level is blank or 0.
 */
export function toDumpRow({ name = '', updatedOn, want = '', anyDeal = '', appId }: DumpSourceRow): SheetDumpRow | null {
    // `Number()` keeps the original `== 0` check: 0, '0' and blank-ish strings all skip.
    if (name === '' || want === '' || Number(want) === 0) {
        return null;
    }
    const owned = ownedMark.exec(String(anyDeal))?.[0];
    return {
        B: String(name),
        G: updatedOn,
        K: owned ?? (typeof want === 'number' ? want : String(want)),
        ...(appId === null ? {} : { appId }),
    };
}

export interface SheetDump {
    games: SheetDumpRow[];
    /** Header names of the returned columns, keyed by column letter. */
    labelMap: Record<string, unknown>;
}

/** `/exec` URL of the token-guarded deployment (「token API」) the userscripts call. */
export const deployedWebAppUrl = 'https://script.google.com/macros/s/AKfycbyLkj1F4DL_h8QTn1-jXGPJpVBoo0w5M5nwhuzzlmquqRFvkr6w69nD63Otl6pmOIZS/exec';

/** Query parameter that carries the shared token, on GET and POST alike. */
export const tokenParam = 'token';

/**
 * GET `?action=row&appId=<id>&columns=<name>,<name>`: the row whose name HYPERLINK links `appId`.
 * `?action=row&row=<n>&columns=…` instead: sheet row `n`, with the app id its name links.
 * Without `action`, GET returns the whole-sheet dump.
 */
export const rowAction = 'row';

/** Response of the `row` action. */
export interface RowResponse {
    /** 1-based sheet row. */
    row: number;
    /** The requested columns, keyed by header name. Dates come as `YYYY/M/D`. */
    values: RowValues;
    /** Opens the sheet with this row selected. Absent from web app versions before it was added. */
    url?: string;
}

/** Response of the `row` action by row number. */
export interface NumberedRowResponse extends RowResponse {
    /** The app id the row's name HYPERLINK links. */
    appId: number;
    url: string;
}

/** POST body: write cells of the row with `appId`, or add a row for it. */
export interface WriteRequest {
    action: 'update' | 'append';
    appId: number;
    /**
     * `update` only: write this 1-based row instead of looking `appId` up, refused unless the
     * row's name still links `appId`.
     */
    row?: number;
    /** Keyed by header name; the web app refuses columns it does not allow writing. */
    values: RowValues;
}

/** Response of a POST. */
export interface WriteResponse {
    /** 1-based sheet row that was written. */
    row: number;
}

/**
 * - `unauthorized`: the token is missing or wrong.
 * - `not-found`: no row has the app id.
 * - `duplicate`: `append` for an app id the sheet already has.
 * - `invalid`: a malformed request, or a column that may not be written.
 * - `internal`: the web app failed; `message` has the exception.
 */
export type SheetApiErrorCode = 'unauthorized' | 'not-found' | 'duplicate' | 'invalid' | 'internal';

/** Body the web app returns, with status 200, when it refuses a request. */
export interface SheetApiErrorBody {
    error: SheetApiErrorCode;
    message?: string;
}

/** The web app refused the request; `code` says why. */
export class SheetApiError extends Error {
    constructor(readonly code: SheetApiErrorCode, message?: string) {
        super(message ? `Sheet API: ${code}: ${message}` : `Sheet API: ${code}`);
        this.name = 'SheetApiError';
    }
}

/** The token was missing or wrong; ask the user for it again. */
export class SheetApiUnauthorizedError extends SheetApiError {
    constructor() {
        super('unauthorized');
        this.name = 'SheetApiUnauthorizedError';
    }
}

export interface SheetApiOptions {
    /** The web app's `/exec` URL. */
    webAppUrl: string;
    /** Shared secret stored in the web app's script properties. */
    token: string;
    /** Must follow redirects: Apps Script redirects `/exec` to `script.googleusercontent.com`. */
    fetchText: FetchText;
    /** Needed only by the write methods. Must follow redirects, as `fetchText`. */
    postText?: PostText;
}

export interface SheetApi {
    /** The whole sheet, as the web app dumps it. */
    fetchDump(): Promise<SheetDump>;
    /** Rejects with code `not-found` when no row has `appId`. */
    readRow(appId: number, columns: readonly string[]): Promise<RowResponse>;
    /**
     * Read sheet row `row` (1-based), for a caller that knows the row but not its app id.
     * Rejects with code `not-found` when its name links no app.
     */
    readRowByNumber(row: number, columns: readonly string[]): Promise<NumberedRowResponse>;
    /** @returns The row with `appId`, or null. */
    findRow(appId: number): Promise<number | null>;
    /** Write only the given cells of the row with `appId`. */
    updateRow(appId: number, values: RowValues): Promise<WriteResponse>;
    /**
     * Write only the given cells of sheet row `row`, without looking `appId` up. Rejects with code
     * `not-found` when the row's name no longer links `appId`, e.g. after rows moved.
     */
    updateRowByNumber(row: number, appId: number, values: RowValues): Promise<WriteResponse>;
    /** Add a row for `appId`; rejects with code `duplicate` when the sheet already has one. */
    appendRow(appId: number, values: RowValues): Promise<WriteResponse>;
}

function parseResponse<T>(body: string): T {
    const data = JSON.parse(body) as Partial<SheetApiErrorBody>;
    if (data.error === 'unauthorized') {
        throw new SheetApiUnauthorizedError();
    }
    if (data.error) {
        throw new SheetApiError(data.error, data.message);
    }
    return data as T;
}

export function createSheetApi({ webAppUrl, token, fetchText, postText }: SheetApiOptions): SheetApi {
    const baseUrl = `${webAppUrl}?${tokenParam}=${encodeURIComponent(token)}`;

    async function write(request: WriteRequest): Promise<WriteResponse> {
        if (!postText) {
            throw new Error('Sheet API: writing needs postText');
        }
        return parseResponse<WriteResponse>(await postText(baseUrl, JSON.stringify(request)));
    }

    const api: SheetApi = {
        async fetchDump() {
            const data = parseResponse<Partial<SheetDump>>(await fetchText(baseUrl));
            if (!Array.isArray(data.games)) {
                throw new Error('Sheet dump has no games array');
            }
            return { games: data.games, labelMap: data.labelMap ?? {} };
        },

        async readRow(appId, columns) {
            const query = `&action=${rowAction}&appId=${appId}&columns=${encodeURIComponent(columns.join(','))}`;
            return parseResponse<RowResponse>(await fetchText(`${baseUrl}${query}`));
        },

        async readRowByNumber(row, columns) {
            const query = `&action=${rowAction}&row=${row}&columns=${encodeURIComponent(columns.join(','))}`;
            return parseResponse<NumberedRowResponse>(await fetchText(`${baseUrl}${query}`));
        },

        async findRow(appId) {
            try {
                return (await api.readRow(appId, [])).row;
            } catch (error) {
                if (error instanceof SheetApiError && error.code === 'not-found') {
                    return null;
                }
                throw error;
            }
        },

        updateRow: (appId, values) => write({ action: 'update', appId, values }),
        updateRowByNumber: (row, appId, values) => write({ action: 'update', appId, values, row }),
        appendRow: (appId, values) => write({ action: 'append', appId, values }),
    };
    return api;
}
