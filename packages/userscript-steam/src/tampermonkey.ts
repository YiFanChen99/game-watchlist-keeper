import { createItadApiKey, createWithSheetApi } from '@watchlist/tampermonkey-requests';

/** Starts its prompts and its line on the setup page. */
export const scriptName = 'Steam Sheet Writer';

export { fetchText } from '@watchlist/tampermonkey-requests';

export const withApi = createWithSheetApi(scriptName);

export const itadApiKey = createItadApiKey(scriptName);

export function copyText(text: string): void {
    GM_setClipboard(text, 'text');
}
