import { createWithSheetApi } from '@watchlist/tampermonkey-sheet-api';

export { fetchText } from '@watchlist/tampermonkey-sheet-api';

export const withApi = createWithSheetApi('Steam Sheet Writer');

export function copyText(text: string): void {
    GM_setClipboard(text, 'text');
}
