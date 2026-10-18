# game-watchlist-keeper

讓一份 Google Sheet 遊戲追蹤清單與 Steam、SteamGifts、ITAD 價格通知保持同步的工具集。

pnpm workspace monorepo，每個 `packages/*` 都是獨立的 node module，以 `@watchlist/<name>` 互相引用，皆 `private`、不發佈。

## Packages

| package | 類型 | 說明 |
|---|---|---|
| `core` | library | 共用的小工具：名稱正規化與比對、AppID 與商店網址、fetch 函式型別 |
| `steam-info-scraper` | library | 抓 Steam 並解析成原始資料（商店頁、評論、SteamDB 區塊），不含 Sheet 格式 |
| `sheet-api` | library | Apps Script Web App 的 client |
| `game-record-writer` | library | 新增 / 更新 Sheet 遊戲列的所有規則與流程；欄位對照表在它的 `COLUMNS.md` |
| `price-lookup` | library | 遊戲 id / 名稱 → 價格資訊 |
| `apps-script` | Apps Script | Sheet 查詢 / 寫入的 Web App 原始碼 |
| `userscript-steam` | userscript | Steam 商店頁：把遊戲新增到 Sheet，或更新它那一列 |
| `userscript-steamgifts` | userscript | SteamGifts：想要程度標註、區域限制計數、資料刷新 |
| `userscript-itad-mail` | userscript | Gmail 的 ITAD 通知信：Waitlist 遊戲旁顯示 Sheet 的購買/期待度與 Ceiling |
| `userscript-sheet` | userscript | Google Sheet：資料刷新備援 |

library 不直接呼叫 `GM_xmlhttpRequest`，網路請求由 userscript 注入，所以 library 可以直接在 Node 上跑測試。

## Development

```sh
pnpm install
pnpm check      # 各 package 的 tsc --noEmit + ESLint，加上根目錄腳本的 ESLint
pnpm -r test    # vitest
pnpm -r build   # 產出各 userscript 的 dist/
```

push 到 `main` 後由 `.github/workflows/pages.yml` 建置，將每支 userscript 發佈到 GitHub Pages 的 `/<網站>/Script.user.js`。

`pnpm prune-pages [N]` 刪掉舊的 Pages deployment 與 workflow run，各留最新 N 筆，預設 10（需先 `gh auth login`）。

## Legacy

- `google_sheet_b1_d3.js`：以 Google Sheets API + OAuth token 讀取 B1:D3 的實驗腳本。**目前沒有任何 package 用到**（新架構改走 Apps Script Web App）。
