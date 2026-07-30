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
