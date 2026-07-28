# V0.9.72 Position Combat Engine v0.2

本版目標：把 V0.9.70 / V0.9.71 已證明可行的平面座標戰鬥，整理成更接近 RO 的射程架構。

## 已更新

- 普攻正式接入 Position Engine 射程判定。
- 距離不足時不造成傷害，只會自動靠近目標。
- 技能攻擊也會先檢查射程，距離不足會靠近。
- 新增 `data/weapon_types.json`，武器射程資料化。
- 弓類普攻預設 4 Cell。
- 近戰武器預設 1 Cell。
- 長矛普攻暫定 2 Cell，之後可依 RA / 官方資料微調。
- 投擲長矛攻擊 `KN_SPEARBOOMERANG` 先給 7 Cell，作為騎士技能射程測試。
- 衝鋒攻擊 `KN_CHARGEATK` 先給 9 Cell，作為突擊技能射程測試。
- 地圖點擊改用 Pointer Events，支援桌機滑鼠與手機觸控。

## 射程單位

RO_WEB 從本版開始採用 RO Cell 概念。

目前暫定：

```text
1 Cell = 36 px
```

此數值集中在 `position_engine.js` 與 `weapon_types.json`，之後可整體調整，不可散落硬寫。

## Position Constitution

1. 所有距離判定必須走 Position Engine。
2. 所有普攻射程必須讀 `data/weapon_types.json`。
3. 所有技能射程必須優先讀 `skills.json` 的 `rangeCells`。
4. 怪物攻擊 / 追擊距離未來優先讀 RA `mob_db.yml` 的 `AttackRange` / `ChaseRange`。
5. 手機與桌機使用同一套 Pointer Events。

## 待後續微調

- 長矛普攻 2 Cell 是否完全符合手感。
- 弓 4 Cell 轉成畫面 px 後是否需要調整 `cellSizePx`。
- 技能射程後續要逐一依 RA / 官方資料補齊。
- 怪物體型、角色 Sprite 視覺中心點還可以再精準化。
