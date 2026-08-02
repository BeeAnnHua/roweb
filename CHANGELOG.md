# RO_WEB 0.9.82IL

## 0.9.82IL 重點

- 新增「光輝天翼轉蛋」（9512）：葛坡尼亞 MVP 試煉場每隻 MVP 獨立 1% 掉落，與原 MVP 幸運轉蛋各自判定並套用全域掉落總閥。
- 獎池為單一 10,000 基點：許乃任／阿哈特各 1%；六件台灣裝備各 0.1%；三張 MVP 卡各 0.01%；鐵匠的祝福 5%；十種精煉材料平分剩餘 92.37%。
- 新增六件台灣裝備、相關支援裝備／魔神精髓／封印女王甲蟲卡／雙角甲蟲變身卷軸的圖片、部位、說明與 Runtime 效果。
- 光輝天翼轉蛋支援玩家指定數量批量開啟、存檔前清空 pending、掛機異常扣除保護與稀有橫幅。
- 舊 MVP 幸運轉蛋與原有掉落完全保留。

後續版本以 0.9.82IL 為基準。

---

# RO_WEB 0.9.82IK

## 0.9.82IK 重點

- 怪物死亡瞬間鎖定權威 Mob ID；名稱、EXP、掉落、卡片、MVP 獎勵與擊敗訊息全部使用同一份死亡快照。
- 卡片掉落新增來源 Mob ID 雙重驗證：合併掉落來源與卡片資料庫任一不符時，阻止錯誤卡片並寫入診斷。
- 卡片取得訊息加入來源怪物名稱，避免高速連殺時誤認卡片屬於下一隻死亡怪物。
- ID 1719 正式顯示為「迪塔勒泰晤勒斯」，ID 1779 維持「冰晶龍」，避免共用「水晶龍」名稱造成混淆。
- 保留 0.9.82IJ 的咒術士元素球／屬性漩渦、暴力腔棘魚魔法修正，以及 0.9.82II 已驗證的精確怪物攻擊特效錨點。

後續版本以 0.9.82IK 為基準。

# RO_WEB 0.9.82IJ

本版以 0.9.82II 為基準，恢復咒術士正式元素球玩法與屬性漩渦，並修正暴力腔棘魚因共用模板殘留魔法免疫而使魔法只造成 1 點的問題。

## 0.9.82IJ 重點

- 召喚火焰球／雷電球（風）／水球／石塊恢復為主動元素球技能；Lv1 增加 1 顆，Lv2 清除現有球並建立 5 顆同屬性球，最多 5 顆。
- 屬性漩渦至少需要 4 顆；有 5 顆時先丟棄最舊一顆，再由最新至最舊消耗 4 顆，四段各自使用球的火／風／水／地屬性，間隔 200ms。
- 釋放 Lv2 恢復消耗全部元素球的攻擊分支；Lv1 魔法書分支尚未完成時會明確阻擋，不會假裝成功或消耗資源。
- 移除舊版「不需要元素球、固定四段聖屬性」的 RO_WEB 改造。
- 2190 暴力腔棘魚強制使用 IgnoreMelee／IgnoreRanged，不再被 2189 變異腔棘魚的 IgnoreMagic 或 legacy magicImmune 欄位污染。
- 0.9.82II 已成功的攻擊特效怪物錨點、掛機恢復與連鎖電擊修正完整保留。

後續版本以 0.9.82IJ 為基準。

# RO_WEB 0.9.82IH — Acidified Authoritative Monster Foot Anchor Fix

- 修正 0.9.82IG 實機仍可能把強酸禁地綁在玩家腳底的問題。
- 根因：事件 payload／target.position 在自動戰鬥流程中可能仍是施術者座標或過期座標，但舊 Runtime 會將它標成有效 GROUND_WORLD_SNAPSHOT，HIT_CONFIRM 也只修補缺失快照，不覆寫錯誤快照。
- 強酸禁地 5340／5341／5342 改以目標怪物 DOM 腳底為最高優先權威座標；其次才使用世界實體 position。
- HIT_CONFIRM 強制重定位最近 3 秒內所有強酸禁地 CAST／BOTTOM／START／MAIN／HIT 實例。
- 一般 BUFF、TARGET、PROJECTILE 規則不變。

# RO_WEB 0.9.82IG — Acidified All-Phase Target Ground Anchor Fix

- 依實機截圖確認：怪物腳下的主要地面圓環已正確，但 CAST／CAST_BOTTOM 黑色星芒仍因 Manifest 標記為 CASTER 而跟隨玩家。
- 將 5340 強酸禁地（水）、5341 強酸禁地（地）、5342 強酸禁地（風）的全部 29 個非清理事件改為目標地面世界座標快照。
- Runtime 新增強酸禁地專用優先規則，即使舊資料仍寫 CASTER_BODY／CASTER_FOOT，也不得回到玩家座標。
- 缺少目標座標時繼續等待權威 HIT_CONFIRM，不使用玩家或畫面中心 fallback。
- 一般 BUFF／架式／光環仍跟隨玩家；其他 TARGET／PROJECTILE 規則不變。

# RO_WEB 0.9.82IF — V92 Target Coordinate Event Payload Fix

- 修正強酸禁地（水／地／風）地面特效仍落在玩家附近固定偏移的問題。
- 技能開始、正式結算與命中事件現在會攜帶目標怪物 ID 與世界座標快照。
- 地面事件在載入 Effect JSON 前即鎖定目標座標，不再因非同步載入或 currentMonster 變動而掉回玩家座標。
- 正式世界怪物會以 `_instanceId` 回查即時實體，支援 `position`、`worldX/worldY`、`_element` 與傷害座標快取。
- 地面特效缺少目標座標時不再 fallback 到玩家；會暫存等待 HIT_CONFIRM，收到真實目標後補播。
- 強酸禁地的 GROUND_SPAWN／DAMAGE_COMMIT／HIT_CONFIRM 共用同一個目標世界座標基準。
- BUFF／架式／光環仍跟隨玩家；一般 TARGET 特效仍跟隨怪物；投射物規則不變。

## 0.9.82IE — V92 地面特效世界座標快照修正

- 修正強酸禁地（水／地／風）特效以玩家座標加固定偏移渲染，玩家行走時特效會一起移動。
- `GROUND_CELL`／`GROUND_SPAWN` 改在事件觸發瞬間保存目標怪物腳下世界座標；之後只依 Camera 轉換畫面位置，不再重新跟隨玩家或怪物。
- 強酸禁地的 START／BOTTOM／MAIN／HIT 全部使用同類地面快照政策，避免部分圖層仍黏在玩家或怪物身上。
- BUFF、架式與光環維持玩家即時座標；一般目標命中特效維持目標即時座標；投射物維持玩家到目標的即時端點。
- 0.9.82ID 既有掛機、暴力腔棘魚／波伊塔塔、精煉警告、固定飛行與肯貝特修正完整保留。

## 0.9.82ID — 素質欄掛機恢復、MVP 魔法屬性與高精煉警告修正

- 修正自動掛機中開啟素質欄後，完整 DOM 重建反覆佔用主執行緒，造成角色持續轉向／偵測卻不再攻擊；掛機中改為開窗快照，並新增事件排程 watchdog 自動恢復逾期 timer。
- 移除 0.9.82IC 對「煉金術士技能選單被清空」的錯誤推測性修改，技能設定流程恢復原本規則。
- 掛機中回城只執行停止掛機，系統訊息統一為「回到村莊，停止自動掛機。」；未掛機不顯示，不再額外禁止主動怪正常反擊。
- MVP 試煉場原本誤放 ID 2189 變異腔棘魚（IgnoreMagic），改為官方 ID 2190 暴力腔棘魚（IgnoreMelee／IgnoreRanged；魔法有效），共用官方 `coelacanth_h` 動畫圖集。
- 波伊塔塔維持官方火屬性 3、MDEF 66，沒有 IgnoreMagic；火魔法對火 3 為 0 倍，水等相剋魔法正常。正式接上 rAthena `DamageTaken: 10` 最終承傷率，非屬性免疫。
- 精煉 +14 → +15 等「鐵匠的祝福不可用」階段，只要失敗會損壞或退階，也會顯示高精煉風險確認；+7 等可使用祝福階段仍保留原警告。
- 固定秒數蒼蠅翅膀、Boss／MVP 遇到即飛、死亡視野、肯貝特與 V92 55 招特效維持不變。

## 0.9.82IC — 自動掛機穩定、固定飛行、Boss 即飛與死亡視野修正

- 修正煉金術士／其他職業已保存的自動攻擊技能被背景 UI 空選單清除，戰鬥 tick 不再反覆讀取整套設定 DOM。
- 開啟素質欄時降低戰鬥中完整重繪頻率，並在首次開窗後喚醒掛機排程。
- 新增固定每 N 秒使用蒼蠅翅膀；到秒時即使追怪、攻擊或詠唱也直接瞬移。
- Boss／MVP 迴避改為全場威脅掃描；正在打普通怪時，Boss／MVP 追來或攻擊也會立即飛走。
- 死亡背景取消模糊並降低遮罩，死亡視窗縮小移至底部，保留角色倒地畫面。
- 掛機中回城會顯示「回到村莊~~ 已停止自動掛機。」；未掛機不顯示。回城後重新出城不再自動反擊數隻怪物。
- 修正火／水／地／風肯貝特與暗水已套用屬性後，又被通用消耗品 Runtime 以 `itemskill` 未支援攔截，造成道具不扣除、看似無法使用；現在由專用屬性附加流程完成後直接進入統一扣除與存檔。

## 0.9.82IB — V92 主動技能特效 Runtime 與被動技能輸出守門

- 接入 V91.6 Ready Library：55 招主動技能、454 個 Effect JSON、2395 張 PNG。
- 新增 `js/skill_effect_runtime_v92.js`，依 SKILL_BEGIN／CAST_BEGIN／CAST_COMPLETE／PROJECTILE_LAUNCH／GROUND_SPAWN／DAMAGE_COMMIT／HIT_CONFIRM／LOOP_START／SKILL_END 播放。
- `skill_engine.js` 在詠唱開始、正式結算及傷害命中處送出權威 Runtime 事件。
- 新增 BACK／FRONT 雙 Canvas、人物／目標身體與腳底錨點、投射物路徑及 Gravity STR 基本／MORPH 動畫取樣。
- 桌機優先 Full；手機、觸控或低核心裝置優先 Min，Full／Min 可互相 fallback。
- 新增被動技能輸出守門：handler=passive／pending、空 handler 或 executionEnabled!=true 一律排除。
- 完整記錄目前 216 招被動技能；本次 55 招候選與被動清單交集為 0。
- Runtime 每次 Begin／Commit／Hit 再次檢查技能狀態，避免未來資料改為被動後仍播放。
- 持續特效支援 SKILL_END、死亡、換圖、切角、pagehide／beforeunload 清理。
- 保留 `allowNameWriteback=false` 與 `allowDescriptionWriteback=false`。

## 0.9.82IA — Renewal 詠唱／後延遲／獨立冷卻完整校正

- 確認並固定使用 Renewal `DEX×2+INT=530` 變動詠唱門檻；採最終角色素質。
- 修正技能專屬與通用固定詠唱百分比錯誤直接相加；通用來源取最強，同技能專屬來源依 rAthena 先合併為一個候選，再與通用／狀態候選取最高。
- 修正技能專屬 `bVariableCastrate` 被當成全域變詠減免。
- 新增 `bSkillDelay` → 技能專屬後延遲毫秒修正。
- 補上 MO_TRIPLEATTACK、MO_CHAINCOMBO、MO_COMBOFINISH、CH_TIGERFIST、CH_CHAINCRUSH、SR_DRAGONCOMBO、SR_FALLENEMPIRE、SJ_PROMINENCEKICK 的 AGI／DEX 特殊後延遲。
- 技能詳細視窗新增實際變詠、固詠、總詠唱、技能後延遲、獨立冷卻、行走延遲及高速安全間隔。
- Node 稽核可在無 DOM 環境載入 battle.js，避免舊測試入口失效。

## 0.9.82HZ — 種族／體型／屬性／階級鍵值正規化

- 新增 `ModifierKeyRuntime`，所有分類式戰鬥修正改用相同 canonical key 與 alias resolver。
- 修正 Renewal 表 `Demihuman` 與卡片 Runtime `DemiHuman` 大小寫不同，導致海葵卡片等人形增傷失效。
- `Demihuman`、`DemiHuman`、`Human`、`RC_DemiHuman`、人形／人型統一解析為 `DemiHuman`。
- 修正物理／魔法種族增傷、種族耐性、種族暴擊、DEF／MDEF／RES／MRES 穿透、種族 EXP、擊殺 SP、Coma 與條件式額外掉落。
- `All` 類別與特定類別改為正確累加，UI 進階面板與實際傷害使用同一查詢邏輯。
- 怪物資料中的 `Human`／`Demihuman` 全部正規化為 `DemiHuman`，重建 `data_bundle.js`。

## 0.9.82HY — 全域指定數量批量開啟

- 新增 `js/item_batch_open_runtime.js`，箱子、轉蛋、未來卡冊共用同一個數量輸入與 Adapter 架構。
- 物品介紹視窗新增「指定開啟數量」，預設 100、支援 Enter；超過持有量時自動限制為現有數量。
- MVP 幸運轉蛋與 ItemBox 改用單次批量排入，不再依賴快速連點或建立大量點擊事件。
- 每批最多處理 32 次並定期讓出瀏覽器主執行緒；每 256 次建立耐久檢查點，完成後立即保存。
- 神秘箱子、神秘紫箱、禮物箱、黯淡冰晶武器箱、原地復活之證箱子及未來新增 ItemBox 自動適用。
- 手動存檔前改由共用 Runtime 統一處理待處理箱子／轉蛋，保留 HX 的寫入與讀回驗證。
- 不加入長按連開、滑鼠按住重複或鍵盤自動重複。

## 0.9.82HX — 大量轉蛋防回檔與耐久手動存檔

- MVP 轉蛋新增 `flushPendingForSave()`；手動／離頁／週期存檔前，先完成所有已授權的待處理開箱。
- 每 256 次開箱建立一次同步檢查點；最後一批完成時立即寫入最新快照。
- 手動存檔改用 `saveGameAndWait()`，等待 localStorage／IndexedDB 寫入並讀回 checksum 驗證。
- 手動按鈕顯示「存檔中／已存檔／失敗」，不再無聲完成或無聲失敗。
- 使用者主動存檔會接管 Writer Lease；自動背景分頁仍禁止反蓋。
- localStorage 配額不足時改走 IndexedDB 耐久存檔，不再直接放棄最新快照。

## 0.9.82HW — MVP 轉蛋每件特殊獎絕對機率

- 20週年限定帽、20週年慶生氣球各自固定 0.10%，不再共享 0.10% 類別。
- 時光超越者五件各自固定 1.00%，不再共享 1.00% 類別。
- 時光超越者-LT 四件各自固定 0.10%，不再共享 0.10% 類別。
- 基爾-D-01卡片維持 0.01%；原地復活之證箱子維持 5.00%。
- 特殊獎合計 10.61%；普通獎池調整為 89.39%，普通池內部權重比例不變。
- Runtime 新增 `chanceMode=per_reward_absolute`，公告直接採用每件獎品的絕對機率。

## 0.9.82HV — 傷害數字色彩與爆擊特效統一

- 玩家普通攻擊與一般技能浮字由橘色改為白色。
- 連段、多段、二刀／六合與追加攻擊維持黃色識別。
- 玩家普通攻擊與可暴擊技能統一使用黃紅漸層字面、紅色外框、火花與光圈爆發。
- 怪物對玩家造成的物理、魔法與暴擊傷害全部固定紅色。
- 新增玩家世界座標傷害錨點；受擊浮字留在命中位置，不黏著移動中的角色。
- 新增傷害來源／類型 dataset，供測試與未來戰鬥視覺擴充。

## 0.9.82HU — 死亡期間完全禁止移動

- Position Engine 新增 `isPlayerDeathMovementLocked()` 與 `clearPlayerMovementForDeath()`。
- 死亡時立即清除 `player.position.targetX/targetY`，角色狀態固定為 `Dead`。
- 地圖 pointer/touch/click、World Camera fallback、追怪、貼近怪物、蒼蠅翅膀、蝴蝶翅膀與自動無目標瞬移全部套用死亡鎖。
- 死亡遮罩新增輸入隔離，避免按鈕或背景手勢冒泡到地圖移動入口。
- 復活或回村恢復 HP 後才解除移動鎖。

## 0.9.82HT — 死亡復活、原地復活之證與 5% 補給箱

- 新增 `js/death_revival_runtime.js`，統一管理死亡、原地復活、回村與存檔恢復。
- 移除 `playerDead()` 舊有的免費計時復活與自動掛機直接續戰。
- 自動戰鬥設定新增 `autoCombat.death.autoUseToken`，固定對應 Item 7621。
- Item 12922 接入通用 ItemBox，固定發放 Item 7621 ×10。
- MVP 轉蛋增加 500 basis points（5%）的 Item 12922 獎項，總機率仍為 100%。
- 新增死亡 UI、手機版樣式、正式物品圖示、HT 專項測試與健康檢查。

## 0.9.82HS — 手動戰鬥與主動怪反擊

- 新增獨立 `isManualCombatTargetValid()`，手動目標不再套用掛機黑白名單。
- 快捷欄手動普攻／目標技能改用手動目標驗證。
- 點擊世界怪物：掛機中交由強制掛機目標；未掛機則啟動手動連續普攻。
- 世界主動怪攻擊玩家時，在沒有其他手動目標的前提下自動反擊。
- 新增 `requestManualRetaliationAgainstMonster()`，保護玩家既有鎖定不被其他攻擊者搶走。

## 0.9.82HR — 全域稀有物品公告與升階材料 5% 絕對掉落

- 新增 `js/rare_item_announcement_runtime.js`，統一紅／紫／金橫幅 UI、機率門檻、權重計算與批次合併。
- 怪物掉落、MVP Drops、被動額外掉落、卡片額外掉落、地圖額外掉落、MVP 轉蛋與 ItemBox 全部改走共用公告入口。
- 機率採每件物品最終實際值：紅 ≤100/10000、紫 ≤10/10000、金 ≤1/10000。
- 同一獎池重複 Item ID 合併權重後再判定；不同數量但同 Item ID 仍視為同一物品的總取得率。
- MVP 轉蛋的分類機率會乘上分類內該物品權重占比；普通池若實際 ≤1% 也會公告。
- 升階材料新增 `gradeMaterialDropChanceBasisPoints=500`，所有 grade-mode 額外材料固定 5%，完全跳過全域掉落倍率。
- 保留 `gradeMaterialDropRate=10000` 僅作舊版資料相容；HR Runtime 在絕對機率存在時不使用它。

## 0.9.82HP — 正式物品圖示校正與箱子缺圖補齊

- 掃描 `RO_WEB專案資料(1).zip/items` 內 20,909 張正式 WebP 物品圖示，依物品 ID 對照專案。
- 原有 1,094 張數字圖示中，1,092 張已與正式同 ID 圖完全一致；Item 500054 為唯一內容不一致項目，已替換。
- 補入 1,480 張專案物品／ItemBox 獎池實際需要、但原先缺少的正式圖示。
- 禮物箱、神秘箱子、神秘紫箱合計 1,081 種獎品的本地圖示覆蓋率由不完整提升至 100%。
- 1100100 黯淡冰晶武器箱為自訂 ID，官方沒有同 ID 圖示；保留並稽核其內容等同官方 101638 圖示。
- 新增正式圖示來源、替換、補入與例外映射稽核報告。

## 0.9.82HO — RA 經典箱子正式啟用

- 新增禮物箱（644）、神秘箱子（603）、神秘紫箱（617）開箱功能，完全沿用黯淡冰晶武器箱的 `ItemBoxRuntime`。
- 獎池來源固定為 rAthena Renewal 2026-06-08 `db/re/item_group_db.yml`：GIFTBOX 70 項／總權重 88、BLUEBOX 1,032 項／總權重 8,429、VIOLETBOX 958 項／總權重 9,570。
- 三箱聯集共 1,081 種獎品；補入原專案缺少的 570 筆物品資料，名稱與說明取台服 `itemInfo_UTF8.lub`，基礎分類／裝備資料取 RA Renewal。
- 修正舊 ItemBox Runtime 會先排除缺少 itemData 的獎品、導致官方機率分母被偷偷改寫的風險；現在選中缺資料獎勵時不消耗箱子。
- 保留官方自我掉落：禮物箱可抽回禮物箱，神秘紫箱可抽回神秘紫箱；只回背包，不會遞迴自動開啟。
- 三種箱子原本已存在於怪物掉落表，現在掉落後可直接在背包使用。

## 0.9.82HN — 防回檔耐久存檔／後端預留／倍率統一

- 修正舊載入流程只要主存檔能解析就永遠優先採用、即使安全備份較新的回檔風險。
- 主存檔與安全備份改為 `saveVersion`、`savedAt`、`sessionId`、checksum 驗證封裝；載入時永遠選最新且驗證通過的一份。
- 新增 IndexedDB 主鏡像與上一代耐久備份；localStorage 仍負責同步 F5／離頁存檔。
- 新增分頁寫入租約：最新分頁接管，舊分頁停止寫入，避免掛機進度被舊頁面反蓋。
- `pagehide`、`beforeunload`、`visibilitychange(hidden)`、`freeze` 全部強制補存；每 60 秒持續完整存檔。
- 預留 `ROWebSaveManager.registerRemoteAdapter()`，未來可接離線後端，不需重寫角色快照格式。
- 清除角色／全部資料時同步清除 IndexedDB，避免刪檔後被耐久鏡像復原。
- Base EXP、Job EXP、一般掉落、Zeny、卡片、地圖限定、升階材料倍率全部統一為 `10000`，並重建 `js/data_bundle.js`。

## 0.9.82HM — 貨幣列原地展開／收合

- 移除額外貨幣浮窗的實際使用路徑，改為直接展開既有右上 `#top-bar`。
- 收合時維持三格精簡貨幣顯示；展開時改為 Zeny、藍寶石、紅寶石三列完整數字。
- 再點一次貨幣列、點擊外部或按 Escape 可收合。
- 新增 document capture `pointerup`／`click`、inline onclick 及 Enter／Space 鍵盤操作，繞過早期 HUD 事件攔截。
- 完整數字採獨立 `.currency-expanded-value` 節點，避免 `updatePlayerUI()` 將其重新改成舊顯示。
- 保留 0.9.82HL 的貨幣滑鼠提示、背包／裝備／一般道具 Tooltip 與附魔石平常查看功能。
- 不修改角色資料、貨幣數值、掉落率、精煉、升階、附魔或存檔格式。

歷史詳細報告請參閱：`HISTORY_UPDATE_AUDIT_LOG_THROUGH_0.9.82HL.txt`。

## 0.9.82II — Exact Monster Instance Anchor / Auto Battle Recovery / Chain Lightning Runtime Fix

- 強酸禁地地面錨點不再以同種怪物的 `mobId/id` 模糊回查；只接受正式怪物實例或唯一 instance identity。
- 正式世界怪物 `entity.position` 優先於 DOM；失效、離場、零尺寸或 instance 不符的 DOM 不再作座標來源。
- 自動掛機 tick 即使發生單次 Runtime／UI 例外也會在 `finally` 重新排程；素質欄開關均執行 scheduler recovery。
- 關閉自動掛機時不再因主動怪攻擊自動啟動玩家連續反擊；手動點怪仍正常。
- 連鎖電擊及其 `WL_CHAINLIGHTNING_ATK` 別名固定解析至 Skill 2214 `chain_magic`。
