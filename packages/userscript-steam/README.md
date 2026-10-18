# Ekko Steam Sheet Writer

## Features

在 Steam 商店頁（`store.steampowered.com/app/*`）右上角放一個按鈕，把這款遊戲寫進遊戲追蹤 Sheet：

- Sheet 還沒有這個 AppID：顯示 **＋ 新增**，寫成新的一列。
- Sheet 已經有了：顯示 **↻ 更新**，刷新那一列的 Steam 資料，並列出原價 / 上市日期的變動。

右邊另有一顆較窄的 **時長** 按鈕：只抓遊戲時長（`中位nH，3rd.高nH。`，跟備註裡的那段一樣），複製到剪貼簿，不碰 Sheet，也不需要 token。

取代舊的 [tampermonkey--steam-info-scraper](https://github.com/YiFanChen99/tampermonkey--steam-info-scraper)（擷取後貼到剪貼簿），不用再手動貼上。

## Installation

1. Install [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) (Chrome) or [Violentmonkey](https://addons.mozilla.org/en-us/firefox/addon/violentmonkey/) (Firefox).
2. Open [`https://yifanchen99.github.io/game-watchlist-keeper/steam/Script.user.js`](https://yifanchen99.github.io/game-watchlist-keeper/steam/Script.user.js) and click `Install`.
3. 第一次在 Steam 商店頁執行時，輸入 Sheet API 的 token（Apps Script 專案設定裡的 `API_TOKEN`）。token 存在這支腳本自己的儲存空間，跟 SteamGifts 那支分開。

## Usage

- 商店頁：目前頁面已經是繁中、台幣時直接解析目前頁面；否則重新抓 `?l=tchinese&cc=tw` 的商店頁，所以不受目前頁面的語言影響。評論一律重新抓全語言的。
- 每一欄怎麼寫，以 [`game-record-writer` 的 COLUMNS.md](../game-record-writer/COLUMNS.md) 為準。這裡只列跟這支腳本有關的部分：
  - **最低off** 取自 SteamDB 擴充在頁面上加的區塊，按下按鈕時才讀。沒有區塊時（沒裝或還沒載入），新增寫 `0`；更新則保留舊值，但舊值是數字時改成 `!<舊值>`，表示可能過時。
  - 新增：在第 4 列插入一列寫入（原本的列往下移），公式欄複製第 3 列。Sheet 已有這個 AppID 時會拒絕；商店頁讀不到名稱或上市日期時也不會新增。
  - 更新：原價、上市、特、備註有變動時列在按鈕下方。
- 每個 fixture 遊戲實際送出的資料見 [`payloads.md`](../game-record-writer/test/__snapshots__/payloads.md)，每款遊戲一張表。

## Development

在 monorepo 根目錄執行：

```sh
pnpm --filter @watchlist/userscript-steam check   # tsc --noEmit + ESLint
pnpm --filter @watchlist/userscript-steam build   # 產出 dist/Script.user.js
```

push 到 `main` 後由根目錄的 `.github/workflows/pages.yml` 發佈到 GitHub Pages 的 `/steam/`。版本號照根目錄的 `version-bump` skill 調整。
