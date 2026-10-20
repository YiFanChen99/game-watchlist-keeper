import type { ItadPriceRecord, SteamDbPrices, StorePageInfo } from '@watchlist/steam-info-scraper';

import { Column, type CellValue, type SheetRowValues } from './columns';
import { delistedMark, markOutdated, unknownPricePlaceholder, unreliableScorePrefix } from './refresh';

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
    /** Some reason to doubt it; see COLUMNS.md 最低off. */
    isDoubtful: boolean;
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
        const price = Math.round(originalPrice);
        return {
            off: offOf(itadLowest.price, originalPrice),
            isDoubtful: (steamDbPrice !== null && steamDbPrice < itadLowest.price)
                // The price rose since the lowest one.
                || price > Math.round(itadLowest.regular)
                // ITAD may follow another package, e.g. an edition.
                || price !== Math.round(itadHistory[0]!.regular),
        };
    }
    // SteamDB alone: no original price of its time to check it against.
    return steamDbPrice === null ? null : { off: offOf(steamDbPrice, originalPrice), isDoubtful: true };
}

/** The old 最低off as a price: the old 原價 it was taken against, off by its number. */
function oldLowestPrice(oldRow: SheetRowValues): number | null {
    const oldPrice = Number(String(oldRow[Column.originalPrice] ?? '').trim() || NaN);
    const oldOff = /^!?(\d+)$/.exec(String(oldRow[Column.lowestOff] ?? '').trim())?.[1];
    if (!Number.isFinite(oldPrice) || oldPrice <= 0 || oldPrice === unknownPricePlaceholder || oldOff === undefined) {
        return null;
    }
    return oldPrice * (1 - Number(oldOff) / 100);
}

const formatFresh = ({ off, isDoubtful }: FreshLowestOff): CellValue => (isDoubtful ? `${unreliableScorePrefix}${off}` : off);

/**
 * The 最低off cell: the lowest discount off the current 原價, in percent (COLUMNS.md 最低off).
 *
 * @param oldRow The row's `refreshReadColumns`; `null` for a new row.
 * @returns `null` to leave the cell alone, or blank in a new row.
 */
export function planLowestOff(
    page: StorePageInfo,
    sources: LowestOffSources,
    oldRow: SheetRowValues | null,
    today: Date,
): CellValue | null {
    if (page.isDelisted) {
        return delistedMark;
    }
    const { originalPrice } = page;
    if (originalPrice === 0) {
        return freeLowestOff;
    }
    const fresh = originalPrice === null ? null : planFreshLowestOff(originalPrice, sources, today);
    if (oldRow === null) {
        return originalPrice === null ? null : fresh ? formatFresh(fresh) : defaultLowestOff;
    }
    if (originalPrice === null || fresh === null) {
        return markOutdated(oldRow[Column.lowestOff]);
    }

    const oldPrice = oldLowestPrice(oldRow);
    const oldOff = oldPrice === null ? null : offOf(oldPrice, originalPrice);
    if (oldOff === null || oldOff <= fresh.off) {
        return formatFresh(fresh);
    }
    // The old one is lower: keep it unless ITAD shows it is older than `keptLowestPriceMonths`.
    const { itadHistory } = sources;
    const keptLowest = itadHistory && lowestRecordSince(itadHistory, monthsBefore(today, keptLowestPriceMonths));
    const isDropped = !!itadHistory && !!keptLowest
        && coversMonths(itadHistory, keptLowestPriceMonths, page, today)
        && offOf(keptLowest.price, originalPrice) < oldOff;
    return isDropped ? formatFresh(fresh) : `${unreliableScorePrefix}${oldOff}`;
}
