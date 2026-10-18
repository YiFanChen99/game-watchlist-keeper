# @watchlist/price-lookup

一款遊戲在 Sheet 裡的價格：用 AppID 讀單列，回傳數字，由 caller 自己組成顯示的文字。`userscript-itad-mail` 和 `userscript-steamgifts` 共用。

| `Prices` 欄位 | Sheet 欄 | 意思 |
|---|---|---|
| `historicalLow` | 最低$ | 史低價，Sheet 用原價和最低off 算出來（最低off 不是數字時是 `-`） |
| `wanted` | Ceiling | 想要的價格，Sheet 用 AnyDeal、Regular、原價算出來 |

值是 Sheet 算出來的數字（可能有小數）；格子空白或不是數字（例如最低$ 的 `-`）時是 `null`。

- `lookupPrices(api, appId)`：單列查詢只讀這兩欄，回傳 `Prices`。Sheet 沒有這個 AppID 時，丟出 code 為 `not-found` 的 `SheetApiError`。
- `priceColumns` + `toPrices(values)`：同一次單列查詢還要讀其他欄時用（例如 itad-mail 順便讀購買/期待度），不用多發一次請求。
- `formatPrice(price)`：單一價格的顯示文字，四捨五入成整數（台幣不顯示小數），`null` 顯示 `-`。

各 caller 的組法：

- itad-mail：`W4 $50, 史$90`（期待度後面接想要的價格，再接史低價）。
- steamgifts：`史$90, W$50`（期待度已經在標註裡）。

名稱比對不在這裡：兩支 userscript 各自用整表傾印把名稱對到 AppID。
