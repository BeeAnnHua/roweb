# RO_WEB v0.9.2 Panel & Growth System

## 更新重點

1. 開場面板預設關閉：背包、技能、地圖、城鎮、裝備、職業、自動戰鬥設定都改成按鈕開啟。
2. 地圖圖片命名整理：大圖 `_bg.webp`，小圖 `_small.webp`。
3. 練功地圖先只保留 `prontera_south` 普隆德拉南門，避免舊測試地圖缺圖造成干擾。
4. 修正切換地圖/城鎮時的戰鬥狀態殘留：停止 timer、清除目前怪物、重新套背景。
5. 物品圖改用官方 ID WebP；若素材庫缺圖則保留舊 PNG fallback。
6. 劍士技能改接官方技能 ID 圖示。
7. 新增素質配點視窗：STR / AGI / VIT / INT / DEX / LUK。
8. 新增 rAthena DB 衍生資料：`statpoints.json`、`job_stat_bonuses.json`、`job_basepoints.json`。
9. `calculateDerivedPlayerStats()` 讓素質實際影響 ATK / MATK / HP / SP / HIT / FLEE / CRI / ASPD / MaxWeight。

## 注意

- v0.9.2 使用新的 localStorage key：`ro_web_save_v0_9_2_panel_growth`，避免舊版測試存檔造成地圖/素質欄位錯亂。
- ACT 動作動畫尚未接入，怪物仍以靜態 WebP 顯示。
