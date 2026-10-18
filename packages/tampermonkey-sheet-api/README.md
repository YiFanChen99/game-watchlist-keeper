# @watchlist/tampermonkey-sheet-api

給 userscript 用的 Sheet API 接線，三支 userscript（steam、steamgifts、itad-mail）共用：

- `fetchText` / `postText`：用 `GM_xmlhttpRequest` 發請求（會跟著 redirect），注入給 `sheet-api`、`steam-info-scraper` 等 library。
- `createWithSheetApi(scriptName)`：回傳 `withSheetApi(run)`，用存在 Tampermonkey 儲存（`sheetApiToken`）的 token 建立 `sheet-api` client 再執行 `run`。沒有 token 時跳出輸入框（開頭是 `scriptName`）；token 被拒絕時刪掉、再問一次，第二次還被拒絕就丟出錯誤。

這是唯一直接呼叫 `GM_*` 的 library，其他 library 仍然只接收注入的 fetch 函式。Tampermonkey 的儲存是每支腳本各自一份，所以每支 userscript 第一次都要輸入一次 token。

使用的 userscript 要宣告：

- `@grant` `GM_xmlhttpRequest`、`GM_getValue`、`GM_setValue`、`GM_deleteValue`
- `@connect` `script.google.com`、`script.googleusercontent.com`（`/exec` 會 redirect 到這裡），以及 `fetchText` 要連的其他網站
