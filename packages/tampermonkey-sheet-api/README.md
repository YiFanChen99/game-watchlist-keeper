# @watchlist/tampermonkey-sheet-api

給 userscript 用的 Sheet API 接線，四支 userscript（steam、steamgifts、itad-mail、sheet）共用：

- `fetchText` / `postText`：用 `GM_xmlhttpRequest` 發請求（會跟著 redirect）。`postText` 注入給 `sheet-api`（所有請求都是 POST，token 放在 body），`fetchText` 注入給 `steam-info-scraper` 等抓網頁的 library。
- `createWithSheetApi(scriptName)`：回傳 `withSheetApi(run)`，用存在 Tampermonkey 儲存（`sheetApiToken`）的 token 建立 `sheet-api` client 再執行 `run`。沒有 token 時跳出輸入框（開頭是 `scriptName`）；token 被拒絕時刪掉、再問一次，第二次還被拒絕就丟出錯誤。

這是唯一直接呼叫 `GM_*` 的 library，其他 library 仍然只接收注入的 fetch 函式。

使用的 userscript 要宣告：

- `@grant` `GM_xmlhttpRequest`、`GM_getValue`、`GM_setValue`、`GM_deleteValue`
- `@connect` `script.google.com`、`script.googleusercontent.com`（`/exec` 會 redirect 到這裡），以及 `fetchText` 要連的其他網站

## Token 存放

- token 以**明文**存在 Tampermonkey 的腳本儲存（key 是 `sheetApiToken`），不加密，只留在這個瀏覽器的本地，不會同步到其他瀏覽器或電腦（除非開了 Tampermonkey 的同步或匯出備份）。
- 儲存是每支腳本各自一份，所以同一個瀏覽器裡的每支 userscript 第一次都要輸入一次 token。
- 能讀這個瀏覽器設定檔的人（或 Tampermonkey 的「儲存」分頁、匯出檔）都看得到 token。外洩時到 Apps Script 換掉 `API_TOKEN`，各 userscript 下次被拒絕後會自動要求重新輸入。
