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

const pagesBaseUrl = 'https://yifanchen99.github.io/game-watchlist-keeper/steam';

/** Repeated keys (`match`, `connect`) are expressed as arrays. */
export const metadata = {
    name: 'Ekko Steam Sheet Writer',
    namespace: 'https://github.com/YiFanChen99/game-watchlist-keeper',
    version: pkg.version,
    description: pkg.description,
    author: pkg.author,
    match: ['*://store.steampowered.com/app/*'],
    grant: ['GM_xmlhttpRequest', 'GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_setClipboard'],
    connect: [
        'script.google.com',
        // Apps Script web apps 302-redirect /exec responses here.
        'script.googleusercontent.com',
        'store.steampowered.com',
        // 最低off's lowest price.
        'api.isthereanydeal.com',
    ],
    // Steam's own favicon; this URL carries no build hash.
    icon: 'https://store.steampowered.com/favicon.ico',
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
