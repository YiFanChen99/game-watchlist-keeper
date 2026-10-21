import { HttpStatusError, type FetchText } from '@watchlist/core';
import { Column } from '@watchlist/game-record-writer';
import { SheetApiError, type SheetApi } from '@watchlist/sheet-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtureFetchText, fixtureItadApiKey, loadStorePage } from '../../steam-info-scraper/test/fixtures';
import { startSheetWriter } from '../src/sheetWriter';

const api = {
    findRow: vi.fn<SheetApi['findRow']>(),
    readRow: vi.fn<SheetApi['readRow']>(),
    updateRow: vi.fn<SheetApi['updateRow']>(),
    appendRow: vi.fn<SheetApi['appendRow']>(),
};

/** Steam and ITAD requests; serves the saved fixtures unless a test says otherwise. */
const steamFetchText = vi.fn<FetchText>();

/** The ITAD API key in Tampermonkey storage; none unless a test saves one. */
let savedItadApiKey: string | undefined;
const forgetItadApiKeyIfRefused = vi.fn((error: Error | null) => error instanceof HttpStatusError && error.status === 403);

// Keep the real `copyText`, so the clipboard goes through `GM_setClipboard`.
vi.mock('../src/tampermonkey', async importOriginal => ({
    ...await importOriginal<typeof import('../src/tampermonkey')>(),
    fetchText: (url: string, headers?: Record<string, string>) => steamFetchText(url, headers),
    withApi: <T>(run: (sheetApi: SheetApi) => Promise<T>) => run(api as unknown as SheetApi),
    itadApiKey: {
        get: () => savedItadApiKey,
        forgetIfRefused: (error: Error | null) => forgetItadApiKeyIfRefused(error),
    },
}));

/** Slay the Spire 2: 繁中 and TWD, so the open page reads the same as a fetched one. */
const appId = 2868840;
const storePageFetchUrl = `https://store.steampowered.com/app/${appId}/?l=tchinese&cc=tw`;
const noSourcesNote = '沒有 ITAD 的 API key，也沒有 SteamDB 區塊，最低off 沒有更新（原本是數字的話前面加上 !，表示可能過時）。';
const messageLifetimeMs = 60_000;

const setClipboard = vi.fn<(text: string, type: string) => void>();

/** Make `appId`'s saved store page the open page, after `edit` changes it. */
function openStorePage(edit?: (page: Document) => void): void {
    const page = loadStorePage(appId);
    edit?.(page);
    document.documentElement.lang = page.documentElement.lang;
    document.head.innerHTML = page.head.innerHTML;
    document.body.innerHTML = page.body.innerHTML;
    window.history.replaceState(null, '', `/app/${appId}/Slay_the_Spire_2/`);
}

/** What the SteamDB extension adds to the page, with a lowest price of NT$ 349. */
function addSteamDbBlock(): void {
    document.body.insertAdjacentHTML('beforeend', '<div class="steamdb_prices_top">Lowest recorded price: NT$ 349</div>');
}

function panel(): HTMLElement {
    const area = document.getElementById('EkkoSteamSheetWriter');
    if (!area) {
        throw new Error('no panel');
    }
    return area;
}

const sheetButton = () => panel().querySelectorAll('button')[0]!;
const playtimeButton = () => panel().querySelectorAll('button')[1]!;

/** A button's status line under the buttons. */
function statusLine(name: 'sheet' | 'playtime'): HTMLElement {
    return panel().querySelector<HTMLElement>(`[data-status="${name}"]`)!;
}

/** The sheet button's status line; null while hidden. */
function status(name: 'sheet' | 'playtime' = 'sheet'): string | null {
    const line = statusLine(name);
    return line.style.display === 'none' ? null : line.textContent;
}

function clickStatus(name: 'sheet' | 'playtime' = 'sheet'): void {
    statusLine(name).click();
}

/** Wait until neither button is busy. */
async function settle(): Promise<void> {
    await vi.waitFor(() => {
        expect(sheetButton().disabled).toBe(false);
        expect(playtimeButton().disabled).toBe(false);
    });
}

/** Start on the open page and wait for the sheet check. */
async function start(): Promise<void> {
    startSheetWriter();
    await settle();
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
    });
    return { promise, resolve, reject };
}

/** The game's row, as an older refresh left it. */
const existingRow: Awaited<ReturnType<SheetApi['readRow']>> = {
    row: 7,
    values: {
        [Column.originalPrice]: 459,
        [Column.lowestOff]: 20,
        [Column.special]: '英',
        [Column.detail]: '手寫的遊戲特點。26/03EA。中位1H，3rd.高2H。',
    },
};

/** The sheet already has the game. */
function rowExists(): void {
    api.findRow.mockResolvedValue(existingRow.row);
    api.readRow.mockResolvedValue(existingRow);
}

beforeEach(() => {
    openStorePage();
    vi.stubGlobal('GM_setClipboard', setClipboard);
    steamFetchText.mockImplementation(fixtureFetchText);
    savedItadApiKey = undefined;
    forgetItadApiKeyIfRefused.mockImplementation(error => error instanceof HttpStatusError && error.status === 403);
    api.findRow.mockResolvedValue(null);
    api.updateRow.mockResolvedValue({ row: 7 });
    api.appendRow.mockResolvedValue({ row: 4 });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('startSheetWriter', () => {
    it('does nothing off an app page', () => {
        window.history.replaceState(null, '', '/search/?term=spire');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        startSheetWriter();

        expect(document.getElementById('EkkoSteamSheetWriter')).toBeNull();
        expect(warn).toHaveBeenCalledWith('Steam Sheet Writer: no app id in /search/');
        expect(api.findRow).not.toHaveBeenCalled();
    });

    it('checks the sheet first, with the sheet button disabled and the playtime button ready', () => {
        api.findRow.mockReturnValue(new Promise(() => undefined));

        startSheetWriter();

        expect(api.findRow).toHaveBeenCalledWith(appId);
        expect(sheetButton().textContent).toBe('查詢 Sheet…');
        expect(sheetButton().disabled).toBe(true);
        expect(playtimeButton().textContent).toBe('時長');
        expect(playtimeButton().disabled).toBe(false);
        expect(status()).toBeNull();
    });

    it('offers ＋ 新增 when the sheet lacks the app id', async () => {
        await start();

        expect(sheetButton().textContent).toBe('＋ 新增');
        expect(status()).toBeNull();
    });

    it('offers ↻ 更新 when the sheet has the app id', async () => {
        rowExists();

        await start();

        expect(sheetButton().textContent).toBe('↻ 更新');
        expect(status()).toBeNull();
    });

    it('shows 重試 and keeps the error when the check fails, and checks again on click', async () => {
        vi.useFakeTimers();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        api.findRow.mockRejectedValueOnce(new Error('沒有輸入 Sheet API 的 token'));

        await start();

        expect(sheetButton().textContent).toBe('重試');
        expect(status()).toBe('沒有輸入 Sheet API 的 token');
        vi.advanceTimersByTime(10 * messageLifetimeMs);
        expect(status()).toBe('沒有輸入 Sheet API 的 token');

        sheetButton().click();
        await settle();

        expect(api.findRow).toHaveBeenCalledTimes(2);
        expect(sheetButton().textContent).toBe('＋ 新增');
        expect(status()).toBeNull();
    });
});

describe('update', () => {
    beforeEach(rowExists);

    it('shows 更新中… while it works, then lists the changes for a minute', async () => {
        vi.useFakeTimers();
        await start();
        const read = deferred<typeof existingRow>();
        api.readRow.mockReturnValueOnce(read.promise);

        sheetButton().click();

        expect(sheetButton().textContent).toBe('更新中…');
        expect(sheetButton().disabled).toBe(true);
        read.resolve(existingRow);
        await settle();

        expect(api.updateRow).toHaveBeenCalledWith(appId, expect.objectContaining({ [Column.originalPrice]: 499 }));
        expect(sheetButton().textContent).toBe('↻ 更新');
        const lines = status()?.split('\n');
        expect(lines?.slice(0, 3)).toEqual(['已更新。', '原價 459 → 499（+40）', '特 英 → 簡']);
        expect(lines?.[3]).toMatch(/^備註 中位1H，3rd\.高2H。 → 中位\d+H，PR\d+ \d+H。$/);
        expect(lines?.slice(4)).toEqual([noSourcesNote]);

        // settle() moved the fake clock on a little while it polled.
        vi.advanceTimersByTime(messageLifetimeMs / 2);
        expect(status()).not.toBeNull();
        vi.advanceTimersByTime(messageLifetimeMs / 2);
        expect(status()).toBeNull();
    });

    it('marks a numeric 最低off as possibly outdated without ITAD or a SteamDB block', async () => {
        await start();

        sheetButton().click();
        await settle();

        expect(api.updateRow).toHaveBeenCalledWith(appId, expect.objectContaining({ [Column.lowestOff]: '!20' }));
    });

    it('writes 最低off from the SteamDB block read on click, marked as it is the only source', async () => {
        await start();
        // The extension adds its block after the page loads.
        addSteamDbBlock();

        sheetButton().click();
        await settle();

        expect(api.updateRow).toHaveBeenCalledWith(appId, expect.objectContaining({ [Column.lowestOff]: '!30' }));
        expect(status()).toContain('原價 459 → 499（+40）');
        expect(status()).toContain('沒有 ITAD 的 API key，最低off 只看 SteamDB 區塊，前面加上 !。');
    });

    it('takes 最低off from ITAD with the saved key, sending it in a header, without a note', async () => {
        savedItadApiKey = fixtureItadApiKey;
        await start();

        sheetButton().click();
        await settle();

        // Never discounted since release; the old 20 off 459 is dropped, as ITAD has every price since.
        expect(api.updateRow).toHaveBeenCalledWith(appId, expect.objectContaining({ [Column.lowestOff]: 0 }));
        expect(steamFetchText).toHaveBeenCalledWith(expect.stringContaining('isthereanydeal'), { 'ITAD-API-Key': fixtureItadApiKey });
        expect(status()).not.toContain('最低off');
    });

    it('tells why 最低off from ITAD has !', async () => {
        savedItadApiKey = fixtureItadApiKey;
        await start();
        addSteamDbBlock();

        sheetButton().click();
        await settle();

        expect(api.updateRow).toHaveBeenCalledWith(appId, expect.objectContaining({ [Column.lowestOff]: '!0' }));
        expect(status()).toContain('最低off 加上 !：SteamDB 區塊的最低價 349 比 ITAD 近 2.5 年的 499 低。');
    });

    it('forgets a key ITAD refuses, and says so', async () => {
        savedItadApiKey = 'refused';
        await start();

        sheetButton().click();
        await settle();

        expect(forgetItadApiKeyIfRefused).toHaveBeenCalledWith(expect.any(HttpStatusError));
        expect(api.updateRow).toHaveBeenCalledWith(appId, expect.objectContaining({ [Column.lowestOff]: '!20' }));
        expect(status()).toContain('ITAD 拒絕了 API key（下次會重新詢問），也沒有 SteamDB 區塊');
    });

    it('says only 已更新。 when nothing it reports changed', async () => {
        savedItadApiKey = fixtureItadApiKey;
        await start();
        sheetButton().click();
        await settle();
        api.readRow.mockResolvedValue({ row: 7, values: api.updateRow.mock.calls[0]![1] });

        sheetButton().click();
        await settle();

        expect(status()).toBe('已更新。');
    });

    it('offers to add the game again when its row is gone', async () => {
        await start();
        api.readRow.mockRejectedValueOnce(new SheetApiError('not-found'));

        sheetButton().click();
        await settle();

        expect(sheetButton().textContent).toBe('＋ 新增');
        expect(status()).toBe('Sheet 找不到這個遊戲了，可以重新新增。');
        expect(api.updateRow).not.toHaveBeenCalled();

        sheetButton().click();
        await settle();

        expect(api.appendRow).toHaveBeenCalledWith(appId, expect.anything());
        expect(sheetButton().textContent).toBe('↻ 更新');
    });

    it('shows 重試 and keeps the error until clicked, then retries the update', async () => {
        vi.useFakeTimers();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await start();
        api.updateRow.mockRejectedValueOnce(new Error('Failed to POST: 500'));

        sheetButton().click();
        await settle();

        expect(sheetButton().textContent).toBe('重試');
        expect(status()).toBe('Failed to POST: 500');
        vi.advanceTimersByTime(10 * messageLifetimeMs);
        expect(status()).toBe('Failed to POST: 500');
        clickStatus();
        expect(status()).toBeNull();

        sheetButton().click();
        await settle();

        expect(api.updateRow).toHaveBeenCalledTimes(2);
        expect(api.appendRow).not.toHaveBeenCalled();
        expect(sheetButton().textContent).toBe('↻ 更新');
        expect(status()).toMatch(/^已更新。/);
    });
});

describe('add', () => {
    it('shows 新增中… while it works, then adds the row with 最低off 0 without ITAD or a SteamDB block', async () => {
        vi.useFakeTimers();
        await start();
        const append = deferred<Awaited<ReturnType<SheetApi['appendRow']>>>();
        api.appendRow.mockReturnValueOnce(append.promise);

        sheetButton().click();

        expect(sheetButton().textContent).toBe('新增中…');
        expect(sheetButton().disabled).toBe(true);
        await vi.waitFor(() => {
            expect(api.appendRow).toHaveBeenCalled();
        });
        append.resolve({ row: 4 });
        await settle();

        expect(api.appendRow).toHaveBeenCalledWith(appId, expect.objectContaining({
            [Column.name]: '=HYPERLINK("https://store.steampowered.com/app/2868840/","Slay the Spire 2")',
            [Column.originalPrice]: 499,
            [Column.lowestOff]: 0,
            [Column.wantLevel]: '?',
        }));
        expect(sheetButton().textContent).toBe('↻ 更新');
        expect(status()).toBe('已新增。\n沒有 ITAD 的 API key，也沒有 SteamDB 區塊，最低off 寫 0。');
        vi.advanceTimersByTime(messageLifetimeMs);
        expect(status()).toBeNull();
    });

    it('writes 最低off from the SteamDB block read on click, marked as it is the only source', async () => {
        await start();
        addSteamDbBlock();

        sheetButton().click();
        await settle();

        expect(api.appendRow).toHaveBeenCalledWith(appId, expect.objectContaining({ [Column.lowestOff]: '!30' }));
        expect(status()).toBe('已新增。\n沒有 ITAD 的 API key，最低off 只看 SteamDB 區塊，前面加上 !。');
    });

    it('takes 最低off from ITAD with the saved key, without a note', async () => {
        savedItadApiKey = fixtureItadApiKey;
        await start();

        sheetButton().click();
        await settle();

        expect(api.appendRow).toHaveBeenCalledWith(appId, expect.objectContaining({ [Column.lowestOff]: 0 }));
        expect(status()).toBe('已新增。');
    });

    it('updates on the next click once added', async () => {
        await start();
        sheetButton().click();
        await settle();
        api.readRow.mockResolvedValue({ row: 4, values: api.appendRow.mock.calls[0]![1] });

        sheetButton().click();
        await settle();

        expect(api.appendRow).toHaveBeenCalledTimes(1);
        expect(api.updateRow).toHaveBeenCalledTimes(1);
    });

    it('switches to ↻ 更新 when the sheet already has the game', async () => {
        vi.useFakeTimers();
        await start();
        api.appendRow.mockRejectedValueOnce(new SheetApiError('duplicate'));

        sheetButton().click();
        await settle();

        expect(sheetButton().textContent).toBe('↻ 更新');
        expect(status()).toBe('Sheet 已經有這個遊戲，請改用更新。');
        vi.advanceTimersByTime(messageLifetimeMs);
        expect(status()).toBeNull();
    });

    it('adds nothing and keeps the message when the page lacks a required value', async () => {
        vi.useFakeTimers();
        // The open page is still 繁中 and TWD, so it is parsed instead of the fetched one, which has the name.
        openStorePage(page => {
            page.querySelectorAll('.apphub_AppName').forEach(name => {
                name.remove();
            });
        });
        await start();

        sheetButton().click();
        await settle();

        expect(api.appendRow).not.toHaveBeenCalled();
        expect(sheetButton().textContent).toBe('＋ 新增');
        expect(status()).toBe('商店頁讀不到「名稱」，沒有新增。');
        vi.advanceTimersByTime(10 * messageLifetimeMs);
        expect(status()).toBe('商店頁讀不到「名稱」，沒有新增。');
    });

    it('shows 重試 on another failure, and retries the add', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await start();
        steamFetchText.mockRejectedValueOnce(new Error('offline'));

        sheetButton().click();
        await settle();

        expect(sheetButton().textContent).toBe('重試');
        expect(status()).toBe('offline');
        expect(api.appendRow).not.toHaveBeenCalled();

        sheetButton().click();
        await settle();

        expect(api.appendRow).toHaveBeenCalledTimes(1);
        expect(sheetButton().textContent).toBe('↻ 更新');
    });
});

describe('store page source', () => {
    const storePageRequests = () => steamFetchText.mock.calls
        .map(([url]) => url)
        .filter(url => url.startsWith('https://store.steampowered.com/app/'));

    it('parses the open page when it is in 繁中 and priced in TWD', async () => {
        rowExists();
        await start();

        sheetButton().click();
        await settle();

        expect(api.updateRow).toHaveBeenCalled();
        expect(storePageRequests()).toEqual([]);
    });

    it.each([
        ['in another language', (page: Document) => {
            page.documentElement.lang = 'en';
        }],
        ['priced in another currency', (page: Document) => {
            page.querySelector('meta[itemprop="priceCurrency"]')!.setAttribute('content', 'USD');
        }],
    ])('fetches the 繁中 TW page when the open page is %s', async (_, edit) => {
        openStorePage(edit);
        rowExists();
        await start();

        sheetButton().click();
        await settle();

        expect(storePageRequests()).toEqual([storePageFetchUrl]);
        expect(api.updateRow).toHaveBeenCalledWith(appId, expect.objectContaining({ [Column.originalPrice]: 499 }));
    });

    it('fetches the 繁中 TW page to add a game too', async () => {
        openStorePage(page => {
            page.documentElement.lang = 'en';
        });
        await start();

        sheetButton().click();
        await settle();

        expect(storePageRequests()).toEqual([storePageFetchUrl]);
        expect(api.appendRow).toHaveBeenCalled();
    });
});

describe('時長 button', () => {
    it('copies the playtime for a minute, without touching the sheet or the store page', async () => {
        vi.useFakeTimers();
        await start();
        const reviews = deferred<string>();
        steamFetchText.mockReturnValueOnce(reviews.promise);

        playtimeButton().click();

        expect(playtimeButton().textContent).toBe('…');
        expect(playtimeButton().disabled).toBe(true);
        reviews.resolve(await fixtureFetchText(steamFetchText.mock.calls[0]![0]));
        await settle();

        expect(playtimeButton().textContent).toBe('時長');
        expect(setClipboard).toHaveBeenCalledTimes(1);
        const [playtime, type] = setClipboard.mock.calls[0]!;
        expect(playtime).toMatch(/^中位\d+H，PR\d+ \d+H。$/);
        expect(type).toBe('text');
        expect(status('playtime')).toBe(`已複製：${playtime}`);
        expect(steamFetchText.mock.calls.every(([url]) => url.includes('/appreviews/'))).toBe(true);
        expect(api.readRow).not.toHaveBeenCalled();
        expect(api.updateRow).not.toHaveBeenCalled();
        expect(api.appendRow).not.toHaveBeenCalled();
        expect(sheetButton().textContent).toBe('＋ 新增');

        vi.advanceTimersByTime(messageLifetimeMs);
        expect(status('playtime')).toBeNull();
    });

    it('works while the sheet is still being checked', async () => {
        api.findRow.mockReturnValue(new Promise(() => undefined));
        startSheetWriter();

        playtimeButton().click();
        await vi.waitFor(() => {
            expect(setClipboard).toHaveBeenCalled();
        });

        expect(sheetButton().textContent).toBe('查詢 Sheet…');
        expect(status('playtime')).toMatch(/^已複製：中位/);
    });

    it('keeps a failure until clicked, and is ready again', async () => {
        vi.useFakeTimers();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await start();
        steamFetchText.mockRejectedValueOnce(new Error('Failed to GET reviews: 502'));

        playtimeButton().click();
        await settle();

        expect(setClipboard).not.toHaveBeenCalled();
        expect(playtimeButton().textContent).toBe('時長');
        expect(status('playtime')).toBe('Failed to GET reviews: 502');
        vi.advanceTimersByTime(10 * messageLifetimeMs);
        expect(status('playtime')).toBe('Failed to GET reviews: 502');
        clickStatus('playtime');
        expect(status('playtime')).toBeNull();
    });

    it('keeps a sheet failure shown beside a playtime copy, each line on its own timer', async () => {
        vi.useFakeTimers();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await start();
        api.appendRow.mockRejectedValueOnce(new Error('Failed to POST: 500'));
        sheetButton().click();
        await settle();
        expect(status()).toBe('Failed to POST: 500');

        playtimeButton().click();
        await settle();
        expect(status('playtime')).toMatch(/^已複製：中位/);
        expect(status()).toBe('Failed to POST: 500');

        vi.advanceTimersByTime(messageLifetimeMs);
        expect(status('playtime')).toBeNull();
        expect(status()).toBe('Failed to POST: 500');
    });

    it('keeps a playtime copy shown when the sheet button reports', async () => {
        vi.useFakeTimers();
        await start();
        playtimeButton().click();
        await settle();
        sheetButton().click();
        await settle();
        expect(status()).toMatch(/^已新增。/);
        expect(status('playtime')).toMatch(/^已複製：中位/);
    });
});
