# RO_WEB 0.9.82IB — 被動技能特效排除稽核

- Runtime 技能總數：**1139**
- 目前 handler=passive：**216**
- 其中具有 RO_WEB 改造／永久被動紀錄：**89**
- V91.6 Ready 候選：**55**
- 本次候選中實際被動／停用排除：**0**
- 候選與被動清單交集：**0**

## 固定規則

- `runtime_generated_all.json` 的 handler 與 executionEnabled 是唯一權威。
- `passive`、`pending`、空 handler 或 `executionEnabled != true` 不進入技能特效 Manifest。
- 即使素材庫有同名主動技能特效，也不會覆蓋 RO_WEB 的被動改造。
- Runtime 在每次 Begin／Commit／Hit 再檢查一次，防止資料更新後舊 Manifest 誤播放。

## 已記錄的 RO_WEB 改造被動（節錄）

- `1` `NV_BASIC` 基本技能：RO_WEB 初心者知識永久被動：每級 Base EXP／Job EXP／掉寶率 +2%，Zeny +5%。基本技能仍由初心者知識與獎勵結算入口統一套用，避免通用被動重複計算。
- `9` `MG_SRECOVERY` 禪心：永久被動。每次自然恢復 SP 時，額外恢復「技能等級×3＋技能等級×MaxSP÷500」SP。
- `10` `MG_SIGHT` 火狩：RO_WEB 專屬調整：學會後永久增加 ATK／MATK 傷害 5%。移除原本的主動偵測、怪物情報或鄰近觸發攻擊效果。
- `37` `MC_DISCOUNT` 低價買進：永久被動。向 NPC 商店購買物品時，價格折扣 7%／9%／11%／13%／15%／17%／19%／21%／23%／24%。
- `38` `MC_OVERCHARGE` 高價賣出：永久被動。向 NPC 商店販售物品時，售價提高 7%／9%／11%／13%／15%／17%／19%／21%／23%／24%。
- `39` `MC_PUSHCART` 手推車使用：Each level grants ATK +1%. Cart combat/rental capability remains reserved; future cart appearance/rental data will use J
- `40` `MC_IDENTIFY` 物品鑑定：Item appraisal is retired in RO_WEB; converted to permanent MHP/MSP +5%.
- `41` `MC_VENDING` 露天商店：RO_WEB 專屬調整：每級永久增加 ATK 2%，Lv10 共增加 20%。不提供玩家露天商店功能。
- `43` `AC_OWL` 鶚梟之眼：永久被動。每級 DEX +1，Lv10 共 DEX +10。
- `44` `AC_VULTURE` 蒼鷹之眼：永久被動。裝備弓時，每級使普通攻擊射程增加 1 格，Lv10 共增加 10 格。
- `48` `TF_DOUBLE` 二刀連擊：永久被動。裝備短劍普通攻擊時，有 7%～70% 機率發動二刀連擊，造成 2 段攻擊。
- `49` `TF_MISS` 殘影：永久被動。每級 FLEE +3；盜賊二轉及其後續職業每級改為 FLEE +4。
- `65` `PR_MACEMASTERY` 權杖使用熟練度：
- `87` `WZ_ICEWALL` 冰刃之牆：依專案決議取消冰牆地圖阻擋、耐久與火屬性移除機制，改為永久被動：每級 MaxHP／MaxSP +2%。
- `93` `WZ_ESTIMATION` 怪物情報：RO_WEB 專屬調整：學會後永久增加 ATK／MATK 傷害 5%。移除原本的主動偵測、怪物情報或鄰近觸發攻擊效果。
- `94` `BS_IRON` 鐵製造：Material crafting is excluded; converted to MHP/MSP +2% per level.
- `95` `BS_STEEL` 鋼製造：Material crafting is excluded; converted to MHP/MSP +2% per level.
- `96` `BS_ENCHANTEDSTONE` 屬性石製造：Material crafting is excluded; converted to MHP/MSP +2% per level.
- `97` `BS_ORIDEOCON` 神之金屬研究：Material research/crafting is excluded; converted to MHP/MSP +2% per level.
- `98` `BS_DAGGER` 短劍製作：Weapon crafting is excluded; converted to ATK +2% per level.
- `99` `BS_SWORD` 劍製作：Weapon crafting is excluded; converted to ATK +2% per level.
- `100` `BS_TWOHANDSWORD` 雙手劍製作：Weapon crafting is excluded; converted to ATK +2% per level.
- `101` `BS_AXE` 斧頭製作：Weapon crafting is excluded; converted to ATK +2% per level.
- `102` `BS_MACE` 權杖製作：Weapon crafting is excluded; converted to ATK +2% per level.
- `103` `BS_KNUCKLE` 拳套製作：Weapon crafting is excluded; converted to ATK +2% per level.
- `104` `BS_SPEAR` 長矛製作：Weapon crafting is excluded; converted to ATK +2% per level.
- `105` `BS_HILTBINDING` 武器保有：永久被動。STR +1。
- `107` `BS_WEAPONRESEARCH` 武器研究：永久被動。所有武器的 ATK 每級 +2，Lv10 共 ATK +20。
- `108` `BS_REPAIRWEAPON` 武器修理：RO_WEB 專屬調整：學會後永久增加 ATK 傷害 5%。不建立武器損壞與修理流程。
- `118` `HT_SHOCKWAVE` 魔耗陷阱：RO_WEB 改造為永久被動：每級遠距離物理傷害 +2%。Lv5 合計 +10%；不再設置削減怪物 SP 的陷阱，也不消耗陷阱道具。

完整 89 招與全部 216 招被動資料請見同名 JSON。
