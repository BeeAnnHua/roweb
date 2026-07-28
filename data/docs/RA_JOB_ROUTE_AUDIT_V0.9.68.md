# V0.9.68 RA 開機檔職業路線檢查

資料來源：`RO_WEB專案資料/RA開機檔案英文版20260608(DB_re)/rathena-master/`

## 已採用

- `npc/custom/jobmaster.txt`
  - `.SkillPointCheck = true`：技能點未點完不可轉職。
  - `.Req_First = 1,10`：初心者轉一轉類入口。
  - `.Req_Rebirth = 99,50`：轉生條件。
  - `.Req_Fourth = 200,70`：四轉條件。
  - `.Req_Exp_NJ_GS = 99,70`：忍者 / 神槍手擴充二轉條件。
  - `.Req_Exp_SNOVI = 99,99`：超級初學者擴充條件。
  - `.Req_SHandler = 200,60`：喵族 Spirit Handler 條件。
  - `.SNovice = 45`：超級初學者 Base 45。
- `db/re/job_exp.yml`
  - Super Novice Job 上限 99。
  - Expanded Super Novice Job 上限 70。
  - Ninja / Gunslinger Job 上限 70。
  - Kagerou / Oboro / Rebellion / Star Emperor / Soul Reaper Job 上限 70。
  - Summoner Base 上限 200 / Job 上限 60。
  - 四轉與四轉擴充 Base 上限 275 / Job 上限 60。

## RO_WEB 決定版

- 一般職業必須走轉生流程，不加入 RA 內一般職業未轉生直接三轉入口。
- 一般職業二轉採 Job50，維持目前 RO_WEB 決定版；RA jobmaster 預設 `.Req_Second = 1,40` 僅作參考，不覆蓋本專案一般職業憲法。
- 擴充職業不套一般職 1~4 轉；每條路線獨立寫在 `data/job_constitution.json > extendedJobRoutes`。

## 擴充路線已寫入 JSON

- Novice → Super Novice：Base45 / Job10
- Super Novice → Expanded Super Novice：Base99 / Job99
- Expanded Super Novice → Hyper Novice：Base200 / Job70
- Novice → Ninja：Base1 / Job10；Ninja Job 上限 70
- Ninja → Kagerou / Oboro：Base99 / Job70
- Kagerou / Oboro → Shinkiro / Shiranui：Base200 / Job70
- Novice → Gunslinger：Base1 / Job10；Gunslinger Job 上限 70
- Gunslinger → Rebellion：Base99 / Job70
- Rebellion → Night Watch：Base200 / Job70
- Novice → Taekwon：Base1 / Job10；Taekwon Job 上限 50
- Taekwon → Star Gladiator / Soul Linker：Base1 / Job40（RA jobmaster `.Req_Second`）
- Star Gladiator / Soul Linker → Star Emperor / Soul Reaper：Base99 / Job50（RA jobmaster `.Req_Third`）
- Star Emperor / Soul Reaper → Sky Emperor / Soul Ascetic：Base200 / Job70
- Summoner → Spirit Handler：Base200 / Job60

## 待未來開放時補資料

目前只先定憲法與路線資料。擴充職業的技能、技能樹、NPC、圖片與正式開放狀態仍需後續補 JSON，不得為單一職業改核心程式。
