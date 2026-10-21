# @watchlist/apps-script

Sheet 的 Web App（server 端），負責查詢與寫入遊戲追蹤 Sheet，綁定在 Sheet 上。請求 / 回應的型別、錯誤碼、傾印列規則都定義在 `@watchlist/sheet-api`，這裡只實作；userscript 透過同一個 package 的 client 呼叫。

## 行為

所有請求都是 `POST`，body 是 JSON 的 `SheetApiRequestBody`：`{ token, action, ... }`。`token` 跟 script property `API_TOKEN` 比對，沒設定 `API_TOKEN` 時一律拒絕；token 只放在 body，不放在 URL，免得留在 log 或瀏覽紀錄裡。拒絕時回 `{ error, message }`（HTTP 仍是 200）。body 不是 JSON 物件時回 `invalid`；先比對 token 再看 `action`。

- `doGet`：一律回 `invalid`（訊息請使用者更新 userscript）。保留它是讓 GET 拿到正常的錯誤，而不是 Apps Script 找不到函式的頁面；不回 `unauthorized`，是因為改成 POST 之前的舊版 userscript 收到 `unauthorized` 會刪掉存好的 token。
- `doPost`：依 `action` 分派：
  - `dump`：`STEAM` 工作表的整表傾印（`{ games, labelMap }`）。每個遊戲帶上名稱 HYPERLINK 連到的 `appId`（名稱不是 HYPERLINK 時省略）；列的轉換規則是 `@watchlist/sheet-api` 的 `toDumpRow`，讓 client 讀單列時套用同一套規則。
  - `find` + `appId`：名稱欄連到這個 AppID 的那一列，回 `{ row }`；沒有這一列時回 `{ row: null, tagRules }`，`tagRules` 是標籤規則分頁的顯示值（第 1 列是標題），沒有這個分頁時是 `null`。分頁用固定的 gid 找（`@watchlist/game-record-writer` 的 `tagRulesWorksheetId`，`143895865`），不看名稱。規則只在新增時用到，所以有這一列時不讀。給 `userscript-steam` 開頁時判斷要新增還是更新，規則的格式由 `@watchlist/game-record-writer` 的 `parseTagRules` 解讀（見它的 COLUMNS.md「標籤規則」），server 不檢查。
  - `row` + `appId` + `columns`（欄名陣列）：名稱欄連到這個 AppID 的那一列，回 `{ row, values, url }`。日期格式是 `YYYY/M/D`；`url` 開啟 Sheet 並選取整列（`#gid=<工作表>&range=<列>:<列>`）。`columns` 是空的時只回 `{ row, values: {} }`（只找列號，不多讀格子；`find` 之前的 userscript 用這個）。
  - `row` + `row`（列號）+ `columns`：用列號讀那一列，回 `{ row, appId, values, url }`，`appId` 取自它名稱欄的 HYPERLINK。給只知道列號的 client（`userscript-sheet`）用。只讀那一列的格子，不用 AppID 索引。名稱不是 HYPERLINK 時回 `not-found`。
  - `update` + `appId` + `values`：只寫指定的欄位。名稱、公式欄（例如 最低$）不能寫，目前含公式的格子也不能寫。
    - 帶 `row` 時直接寫那一列、不用 AppID 找列（不用索引），但那一列的名稱必須還連到 `appId`，否則回 `not-found`（例如中間插入或刪除了列）。
  - `append` + `appId` + `values`：先確認 Sheet 沒有這個 AppID（有的話回 `duplicate`），再在第 3 列後插入一列空白列（原本第 4 列起往下移一列），寫進新的第 4 列。第 3 列的公式（名稱除外）用 R1C1 複製下來，其餘寫入指定欄位。
  - `update`、`append` 寫入期間持有 script lock，寫完清掉傾印快取。
  - 其他 `action` 回 `invalid`。
- 欄位一律以第 1 列的標題名稱定位。AppID 只從名稱欄的 HYPERLINK 公式找（名稱一律是 HYPERLINK，沒有用「插入連結」的格子）。
- 三份快取都 gzip 後分塊存在 CacheService，最長 6 小時：
  - **整表傾印**（`dump:v2`）：寫入後清掉。重建時讀的名稱欄公式也拿來順便重建 AppID 索引快取。
  - **AppID → 列號索引**：讓單列查詢不必每次讀整個名稱欄。用到快取裡的列號前，會先讀那一格的公式確認還是同一個 AppID，不符就重新掃描，所以快取過期也不會讀錯或寫錯列。`append` 一律重新掃描來防重複，寫完把第 4 列起的列號加 1，再把新列加進索引。
  - **標籤規則**（`tagRules:v1`）：標籤規則分頁的顯示值（沒有分頁時也記下 `null`）。
  - 手動編輯 Sheet（任何分頁）時由 `onEdit` 三份都清掉；插入、刪除、排序整列不會觸發 `onEdit`，由 `onChange` 清掉（要手動設定觸發條件，見下方）。
- `WantToOwned`：Sheet 自訂函式，沿用原專案。

部署設定在 `appsscript.json`：以部署者身分執行（`USER_DEPLOYING`）、匿名存取（`ANYONE_ANONYMOUS`），由 token 把關。

## 目錄

- `src/`：原始碼。`main.ts` 的每個 export 都會在 `dist/Code.js` 尾端宣告成全域函式（清單在 `scripts/build.mjs`）。
- `original/`：搬進 repo 前的線上程式碼快照，只供參考，不會部署。
- `dist/`：`pnpm build` 的產出（`Code.js` + `appsscript.json`），也是 `.clasp.json` 的 `rootDir`。不進版控。

## 部署

repo 是唯一來源：`clasp push` 會整包覆蓋線上專案，不要在網頁編輯器改程式碼。

第一次使用：到 <https://script.google.com/home/usersettings> 開啟「Google Apps Script API」，再執行 `pnpm dlx @google/clasp login`（用擁有專案的帳號）。

在本目錄執行：

```sh
pnpm push                                            # build 後 clasp push，更新線上 HEAD
pnpm dlx @google/clasp deployments                   # 列出部署
pnpm dlx @google/clasp deploy -i <deploymentId>      # 把既有部署更新到新版本，/exec URL 不變
```

`clasp deploy` 不帶 `-i` 會新建一個部署（新的 URL）。userscript 用的部署 URL 寫在 `packages/sheet-api/src/index.ts` 的 `deployedWebAppUrl`。

### onChange 觸發條件（設定一次）

`onEdit` 是簡單觸發條件，會自動執行；`onChange` 是可安裝的觸發條件，要手動新增：Apps Script 編輯器 → 左側「觸發條件」→「新增觸發條件」→ 函式選 `onChange`、事件來源選「試算表」、事件類型選「變更時」→ 儲存並授權。

沒設定也不會寫錯資料（見上方的確認機制），只是插入或刪除整列之後，頁面上的按鈕最多有 6 小時可能顯示錯（例如已經刪掉的遊戲仍顯示「↻ 更新」）。

### token

在 Apps Script 網頁編輯器的「專案設定」→「指令碼屬性」新增 `API_TOKEN`。每台電腦的 userscript 第一次執行時會要求輸入同一個值。
