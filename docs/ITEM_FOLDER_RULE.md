# RO_WEB Item Folder Rule v0.9.33

## 一般物品：`data/items/`

| 檔案 | 用途 | 範例 |
|---|---|---|
| `consumables.json` | 消耗品、恢復品、翅膀、食物、Buff 藥水、卷軸 | 紅色藥水、蒼蠅翅膀 |
| `materials_1.json` | 掉落物、一般雜物、可販售材料、其他雜物第一分卷 | 傑勒比結晶、柔毛 |
| `materials_2.json` | 掉落物第二分卷，資料變大時啟用 | 未來材料 |
| `cards_1.json` | 卡片第一分卷。即使同圖不同 ID，也保留不同官方 ID | 波利卡片 |
| `cards_2.json` | 卡片第二分卷，資料變大時啟用 | 未來卡片 |
| `quest.json` | 任務道具，不應放進材料 | 未來任務物 |
| `stones.json` | 附魔石、強化石、附魔材料 | 未來附魔石 |
| `cash.json` | 商城、活動商城或付費相關物 | 未來商城物 |
| `pets.json` | 寵物蛋、寵物相關道具 | 波利蛋 |

### `_1` / `_2` 拆分規則

掉落物與卡片未來會非常大，所以提前採用分卷：

- 先放 `_1`。
- 當 `_1` 超過約 800～1000 筆、或人工閱讀明顯不方便時，開 `_2`。
- 若 `_2` 也過大，再開 `_3`，並同步更新 `ITEM_PLACEMENT_MAP.md`。

## 武器：`data/equipment/weapon/`

| 檔案 | 用途 |
|---|---|
| `dagger.json` | 短劍、短刀類 |
| `sword.json` | 單手劍與雙手劍，先不拆 1H/2H；以 `handed` 標記 |
| `axe.json` | 單手斧與雙手斧 |
| `spear.json` | 單手矛槍與雙手矛槍 |
| `bow.json` | 弓 |
| `staff.json` | 杖 |
| `mace.json` | 鈍器、槌 |
| `book.json` | 書 |
| `whip.json` | 鞭子 |
| `instrument.json` | 提琴、樂器 |
| `gun.json` | 槍、榴彈、霧散槍等槍械類 |
| `ninja.json` | 忍者迴旋鏢、風魔手裡劍等 |
| `katar.json` | 拳刃 |
| `knuckle.json` | 拳套 |
| `other.json` | 新類型臨時放置區；之後要補規則 |

## 防具：`data/equipment/armor/`

| 檔案 | 用途 |
|---|---|
| `body.json` | 鎧甲、衣服、袍子 |
| `shield.json` | 盾牌 |
| `garment.json` | 披肩、斗篷 |
| `shoes.json` | 鞋、靴 |
| `accessory_h1.json` | 飾品、項鍊、戒指等第一分卷 |
| `accessory_h2.json` | 飾品第二分卷 |
| `other.json` | 其他防具 |

## 頭飾：`data/equipment/headgear/`

| 檔案 | 用途 |
|---|---|
| `top.json` | 頭上 |
| `mid.json` | 頭中 |
| `low.json` | 頭下 |
| `other.json` | 跨多部位或未判斷頭飾 |

## 時裝與影子裝

`costume/` 與 `shadow/` 依防具邏輯分類。時裝使用 `COSTUME_*` 槽位，影子裝使用 `SHADOW_*` 槽位。
