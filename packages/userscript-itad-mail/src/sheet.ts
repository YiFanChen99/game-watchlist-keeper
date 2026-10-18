import { createNameMatcher } from '@watchlist/core';
import { Column } from '@watchlist/game-record-writer';
import type { SheetDumpRow } from '@watchlist/sheet-api';

import { withSheetApi } from './tampermonkey';

/** Header of the sheet's Ceiling column, a formula from AnyDeal, Regular and 原價; read only. */
const ceilingColumn = 'Ceiling';

/** Tampermonkey storage key of the cached dump. */
const dumpKey = 'sheetDump';

const dumpLifetimeMs = 24 * 60 * 60 * 1000; // 24 hours

interface CachedDump {
    games: SheetDumpRow[];
    /** Fetch timestamp, in ms. */
    time: number;
}

/** What the annotation shows of one sheet row. */
export interface GameInfo {
    /** 購買/期待度1~5 as the row has it; `''` when blank. */
    want: string;
    /** Ceiling as the row has it; null for a game without an app id, whose row cannot be read alone. */
    ceiling: string | null;
    /** Opens the sheet at the game's row; null without an app id, or from a web app version without it. */
    url: string | null;
}

/** The dump's games, cached for a day in Tampermonkey storage (not Gmail's localStorage). */
async function fetchGames(): Promise<SheetDumpRow[]> {
    const cached = GM_getValue<CachedDump | null>(dumpKey, null);
    if (cached && Date.now() - cached.time <= dumpLifetimeMs) {
        return cached.games;
    }
    console.log('ITAD Mail Annotator: fetching the sheet ...');
    const { games } = await withSheetApi(api => api.fetchDump());
    GM_setValue(dumpKey, { games, time: Date.now() } satisfies CachedDump);
    return games;
}

const cellText = (value: string | number | undefined) => String(value ?? '').trim();

/**
 * Looks up ITAD game names in the sheet. The dump is fetched once, on the first lookup, and each
 * row's cells once per page load: the dump has no Ceiling, so a matched game's row is read by app id.
 */
export class SheetLookup {
    private matcher: Promise<(rawName: string) => SheetDumpRow[]> | null = null;
    private readonly rows = new Map<number, Promise<GameInfo>>();

    /**
     * Matches `name` like the SteamGifts annotator: normalized, `/`-separated aliases, a trailing
     * `xxx Edition` dropped; exact matches win, otherwise every partial match. The dump leaves out
     * rows whose 購買/期待度 is blank or 0, so those never match.
     */
    async match(name: string): Promise<SheetDumpRow[]> {
        this.matcher ??= fetchGames()
            .then(games => createNameMatcher(games, game => game.B))
            .catch((error: unknown) => {
                // Let the next lookup try again, e.g. after the token prompt was cancelled.
                this.matcher = null;
                throw error;
            });
        return (await this.matcher)(name);
    }

    /** The row's 購買/期待度, Ceiling and link; a game without an app id gets the dump's want level only. */
    info(game: SheetDumpRow): Promise<GameInfo> {
        const { appId } = game;
        if (appId === undefined) {
            return Promise.resolve({ want: cellText(game.K), ceiling: null, url: null });
        }
        let row = this.rows.get(appId);
        if (!row) {
            row = withSheetApi(api => api.readRow(appId, [Column.wantLevel, ceilingColumn]))
                .then(({ values, url }) => ({
                    want: cellText(values[Column.wantLevel]),
                    ceiling: cellText(values[ceilingColumn]),
                    url: url ?? null,
                }));
            row.catch(() => this.rows.delete(appId));
            this.rows.set(appId, row);
        }
        return row;
    }
}
