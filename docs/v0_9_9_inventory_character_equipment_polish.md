# RO_WEB v0.9.9 Inventory Character Equipment Polish

## 主要更新

1. 角色資訊面板微調
   - 使用 `character_panel.webp` 模板。
   - 移除左上角 ATK / DEF 顯示。
   - 只保留職業名稱、Base Lv / Job Lv、HP / SP / Base EXP / Job EXP 與角色圖。

2. 背包欄格子化
   - 背包物品改為放入 UI 原本 40 格。
   - 物品 icon 置中，數量顯示在右下角。
   - 滑鼠移到物品會顯示 tooltip。
   - 點消耗品會使用，點裝備會裝備。

3. 地圖欄底部文字微調
   - `目前城鎮：...` / `野外地圖：...` 改為置中、加大字體。

4. 裝備欄微調
   - 裝備欄整體縮小。
   - 裝備格重新對齊 UI。
   - 加入 `裝備 / 時裝 / 稱號` 分頁切換。
   - 時裝與稱號先顯示尚未開放。

5. 圖片整理與 debug
   - 更新 `SAVE_KEY` 到 v0.9.9。
   - 更新 `UI_POS_KEY` 到 v0.9.9。
   - 補 `images/items/placeholder.webp` 作為缺失物品圖 fallback。
   - 重新掃描圖片引用，缺圖 0。

## 備註

- 技能欄 1 / 2 / 3 轉按鈕這版先不改，保留目前圖樣。
- 角色 ACT / SPR 動畫素材先不接入，待 UI 版面穩定後再處理。
