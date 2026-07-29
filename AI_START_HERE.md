## 0.9.82HM — 最新正式基準

- 以 0.9.82HL 為基準；完整保留背包／裝備 Tooltip、一般裝備附魔石介紹、HH 附魔存活實例交易修正與 HJ 正式玩家介面。
- 右上貨幣列不再開啟額外浮窗，改為直接在原本 `#top-bar` 內原地展開／收合。
- 收合時維持三格精簡顯示；點擊整個貨幣列後改為三列完整顯示 Zeny、藍寶石、紅寶石，再點一次或點擊外部即可收合。
- 貨幣展開採 document capture `pointerup`／`click`、`index.html` inline onclick 與鍵盤 Enter／Space 三重入口，避免早期 HUD handler 攔截。
- 完整數字使用獨立 `.currency-expanded-value`，不受 `updatePlayerUI()` 重繪精簡數字影響；滑鼠提示仍保留。
- Escape 可收合；手機觸控與桌機滑鼠使用同一套原地展開流程。
- 不得重新帶回 0.9.82HI 的出生測試補給與 10 億 Zeny 自動補足。
- 歷史報告續寫至 `HISTORY_UPDATE_AUDIT_LOG_THROUGH_0.9.82HL.txt`；根目錄只保留 HM 最新必要報告。
- 後續版本以 0.9.82HM 為基準。
