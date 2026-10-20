import { createItadApiKey, createWithSheetApi } from '@watchlist/tampermonkey-requests';

export { fetchText } from '@watchlist/tampermonkey-requests';

export const withSheetApi = createWithSheetApi('SteamGifts Annotator');

export const itadApiKey = createItadApiKey('SteamGifts Annotator');
