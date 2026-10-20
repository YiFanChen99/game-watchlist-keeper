import { storePageUrl } from '@watchlist/core';
import type { SteamSnapshot } from '@watchlist/steam-info-scraper';

import { Column, todoPlaceholder, type CellValue, type SheetRowValues } from './columns';
import { planRefresh, unknownPricePlaceholder } from './refresh';

/** Written to the want level column of a new row: not rated yet. */
export const unratedWantLevel = '?';

/**
 * The name cell: `=HYPERLINK("<store url>","<name>")`, which is also where the sheet keeps the app id.
 */
export function buildNameFormula(appId: number, name: string): string {
    const quote = (text: string) => `"${text.replace(/"/g, '""')}"`;
    return `=HYPERLINK(${quote(storePageUrl(appId))},${quote(name)})`;
}

export interface NewRowInput {
    appId: number;
    snapshot: SteamSnapshot;
    /** From `planLowestOff` without an old row; `null` leaves the cell blank. */
    lowestOff: CellValue | null;
    today: Date;
}

/**
 * A column COLUMNS.md marks 必有 without a default had no value, so the row is not added.
 * The message is shown to the user.
 */
export class MissingValueError extends Error {
    constructor(readonly column: string) {
        super(`商店頁讀不到「${column}」，沒有新增。`);
        this.name = 'MissingValueError';
    }
}

/**
 * The cells of a row for a game the sheet does not have yet (COLUMNS.md 新增時).
 *
 * Steam-owned cells and the lowest discount follow `planRefresh` with a blank old row.
 * On top of that: the name HYPERLINK, `unknownPricePlaceholder` when the page has no price,
 * `?` as the want level, and `todoPlaceholder` as the mode until it has a rule.
 *
 * @throws MissingValueError Without a name or release date: both 必有 and have no default.
 */
export function planNewRow({ appId, snapshot, lowestOff, today }: NewRowInput): SheetRowValues {
    const { name, releaseDate } = snapshot.page;
    if (name === null) {
        throw new MissingValueError(Column.name);
    }
    if (releaseDate === null) {
        throw new MissingValueError(Column.releaseDate);
    }
    return {
        [Column.name]: buildNameFormula(appId, name),
        [Column.originalPrice]: unknownPricePlaceholder,
        ...planRefresh(snapshot, {}, today, { lowestOff }).updates,
        [Column.wantLevel]: unratedWantLevel,
        [Column.mode]: todoPlaceholder,
    };
}
