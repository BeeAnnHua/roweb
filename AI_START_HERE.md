## 0.9.82HR — 最新正式基準

- 後續版本以 0.9.82HR 為基準，完整保留 HQ 消耗品 Runtime、馬牌、自動掛機、防回檔存檔與箱子裝備效果。
- 稀有物品公告唯一權威為 `window.RareItemAnnouncementRuntime`；不得再為轉蛋、BOX 或怪物掉落各自建立不同門檻。
- 門檻固定：最終實際機率 ≤1% 紅、≤0.1% 紫、≤0.01% 金；高於 1% 不公告。
- 加權池必須用相同 Item ID 的總權重計算物品機率，不能只看被抽中的單一資料列。
- 升階材料唯一有效機率為 `server.rates.gradeMaterialDropChanceBasisPoints=500`；不得套用 `drop`、`mapExclusiveDrop` 或 `gradeMaterialDropRate`。
- 舊 `MvpGachaRuntime.showRareBanner()` 只保留相容橋接，實際 UI 由全域 Runtime 管理。

## 0.9.82HP — 正式物品圖歷史基準

- 以 0.9.82HO 為基準，完整保留 RA 經典箱子、HN 耐久存檔、倍率 10000 與未來後端 Adapter。
- `images/items/<ID>.webp` 必須優先使用 `RO_WEB專案資料/items/<ID>.webp` 的同 ID 正式圖。
- 已補入專案實際物品與 ItemBox 獎池缺少的 1,480 張圖示；三個 RA 經典箱子 1,081 種獎品圖示覆蓋率為 100%。
- Item 500054 原錯誤長條圖已替換為正式物品圖。
- 1100100 是 RO_WEB 自訂黯淡冰晶武器箱 ID；官方圖庫沒有同 ID，唯一允許的明確例外為內容等同官方 101638 圖示。
- 0.9.82HP 的正式物品圖規則由後續版本完整保留。

## 0.9.82HO — 前一版基準

- 以 0.9.82HN 為基準，完整保留耐久存檔、IndexedDB 鏡像、多分頁防覆蓋與未來後端 Adapter。
- 新增禮物箱（644）、神秘箱子（603）、神秘紫箱（617）正式開箱功能，沿用 `ItemBoxRuntime` 與黯淡冰晶武器箱同一入口。
- 三箱獎池必須直接取 rAthena Renewal 2026-06-08 `db/re/item_group_db.yml` 的 GIFTBOX／BLUEBOX／VIOLETBOX Rate 權重，不得人工等機率化。
- Runtime 不得因獎勵物品資料缺失而先過濾該列、重新計算分母；若選中資料缺失的獎勵，必須不消耗箱子並顯示錯誤。
- 禮物箱抽到禮物箱、神秘紫箱抽到神秘紫箱時，只把箱子放回背包，不可遞迴自動連開。
- 新增箱子與獎池物品後必須同步更新 `data/items/item_index.json`、`database_manifest.json` 與重建 `js/data_bundle.js`。
- 0.9.82HO 的箱子資料與機率規則由後續版本完整保留。

## 0.9.82HN — 前一版基準

- 以 0.9.82HM 為基準，完整保留右上貨幣列原地展開／收合。
- 存檔格式升級為 `ro_web_player_save_v2`，但保留原 `SAVE_KEY`，舊玩家可直接原地遷移。
- 任何後續改動不得繞過 `saveGame()`／`requestGameSave()`／`ROWebSaveManager` 另建互相衝突的角色存檔。
- 載入候選必須依 `saveVersion`、`savedAt` 與 checksum 選最新有效資料，不得恢復「主檔能解析就固定優先」的舊規則。
- localStorage 是同步主檔與安全備份；IndexedDB 是耐久鏡像；未來後端只能透過 `registerRemoteAdapter()` 接入。
- 多分頁規則為最新分頁接管寫入，舊分頁禁止覆蓋。
- 清除角色或全部資料時必須同時清除 localStorage 角色鍵與 IndexedDB 玩家存檔。
- 目前倍率：`baseExp/jobExp/drop/zeny/cardDrop/mapExclusiveDrop/gradeMaterialDropRate = 10000`；修改 JSON 後必須重建 `js/data_bundle.js`。
- 後續版本以 0.9.82HN 為基準。

## 0.9.82HM — 歷史基準

- 以 0.9.82HL 為基準；完整保留背包／裝備 Tooltip、一般裝備附魔石介紹、HH 附魔存活實例交易修正與 HJ 正式玩家介面。
- 右上貨幣列不再開啟額外浮窗，改為直接在原本 `#top-bar` 內原地展開／收合。
- 收合時維持三格精簡顯示；點擊整個貨幣列後改為三列完整顯示 Zeny、藍寶石、紅寶石，再點一次或點擊外部即可收合。
- 貨幣展開採 document capture `pointerup`／`click`、`index.html` inline onclick 與鍵盤 Enter／Space 三重入口，避免早期 HUD handler 攔截。
- 完整數字使用獨立 `.currency-expanded-value`，不受 `updatePlayerUI()` 重繪精簡數字影響；滑鼠提示仍保留。
- Escape 可收合；手機觸控與桌機滑鼠使用同一套原地展開流程。
- 不得重新帶回 0.9.82HI 的出生測試補給與 10 億 Zeny 自動補足。
- 歷史報告續寫至 `HISTORY_UPDATE_AUDIT_LOG_THROUGH_0.9.82HL.txt`；根目錄只保留 HM 最新必要報告。
- 後續版本以 0.9.82HM 為基準。
