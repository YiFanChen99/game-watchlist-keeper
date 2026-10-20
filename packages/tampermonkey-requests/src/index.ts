import { HttpStatusError, type FetchText, type PostText } from '@watchlist/core';
import {
    createSheetApi,
    deployedWebAppUrl,
    SheetApiUnauthorizedError,
    type SheetApi,
} from '@watchlist/sheet-api';

import { itadApiKeyKey, tokenKey } from './storageKeys';

export { itadApiKeyKey, tokenKey } from './storageKeys';
export { runSetupPage, setupPageIds, setupPageUrl, type SetupSecret } from './setupPage';

/** A secret kept in Tampermonkey storage, asked for the first time it is needed. */
interface StoredSecret {
    /** @returns The saved secret, or one the user enters now; `null` when they cancel. */
    get(): string | null;
    /** Forget it, e.g. once refused, so the next `get` asks again. */
    forget(): void;
}

function storedSecret(storageKey: string, promptMessage: string): StoredSecret {
    return {
        get: () => {
            const saved = GM_getValue<string>(storageKey, '');
            if (saved) {
                return saved;
            }
            const entered = window.prompt(promptMessage)?.trim();
            if (!entered) {
                return null;
            }
            GM_setValue(storageKey, entered);
            return entered;
        },
        forget: () => {
            GM_deleteValue(storageKey);
        },
    };
}

function request(details: { method: 'GET' | 'POST'; url: string; data?: string; headers?: Record<string, string> | undefined }): Promise<string> {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            ...details,
            headers: {
                ...details.headers,
                ...(details.data === undefined ? {} : { 'Content-Type': 'text/plain;charset=utf-8' }),
            },
            onload: (response) => {
                if (response.status < 200 || response.status >= 300) {
                    reject(new HttpStatusError(`Failed to ${details.method} ${details.url}: ${response.status}`, response.status));
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
export const fetchText: FetchText = (url, headers) => request({ method: 'GET', url, headers });

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
    const token = storedSecret(tokenKey, `${scriptName}: 請輸入 Sheet API 的 token（Apps Script 的 API_TOKEN）`);

    return async (run) => {
        for (let attempt = 1; ; attempt++) {
            const saved = token.get();
            if (!saved) {
                throw new Error('沒有輸入 Sheet API 的 token');
            }
            try {
                return await run(createSheetApi({ webAppUrl: deployedWebAppUrl, token: saved, postText }));
            } catch (error) {
                if (!(error instanceof SheetApiUnauthorizedError)) {
                    throw error;
                }
                token.forget();
                if (attempt >= 2) {
                    throw error;
                }
            }
        }
    };
}

/** The IsThereAnyDeal API key, which `game-record-writer` takes 最低off with. */
export interface ItadApiKey {
    /** @returns The saved key, or one the user enters now; `undefined` when they cancel. */
    get(): string | undefined;
    /**
     * Forget the key when `error` is ITAD refusing it, so the next `get` asks again.
     *
     * @param error `itadError` of `refreshGame` / `addGame`.
     * @returns Whether the key was refused.
     */
    forgetIfRefused(error: Error | null): boolean;
}

/** ITAD answers a wrong or expired key with 403 (`Invalid or expired api key`). */
const refusedKeyStatuses = new Set([401, 403]);

/**
 * Needs `@grant` GM_getValue, GM_setValue and GM_deleteValue, and `@connect` api.isthereanydeal.com
 * for the requests made with it.
 *
 * @param scriptName Starts the prompt, as in `createWithSheetApi`.
 */
export function createItadApiKey(scriptName: string): ItadApiKey {
    const key = storedSecret(itadApiKeyKey, `${scriptName}: 請輸入 IsThereAnyDeal 的 API key（最低off 用；取消的話只看 SteamDB 區塊）`);
    return {
        get: () => key.get() ?? undefined,
        forgetIfRefused: (error) => {
            const isRefused = error instanceof HttpStatusError && refusedKeyStatuses.has(error.status);
            if (isRefused) {
                key.forget();
            }
            return isRefused;
        },
    };
}
