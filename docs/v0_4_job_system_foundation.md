# RO_WEB v0.4 Job System Foundation

## 本版目標

v0.4 先建立職業成長架構，不追求一次完成所有職業。

玩家主線先跑通：

```text
初心者 → 冒險者修練 Job10 → 劍士 → Job50 → 騎士
```

十字軍先建立資料架構，但暫不開放。

---

## 新增檔案

```text
data/server_config.json

data/jobs.json

data/skills.json

js/job.js

技能 placeholder（已於 v0.9.64c 退休）

docs/v0_4_job_system_foundation.md
```

---

## 職業等級規則

第一階段只做到三轉前：

```text
Base Lv 上限：99

初心者 Job Lv 上限：10
一轉 Job Lv 上限：50
二轉 Job Lv 上限：50
```

暫時不做：

- 轉生
- 進階二轉 Job70
- 三轉

---

## 冒險者修練

RO_WEB 不照搬原版 Basic Skill。

改成初心者 Job1~10 的永久被動：

| Job Lv | 修練 | 效果 |
|---|---|---|
| 1 | 生命修練 I | Max HP +2% |
| 2 | 精神修練 I | Max SP +2% |
| 3 | 戰鬥修練 I | ATK +2% |
| 4 | 冒險知識 I | Base EXP +2% |
| 5 | 金錢管理 I | Zeny +2% |
| 6 | 拾荒技巧 I | 掉寶率 +1% |
| 7 | 防禦修練 I | DEF +2% |
| 8 | 武器熟悉 I | 最終傷害 +1% |
| 9 | 冒險精神 | ATK +1 / DEF +1 |
| 10 | 修練完成 | 開啟一轉職業 |

初心者轉職後，冒險者修練永久保留。

---

## 轉職設計

v0.4 已建立：

```text
novice
└── swordman
    ├── knight
    └── crusader（預留 / 未開放）
```

規則：

```text
Job Lv 達上限
↓
職業 UI 顯示轉職按鈕
↓
點擊後直接轉職
↓
Job Lv 歸回 1
```

不做：

- 轉職 NPC
- 任務流程
- 考試
- 收集材料

---

## Server Config 倍率

新增 `data/server_config.json`。

倍率規則：

```text
100 = 1 倍
200 = 2 倍
1000 = 10 倍
10000 = 100 倍
```

掉落率仍使用萬分比：

```text
10000 = 100%
100 = 1%
1 = 0.01%
```

目前套用：

- Base EXP
- Job EXP
- Drop
- Zeny

官方 DB 數值不直接修改，遊戲實際獎勵由 server_config 套用倍率。

---

## 技能圖片

v0.4 技能圖片不是重點。

缺圖先用：

```text
技能 placeholder（已於 v0.9.64c 退休）
```

之後抓到正式技能圖後，只要替換 `data/skills.json` 的 icon 路徑即可。
