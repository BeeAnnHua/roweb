# RO_WEB v0.7 Debug Review

本版目標：先不新增大型玩法，針對 v0.6 Skill Engine / Auto Battle 進行穩定性檢查與小修正。

## 已檢查項目

- HTML / JS 載入順序
- JSON 格式有效性
- 技能資料 `skillType` 架構
- 自動戰鬥設定 UI 對應
- 掉寶 / Zeny / EXP 倍率流程
- 背包物品 ID 數字 / 字串相容
- 戰鬥死亡流程

## 修正內容

### 1. 死亡判定優先於自動喝水

v0.6 中怪物攻擊後會立刻觸發自動喝水，可能出現 HP 已經被打到 0 仍然喝水補回來的情況。

v0.7 改為：

```text
怪物攻擊
↓
HP <= 0 ?
  是 → 死亡
  否 → 才允許自動喝水
```

### 2. 自動戰鬥開始時同步新設定

v0.6 的開始戰鬥流程仍然保留舊版 `syncAutoPotionSettingsFromUI()` 呼叫。

v0.7 改成同步：

```text
syncAutoCombatSettingsFromUI()
```

也就是正式使用 v0.6 新的 AutoBattleEngine 設定。

### 3. 避免新舊自動補給函式混淆

舊版 `autoUsePotion()` 改名為：

```text
autoUsePotionLegacy()
```

正式戰鬥使用：

```text
js/auto_battle.js → autoUsePotion()
```

### 4. 物品名稱查找修正

`getItemName()` 改成數字 / 字串皆可對應：

```text
501 == "501"
```

避免 select 或舊存檔帶字串 ID 時顯示不到名稱。

## 尚未處理 / 之後可優化

- 舊版 autoPotion UI 相容函式仍保留，但目前主 UI 已改用 autoCombat。
- Buff / Heal 是否消耗一個戰鬥回合，之後可依手感再調整。
- 目前尚未導入真正地圖系統，v0.8 可開始處理地圖與怪物分布。
