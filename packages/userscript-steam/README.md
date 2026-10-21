# Ekko Steam Sheet Writer

## Features

在 Steam 商店頁（`store.steampowered.com/app/*`）右上角放一個按鈕，把這款遊戲寫進遊戲追蹤 Sheet：

- Sheet 還沒有這個 AppID：顯示 **＋ 新增**，寫成新的一列。
- Sheet 已經有了：顯示 **↻ 更新**，刷新那一列的 Steam 資料，並列出原價 / 上市日期的變動。

右邊另有一顆較窄的 **時長** 按鈕：只抓遊戲時長（`中位nH，PR84 nH。`，跟備註裡的那段一樣），複製到剪貼簿，不碰 Sheet，也不需要 token。

按鈕下方的訊息：兩顆按鈕各有一行，互不覆蓋（例如複製時長不會蓋掉更新失敗的訊息）。成功的訊息 1 分鐘後消失，失敗的保留到點掉為止，點一下就關閉那一行。

取代舊的 [tampermonkey--steam-info-scraper](https://github.com/YiFanChen99/tampermonkey--steam-info-scraper)（擷取後貼到剪貼簿），不用再手動貼上。

## Installation

1. Install [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) (Chrome) or [Violentmonkey](https://addons.mozilla.org/en-us/firefox/addon/violentmonkey/) (Firefox).
2. Open [`https://yifanchen99.github.io/game-watchlist-keeper/steam/Script.user.js`](https://yifanchen99.github.io/game-watchlist-keeper/steam/Script.user.js) and click `Install`.
3. 到[設定頁](https://yifanchen99.github.io/game-watchlist-keeper/setup.html)輸入 Sheet API 的 token（Apps Script 專案設定裡的 `API_TOKEN`）和 IsThereAnyDeal 的 API key（在 ITAD 註冊的 app 的 API Key，不是 OAuth 的 Client ID / Secret），按一次儲存，每支已安裝的腳本都會存進自己的儲存空間。
   - 沒設定的話，第一次用到時會跳出輸入框。ITAD key 取消的話最低off 只看 SteamDB 區塊，下次再問；token 或 key 被拒絕時會刪掉，下次再問。

## Usage

- 商店頁：目前頁面已經是繁中、台幣時直接解析目前頁面；否則重新抓 `?l=tchinese&cc=tw` 的商店頁，所以不受目前頁面的語言影響。評論一律重新抓全語言的。
- 每一欄怎麼寫，以 [`game-record-writer` 的 COLUMNS.md](../game-record-writer/COLUMNS.md) 為準。這裡只列跟這支腳本有關的部分：
  - **最低off** 主要取自 ITAD 近 2.5 年的 Steam TW 最低價；SteamDB 擴充在頁面上加的區塊（按下按鈕時才讀）用來對照，ITAD 拿不到時才用它的數字，前面加上 `!`。兩個都沒有時，新增寫 `0`；更新則保留舊值，但舊值是數字時改成 `!<舊值>`，表示可能過時。ITAD 拿不到時，按鈕下方會說明原因和最低off 用了什麼；最低off 因為其他原因加上 `!` 時（例如 SteamDB 區塊比 ITAD 低、史低之後漲過價、保留較低的舊值），也會說明是哪幾條。
  - 新增：在第 8 列插入一列寫入（原本的列往下移），公式欄複製第 7 列。Sheet 已有這個 AppID 時會拒絕；商店頁讀不到名稱或上市日期時也不會新增。
  - 更新：原價、上市、特、備註有變動時列在按鈕下方。
- 每個 fixture 遊戲實際送出的資料見 [`payloads.md`](../game-record-writer/test/__snapshots__/payloads.md)，每款遊戲一張表。

## Development

在 monorepo 根目錄執行：

```sh
pnpm --filter @watchlist/userscript-steam check   # tsc --noEmit + ESLint
pnpm --filter @watchlist/userscript-steam test    # vitest + happy-dom
pnpm --filter @watchlist/userscript-steam build   # 產出 dist/Script.user.js
```

push 到 `main` 後由根目錄的 `.github/workflows/pages.yml` 發佈到 GitHub Pages 的 `/steam/`。版本號照根目錄的 `version-bump` skill 調整。
