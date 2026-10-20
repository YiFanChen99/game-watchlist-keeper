# game-watchlist-keeper

讓一份 Google Sheet 遊戲追蹤清單與 Steam、SteamGifts、ITAD 價格通知保持同步的工具集。

pnpm workspace monorepo，每個 `packages/*` 都是獨立的 node module，以 `@watchlist/<name>` 互相引用，皆 `private`、不發佈。

## Packages

| package | 類型 | 說明 |
|---|---|---|
| `core` | library | 共用的小工具：名稱正規化與比對、AppID 與商店網址、fetch 函式型別 |
| `steam-info-scraper` | library | 抓 Steam 並解析成原始資料（商店頁、評論、SteamDB 區塊），不含 Sheet 格式 |
| `sheet-api` | library | Sheet Web App 的協定（請求 / 回應型別、錯誤碼、傾印列規則 `toDumpRow`、部署 URL）與 client；`apps-script` 也引用它，兩端共用同一份定義 |
| `tampermonkey-sheet-api` | library | 給 userscript 用：`GM_xmlhttpRequest` 的 fetch 函式，以及 token 存在 Tampermonkey 的 `sheet-api` client |
| `game-record-writer` | library | 新增 / 更新 Sheet 遊戲列的所有規則與流程；欄位對照表在它的 `COLUMNS.md` |
| `price-lookup` | library | 用 AppID 讀 Sheet 的史低價（最低$）與想要的價格（目標價），回傳數字給 caller 組字 |
| `apps-script` | Apps Script | Sheet Web App 本身（server）：實作 `sheet-api` 定義的協定，綁在 Sheet 上，用 clasp 部署 |
| `userscript-steam` | userscript | Steam 商店頁：把遊戲新增到 Sheet，或更新它那一列 |
| `userscript-steamgifts` | userscript | SteamGifts：想要程度標註、查價、區域限制計數、資料刷新 |
| `userscript-itad-mail` | userscript | Gmail 的 ITAD 通知信：Waitlist 遊戲旁顯示 Sheet 的購買/期待度與價格 |
| `userscript-sheet` | userscript | Google Sheet：用 Steam 的資料刷新選取的那一列遊戲，給 Steam 商店頁與 SteamGifts 的 ↻ 都用不上時備援 |

Web App 只有一個：協定在 `sheet-api`，實作在 `apps-script`，改協定時兩邊一起改。

library 不直接呼叫 `GM_xmlhttpRequest`，網路請求由 userscript 注入，所以 library 可以直接在 Node 上跑測試。例外是 `tampermonkey-sheet-api`：它就是各支 userscript 共用的注入端。

## Development

```sh
pnpm install
pnpm check      # 各 package 的 tsc --noEmit + ESLint，加上根目錄腳本的 ESLint
pnpm -r test    # vitest
pnpm -r build   # 產出各 userscript 的 dist/
```

push 到 `main` 後由 `.github/workflows/pages.yml` 建置，將每支 userscript 發佈到 GitHub Pages 的 `/<網站>/Script.user.js`。

`pnpm prune-pages [N]` 刪掉舊的 Pages deployment 與 workflow run，各留最新 N 筆，預設 10（需先 `gh auth login`）。
