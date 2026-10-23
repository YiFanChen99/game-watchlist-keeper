# 設計紀錄

為什麼這樣做、否決過什麼、實測查到的事實，只記其他文件沒寫的部分。只記現況，做了什麼看 `git log`。

- 結構與開發指令：[README.md](README.md)；各 package 的行為：各自的 README
- 欄位格式與新增 / 更新規則：[COLUMNS.md](packages/game-record-writer/COLUMNS.md)
- Web App 協定、快取、部署：[apps-script/README.md](packages/apps-script/README.md)

## 工作規則

- 直接 commit 在 `main`。push、`clasp deploy`、GitHub 設定變更都先問使用者。
- userscript 用到 Apps Script 的新功能時，先 `clasp push` + `deploy -i`，再 git push。
- 版本照 `version-bump` skill。
- 驗證：`pnpm check`、`pnpm -r test`、`pnpm -r build`。動到 userscript 的頁面行為時，在它的 `test/` 加測試（vitest + happy-dom），再用 happy-dom 對 `dist` 跑一次 smoke test。真實瀏覽器實測由使用者做。
- 名稱用完整單字，不用縮寫。library 用功能命名，userscript 叫 `userscript-<網站>`。
- 新的決策、否決的方案、查到的事實，補進本文件；其他文件已經寫了的不重複。

## 架構

- **Web App 匿名部署 + token**，不用 `MYSELF` 部署：`MYSELF` 每次請求多約 6 秒，兩個帳號還要各自部署。
- **userscript 依網站拆分**：工作電腦只需裝 SteamGifts 那支。SteamGifts 的 ↻ 只在安裝層併進標註腳本，邏輯層分開，`userscript-sheet` 才不用拉進標註程式碼。
- **兩個帳號共用同一張 Sheet**，不做帳號切換。
- **AppID 從名稱欄的 HYPERLINK 讀**，不另外加欄。
- **API 形狀**：整表傾印 + server 快取，再依需要加單列查詢 / 寫入。批次查詢沒有速度優勢：瓶頸是每次請求約 1 秒的固定開銷，不是回傳大小。
- **monorepo**，不用 submodule（不想維護一堆獨立 repo）。
- **Apps Script 打包**：esbuild 打包成單一 `Code.js`，不 minify、保留來源路徑註解，在網頁編輯器上還讀得懂。不接 CI，在本機手動部署。

## 功能取捨

### 價格查詢
- 否決「用名稱查單列」（server 端比對名稱，省掉整表傾印）：傾印有快取時，各遊戲的單列查詢本來就同時送出；改成 server 端一列一列比對可能更慢。
- 否決把最低$、目標價、列號放進傾印：價格可能 24 小時沒更新，傾印也變大。

### 最低off
規則見 COLUMNS.md「最低off」，這裡只記理由與否決的方案。
- 取**近 2.5 年**而不是全期：要的是「近期實際買得到的價格」，全期最低會被原價還很低時的特價拉走（Reventure）。
- 否決「SteamDB 和 ITAD 取較低」：SteamDB 是全期最低，會讓 2.5 年失效；而且只有 Steam 頁有區塊，數字會依從哪裡更新而跳動。所以 SteamDB 比較低時只加 `!`。
- 否決 storelow / historylow：只給全期最低，historylow 還跨商店。
- 否決開背景分頁讀 SteamDB 區塊：開分頁、等渲染、傳值、關分頁每一步都可能失敗。

### 標籤規則
規則見 COLUMNS.md「標籤規則」。
- 放在 Sheet 分頁：規則常改，使用者要能直接 review / 編輯，改規則不用發版本。
- 不多送請求：Steam 頁開頁時本來就要判斷新增或更新，`find` 在 Sheet 沒有這款時順便帶回規則。
- 否決：規則寫在程式碼（每改一條就要發版）；repo 的 JSON 經 Pages 讀（要 commit + push，不如 Sheet 好編輯）；拿 Steam 標籤清單檢查打錯字（先不做）；「排除 User Tags」（要在策略列重列回合列的所有標籤，改用「排除輸出」）。

### 憑證
- 否決：web app 發 ITAD key（token 仍要各自輸入）；合併成一支腳本；設定頁網址帶 `#token=…`（會留在瀏覽紀錄）。

## 參考事實

### Sheet / Apps Script
- H 欄的 `UPDATE_DIFF` 是 Sheet 的「已命名函式」；`WantToOwned` 是 Apps Script 的自訂函式，跑線上 HEAD，所以每次 `clasp push` 都要包含它。
- clasp 沒有全域安裝，一律 `pnpm dlx @google/clasp`。`onChange` 觸發條件已手動設好。
- 每次請求約 1–1.5 秒固定開銷，server 端只花 0.15–0.25 秒；client 偶爾等到數十秒，慢在 redirect 之後，程式控制不了。
- 讀名稱欄整欄的公式約 0.7 秒。整表傾印約 159KB，超過 CacheService 單一值的 100KB，所以要 gzip（約 73KB）後分塊存。

### Steam
- `store.steampowered.com/appreviews/<appid>` 自 2026-10 起一律 302 回商店首頁（HTML）；商店頁的評論區塊自己用的是 `store.steampowered.com/ajaxappreviews/<appid>`，參數與回應格式相同，但不理會 `num_per_page=0`（照樣回傳 20 篇）。
- 商店頁「所有評論」的總數比 API 多幾篇（900270：8,468 對 8464，新舊端點都一樣），好評比例相同。
- 商店頁的 `filter=summary` 固定回傳 10 篇、只取約 7 天內的評論，不適合時長抽樣，所以抽樣用 `filter=all` + `day_range`。
- 否決 `IUserReviewsService/GetAppReviews`（不用 key，回應沒有 `success`，要多 `@connect api.steampowered.com`）：同樣參數下 `purchase_type=steam` 的總數只有商店頁的約六成（499170：1652 對 2812）。
- 商店頁是 `X-Frame-Options: DENY`，不能用 iframe 載入。
- 繁中標籤 429 個（`tagdata/populartags/tchinese`）：16 個帶空格，沒有一個含 `、`、`,`、`，`，所以標籤規則用 `、` 分隔。
- **未驗證**：開著的頁面直接解析時，SteamDB 擴充插入的元素會不會被價格選擇器誤抓。

### IsThereAnyDeal
- 文件 https://docs.isthereanydeal.com/。key 是註冊 app 的 API Key（不是 OAuth）。限流每 5 分鐘 1000 次。
- AppID → ITAD id：一般、特價、搶先體驗、未發售、免費、已下架、DLC 都對得到。
- `found: true` 不代表有價格紀錄（IDLE DEVILS 2226700 是空陣列）。
- 一個 app 有好幾個 sub 時，ITAD 追蹤本體（DREDGE 749，不是 Deluxe 799）。
- 只有 AppID 時，`https://isthereanydeal.com/steam/app/<appid>/` 會轉到遊戲頁。

### Tampermonkey / 發佈
- 靠 `@name` + `@namespace` 認腳本，改了要手動移除重裝、重新輸入 token。
- `@icon` 一律用腳本所在網站的 favicon；改 `@icon` 要 bump 版本才會更新圖示。
- 加了新的 `@connect`，更新時會要使用者確認權限。
- 「儲存」分頁要把「設定模式」切到「進階」才出現。
- Pages 只允許 `main` 部署。
- ITAD 信件樣本：Gmail「顯示原始郵件」取得，含 email 和取消訂閱 token，fixture 只取內文並換掉 token。

### git
- `userscript-steamgifts` 的舊歷史：`git log $(git subtree split --prefix=packages/userscript-steamgifts)`。
- 不要對包含 annotator commit 的範圍跑 `git filter-branch`：有 GPG 簽章的 commit 會換 hash，subtree 就對不上。
