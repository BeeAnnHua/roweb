# RA Job / EXP / Level Cap Audit - V0.9.69

資料來源：

- 專案入口：`RO_WEB專案資料.zip`
- RA 開機檔：`RA開機檔案英文版20260608(DB_re)/rathena-master`
- 主要依據：`db/re/job_exp.yml`
- 轉職需求輔助依據：`npc/custom/jobmaster.txt`

## RO_WEB 排除 / 覆寫規則

以下屬於 RO_WEB 決定版，不完全照 RA jobmaster：

1. 一般職業一轉 → 二轉：固定 Job Lv 50。
   - RA jobmaster `.Req_Second` 預設為 `Base 1 / Job 40`。
   - RO_WEB 不採用 Job40，固定 Job50。
2. 一般職業高級一轉 → 進階二轉：固定 Job Lv 50。
   - 同樣不採用 RA jobmaster Job40。
3. 一般職業不允許未轉生直接三轉。
   - RA jobmaster 有 `.Req_Third 99/50` 類似入口。
   - RO_WEB 排除；必須經過轉生、高級一轉、進階二轉後，才可三轉。

除上述規則外，Base / Job 上限與擴充職業條件以 RA DB_re 為準。

## RA DB_re 上限確認表

| RO_WEB 職業 | RA Job 名稱 | Base 上限 | Job 上限 |
|---|---|---:|---:|
| novice | Novice | 99 | 10 |
| swordman | Swordman | 99 | 50 |
| knight | Knight | 99 | 50 |
| crusader | Crusader | 99 | 50 |
| super_novice | Super_Novice | 99 | 99 |
| expanded_super_novice | Super_Novice_E | 200 | 70 |
| hyper_novice | Hyper_Novice | 275 | 60 |
| ninja | Ninja | 99 | 70 |
| kagerou | Kagerou | 200 | 70 |
| oboro | Oboro | 200 | 70 |
| shinkiro | Shinkiro | 275 | 60 |
| shiranui | Shiranui | 275 | 60 |
| gunslinger | Gunslinger | 99 | 70 |
| rebellion | Rebellion | 200 | 70 |
| night_watch | Night_Watch | 275 | 60 |
| taekwon | Taekwon | 99 | 50 |
| star_gladiator | Star_Gladiator | 99 | 50 |
| soul_linker | Soul_Linker | 99 | 50 |
| star_emperor | Star_Emperor | 200 | 70 |
| soul_reaper | Soul_Reaper | 200 | 70 |
| sky_emperor | Sky_Emperor | 275 | 60 |
| soul_ascetic | Soul_Ascetic | 275 | 60 |
| summoner | Summoner | 200 | 60 |
| spirit_handler | Spirit_Handler | 275 | 60 |

## 結論

- 四轉 / 擴充四轉：Base Lv 275 / Job Lv 60。
- 三轉與擴充三轉：Base Lv 200 / Job Lv 70。
- 超級初學者：Base Lv 99 / Job Lv 99。
- 擴充超級初學者：Base Lv 200 / Job Lv 70。
- 喵族 Summoner：Base Lv 200 / Job Lv 60。
- Spirit Handler：Base Lv 275 / Job Lv 60。
- 一般二轉 / 進階二轉：RO_WEB 固定 Job Lv 50。
