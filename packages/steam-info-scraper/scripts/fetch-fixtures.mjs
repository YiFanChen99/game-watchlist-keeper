/**
 * Re-download the Steam fixtures under test/fixtures/.
 *
 * Usage: pnpm --filter @watchlist/steam-info-scraper fixtures [appid ...]
 * With app ids, only those are fetched, leaving the other fixtures as they are.
 *
 * Store pages are fetched as an anonymous tchinese/TW visitor. Appreviews
 * responses keep only the fields the parsers read, so the fixtures stay small
 * and contain no review text.
 */

import { mkdir, writeFile } from 'node:fs/promises';

/** appid → what the fixture covers. Keep in sync with test/fixtures/README.md. */
const apps = {
    1145360: 'Hades: released, paid, simplified Chinese only',
    1562430: 'DREDGE: released, on sale, traditional Chinese',
    2868840: 'Slay the Spire 2: early access, on sale with a decimal price',
    1966720: 'Lethal Company: early access, English only',
    3669620: 'Warhammer Survivors: coming soon, no price, has a demo',
    570: 'Dota 2: free to play',
    1860960: 'Eira: no longer sold on Steam, no price or demo shown',
};

const requested = process.argv.slice(2);
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

async function fetchText(url) {
    const response = await fetch(url, { headers });
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

const dir = new URL('../test/fixtures/', import.meta.url);
await mkdir(new URL('store/', dir), { recursive: true });
await mkdir(new URL('appreviews/', dir), { recursive: true });
await mkdir(new URL('reviewsummary/', dir), { recursive: true });

for (const appId of requested.length ? requested : Object.keys(apps)) {
    const html = await fetchText(`https://store.steampowered.com/app/${appId}/?l=tchinese&cc=tw`);
    await writeFile(new URL(`store/${appId}.html`, dir), html);

    const reviews = await fetchText(`https://store.steampowered.com/appreviews/${appId}?${appReviewsQuery}`);
    await writeFile(new URL(`appreviews/${appId}.json`, dir), `${JSON.stringify(trimAppReviews(reviews), null, 2)}\n`);

    const purchaseType = freeApps.has(appId) ? 'all' : 'steam';
    const summary = await fetchText(`https://store.steampowered.com/appreviews/${appId}?${reviewSummaryQuery(purchaseType)}`);
    await writeFile(new URL(`reviewsummary/${appId}.json`, dir), `${JSON.stringify(trimAppReviews(summary), null, 2)}\n`);

    console.log(`fetched ${appId}`);
}
