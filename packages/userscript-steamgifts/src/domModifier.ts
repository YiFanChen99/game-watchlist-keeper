import { createNameMatcher } from '@watchlist/core';

import { PriceButton } from './priceButton';
import { findAppId, RefreshButton, type OnRefreshed } from './refreshButton';
import { ResyncButton } from './resyncButton';
import type { SheetData, SheetGame } from './types';

/**
 * Format data from Google Sheet to display text.
 */
class HeaderDisplayFormatter {
    static currentYear = new Date().getFullYear();

    static toWant(games: SheetGame[]): string {
        const want = games.map(game => (game.K)).join('/');
        return `${/^(\d|$)/.test(want) ? 'W' : 'W-'}${want}`;
    }

    /**
     * @returns /Y\d{2}/ | ''
     */
    static toUpdateYear(games: SheetGame[]): string {
        const earliest = games.reduce<Date | null>((min, game) => {
            if (!game.G) {
                return min;
            }
            const date = new Date(game.G);
            return (!min || date < min) ? date : min;
        }, null);
        if (!earliest) {
            return 'Y-';
        }
        const year = earliest.getFullYear();
        return year < (this.currentYear - 3) ? `Y${String(year).slice(2)}` : '';
    }
}

/** Whether the game's 購買/期待度 is 4 or 5, the games worth a price check. */
function isMostWanted(game: SheetGame): boolean {
    return ['4', '5'].includes(String(game.K).trim());
}

/** The app ids whose prices the header's 🔍 looks up: those of its games with 購買/期待度 4 or 5. */
function priceAppIdsOf(games: SheetGame[]): number[] {
    return appIdsOf(games.filter(isMostWanted));
}

/** The distinct app ids of `games`; a sheet name without a HYPERLINK has none. */
function appIdsOf(games: SheetGame[]): number[] {
    return [...new Set(games.flatMap(game => (game.appId === undefined ? [] : [game.appId])))];
}

/** The span holding a header's annotation, so it can be replaced. */
const annotationClass = 'ekko-annotation';

/**
 * Refetches the row of `appId`, or the whole sheet without one, then has
 * `HeaderModifier.useSheetData` and the page's modify run again, even when the refetch failed.
 */
export type OnResync = (appId: number | null) => Promise<void>;

/** The giveaway name a header shows; a long one is cut with `...`. */
function headerName(headerElement: HTMLElement): string {
    return headerElement.innerText.replace(/(\.{3})$/, '');
}

/** The app id of the header's Steam link; null for a bundle's `sub/` link or none. */
function headerAppId(headerElement: HTMLElement): number | null {
    return headerElement.parentElement && findAppId(headerElement.parentElement);
}

export class HeaderModifier {
    /**
     * Matches a giveaway name (maybe with an extra 'xxx edition') to sheet games.
     * One game on exact match, otherwise all partial matches.
     */
    private matchGames!: (rawName: string) => SheetGame[];
    /** Sheet games by the app id their name HYPERLINK links; tried before the name. */
    private gamesByAppId = new Map<number, SheetGame[]>();
    /** Created the first time a header shows a year mark, then reused so a busy one stays busy. */
    private readonly refreshButtons = new WeakMap<HTMLElement, RefreshButton>();
    /** Created the first time a header is modified, then reused like `refreshButtons`. */
    private readonly resyncButtons = new WeakMap<HTMLElement, ResyncButton>();
    /** Created the first time a header matches a game with an app id, then reused like `refreshButtons`. */
    private readonly priceButtons = new WeakMap<HTMLElement, PriceButton>();

    constructor(
        sheetData: SheetData,
        private readonly onRefreshed: OnRefreshed,
        private readonly onResync: OnResync,
    ) {
        this.useSheetData(sheetData);
    }

    /** Match against `sheetData` from now on, e.g. a refetched sheet; the annotations stay until modified again. */
    useSheetData(sheetData: SheetData): void {
        this.matchGames = createNameMatcher(sheetData.games, game => game.B);
        this.gamesByAppId = new Map();
        for (const game of sheetData.games) {
            if (game.appId !== undefined) {
                this.gamesByAppId.set(game.appId, [...(this.gamesByAppId.get(game.appId) ?? []), game]);
            }
        }
    }

    /**
     * The games whose name links the header's app id; without any, the games its name matches
     * (a bundle, a sheet name without a HYPERLINK, or an edition with an app id of its own).
     */
    private matchHeader(headerElement: HTMLElement): SheetGame[] {
        const appId = headerAppId(headerElement);
        return (appId === null ? undefined : this.gamesByAppId.get(appId))
            ?? this.matchGames(headerName(headerElement));
    }

    /**
     * @returns Count of modified giveaways
     */
    modifyGiveaways(): number {
        const headers = document.querySelectorAll<HTMLElement>('.giveaway__heading__name');
        // next should be .giveaway__heading__thin
        let count = 0;
        headers.forEach((header) => {
            if (this.modify(header)) {
                count += 1;
            }
        });
        return count;
    }

    /**
     * @returns Whether the giveaway was modified
     */
    modifyGiveaway(): boolean {
        const header = document.querySelector<HTMLElement>('.featured__heading__medium');
        // next should be .featured__heading__small
        return this.modify(header);
    }

    /**
     * Match the header with sheet data, see `matchHeader`, and modify DOM.
     * Running it again replaces the annotation, e.g. after a refresh changed the update date.
     *
     * A year mark gets a ↻ inside it, e.g. `(W4) (Y19↻)`, when the giveaway's Steam link has an
     * app id (a bundle's `sub/` link has none) and no matched game has 購買/期待度 4 or 5. The
     * refresh drops the mark, and the ↻ with it.
     *
     * The want level gets a line magnifier inside it, e.g. `(W4🔍)`, when a matched game with an app id
     * has 購買/期待度 4 or 5: it shows those games' 目標價 and 最低$ from the sheet, e.g. `$50, 史$90`.
     *
     * A header matching no game gets `(無)` instead.
     *
     * Every annotation ends with a ⟲, e.g. `(W4) (Y19↻) ⟲` or `(無) ⟲`: it reads the game from the sheet
     * again (see `resyncAppId`) and runs the match again, for a game just added or edited in the sheet by hand.
     * @returns Whether a game matched
     */
    private modify(headerElement: HTMLElement | null): boolean {
        if (!headerElement) return false;

        const pointElement = headerElement.nextElementSibling;
        if (!(pointElement instanceof HTMLElement)) {
            return false;
        }
        let annotation = pointElement.querySelector<HTMLElement>(`.${annotationClass}`);
        if (!annotation) {
            annotation = document.createElement('span');
            annotation.className = annotationClass;
            pointElement.append(annotation);
        }

        const resync = this.resyncButtonFor(headerElement, annotation);

        const games = this.matchHeader(headerElement);
        if (!games.length) {
            annotation.replaceChildren(' (無) ', resync.button);
            return false;
        }

        const want = HeaderDisplayFormatter.toWant(games);
        const year = HeaderDisplayFormatter.toUpdateYear(games);
        const refresh = year
            ? this.refreshButtonFor(headerElement, annotation)
            : undefined;
        const price = priceAppIdsOf(games).length ? this.priceButtonFor(headerElement, annotation) : undefined;
        annotation.replaceChildren(
            ` (${want}`,
            ...(price ? [price.button] : []),
            ')',
            ...(year ? [` (${year}`, ...(refresh ? [refresh.button] : []), ')'] : []),
            ' ',
            resync.button,
        );
        return true;
    }

    /** The header's ↻, its status put after `annotation`; undefined without an app id. */
    private refreshButtonFor(headerElement: HTMLElement, annotation: HTMLElement): RefreshButton | undefined {
        let refresh = this.refreshButtons.get(headerElement);
        if (!refresh) {
            const appId = headerAppId(headerElement);
            if (!appId) {
                return undefined;
            }
            refresh = new RefreshButton(appId, this.onRefreshed);
            this.refreshButtons.set(headerElement, refresh);
            annotation.after(refresh.status);
        }
        return refresh;
    }

    /** The header's price lookup button, its status put after `annotation`. */
    private priceButtonFor(headerElement: HTMLElement, annotation: HTMLElement): PriceButton {
        let price = this.priceButtons.get(headerElement);
        if (!price) {
            price = new PriceButton(() => priceAppIdsOf(this.matchHeader(headerElement)));
            this.priceButtons.set(headerElement, price);
            annotation.after(price.status);
        }
        return price;
    }

    /**
     * The app id whose row ⟲ refetches: the header's, unless its games matched by name only, which
     * the row of that app id would not replace; null for those and a header without one, to refetch
     * the whole sheet.
     */
    private resyncAppId(headerElement: HTMLElement): number | null {
        const appId = headerAppId(headerElement);
        if (appId === null || this.gamesByAppId.has(appId)) {
            return appId;
        }
        return this.matchGames(headerName(headerElement)).length ? null : appId;
    }

    /** The header's ⟲, its status put after `annotation`. */
    private resyncButtonFor(headerElement: HTMLElement, annotation: HTMLElement): ResyncButton {
        let resync = this.resyncButtons.get(headerElement);
        if (!resync) {
            resync = new ResyncButton(async () => {
                const appId = this.resyncAppId(headerElement);
                await this.onResync(appId);
                if (this.matchHeader(headerElement).length) {
                    return null;
                }
                // The row was found (else `not-found`), but the dump leaves it out.
                return appId === null ? '重抓 Sheet 後還是對不到這款遊戲。' : 'Sheet 裡這款遊戲的期待度是空白或 0，不標註。';
            });
            this.resyncButtons.set(headerElement, resync);
            annotation.after(resync.status);
        }
        return resync;
    }
}


interface CacheEntry<T> {
    value: T;
    time: number;
}

class Cache<T> {
    private readonly key: string;
    /** in ms */
    private readonly duration: number;
    private cache: Record<string, CacheEntry<T>> = {};
    private saveTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(key: string, duration: number) {
        this.key = key;
        this.duration = duration;
        this.load();
        this.clearExpired();
    }

    private load(): void {
        try {
            const raw = localStorage.getItem(this.key);
            this.cache = raw ? (JSON.parse(raw) as Record<string, CacheEntry<T>>) : {};
        } catch {
            this.cache = {};
        }
    }

    private save(): void {
        localStorage.setItem(this.key, JSON.stringify(this.cache));
    }

    private saveDebounced(): void {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => {
            this.save();
            this.saveTimeout = null;
        }, 30 * 1000);
    }

    private clearExpired(): void {
        const now = Date.now();
        for (const [key, value] of Object.entries(this.cache)) {
            if (!value.time || (now - value.time > this.duration)) {
                delete this.cache[key];
                this.saveDebounced();
            }
        }
    }

    get(url: string): T | undefined {
        const now = Date.now();
        const entry = this.cache[url];
        if (entry && now - entry.time <= this.duration) {
            return entry.value;
        }
        return undefined;
    }

    set(url: string, value: T): void {
        this.cache[url] = { value, time: Date.now() };
        this.saveDebounced();
    }
}

export class RegionModifier {
    private readonly cache: Cache<number>;

    constructor() {
        const cacheDuration = 24 * 60 * 60 * 1000; // 1D
        this.cache = new Cache('ekkoGamesRegions', cacheDuration);
    }

    /**
     * @returns Count of modified giveaways
     */
    async modifyGiveaways(): Promise<number> {
        const regions = document.querySelectorAll<HTMLAnchorElement>('.giveaway__column--region-restricted');
        let count = 0;
        for (const region of regions) {
            if (await this.modify(region)) {
                count += 1;
            }
        }
        return count;
    }

    /**
     * @returns Whether the giveaway was modified
     */
    async modifyGiveaway(): Promise<boolean> {
        const region = document.querySelector<HTMLAnchorElement>('.featured__column--region-restricted');
        return await this.modify(region);
    }

    /**
     * @param regionElement form `<a href="/giveaway/xxxxx/griftlands/region-restrictions">`
     * @returns Whether modified successfully
     */
    private async modify(regionElement: HTMLAnchorElement | null): Promise<boolean> {
        if (!regionElement?.href) {
            return false;
        }

        try {
            const counts = await this.fetchRegionCounts(regionElement.href);
            regionElement.appendChild(document.createTextNode(`${counts}`));
            return true;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    private async fetchRegionCounts(url: string): Promise<number> {
        const cached = this.cache.get(url);
        if (cached !== undefined) {
            return cached;
        }

        return await new Promise<number>((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: (response) => {
                    if (response.status !== 200) {
                        return reject(new Error(`Failed to fetch ${url}: ${response.status}`));
                    }

                    const parser = new DOMParser();
                    const doc = parser.parseFromString(response.responseText, 'text/html');
                    const resultsSelector = '.pagination__results';
                    const text = doc.querySelector<HTMLElement>(resultsSelector)?.innerText;
                    if (!text) {
                        return reject(new Error(`Results text not found in ${url}`));
                    }
                    // Keep parse failures inside the promise: an escaping throw would
                    // leave it forever pending, hanging every `await` down the line.
                    let count: number;
                    try {
                        count = this.parseRegionCounts(text);
                    } catch (error) {
                        return reject(error instanceof Error ? error : new Error(String(error)));
                    }
                    this.cache.set(url, count);
                    resolve(count);
                },
                onerror: (error) => {
                    return reject(new Error(`Failed to fetch ${url}: ${error.error}`));
                },
            });
        });
    }

    /**
     * @param text Region results text
     */
    private parseRegionCounts(text: string): number {
        if (text.includes('No results')) {
            return 0;
        }

        const total = /(?:\d+) to (?:\d+) of (\d+) result/.exec(text)?.[1];
        if (total === undefined) {
            throw new Error(`Unexpected results text format: ${text}`);
        }
        return parseInt(total, 10);
    }
}
