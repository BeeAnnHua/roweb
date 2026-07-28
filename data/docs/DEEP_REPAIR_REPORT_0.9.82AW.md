# RO_WEB 0.9.82AW 深度維修報告

## 維修範圍

以 `0.9.82AV` 商人系列完成版為基底，完整檢查啟動器、HTML、CSS、24 支正式載入 JavaScript、38 支回歸腳本、439 份 JSON、100 份職業技能樹、1139 招技能、Runtime 分區、物品／怪物／地圖／城鎮／NPC／商店引用、戰鬥位置、存檔與長駐計時器生命週期。

本次原則是：**能以資料、程式路徑與回歸測試明確證明的錯誤直接修正；可能改變既有遊戲設計的內容只列入已知限制，不擅自改規則。** 商人系列 147 招技能的既定效果與公式沒有被推翻。

## 已修復的重要問題

### 1. 技能視窗啟動崩潰

Skill Core 原本把 RA 施放需求物件放在 `requires`，技能樹又把前置技能陣列放在同名欄位。部分技能載入後的 `requires` 是物件，UI 執行 `.forEach()` 時直接崩潰，後續 UI、怪物生成與戰鬥初始化因此中止。

現在：

- 載入後的 `requires` 永遠是前置技能陣列。
- RA 執行需求完整保留在 `raRequirements`。
- 技能前置判定、提示與 SP／材料成本回退各自讀取正確欄位。
- 1139 個 Skill Index 與 1362 個技能樹節點均通過型別檢查。

### 2. 啟動順序與錯誤隔離

玩家資料載入期間不再提早渲染 UI。所有資料、玩家、地圖與 Runtime 完成後才進入介面初始化；每個 UI 步驟獨立捕捉錯誤，不再因單一技能窗問題讓整個遊戲停在「等待怪物出現」。

新增 `window.RO_WEB_BOOT_STATE`，可辨識 `loading`、`ready`、`ready_with_warnings`、`failed`，並記錄未處理例外與 Promise rejection。啟動前也會驗證怪物、地圖、職業、技能、Runtime、物品與玩家資料是否為空。

### 3. Windows 批次啟動與本地 HTTP

移除損壞或亂碼命名的舊批次檔，重建：

- `START_RO_WEB.bat`
- `STOP_RO_WEB.bat`
- `CHECK_RO_WEB.bat`

啟動器為 ASCII／CRLF，固定使用 `127.0.0.1:8000`，會先判斷埠是否已啟動，再依序嘗試 `py -3`、`python`、`python3`；沒有 Python 時改用純 PowerShell TCP 靜態伺服器。使用者不需要再手動把 `8000` 或網址當成命令輸入。

### 4. 戰鬥 Runtime 與技能執行路徑

- 刪除重複的全域 `isInPlayerAttackRange`。
- 補上 Official Runtime 已使用但原先缺少派送器的 `timed_status` Handler，石化術與泥沼地可正式執行。
- 怪物移速會套用 Runtime 的固定值與倍率 Debuff。
- 裝備職業限制改用內部 `player.jobKey`，不再用「劍士」等顯示文字錯判。
- 手動與自動喝水統一經 `calculateItemRecoveryAmount()`，知識藥水等被動會真正生效。
- 戰鬥公式後備資料補足種族表與陣列型別防護。
- 偷竊掉落的武器型別判斷改讀正式 Runtime 裝備型別。

### 5. 世界座標、衝鋒與擊退

原專案同時混用 `position`、`worldX/worldY` 與舊 DOM 座標，部分衝鋒／擊退只改到鏡像欄位，畫面可能動了但正式距離判定仍停在原位。

現在：

- `player.position`／`monster.position` 是唯一權威世界座標。
- `worldX/worldY` 僅同步給舊 Runtime 相容使用。
- 衝鋒會把玩家移至目標相鄰合法座標。
- 擊退會更新怪物正式位置、套用共同 36px Cell 尺度並限制在地圖邊界。
- 動態測試確認距離、畫面鏡像與正式座標同步。

### 6. 舊存檔與損壞資料防護

存檔可能因舊版本、手動修改或中途中斷而含有錯誤容器、`NaN`、`Infinity`、負等級或不存在的職業。現在載入後會先正規化：

- 背包必為陣列；裝備、技能、Buff、六圍、探索資料必為物件。
- 技能等級、Base／Job 等級、技能點、EXP、Zeny、HP／SP 等全部轉為有限數值並限制上下限。
- HP／SP 不超過最大值。
- 不存在的 `jobKey` 自動回復 `novice`。
- localStorage 讀寫失敗會被捕捉，不再讓啟動流程崩潰。

已以人工注入的損壞存檔動態測試，所有容器、等級與數值均成功修復，零 JavaScript exception。

### 7. 長駐計時器生命週期

位置更新、位置自動存檔、玩家自然回復、地面 Runtime、戰鬥資源與自動戰鬥都保留唯一 timer handle 及 start／stop。`pagehide` 會停止長駐迴圈；BFCache `pageshow` 只恢復一份，降低手機切頁或瀏覽器返回後出現重複回血、重複地面傷害與重複資源再生的風險。

### 8. 部署與維護工具

- 統一標題、favicon 與 `?v=0.9.82AW` cacheKey。
- 新增 `tools/deep_health_check.py`，檢查 JSON 重複鍵、HTML 資源、DOM ID、官方 ID、技能樹前置、Runtime Official/Pending 分區、Handler 派送、抄襲清單、地圖／掉落／商店引用、Data Bundle 一致性與 JavaScript 語法。
- 新增 `CHECK_RO_WEB.bat`，以後每版可直接重跑。
- 在專案憲法新增技能需求欄位、啟動順序、伺服器、權威座標、存檔正規化與計時器生命週期規則。

## 最終驗證結果

- **62／62** JavaScript 通過 Node 語法檢查（24 支遊戲腳本＋38 支測試腳本）。
- **38／38** 回歸測試通過。
- 健康檢查：**0 errors、36 known warnings、PASS**。
- **439／439** JSON 可解析，無重複鍵。
- 1139 個技能 ID 與技能代碼無重複。
- Official Runtime 550、Pending 589，無重疊且完整覆蓋 1139 招。
- 商人家族 **147／147 Official Runtime、Pending 0**。
- Chromium 乾淨頁面載入 24 支正式腳本：boot state=`ready`、1139 skills、100 job trees、1139 runtime、怪物成功生成、**0 JavaScript exception**。
- 100 個職業技能樹 × 5 個頁籤，共 **500 次 UI 渲染，0 failure、0 exception**。
- 深層行為測試通過：裝備職業、藥水被動、泥沼地移速、衝鋒、擊退與座標鏡像。
- 損壞存檔復原測試通過：容器、職業、等級、有限數值及 HP／SP 上限全部正確。
- `data_bundle.js` 與 439 份實體 JSON 完全一致。

## 已知但未擅自修改的 36 項警告

這些不是本次新增錯誤，且目前不會阻止遊戲啟動：

- 11 個礦石物品缺正式 WebP：990～998、1002、1011。系統繼續使用缺圖保護，未拿錯誤圖片冒充。
- 抄襲／繁殖資料中有 20 個未納入目前玩家 Skill Core 的 RA 子技能，但全部 `enabled:false`。
- 5 條尚未啟用的一轉路線指向目前 `jobs.json` 尚未建立的職業；全部 `enabled:false`，保留為後續資料接口。
- 全專案尚有 589 招 Pending，主要是尚未補完的法師、弓箭手與其他職業；本次不猜寫公式。
- SP／AP、特性素質點與統一成本系統依專案決議繼續延後。

## 環境限制與實機確認

本次在 Linux 容器完成靜態檢查、Node 回歸測試與 Chromium 動態啟動。Windows `.bat` 已檢查 ASCII、CRLF、命令順序、埠偵測與 PowerShell 後備路徑，但容器不能真正在 Windows 10 上雙擊。

另外，本環境的 Chromium 受組織政策限制，不能直接瀏覽 localhost；因此動態測試是在乾淨 Chromium 頁面中，以正式 `index.html` 順序載入相同 24 支腳本與完整 Data Bundle。Python HTTP 伺服器本身已另行以 HTTP 請求驗證。下載後仍建議在 Windows 實機雙擊一次 `START_RO_WEB.bat` 做最終平台確認。
