# V0.9.87G current baseline

## V0.9.87G — Auction sell inventory filters + mail status cleanup + account-switch SLOT isolation
- Baseline: user-provided V0.9.87F full package (`roweb(9).zip`).
- Auction `我要上架` inventory adds `消耗品 / 裝備 / 物品 / ↻` controls; initial view remains all items, clicking an active category again returns to all.
- `物品` covers cards/materials/other non-equipment/non-consumable rows.
- Removes the persistent mail-claim synchronization explanation from the player-facing footer; anti-duplicate receipts and server reconciliation remain unchanged.
- Cloud character selector browser profile is now scoped per RO `account_id` (`ro_web_account_profile_v2_<accountId>`), preventing a previous Player ID's cached SLOT 1 from hydrating while a newly selected account is binding.
- Legacy `ro_web_account_profile_v1` is still mirrored for rescue/backward compatibility but ignored when it belongs to another selected cloud account.
- Account switching clears stale one-shot character-entry fallback tokens.
- No Supabase SQL migration required.

# V0.9.87F current baseline

## V0.9.87F — Auction multi-currency fixed-price 12H
- Baseline: user-provided V0.9.87E full package (`roweb(8).zip`).
- Auction listing lifetime for new listings is 12 hours (43200 seconds); this is fixed-price, not bidding.
- Sellers can choose Zeny / Blue Gem / Red Gem as the sale currency.
- Listing fee keeps the existing 1 / 2 / 3 / 5 tiers but is charged in the selected sale currency.
- Sale tax remains 5% in the selected sale currency; seller receives 95% via in-game mail.
- Market adds currency filtering and currency-specific 7-day price statistics.
- Same-browser account switching uses the active character accountId for auction ownership checks; different Player IDs may trade, same RO account cannot buy its own listing.
- Distinct purchase errors: sold / expired / reserved / unavailable.
- Requires new Supabase migration: `supabase/V0.9.87F_AUCTION_MULTI_CURRENCY_12H.sql`.
- V0.9.87C warehouse rescue, V0.9.87E VIP 15s offline arm, cloud/AFK optimizations and modal HUD isolation are preserved.

# V0.9.87E current baseline

## V0.9.87E — VIP offline arm + 15s/kill + Auction modal HUD isolation
- Baseline: user-provided V0.9.87D full package (`roweb(7).zip`).
- VIP offline settlement now requires the same character to have actively started auto battle before leaving the page.
- Server-side arm/disarm state prevents ordinary logout from receiving offline farming rewards.
- Offline virtual kill pace: 15 seconds per kill, maximum 1,920 kills over 8 hours.
- Auction remains on the V0.9.87D 1-minute test configuration.
- Auction overlay now behaves as a true modal layer and hides right HUD/player card while open.
- Requires one new Supabase migration: `V0.9.87E_VIP_OFFLINE_ARM_15S.sql`.

# V0.9.87D current baseline

## V0.9.87D — Auction 1-minute closed-loop test
- Baseline: V0.9.87C.
- Auction listing lifetime is temporarily controlled server-side at 60 seconds for testing.
- Auction UI shows second-level countdown.
- While auction UI is open, a low-frequency 10-second server sweep tick helps expose expiration/return mail quickly.
- Seller receives 95% Zeny by mail after sale; buyer receives item by mail.
- This is a TEST duration only. Restore the server config to 86400 seconds after validation.
- No warehouse/VIP/cloud-performance rollback.

# V0.9.87C current baseline

## V0.9.87C — Legacy Warehouse Rescue
- 帳號共用倉庫新增「救援舊倉庫」入口。
- 主動掃描 localStorage / sessionStorage / IndexedDB 的舊倉庫候選。
- 不自動覆蓋、不刪除任何舊瀏覽器資料。
- 玩家確認目前 Player ID 後才允許合併。
- 裝備保留 instance/refine/cards/enchants；以 instanceId 防止重複。
- 堆疊道具採數量合併；救援 receipt 防止同一候選重複匯入。
- 若候選屬於另一個 Supabase Account UUID，前端直接阻擋。
- 合併前檢查 200 格容量；超過上限整批不寫入。
- Cloud 帳號先等待 Supabase shared_save 寫入成功，再更新本機倉庫。
- 無新 SQL；沿用既有 shared_save.account_storage。

## V0.9.87B — 拍賣場入口定位＋雲端掛機效能／穩定性精修＋根目錄整理

- 基準：使用者 2026-08-11 上傳的 `roweb(更更更新板).zip`（已含 V0.9.87A 拍賣交易所、VIP Q、R 掛機穩定、多角色登入修正）。
- **拍賣入口**：保留原第 2 行第 3 格「拍賣行」預告；新的正式「拍賣場」固定放在右上 4×N 功能區 **第 4 行第 1 格**。
- **HTTP/HTTPS 輕量啟動**：`file://` 雙擊模式仍載入完整 38.4 MB `js/data_bundle.js`；GitHub Pages／本機 HTTP 改載 13.6 MB `js/data_bundle_core.js`（保留全部 `data/**` 與必要同步 Manifest，大型角色／atlas JSON 改由 HTTP 按需讀取），降低約 64.5% 的啟動 bundle 解析量與 heap 壓力。
- **自動存檔合併**：一般戰鬥／技能／補品等高頻變更的本機完整序列化最短間隔 2 秒；關鍵手動／死亡／切角／拍賣／VIP 結算仍立即保存。
- **雲端同步節流**：持續掛機時 Supabase 角色快照最多約每 30 秒送出最新一份；中間版本仍保存在 localStorage + IndexedDB，手動存檔會立即同步並驗證。
- **空閒備份減量**：原每 60 秒無條件建立新版本改為只有 dirty 時保存；完全無變更時每 5 分鐘才做一次 heartbeat。
- **戰鬥存檔去抖**：怪物攻擊／世界怪物／擊殺獎勵改走合併式 requestGameSave，降低長時間自動掛機反覆 stringify / localStorage / IDB 壓力。
- **AFK 診斷降負擔**：診斷 heartbeat 15 秒→30 秒；IndexedDB 診斷鏡像改每 2 分鐘或重大事件才寫入。
- **多分頁 Writer Lease**：heartbeat 5 秒→10 秒、stale 20 秒→35 秒，維持防覆蓋同時減少同步 localStorage 寫入。
- **根目錄整理**：舊 APPLY / TEST_REPORT / CURRENT_RELEASE_SUMMARY / PATCH_INSTALL 等散落紀錄完整封存到 `docs/release_history/ROOT_RELEASE_RECORDS_THROUGH_V0.9.87A.zip`；根目錄由 91 項縮減至精簡正式結構。
- V0.9.87A 拍賣 SQL 已經執行成功的環境 **不用重跑 SQL**；本版不新增資料庫 migration。

---

# V0.9.87A current baseline

## V0.9.87A — 拍賣交易所 V1（累積保留 VIP Q + 掛機穩定 R）

- 基準：V0.9.86Q 完整包 + V0.9.86R 掛機穩定修正。
- 新增 `supabase/V0.9.87A_AUCTION_HOUSE_V1.sql`：server-side escrow / reservation ledger。
- 上架 24H；同一遊戲帳號同時最多 5 件。
- 上架費依商品總價收 1 / 2 / 3 / 5 藍寶石；取消與到期不退。
- 成交稅固定 5% Zeny；紅寶石 V1 不作必要手續費。
- 上架採 pending → 玩家雲端存檔扣物／扣藍寶石 + one-shot receipt → finalize；避免只靠前端 UI 鎖定物品。
- 購買採 reserved → 玩家雲端存檔扣 Zeny + purchase receipt → finalize；reservation timeout 亦必須驗證 receipt 才能自動成交。
- 成交商品寄至買家遊戲信箱；賣家 95% Zeny 也由信箱交付。
- 裝備附件使用 `instance_data` 原樣保存精煉、卡片、附魔與 instanceId；信箱 Runtime 已支援 exact instance restore。
- 取消 / 到期商品由信箱退回；reservation 超時會檢查是否已付款，已付款則自動成交、未付款才解除保留。
- 上架頁顯示最近 7 天成交件數、平均／最低／最高單價。
- tradeRestricted / NoTrade / NoAuction 物品由前端與 SQL restricted table 雙重阻擋。
- 右上原「拍賣行」預告按鈕已正式啟用。
- `V0.9.86Q_VIP_V1_OFFLINE_REWARD.sql` 不需重跑；拍賣場只需新增執行 V0.9.87A SQL。

## Previous baseline: V0.9.86R

## V0.9.86R — VIP Q 保留 + 掛機穩定性 / 異常重啟診斷

- 基準：已實測 VIP 成功的 `roweb(5).zip` / V0.9.86Q。
- **完整保留 VIP V1**：Base EXP +50%、Job EXP +50%、一般掉寶 +50%、VIP 最多 8H 離線收益、GM CENTER VIP 管理與 VIP 聊天身份。
- 完整保留 V0.9.86P 多角色 Entry Hand-off 與 V0.9.86O Legacy 角色相容。
- 選中的 RO Account ID 除 localStorage/sessionStorage 外，再鏡像到 IndexedDB-backed `ROWebAuthStorage`。
- 啟動時遇到 Failed to fetch / NetworkError / timeout / 429 / 5xx 等暫時性雲端錯誤，不再直接送回帳號中心；留在 Loading 自動重連。
- 新增 `js/afk_stability_runtime.js`：每 15 秒記錄極小的本機診斷 heartbeat；並嘗試同步鏡像 IndexedDB，避免 localStorage 容量不足時完全失去 crash 前資料。
- 本版 **不新增 SQL**；已成功執行的 V0.9.86Q VIP SQL 不需重跑。

---

# V0.9.86Q current baseline

## V0.9.86Q — VIP V1 正式福利

- 基準：已驗證四隻角色均可登入的 V0.9.86P。
- VIP 與 GM 權限維持完全分離；沿用 `ro_accounts.is_vip / vip_level / vip_until`。
- 線上福利：Base EXP +50%、Job EXP +50%、一般掉寶總倍率 +50%；Zeny 線上倍率本版不加成。
- 倍率採乘算：例如伺服器 Base EXP 100x，VIP 為 150x。掉寶最終仍封頂 100%。
- VIP 離線掛機採登入一次性結算，不背景跑怪；單一 Player ID 共用最多 8 小時，避免 12 角色各領 8H。
- 離線秒數由 Supabase `now()` + 該帳號最近角色 `updated_at` 驗證，並由 `vip_offline_claimed_at` 防重複領取，不依賴玩家電腦時間。
- 離線 V1 安全模型：每 60 秒 1 次虛擬擊殺，最多 480 次；依最後野外地圖與角色等級附近的普通怪結算 Base/Job EXP、原倍率 Zeny、一般掉落。
- 離線排除 MVP / Boss、卡片、轉蛋、地圖限定特殊掉落；單次一般物品總量上限 500、同一物品最多 99，避免高測試倍率一次灌入過多背包資料。
- 新增 `supabase/V0.9.86Q_VIP_V1_OFFLINE_REWARD.sql`；本版需執行一次。
- 右上遊戲設定顯示 VIP 狀態／期限；登入後若有離線收益會顯示 VIP 收益結算視窗。

---

# V0.9.86O current baseline

## V0.9.86O — Legacy 已復原角色登入相容修正

- 基準：V0.9.86N / `roweb(4).zip`。
- 修正早期固定槽位背包含 `null` 空格時，`normalizePlayerData()` 讀取 `item.id` 造成角色 Loading 中斷。
- 相容舊 `inventory` object / `items` / `slots`、`itemId`、`amount`、`qty`、`quantity` 格式。
- 基本遷移舊 `skills -> learnedSkills`、`quickbar/hotkeys -> quickSlots`。
- `index.html` 本地 JS cache key 全部刷新為 `?v=0.9.86O`，確保原瀏覽器真正載入最新 `player.js` / `skill_engine.js` 等 Runtime。
- 角色資料升級若仍失敗，顯示具體錯誤並安全返回角色選擇，不再只停在 Loading。
- 不需新增 SQL；沿用 `V0.9.86I_LEGACY_BROWSER_CHARACTER_RESCUE.sql`。
- 原始 localStorage / IndexedDB Legacy 存檔與既有 Supabase 角色均不刪除。

---

# V0.9.86N current baseline

## V0.9.86N — 未命名角色歷史快照去重
- Legacy 救援中的「未命名角色」改為每個 SLOT 只保留最新一筆完整快照。
- primary / backup / 舊 localStorage 歷史快照不再把同一隻未命名角色重複列出。
- 已取名角色維持原本逐角色候選，不受此去重影響。
- 選擇規則：先比 savedAt 最新時間；同時間再採較完整／較高進度版本。
- 目的：避免 SLOT 1 十字軍歷史快照塞滿 12 筆候選，讓 SLOT 2/3/4 等已命名角色仍可正常看見。


## V0.9.86M — 舊版未命名角色救援補強
- 累積保留 V0.9.86H / I / J / K / L 的雙儲存、Legacy 深掃、殘影追蹤、同步前快照與完整 Email 顯示。
- Legacy 完整候選不再硬性要求 `player.name`。對「舊版尚未有取名欄位」的角色，必須同時具備實際進度且 `legacyPlayerCompletenessScore >= 4` 才能成為候選，避免 writer/session/UI 資料誤判。
- 未命名候選在救援視窗顯示為 `【未命名角色】`，並顯示完整度；正式復原前必須由玩家輸入 1–12 字角色名稱。
- 輸入名稱會寫入待復原 envelope 的 `player.name` 後才呼叫既有 V0.9.86I RPC；不需要新增 SQL。
- writer lease / pending writer lease / session / persist 控制鍵仍只作 Character ID 追蹤，不可成為角色候選。
- 原始 localStorage / sessionStorage / IndexedDB 資料不刪除，跨 Supabase account UUID 安全阻擋維持。

- Cumulative over V0.9.86H/I/J/K. Preserve dual-store recovery, full Email display, deep Legacy scanning, Shadow Trace, and the authenticated V0.9.86I rescue RPC.
- Adds **Pre-Cloud Selector Snapshot**: immediately after the selected RO account is known and before the first Supabase character fetch, the current selector character index is copied into a small Rescue Vault (`ro_web_precloud_rescue_vault_v1`). The vault stores only slot / character ID / summary / save-key references, not full player saves.
- This specifically protects the `1/12 -> 0/12` class of failure: if a local SLOT/name/Character ID is visible before an empty cloud list replaces the selector, its identity clue survives for later rescue.
- Same-browser account switching safety: a pre-cloud snapshot is not captured when the currently displayed selector belongs to a different cloud UUID; cloud-bound profile hints from another UUID are also ignored.
- `writer_lease_v2`, `persist_requested_v2`, and `session_id_v2` records are now **control-key noise**, never character/shadow candidates. This removes the fake `SLOT 1 | 名稱未知 | ..._writer_lease_v2` entries seen in K.
- Control keys are still useful as **Character ID trace anchors**. L strips the control suffix, keeps only the underlying character ID, and reverse-searches localStorage/sessionStorage/IndexedDB for matching save/profile references. Trace-only IDs are displayed separately and can never be restored directly.
- Shadow extraction is tightened so arbitrary account-storage items with only a `name` no longer appear as character clues.
- No new Supabase SQL is required. Continue using the already-installed `V0.9.86I_LEGACY_BROWSER_CHARACTER_RESCUE.sql`.
- For the current 100011 investigation, SLOT 2/3/4 full candidates must remain intact. Do not restore until SLOT 1/Crusader is identified or the user explicitly decides to proceed without it.

# V0.9.86K current baseline

- Cumulative over V0.9.86H/I/J. Keep strict dual-store recovery, full Email display, generic deep Legacy scanning, and the existing authenticated I rescue RPC.
- Adds a **Shadow Trace** layer for characters that survive only as old slot/profile summaries or incomplete records. These clues are read-only and are NEVER directly restored.
- When a full candidate is missing, the rescue dialog now shows `SLOT / name / job / Base / Job / Character ID / completeness / trace sources` for incomplete legacy clues. This is intended to identify cases like an old SLOT 1 that flashed in the selector but no longer has a full player save candidate.
- Reverse trace searches localStorage, sessionStorage and all already-scanned IndexedDB object-store rows for the missing Character ID/name, so later recovery work can target the exact legacy key/store instead of broad guessing.
- Full recoverable candidates remain unchanged and are deduplicated separately from shadow clues. A shadow that matches an already-found full candidate or cloud character is hidden.
- Shadow clues do not modify/delete browser storage, do not create cloud characters, and do not weaken cross-account UUID protections.
- No new Supabase SQL is required beyond `V0.9.86I_LEGACY_BROWSER_CHARACTER_RESCUE.sql`.
- For the current 100011 investigation: J already finds SLOT 2/3/4. K's purpose is to expose the missing SLOT 1/Crusader index/Character ID and its residual storage locations before any restore is attempted.

# V0.9.86J current baseline

- V0.9.86J keeps all V0.9.86H/I protections and expands Legacy Browser Rescue into a generic deep scanner for future players.
- When a cloud account has 0 characters, rescue now scans localStorage **and sessionStorage**, plus all RO/ROWEB/player/save/offline IndexedDB databases.
- It recursively inspects nested migration/profile/backup JSON up to bounded depth, so old full player saves buried inside legacy account objects or arrays can be discovered even when `account.characters` no longer references them.
- Nested slot-summary objects are not promoted as recoverable characters: nested raw players need full-save signals (inventory/equipment/stats/etc.), while normal signed save envelopes keep the existing validation path.
- Existing V0.9.86I candidates remain supported; recovery is still explicit-confirmation only, preserves originals, and blocks saves explicitly bound to another cloud UUID.
- No new Supabase SQL is required beyond `V0.9.86I_LEGACY_BROWSER_CHARACTER_RESCUE.sql`.
- Full login Email display from V0.9.86H/I remains included.

# V0.9.86I previous baseline

- Cumulative over V0.9.86H: keep strict deleted-character recovery across BOTH localStorage + IndexedDB and keep full Email display in the private Account Center.
- Fixes the misleading legacy `1/12 -> 0/12` flash: once the browser account profile is already cloud-bound, the old single-character legacy key is no longer silently re-migrated on every reload. Legacy data is handled only by the rescue scanner.
- If the selected cloud account entered with **0 cloud characters**, V0.9.86I deep-scans all JSON localStorage values plus RO/ROWEB/player/save/offline IndexedDB databases and all object stores for established legacy player saves. Current account-profile / migration-backup character IDs are used only as SLOT hints.
- Deep rescue is manual, never automatic. The dialog lists every deduplicated candidate with name / job / Base / Job / save time / source and requires the player to explicitly confirm the current Player ID before restoring selected characters.
- Cross-cloud safety remains strict: a save explicitly carrying a different Supabase UUID `accountId` is never offered/restored. Old local `acct_*`, non-UUID or identity-less saves may be restored only through the explicit-confirmation flow.
- `supabase/V0.9.86I_LEGACY_BROWSER_CHARACTER_RESCUE.sql` installs the authenticated rescue RPC. It verifies Auth UID + target Player ID + slot ownership, rejects default Lv1 saves, creates a fresh character UUID, rebinds save/player identity to the selected cloud account, and never deletes the original browser copy.
- Strict V0.9.85N recovery still runs first for exact accountId + original UUID backups; I deep rescue is the fallback for older local formats.
- Account Center continues to show the full signed-in Email; OTP/resend status messages may remain masked.
- VIP offline farming / EXP/drop bonuses remain intentionally deferred until this recovery issue is closed.

# V0.9.86H baseline carried forward

- Cloud deleted-character recovery scans BOTH localStorage and IndexedDB `ro_web_offline_save_v1/player_saves` before the cloud character list overwrites the local selector state.
- Strict recovery is identity-locked: a candidate must explicitly carry the currently selected Supabase `account_id` and its original UUID `characterId`, must not already exist in `ro_characters`, and must be an established non-default character.
- IndexedDB strict scanning accepts current `character:<uuid>:primary|backup` rows and older row IDs only when the envelope itself has exact account/character identity. The newest saveVersion/savedAt wins across localStorage + IndexedDB.

# V0.9.86G current baseline

- Adds the first low-traffic social chat layer on top of the user-tested V0.9.85Q/P cloud baseline.
- Bottom chat panel defaults to `玩家頻道`; `系統信息` preserves the original combat/buff/drop/save log.
- Player channel supports world chat and account-level whispers. Player names are clickable and open a compact profile snapshot with Player ID / Base level / job / whisper / block controls.
- Chat is intentionally delayed and low bandwidth: no Supabase Realtime/WebSocket. One incremental `message_id` poll carries world + whispers together; foreground polling adapts between 10/20/30 seconds and background tabs use 60 seconds.
- World messages are visible for 48 hours; whispers for 7 days. Old rows are cleaned opportunistically when someone sends a message, so no scheduled cleanup job is required.
- `supabase/V0.9.86A_LOW_TRAFFIC_CHAT.sql` must be executed once in Supabase SQL Editor. Chat tables are not directly writable/readable by browser roles; player access goes through SECURITY DEFINER RPCs that verify the currently selected RO account/character.
- `announcement / party / guild` message types are reserved in the schema for future social systems; V0.9.86C player sending is limited to `world` and `whisper`.
- Never add presence heartbeat polling for online counts by default; preserving low request/egress usage is a long-term chat requirement.

# V0.9.85J PUBLIC TEST BASELINE

- Public-test baseline confirmed from the user-tested V0.9.85J package on 2026-08-10.
- Core cloud flow verified in live testing: Email login, RO account selection, 12 character slots, cloud save/load, same-browser account switching isolation, mailbox, GM CENTER delivery, one-time attachment claiming, and RO-style loading screen.
- V0.9.85G fixed legacy local-character migration being reused across different RO accounts.
- V0.9.85I finalized immediate mailbox claim UI, unread red-dot notification, account/login background, and 0-100% loading presentation.
- V0.9.85J keeps the loading bar moving while waiting for Supabase account/session readiness.
- No additional Supabase SQL migration is required after the already-applied V0.9.85C mailbox operations migration.
- Browser code uses the Supabase Publishable Key only. Never add a service_role key, sb_secret key, SMTP password, or other server secret to this public repository.

# V0.9.85F current baseline

- Critical cloud isolation fix for multiple RO accounts / characters used in the same browser. `player.js` save bindings are rebound after Supabase selects the current `account_id`, before any character data is loaded.
- localStorage / IndexedDB candidates with explicit `accountId` or `characterId` that do not match the currently selected cloud character are rejected.
- Cloud save writes additionally block cross-account / cross-character context mismatches before updating `ro_characters`.
- Switching RO account, signing out, or pressing `進入遊戲` from Account Center always forces the 12-slot character selector first; never auto-enter the previously used character.
- The chat/system log toolbar no longer contains `存檔 / 角色 / 清存檔`. Manual save moved into the persistent gear account menu. Character deletion remains only in the 12-slot selector.
- Gear-menu manual save and account leave flow also flush account shared storage, keeping warehouse sync attached to the current `account_id`.
- No Supabase SQL migration is required for V0.9.85F.

# V0.9.85C current baseline

- Builds on the user-tested V0.9.85B mailbox baseline.
- Right HUD player menu is fixed to 4 columns x 3 rows: 人物背包 / 裝備欄目 / 地圖傳送 / 城鎮傳送; 素質配點 / 技能配點 / 拍賣行 / 活動; 信箱 / 統計 / 召喚物 / 掛機設定.
- 拍賣行 and 活動 are placeholder buttons only; do not attach gameplay systems until explicitly requested.
- The independent large 掛機 start/stop toggle remains below the 12-button menu; 掛機設定 opens the existing auto-combat settings panel.
- GM is no longer a player quick-menu slot. GM CENTER is exposed only inside the mailbox toolbar after `ro_gm_can_access(current_account_id)` succeeds.
- Mail claim UI immediately becomes disabled `已領取` after finalization; claimed mail is visibly marked in the list.
- Mail toolbar adds 一鍵領取 and 刪除已讀. Delete-read must preserve every read mail that still has an unclaimed item/Zeny/Blue Gem/Red Gem reward.
- `supabase/V0.9.85C_MAIL_UI_OPERATIONS.sql` adds `ro_gm_can_access`, `ro_mail_delete_read`, and fixes literal `\n` welcome-mail text into real line breaks. Run it as a new SQL Editor query after V0.9.85B.
- Keep V0.9.84C Auth / 5 accounts / Player ID / 12 character slots / cloud-save behavior unchanged.

# V0.9.85B current baseline

- Adds account-level in-game mailbox and GM CENTER on top of V0.9.84C.
- Supabase migration: `supabase/V0.9.85B_MAIL_GM_CENTER.sql`. It is cumulative and can upgrade V0.9.85A or install the mailbox for the first time.
- Player mailbox is account-scoped; attachment rewards are delivered to the currently active character.
- Attachment claim uses a local `mailClaimReceipts` idempotency journal and finalizes server claim only after cloud save verification.
- Mail attachments support up to 5 item types plus Zeny, Blue Gem and Red Gem currencies.
- Existing and future active RO accounts receive one system welcome mail, `信箱系統正式開通！`, containing Red Gem x100. `system_key=mail_open_welcome_v1` prevents duplicate welcome rewards.
- GM CENTER is authorized against the currently selected RO `account_id`, not merely the Auth Email. A normal Player account must never inherit GM rights from another account under the same Email.
- Normal Player accounts must not render the GM quick button. Backend RPC still independently enforces `account_role='gm'` and active status.
- GM targets are managed by Player ID (for example 100010); do not expose or require Supabase Auth UID for routine GM operations.
- V0.9.84C Auth / 5 accounts / Player ID / 12 character slots / cloud-save behavior remains authoritative and must not regress.

# V0.9.84C current baseline

- Supabase cloud account flow is active: Email OTP registration, password recovery, up to 5 RO accounts per Auth Email.
- Player IDs 100001~100009 are reserved for GM/test; normal registration sequence starts at 100010.
- Each RO account has 12 character slots. Character identity is permanent `character_id`; slot movement only changes `slot_index` and supports move/swap.
- Cloud character saves live in `public.ro_characters.save_data`; account shared storage lives in `public.ro_accounts.shared_save.account_storage`.
- LocalStorage + IndexedDB remain safety copies. Cloud sync errors must never delete local progress. Remote-newer saves are protected from being overwritten.
- Character selector cloud badge is live: sync / synced / pending / conflict / error. Manual save verifies the local durable copy and reports cloud verification separately.
- `cloud_register_test.html` is retired and redirects to the player-facing account page.
- Account Center now supports logged-in password changes using current password + new password; no extra OTP is requested for this action.
- New-device pure game-account-name login still requires a future server-side account resolver. Do not expose player Email through a public RPC just to implement username login.

# V0.9.83C2 current baseline

- WM_SEVERE_RAINSTORM / Skill 2418 must accept Bow, Musical/Instrument, and Whip. Do not narrow this list.
- `getRuntimeRequiredWeaponTypes()` contains an authoritative 2418 compatibility lock; weapon normalization also accepts rAthena-style `W_MUSICAL` / `W_WHIP` aliases and equipment-instance fallback.
- RO_WEB keeps Severe Rainstorm arrow metadata but does not consume arrows.

- Historical root reports are compacted into `RO_WEB_HISTORY_RECORDS_THROUGH_V0.9.83C.zip`; use `tools/restore_history_records.py` only when a legacy audit requires the original files.
- Current concise release metadata: `CURRENT_RELEASE_SUMMARY_V0.9.83C2.json`.

- Default and maximum account slot limit: 12. Cloud `slot_limit` is authoritative and the selector renders SLOT 1~12.
- Account profile key: `ro_web_account_profile_v1`; per-character saves use `ro_web_character_save_v1_<characterId>` and matching backup / IndexedDB IDs.
- Existing single-character localStorage saves migrate to slot 1 while retaining the legacy rollback copy. IndexedDB-only migration intentionally reloads before gameplay so `player.js` binds the final character save keys.
- Account-shared storage remains outside character deletion. Character inventory, equipment, skills, map, quick slots and newcomer progression remain per-character.
- Cloud contract: `registerCloudAdapter()` bridges account save plus the player remote save adapter (`loadCandidates/load`, `saveEnvelope/save`, optional `deleteCharacter`).
- Character selector background: `images/ui/character_select_background.webp` (1920×1080). Current top-left Idle portrait path is captured into the character summary; `characterAtlas` and Job Key provide fallback resolution.
- Do not remove V0.9.83A newcomer equipment disposal/storage rules or the V0.9.82IL4 Taiwan gacha runtime.

# V0.9.83A current baseline

新人銜接裝備支援處分規則修正版，以 V0.9.83 為基準。62 件支援裝備可販售、可分解，但 `noStorage=true`，禁止存入帳號共用倉庫；三階段箱子本身仍禁止販售、分解與存倉。箱子固定採 100→130→160 接力；NPC 只補發第一階段箱，每個人物限一次。

# 0.9.82IL4 current baseline
- Taiwan gacha item 9512 is quick-slot eligible and batch-open capable.
- All featured equipment/cards are runtime audited.
- Despair God Morocc Card 27321: numeric effects enabled; First Aid transform is system-log-only with no appearance swap.
- Mad Bunny +12 no-cast-cancel remains a forward-compatible flag until global cast interruption exists.
- Queen Scaraba Card RC2_SCARABA damage is prewired and waits only for Scaraba-tagged monsters.
- Root TEST_REPORT/UPDATE_FILES history is consolidated into one file.

# 0.9.82IL3 current baseline
- Taiwan gacha MVP reward is 27321 DespairGodMorocc_Card at 0.01%.
- 300084 remains Dry_Rafflesia_H_Card and must never be repurposed as Nightmare King.
- 27321 numerical effects are enabled; appearance transformation is intentionally disabled.
- 9512 remains quick-slot eligible.

# 0.9.82IL2 current baseline
- Taiwan gacha exact item 420236 Moroc_Slave_TW at 0.1%.
- 9512 Taiwan gacha is quick-slot eligible and manual-use protected.
- Do not restore mistaken item 400379.

# RO_WEB 0.9.82IL1
- 0.9.82IL1R：已移除誤加入的 400379；420236 尚未在本修訂加入。

最新正式基準：光輝天翼台灣裝備轉蛋完整修正版。

- 基準來源：0.9.82IL。
- 葛坡尼亞 MVP 試煉場每隻 MVP 仍獨立 1% 掉落 9512；原 14848 MVP 幸運轉蛋完整保留且可同時掉落。
- 內部單一 10,000 基點母池：兩張使徒卡各 1%、七件裝備各 0.1%、四張 MVP 卡各 0.01%、鐵匠的祝福 5%、甲蟲召喚書 10%、十種精煉材料各 8.226%。
- 天地樹＋潘利爾支援妖術師／元素支配者與咒術士／禁咒魔導士。
- 9512 批量開啟介面仍提供快捷欄配置，並通過實際 assign/useItem 路徑測試。
- 關鍵 Runtime：`js/taiwan_gacha_runtime.js`、`js/card_runtime.js`、`js/consumable_runtime.js`、`js/item_instance_ui.js`、`js/battle.js`。
- 驗證：`tools/test_taiwan_gacha_0.9.82IL1.js`，158 項全部通過。
- 延後項目：瘋狂兔寶寶 +12 的受傷斷詠免疫，待全域斷詠系統完成後啟用；資料標記已保留。
- 後續版本一律以 0.9.82IL1 為正式基準。

# RO_WEB 0.9.82IB

最新正式基準：V92 主動技能特效 Runtime 接入。

- 以 V91.6 完整 Ready Library 接入 55 招可執行主動技能、454 個 Effect JSON、2395 張 PNG。
- RO_WEB Runtime handler 是唯一權威：`passive`、`pending`、空 handler 或 `executionEnabled!=true` 一律不掛載特效。
- 216 招目前被動技能已完整記錄於 the archived `SKILL_EFFECT_PASSIVE_EXCLUSION_AUDIT_0.9.82IB.json`；本次 55 招候選與被動清單交集為 0。
- 事件接入：SKILL_BEGIN、CAST_BEGIN、CAST_COMPLETE、PROJECTILE_LAUNCH、GROUND_SPAWN、DAMAGE_COMMIT、HIT_CONFIRM、LOOP_START、SKILL_END。
- BACK／FRONT 雙 Canvas 讓 Bottom／Ground／Shadow 位於人物後方，Hit／Projectile 位於人物前方；HUD 不受影響。
- 桌機優先 Full，手機／低核心裝置優先 Min，Full／Min 雙向 fallback。
- 持續特效在 SKILL_END、死亡、換地圖、切換角色、頁面離開時清理。
- 不回寫 RO_WEB 已校正的中文技能名稱與改造說明。
- IA 的 Renewal 詠唱、技能後延遲、獨立冷卻、行走延遲與 140ms 安全上限完整保留。
- 後續版本一律以 0.9.82IB 為正式基準。


最新正式基準：Renewal 詠唱／延遲完整校正。

- 變動詠唱唯一公式：`remaining = 1 - sqrt((DEX×2+INT)/530)`，最低為 0；使用最終 DEX／INT。
- 固定詠唱不受 DEX／INT 影響；通用百分比取最強值，同技能專屬百分比先合併成候選值，再與通用／狀態候選取最高；固定毫秒依腳本加減。
- 技能後延遲是共通延遲；獨立冷卻只鎖同一技能；兩者不可混用。
- 八招連技套用 rAthena `max(0,(DB delay 或 1000)-4×AGI-2×DEX)`。
- 所有攻擊技能仍保留 140ms 最小實際施放間隔，但不會縮短較長的原始詠唱、後延遲、冷卻或 ASPD 動作鎖。
- 技能詳細視窗顯示目前裝備／卡片／附魔／Buff 後的實際時序。
- HZ `ModifierKeyRuntime`、HY `ItemBatchOpenRuntime` 與 HX 耐久存檔完整保留。
- 後續版本一律以 0.9.82IA 為基準。


## V0.9.86C additions
- Supabase Auth sessions use IndexedDB via `js/auth_storage_runtime.js`, with one-time migration from legacy `sb-*-auth-token` localStorage keys. This prevents large local character backups from blocking login/OTP session persistence.
- Selected RO account falls back to sessionStorage when localStorage is full. Existing role saves are not automatically deleted.
- Chat player names are plain clickable text (no button chrome), with ellipsis for long names. Full name remains available via title/profile popup.

## V0.9.86C additions
- C is cumulative over V0.9.86B: keep IndexedDB Supabase Auth Session storage, quota-safe login fallbacks, and borderless clickable/truncated chat names.
- Chat messages now include a server-verified `sender_role` snapshot; current cosmetic roles are `player` and `gm`.
- GM chat identity uses a small `GM` gold badge plus gold animated name shine. The effect is CSS-only and adds no polling/request traffic.
- Never infer GM from Player ID alone; authoritative GM identity remains `ro_accounts.account_role = 'gm'`.


## V0.9.86D additions
- Cumulative on top of V0.9.86C: GM gold chat identity/effects and V0.9.86B IndexedDB auth storage remain enabled.
- Signup resend is now tab-bound: each browser tab retains its own pending signup email/account and no longer relies only on the shared pending key.
- Resend UI locks while the request is in flight, shows the masked destination email and completion time, and keeps a per-tab diagnostic log in `sessionStorage` (`roweb_cloud_resend_diag_v1`).
- `window.ROWebAuthDiagnostics.getResendLog()` can be used during testing to confirm which email target each resend request used.


## V0.9.86E additions
- Cumulative on V0.9.86C/D: GM gold chat effect, low-traffic chat, IndexedDB auth storage and tab-bound resend diagnostics remain enabled.
- Prevents repeated `signUp()` calls for the same locally pending Email. Once an Email is in the confirmation stage, the registration button returns to the OTP step instead of issuing another signup request.
- Adds `已註冊但尚未驗證？重新寄送驗證碼`, which calls Supabase `auth.resend({type:"signup"})` directly. This is the recovery path for an existing unconfirmed Email, including another browser/device.
- Successful resend clears the OTP input and explicitly tells the player to use only the newest email code.
- This release needs no new SQL.


## V0.9.86F additions
- Cumulative on V0.9.86E. Keeps resend/signup protection, IndexedDB Auth Session storage, low-traffic chat, whispers and GM cosmetics.
- Repairs/reinstalls the server-verified `sender_role` chat snapshot via `supabase/V0.9.86F_GM_CHAT_IDENTITY_REPAIR.sql`.
- GM chat identity is intentionally role-based (`ro_accounts.account_role = gm`), not inferred from reserved Player IDs.
- Stronger visual-only GM badge and gold flowing name effect; no extra polling or network traffic.

## V0.9.86G additions
- Cumulative on V0.9.86F/E/B: keep IndexedDB Auth Session storage, duplicate-signup/resend protection, low-traffic chat, whispers, block list and GM server-verified identity.
- GM chat names are now solid readable gold. The badge keeps its glow/sweep; the name itself is never transparent.
- VIP membership is independent from `account_role`: `ro_accounts.is_vip / vip_level / vip_started_at / vip_until`. V0.9.86G enables cosmetic identity only; there are no stat/EXP/drop bonuses.
- Chat `ro_chat_send` snapshots effective VIP identity into the same message row and `ro_chat_poll` returns it in the existing low-traffic poll. No additional chat request is introduced.
- VIP chat cosmetics: `◆ VIP` purple/rose badge + readable magenta glow name. GM+VIP can coexist; GM gold remains the authority identity.
- GM CENTER gains temporary manual VIP management (permanent / 7 / 30 / 90 days / custom expiry). Future acquisition can later be wired to shop/event/month-card logic without rewriting chat.
- Run `supabase/V0.9.86G_VIP_MEMBERSHIP_CHAT_IDENTITY.sql` once in Supabase SQL Editor before testing VIP. It is cumulative with F chat identity repair.
