# RO_WEB 0.9.82 Combat Pipeline

## 唯一入口
`CombatDamagePipeline` 是普攻、物理技能、魔法技能與被動觸發的共同入口。底層傷害數值由 `RARenewalDamagePipeline` 計算。

## 順序
Attack Context → Hit → Perfect Dodge → Critical → Passive Proc Registry → Element → Race → Size → Skill Formula → Defense → Final Modifier → Status Metadata → Damage Output。

## Registry 原則
每個效果只檢查自身條件。條件不成立就 `continue`，不以職業名稱建立另一套傷害公式。六合拳、二刀連擊、獵鷹、Auto Spell、武器 Proc、卡片 Proc 共用同一層。

## RO_WEB 差異
不檢查箭矢、子彈、苦無與技能材料；不要求隱匿或接技前置；自動戰鬥本版只保留相容模式。

## Pending
獵鷹傷害、Auto Spell 實際施法、武器／卡片 Proc 實際效果需要對應資產或技能資料時才執行；條件不存在時安全跳過。手推車重量、手推車終結技、抄襲／繁殖、塗鴉、Homunculus、Mercenary、Guild 仍待 RO_WEB 專案化設計。
