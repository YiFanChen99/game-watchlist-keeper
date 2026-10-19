/**
 * Hand-written SteamGifts pages, trimmed to what the annotator reads: SteamGifts blocks curl, so
 * real pages cannot be saved as fixtures.
 */

export interface Giveaway {
    name: string;
    /** The heading's Steam link, e.g. `https://store.steampowered.com/app/343860/` or a bundle's `.../sub/1234/`. */
    steamUrl?: string;
    /** The region restriction link, for a region-restricted giveaway. */
    regionUrl?: string;
}

const steamLink = (url: string | undefined) =>
    url ? `<a class="giveaway__icon" rel="nofollow noopener" target="_blank" href="${url}"><i class="fa fa-steam"></i></a>` : '';

/** `/giveaways/search`: one row per giveaway. */
export function listPage(giveaways: Giveaway[]): string {
    return giveaways.map(({ name, steamUrl, regionUrl }) => `
        <div class="giveaway__row-outer-wrap"><div class="giveaway__row-inner-wrap"><div class="giveaway__summary">
            <h2 class="giveaway__heading">
                <a class="giveaway__heading__name" href="/giveaway/aBcDe/slug">${name}</a><span class="giveaway__heading__thin">(5P)</span>
                ${steamLink(steamUrl)}
            </h2>
            <div class="giveaway__columns">${regionUrl
                ? `<a class="giveaway__column--region-restricted" href="${regionUrl}"><i class="fa fa-globe"></i></a>`
                : ''}</div>
        </div></div></div>`).join('');
}

/** `/giveaway/<code>/<slug>`: one giveaway. */
export function giveawayPage({ name, steamUrl, regionUrl }: Giveaway): string {
    return `
        <div class="featured__summary">
            <div class="featured__heading">
                <div class="featured__heading__medium">${name}</div><div class="featured__heading__small">(5P)</div>
                ${steamLink(steamUrl)}
            </div>
            <div class="featured__columns">${regionUrl
                ? `<a class="featured__column featured__column--region-restricted" href="${regionUrl}"><i class="fa fa-globe"></i></a>`
                : ''}</div>
        </div>`;
}

/** The text after a list page heading's points, e.g. `(5P) (W3) ⟲`. */
export function annotationText(name: string): string {
    const heading = [...document.querySelectorAll<HTMLElement>('.giveaway__heading__name, .featured__heading__medium')]
        .find(element => element.textContent === name);
    return heading?.nextElementSibling?.querySelector('.ekko-annotation')?.textContent ?? '';
}

/** A button of the giveaway named `name`, by its glyph, e.g. `⟲`. */
export function buttonOf(name: string, glyph: string): HTMLButtonElement | undefined {
    const heading = [...document.querySelectorAll<HTMLElement>('.giveaway__heading__name, .featured__heading__medium')]
        .find(element => element.textContent === name);
    return [...heading?.nextElementSibling?.querySelectorAll('button') ?? []]
        .find(button => button.textContent === glyph);
}

/** The visible status bubbles' messages, in page order. */
export function shownMessages(): string[] {
    return [...document.querySelectorAll<HTMLElement>('span[title="點一下關閉"]')]
        .filter(bubble => bubble.style.display !== 'none')
        .map(bubble => bubble.textContent ?? '');
}
