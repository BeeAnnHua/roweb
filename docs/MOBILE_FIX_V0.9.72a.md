# RO_WEB V0.9.72a Mobile Fix

## 修正目標

本版針對 iPhone Safari / 手機窄螢幕修正 V0.9.72 的 Position Combat 操作問題。

## 修正內容

- 地圖點擊：同時支援 `pointerdown`、`touchstart`、`click`。
- 座標換算：改用 `getBoundingClientRect()` 的畫面比例換算內部座標。
- 移動顯示：手機版舊 CSS 曾以 `!important` 固定角色/怪物 left/top，本版改由 Position Engine 用 inline important 寫入。
- 戰鬥區：加入 `touch-action: none`，避免 iOS 將點擊判定為頁面手勢。
- UI：手機資源列、角色卡、Job Lv、彈窗置中修正。

## 測試重點

1. iPhone Safari 點地圖是否能移動。
2. 自動戰鬥是否會走向怪物。
3. 怪物是否會追擊玩家。
4. 蒼蠅翅膀是否正常瞬移。
5. 手機版開啟技能/背包/裝備/素質視窗是否置中。
