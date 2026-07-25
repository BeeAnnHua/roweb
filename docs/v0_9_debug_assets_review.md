# RO_WEB v0.9 Debug / Asset Review

## Debug 修正

### 1. 城鎮內地圖面板文字修正
進入城鎮後 `currentMap = null`，原本地圖面板可能停留在上一張練功地圖名稱。

已修正為：

- 有目前地圖：顯示目前地圖與探索度
- 位於城鎮：顯示目前位於城鎮
- 無地圖/城鎮：顯示未選擇

### 2. 購買商品後商店不再自動關閉
原本購買商品後會呼叫 `updateTownUI()`，導致商店面板被 `renderShopPanel(null)` 關掉。

已修正為：

- 扣 Zeny
- 加入背包
- 更新玩家 / 背包 UI
- 重新渲染目前商店
- 保持商店面板開啟

### 3. 停止自動戰鬥不再無條件洗 Battle Log
`stopAutoBattle()` 之前即使沒有自動戰鬥，也會顯示「已停止自動戰鬥」。

已修正為：只有真的有計時器在跑時才顯示停止訊息。

### 4. 職業面板移除快速轉職按鈕
v0.9 起轉職設計改為「前往城鎮找轉職 NPC」。

職業面板現在只提示：

- 已符合轉職條件
- 請前往對應城鎮尋找轉職 NPC

避免玩家直接在職業面板繞過城鎮 / NPC 流程。

## 目前需要補的圖片清單

### A. 城鎮背景圖（1280 × 720，建議 WebP）

放置位置：`images/maps/backgrounds/`

- `prontera.webp`：普隆德拉
- `izlude.webp`：依斯魯得
- `geffen.webp`：吉芬
- `payon.webp`：斐揚
- `alberta.webp`：艾爾貝塔
- `morocc.webp`：夢羅克

### B. 城鎮縮圖（地圖 / 城鎮 UI 用，建議 320 × 180 或 256 × 144，WebP）

放置位置：`images/maps/thumbs/`

目前已有：

- `prontera.webp`
- `izlude.webp`
- `geffen.webp`
- `payon.webp`
- `alberta.webp`
- `morocc.webp`

如果覺得目前 placeholder 不好看，晚上可重新補正式縮圖。

### C. 物品圖示（建議 64 × 64 或 128 × 128，PNG / WebP）

放置位置：`images/items/`

#### 補給 / 消耗品

- `503.png`：黃色藥水
- `504.png`：白色藥水
- `505.png`：藍色藥水
- `511.png`：綠色藥草
- `601.png`：蒼蠅翅膀
- `602.png`：蝴蝶翅膀

目前已有：

- `501.png`：紅色藥水
- `502.png`：赤色 / 橙色藥水

#### 掉落材料

- `909.png`：傑勒比結晶
- `914.png`：柔毛

#### 基礎裝備

- `1104.png`：劍士基礎武器
- `1201.png`：盜賊基礎短刀
- `1301.png`：商人基礎斧
- `1302.png`：商人基礎鈍器
- `1601.png`：法師基礎杖
- `1701.png`：弓手基礎弓
- `1702.png`：弓手進階基礎弓
- `2102.png`：劍士基礎防具
- `2111.png`：盾牌
- `2201.png`：法師帽 / 法師基礎頭部
- `2301.png`：盜賊基礎防具

目前已有：

- `1101.png`
- `2101.png`
- `3101.png`
- `4101.png`
- `9101.png`

### D. 怪物圖片

目前 v0.9 早期地圖最少已有：

- 波利 normal / hit
- 瘋兔 normal / hit
- 綠棉蟲 normal / hit

之後如果要補齊 v0.8 地圖怪物池，還需要依 `data/monsters.json` 補對應圖片。

## 圖片命名規則提醒

正式版建議逐步改成官方 ID 命名：

- 物品：`images/items/501.webp`
- 怪物：`images/monsters/1002.webp`
- 地圖背景：可用英文地圖 key，例如 `prontera_south.webp`

目前 v0.9 保留既有 PNG / WebP 混用，不影響測試；等素材穩定後再統一轉 WebP。
