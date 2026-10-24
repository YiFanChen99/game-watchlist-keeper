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
    /** User-defined tags (使用者為此產品所選用的熱門標籤), most popular first. */
    tags: string[];
    /**
     * Categories the developer ticks (單人, Steam 成就, 線上合作, …), in page order; not the
     * 「Steam 正在了解這款遊戲」 notice an unreleased game shows among them.
     */
    categories: string[];
    /** Genres (類型) the developer picks, in page order. */
    genres: string[];
    /**
     * The page says the game is no longer sold on Steam (「…已不再於 Steam 商店中提供。」). Such a
     * page has no purchase area: no price, and no demo either.
     */
    isDelisted: boolean;
}

function textOf(element: Element | null | undefined): string | null {
    const value = element?.textContent?.replace(/\s+/g, ' ').trim();
    return value === undefined || value === '' ? null : value;
}

/**
 * A demo's download block: above the purchase area, or in the side column when the developer
 * turned off `show_above_purchase` (e.g. Conan Chop Chop).
 */
const demoSelector = '.demo_above_purchase, #demoGameBtn, .download_demo_button';

/** Purchase blocks of single packages: subscription / bundle dropdowns and the demo block are skipped. */
const purchaseBlockSelector = '.game_area_purchase_game:not(.game_area_purchase_game_dropdown_subscription):not(.demo_above_purchase)';
const blockPriceSelector = '.game_purchase_action .discount_original_price, .game_purchase_action .game_purchase_price';

/**
 * The base game's price: the purchase block titled with the game's name (`購買 DREDGE`), since an
 * edition's block can come first (`購買 DREDGE - Digital Deluxe Edition`). Without such a block,
 * the first block with a price.
 */
function parseOriginalPrice(doc: ParentNode, name: string | null): number | null {
    const blocks = Array.from(doc.querySelectorAll(purchaseBlockSelector), block => ({
        // Drop the verb: `購買 `, `預購 `, …
        title: textOf(block.querySelector('.title'))?.replace(/^\S+\s+/, ''),
        priceText: textOf(block.querySelector(blockPriceSelector)),
    })).filter(block => block.priceText !== null);
    const priceText = (blocks.find(block => name !== null && block.title === name) ?? blocks[0])?.priceText;
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

function isDelisted(doc: ParentNode): boolean {
    return textOf(doc.querySelector('#purchase_note'))?.includes('不再於 Steam 商店中提供') ?? false;
}

/** The text of each element `selector` matches, without blanks or repeats. */
function textsOf(doc: ParentNode, selector: string): string[] {
    const texts = Array.from(doc.querySelectorAll(selector), textOf)
        .filter((text): text is string => text !== null);
    return [...new Set(texts)];
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
    return currency === 'TWD' || (currency == null && parseOriginalPrice(doc, null) === null);
}

/**
 * Parse a store page fetched with `l=tchinese` (see `storePageFetchUrl`), or an open one that
 * `matchesFetchedStorePage`.
 *
 * Review scores are deliberately absent: the page only shows reviews in the visitor's
 * language. Use `parseAppReviews` instead.
 */
export function parseStorePage(doc: ParentNode): StorePageInfo {
    const name = textOf(doc.querySelector('.apphub_AppName'));
    return {
        name,
        originalPrice: parseOriginalPrice(doc, name),
        releaseDate: findReleaseDate(doc),
        isEarlyAccess: doc.querySelector('.early_access_header') !== null,
        hasDemo: doc.querySelector(demoSelector) !== null,
        interfaceLanguages: parseInterfaceLanguages(doc),
        tags: textsOf(doc, '.popular_tags a.app_tag'),
        categories: textsOf(doc, '#category_block a.game_area_details_specs_ctn .label'),
        genres: textsOf(doc, '#genresAndManufacturer a[href*="/genre/"]'),
        isDelisted: isDelisted(doc),
    };
}
