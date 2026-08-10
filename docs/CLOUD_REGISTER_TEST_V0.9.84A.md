# RO_WEB V0.9.84A — 一般玩家雲端註冊實測

## 基準
- 以 `roweb(目前最新版).zip` / V0.9.83E3 為唯一基準。
- 本 Patch **不覆蓋 index.html，也不修改既有角色、本機存檔或戰鬥內容**。
- 註冊畫面共用現行角色選擇／登入大廳大背景：`images/ui/character_select_background.webp`。

## 測試目的
驗證以下完整鏈：
1. 一般玩家輸入遊戲帳號 + Email + 密碼。
2. Supabase Auth 寄出《彼岸花仙境》6 位數 OTP。
3. 玩家輸入 OTP 完成 Email 驗證。
4. 前端以登入 Session + RLS 建立 `public.ro_accounts`。
5. `player_id` 由資料庫 sequence 自動分配。
6. 第一位一般玩家預期為 `100010`。
7. `account_role` 預期為 `player`、`slot_limit` 預期為 `12`。

## 使用方式
1. 把 Patch 內檔案直接覆蓋／加入最新版 ROWEB 根目錄。
2. 執行 `START_RO_WEB.bat`。
3. 瀏覽器開啟：
   `http://127.0.0.1:8000/cloud_register_test.html`
4. **請使用不同於 GM01 的普通玩家 Email** 測試。
5. 收到 OTP 後輸入 6 位數驗證碼。
6. 成功頁確認 Player ID 是否為 `100010`。

## 注意
- Publishable Key 是瀏覽器端公開金鑰；Patch 中沒有 Secret / service_role key。
- 本版僅驗證「首次 Email → 第一個 RO 帳號」。
- 同一 Email 的第 2～5 個 RO 帳號，以及最終「遊戲帳號 + 密碼」登入，下一階段會接帳號管理／安全登入 resolver。
- 若 Email 驗證成功但建立 `ro_accounts` 失敗，不要刪 Auth User；保留錯誤訊息再修即可。
