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
