import { extractAppId } from '@watchlist/core';
import { toDumpRow, type SheetDump, type SheetDumpRow } from '@watchlist/sheet-api';

/** What `Range.getValues()` puts in a cell. */
export type CellValue = string | number | boolean | Date;

export const worksheetName = 'STEAM';

/** The dump reads columns B through L; index 0 of a row is column B. */
export const firstColumn = 'B';
export const lastColumn = 'L';

/** Columns that go into the dump. */
const keptColumns = ['B', 'G', 'K'] as const;
/** AnyDeal: read only to spot the owned mark, then dropped. */
const ownedColumn = 'L';

function columnLetter(index: number): string {
    return String.fromCharCode(firstColumn.charCodeAt(0) + index);
}

function cellsByColumn(row: readonly CellValue[]): Record<string, CellValue> {
    const cells: Record<string, CellValue> = {};
    row.forEach((value, index) => {
        cells[columnLetter(index)] = value;
    });
    return cells;
}

/** Same text the original web app returned, which the annotator parses with `new Date()`. */
function toDateString(value: CellValue): string {
    if (value instanceof Date) {
        return value.toDateString();
    }
    if (!value) {
        return '';
    }
    return new Date(typeof value === 'number' ? value : String(value)).toLocaleDateString();
}

function toRow(cells: Record<string, CellValue>, nameFormula: string): SheetDumpRow | null {
    const updatedOn = cells.G ?? '';
    return toDumpRow({
        name: cells.B,
        updatedOn: updatedOn === '' ? '' : toDateString(updatedOn),
        want: cells.K,
        anyDeal: cells[ownedColumn],
        appId: extractAppId(nameFormula),
    });
}

/**
 * Turn the sheet's B:L values into the dump the annotator reads.
 *
 * Rows without a name, or whose want level is blank or 0, are skipped; see `toDumpRow`.
 *
 * @param header Row 1, B through L.
 * @param rows Rows 2 and below, B through L.
 * @param nameFormulas Column B's formulas, one per row of `rows`: a row gets the app id its
 *   name HYPERLINK links.
 */
export function buildDump(
    header: readonly CellValue[],
    rows: readonly (readonly CellValue[])[],
    nameFormulas: readonly string[] = [],
): SheetDump {
    const headerCells = cellsByColumn(header);
    const labelMap: Record<string, unknown> = {};
    for (const column of keptColumns) {
        labelMap[column] = headerCells[column];
    }

    const games: SheetDumpRow[] = [];
    rows.forEach((row, index) => {
        const game = toRow(cellsByColumn(row), nameFormulas[index] ?? '');
        if (game) {
            games.push(game);
        }
    });
    return { games, labelMap };
}
