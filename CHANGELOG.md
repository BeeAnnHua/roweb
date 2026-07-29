## 0.9.82HL — 舊版 Tooltip 與貨幣事件強化

- 修正背包消耗品能顯示名稱，但裝備與一般道具的自訂 Tooltip 被高層遊戲視窗遮住的問題。
- 消耗品、裝備、一般道具與穿戴中的裝備，全部加入 `data-tooltip` 加原生 `title` 雙重備援。
- `.game-tooltip` 提升至全域最高 UI 層，避免被早期視窗管理器的動態 z-index 蓋住。
- 黯淡冰晶武器提示完整保留精煉、階級、卡片及第4／3／2洞附魔名稱。
- 一般裝備詳細頁點擊附魔石查看正式圖片、名稱及完整效果的功能完整保留。
- 右上貨幣列改由 document capture 階段的 `pointerup`／`click` 開啟完整數量視窗，繞過早期 HUD bubble handler 的攔截。
- 貨幣視窗提升至全域最高 fixed UI 層，完整顯示 Zeny、藍寶石及紅寶石。
- 移除六秒自動收合；視窗保持開啟至玩家按 ×、點擊外部或按 Escape。
- 0.9.82HK 的升階教學、玩家 NPC 文字、地圖固定滾輪、附魔資訊與正式出生背包皆完整保留。

歷史詳細報告請參閱：`HISTORY_UPDATE_AUDIT_LOG_THROUGH_0.9.82HK.txt`。
