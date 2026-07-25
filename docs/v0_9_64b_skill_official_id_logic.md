# RO_WEB V0.9.64b - Skill Official ID Logic Hotfix

## 本版目的

將技能系統主鍵統一改為官方數字 Skill ID，方便後續 RO Studio / Skill Builder / 官方資料匯入時直接對應。

## 規則

```json
{
  "id": 5,
  "officialId": 5,
  "code": "SM_BASH",
  "name": "狂擊",
  "icon": "images/skills/5.webp"
}
```

- `id`：官方數字 Skill ID，作為主要邏輯 ID。
- `officialId`：保留同一個官方 ID，方便與 Item / Monster 規則一致。
- `code`：英文技能代號，只作為開發閱讀與資料追蹤用途。
- `name`：玩家介面顯示繁體中文。
- `icon`：使用官方 Skill ID 命名的圖檔。

## 前置技能

前置技能也改吃官方數字 ID：

```json
"requires": [
  { "id": 5, "level": 5, "code": "SM_BASH" }
]
```

## 相容處理

為避免舊存檔出現 `SM_BASH` 這類英文 key，本版加入啟動時轉換：

- `player.learnedSkills`
- `player.pendingSkillAdds`
- `player.quickSlots`
- `player.autoCombat.heal.skillId`
- `player.autoCombat.attack.skillId`
- `player.autoCombat.buffs`

以上資料若使用舊英文代號，會自動轉成官方數字 ID 字串。
