import { createWithSheetApi } from '@watchlist/tampermonkey-requests';

/** Starts its prompts and its line on the setup page. */
export const scriptName = 'ITAD Mail Annotator';

export const withSheetApi = createWithSheetApi(scriptName);
