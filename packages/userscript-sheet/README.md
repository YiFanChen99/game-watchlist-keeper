# Ekko Sheet Row Updater

在 Google Sheet 上直接刷新選取的那一列遊戲：用 Steam 的最新資料更新那一列，規則和 SteamGifts 的 ↻ 相同。

用途是備援：`userscript-steam` 要先打開那款遊戲的商店頁，`userscript-steamgifts` 的 ↻ 要剛好有人在送那款遊戲，兩者都用不上時，就在 Sheet 上刷新。

## Installation

1. 安裝 [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)。
2. 打開 <https://yifanchen99.github.io/game-watchlist-keeper/sheet/Script.user.js>，按 `Install`。
3. 到[設定頁](https://yifanchen99.github.io/game-watchlist-keeper/setup.html)輸入 Sheet API 的 token（Apps Script 專案設定裡的 `API_TOKEN`）和 IsThereAnyDeal 的 API key（最低off 用），一次存進每支已安裝的腳本；沒設定的話，第一次按 ↻ 時會跳出輸入框，ITAD key 取消的話最低off 不更新，下次再問。第一次按 ↻ 時允許連線到 `store.steampowered.com`、`api.isthereanydeal.com`。

需要 web app 支援用列號讀單列（`action=row&row=`）；舊版 web app 會回「bad app id」。

## Usage

在遊戲清單的工作表上選取遊戲那一列的任一格，按左下角（列號上方、工作表分頁上面）的 ↻。完成後右邊的訊息框顯示「已更新第 N 列 名稱。」和變動（例如「原價 459 → 499（+40）」），1 分鐘後消失；失敗或拒絕的訊息保留到點掉。

流程：

1. 讀左上角的名稱方塊（例如 `D123`、`A5:K5`、`5:5`）得到列號。選了好幾列、整欄或具名範圍時拒絕。
2. 用 web app 的 `action=row&row=<列號>` 讀那一列：web app 從名稱欄的 HYPERLINK 取出 AppID，並一起回傳刷新要用的舊值，之後不必再讀一次。
3. 比對 web app 回傳的那一列連結（`url`）與目前頁面的試算表 id、工作表 `gid`，不同就拒絕。web app 永遠讀它自己的工作表，這一步避免在別的試算表或分頁上選了第 N 列，卻刷新了遊戲清單的第 N 列。
4. 呼叫 `@watchlist/game-record-writer` 的 `refreshGame`，抓 Steam、與舊值整合後，用列號寫回（POST 帶 `row`）。web app 只檢查那一列的名稱還連到同一個 AppID，不用 AppID 找列，所以讀和寫都不需要 AppID 索引，web app 請求總共 2 個。Sheet 上會即時看到新值。

Google Sheets 的 CSP 要求 Trusted Types（`require-trusted-types-for 'script'`），`DOMParser` 不收一般字串，所以解析 Steam 商店頁時用腳本自己的 policy（`ekko-sheet-row-updater`）把 HTML 包成 TrustedHTML（`src/trustedHtml.ts`）。CSP 沒有限制 policy 名稱，所以可以建；解析出的文件不會放進頁面，裡面的 script 也不會執行。

拒絕的情況：

- 名稱不是連到 Steam 商店頁的 HYPERLINK（沒有 AppID）。
- 寫入時那一列已經不是同一款遊戲（例如刷新途中插入或刪除了列）。
- 第 1 列（標題）或最後一列之後。

### 按鈕出現在哪裡

按鈕只出現在遊戲清單的工作表，兩個條件都要符合：

- **工作表**：網址的 `gid` 是 `1386365003`（`src/selection.ts` 的 `watchlistSheetGid`）。gid 只是試算表裡分頁的編號，不同試算表之間會重複，單獨看不出是哪份試算表，所以直接寫在程式裡。
- **試算表**：`@match` 是所有試算表，因為 Sheet 的網址不寫進公開的 repo。第一次刷新成功後，試算表 id 存在 Tampermonkey 的 `watchlistSpreadsheetId`，之後按鈕只出現在這份試算表。在那之前，任何試算表的這個 gid 分頁都會有按鈕；換了試算表的話，到 Tampermonkey 的「儲存」分頁刪掉 `watchlistSpreadsheetId`。

在 Sheets 裡切換分頁不會重新載入頁面，也不會觸發 `hashchange`，所以腳本每秒檢查一次網址，按鈕最慢 1 秒內跟著出現或消失。工作表的 gid 改了（例如刪掉重建分頁）時，要改 `watchlistSheetGid`。

按下去之後，流程第 3 步還會再比對一次 web app 回傳的那一列連結，所以就算按鈕出現在不對的地方，也不會寫錯列。

### 最低off 只看 ITAD

SteamDB 擴充的區塊只在 Steam 商店頁上（`userscript-steam` 讀得到），Sheet 上沒有，所以這裡跟 `userscript-steamgifts` 一樣，`refreshGame` 只傳 ITAD 的 API key。ITAD 拿不到時（沒有 key、失敗或沒收錄）最低off 保留舊值，但舊值是數字時會改成 `!<舊值>`，表示可能過時，並在結果裡說明原因；ITAD 有回應但最低off 加上 `!` 時，結果裡也會說明是哪幾條（規則見 `game-record-writer` 的 COLUMNS.md「最低off」）。

## Development

在 monorepo 根目錄執行：

```sh
pnpm --filter @watchlist/userscript-sheet check   # tsc --noEmit + ESLint
pnpm --filter @watchlist/userscript-sheet test    # vitest：名稱方塊與網址的解析
pnpm --filter @watchlist/userscript-sheet build   # 產出 dist/Script.user.js
```

`dist/` 不進版控。push 到 `main` 後由根目錄的 `.github/workflows/pages.yml` 發佈到 GitHub Pages 的 `/sheet/`。版本號照根目錄的 `version-bump` skill 調整。
