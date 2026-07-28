# Skill Core 資料來源與完成狀態（0.9.80ZH）

- Core 檔案最上方 `title` 為資料來源、範圍、自訂規則與完成狀態的唯一摘要區。
- Skill ID 全專案唯一；職業技能樹只引用 Skill ID。
- 技能圖片固定為 `images/skills/{SkillID}.png`。
- 未來技能特效固定為 `images/skill_effects/{SkillID}.png` + `data/skill_effects/{SkillID}.json`。
- 不直接使用 SPR / ACT。
- 世界座標由 Skill Runtime 的 caster / target / targetPosition 決定，特效 JSON 不保存世界座標。
- 怪物、傭兵、公會、NPC、GM、測試技能不納入玩家 Core。
- Runtime 公式未完成的技能維持明確 pending 標記。
