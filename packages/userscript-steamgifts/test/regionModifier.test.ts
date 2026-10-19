import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RegionModifier } from '../src/domModifier';
import { giveawayPage, listPage } from './pages';

vi.mock('../src/tampermonkey', () => ({ withSheetApi: vi.fn(), fetchText: vi.fn() }));

const regionUrl = (code: string) => `https://www.steamgifts.com/giveaway/${code}/tacoma/region-restrictions`;

/** The region restriction page's results line, e.g. `Displaying 1 to 25 of 37 results`. */
const resultsPage = (text: string) => `<div class="pagination"><div class="pagination__results">${text}</div></div>`;

let request: ReturnType<typeof vi.fn>;

/** Answers each region page with `pages[url]`: a results line, or an HTTP status. */
function serve(pages: Record<string, string | number>): void {
    request = vi.fn(({ url, onload }: { url: string; onload: (response: { status: number; responseText: string }) => void }) => {
        const page = pages[url] ?? 404;
        setTimeout(() => {
            onload(typeof page === 'number' ? { status: page, responseText: '' } : { status: 200, responseText: resultsPage(page) });
        });
    });
    vi.stubGlobal('GM_xmlhttpRequest', request);
}

const regionText = (element: Element | null | undefined) => element?.textContent ?? '';

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

describe('RegionModifier', () => {
    it("appends each region-restricted giveaway's region count", async () => {
        document.body.innerHTML = listPage([
            { name: 'Tacoma', regionUrl: regionUrl('a') },
            { name: 'Gone Home' },
            { name: 'Paratopic', regionUrl: regionUrl('b') },
        ]);
        serve({ [regionUrl('a')]: 'Displaying 1 to 25 of 37 results', [regionUrl('b')]: 'No results were found.' });
        expect(await new RegionModifier().modifyGiveaways()).toBe(2);
        const regions = document.querySelectorAll('.giveaway__column--region-restricted');
        expect([...regions].map(regionText)).toEqual(['37', '0']);
    });

    it('appends the count on a giveaway page too', async () => {
        document.body.innerHTML = giveawayPage({ name: 'Tacoma', regionUrl: regionUrl('a') });
        serve({ [regionUrl('a')]: 'Displaying 1 to 3 of 3 results' });
        expect(await new RegionModifier().modifyGiveaway()).toBe(true);
        expect(regionText(document.querySelector('.featured__column--region-restricted'))).toBe('3');
    });

    it('fetches a region page once a day', async () => {
        document.body.innerHTML = listPage([
            { name: 'Tacoma', regionUrl: regionUrl('a') },
            { name: 'Tacoma', regionUrl: regionUrl('a') },
        ]);
        serve({ [regionUrl('a')]: 'Displaying 1 to 25 of 37 results' });
        expect(await new RegionModifier().modifyGiveaways()).toBe(2);
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('skips a giveaway whose region page fails or reads oddly, and goes on', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        document.body.innerHTML = listPage([
            { name: 'Tacoma', regionUrl: regionUrl('a') },
            { name: 'Gone Home', regionUrl: regionUrl('b') },
            { name: 'Paratopic', regionUrl: regionUrl('c') },
        ]);
        serve({ [regionUrl('a')]: 500, [regionUrl('b')]: 'Something else', [regionUrl('c')]: 'Displaying 1 to 2 of 2 results' });
        expect(await new RegionModifier().modifyGiveaways()).toBe(1);
        const regions = document.querySelectorAll('.giveaway__column--region-restricted');
        expect([...regions].map(regionText)).toEqual(['', '', '2']);
    });
});
