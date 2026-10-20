import { itadApiKeyKey, runSetupPage, tokenKey } from '@watchlist/tampermonkey-requests';

import { startSheetWriter } from './sheetWriter';
import { scriptName } from './tampermonkey';

/**
 * Tampermonkey storage keys:
 *  sheetApiToken: the token the Apps Script web app checks
 *  itadApiKey: the IsThereAnyDeal API key 最低off is taken with
 */

if (!runSetupPage(scriptName, [tokenKey, itadApiKeyKey])) {
    startSheetWriter();
}
