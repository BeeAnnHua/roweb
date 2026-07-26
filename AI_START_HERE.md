# 0.9.82FW CURRENT RUNTIME
目前正式版本：**0.9.82FW**。  
基準為 0.9.82FV；不得回退 FV 的完整卡片、插卡／拆卡、ITEM 圖示同步與掛機資源不足 15 秒防卡死。

## FW 新增契約
- `js/card_runtime.js` 同時負責卡片、Combo 與目前啟用裝備 Script 的編譯結果；裝備 Script 主資料為 `data/card_runtime/equipment_effects.json`。
- 能力值顯示與戰鬥公式必須讀取同一份 `calculateDerivedPlayerStats()`；不得只在面板顯示 Job Bonus。
- `bHPrecovRate`／`bSPrecovRate` 分別統一為 `hpRecoveryRate`／`spRecoveryRate`；補品恢復必須帶入實際 itemData，才能套用指定物品與物品群組效果。
- 四轉 BaseHP／BaseSP 以 `data/job_basepoints.json` 內 RA 計算表為準，不得退回初心者 fallback。
- rAthena `JOBL_UPPER` 與主要四轉 MaxHP／MaxSP 的 1.25 倍係數必須保留。
- 監視者卡片 4392 以基本 VIT 每 18 點提供 DEX，最後總能力值取整數。
