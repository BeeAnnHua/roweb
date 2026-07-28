# RO_WEB Item Effect Rule v0.9.33

## 核心原則

資料可以先完整，功能可以分階段實作。
目前未實作的效果仍可先放在 `effects`，未來 Stat Engine 逐步啟用。

## 建議欄位命名

```json
{
  "effects": {
    "str": 1,
    "agi": 1,
    "vit": 1,
    "int": 1,
    "dex": 1,
    "luk": 1,
    "atk": 10,
    "matk": 10,
    "def": 5,
    "mdef": 5,
    "hit": 5,
    "flee": 5,
    "cri": 5,
    "aspd": 1,
    "critDamage": 10,
    "variableCast": -10,
    "fixedCast": -0.3,
    "bossDamage": 10,
    "raceDamage": { "demiHuman": 10 },
    "elementDamage": { "fire": 10 },
    "sizeDamage": { "large": 10 }
  }
}
```

## 不要寫法

- 不要混用 `ATK+5`、`Attack`、`atkPlus`。
- 統一使用小寫 camelCase。
