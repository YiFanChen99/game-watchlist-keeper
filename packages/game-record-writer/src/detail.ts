import type { ReleaseDate, StorePageInfo } from '@watchlist/steam-info-scraper';

import { todoPlaceholder } from './columns';
import { playtimePercentRank, type PlaytimeStats } from './playtime';

/**
 * Matches what `formatPlaytime` writes, and the older `中位<n>H，3rd.高<n>H。` it replaces, including
 * `NaN` values from the legacy scraper.
 */
const playtimePattern = /中位[^，。]*H，(?:3rd\.高|PR\d+ )[^。]*H。/;

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

/**
 * The detail cell of a new row (COLUMNS.md 備註): the game feature description, then the
 * added structure — `YY/MMEA。` for early access, then the playtime.
 *
 * The feature description has no rule yet, so it is `TODO。` for now.
 *
 * @returns e.g. `TODO。26/03EA。中位12H，PR84 30H。`
 */
export function buildDetail(page: StorePageInfo, playtime: PlaytimeStats): string {
    const features = `${todoPlaceholder}。`;
    const earlyAccess = page.isEarlyAccess ? `${formatEarlyAccessDate(page.releaseDate)}EA。` : '';
    return `${features}${earlyAccess}${formatPlaytime(playtime)}`;
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
 */
export function mergeDetail(oldDetail: string, playtime: PlaytimeStats): string {
    const fresh = formatPlaytime(playtime);
    return playtimePattern.test(oldDetail)
        ? oldDetail.replace(playtimePattern, fresh)
        : `${oldDetail}${oldDetail && !endsWithFullWidthSymbol.test(oldDetail) ? '。' : ''}${fresh}`;
}
