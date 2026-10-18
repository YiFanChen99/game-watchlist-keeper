# Ekko ITAD Mail Annotator

在 Gmail 打開 IsThereAnyDeal（ITAD）的通知信時，信裡標了 `in Waitlist` 的遊戲，後面會加上 Sheet 裡這款遊戲的「購買/期待度1~5」與「Ceiling」，例如 `Smile For Me in Waitlist (W4, Ceiling 120)`。

## Installation

1. 安裝 [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)。
2. 打開 <https://yifanchen99.github.io/game-watchlist-keeper/itad-mail/Script.user.js>，按 `Install`。
3. 第一次在 Gmail 看到 Waitlist 遊戲時，輸入 Sheet API 的 token（Apps Script 專案設定裡的 `API_TOKEN`）。

## Usage

- 找遊戲：連到 `isthereanydeal.com/game/` 的連結，後面緊接著文字是 `in Waitlist` 的元素。Gmail 是動態載入信件，所以用 `MutationObserver` 盯著頁面，信件出現時才處理；沒有 Waitlist 遊戲就不會讀 Sheet。
- 比對：信裡只有 ITAD 的連結、沒有 Steam AppID，所以用遊戲名稱比對整表傾印（跟 SteamGifts 一樣用 `@watchlist/core` 的 `createNameMatcher`：正規化、`/` 分隔的別名、去掉 `xxx Edition`，沒有完全相同的就取部分包含）。整表傾印存在 Tampermonkey 的 `sheetDump`，24 小時內不重抓。
- 讀值：整表傾印沒有 Ceiling，所以對到的遊戲再用 web app 的單列查詢（`action=row`）以 AppID 讀「購買/期待度1~5」與「Ceiling」，這兩個值每次載入頁面都是最新的。同一次頁面載入中同一款遊戲只讀一次。
- 顯示：
  - 空白的格子顯示 `-`；名稱不是 HYPERLINK（沒有 AppID）的列讀不到 Ceiling，顯示 `?`，期待度用整表傾印的值。
  - 對到多款遊戲時用 ` / ` 隔開，滑鼠移上去看得到 Sheet 的名稱；超過 3 款只顯示筆數，不逐一讀。
  - `(Sheet 對不到)`：Sheet 沒有這個名稱，或它的購買/期待度是空白或 0（整表傾印不收這些列）。在 Sheet 補好後，最晚 24 小時才會對到；要馬上對到，可以在 Tampermonkey 的「儲存」分頁刪掉 `sheetDump`。
  - `(讀取失敗)`：滑鼠移上去看錯誤訊息。

## Development

在 monorepo 根目錄執行：

```sh
pnpm --filter @watchlist/userscript-itad-mail check   # tsc --noEmit + ESLint
pnpm --filter @watchlist/userscript-itad-mail build   # 產出 dist/Script.user.js
```

`dist/` 不進版控。push 到 `main` 後由根目錄的 `.github/workflows/pages.yml` 發佈到 GitHub Pages 的 `/itad-mail/`。版本號照根目錄的 `version-bump` skill 調整。
