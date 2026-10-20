/**
 * Re-download the Steam fixtures under test/fixtures/.
 *
 * Usage: pnpm --filter @watchlist/steam-info-scraper fixtures [--itad-only] [appid ...]
 * With app ids, only those are fetched, leaving the other fixtures as they are.
 * With --itad-only, only the IsThereAnyDeal fixtures are fetched.
 *
 * Store pages are fetched as an anonymous tchinese/TW visitor. Appreviews
 * responses keep only the fields the parsers read, so the fixtures stay small
 * and contain no review text.
 *
 * ITAD needs an API key in the ITAD_API_KEY environment variable; the fixtures do not contain it.
 * Without the key, the ITAD fixtures are skipped.
 */

import { mkdir, writeFile } from 'node:fs/promises';

/** appid → what the fixture covers. Keep in sync with test/fixtures/README.md. */
const apps = {
    1145360: 'Hades: released, paid, simplified Chinese only',
    1562430: 'DREDGE: the base game below a Digital Deluxe Edition block, traditional Chinese',
    2868840: 'Slay the Spire 2: early access, on sale with a decimal price',
    1966720: 'Lethal Company: early access, English only',
    3669620: 'Warhammer Survivors: coming soon, no price, has a demo',
    570: 'Dota 2: free to play',
    1860960: 'Eira: no longer sold on Steam, no price or demo shown',
    900270: 'Reventure: the original price rose after the lowest price',
};

const itadOnly = process.argv.includes('--itad-only');
const requested = process.argv.slice(2).filter(arg => arg !== '--itad-only');
const itadApiKey = process.env.ITAD_API_KEY;
if (itadOnly && !itadApiKey) {
    throw new Error('--itad-only needs ITAD_API_KEY');
}
for (const appId of requested) {
    if (!(appId in apps)) {
        throw new Error(`${appId} is not listed in apps`);
    }
}

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
    // Skip the age gate.
    'Cookie': 'birthtime=0; lastagecheckage=1-0-1900; wants_mature_content=1',
};

async function fetchText(url, extraHeaders = {}) {
    const response = await fetch(url, { headers: { ...headers, ...extraHeaders } });
    if (!response.ok) {
        throw new Error(`${url}: ${response.status} ${response.statusText}`);
    }
    return response.text();
}

function trimAppReviews(json) {
    const data = JSON.parse(json);
    return {
        success: data.success,
        query_summary: data.query_summary,
        reviews: data.reviews.map(review => ({
            recommendationid: review.recommendationid,
            voted_up: review.voted_up,
            author: { playtime_forever: review.author.playtime_forever },
        })),
    };
}

/** Free apps: `fetchSteamSnapshot` counts every purchase type for them. Keep in sync with `apps`. */
const freeApps = new Set(['570']);

/** Same as `reviewSummaryUrl` in src/urls.ts, which this script cannot import. Keep them in sync. */
const reviewSummaryQuery = purchaseType => new URLSearchParams({
    json: '1',
    filter: 'all',
    language: 'all',
    review_type: 'all',
    purchase_type: purchaseType,
    filter_offtopic_activity: '1',
    num_per_page: '0',
}).toString();

/** Same as `appReviewsUrl` in src/urls.ts (30 days only), which this script cannot import. Keep them in sync. */
const appReviewsQuery = new URLSearchParams({
    json: '1',
    filter: 'all',
    day_range: '30',
    language: 'all',
    review_type: 'all',
    purchase_type: 'all',
    filter_offtopic_activity: '0',
    use_review_quality: '1',
    num_per_page: '40',
}).toString();

/** Same as `itadLookupUrl` and `itadHistoryUrl` in src/itad.ts, which this script cannot import. Keep them in sync. */
const itadLookupUrl = appId => `https://api.isthereanydeal.com/games/lookup/v1?appid=${appId}`;
const itadHistoryUrl = gameId => `https://api.isthereanydeal.com/games/history/v2?${new URLSearchParams({
    id: gameId,
    country: 'TW',
    shops: '61',
    since: '2010-01-01T00:00:00Z',
})}`;

/** @returns The fields `parseItadLookup` reads, plus the title to tell the files apart. */
function trimItadLookup(json) {
    const data = JSON.parse(json);
    return data.found ? { found: true, game: { id: data.game.id, title: data.game.title } } : { found: false };
}

/** @returns The fields `parseItadHistory` reads, plus the cut to read the files by eye. */
function trimItadHistory(json) {
    return JSON.parse(json).map(record => ({
        timestamp: record.timestamp,
        deal: {
            price: { amount: record.deal.price.amount },
            regular: { amount: record.deal.regular.amount },
            cut: record.deal.cut,
        },
    }));
}

async function fetchItadFixtures(appId) {
    const itadHeaders = { 'ITAD-API-Key': itadApiKey };
    const lookup = trimItadLookup(await fetchText(itadLookupUrl(appId), itadHeaders));
    await writeFile(new URL(`itad/lookup/${appId}.json`, dir), `${JSON.stringify(lookup, null, 2)}\n`);
    if (lookup.found) {
        const history = trimItadHistory(await fetchText(itadHistoryUrl(lookup.game.id), itadHeaders));
        await writeFile(new URL(`itad/history/${appId}.json`, dir), `${JSON.stringify(history, null, 2)}\n`);
    }
}

const dir = new URL('../test/fixtures/', import.meta.url);
await mkdir(new URL('store/', dir), { recursive: true });
await mkdir(new URL('appreviews/', dir), { recursive: true });
await mkdir(new URL('reviewsummary/', dir), { recursive: true });
await mkdir(new URL('itad/lookup/', dir), { recursive: true });
await mkdir(new URL('itad/history/', dir), { recursive: true });

for (const appId of requested.length ? requested : Object.keys(apps)) {
    if (itadApiKey) {
        await fetchItadFixtures(appId);
    }
    if (itadOnly) {
        console.log(`fetched ${appId} (ITAD only)`);
        continue;
    }

    const html = await fetchText(`https://store.steampowered.com/app/${appId}/?l=tchinese&cc=tw`);
    await writeFile(new URL(`store/${appId}.html`, dir), html);

    const reviews = await fetchText(`https://store.steampowered.com/appreviews/${appId}?${appReviewsQuery}`);
    await writeFile(new URL(`appreviews/${appId}.json`, dir), `${JSON.stringify(trimAppReviews(reviews), null, 2)}\n`);

    const purchaseType = freeApps.has(appId) ? 'all' : 'steam';
    const summary = await fetchText(`https://store.steampowered.com/appreviews/${appId}?${reviewSummaryQuery(purchaseType)}`);
    await writeFile(new URL(`reviewsummary/${appId}.json`, dir), `${JSON.stringify(trimAppReviews(summary), null, 2)}\n`);

    console.log(`fetched ${appId}`);
}
