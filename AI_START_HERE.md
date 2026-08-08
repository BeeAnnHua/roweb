# V0.9.83D current baseline

- WM_SEVERE_RAINSTORM / Skill 2418 must accept Bow, Musical/Instrument, and Whip. Do not narrow this list.
- `getRuntimeRequiredWeaponTypes()` contains an authoritative 2418 compatibility lock; weapon normalization also accepts rAthena-style `W_MUSICAL` / `W_WHIP` aliases and equipment-instance fallback.
- RO_WEB keeps Severe Rainstorm arrow metadata but does not consume arrows.

- Historical root reports are compacted into `RO_WEB_HISTORY_RECORDS_THROUGH_V0.9.83C.zip`; use `tools/restore_history_records.py` only when a legacy audit requires the original files.
- Current concise release metadata: `CURRENT_RELEASE_SUMMARY_V0.9.83D.json`.

- Default account slot limit: 4; configurable up to 12 through `CharacterSlotsRuntime.setSlotLimit()` or a future cloud account profile.
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
