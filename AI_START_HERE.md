# 0.9.82FV CURRENT RUNTIME
目前正式版本：**0.9.82FV**。  
基準為 0.9.82FU；不得回退 FU 已完成的右上 HUD 收合、掛機並排與 ITEM 稽核修正。

## FV 新增契約
- `js/card_runtime.js` 是卡片 Script、Combo、插卡、拆卡與額外掉落的唯一 Runtime 權威。
- 卡片主資料：`data/items/cards_1.json`、`cards_2.json`；不得再於 `monster_drops_0_9_82EI.json` 建立重複卡片記錄。
- 卡片來源／Combo：`data/card_runtime/`，來源為 rAthena Renewal 2026-06-08。
- 裝備卡片必須存於獨立 equipment instance 的 `cards` 陣列；不可只存裝備 ID。
- 自動掛機的專屬資源不足採每技能 15 秒重試抑制，不可永久重試卡死。
- ITEM 圖示以 `items(1).zip` 同步後的 `images/items/` 為準，不得復原 1010 長條圖或 2324 全透明圖。
