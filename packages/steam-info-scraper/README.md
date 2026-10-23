# @watchlist/steam-info-scraper

抓 Steam 與 IsThereAnyDeal（ITAD），把一款遊戲的資料解析成原始值（數字、字串、日期），前身是 [tampermonkey--steam-info-scraper](https://github.com/YiFanChen99/tampermonkey--steam-info-scraper)（已封存）。

不含任何 Sheet 格式；轉成 Sheet 欄位是 `@watchlist/game-record-writer` 的事。

## Features

| 來源 | 函式 | 取得 |
| --- | --- | --- |
| 商店頁 | `parseStorePage` | 名稱、原價（TWD，特價時取原價，免費為 `0`）、發售日、搶先體驗、Demo、支援介面的語言、使用者標籤 |
| `IUserReviewsService/GetAppReviews` API（`reviewSummaryUrl`） | `parseReviewSummary` | 商店頁「所有評論」的正評數 / 總評論數 |
| `IUserReviewsService/GetAppReviews` API（`appReviewsUrl`） | `parseReviewSample` | 抽樣評論者的遊玩時數（分鐘） |
| SteamDB 擴充套件的區塊 | `readSteamDbPrices` / `parseSteamDbPrices` | 史低價格 |
| ITAD API（`itadLookupUrl`、`itadHistoryUrl`） | `parseItadLookup` / `parseItadHistory` | Steam AppID 對應的 ITAD 遊戲；Steam TW 的每一筆價格紀錄（價格、當時的原價、時間） |

- `fetchSteamSnapshot(appId, fetchText)`：抓商店頁、評論數與時長抽樣，回傳 `{ page, reviews }`。評論數要等商店頁回來，才知道是不是免費遊戲。
- `fetchItadPriceHistory(appId, fetchText, apiKey)`：查 ITAD 的遊戲，再抓它全部的價格紀錄，新的在前；ITAD 沒收錄時回 `null`。怎麼從紀錄算出史低是 `game-record-writer` 的事。
- `parseReleaseDate`：讀 Steam 的日期文字（`2020 年 9 月 17 日`、`17 Sep, 2020` 等）；`2026 年第四季` 之類不是完整日期的，`date` 為 `null`。

## Usage

### 前提

- 不直接發網路請求：`fetchSteamSnapshot` 的 `fetchText` 由呼叫端注入（userscript 用 `GM_xmlhttpRequest`，測試用 fixtures），所以能在 Node 上跑測試。HTML 預設用瀏覽器的 `DOMParser` 解析，Node 上要傳 `parseHtml`。
- 商店頁要用 `storePageFetchUrl` 抓：它固定 `l=tchinese&cc=tw`，解析器依賴繁中字樣與台幣價格。使用者開著的商店頁如果已經是繁中（`<html lang="zh-tw">`）、台幣（`meta[itemprop="priceCurrency"]` 是 `TWD`；沒有價格的頁面沒有這個 meta，也不需要），`matchesFetchedStorePage` 回 true，`fetchSteamSnapshot` 的 `openPage` 就直接解析它，不重抓；不符合時照樣抓。
- 評論用官方的 [`IUserReviewsService/GetAppReviews`](https://partner.steamgames.com/doc/webapi/IUserReviewsService)（`api.steampowered.com`，所以 userscript 要 `@connect api.steampowered.com`）：
   - 商店的 `/appreviews/<appid>` 已 deprecated（[User Reviews](https://partner.steamgames.com/doc/store/getreviews)），2026-10-23 起不管哪款遊戲都 302 回商店首頁（HTML）。商店頁自己用的 `/ajaxappreviews/<appid>` 結果相同，但沒有文件。
   - 參數放在 `input_json`，值是 enum 的數字（`filter` 0 依有幫助程度、1 依發表時間；`purchase_type` 0 Steam 購買者、1 全部）。`languages` 是陣列，沒給時只算英文，所以固定 `['all']`。
   - 回應包在 `response` 裡，沒有 `success`；沒有評論符合時沒有 `reviews`，appid 不存在時回 200 和空的 `response`（`parseReviewSummary` / `parseReviewSample` 會拋錯）。`num_per_page: 0` 等於預設的 20 篇，所以評論數只要 1 篇。
   - 不用 key；不帶 key 時共用較低的限流，超過回 429。
- 評價度不從商店頁讀：匿名抓到的頁面只顯示訪客語言和近 30 天的評論。改用 `reviewSummaryUrl` 取得「所有評論」的數字：所有語言、全期、排除離題評論活動，只算 Steam 購買者（免費遊戲算全部購買類型）。實測（2026-10-18）跟商店頁顯示的一致，例如 Hades 287,080 篇、97.99%。
- 時長抽樣用 `appReviewsUrl`：跟商店頁自己的評論列表一樣（近 30 天、依有幫助程度），只有語言是全部，每次 `reviewSampleSize`（40）篇。抽到不到 `reviewSampleMinimumRatio`（8 成，32 篇）時依序改抽 `reviewSampleQueries` 的下一個：近 365 天依有幫助程度（`day_range` 最多只能到 365），再來是依發表時間由新到舊（`filter` 1，不限期間）。
   - 範圍內一篇都沒有時，Steam 會自動放寬到全期；範圍內只有幾篇時就只回那幾篇，所以近一年只有零星評論的遊戲要靠 `recent`（實測 2026-10-18：403700 總共 300 篇，365 天只抽到 7 篇，`recent` 抽到 40 篇）。
   - `recent` 不當第一步：熱門遊戲的 40 篇只涵蓋最近一天，作者剛寫完評論、時數還沒累積，中位數會偏低（Hades 近 30 天有幫助的是 38H，`recent` 是 21–40H，同一小時內就會跳）。這組參數不影響評價度：`day_range`、`filter` 都不會改變 `query_summary`。
- ITAD 的 API key 放在 `ITAD-API-Key` header（`itadApiKeyHeaders`），不放 URL：`fetchText` 失敗時的錯誤訊息會帶 URL。
- ITAD 的價格紀錄只在價格變動時新增一筆；TW 的紀錄從 2024-12-11 才開始，那之前就有的遊戲第一筆都是這天。`/games/history/v2` 不帶 `since` 只回最近幾個月，所以固定帶 2010 年。
- SteamDB 區塊不在抓下來的 HTML 裡，只能在使用者開著的商店頁上讀，而且擴充套件是在頁面載入後才加上去，要用到時再呼叫 `readSteamDbPrices(document)`；沒有區塊時回 `null`。

### 使用者

- `game-record-writer`：`fetchSteamSnapshot` 與各型別，組出新增 / 更新列的欄位值。
- `userscript-steam`：在商店頁上 `readSteamDbPrices`。

## Development

在 monorepo 根目錄：

```sh
pnpm --filter @watchlist/steam-info-scraper test       # vitest，跑 test/fixtures 的離線資料
pnpm --filter @watchlist/steam-info-scraper fixtures   # 重新抓 fixtures（scripts/fetch-fixtures.mjs）；有 ITAD_API_KEY 環境變數才抓 ITAD，加 --itad-only 只抓 ITAD
```

- fixtures 涵蓋的情境與注意事項見 [`test/fixtures/README.md`](test/fixtures/README.md)。重抓後價格、評論數會變，測試的期望值要跟著更新。
- `scripts/fetch-fixtures.mjs` 無法 import `src/urls.ts`、`src/itad.ts`，評論查詢參數與 ITAD 的 URL 是複製一份的，改 `appReviewsUrl`、`reviewSummaryUrl`、`itadLookupUrl`、`itadHistoryUrl` 時兩邊要一起改。
