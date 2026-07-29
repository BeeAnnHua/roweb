## 0.9.82HM — 貨幣列原地展開／收合

- 移除額外貨幣浮窗的實際使用路徑，改為直接展開既有右上 `#top-bar`。
- 收合時維持三格精簡貨幣顯示；展開時改為 Zeny、藍寶石、紅寶石三列完整數字。
- 再點一次貨幣列、點擊外部或按 Escape 可收合。
- 新增 document capture `pointerup`／`click`、inline onclick 及 Enter／Space 鍵盤操作，繞過早期 HUD 事件攔截。
- 完整數字採獨立 `.currency-expanded-value` 節點，避免 `updatePlayerUI()` 將其重新改成舊顯示。
- 保留 0.9.82HL 的貨幣滑鼠提示、背包／裝備／一般道具 Tooltip 與附魔石平常查看功能。
- 不修改角色資料、貨幣數值、掉落率、精煉、升階、附魔或存檔格式。

歷史詳細報告請參閱：`HISTORY_UPDATE_AUDIT_LOG_THROUGH_0.9.82HL.txt`。
