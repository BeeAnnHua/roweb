# WeaponType Rule - V0.9.80R

## 核心規則

所有可裝備武器都必須有 `weaponType`。

普通攻擊動畫解析：

```text
currentJob + gender + weaponType
↓
assets/characters/{job}/{gender}/motions.json.attack[weaponType]
```

Renderer 不能硬寫職業，也不能硬寫某把武器。

## 新增武器必填

```json
{
  "id": 1101,
  "type": "equipment",
  "category": "weapon",
  "subCategory": "sword",
  "weaponType": "sword"
}
```

## 現行初學者支援

- `fist`
- `dagger`
- `sword` / `oneHandSword`
- `axe`
- `mace`
- `staff`

## 特效規則

普通攻擊特效可由 `weaponType` 決定；技能特效必須由 SkillID / 技能資料決定。
