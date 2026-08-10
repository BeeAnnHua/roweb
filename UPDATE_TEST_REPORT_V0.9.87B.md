# V0.9.87B Update + Test Report

## Scope
- 正式「拍賣場」入口固定於右上 4 欄功能矩陣 **第 4 行第 1 格**；第 2 行既有「拍賣行」恢復為預告按鈕。
- 保留 V0.9.87A 拍賣交易所、VIP V1、多角色登入、Legacy Rescue、GM / Mail / Cloud Character 功能。
- 針對長時間掛機的本機完整存檔、IndexedDB、Supabase 同步與診斷寫入做節流／合併。
- 精簡 HTTP/HTTPS 啟動資料 bundle；保留 file:// 雙擊相容。
- 根目錄歷史更新檔完整封存整理。

## 掛機 / 雲端效能與安全
- 一般自動存檔的完整本機序列化最短間隔約 2 秒；高頻戰鬥事件改由 `requestGameSave()` 合併。
- localStorage 仍保留同步快照，IndexedDB 仍保留耐久鏡像。
- 持續掛機時 Supabase 角色自動快照只保留最新 envelope，正常最多約每 30 秒送出一次，避免大量重複網路寫入。
- 手動存檔、pagehide / beforeunload / freeze、死亡／復活、強制座標、切角色／帳號、拍賣交易、VIP 離線收益、登出等關鍵理由直接繞過節流。
- 暫時網路錯誤保留最新待同步快照並延後重試，不堆積無上限 Promise / save queue。
- 原每 60 秒無條件備份改為 dirty 時才保存；完全無變更時約每 5 分鐘 heartbeat。
- Writer Lease heartbeat 5 秒→10 秒、stale 35 秒，降低同步 localStorage 寫入。
- AFK 診斷 heartbeat 15 秒→30 秒；IndexedDB 診斷鏡像約每 2 分鐘或重大事件才寫。
- MVP / 台灣轉蛋掛機背包保護掃描 500ms→1500ms，仍會復原未授權扣除但減少全背包掃描頻率。

## 啟動記憶體 / Bundle
- `js/data_bundle.js`: 38,388,256 bytes。
- 新增 `js/data_bundle_core.js`: 13,623,417 bytes。
- HTTP/HTTPS 啟動 bundle 減少 24,764,839 bytes，約 **64.5%**。
- Core bundle 保留完整 305 個 `data/**` key，另保留 Generic12 + V92 必要 Manifest；大型角色／atlas JSON 不再於 HTTP 啟動時全部預載。
- file:// 雙擊模式仍使用完整 `data_bundle.js`，不破壞既有離線相容。

## 根目錄整理
- 整理前：91 項。
- 整理後：22 項。
- 70 份舊 APPLY / TEST_REPORT / PATCH / RELEASE 類檔案先完整封存至 `docs/release_history/ROOT_RELEASE_RECORDS_THROUGH_V0.9.87A.zip` 後才自根目錄移除；沒有刪除遊戲 Runtime / 素材。

## 第 1 輪驗證
- 68 個 JavaScript 檔全部 `node --check`：PASS。
- `index.html / cloud_account.html / cloud_register_test.html / gm_center.html` 共 88 個本機 `src/href` 參照存在：PASS。
- HTML duplicate id：0。
- Quick menu：第 7 格=`拍賣行` 預告；第 13 格=`拍賣場`，4 欄版型即第 4 行第 1 格：PASS。
- Core bundle：305/305 `data/**` key 完整、內容與 full bundle 一致；4 個必要 skill-effect key 完整：PASS。
- 本機 HTTP server 對 `index.html`、core bundle、player/cloud/auction runtime、auction CSS：HTTP 200。

## 第 2 輪回歸
- 最終修改後再次執行全 JS syntax、HTML local-reference、duplicate-id、quick-menu order、bundle equality、cache-key、SQL-presence 稽核：PASS。
- V0.9.87A Auction SQL 與 V0.9.86Q VIP SQL 均保留於 `supabase/`；本版 **沒有新增 SQL migration**。
- 由於工作環境禁止 headless Chromium 導航 localhost，無法在此環境登入真實 Supabase 帳號做真人雲端 session 操作；因此沒有宣稱完成線上帳號實機測試。靜態／HTTP 資源／資料完整性稽核均已通過。

## 安裝
- 直接以本完整包覆蓋目前專案（建議先備份目前線上版本）。
- 已成功執行過 V0.9.87A 拍賣 SQL 的資料庫 **不用重跑 SQL**。
- 不需要清 localStorage / IndexedDB。
