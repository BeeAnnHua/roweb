# RO_WEB Runtime 批次遷移政策（0.9.80ZN）

- `runtime_formula_catalog.json`：1139 個玩家技能的完整遷移索引。
- `runtime_pending_review.json`：尚未實作、多人/雙人或特殊系統技能的查詢清單。
- 自動分類只代表建議 Handler，不代表公式已完成。
- 只有 `runtime_core_1_v1.json` 等已驗證 Profile 能執行。
- 多人技能可暫時改為自身效果，但必須標成 `self_only_override`；無合理替代時保持 `pending`。
- 不使用 SPR/ACT；未來特效仍為 `SkillID.png + SkillID.json`。
