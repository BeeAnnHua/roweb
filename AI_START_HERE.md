# RO_WEB 0.9.82IA

最新正式基準：Renewal 詠唱／延遲完整校正。

- 變動詠唱唯一公式：`remaining = 1 - sqrt((DEX×2+INT)/530)`，最低為 0；使用最終 DEX／INT。
- 固定詠唱不受 DEX／INT 影響；通用百分比取最強值，同技能專屬百分比先合併成候選值，再與通用／狀態候選取最高；固定毫秒依腳本加減。
- 技能後延遲是共通延遲；獨立冷卻只鎖同一技能；兩者不可混用。
- 八招連技套用 rAthena `max(0,(DB delay 或 1000)-4×AGI-2×DEX)`。
- 所有攻擊技能仍保留 140ms 最小實際施放間隔，但不會縮短較長的原始詠唱、後延遲、冷卻或 ASPD 動作鎖。
- 技能詳細視窗顯示目前裝備／卡片／附魔／Buff 後的實際時序。
- HZ `ModifierKeyRuntime`、HY `ItemBatchOpenRuntime` 與 HX 耐久存檔完整保留。
- 後續版本一律以 0.9.82IA 為基準。
