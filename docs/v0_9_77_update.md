# RO_WEB V0.9.77 Update

## 大地圖測試：妙勒尼山脈
- 新增 `mjolnir_mountains` 地圖資料。
- 新增 `images/maps/backgrounds/mjolnir_mountains_bg.webp`。
- 新增 `images/maps/thumbs/mjolnir_mountains_small.webp`。
- 地圖世界尺寸暫定 `4096 x 2304`，保留網頁遊戲可接受的探索大小，不做 RO 等級超大地圖。

## Camera / 世界座標測試
- Position Engine 支援 `worldWidth/worldHeight`。
- 玩家、怪物改可使用世界座標。
- battle-field 維持 1280x720 viewport，Camera 跟隨玩家移動背景。
- 點擊移動會自動加上 Camera offset，轉換成世界座標。
- 精靈顯示位置會扣掉 Camera offset。

## 測試重點
- 在「地圖 / 傳送」切換到妙勒尼山脈。
- 點擊遠處移動時，背景應該跟著角色平滑移動。
- 先沿用現有怪物資料，不新增怪物圖片。

## 快取
- HTML/CSS/JS 版本號更新為 `0.9.77`。
