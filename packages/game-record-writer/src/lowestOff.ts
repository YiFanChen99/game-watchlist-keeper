import type { ItadPriceRecord, SteamDbPrices, StorePageInfo } from '@watchlist/steam-info-scraper';

import { Column, type CellValue, type SheetRowValues } from './columns';
import { delistedMark, formatPrice, markOutdated, unknownPricePlaceholder, unreliableScorePrefix } from './refresh';

/** 最低off of a new row without any lowest price to go by. */
export const defaultLowestOff = 0;

/** 最低off of a free game. */
const freeLowestOff = 100;

/** The lowest price 最低off takes from ITAD: the lowest within this many months. */
export const recentLowestPriceMonths = 30;

/**
 * An old 最低off lower than every price of this many months is dropped, once ITAD's records
 * cover that long (`coversMonths`).
 */
export const keptLowestPriceMonths = 60;

/** ITAD knows a game's whole history when its first record is at most this many days after release. */
const releaseRecordedWithinDays = 30;

/** Where 最低off can take a lowest price from. */
export interface LowestOffSources {
    /**
     * `fetchItadPriceHistory`, newest first; `null` without an answer from ITAD (no API key, a
     * failed request, or an app ITAD does not know).
     */
    itadHistory: readonly ItadPriceRecord[] | null;
    /** `readSteamDbPrices`: the SteamDB block; `null` when the page has none. */
    steamDb: SteamDbPrices | null;
}

export const noLowestOffSources: LowestOffSources = { itadHistory: null, steamDb: null };

/** A 最低off from the sources, before comparing with the old cell. */
interface FreshLowestOff {
    off: number;
    /** The lowest price `off` comes from. */
    lowestPrice: number;
    /** Some reason to doubt it; see COLUMNS.md 最低off. */
    isDoubtful: boolean;
    /** Why it is doubtful, for the user; empty for the SteamDB block alone, which `formatLowestOffNotes` tells of. */
    doubts: string[];
}

function monthsBefore(today: Date, months: number): Date {
    return new Date(today.getFullYear(), today.getMonth() - months, today.getDate());
}

/** `round((1 - lowestPrice / originalPrice) × 100)`, at least 0. */
function offOf(lowestPrice: number, originalPrice: number): number {
    return Math.max(0, Math.round((1 - lowestPrice / originalPrice) * 100));
}

/**
 * The lowest price in effect at any time since `since`: the records since then, and the one in
 * effect when it began. The newest of equal prices.
 *
 * @param history Newest first.
 */
function lowestRecordSince(history: readonly ItadPriceRecord[], since: Date): ItadPriceRecord | null {
    const inEffectAtStart = history.findIndex(record => record.time <= since);
    const records = inEffectAtStart === -1 ? history : history.slice(0, inEffectAtStart + 1);
    return records.reduce<ItadPriceRecord | null>((lowest, record) => (lowest === null || record.price < lowest.price ? record : lowest), null);
}

/** ITAD's records reach `months` back, or back to release: before that, the game had no price. */
function coversMonths(history: readonly ItadPriceRecord[], months: number, page: StorePageInfo, today: Date): boolean {
    const first = history.at(-1);
    if (!first) {
        return false;
    }
    const release = page.releaseDate?.date;
    const recordedAfterRelease = release
        ? first.time <= new Date(release.year, release.month - 1, release.day + releaseRecordedWithinDays)
        : false;
    return first.time <= monthsBefore(today, months) || recordedAfterRelease;
}

function planFreshLowestOff(originalPrice: number, { itadHistory, steamDb }: LowestOffSources, today: Date): FreshLowestOff | null {
    const steamDbPrice = steamDb?.lowestPrice ?? null;
    const itadLowest = itadHistory && lowestRecordSince(itadHistory, monthsBefore(today, recentLowestPriceMonths));
    if (itadHistory && itadLowest) {
        const price = formatPrice(originalPrice);
        const lowest = formatPrice(itadLowest.price);
        const regularThen = formatPrice(itadLowest.regular);
        const regularNow = formatPrice(itadHistory[0]!.regular);
        const doubts: string[] = [];
        if (steamDbPrice !== null && steamDbPrice < itadLowest.price) {
            doubts.push(`SteamDB 區塊的最低價 ${formatPrice(steamDbPrice)} 比 ITAD 近 2.5 年的 ${lowest} 低`);
        }
        // The price rose since the lowest one.
        if (price > regularThen) {
            doubts.push(`ITAD 的最低價 ${lowest} 是原價 ${regularThen} 時的價格，之後漲到 ${price}`);
        }
        // ITAD may follow another package, e.g. an edition.
        if (price !== regularNow) {
            doubts.push(`ITAD 現在的原價是 ${regularNow}，不是商店頁的 ${price}，可能追蹤別的方案`);
        }
        return { off: offOf(itadLowest.price, originalPrice), lowestPrice: itadLowest.price, isDoubtful: doubts.length > 0, doubts };
    }
    // SteamDB alone: no original price of its time to check it against.
    return steamDbPrice === null
        ? null
        : { off: offOf(steamDbPrice, originalPrice), lowestPrice: steamDbPrice, isDoubtful: true, doubts: [] };
}

/** The lowest price an old 最低off stands for. */
interface OldLowestPrice {
    /** The old 原價 it was taken against, off by its number. */
    price: number;
    /**
     * The highest price that rounds to its number: the number is a whole percent, so the price
     * it was taken from may be up to half a percent of the old 原價 higher than `price`.
     */
    highest: number;
    /** The old 原價. */
    originalPrice: number;
    /** The old 最低off's number. */
    off: number;
}

function oldLowestPrice(oldRow: SheetRowValues): OldLowestPrice | null {
    const oldPrice = Number(String(oldRow[Column.originalPrice] ?? '').trim() || NaN);
    const oldOff = /^!?(\d+)$/.exec(String(oldRow[Column.lowestOff] ?? '').trim())?.[1];
    if (!Number.isFinite(oldPrice) || oldPrice <= 0 || oldPrice === unknownPricePlaceholder || oldOff === undefined) {
        return null;
    }
    const off = Number(oldOff);
    return { price: oldPrice * (1 - off / 100), highest: oldPrice * (1 - (off - 0.5) / 100), originalPrice: oldPrice, off };
}

/** The 最低off cell, and why it has `!`. */
export interface LowestOffPlan {
    /** `null` to leave the cell alone, or blank in a new row. */
    cell: CellValue | null;
    /**
     * Why `cell` has `!`, for the user, e.g. `SteamDB 區塊的最低價 35 比 ITAD 近 2.5 年的 41 低`.
     * Empty without `!`, and when ITAD gave nothing, which `formatLowestOffNotes` tells of.
     */
    doubts: string[];
}

const plainPlan = (cell: CellValue | null): LowestOffPlan => ({ cell, doubts: [] });

const freshPlan = ({ off, isDoubtful, doubts }: FreshLowestOff): LowestOffPlan =>
    ({ cell: isDoubtful ? `${unreliableScorePrefix}${off}` : off, doubts });

/**
 * The 最低off cell: the lowest discount off the current 原價, in percent (COLUMNS.md 最低off).
 *
 * @param oldRow The row's `refreshReadColumns`; `null` for a new row.
 */
export function planLowestOff(
    page: StorePageInfo,
    sources: LowestOffSources,
    oldRow: SheetRowValues | null,
    today: Date,
): LowestOffPlan {
    if (page.isDelisted) {
        return plainPlan(delistedMark);
    }
    const { originalPrice } = page;
    if (originalPrice === 0) {
        return plainPlan(freeLowestOff);
    }
    const fresh = originalPrice === null ? null : planFreshLowestOff(originalPrice, sources, today);
    if (oldRow === null) {
        return originalPrice === null ? plainPlan(null) : fresh ? freshPlan(fresh) : plainPlan(defaultLowestOff);
    }
    if (originalPrice === null || fresh === null) {
        return plainPlan(markOutdated(oldRow[Column.lowestOff]));
    }

    // Lower only beyond rounding: 63% off 799 stands for 291.6–299.6, the same lowest price as 299.
    const old = oldLowestPrice(oldRow);
    if (old === null || old.highest >= fresh.lowestPrice) {
        return freshPlan(fresh);
    }
    // The old one is lower: keep it unless ITAD shows it is older than `keptLowestPriceMonths`.
    const { itadHistory } = sources;
    const keptLowest = itadHistory && lowestRecordSince(itadHistory, monthsBefore(today, keptLowestPriceMonths));
    const isCovered = !!itadHistory && coversMonths(itadHistory, keptLowestPriceMonths, page, today);
    if (isCovered && keptLowest && keptLowest.price > old.highest) {
        return freshPlan(fresh);
    }
    const why = !itadHistory?.length
        ? '沒有 ITAD 的紀錄可以排除它'
        : isCovered && keptLowest
            ? `ITAD 5 年內有到 ${formatPrice(keptLowest.price)}`
            : 'ITAD 的紀錄不到 5 年，無法排除它';
    const oldOne = `舊值 ${old.off}（原價 ${formatPrice(old.originalPrice)} 時約 ${formatPrice(old.price)}）`;
    return {
        cell: `${unreliableScorePrefix}${offOf(old.price, originalPrice)}`,
        doubts: [`保留${oldOne}，比新的最低價 ${formatPrice(fresh.lowestPrice)} 低，${why}`],
    };
}
