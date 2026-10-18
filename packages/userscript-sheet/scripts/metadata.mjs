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

const pagesBaseUrl = 'https://yifanchen99.github.io/game-watchlist-keeper/sheet';

/** Repeated keys (`match`, `connect`) are expressed as arrays. */
export const metadata = {
    name: 'Ekko Sheet Row Refresher',
    namespace: 'https://github.com/YiFanChen99/game-watchlist-keeper',
    version: pkg.version,
    description: pkg.description,
    author: pkg.author,
    // Every spreadsheet: the sheet's URL stays out of this public repo. The web app's row link tells which one it is.
    match: ['https://docs.google.com/spreadsheets/d/*'],
    // Sheets embeds frames of its own; the button belongs on the top page only.
    noframes: '',
    grant: ['GM_xmlhttpRequest', 'GM_getValue', 'GM_setValue', 'GM_deleteValue'],
    connect: [
        'script.google.com',
        // Apps Script web apps 302-redirect /exec responses here.
        'script.googleusercontent.com',
        // The refresh reads the store page and its reviews.
        'store.steampowered.com',
    ],
    // Google Sheets' own favicon; this URL carries no build hash.
    icon: 'https://ssl.gstatic.com/docs/spreadsheets/spreadsheets_2023q4.ico',
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
        ([key, value]) => `// @${key.padEnd(keyWidth)}  ${value}`.trimEnd()
    );
    return ['// ==UserScript==', ...lines, '// ==/UserScript==', ''].join('\n');
}
