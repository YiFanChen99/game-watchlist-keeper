---
name: version-bump
description: Decide and apply the version bump of each userscript package (packages/userscript-*). Use before committing or pushing changes in this repo.
---

每支 userscript 的 `packages/userscript-<site>/package.json` 的 `version` 即它的 `@version`（見該 package 的 `scripts/metadata.mjs`）；Tampermonkey 只在 `@version` 變大時才更新已安裝的腳本。library（`core`、`sheet-api` 等）不發佈，沒有要 bump 的版本。

## 哪些變更算某支 userscript 的變更

級距看的是這支 userscript 的使用者會感受到什麼，不是 commit 對它所在的 package 做了什麼。

- **自己的目錄** `packages/userscript-<site>/`：依 commit type 決定級距（下一節）。
- **依賴的 library**：userscript 會把它依賴的 workspace library 一起打包，所以它 `package.json` 的 `dependencies` 中每個 `@watchlist/<name>` 對應的 `packages/<name>/`（library 之間的依賴也要一路算進去）的 commit 都要看。但**不看那個 commit 的 type**，要看它對這支 userscript 的影響，再套下一節的級距：
  - 這支用不到的新增（例如 client 多了一個它不呼叫的方法）、重構、只改註解或文件 → 不 bump。即使 dist 因此多了幾行用不到的程式碼也一樣：已安裝的版本不更新沒有損失，下次真的 bump 時自然會帶上。
  - 修到這支會遇到的問題 → 當作 `fix`；這支因此多了功能或行為改變 → 當作 `feat`；這支因此不再相容（例如要搭配新版 web app 才能用）→ 當作 breaking。
  - 拿不準時，build 後看這支 dist 的差異，判斷變動的部分這支會不會執行到。

例：`feat(sheet-api)` 新增一個只有 `userscript-sheet` 呼叫的方法 → 只有 `userscript-sheet` 升 minor，其他依賴 `sheet-api` 的 userscript 不 bump。

## 級距

依 conventional commit type 決定（依賴的 library 的 commit，用上一節判斷出的 type）：

- `fix`、`perf` → patch
- `feat` → minor
- 帶 `!` 的 breaking change → major
- 其他 type（`docs`、`chore`、`ci`、`refactor`、`style`、`test`、`build`）→ 不 bump

## 步驟

一次 push 算一個 release，所以目標版本永遠以 `origin/main` 為基準重新計算。對每支有變更的 userscript 分別做（路徑相對於 repo 根目錄）：

1. 基準版本：`git show origin/main:packages/userscript-<site>/package.json` 的 `version`。
2. 級距：`git log --format=%s origin/main..HEAD -- <第一節的路徑>` 列出的每個 commit，加上這次要 commit 的變更，照前兩節逐一判斷，取最高級距。依賴的 library 的 commit 要看內容（`git show <commit>`），不能只看 subject。
3. 目標版本 = 基準版本套用該級距。
4. 比對目前 `package.json` 的 `version`：
   - 等於目標 → 不動。
   - 不等於目標 → 直接改 `package.json` 的 `version`（`pnpm-lock.yaml` 不記錄 workspace package 自己的 version），bump 放進當下這個 commit；若在 push 前才發現，amend 到最後一個未 push 的 commit。

完成條件：每支 userscript 目前的 `version` 都等於目標版本（目標可能就是基準版本，也就是不 bump）。

## userscript-steamgifts 的來歷

它原本由獨立的 annotator repo 發佈，2.0.2 起改由本 repo 發佈。原 repo 已停止發佈，所以直接在這裡修改，照上面的步驟 bump；不要再從原 repo `git subtree pull`。
