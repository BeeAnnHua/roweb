# RO_WEB Alpha 0.3 Combat Loop + Hunting Stats

## 本版目標

v0.3 主要把 v0.2 的「EXP / 掉寶 / 背包 / Zeny」串成更完整的放置戰鬥循環，並新增右下角「狩獵統計」UI。

## 新增內容

### 1. 狩獵統計 UI

位置：戰鬥畫面右下角。

目前顯示：

- 總擊殺
- Base EXP 累積
- Job EXP 累積
- Zeny 累積
- 掉寶數
- 各怪物擊殺數

### 2. `js/stats.js`

新增 HuntingStatsManager，負責：

- 初始化統計資料
- 記錄怪物擊殺
- 記錄 EXP / Zeny 收益
- 記錄掉寶數量
- 更新狩獵統計 UI
- 重置統計

### 3. 完整戰鬥循環整理

流程：

```text
自動戰鬥開始
→ 生成怪物
→ 玩家攻擊
→ 怪物死亡
→ 發放 EXP / Zeny / 掉寶
→ 更新背包
→ 更新狩獵統計
→ 等待短暫重生
→ 生成下一隻怪物
```

### 4. Battle Log 改善

戰鬥紀錄現在會顯示時間：

```text
[08:30:12] 你對 波利 造成 12 點傷害。
```

### 5. Player State 雛形

目前先保留簡單狀態：

- Idle
- Searching
- Attacking

之後 Auto Buff / Auto Potion / Auto Return 可以接在這套狀態上。

## 延續規則

本版仍遵守 RO_WEB 輕量化規則：

- 不做負重量
- 不做已鑑定 / 未鑑定
- 不做箭矢消耗
- 不做技能媒介消耗
- 道具與怪物使用官方 RO ID
