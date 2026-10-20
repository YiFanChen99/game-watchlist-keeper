import { itadApiKeyKey, runSetupPage, tokenKey } from '@watchlist/tampermonkey-requests';

import { HeaderModifier, RegionModifier } from './domModifier';
import { fetchData, getOrFetchData, markUpdated, refetchGame } from './sheetFetcher';
import { scriptName } from './tampermonkey';

/**
 * User localstorage keys:
 *  ekkoGames: { games: Array, labelMap, time }
 *  ekkoGamesRegions: Record<string, { value, time }>
 * Tampermonkey storage keys:
 *  sheetApiToken: the token the Apps Script web app checks
 *  itadApiKey: the IsThereAnyDeal API key 最低off is taken with
 */
async function main(): Promise<void> {
    let sheetData = await getOrFetchData();
    console.log('SteamGifts Annotator: updated');

    const pathname = window.location.pathname;
    let isGiveawaysPage: boolean;
    if (pathname.startsWith('/giveaways/search')) {
        isGiveawaysPage = true;
    } else if (pathname.startsWith('/giveaway/')) {
        isGiveawaysPage = false;
    } else {
        console.warn(`SteamGifts Annotator: No modification applied. (Unknown page: ${pathname})`);
        return;
    }

    const reannotate = () => {
        if (isGiveawaysPage) {
            headerModifier.modifyGiveaways();
        } else {
            headerModifier.modifyGiveaway();
        }
    };
    /** A refresh wrote 更新日: update the cached dump, then the annotations (the year mark may go). */
    const onRefreshed = (name: string, updatedOn: Date) => {
        if (markUpdated(sheetData, name, updatedOn)) {
            reannotate();
        }
    };
    /** Refetch the whole sheet once for all ⟲ refetching it clicked meanwhile. */
    let refetchingAll: Promise<void> | null = null;
    const refetchAll = () => {
        refetchingAll ??= fetchData()
            .then((data) => {
                sheetData = data;
            })
            .finally(() => {
                refetchingAll = null;
            });
        return refetchingAll;
    };
    /** A ⟲ was clicked: refetch its game's row (the whole sheet without an app id), then annotate every header again. */
    const onResync = async (appId: number | null) => {
        try {
            await (appId === null ? refetchAll() : refetchGame(sheetData, appId));
        } finally {
            // Also after `not-found`, which dropped the game from the cache.
            headerModifier.useSheetData(sheetData);
            reannotate();
        }
    };
    const headerModifier = new HeaderModifier(sheetData, onRefreshed, onResync);
    const regionModifier = new RegionModifier();
    if (isGiveawaysPage) {
        const count = headerModifier.modifyGiveaways();
        console.log(`SteamGifts Annotator: \`giveaways\` ${count} headers modified`);
        const regionCount = await regionModifier.modifyGiveaways();
        console.log(`SteamGifts Annotator: \`giveaways\` ${regionCount} region tags modified`);
    } else {
        const done = headerModifier.modifyGiveaway();
        console.log(`SteamGifts Annotator: \`giveaway\` ${done ? 'headers modified' : 'No headers modification applied.'}`);
        const regionDone = await regionModifier.modifyGiveaway();
        console.log(`SteamGifts Annotator: \`giveaway\` ${regionDone ? 'region tags modified' : 'No region tags modification applied.'}`);
    }
}

if (!runSetupPage(scriptName, [tokenKey, itadApiKeyKey])) {
    main().catch((error: unknown) => {
        console.error('SteamGifts Annotator:', error);
    });
}
