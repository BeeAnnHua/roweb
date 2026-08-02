# RO_WEB 0.9.82IL

最新正式基準：光輝天翼台灣裝備轉蛋。

- 基準來源：0.9.82IK FULL。
- 葛坡尼亞 MVP 試煉場每隻 MVP 獨立 1% 掉落 9512 光輝天翼轉蛋；原 14848 MVP 幸運轉蛋完整保留。
- 轉蛋內部單一 10,000 基點母池，總和固定 100%。
- 六件台灣裝備與相關卡片、支援裝備、魔神精髓、封印女王甲蟲卡、雙角甲蟲卷軸均已接入 item index、部位資料、CardRuntime／ConsumableRuntime 與圖片。
- 關鍵 Runtime：`js/taiwan_gacha_runtime.js`、`js/card_runtime.js`、`js/consumable_runtime.js`、`js/battle.js`。
- 驗證：`tools/test_taiwan_gacha_0.9.82IL.js`，104 項全部通過。
- 後續版本一律以 0.9.82IL 為正式基準。

# RO_WEB 0.9.82IB

最新正式基準：V92 主動技能特效 Runtime 接入。

- 以 V91.6 完整 Ready Library 接入 55 招可執行主動技能、454 個 Effect JSON、2395 張 PNG。
- RO_WEB Runtime handler 是唯一權威：`passive`、`pending`、空 handler 或 `executionEnabled!=true` 一律不掛載特效。
- 216 招目前被動技能已完整記錄於 `SKILL_EFFECT_PASSIVE_EXCLUSION_AUDIT_0.9.82IB.json`；本次 55 招候選與被動清單交集為 0。
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
