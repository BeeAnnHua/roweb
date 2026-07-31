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
