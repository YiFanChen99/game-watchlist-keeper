import type { FetchText, PostText } from '@watchlist/core';
import {
    createSheetApi,
    deployedWebAppUrl,
    SheetApiUnauthorizedError,
    type SheetApi,
} from '@watchlist/sheet-api';

/** Tampermonkey storage key of the token the web app checks. */
export const tokenKey = 'sheetApiToken';

function request(details: { method: 'GET' | 'POST'; url: string; data?: string }): Promise<string> {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            ...details,
            ...(details.data === undefined ? {} : { headers: { 'Content-Type': 'text/plain;charset=utf-8' } }),
            onload: (response) => {
                if (response.status < 200 || response.status >= 300) {
                    reject(new Error(`Failed to ${details.method} ${details.url}: ${response.status}`));
                    return;
                }
                resolve(response.responseText);
            },
            onerror: (error) => {
                reject(new Error(`Failed to ${details.method} ${details.url}: ${error.error}`));
            },
        });
    });
}

/** GET through `GM_xmlhttpRequest`, which follows redirects; needs `@grant GM_xmlhttpRequest` and an `@connect` per host. */
export const fetchText: FetchText = url => request({ method: 'GET', url });

/** POST through `GM_xmlhttpRequest`, as `fetchText`. */
export const postText: PostText = (url, body) => request({ method: 'POST', url, data: body });

/**
 * Runs `run` against the deployed web app with the saved token; a rejected token is
 * forgotten and asked for once more.
 */
export type WithSheetApi = <T>(run: (api: SheetApi) => Promise<T>) => Promise<T>;

/**
 * Needs `@grant` GM_xmlhttpRequest, GM_getValue, GM_setValue and GM_deleteValue, and `@connect`
 * script.google.com and script.googleusercontent.com (where `/exec` redirects).
 *
 * @param scriptName Starts the token prompt, e.g. `SteamGifts Annotator`, so the user knows which script asks.
 */
export function createWithSheetApi(scriptName: string): WithSheetApi {
    /** @returns The saved token, or one the user enters now; null when they cancel. */
    const getToken = (): string | null => {
        const saved = GM_getValue<string>(tokenKey, '');
        if (saved) {
            return saved;
        }
        const entered = window.prompt(`${scriptName}: 請輸入 Sheet API 的 token（Apps Script 的 API_TOKEN）`)?.trim();
        if (!entered) {
            return null;
        }
        GM_setValue(tokenKey, entered);
        return entered;
    };

    return async (run) => {
        for (let attempt = 1; ; attempt++) {
            const token = getToken();
            if (!token) {
                throw new Error('沒有輸入 Sheet API 的 token');
            }
            try {
                return await run(createSheetApi({ webAppUrl: deployedWebAppUrl, token, postText }));
            } catch (error) {
                if (!(error instanceof SheetApiUnauthorizedError)) {
                    throw error;
                }
                GM_deleteValue(tokenKey);
                if (attempt >= 2) {
                    throw error;
                }
            }
        }
    };
}
