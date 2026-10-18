import { annotate, findWaitlistGames } from './annotator';
import { SheetLookup } from './sheet';

/**
 * Gmail renders each opened mail on the fly, so watch the page and annotate the Waitlist games
 * of every ITAD notification as it appears.
 *
 * Tampermonkey storage keys:
 *  sheetApiToken: the token the Apps Script web app checks
 *  sheetDump: { games, time }, the sheet dump cached for a day
 */
function main(): void {
    const lookup = new SheetLookup();
    const scan = () => {
        for (const game of findWaitlistGames(document)) {
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

main();
