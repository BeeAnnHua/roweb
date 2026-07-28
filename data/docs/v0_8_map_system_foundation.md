# RO_WEB v0.8 - Map System Foundation

## 目標
建立世界地圖基礎，不急著做圖鑑 UI。

## 新增內容

- `data/maps.json` 升級為地圖資料來源。
- 地圖 UI 只顯示：
  - 地圖名稱
  - 推薦等級
  - 環境類型
  - 探索數量
- 地圖 UI 不顯示怪物名稱，保留探索感。
- 切換地圖後：
  - 更新戰鬥背景
  - 更換怪物池
  - 重置目前怪物
  - 儲存玩家目前地圖
- 新增背景探索資料：
  - `player.discoveredMaps`
  - `player.mapExploration`
  - `player.monsterBook`

## 地圖圖片規格

- 戰鬥背景：`images/maps/backgrounds/{mapId}.webp`
  - 建議尺寸：1280 × 720
- 地圖縮圖：`images/maps/thumbs/{mapId}.webp`
  - 建議尺寸：320 × 180 或 256 × 144

目前先放 placeholder 圖，之後可直接替換同名檔案。

## 第一批地圖

- 初心者訓練場
- 普隆德拉南門
- 普隆德拉西門
- 斐揚樹林
- 吉芬近郊森林

## 設計規則

地圖資料內部仍保留 `monsters` 怪物池，但 UI 不直接列出怪物。
玩家需要進入地圖、實際遭遇並擊殺怪物後，探索資料才會被記錄。

後續圖鑑 UI 可以直接讀取這些探索資料，不需要回頭修改戰鬥系統。
