# @watchlist/sheet-api

Sheet Web App（`@watchlist/apps-script`）的協定與 client。server 和 client 都引用這個 package，所以兩端用的是同一份定義。

## 協定（兩端共用）

- 請求與回應的型別：`SheetApiRequestBody`、`RowResponse`、`WriteResponse`、`SheetDump` 等。
- 錯誤碼 `SheetApiErrorCode`，以及 client 端對應的 `SheetApiError` / `SheetApiUnauthorizedError`。
- `toDumpRow`：Sheet 的一列怎麼轉成傾印裡的一列。Web App 做整表傾印時用它，client 讀單列時也用它（`userscript-steamgifts`），所以兩邊套用同一套規則。

## Client（userscript 端）

- `createSheetApi({ webAppUrl, token, postText })` 回傳 `SheetApi`。`postText` 由外部注入，所以可以直接在 Node 上測試。
- `deployedWebAppUrl`：userscript 呼叫的部署 URL。放在這裡，是因為要知道 URL 的是 client。
- `tampermonkey-requests` 負責建立 client（token 存在 Tampermonkey）。`game-record-writer`、`price-lookup` 和各支 userscript 只用 `SheetApi` 介面與錯誤型別。

各個 action 的行為、快取與部署步驟見 [`apps-script` 的 README](../apps-script/README.md)。
