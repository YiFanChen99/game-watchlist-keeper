# @watchlist/userscript-sheet

> **TODO：尚未實作**，目前只有這份 README 和 `package.json`。寫入 endpoint 與 `refreshGame` 都已經可用，隨時可以開工。

在 Google Sheet 上直接刷新選取的那一列遊戲：用 Steam 的最新資料更新那一列，規則和 SteamGifts 的 ↻ 相同。

用途是備援：`userscript-steam` 要先打開那款遊戲的商店頁，`userscript-steamgifts` 的 ↻ 要剛好有人在送那款遊戲，兩者都用不上時，就在 Sheet 上刷新。

預定流程：

1. 讀左上角的名稱方塊（顯示 `B123` 的那格），得到目前的列號。
2. 從那一列名稱欄的 HYPERLINK 公式取出 AppID。
3. 呼叫 `@watchlist/game-record-writer` 的 `refreshGame`，抓 Steam、與舊值整合後寫回。

## 實作時注意

- **最低off 沒辦法更新**：最低off 來自 SteamDB 擴充在 Steam 商店頁上加的區塊，只有開著商店頁的腳本（`userscript-steam`）讀得到；Sheet 上和 SteamGifts 上都沒有。所以這裡跟 `userscript-steamgifts` 一樣，`refreshGame` 不傳 `steamDb`，最低off 維持舊值（規則見 `game-record-writer` 的 COLUMNS.md「最低off」）。要更新最低off，得到 Steam 商店頁按 ↻。
