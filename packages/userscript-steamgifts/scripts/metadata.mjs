/**
 * Single source of truth for the userscript metadata block.
 *
 * `@updateURL` is intentionally omitted: when absent, Tampermonkey falls back to
 * `@downloadURL` for update checks, so there is no second file to keep in sync.
 *
 * `version`, `description` and `author` are read from package.json so they cannot drift.
 * `name` stays separate: package.json holds the npm slug, this holds the display name.
 */

import pkg from '../package.json' with { type: 'json' };

const pagesBaseUrl = 'https://yifanchen99.github.io/game-watchlist-keeper/steamgifts';

/** Repeated keys (`match`, `connect`) are expressed as arrays. */
export const metadata = {
    name: 'Ekko SteamGifts Annotator',
    namespace: 'https://github.com/YiFanChen99/game-watchlist-keeper',
    version: pkg.version,
    description: pkg.description,
    author: pkg.author,
    match: [
        '*://www.steamgifts.com/giveaways/search*',
        '*://www.steamgifts.com/giveaway/*',
        // The setup page, where the token and API key are entered once for every script.
        'https://yifanchen99.github.io/game-watchlist-keeper/setup.html',
    ],
    grant: ['GM_xmlhttpRequest', 'GM_getValue', 'GM_setValue', 'GM_deleteValue'],
    connect: [
        'script.google.com',
        // Apps Script web apps 302-redirect /exec responses here.
        'script.googleusercontent.com',
        'www.steamgifts.com',
        // ↻ refreshes a row from the store page and its reviews,
        'store.steampowered.com',
        // and 最低off from ITAD's lowest price.
        'api.isthereanydeal.com',
    ],
    icon: `${pagesBaseUrl}/favicon.ico`,
    downloadURL: `${pagesBaseUrl}/Script.user.js`,
};

/**
 * @returns {string} The `// ==UserScript== ... // ==/UserScript==` block.
 */
export function buildBanner() {
    const entries = Object.entries(metadata).flatMap(([key, value]) =>
        (Array.isArray(value) ? value : [value]).map(item => [key, item])
    );
    const keyWidth = Math.max(...entries.map(([key]) => key.length));

    const lines = entries.map(
        ([key, value]) => `// @${key.padEnd(keyWidth)}  ${value}`
    );
    return ['// ==UserScript==', ...lines, '// ==/UserScript==', ''].join('\n');
}
