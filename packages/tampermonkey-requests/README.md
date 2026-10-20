# @watchlist/tampermonkey-requests

給 userscript 用的請求與 Tampermonkey 裡的憑證，四支 userscript（steam、steamgifts、itad-mail、sheet）共用：

- `fetchText` / `postText`：用 `GM_xmlhttpRequest` 發請求（會跟著 redirect）。`postText` 注入給 `sheet-api`（所有請求都是 POST，token 放在 body），`fetchText` 注入給 `steam-info-scraper` 等抓網頁的 library，可以帶額外的 header（例如 ITAD 的 API key，不放 URL 是因為失敗時的錯誤訊息會帶 URL）。非 2xx 時丟出 `@watchlist/core` 的 `HttpStatusError`（帶 `status`）。
- `createWithSheetApi(scriptName)`：回傳 `withSheetApi(run)`，用存在 Tampermonkey 儲存（`sheetApiToken`）的 token 建立 `sheet-api` client 再執行 `run`。沒有 token 時跳出輸入框（開頭是 `scriptName`）；token 被拒絕時刪掉、再問一次，第二次還被拒絕就丟出錯誤。
- `createItadApiKey(scriptName)`：IsThereAnyDeal 的 API key，存在 `itadApiKey`。`get()` 沒有 key 時跳出輸入框，取消就回 `undefined`（最低off 只看 SteamDB 區塊，下次再問）。ITAD 的請求在 `game-record-writer` 裡，失敗不會讓更新失敗，所以不自動重試：拿 `refreshGame` / `addGame` 回傳的 `itadError` 呼叫 `forgetIfRefused`，是 401 / 403 就刪掉 key，下次再問。
- `runSetupPage(scriptName, secrets)`：在[設定頁](https://yifanchen99.github.io/game-watchlist-keeper/setup.html)（`setupPageUrl`，由 `scripts/collect-pages.mjs` 產生）上列出這支腳本與它存了哪些值，按「儲存」時把輸入框的值存進這支腳本自己的儲存，留白的不動；所有腳本都讀完這次點擊後才清空輸入框。回傳是不是設定頁，是的話 userscript 就不做別的事。Tampermonkey 的儲存是每支腳本各自一份，沒有共用的 API，所以靠每支腳本都 `@match` 這一頁，輸入一次就存進每一支。頁面本身沒有程式、不載入其他資源、不送出任何東西；它跟 userscript 都從同一個 Pages 網站來，所以沒有多信任別人。

這是唯一直接呼叫 `GM_*` 的 library，其他 library 仍然只接收注入的 fetch 函式。

使用的 userscript 要宣告：

- `@grant` `GM_xmlhttpRequest`、`GM_getValue`、`GM_setValue`、`GM_deleteValue`
- `@match` 設定頁的網址（`setupPageUrl`）
- `@connect` `script.google.com`、`script.googleusercontent.com`（`/exec` 會 redirect 到這裡），用 ITAD key 時加上 `api.isthereanydeal.com`，以及 `fetchText` 要連的其他網站

## Token 與 API key 存放

ITAD 的 API key（`itadApiKey`）跟 token 一樣存放，外洩時到 ITAD 的 app 設定重新產生，舊的被拒絕後會自動要求重新輸入。


- token 以**明文**存在 Tampermonkey 的腳本儲存（key 是 `sheetApiToken`），不加密，只留在這個瀏覽器的本地，不會同步到其他瀏覽器或電腦（除非開了 Tampermonkey 的同步或匯出備份）。
- 儲存是每支腳本各自一份。在設定頁輸入一次，就會存進每支已安裝的腳本；沒用設定頁的話，每支 userscript 第一次都要各自輸入一次。
- 能讀這個瀏覽器設定檔的人（或 Tampermonkey 的「儲存」分頁、匯出檔）都看得到 token。外洩時到 Apps Script 換掉 `API_TOKEN`，各 userscript 下次被拒絕後會自動要求重新輸入。
