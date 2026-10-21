/**
 * Sheet header names. Writes locate columns by these names, never by letter,
 * because columns get added and moved by hand.
 */
export const Column = {
    /** `=HYPERLINK("<store url>","<name>")`; the name may pack aliases separated by `/`. */
    name: '名稱',
    /** TWD, base game before discount. */
    originalPrice: '原價',
    lowestOff: '最低off',
    releaseDate: '上市',
    /** Positive review percent: an integer 0–100. */
    reviewScore: '評價度',
    updatedOn: '更新日',
    /** Computed by a sheet formula from 原價 and 最低off; never write it. */
    lowestPrice: '最低$',
    /** 1–5, `?` for a game not rated yet, or an owned mark. */
    wantLevel: '購買/期待度1~5',
    /** Hand-kept; read only, for the owned mark (e.g. `已有`) the dump puts in place of the want level. */
    anyDeal: 'AnyDeal',
    /** The user's own filter tag categories, space-separated, from the tag rules (`matchTagRules`). */
    mode: '模式',
    /** Space-separated tags: the language mark, `Demo`, and any hand-written ones. */
    special: '特',
    /** `<features>。[<date>EA。]中位<n>H，PR84 <n>H。` plus any hand-written notes. */
    detail: '備註',
} as const;

export type ColumnName = (typeof Column)[keyof typeof Column];

export type CellValue = string | number;

/** Written to 模式 and 遊戲特點敘述 when no tag rule matched, for the user to fill in by hand. */
export const todoPlaceholder = 'TODO';

/** Some cells of one row, keyed by header name. */
export type SheetRowValues = Partial<Record<ColumnName, CellValue>>;

/**
 * Columns the web app lets an update write (COLUMNS.md: 覆蓋 / 整合). The name only on append:
 * it is how a row is found again. Formula and hand-kept columns are never written.
 */
export const updatableColumns: ReadonlySet<ColumnName> = new Set([
    Column.originalPrice,
    Column.lowestOff,
    Column.releaseDate,
    Column.reviewScore,
    Column.updatedOn,
    Column.wantLevel,
    Column.mode,
    Column.special,
    Column.detail,
]);
