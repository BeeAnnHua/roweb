# V0.9.66 Job Engine Constitution

本版將「所有冒險者轉職前必須通過的共同規則」正式獨立為 Job Constitution。

## 核心規則

1. 任何轉職請求都必須先通過 `validateJobConstitution()`。
2. 任何新增職業不得修改核心轉職程式，只允許新增 JSON 資料。
3. 所有職業共通規則不得散落在城鎮 NPC、各職業程式或 UI 中。
4. 當前技能剩餘點數必須全部點完才能轉職。
5. 轉職前必須卸除手推車、獵鷹；預留坐騎、狼、龍、機甲、傭兵、召喚物等檢查。
6. 0→1 轉：Job10 + 基本技能 Lv9 + 技能點全數點完。
7. 1→2 轉：Job50 + 技能點全數點完。
8. 轉生、3轉、4轉規則已寫入憲法資料作為預留，不在未確認前硬開。

## 修改檔案

- 新增 `data/job_constitution.json`
- 新增 `js/job_constitution.js`
- 更新 `js/game.js`：啟動時載入 Job Constitution
- 更新 `js/job.js`：`changeJob()` 統一經過 Constitution 驗證
- 更新 `js/town.js`：NPC 只顯示與呼叫 Constitution 結果，不再自行硬寫共通規則
- 更新 `RO_WEB_CONSTITUTION.json`：加入 JOB-001 ~ JOB-007
- 更新 `data_bundle.js`

## 合併檢查

本版以使用者提供的 V0.9.65c 為基底，並合併 V0.9.65d 的裝備公式修正，避免回退：

- DEF 實際套入怪物傷害
- MDEF 裝備值接入能力值
- HIT / FLEE / ASPD / CRI 裝備值接入戰鬥公式
