# RO_WEB v0.9 Town / NPC / Shop Foundation

本版建立城鎮、NPC、商店與轉職 NPC 的資料化架構。

## 新增內容

- `data/cities.json`：六大城市資料。
- `data/npcs.json`：NPC 架構，NPC 只綁定 type / shopId / jobCategory。
- `data/shops.json`：共用商店資料，商品先放簡化版。
- `data/job_change.json`：轉職 NPC 規則，之後可加入轉生、三轉。
- `js/town.js`：城鎮、NPC、商店、購買、轉職 NPC 管理。

## 六大城市

- 普隆德拉：新手主城 / 服事系預留。
- 依斯魯得：劍士、騎士、十字軍。
- 吉芬：法師系。
- 斐揚：弓箭手系。
- 艾爾貝塔：商人系。
- 夢羅克：盜賊系。

朱諾（Juno）先預留到未來轉生系統。

## 目前開放

- 依斯魯得劍士導師：初心者 Job10 可轉劍士。
- 依斯魯得劍士導師：劍士 Job50 可轉騎士。
- 十字軍與其他一轉職業先保留資料架構，未開放。

## 設計原則

- 城鎮不打怪，只處理商店、NPC、轉職、未來倉庫。
- 商店商品先簡化，日後依官方 NPC 資料更新 `shops.json` 即可。
- 轉職仍保留 RO 世界感：到對應城市找 NPC，但不做繁瑣任務、考試、材料。
