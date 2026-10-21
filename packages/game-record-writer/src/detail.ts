import type { ReleaseDate, StorePageInfo } from '@watchlist/steam-info-scraper';

import { todoPlaceholder } from './columns';
import { playtimePercentRank, type PlaytimeStats } from './playtime';

/**
 * Matches what `formatPlaytime` writes, and the older `中位<n>H，3rd.高<n>H。` it replaces, including
 * `NaN` values from the legacy scraper and hand-written numbers missing their `H`, e.g. `中位13，3rd.高28H。`.
 */
const playtimePattern = /中位[^，。]*，(?:3rd\.高|PR\d+ )[^。]*。/;

/** Marks an early access part already in a detail cell, written by `buildDetail` or by hand. */
const earlyAccessMark = 'EA';

/** A trailing full-width symbol (CJK punctuation or a full-width ASCII symbol), e.g. `。`, `）`, `！`. */
const endsWithFullWidthSymbol = /[\u3000-\u303F\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65]$/;

/**
 * @returns e.g. `中位12H，PR84 30H。`; unknown numbers become `-`.
 */
export function formatPlaytime(stats: PlaytimeStats): string {
    return `中位${stats.medianHours ?? '-'}H，PR${playtimePercentRank} ${stats.percentRankHours ?? '-'}H。`;
}

/** `YY/MM`, e.g. `26/03`; Steam's text when it is not a full date. */
function formatEarlyAccessDate(releaseDate: ReleaseDate | null): string {
    if (!releaseDate?.date) {
        return releaseDate?.text ?? '';
    }
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(releaseDate.date.year % 100)}/${pad(releaseDate.date.month)}`;
}

/** @returns e.g. `26/03EA。` for early access, otherwise empty. */
function formatEarlyAccess(page: StorePageInfo): string {
    return page.isEarlyAccess ? `${formatEarlyAccessDate(page.releaseDate)}EA。` : '';
}

/**
 * The detail cell of a new row (COLUMNS.md 備註): the game feature description, then the
 * added structure — `YY/MMEA。` for early access, then the playtime.
 *
 * @param features The feature description's words, from the tag rules (`matchTagRules`);
 *   `TODO` without any.
 * @returns e.g. `俯視角 砍殺。26/03EA。中位12H，PR84 30H。` or `TODO。中位12H，PR84 30H。`
 */
export function buildDetail(page: StorePageInfo, playtime: PlaytimeStats, features: readonly string[] = []): string {
    const description = `${features.length > 0 ? features.join(' ') : todoPlaceholder}。`;
    return `${description}${formatEarlyAccess(page)}${formatPlaytime(playtime)}`;
}

/**
 * @returns The playtime part of a detail cell, e.g. `中位12H，PR84 30H。` or the older
 *   `中位12H，3rd.高85H。`; `null` when it has none.
 */
export function extractPlaytime(detail: string): string | null {
    return playtimePattern.exec(detail)?.[0] ?? null;
}

/**
 * Refresh only the playtime part of an existing detail cell and keep everything else.
 * Appends when there is no playtime part yet, after a `。` unless the old cell is empty or already
 * ends with a full-width symbol.
 * An early access game whose cell has no `EA` gets `YY/MMEA。` right before the playtime part;
 * an `EA` is never removed.
 */
export function mergeDetail(oldDetail: string, page: StorePageInfo, playtime: PlaytimeStats): string {
    const earlyAccess = oldDetail.includes(earlyAccessMark) ? '' : formatEarlyAccess(page);
    const fresh = `${earlyAccess}${formatPlaytime(playtime)}`;
    return playtimePattern.test(oldDetail)
        ? oldDetail.replace(playtimePattern, fresh)
        : `${oldDetail}${oldDetail && !endsWithFullWidthSymbol.test(oldDetail) ? '。' : ''}${fresh}`;
}
