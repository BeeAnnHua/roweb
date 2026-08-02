# RO_WEB 0.9.82IB — V92 主動技能特效 Runtime 稽核

- 結果：**PASS**
- 接入主動技能：**55**
- Effect JSON：**454**
- PNG：**2395**
- RO_WEB 被動技能紀錄：**216**
- V91.6 Ready 候選與被動交集：**0**

## 被動技能守門

RO_WEB `runtime_generated_all.json` 的 handler 是唯一權威。`handler=passive`、`handler=pending`、空 handler 或 `executionEnabled!=true` 一律不進入部署 Manifest，也不排程特效。Runtime 每次收到 Begin／Commit／Hit 事件時還會重新檢查一次。

本次 55 招候選全部仍為可執行主動技能，因此實際排除候選為 0；另外 216 招 RO_WEB 被動技能已完整寫入 `SKILL_EFFECT_PASSIVE_EXCLUSION_AUDIT_0.9.82IB.json`。

## 事件數量

- `CAST_BEGIN`：56
- `CAST_COMPLETE`：9
- `DAMAGE_COMMIT`：60
- `GROUND_SPAWN`：31
- `HIT_CONFIRM`：32
- `LOOP_START`：11
- `PROJECTILE_LAUNCH`：8
- `SKILL_BEGIN`：2
- `SKILL_END`：13

## 顯示與生命週期

- BACK Canvas 位於角色／怪物後方；FRONT Canvas 位於角色／怪物前方，但低於 HUD。
- 桌機優先 Full，手機／低核心裝置優先 Min，兩者雙向 fallback。
- `SKILL_END`、死亡、換地圖、切換角色及頁面離開會清理持續特效。
- 不回寫 RO_WEB 的中文技能名稱與改造說明。
