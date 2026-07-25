# 0.9.82FI CURRENT RUNTIME

目前正式版本：**0.9.82FI**。

裝備槽位以 rAthena `Locations` 為權威，`Both_Accessory` 必須支援飾品 1／2 並優先空欄。系統對話欄的工具列、訊息捲動區、所在地／座標必須分層，不得遮擋捲軸。

大／中／小尺寸在桌機與手機都必須可用；Safari 無 CSS zoom 時使用 transform fallback。視窗開啟、尺寸切換、pageshow、resize、orientationchange 後必須自動限制回 viewport，舊存檔的畫面外座標不可讓視窗永久遺失。

二刀連擊／六合拳及所有由普通攻擊觸發的額外傷害，以黃色 additional lane 顯示於主傷害旁；總傷害公式不重算。玩家移動像素速度在 Renewal walkSpeed 結果上乘 1.5，怪物不套用此倍率。

# 0.9.82FH CURRENT RUNTIME

目前正式版本：**0.9.82FH**。

所有 `.game-window` 與 `.ui-size-target` 視窗使用固定三段尺寸循環：大 100%、中 75%、小 50%，預設大，按鈕依「大 → 中 → 小 → 大」切換。禁止加入自由拉伸把手；各視窗尺寸以 `player.uiWindowSizes` 與本機備援鍵個別保存。縮放按鈕不得啟動拖曳，縮放後視窗需保持在可見範圍。

手機／粗指標裝置不得依賴技能或消耗品拖曳。主動／Toggle 等可用技能與消耗品由詳細視窗選擇快捷欄 1～0；被動與未學技能不可配置。消耗品歸零後快捷格保留並灰階，重新取得後恢復。電腦仍可保留拖曳，同時支援點選配置。

地圖怪物資訊只顯示怪物名稱；Boss／MVP 另保留綠色存在中與紅色重生倒數。手機／觸控版資訊必須內嵌於地圖／傳送視窗並在自身區域捲動，不得固定於整個螢幕上方或遮擋傳送操作。

系統對話欄右上角放置存檔／清存檔，所在地顯示於座標上方。裝備詳細視窗提供穿戴／卸下按鈕並遵守現有裝備限制。

# 0.9.82FG CURRENT RUNTIME

目前正式版本：**0.9.82FG**。

城鎮存檔重新載入時，`player.currentCity` 是場景權威；`currentMap` 與 `player.map` 必須為空，`lastFieldMap` 只保留作為離城目的地。World Monster Runtime 的 active 判定必須包含 `!player.currentCity`，城鎮背景恢復時需防禦性清除所有串流怪物。

地圖怪物分布不得直接顯示 `raSpawnCount`。普通與植物數量應依 `getWorldMonsterRuntimeValves()`、`getWorldMonsterWindowTargetCount(profile)`、`minAlive`、植物 cap 與 `normalHardCap` 即時計算；稀有、Boss、MVP 的 `maxAlive` 維持獨立。浮卡每秒刷新 Boss／MVP 倒數時必須保留 `scrollTop`；手機／觸控版使用小尺寸與高度上限，保持底部傳送操作可用。

頁面分享預覽使用最小 OG metadata，不允許聊天軟體擷取遊戲內開發／測試文字作長篇摘要。legacy 單怪等待面板在沒有鎖定目標時必須隱藏。

# 0.9.82FE CURRENT RUNTIME

目前正式版本：**0.9.82FE**。

Boss／MVP 重生倒數統一顯示為 `X小時 X分鐘 X秒`。普通群體怪物使用 `mob_count_rate: 33`，玩家中心 1024×1024 目標約 20 隻；一般怪物硬上限 40。地圖切入時不得同步建立完整目標，首批只建立 8 隻，之後由 500ms maintenance 每批最多 4 隻補齊，以降低進場卡頓。稀有怪、Boss、MVP 的 maxAlive 與重生契約不變。

# 0.9.82FD CURRENT RUNTIME

目前正式版本：**0.9.82FD**。

進階戰鬥資訊明細移除會錯位的＋／－占位符，但明細仍可點擊展開。World Camera 在桌機視窗小於 1280×720 時改用 battle-field 實際 rendered rect 作為 camera viewport，世界本體仍維持 4608×4608，不縮圖、不改玩家世界座標。

地圖／傳送的野外地區按鈕新增黑金怪物分布浮卡，資料由 `monster_spawn_config.json` 與 `monsters.json` 即時組合。一般、植物、稀有、Boss、MVP 分類顯示；Boss／MVP 若可生成顯示綠色「存在中」，死亡重生期間以紅色每秒倒數，狀態讀取 `player.worldMonsterState.regions.*.unique.*.nextSpawnAt`。城鎮用途懸停介紹維持原樣。

# 0.9.82FC CURRENT RUNTIME

目前正式版本：**0.9.82FC**。

自動戰鬥面板在「使用普通攻擊」上方具有「攻擊設定」區段標題，用來涵蓋普通攻擊與技能 1～4。此版只有介面標題調整；FB 的自動異常解除與低血逃生、FA 四技能、EZ 狀態機、EY 長讀條及 EX 動作分類契約全部不變。

# 0.9.82FB CURRENT RUNTIME

目前正式版本：**0.9.82FB**。

自動戰鬥設定窗採純功能介面，不放教學式說明。所有數字門檻使用面板同色背景與金色上下步進器；低血量蒼蠅翅膀及蝴蝶翅膀回城門檻固定限制 1～99%，兩者同時符合時蝴蝶翅膀優先，預設返回普隆德拉。

自動異常解除不得寫死成只有中毒。技能端掃描 `runtimeProfile.effects.clearStatuses`、`clearStatuses`、`clearStatusesOnlyWhenPresent`；物品端優先解析 `scriptRaw/Script` 中的 `sc_end SC_*`，itemInfo-only 物品才使用描述／官方 ID fallback。系統先使用已學會且可施放的自體解除技能，再從背包選擇能覆蓋最多當前異常、價格較低的物品。綠色藥草、綠色藥水、萬能藥與蜂膠均已接入。所有異常解除品必須從一般 HP／SP 自動補給候選排除；蜂膠等同時含 `itemheal` 的物品在解除時仍需套用恢復效果。

手動消耗品與自動戰鬥共用 `getItemRecoveryProfile()`／`getItemStatusCureProfile()`，未來新增解除黑暗、沉默、詛咒等物品或技能，只要資料帶有 `sc_end`／`clearStatuses` 即可自動辨識。FA 四技能優先序、EZ 狀態機、EY 長讀條與 EX 動作分類契約全部保留。

# 0.9.82FA CURRENT RUNTIME

目前正式版本：**0.9.82FA**。

自動戰鬥唯一核心為 Auto Battle Controller v1.1。找不到有效目標時固定等待 1 秒後自動使用蒼蠅翅膀；UI 不再提供手動飛走按鈕或等待秒數選單。瞬移完成後必須刷新世界怪物串流並立即重新鎖定。Boss 與 MVP 迴避是兩個獨立開關，MVP 分類優先於 Boss；座標／存檔正規化不得丟失 `avoidBoss`、`avoidMvp`。

普通攻擊由 `normalAttack.enabled` 統一控制。攻擊技能使用 `attacks[0..3]` 四格優先序，每格包含 enabled、skillId、level、spPercent、minMonsters。怪物數量條件必須依該技能 Runtime 實際可命中的目標集合判斷，不得只計算全畫面怪物。獨立 cooldown 可以向下嘗試下一技能或普通攻擊；詠唱、共通延遲、After Cast、動作鎖、ASPD 與 140ms 安全下限不得被繞過。舊 `attack` 欄位只作存檔遷移別名。

HP／SP 自動補給選單必須從背包現有物品動態建立。恢復辨識先讀物品明確 hp／sp 值，再解析腳本 `itemheal`（含 `rand(min,max)`）；因此新增補品不應要求在自動戰鬥程式另建白名單。每個 Buff 設定為 `{enabled, spPercent}`，只有目前 SP 百分比高於門檻才施放，且無目標時仍可執行。

EZ 的狀態機、智慧鎖定、立即換怪、手動點怪與 EY／EX 動畫契約全部保留。

# 0.9.82EZ CURRENT RUNTIME

目前正式版本：**0.9.82EZ**。

自動戰鬥唯一核心為 Auto Battle Controller v1。正式多怪地圖使用 SEARCHING／APPROACHING／COMBAT／UTILITY／TARGET_DEFEATED／TELEPORTING 狀態；怪物死亡後立即搜尋下一隻，不得恢復世界地圖固定 1.5 秒等待。`RESPAWN_DELAY` 只允許 legacy 單怪地圖使用。

目標優先序：玩家手動強制指定 > 正在攻擊玩家的怪物 > 目前有效鎖定 > 其他仇恨怪／最近存活怪物。有效鎖定應保持到死亡或失效，禁止每個 Tick 因微小距離差反覆切怪。喝水、治癒與 Buff 必須在無目標時仍可運作。指定攻擊技能處於獨立 cooldown 時預設穿插普通攻擊，但不得縮短詠唱、共通延遲、動作鎖、ASPD 或 140ms 全域安全下限。

自動瞬移後必須刷新玩家周圍怪物串流並立即重新搜尋。手動左鍵模式仍只使用普通攻擊；自動戰鬥期間點怪則建立強制目標鎖。EY 的長讀條人物動作分段與 EX 的技能動作分類契約全部保留。

---

# 0.9.82EY CURRENT RUNTIME

目前正式版本：**0.9.82EY**。

本版以 0.9.82EX 為基準，新增長讀條人物動作兩段式契約：讀條期間只播放 Attack／Cast 前段預備幀一次並停在最後預備姿勢；技能結算時才播放最後 2～3 幀釋放／命中動作。6 幀 Cast 拆為 4＋2；8～9 幀 Attack 保留最後 3 幀。禁止在讀條期間循環完整 Cast，也禁止把完整 Attack 平均拉長到整條讀條。

EX 的分類契約完全保留：所有傷害主動技能使用目前武器 Attack；Buff／治療／Debuff／支援／演奏／召喚施術使用無武器 Cast；被動與 Toggle 關閉不播放。

---

# 0.9.82EX CURRENT RUNTIME

目前正式版本：**0.9.82EX**。

本版以 0.9.82EW 深度稽核版為基準，修正技能人物動作契約：所有傷害技能使用目前武器 Attack；Buff／治療／Debuff／支援／演奏／召喚施術使用無武器 Cast；被動不播放，Toggle 關閉不播放。Runtime handler 是唯一權威，禁止再由舊 Skill Core type=Weapon 決定動作。EW 的二進位素材完整性契約全部保留。

技能動作稽核：828 招已實作技能全部通過；291 招傷害技能使用 Attack、321 招非傷害主動技能使用 Cast、216 招被動不播放。102 套 Cast Atlas 均為無武器 body/hair 素材。EW 的人物 51,024 幀、怪物 28,968 幀與 90 張地圖檢查結果保留。

最新 `tools/deep_health_check.py` 已包含 binary asset audit。客戶端物品名稱資料重建請使用 `tools/build_client_item_display_data_0.9.82EW.py`，itemInfo 可由命令列、`RO_WEB_ITEMINFO`、專案根目錄或 `client_tables` 指定。

---

# 0.9.82EV CURRENT RUNTIME

目前正式版本：**0.9.82EV**。

傷害顏色契約：一般普通攻擊與一般技能使用橘色；`hitCount > 1`、combo 或 multiHit 使用黃色；只要 CriticalResolver 實際判定暴擊，普通攻擊與技能都必須以紅色覆蓋。`resolveNormalAttack()` 的 `critical` 目前是布林值，不得再只讀取 `critical.critical`。

物品視窗契約：視窗使用金色外框與較小尺寸；只有中間 `.item-detail-description` 可獨立滾動，標頭、基本資訊與卡片插槽應維持可見。

正式版介面契約：`POSITION_DEBUG_CROSS_ENABLED` 必須為 false，人物腳底不得顯示綠色 Debug 十字；`#position-coordinate-ui` 必須顯示於系統對話欄右下角。

0.9.82EU 的技能前置自動補點、任務技能自動學會、裝備實例與卡片能力接線全部保留。

完整 Runtime：68／68 PASS；JavaScript 613 檔 0 errors；Deep Health：0 errors／0 warnings。

---

# 0.9.82ET CURRENT RUNTIME

目前正式版本：**0.9.82ET**。

傷害數字顯示契約：一般玩家傷害使用橘黃色粗體；`CriticalResolver` 實際判定為暴擊的普通攻擊與物理技能必須將 `critical:true` 傳入 `showDamageNumber()`，由 `.critical-damage-number` 顯示紅字。召喚物傷害維持青色。禁止以傷害大小猜測暴擊，也不得重新擲一次 CRI。

0.9.82ES 的效能契約全部保留：數字入列時保存怪物頭頂座標、每幀最多建立 18 個節點、HP 條使用 `scaleX()`、EXP／掉落／背包／存檔於死亡後拆幀批次結算。暴擊紅字只可增加既有 DOM 的 class，不得建立額外節點或同步動畫。

完整 Runtime：62／62 PASS；Deep Health：0 errors／0 warnings。

---

# 0.9.82ES CURRENT RUNTIME

目前正式版本：**0.9.82ES**。

傷害數字契約：`showDamageNumber()` 必須在入列時透過 `captureDamageNumberAnchor()` 保存實際受擊怪物的頭頂座標。延後建立 DOM 時禁止再依賴可能已死亡、卸載或被解除鎖定的 `currentMonster`。每個 animation frame 最多建立 18 個傷害數字節點。

怪物 HP 條契約：正式 World Monster 使用快取的 `_hpBarElement`／`_hpFillElement`，填充比例以 `transform: scaleX()` 更新。不得恢復逐 Hit 查詢 DOM 或使用 `width` 造成 layout。正式世界怪物不得再重建隱藏的 legacy singleton monster UI。

死亡結算契約：`defeatMonster()` 與次級範圍擊殺只可透過 `queueMonsterDefeatResolution()` 排入結算。死亡狀態／動畫立即生效，但 EXP、Job EXP、Zeny、掉落、背包 UI、戰鬥紀錄及存檔必須於畫面完成後以 idle batch 分批處理。多目標擊殺不得逐隻同步呼叫 `updateInventoryUI()` 或 `saveGame()`。

Spatial Hash 與 Combat Evaluation Context 的 0.9.82ER／EQ 效能契約仍全部保留。

完整 Runtime：61／61 PASS；Deep Health：0 errors／0 warnings。

---

# 0.9.82EQ CURRENT RUNTIME

目前正式版本：**0.9.82EQ**。

本版完成六大職業＋初學者技能在十大 World Monster Runtime 的端到端接線稽核。所有技能目標候選統一經過 `getCombatEnemyCandidates()`／`getRuntimeCombatCandidates()`，禁止技能直接讀取舊 `activeMonsters`／`mapMonsters`。828 份官方 Runtime Profile 中共確認 293 招傷害技能，198 招具有範圍／方向選取；circle、square、line、directed_line、cone、single 均使用同一套正式世界候選與死亡過濾。

技能命中效能規則：一次施放建立單一 `RO_WEB_COMBAT_EVAL_CONTEXT`，快取衍生能力、Buff、被動、訓練加成與當前怪物候選；範圍技能不得逐隻重新執行整套角色能力計算。傷害數字必須在同一 animation frame 以 `DocumentFragment` 批次插入；主要戰鬥存檔使用 `requestGameSave(300)` 去抖，`pagehide`／`beforeunload` 再強制 flush。14 目標銳利射擊回歸測試中，衍生能力完整計算為 1 次、命中 14 隻、同步 `saveGame()` 為 0 次。

本版同時修正：強制主目標加入後仍遵守 `maxTargets`；cone 會依 `directionTarget` 決定方向；連鎖魔法死亡判斷、地面／跟隨範圍／歌曲脈衝／魔力拳／獵鷹與狼鷹自動攻擊／二道聖光／僕役武器等次級傷害使用共同扣血與顯示入口。公式顯示傷害與實際 HP 扣除仍分離。

完整 Runtime：59／59 PASS；Deep Health：0 errors／0 warnings。

---

# 0.9.82EN CURRENT RUNTIME

目前正式版本：**0.9.82EN**。

本版完成四項怪物修正：HP 條在傷害落地時立即刷新；111 種現役怪物名稱依 2025-12 `mob_db.yml` 全面稽核並修正 44 種；怪物 RUSH／CHASE 與玩家戰鬥靠近改用 Walk 動畫；8 種草／菇類依 rAthena Infinite Defense 每個成功 Hit 固定受到 1 點傷害。怪物能力值與戰鬥公式仍以 2026-06-08 rAthena Renewal 為準。

所有 UI 視窗必須高於人物、怪物、怪物 HP、投射物、地面特效與傷害數字。世界怪物 z-index 僅能由 `getWorldMonsterDepthZIndex()` 產生並限制在 1000～8999；`.game-window` 與 `bringWindowToFront()` 從 20000 起；Modal／Tooltip 為 30000。不得恢復 `200 + worldY` 的無上限寫法。

---

目前正式版本：**0.9.82EN**。

十大 World Camera 地區已啟用 RA Renewal 正式怪物池，共 111 種怪物。怪物資料鏈為：RA `npc/re/mobs/fields/*.txt` → `db/re/mob_db.yml` → npcidentity／jobname → RO Studio V78 PNG＋JSON。妙勒尼舊測試蠍子／波利不得重新加入。

普通怪以玩家為中心動態維持：每來源 512×512 基準 15 隻，來源 1024×1024 活動窗在 100% 時約 60 隻，來源 1280×1280 為清除緩衝，普通怪硬上限 120。種類依 RA 出生數量加權，不平均分配；植物、稀有怪、Boss、MVP 另設上限與重生。

全域設定只從 `data/server_config.json > server.monsters` 讀取：

- `mob_count_rate`：普通群體怪物數量倍率。
- `mob_spawn_delay`：普通怪重生等待倍率。
- `plant_spawn_delay`：植物重生等待倍率。
- `boss_spawn_delay`：Boss-class／MVP 重生等待倍率。
- `mob_spawn_variance`：是否保留 RA 隨機重生區間。

100 為原值；重生等待倍率 50 代表等待減半，200 代表等待加倍。單隻稀有／Boss／MVP 不因 `mob_count_rate` 複製，並使用持久化 `nextSpawnAt`，地區切換不得重置。

目前怪物支援 RA `Ai`／`Modes` 基礎行為：Aggressive 依 SkillRange 主動索敵、受擊至少追擊 24 格、Assist 11 格連動、CastSensorIdle、NoRandomWalk、CanMove／CanAttack；出生 78% 偏向玩家 760px 內並保留 140px 安全圈。怪物專屬技能施放 AI 尚未完成。新增／修改怪物前必讀：`RO_WEB_CONSTITUTION.json`、`data/monster_spawn_config.json`、`docs/REGION_MONSTER_STREAMING_0.9.82EI.json`、`tools/test_region_monster_streaming_0.9.82EN.py`。

---

# 0.9.82EH CURRENT RUNTIME

本版正式建立十個獨立大地區：普隆德拉、吉芬、夢羅克、妙勒尼山脈、拉赫、斐揚、朱諾、汶巴拉、燈塔海邊、菲音斯。每區由 9 張 512×512 圖片組成 3×3 World Camera 地圖，顯示世界尺寸 4608×4608，PC／手機比例、角色尺寸與鏡頭規則完全沿用既有妙勒尼實作。

各地區不做邊界拼接，也不設地圖內傳送點；切換統一透過「地圖／傳送」UI。切割前大地圖、世界參考圖與原圖 ZIP 不納入部署版。「斐揚＋艾爾貝塔地區」在 Runtime 顯示為「斐揚地區」。本版所有地區暫不生成怪物，怪物種類、數量與出生規則等待後續指定。

# 0.9.82EG CURRENT RUNTIME

本版修正進階戰鬥資訊 UI：桌機版使用與特性素質一致的純三角箭頭，進階面板與能力值視窗上下對齊；來源副標與傷害頁公式來源說明已移除。手機／觸控版開啟進階資訊時會直接替換整個能力值／特性內容，按左上 `◀` 返回，旋轉或跨越 900px 會自動重繪。快取鍵與 Runtime 版本統一為 `0.9.82EG`。

進階資訊仍顯示角色、裝備、卡片、永久成長、被動、Buff 與 Runtime 的最終分類總和及來源明細；公式權威仍只採 rAthena Renewal。正式存檔防修改、正式重置制度與怪物 RES／MRES 仍延後。

# 0.9.82EF CURRENT RUNTIME

本版修正 0.9.82EE 入口 `index.html` 仍使用 0.9.82ED 快取鍵的問題；所有 CSS／JS／圖片入口統一更新為 `?v=0.9.82EF`。一般能力值與特性素質共用全域 +1／+10 配點模式，免費重置控制仍不顯示。進階戰鬥資訊依 ROItemSearchApp 的 `enumvar.lua`／`AddRandomOptionNameTable.lua` 補齊種族別 CRI、種族／屬性／階級穿透、物魔體型耐性、敵人本體屬性傷害減免與武器體型懲罰移除；rAthena Renewal 仍是唯一公式權威。

正式存檔防修改、正式重置制度與怪物 RES／MRES 仍延後。

# 0.9.82EB CURRENT RUNTIME

四轉特性素質已正式實裝：Base Lv.201～275 的 Trait Points 採 rAthena Renewal 累積值 ×2（總計 570），普通素質點在 Lv.200 固定 4099。POW／STA／WIS／SPL／CON／CRT、四轉 Job Bonus、裝備／卡片／Buff、傷害／防禦／治療公式與展開式素質 UI 均已接入；所有職業可查看，四轉與 Hyper Novice 自 Lv.201 起可配點。AP 仍停用。

# RO_WEB AI START HERE — 0.9.82EA

目前正式版本：**0.9.82EA**。

## 技能與公式唯一規則

戰鬥只允許通過 `CombatDamagePipeline`、`CombatFormulaRuntime`、`HitResolver`、`CriticalResolver` 與 `DefenseResolver`。規則來源只使用 rAthena **Renewal**；禁止恢復舊 HIT `+80`、舊 ASPD 近似式、32px 格距或替代傷害回退。

1 Cell＝36px。技能施放距離、地面指定距離、作用半徑、普通攻擊距離與追擊距離必須分離。

所有可重複主動攻擊技能先完整計算 CastTime、FixedCastTime、AfterCastActDelay、AfterCastWalkDelay、Cooldown、CastTimeFlags、CastDelayFlags 與 ASPD cast-begin lock；最終限制低於 140ms 時，套用 140ms 的 RO_WEB 效能安全下限。這不是網路延遲模擬，不得用來縮短 RA 原始時序。

## 地面效果規則

所有地面技能使用 `GroundPlacementResolver` 與 `GroundEffectManager`，統一處理：36px 格子對齊、合法落點、地圖邊界、Land Protector、重疊政策、NoOverlap、實例上限、Tick、波次、總命中、狀態、擊退與清除。

結構化 `runtimeProfile.status` 必須由 `applyAttackRuntimeStatus` 解析；不可只接受字串狀態名稱。

## 範圍與 Pending

技能總數 1,139；正式 Runtime 828；Pending 311。310 招擴充職業技能依決議暫緩；另一招為沒有生命體死亡模型時無有效目標的 `AM_RESURRECTHOMUN`。

南門測試地圖已退役。正式野外地圖目前只有 `mjolnir_3x3_region_camera`；傳送前必須清除舊地圖怪物 Runtime。

修改前必讀：`RO_WEB_CONSTITUTION.json`、`docs/OPEN_WORK_ITEMS_0.9.82EA.md`、`tools/full_combat_ground_runtime_audit_0.9.82EA.json`、`tools/current_runtime_integrity_0.9.82EA.json`。

---

# RO_WEB AI START HERE — 0.9.82DW


目前正式版本：**0.9.82DW**。

技能時序唯一權威為使用者提供的 rAthena Renewal 開機檔。`CastTime`、`FixedCastTime`、`AfterCastActDelay`、`AfterCastWalkDelay`、`Cooldown` 必須先寫入 Build 後技能核心，再由 `js/skill_engine.js` 統一執行；不得在快捷欄、自動戰鬥或個別技能 Handler 另寫第二套延遲。

人物動作規則：物理攻擊技能使用目前武器 `Attack`，魔法／治療／Buff／Debuff／支援使用 `Cast`，純被動不播放動作。ASPD 只影響沒有任何詠唱、技能冷卻與 After Cast Delay 的物理技能，並使用普通攻擊既有間隔公式。

目前技能總數 1,139；正式 Runtime 827；Pending 312。人物部署庫為 90 套人物、102 變體、12 坐騎變體、480 武器 Attack Atlas。修改技能／人物前必讀：`RO_WEB_CONSTITUTION.json`、`docs/FULL_SKILL_CHARACTER_RUNTIME_AUDIT_0.9.82DW.json`、`tools/audit_ra_skill_timing_0.9.82DW.py`、`tools/test_all_skill_timing_actions_0.9.82DW.js`、`tools/test_all_character_weapons_0.9.82DV.py`。

傳送後上一張地圖怪物殘留仍是已知待修項目；不得在本版報告中標示為完成。

---

# RO_WEB AI START HERE — 0.9.82DV

目前正式版本：**0.9.82DV**。

被動技能不可只依 `skillType` 判斷；必須以 `type: passive` 或 Runtime Profile `handler: passive` 為準。人物／怪物 Atlas 圖片載入統一使用 DOM `<img>` 元素，不直接依賴全域 `Image` 建構子。

本版以原始人物母庫重新產生六大職業＋初學者全部 90 套人物，完成 480 組 Attack 武器來源稽核。後續不得再使用 V2.0.1 產生的舊 `characters.zip`；人物部署版必須由 V2.0.3 或更新工具輸出，並通過 `全職業武器動畫稽核`。

武器切換 Runtime 使用 request serial／pending weapon 防止非同步競態；快速裝備、卸裝、轉職或上下坐騎時，舊 Atlas 載入不得覆蓋最新武器。修改人物／武器前必讀：`data/character_atlas_manifest.json`、`assets/characters/*/*/motions.json`、`js/player_atlas_runtime.js`、`docs/CHARACTER_WEAPON_AUDIT_0.9.82DV.json`、`tools/test_all_character_weapons_0.9.82DV.py`。

---

# RO_WEB AI START HERE — 0.9.82DT

目前正式版本：**0.9.82DT**。

本版正式整合六大職業＋初學者共 **90 套人物外觀**，並替換舊固定格 Atlas。部署素材使用逐幀透明裁切、RGBA 去重、方向鏡像／借用 JSON；共有 12 套劍士坐騎變體。世界地圖與戰鬥依 `player.mountState` 切換 `on_foot`／`mounted`，左上人物欄與城鎮人物固定使用無坐騎 `idle.png`。

Runtime 必須讀取 packed JSON 的 `frame_sets`、`region`、`targetOffsetX/Y`、`flipX` 與 `sourceDirection`；不得恢復舊式固定 8 欄×256 格裁圖。hurt 與 dead 共用 `dead` JSON：hurt 3 幀、dead 4 幀並停在最後。

修改人物前必讀：`data/character_atlas_manifest.json`、`assets/characters/*/*/motions.json`、`js/player_atlas_runtime.js`、`docs/CHARACTER_PACKED_INTEGRATION_0.9.82DT.json`、`tools/test_packed_character_library_0.9.82DT.py`。

---

# RO_WEB AI START HERE — 0.9.82DR

目前正式版本：**0.9.82DR**。

本版完成所有 827 招正式實裝技能的玩家敘述同步；312 招 Pending 技能維持原狀。技能說明以目前 RO_WEB Runtime 效果為準，禁止空白與「待後續／尚未完成／成本延後」等開發文字。

魔導機甲相關技能維持目前可直接使用，不新增機甲狀態限制、不切換機甲動畫；人物沿用機械工匠／機甲神匠原職業素材。2241 騎狼術固定為永久被動移速 +10%／+20%／+30%，不影響攻擊、坐騎狀態或轉職判定。

修改技能前必讀：`data/skills/skills_core_1.json`、`data/skills/skills_core_2.json`、`data/skill_runtime/runtime_core_1_v1.json`、`docs/SKILL_DESCRIPTION_CURRENT_EFFECT_AUDIT_0.9.82DR.json`、`tools/test_skill_description_sync_0.9.82DR.py`。

---

# RO_WEB AI START HERE — 0.9.82DQ

目前正式版本：**0.9.82DQ**。

本版補上坐騎限定技能的統一失敗提示：未騎乘或坐騎條件不符時，系統對話欄以紅字顯示「需要使用坐騎才能使用該技能。」；技能不施放、不扣 SP、不進入冷卻。

坐騎人物 PNG／JSON 仍等待劍士家族素材完成後接入；刺客劍＋短劍顯示與人物圖片最佳化維持延後。

修改坐騎前必讀：`data/mounts/mount_manifest.json`、`js/skill_engine.js`、`js/battle.js`、`css/style.css`、`docs/SWORDMAN_MOUNT_SKILL_RUNTIME_0.9.82DQ.json`。

---

# RO_WEB AI START HERE — 0.9.82DP

目前正式版本：**0.9.82DP**。

本版建立劍士家族坐騎技能 Runtime：騎乘術依職業切換大嘴鳥／龍／獅鷲；RA Riding／Ridingdragon 技能使用對應騎乘條件。所有坐騎不增加負重量。

人物坐騎 PNG／JSON 尚未加入，後續由 `mountState` 與 `window.onROWebMountStateChanged` 接到劍士家族 Atlas。刺客劍＋短劍顯示與人物圖片最佳化保持延後。

修改坐騎前必讀：`data/mounts/mount_manifest.json`、`js/skill_engine.js`、`data/skill_runtime/runtime_generated_all.json`、`docs/SWORDMAN_MOUNT_SKILL_RUNTIME_0.9.82DP.json`。

---

# RO_WEB AI START HERE — 0.9.82DO

目前正式版本：**0.9.82DO**。

本版新增法師家族 14 套人物動畫：魔法師、巫師、賢者、咒術士、妖術師、禁咒魔導士、元素支配者男女素材全部 ready。進階魔法師共用魔法師、超魔導師共用巫師、智者共用賢者。

法師單手杖與雙手杖共用同一套 `staff` 人物動畫；雙手杖的裝備占位與盾牌互斥仍依 `handed: 2`／`Locations.Both_Hand` 判定。

修改人物前必讀：`data/character_atlas_manifest.json`、`data/jobs.json`、`js/player_atlas_runtime.js`、`docs/character_appearance_integration_0.9.82DO.json`。

---

# RO_WEB AI START HERE — 0.9.82DN

目前正式版本：**0.9.82DN**。

本版依 rAthena `pc_jobchange` 加入轉職後裝備逐欄重新驗證；雙手武器佔用盾牌顯示格且與盾牌／副手互斥。刺客至四轉可在副手裝單手劍／短劍，雙持外觀會解析雙短劍、雙劍或劍＋短劍回退。

基本斧 1301/1302 明確禁止 Assassin 與 Rogue 家族。詩人路線限男性、舞孃路線限女性；跨性別轉職選項與趣味對話已移除。

修改前必讀：`data/job_change.json`、`data/jobs.json`、`data/equipment_job_map.json`、`js/player.js`、`js/job.js`、`js/job_constitution.js`、`js/player_atlas_runtime.js`。

---

# RO_WEB AI START HERE — 0.9.82DL

目前正式版本：**0.9.82DL**。

本版新增盜賊家族 14 套人物動畫；`thief / assassin / rogue / guillotine_cross / shadow_chaser / shadow_cross / abyss_chaser` 男女素材均 ready。進階盜賊、十字刺客、神行太保透過 `jobs.json appearanceGroup` 共用對應二轉外觀。

刺客系沒有斧頭動畫；基本斧 1301/1302 禁止 Assassin 家族裝備。劍＋短劍外觀優先回退雙短劍。

修改人物前必讀：`data/character_atlas_manifest.json`、`data/jobs.json`、`js/player_atlas_runtime.js`、`docs/character_appearance_integration_0.9.82DL.json`。

---

# RO_WEB AI START HERE — 0.9.82DK

修改前必讀：

1. `RO_WEB_CONSTITUTION.json`
2. `README.md`
3. `CHANGELOG.md`
4. `data/jobs.json`
5. `data/job_change.json`
6. `data/character_atlas_manifest.json`
7. `docs/character_appearance_integration_0.9.82DK.json`
8. `js/player_atlas_runtime.js`
9. `js/world_monster_test_runtime.js`

目前正式版本：**0.9.82DK**。

重要人物規則：

- 外觀由 `jobs.json -> appearanceGroup` 解析。
- `hurt` 與 `dead` 共用 `hurt_dead/body_hair.json`；Runtime 依 motion id 選取對應幀。
- 初學者、服事、弓箭手三大家族人物素材狀態為 ready。
- 詩人／舞孃取消性別限制後，以同階同性交叉外觀別名補足缺少的官方服裝。

0.9.82DJ 的波利被動遊走、蠍子主動追擊與怪物 V76 flipX 均保留。


## 0.9.82DN 裝備與屬性核心
- 雙手武器依 `handed: 2`／`Locations.Both_Hand` 判定；盾牌欄只顯示占用鏡像，不重複能力。
- 盾牌／副手與雙手武器雙向互斥，舊存檔載入時自動修復。
- 12114～12117 肯貝特持續 20 分鐘，全面覆蓋玩家所有物理傷害；刺客主副手同步。
- 魔法維持技能自身屬性；不使用箭矢、子彈、砲彈、苦無等彈藥消耗或隱藏 ATK。
