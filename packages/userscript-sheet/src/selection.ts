/**
 * @param reference The name box's text at the sheet's top left, e.g. `B123`, `A5:K5` or `5:5`.
 * @returns The one row it covers; null for several rows, whole columns or a named range.
 */
export function parseSelectedRow(reference: string): number | null {
    const match = /^\$?[A-Z]*\$?(\d+)(?::\$?[A-Z]*\$?(\d+))?$/i.exec(reference.trim());
    if (!match) {
        return null;
    }
    const first = Number(match[1]);
    const last = match[2] === undefined ? first : Number(match[2]);
    return first === last ? first : null;
}

/** Which spreadsheet, and which of its worksheets, a Sheets URL shows. */
export interface SheetLocation {
    spreadsheetId: string;
    /** The worksheet's id; null when the URL does not say. */
    gid: string | null;
}

/** @returns null for a URL that is not a spreadsheet. */
export function parseSheetLocation(url: string): SheetLocation | null {
    const spreadsheetId = /\/spreadsheets\/d\/([\w-]+)/.exec(url)?.[1];
    if (!spreadsheetId) {
        return null;
    }
    return { spreadsheetId, gid: /[#?&]gid=(\d+)/.exec(url)?.[1] ?? null };
}

/**
 * The game list's worksheet. A gid only numbers the tabs within one spreadsheet, so it names
 * nothing on its own; the spreadsheet itself stays out of this public repo and is learnt instead.
 */
export const watchlistSheetGid = '1386365003';

/**
 * @param knownSpreadsheetId The spreadsheet a refresh succeeded on; `''` before the first one.
 * @returns Whether the refresh button belongs on `page`: the game list's worksheet of that
 *   spreadsheet, or of any spreadsheet until one is known.
 */
export function showsRefreshButton(page: SheetLocation | null, knownSpreadsheetId: string): boolean {
    return page?.gid === watchlistSheetGid && (!knownSpreadsheetId || knownSpreadsheetId === page.spreadsheetId);
}
