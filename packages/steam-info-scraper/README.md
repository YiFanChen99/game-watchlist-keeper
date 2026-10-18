# @watchlist/steam-info-scraper

抓 Steam 並把一款遊戲的資料解析成原始值（數字、字串、日期），前身是 [tampermonkey--steam-info-scraper](https://github.com/YiFanChen99/tampermonkey--steam-info-scraper)（已封存）。

不含任何 Sheet 格式；轉成 Sheet 欄位是 `@watchlist/game-record-writer` 的事。

## Features

| 來源 | 函式 | 取得 |
| --- | --- | --- |
| 商店頁 | `parseStorePage` | 名稱、原價（TWD，特價時取原價，免費為 `0`）、發售日、搶先體驗、Demo、支援介面的語言、使用者標籤 |
| `/appreviews` API（`reviewSummaryUrl`） | `parseReviewSummary` | 商店頁「所有評論」的正評數 / 總評論數 |
| `/appreviews` API（`appReviewsUrl`） | `parseReviewSample` | 抽樣評論者的遊玩時數（分鐘） |
| SteamDB 擴充套件的區塊 | `readSteamDbPrices` / `parseSteamDbPrices` | 史低價格 |

- `fetchSteamSnapshot(appId, fetchText)`：抓商店頁、評論數與時長抽樣，回傳 `{ page, reviews }`。評論數要等商店頁回來，才知道是不是免費遊戲。
- `parseReleaseDate`：讀 Steam 的日期文字（`2020 年 9 月 17 日`、`17 Sep, 2020` 等）；`2026 年第四季` 之類不是完整日期的，`date` 為 `null`。

## Usage

### 前提

- 不直接發網路請求：`fetchSteamSnapshot` 的 `fetchText` 由呼叫端注入（userscript 用 `GM_xmlhttpRequest`，測試用 fixtures），所以能在 Node 上跑測試。HTML 預設用瀏覽器的 `DOMParser` 解析，Node 上要傳 `parseHtml`。
- 商店頁要用 `storePageFetchUrl` 抓：它固定 `l=tchinese&cc=tw`，解析器依賴繁中字樣與台幣價格。使用者開著的商店頁如果已經是繁中（`<html lang="zh-tw">`）、台幣（`meta[itemprop="priceCurrency"]` 是 `TWD`；沒有價格的頁面沒有這個 meta，也不需要），`matchesFetchedStorePage` 回 true，`fetchSteamSnapshot` 的 `openPage` 就直接解析它，不重抓；不符合時照樣抓。
- 評價度不從商店頁讀：匿名抓到的頁面只顯示訪客語言和近 30 天的評論。改用 `reviewSummaryUrl` 取得「所有評論」的數字：所有語言、全期、排除離題評論活動，只算 Steam 購買者（免費遊戲算全部購買類型）。實測（2026-10-18）跟商店頁顯示的一致，例如 Hades 287,080 篇、97.99%。
- 時長抽樣用 `appReviewsUrl`：跟商店頁自己的評論列表一樣（近 30 天、依有幫助程度），只有 `language=all`，每次 40 篇。近 30 天不到 40 篇時（冷門遊戲）改抽近 365 天，API 最多只到 365 天。這組參數不影響評價度：`day_range`、`filter` 都不會改變 `query_summary`。
- SteamDB 區塊不在抓下來的 HTML 裡，只能在使用者開著的商店頁上讀，而且擴充套件是在頁面載入後才加上去，要用到時再呼叫 `readSteamDbPrices(document)`；沒有區塊時回 `null`。

### 使用者

- `game-record-writer`：`fetchSteamSnapshot` 與各型別，組出新增 / 更新列的欄位值。
- `userscript-steam`：在商店頁上 `readSteamDbPrices`。

## Development

在 monorepo 根目錄：

```sh
pnpm --filter @watchlist/steam-info-scraper test       # vitest，跑 test/fixtures 的離線資料
pnpm --filter @watchlist/steam-info-scraper fixtures   # 重新抓 fixtures（scripts/fetch-fixtures.mjs）
```

- fixtures 涵蓋的情境與注意事項見 [`test/fixtures/README.md`](test/fixtures/README.md)。重抓後價格、評論數會變，測試的期望值要跟著更新。
- `scripts/fetch-fixtures.mjs` 無法 import `src/urls.ts`，評論查詢參數是複製一份的，改 `appReviewsUrl` 時兩邊要一起改。
