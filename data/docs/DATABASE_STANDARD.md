# RO_WEB Database Standard v0.9.33

## 目標

RO_WEB 只保留目前遊戲版本會用到的資料，不直接塞入完整 29,000+ 筆 rAthena 物品資料。
完整官方資料由 RO Studio / 開機檔 / itemInfo 負責保存與解析；RO_WEB 只吃經 Build 後的遊戲資料包。

## 本版原則

- 基底：V0.9.31_fixed / V0.9.32 database foundation。
- 本版只整理目前既有物品、六大城商店物品、野外怪物掉落物。
- 移除 `weight` 與 `gender`。
- 保留職業限制、等級限制、裝備部位、卡槽、精煉、Grade、附魔、effects 等未來會用到的資料欄位。
- 性別限制正式不作為 RO_WEB 穿戴限制。
- `data/items.json` 暫時保留為 runtime 相容來源。

## 新增物品流程

1. 先讀 `docs/ITEM_PLACEMENT_MAP.md`。
2. 找到物品應放的 JSON。
3. 放入對應 JSON，並同步 `data/items/item_index.json`。
4. 若目前遊戲 runtime 仍使用 `data/items.json`，也要同步加入相同 ID。
5. 執行 Audit，確認沒有 Unknown、缺圖、商店或掉落物引用失敗。
