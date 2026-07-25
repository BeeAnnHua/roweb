# RO_WEB Item Placement Map v0.9.33

新增物品前，先讀本文件，再放進對應 JSON。

## 一般物品

| 判斷條件 | 放置位置 |
|---|---|
| HP/SP 恢復品、藥水、食物、卷軸、翅膀、Buff 藥水 | `data/items/consumables.json` |
| 一般怪物掉落物、可賣材料、雜物 | `data/items/materials_1.json`；資料大時續放 `materials_2.json` |
| 卡片 | `data/items/cards_1.json`；資料大時續放 `cards_2.json` |
| 任務專用道具 | `data/items/quest.json` |
| 附魔石、強化石、附魔材料 | `data/items/stones.json` |
| 商城、活動商城、付費相關 | `data/items/cash.json` |
| 寵物蛋、寵物相關 | `data/items/pets.json` |

## 武器

| 物品類型 | 放置位置 |
|---|---|
| 短劍、短刀 | `data/equipment/weapon/dagger.json` |
| 單手劍、雙手劍 | `data/equipment/weapon/sword.json` |
| 單手斧、雙手斧 | `data/equipment/weapon/axe.json` |
| 單手矛槍、雙手矛槍 | `data/equipment/weapon/spear.json` |
| 弓 | `data/equipment/weapon/bow.json` |
| 杖 | `data/equipment/weapon/staff.json` |
| 鈍器、槌 | `data/equipment/weapon/mace.json` |
| 書 | `data/equipment/weapon/book.json` |
| 鞭子 | `data/equipment/weapon/whip.json` |
| 提琴、樂器 | `data/equipment/weapon/instrument.json` |
| 槍、榴彈、霧散槍等 | `data/equipment/weapon/gun.json` |
| 忍者迴旋鏢、風魔手裡劍等 | `data/equipment/weapon/ninja.json` |
| 拳刃 | `data/equipment/weapon/katar.json` |
| 拳套 | `data/equipment/weapon/knuckle.json` |
| 未歸類武器 | `data/equipment/weapon/other.json`，並回來更新本文件 |

## 防具 / 頭飾

| 物品類型 | 放置位置 |
|---|---|
| 頭上 | `data/equipment/headgear/top.json` |
| 頭中 | `data/equipment/headgear/mid.json` |
| 頭下 | `data/equipment/headgear/low.json` |
| 鎧甲、衣服、袍子 | `data/equipment/armor/body.json` |
| 盾牌 | `data/equipment/armor/shield.json` |
| 披肩、斗篷 | `data/equipment/armor/garment.json` |
| 鞋、靴 | `data/equipment/armor/shoes.json` |
| 飾品、項鍊、戒指 | `data/equipment/armor/accessory_h1.json`；資料大時續放 `accessory_h2.json` |
| 未歸類防具 | `data/equipment/armor/other.json`，並回來更新本文件 |

## 時裝 / 影子裝

時裝與影子裝依防具邏輯分類，但放在各自資料夾：

- `data/equipment/costume/`
- `data/equipment/shadow/`

## 版本提醒

本文件是新增資料的第一入口。任何新分類、拆檔規則、例外物品，都必須同步更新本文件。
