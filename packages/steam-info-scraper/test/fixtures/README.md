# Fixtures

由 `pnpm --filter @watchlist/steam-info-scraper fixtures`（`scripts/fetch-fixtures.mjs`）抓取，2026-10-17；後面帶 appid 時只抓那幾款。

- `store/<appid>.html`：以匿名訪客抓的商店頁（`l=tchinese&cc=tw`）
- `appreviews/<appid>.json`：用跟 `src/urls.ts` 的 `appReviewsUrl` 相同的參數抓取，只保留解析會讀的欄位，不含評論內文。目前的檔案是 2026-10-17 用舊參數（`num_per_page=50`、沒有明確帶 `day_range` 等）抓的，每款 50 篇；實測新舊參數選到的評論相同，只差篇數。下次重抓就會變成 40 篇。裡面的 `query_summary` 是舊算法（所有購買類型）的數字，現在已經不讀。
- `reviewsummary/<appid>.json`：`reviewSummaryUrl` 的回應（只有 `query_summary`），2026-10-18 抓的；Dota 2 用 `purchase_type=all`（免費遊戲），其他用 `steam`。

| appid | 遊戲 | 涵蓋情境 |
|---|---|---|
| 1145360 | Hades | 已發售、原價、只支援簡中 |
| 1562430 | DREDGE | 本體前面有 Digital Deluxe Edition 的區塊（取本體）、支援繁中 |
| 2868840 | Slay the Spire 2 | 搶先體驗；頁面有帶小數價格的組合包（需排除） |
| 1966720 | Lethal Company | 搶先體驗、只支援英文 |
| 3669620 | Warhammer Survivors | 尚未發售、沒有價格、有 Demo、沒有評論 |
| 570 | Dota 2 | 免費遊玩 |
| 1860960 | 埃拉的呼喚（Eira） | 已不再於 Steam 商店中提供：沒有購買區、沒有價格，也不顯示 Demo（2026-10-18 抓） |

重新抓取後 Steam 的價格、評論數會變，測試的期望值要跟著更新。
