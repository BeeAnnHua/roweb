# 0.9.82FX CURRENT RUNTIME
目前正式版本：**0.9.82FX**。  
基準為 0.9.82FW；不得回退 FV/FW 的完整卡片、插卡／拆卡、ITEM 圖示、掛機資源不足 15 秒防卡死，以及四轉 BaseHP／BaseSP 修正。

## FX 統一效果契約
- `js/card_runtime.js` 是 rAthena 裝備／卡片／Combo Script 的唯一解析與事件執行入口；`js/effect_runtime.js` 是人物素質、戰鬥、恢復、技能時序與政策效果的共用來源入口。
- 現有資料使用的 **142 種 rAthena bonus 指令**全部有解析器與實際消費端；910 張卡片、141 件啟用裝備 Script、784 組 Combo 共用同一套 Runtime。
- 新增裝備或卡片只要在主資料提供 `scriptRaw`、`Script`、`script`、`equipScript` 或 `compiledScript`，即使尚未重建 generated effects，也會由 Dynamic Script Fallback 即時編譯並套入統一管線。
- 遇到未支援的新指令不得忽略：Runtime 必須記錄 diagnostics、console error，完整性測試與發行稽核必須失敗，直到新增解析器與實際消費端。
- 最終能力值及素質面板只讀取 `calculateDerivedPlayerStats()`；卡片、裝備、Combo、被動技能與 Buff 不得建立互相分離的計算副本。
- HP／SP 自然恢復、補品、指定物品、物品群組、治療量、週期恢復與禁止恢復均必須走同一效果來源。
- 普攻、主動傷害技能、受擊、擊殺、EXP、額外掉落、自動施法、autobonus、異常狀態、吸血吸魔、反射、破壞與變身效果均由事件 Hook 實際消費。
- `bNoGemStone`、`bNoMadoFuel`、`bNoCastCancel` 在現行 RO_WEB 規則下屬於政策上已滿足的效果：技能材料與魔導燃料本來不消耗，且目前沒有受擊中斷詠唱機制。
- `active_transform` 共 20 個怪物 ID；7 個使用本地精確 Atlas，缺少來源素材的 13 個使用可見色調＋標籤替代，不得靜默無效果。
