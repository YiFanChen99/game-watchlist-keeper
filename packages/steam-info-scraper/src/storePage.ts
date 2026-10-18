import { parseReleaseDate, type ReleaseDate } from './releaseDate';

export interface StorePageInfo {
    name: string | null;
    /**
     * Base game price before discount, in TWD. `0` when free to play.
     * `null` when there is no price, e.g. not yet released.
     */
    originalPrice: number | null;
    releaseDate: ReleaseDate | null;
    isEarlyAccess: boolean;
    hasDemo: boolean;
    /**
     * Languages with interface support, named as the page names them (e.g. `繁體中文`), in table order.
     * `null` when the page has no language table.
     */
    interfaceLanguages: string[] | null;
    /** User-defined tags, most popular first. */
    tags: string[];
}

function textOf(element: Element | null | undefined): string | null {
    const value = element?.textContent?.replace(/\s+/g, ' ').trim();
    return value === undefined || value === '' ? null : value;
}

/**
 * The base game's purchase block only: subscription / bundle dropdowns and the demo block are skipped.
 */
function parseOriginalPrice(doc: ParentNode): number | null {
    const action = '.game_area_purchase_game:not(.game_area_purchase_game_dropdown_subscription):not(.demo_above_purchase) .game_purchase_action';
    const priceText = textOf(doc.querySelector(`${action} .discount_original_price, ${action} .game_purchase_price`));
    if (!priceText) {
        return null;
    }
    if (/free|免費/i.test(priceText)) {
        return 0;
    }

    // e.g. `NT$ 1,190` or `NT$ 888.30`
    const digits = priceText.replace(/[^\d.]/g, '');
    const price = Number(digits);
    return digits && Number.isFinite(price) ? price : null;
}

function findReleaseDate(doc: ParentNode): ReleaseDate | null {
    const dateText = textOf(doc.querySelector('.release_date .date'))
        ?? textOf(doc.querySelector('.game_area_release_date .date'))
        ?? doc.querySelector('[itemprop="datePublished"]')?.getAttribute('content');
    return dateText ? parseReleaseDate(dateText) : null;
}

function parseInterfaceLanguages(doc: ParentNode): string[] | null {
    const table = doc.querySelector('#languageTable');
    if (!table) {
        return null;
    }

    // Supported means a check mark in the interface column, the cell right after the name.
    // Unsupported rows put a single `不支援` cell there instead.
    const supported: string[] = [];
    for (const nameCell of table.querySelectorAll('tr > td:first-child')) {
        const name = textOf(nameCell);
        if (name && nameCell.nextElementSibling?.textContent?.includes('✔')) {
            supported.push(name);
        }
    }
    return supported;
}

function parseTags(doc: ParentNode): string[] {
    const tags = Array.from(doc.querySelectorAll('.popular_tags a.app_tag'), textOf)
        .filter((tag): tag is string => tag !== null);
    return [...new Set(tags)];
}

/**
 * Whether a store page the user has open reads the same as one fetched with `storePageFetchUrl`:
 * in 繁中 (`<html lang="zh-tw">`) and priced in TWD, which `parseStorePage` relies on. A page
 * without a price states no currency, and has none to misread.
 */
export function matchesFetchedStorePage(doc: Document): boolean {
    if (doc.documentElement.lang.toLowerCase() !== 'zh-tw') {
        return false;
    }
    const currency = doc.querySelector('meta[itemprop="priceCurrency"]')?.getAttribute('content');
    return currency === 'TWD' || (currency == null && parseOriginalPrice(doc) === null);
}

/**
 * Parse a store page fetched with `l=tchinese` (see `storePageFetchUrl`), or an open one that
 * `matchesFetchedStorePage`.
 *
 * Review scores are deliberately absent: the page only shows reviews in the visitor's
 * language. Use `parseAppReviews` instead.
 */
export function parseStorePage(doc: ParentNode): StorePageInfo {
    return {
        name: textOf(doc.querySelector('.apphub_AppName')),
        originalPrice: parseOriginalPrice(doc),
        releaseDate: findReleaseDate(doc),
        isEarlyAccess: doc.querySelector('.early_access_header') !== null,
        hasDemo: doc.querySelector('.demo_above_purchase, #demoGameBtn') !== null,
        interfaceLanguages: parseInterfaceLanguages(doc),
        tags: parseTags(doc),
    };
}
