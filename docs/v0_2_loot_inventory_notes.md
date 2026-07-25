# RO_WEB v0.2 Loot + Inventory

## 本版目標

建立打怪後的核心獎勵流程：

```text
怪物死亡
→ Base EXP
→ Job EXP
→ Zeny
→ 掉寶判定
→ 加入背包
→ 更新 UI
→ 存檔
```

## 重要規格

### 1. Item ID 採用官方 RO 編號

v0.2 起，Web 遊戲內 itemId 直接使用官方 RO Item ID。

例如：

```text
501  紅色藥水
502  赤色藥水
909  傑勒比結晶
914  柔毛
511  綠色藥草
9001 波利蛋
```

不再使用 `red_potion` / `jellopy` 這種內部字串作為主 ID。

### 2. Monster ID 也開始採用官方 RO 編號

例如：

```text
1002 波利
1063 瘋兔
1007 綠棉蟲
```

### 3. 圖片可以暫時沿用現有路徑

資料 ID 先官方化，圖片等 RO Studio Builder 完成後再統一輸出：

```text
images/items/501.webp
images/monsters/1002.webp
```

目前可先用現有 PNG / normal 圖，不影響系統。

## 新增檔案

- `js/loot.js`
  - `grantMonsterRewards(monster)`
  - `rollZeny(monster)`
  - `rollMonsterDrops(monster)`
  - `rollDropQuantity(drop)`

## 修改檔案

- `data/items.json`
- `data/monsters.json`
- `data/maps.json`
- `data/player_default.json`
- `js/player.js`
- `js/battle.js`
- `index.html`

## 輕量化決定

本版不加入負重量。

RO_WEB 方向維持：

```text
RO 資料感 + 網頁放置輕量玩法
```
