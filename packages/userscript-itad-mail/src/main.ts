import { runSetupPage, tokenKey } from '@watchlist/tampermonkey-requests';

import { annotate, findGames } from './annotator';
import { SheetLookup } from './sheet';
import { scriptName } from './tampermonkey';

/**
 * Gmail renders each opened mail on the fly, so watch the page and annotate the games of every
 * mail from ITAD as it appears.
 *
 * Tampermonkey storage keys:
 *  sheetApiToken: the token the Apps Script web app checks
 *  sheetDump: { games, time }, the sheet dump cached for a day
 */
function main(): void {
    const lookup = new SheetLookup();
    const scan = () => {
        for (const game of findGames(document)) {
            void annotate(game, lookup);
        }
    };

    // Throttled rather than debounced: Gmail keeps mutating the page, which could put a debounced scan off forever.
    let pending: ReturnType<typeof setTimeout> | undefined;
    new MutationObserver(() => {
        pending ??= setTimeout(() => {
            pending = undefined;
            scan();
        }, 300);
    }).observe(document.body, { childList: true, subtree: true });
    scan();
}

if (!runSetupPage(scriptName, [tokenKey])) {
    main();
}
