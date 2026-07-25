# V0.9.54 Item DB V2

## 重點

- `data/items.json` 正式退役並自專案移除。
- Runtime 改讀 `data/items/item_index.json`，再載入 `data/items/` 與 `data/equipment/` 細分 JSON。
- 對外統一由 `getItemById()` / `getItemData()` 取得物品資料。
- 商店、背包、掉落、商城、Tooltip、裝備欄都使用同一份合併後 Item DB。
- 移除 NPC 商店中的放大鏡販售。
- 目前已使用物品重新依官方資料校正名稱、說明、卡槽與裝備位置。

## 物品資料規則

- 名稱使用 `identifiedDisplayName`。
- 說明使用 `identifiedDescriptionName`。
- 不使用 `unidentifiedDisplayName` / `unidentifiedDescriptionName`。
- 不顯示韓文 ResourceName。
- 不顯示重量、未鑑定、放大鏡相關文字。
- RO 色碼保留於資料中，由 Tooltip 轉成網頁顏色顯示。

## 檢查結果

- 商店 / 掉落 / 預設背包引用皆可在 `item_index.json` 找到。
- `2101` 已修正為鐵盾，位置為盾牌。
- `611` 放大鏡已不在商店販售，也不納入目前 runtime item index。
