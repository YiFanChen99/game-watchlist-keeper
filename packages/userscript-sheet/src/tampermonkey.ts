import { createItadApiKey, createWithSheetApi } from '@watchlist/tampermonkey-requests';

/** Starts its prompts and its line on the setup page. */
export const scriptName = 'Sheet Row Updater';

export { fetchText } from '@watchlist/tampermonkey-requests';

export const withSheetApi = createWithSheetApi(scriptName);

export const itadApiKey = createItadApiKey(scriptName);
