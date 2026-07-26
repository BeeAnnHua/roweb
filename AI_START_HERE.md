# 0.9.82FY CURRENT RUNTIME
目前正式版本：**0.9.82FY**。  
基準為 0.9.82FX；不得回退 FX 的卡片／裝備／Combo 統一效果 Runtime，亦不得回退 FV/FW 的插卡／拆卡、ITEM 圖示、掛機資源不足 15 秒防卡死與四轉 BaseHP／BaseSP 修正。

## FY UI 效能契約
- `updatePlayerUI()` 只負責高頻 HUD 更新；不得再於每次攻擊、扣血、回復或 EXP 變化時無條件重建素質、進階屬性、技能或職業視窗。
- `status-window` 關閉時，必須取消待處理的素質更新，背景不得建立 `status-advanced-panel` DOM。
- 進階屬性只在角色衍生值、裝備實例／卡片、Buff 或頁籤／展開狀態真正改變時更新。
- 進階屬性滾動期間必須延後重繪，並保留 `scrollTop` 與所有 `<details>` 展開狀態。
- 技能欄與職業欄隱藏時不得重建；由 `ui.js` 在視窗開啟時立即刷新。
- 快捷欄必須使用內容簽章跳過相同內容的 DOM 重建。
- 手機／觸控環境不得對持續動畫的世界背景套用 UI `backdrop-filter`；進階屬性面板全平台禁用背景模糊。

## FX 統一效果契約
- `js/card_runtime.js` 是 rAthena 裝備／卡片／Combo Script 的唯一解析與事件執行入口；`js/effect_runtime.js` 是人物素質、戰鬥、恢復、技能時序與政策效果的共用來源入口。
- 現有資料使用的 **142 種 rAthena bonus 指令**全部有解析器與實際消費端；910 張卡片、141 件啟用裝備 Script、784 組 Combo 共用同一套 Runtime。
- 新增裝備或卡片只要在主資料提供 `scriptRaw`、`Script`、`script`、`equipScript` 或 `compiledScript`，即可由 Dynamic Script Fallback 進入統一管線。
- 遇到未支援的新指令不得忽略：Runtime 必須記錄 diagnostics、console error，完整性測試與發行稽核必須失敗。
- 最終能力值及素質面板只讀取 `calculateDerivedPlayerStats()`；卡片、裝備、Combo、被動技能與 Buff 不得建立分離計算副本。
