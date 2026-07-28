# Movement Engine v0.1 - V0.9.71

本版把 V0.9.71 的 Position Combat Prototype 接上 RA WalkSpeed 規則。

## RA 參考來源

專案入口 RA 開機檔：

```text
RA開機檔案英文版20260608(DB_re)/rathena-master/src/common/mmo.hpp
```

確認值：

```text
DEFAULT_WALK_SPEED = 150
MIN_WALK_SPEED = 20
MAX_WALK_SPEED = 1000
```

## RO_WEB 決定

- 移動速度統一使用 `walkSpeed`。
- 數值越小越快。
- 普通玩家：150。
- 最快：20。
- 最慢：1000。
- 裝備、卡片、技能、Buff、坐騎都不得各自修改座標位移，必須統一修改 `walkSpeed`。

## 支援加成欄位

```json
{
  "walkSpeedFlat": -25,
  "walkSpeedRate": -20
}
```

說明：

- `walkSpeedFlat`：直接修改 RA WalkSpeed。負數變快，正數變慢。
- `walkSpeedRate`：百分比修改 RA WalkSpeed。負數變快，正數變慢。

## 未來可接入

- 加速術
- 緩速術
- 月夜貓卡
- 大嘴鳥 / 騎乘
- 騎狼
- 手推車加速
- 地板緩速
- 怪物速度變化

## 注意

V0.9.71 只建立 Movement Engine 底層與 UI 顯示，還沒有正式新增上述卡片/技能效果。
