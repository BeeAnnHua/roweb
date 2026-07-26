# RO_WEB 0.9.82FX

本版本以 **0.9.82FW** 為基準，將卡片、裝備與 Combo 效果正式統一到同一套 Runtime，避免資料說明存在、實戰卻沒有套用。

## 本版重點

- 910 張卡片、141 件啟用裝備 Script、784 組 Combo 共用 `CardRuntime + EffectRuntime`。
- 現有資料使用的 142 種 rAthena bonus 指令皆有解析與實際消費端，涵蓋：
  - 最終六圍／特性素質、ATK／MATK、DEF／MDEF、HIT／FLEE／CRI、ASPD、MaxHP／MaxSP。
  - 自然恢復、補品／指定物品／物品群組恢復、治療量與週期恢復。
  - 種族／屬性／體型／Boss／武器類型／技能傷害與減傷、破防、命中、暴擊、反射。
  - 技能 SP 成本、詠唱、延遲、冷卻、擊退、授予技能與移動政策。
  - 自動施法、autobonus、異常狀態、吸血吸魔、破壞、昏迷死亡、擊殺恢復、EXP、Zeny 與額外掉落。
- 未來新增物品只要使用已支援的 Script 指令，會由 Dynamic Script Fallback 自動進入同一管線，不必再為每件物品手寫 Runtime。
- 未支援的新指令會被 diagnostics 與發行稽核攔下，不會再默默消失。
- `active_transform` 變身效果接入畫面 Runtime：7 個 ID 有精確怪物 Atlas；其餘 13 個因來源素材不存在，使用明顯可見的替代特效。
- 保留 FW 的監視者卡片、急速衝刺鎧甲、恢復系統與四轉 HP／SP 公式修正，以及 FV 的插卡／拆卡和掛機資源 15 秒防卡死。

請以 HTTP 伺服器啟動，避免瀏覽器直接開啟檔案造成 CORS 問題。Windows 可執行 `START_RO_WEB.bat`。
