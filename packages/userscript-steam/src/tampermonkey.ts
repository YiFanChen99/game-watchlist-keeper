import { createWithSheetApi } from '@watchlist/tampermonkey-requests';

export { fetchText } from '@watchlist/tampermonkey-requests';

export const withApi = createWithSheetApi('Steam Sheet Writer');

export function copyText(text: string): void {
    GM_setClipboard(text, 'text');
}
