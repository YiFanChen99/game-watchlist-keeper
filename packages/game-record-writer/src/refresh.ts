import type { AppReviewsInfo, ReleaseDate, SteamSnapshot } from '@watchlist/steam-info-scraper';

import { Column, type CellValue, type ColumnName, type SheetRowValues } from './columns';
import { formatReleaseDate, formatSheetDate, parseSheetDate } from './date';
import { buildDetail, extractPlaytime, mergeDetail } from './detail';
import { computePlaytimeStats } from './playtime';
import { mergeSpecial } from './special';

/** A value the refresh changed, worth showing to the user. */
export interface ValueChange {
    column: ColumnName;
    /** 備註: only the playtime part; `null` when the old cell had none. */
    oldValue: CellValue | null;
    /** 備註: only the playtime part. */
    newValue: CellValue;
    /**
     * Price: new − old, in TWD. Release date: new − old, in days.
     * `null` when the old value is not a number / full date, e.g. `2026 年第四季`.
     */
    delta: number | null;
}

/**
 * The line a userscript shows for one change.
 *
 * @returns e.g. `原價 459 → 499（+40）`, `上市 2026/2/26 → 2026/3/5（+7 天）` or
 *   `備註 中位1H，3rd.高2H。 → 中位33H，3rd.高145H。`.
 */
export function formatChange({ column, oldValue, newValue, delta }: ValueChange): string {
    const unit = column === Column.releaseDate ? ' 天' : '';
    const signed = delta === null ? '' : `（${delta > 0 ? '+' : ''}${delta}${unit}）`;
    return `${column} ${oldValue ?? '（無）'} → ${newValue}${signed}`;
}

export interface RefreshPlan {
    /** Only the cells to write. */
    updates: SheetRowValues;
    /** Changed price, release date, special and detail playtime. Filling a blank cell is not a change. */
    changes: ValueChange[];
}

/** Old-row columns `planRefresh` reads. */
export const refreshReadColumns: readonly ColumnName[] = [
    Column.originalPrice,
    Column.lowestOff,
    Column.releaseDate,
    Column.reviewScore,
    Column.special,
    Column.detail,
];

/**
 * 原價 of a new row whose store page has no price yet, e.g. not released (the legacy scraper's value).
 * A refresh replaces it without reporting a change.
 */
export const unknownPricePlaceholder = 10000;

/** 原價 and 最低off of a game the store page says is no longer sold on Steam. */
export const delistedMark = '-';

export interface RefreshOptions {
    /**
     * From `planLowestOff`, where the SteamDB block can be read (the Steam store page).
     * `null` or absent keeps the old 最低off, marked outdated (`markOutdated`).
     */
    lowestOff?: number | null;
}

const msPerDay = 24 * 60 * 60 * 1000;

/**
 * 評價度: the store page's 「所有評論」 percent, 0–100 rounded down as Steam shows it
 * (97.99% is 97); `null` without reviews.
 */
export function reviewScore({ totalPositive, totalReviews }: AppReviewsInfo): number | null {
    return totalReviews > 0 ? Math.floor((totalPositive / totalReviews) * 100) : null;
}

/** Prefixed to a 評價度 backed by too few reviews, and to a 評價度 or 最低off a refresh could not replace. */
export const unreliableScorePrefix = '!';

/**
 * A cell this refresh has no new value for: an old plain number gets `unreliableScorePrefix`,
 * so it shows as outdated.
 *
 * @returns `null` to leave the cell alone: it is blank, already marked, or other text.
 */
function markOutdated(oldValue: CellValue | undefined): string | null {
    const old = String(oldValue ?? '').trim();
    return /^\d+$/.test(old) ? `${unreliableScorePrefix}${old}` : null;
}

/** Fewer reviews than this mark 評價度 unreliable; `minReviewsAfterAYear` once the game is a year old. */
const minReviews = 50;
const minReviewsAfterAYear = 100;

function isAYearOld(releaseDate: ReleaseDate | null, today: Date): boolean {
    const date = releaseDate?.date;
    return !!date && new Date(date.year + 1, date.month - 1, date.day) <= today;
}

/**
 * The 評價度 cell (COLUMNS.md 評價度): `reviewScore`, prefixed with `unreliableScorePrefix`
 * when too few reviews back it. Without reviews, an old plain number gets the prefix.
 *
 * @returns `null` to leave the cell alone.
 */
function planReviewScore(
    reviews: AppReviewsInfo,
    releaseDate: ReleaseDate | null,
    oldValue: CellValue | undefined,
    today: Date,
): CellValue | null {
    const score = reviewScore(reviews);
    if (score === null) {
        return markOutdated(oldValue);
    }
    const required = isAYearOld(releaseDate, today) ? minReviewsAfterAYear : minReviews;
    return reviews.totalReviews < required ? `${unreliableScorePrefix}${score}` : score;
}

function isBlank(value: CellValue | undefined): value is undefined {
    return value === undefined || String(value).trim() === '';
}

function priceChange(oldValue: CellValue | undefined, newValue: number): ValueChange | null {
    if (isBlank(oldValue)) {
        return null;
    }
    const digits = String(oldValue).replace(/[^\d.]/g, '');
    const oldPrice = digits ? Number(digits) : NaN;
    if (oldPrice === newValue || oldPrice === unknownPricePlaceholder) {
        return null;
    }
    const delta = Number.isFinite(oldPrice) ? Math.round((newValue - oldPrice) * 100) / 100 : null;
    return { column: Column.originalPrice, oldValue, newValue, delta };
}

function releaseDateChange(oldValue: CellValue | undefined, newValue: string): ValueChange | null {
    if (isBlank(oldValue)) {
        return null;
    }
    const oldDate = parseSheetDate(oldValue);
    const newDate = parseSheetDate(newValue);
    if (oldDate && newDate) {
        const delta = Math.round((newDate.getTime() - oldDate.getTime()) / msPerDay);
        return delta === 0 ? null : { column: Column.releaseDate, oldValue, newValue, delta };
    }
    return String(oldValue).trim() === newValue ? null : { column: Column.releaseDate, oldValue, newValue, delta: null };
}

/** 特 when it differs from its old, non-blank value. */
function specialChange(oldValue: CellValue | undefined, newValue: string): ValueChange | null {
    if (isBlank(oldValue) || String(oldValue).trim() === newValue) {
        return null;
    }
    return { column: Column.special, oldValue, newValue, delta: null };
}

/** 備註's playtime part when it differs from the old, non-blank cell's; the rest is never changed. */
function detailChange(oldValue: CellValue | undefined, newValue: string): ValueChange | null {
    if (isBlank(oldValue)) {
        return null;
    }
    const oldPlaytime = extractPlaytime(String(oldValue));
    const newPlaytime = extractPlaytime(newValue);
    if (newPlaytime === null || oldPlaytime === newPlaytime) {
        return null;
    }
    return { column: Column.detail, oldValue: oldPlaytime, newValue: newPlaytime, delta: null };
}

/** 原價 becoming `delistedMark`, against an old value that was a real price. */
function delistedChange(oldValue: CellValue | undefined): ValueChange | null {
    const old = String(oldValue ?? '').trim();
    if (old === '' || old === delistedMark || Number(old) === unknownPricePlaceholder) {
        return null;
    }
    return { column: Column.originalPrice, oldValue: oldValue ?? null, newValue: delistedMark, delta: null };
}

/** 原價 is a whole number of TWD. */
export function formatPrice(price: number): number {
    return Math.round(price);
}

/**
 * Decide which cells of an existing row to write after fetching fresh Steam data.
 * The rules are listed in COLUMNS.md.
 *
 * - A game no longer sold on Steam gets `delistedMark` as its price and lowest discount, and
 *   the price change is reported.
 * - Price (rounded), release date and review score are replaced when Steam has them, and
 *   left alone when it does not (e.g. no price before release). Price and date changes are
 *   reported, except replacing `unknownPricePlaceholder`.
 * - The review score gets `unreliableScorePrefix` when too few reviews back it, and an old
 *   number gets it when Steam has no reviews; see `planReviewScore`.
 * - The lowest discount is written when `options.lowestOff` has one; otherwise an old number
 *   gets `unreliableScorePrefix`, as it may be outdated; see `markOutdated`.
 * - The update date becomes `today`.
 * - The special cell gets its language mark and `Demo` tag refreshed; see `mergeSpecial`.
 * - The detail cell only gets its playtime part replaced; see `mergeDetail`.
 * - Changes to the special cell and the detail cell's playtime part are reported too.
 * - Name, want level and mode are never touched.
 *
 * @param oldRow The row's current values for `refreshReadColumns`.
 */
export function planRefresh(
    snapshot: SteamSnapshot,
    oldRow: SheetRowValues,
    today: Date,
    options: RefreshOptions = {},
): RefreshPlan {
    const { page, reviews } = snapshot;
    const playtime = computePlaytimeStats(reviews.playtimeMinutes);
    const updates: SheetRowValues = {};
    const changes: ValueChange[] = [];

    if (page.isDelisted) {
        updates[Column.originalPrice] = delistedMark;
        const change = delistedChange(oldRow[Column.originalPrice]);
        if (change) changes.push(change);
    } else if (page.originalPrice !== null) {
        const price = formatPrice(page.originalPrice);
        updates[Column.originalPrice] = price;
        const change = priceChange(oldRow[Column.originalPrice], price);
        if (change) changes.push(change);
    }
    const lowestOff = page.isDelisted ? delistedMark : options.lowestOff ?? markOutdated(oldRow[Column.lowestOff]);
    if (lowestOff !== null) {
        updates[Column.lowestOff] = lowestOff;
    }
    if (page.releaseDate !== null) {
        const releaseDate = formatReleaseDate(page.releaseDate);
        updates[Column.releaseDate] = releaseDate;
        const change = releaseDateChange(oldRow[Column.releaseDate], releaseDate);
        if (change) changes.push(change);
    }
    const score = planReviewScore(reviews, page.releaseDate, oldRow[Column.reviewScore], today);
    if (score !== null) {
        updates[Column.reviewScore] = score;
    }
    updates[Column.updatedOn] = formatSheetDate(today);

    const oldSpecial = oldRow[Column.special];
    const special = mergeSpecial(String(oldSpecial ?? ''), page);
    updates[Column.special] = special;

    const oldDetail = oldRow[Column.detail];
    const detail = isBlank(oldDetail)
        ? buildDetail(page, playtime)
        : mergeDetail(String(oldDetail).trim(), playtime);
    updates[Column.detail] = detail;

    for (const change of [specialChange(oldSpecial, special), detailChange(oldDetail, detail)]) {
        if (change) changes.push(change);
    }
    return { updates, changes };
}
