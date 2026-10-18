# Ekko SteamGifts Annotator

## Features

對 SteamGifts 特定頁面，撈出相關特定對照資料，整合填過來顯示在頁面上：

- 這款遊戲我想要的程度？
- 這款遊戲的史低價、我想要的價格？（只有期待度 4 或 5 的遊戲，按了才查）
- 區域限制涵蓋多少區域數量？

標了更新年份的遊戲，年份旁另外有一個 ↻，按下去用 Steam 的最新資料刷新 Sheet 裡這款遊戲的那一列。

遊戲先用 Steam 連結的 AppID 對 Sheet 名稱欄 HYPERLINK 的 AppID，對不到才比名稱，所以中英文名稱不同也對得到。Sheet 裡對不到的遊戲標成 `(無)`。

每個標註最後（例如 `(W4) (Y19↻) ⟲`、`(無) ⟲`）有一個 ⟲：在 Sheet 改了這款遊戲（例如期待度）或補上它之後按一下，只重新讀這款遊戲，不用等快取過期。

## Installation

1. Install [Violentmonkey](https://addons.mozilla.org/en-us/firefox/addon/violentmonkey/) (Firefox) or [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) (Chrome) / [Tampermonkey](https://addons.opera.com/en/extensions/details/tampermonkey-beta/) (Opera).
2. Open `https://yifanchen99.github.io/game-watchlist-keeper/steamgifts/Script.user.js` or click [here](https://yifanchen99.github.io/game-watchlist-keeper/steamgifts/Script.user.js)
3. Click `Install`.
4. 第一次在 SteamGifts 上執行時，輸入 Sheet API 的 token（Apps Script 專案設定裡的 `API_TOKEN`）。

## Usage

自動在作用頁面是列表頁（`/giveaways/search`）與單一抽獎頁（`/giveaway/`）時，標記：

- **這款遊戲我想不想要？** 撈特定的一份 Google Sheet。在點數後面附上期待度，例如 `(W3)`。如果該筆紀錄太久沒更新，再多標一個更新年份，例如 `(Y19)`。
   - 比對：抽獎的 Steam 連結有 AppID 時，先找名稱欄 HYPERLINK 連到同一個 AppID 的列；沒有 AppID（組合包的 `sub/` 連結）或找不到時，才用名稱比對（正規化、`/` 分隔的別名、去掉 `xxx Edition`，沒有完全相同的就取部分包含）。
- **區域限制涵蓋多少區域數量？** 有區域限制的抽獎，解析出區域數量，補在區域圖示旁邊。

撈取的資料有快取機制。

**🔍 查價**：對到的遊戲有 AppID、且購買/期待度是 4 或 5 時，期待度的括號裡有一個線條放大鏡（跟標註同色，不是彩色 emoji），例如 `(W4🔍)`。按下去才用 web app 的單列查詢，以 AppID 讀 Sheet 的 目標價 與最低$，在旁邊顯示 `$50, 史$90`（`$` 是想要的價格，`史$` 是史低價，跟 `userscript-itad-mail` 的順序相同；對到多款時只查 4 或 5 的那幾款，用 ` / ` 隔開），1 分鐘後或點一下就消失；錯誤訊息保留到點掉為止。價格來自 `@watchlist/price-lookup`，四捨五入成整數，空白的格子顯示 `-`，過時的史低價（最低off 有 `!`）顯示成 `史$!90`。

**↻ 刷新**：標註裡有年份（`(Y19)`，或從沒更新過的 `(Y-)`）、遊戲的 Steam 連結有 AppID（組合包的 `sub/` 連結沒有），而且對到的遊戲 購買/期待度 都不是 4 或 5 時（目前評價還無法更新，先擋掉這兩種），↻ 放在年份的括號裡，例如 `(W4) (Y19↻)`。按下去會抓 Steam 商店頁與評論，照 `@watchlist/game-record-writer` 的規則（`COLUMNS.md`）寫回 Sheet 的那一列，結果顯示在按鈕旁：

- 成功：`已更新。` 加上變動（例如 `原價 400 → 408（+8）`），1 分鐘後或點一下就消失。標註與 localStorage 的 `ekkoGames` 會跟著改成今天更新，不重抓整張表，所以年份和 ↻ 一起消失。
- Sheet 沒有這款遊戲：只提示，不新增（新增在 Steam 商店頁用 `userscript-steam` 做）。這個訊息和錯誤訊息都保留到點掉為止。
- 最低off 不會更新：SteamGifts 上沒有 SteamDB 區塊。舊值是數字時會改成 `!<舊值>`，表示可能過時（規則見 `game-record-writer` 的 COLUMNS.md「最低off」）。

**⟲ 重新讀取**：每個標註最後都有，在 Sheet 手動改了、新增或補好這款遊戲後按：

- 有 AppID：只用 web app 的單列查詢（`action=row`）抓這款遊戲那一列，照整表傾印的規則（`toDumpRow`）換掉快取裡同 AppID 的遊戲，寫回 localStorage 的 `ekkoGames`（`time` 不變）。Sheet 沒有這款遊戲時（例如已經刪掉）從快取拿掉並提示到 Steam 商店頁新增；期待度空白或 0 的列跟整表傾印一樣不標註，也會提示。
- 沒有 AppID（組合包），或只靠名稱對到（Sheet 的名稱沒有連到這個 AppID，單列查詢找不到）：略過快取重抓整張表。同時按好幾個只會抓一次。

之後重新標註頁面上所有遊戲，結果顯示在 ⟲ 旁：`已重新讀取。` 或還是對不到的原因，1 分鐘後或點一下就消失；抓取失敗的錯誤訊息保留到點掉為止。

第一次使用時，Tampermonkey 會要求允許連線到 `store.steampowered.com`。

## Development

### Build & Deploy

原始碼是 TypeScript，`pnpm build` 用 esbuild 打包成單一支 `dist/Script.user.js`（不壓縮，因為使用者會在 Tampermonkey 裡直接讀到它）。

本 package 位於 `game-watchlist-keeper` monorepo 的 `packages/userscript-steamgifts`，在 monorepo 根目錄執行：

```sh
pnpm install
pnpm --filter @watchlist/userscript-steamgifts check   # tsc --noEmit + ESLint
pnpm --filter @watchlist/userscript-steamgifts build   # 產出 dist/Script.user.js
```

`dist/` 不進版控。push 到 `main` 後由 monorepo 根目錄的 `.github/workflows/pages.yml` 建置並發佈到 GitHub Pages。版本號照根目錄的 `version-bump` skill 調整。

metadata block 的唯一來源是 `scripts/metadata.mjs`，build 時產生。省略 `@updateURL`，讓 Tampermonkey 直接用 `@downloadURL` 做更新檢查，所以不需要額外維護 `.meta.js`。

### Architecture

`src/main.ts` 是進入點，依網址判斷是列表頁（`/giveaways/search`）或單一頁（`/giveaway/`），再呼叫對應的 modifier。

#### `src/tampermonkey.ts` — 請求與 token

- `fetchText` / `postText`：用 `GM_xmlhttpRequest` 實作，注入給 library。
- `withSheetApi()`：web app 需要 token。第一次使用時跳出輸入框，存進 Tampermonkey 的 `sheetApiToken`；token 被拒絕時會清掉並再問一次。

#### `src/sheetFetcher.ts` — 取資料

負責透過 `@watchlist/sheet-api` 從 Apps Script web app（`packages/apps-script`）取得 sheet 內容，並使用快取。

- `fetchData()`：實際發出請求，回應直接存進 localStorage 的 `ekkoGames`，並附上 `time` 時戳。
- `getOrFetchData()`：對外的入口。快取未過期就直接沿用，否則重新抓取。回傳 `{ time, games, labelMap }`。
- `refetchGame()`：⟲ 用的單列重抓，讀名稱、更新日、購買/期待度、AnyDeal 四欄，轉成跟整表傾印一樣的一筆。
- `markUpdated()`：刷新後把快取裡同名（`B` 等於名稱格）的遊戲的 `G` 改成今天，`time` 不變，所以快取照原本的時間過期。

sheet 資料以欄位代號存取（`B` 遊戲名、`G` 日期、`K` 想要程度，見 `src/types.ts`），另有名稱 HYPERLINK 的 `appId`。這一層不對內容做任何加工。

#### `src/domModifier.ts` — 比對與改 DOM

把 sheet 資料對應到畫面上的遊戲，並將結果附加上去。

- 標題：先用 AppID、再用名稱比對（`matchHeader`），補上 期待度 與 更新時間（如果太久）。標註放在 `.ekko-annotation` 裡，再跑一次會整段換掉；有年份時在括號裡放 ↻，對不到遊戲時標 `(無)`；⟲ 放在標註最後（同一個標題的按鈕會重用，執行中的狀態不會被重畫打斷）。`useSheetData()` 換成重抓的表。
- 區域限制：（與 sheet 無關）另外抓取各遊戲的區域限制頁面取得數量後標示，並快取結果。

#### `src/refreshButton.ts`、`src/refresh.ts` — ↻ 刷新

- `RefreshButton`：↻ 按鈕與狀態訊息，由 `HeaderModifier` 放進標註。狀態訊息放在標註後面，所以 ↻ 消失後訊息還在。
- `findAppId()`：從標題區塊的 Steam 連結取 AppID。
- `refreshRow()`：呼叫 `@watchlist/game-record-writer` 的 `refreshGame`。讀舊值時順便讀名稱欄，交給 `markUpdated()` 找快取裡的那一筆。

#### `src/resyncButton.ts` — ⟲ 重新讀取

- `ResyncButton`：⟲ 按鈕與狀態訊息。要抓哪一列由 `HeaderModifier.resyncAppId` 決定；重抓與重新標註由 `src/main.ts` 的 `onResync` 做（有 AppID 用 `refetchGame()`，沒有用 `fetchData()`；不論成敗都再 `useSheetData()` → 重跑 modify）。

`src/widgets.ts` 是 ↻ 和 ⟲ 共用的按鈕樣式與狀態訊息框（`StatusBubble`）。

localStorage 用到的 key 列在 `src/main.ts` 開頭的註解。
