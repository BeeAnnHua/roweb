# RO_WEB V0.9.57 Shop UI + Berserk Potion

## CSS UI
- `#shop-window` 改為 720px 左右欄版面。
- `shop-window-body` / `shop-list` / `shop-detail-panel` / `shop-detail-desc` 全部可滾動。
- 視窗預設位置改為 `data-default-x=540`、`data-default-y=36`，避免 1280x720 畫面右側或下方被裁切。

## 商店資料
- `data/shops.json`：共用道具商店移除 ID 2239 單眼眼鏡。
- `data/shops.json`：共用道具商店加入 ID 657 菠色克藥水，價格 4500 Zeny。

## 物品資料
- `data/items/consumables.json`：加入 ID 657 菠色克藥水。
- `data/items/item_index.json`：加入 657 對應 consumables。
- `images/items/657.webp`：從專案門口 items/657.webp 複製。
- `js/data_bundle.js` 已同步更新。

## Cache Busting
- `index.html` 全部 CSS / JS `?v=` 更新為 `0.9.57`。
