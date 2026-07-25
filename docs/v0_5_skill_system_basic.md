# RO_WEB v0.5 Skill System Basic

## 版本目標

v0.5 先建立技能系統基礎，不追求技能圖片與完整戰鬥效果。

本版重點：

- 技能資料參考官方 DB / skill_tree 結構
- 技能圖片先以文字格代替
- 技能點顯示在技能欄底部
- 技能可用 `+` 按鈕升級
- 支援技能前置需求
- 支援一轉劍士技能
- 支援二轉騎士技能架構

## 技能點規則

目前 RO_WEB 第一階段設定：

- 初學者 Job 1~10 使用「冒險者修練」，不消耗技能點
- 一轉 / 二轉每個 Job 等級給 1 點技能點
- 新職業 Job Lv 1 起始給 1 點，Job Lv 50 滿等共 50 點
- 技能點顯示在技能欄底部

## 技能圖片規則

v0.5 不要求正式技能圖片。

目前 UI 使用：

- `iconText` 顯示文字，例如 `狂`、`劍`、`霸`
- 之後補圖時可以改為 `images/skills/<skill>.webp`

## 官方技能資料方向

v0.5 先參考 `db/re/skill_tree.yml`：

- Swordman：SM_SWORD、SM_TWOHAND、SM_RECOVERY、SM_BASH、SM_PROVOKE、SM_MAGNUM、SM_ENDURE...
- Knight：KN_SPEARMASTERY、KN_PIERCE、KN_RIDING、KN_TWOHANDQUICKEN...

技能效果在後續版本再接入戰鬥。

## 下一步建議

v0.6 可以開始做：

- 主動技能放入快捷欄
- 狂擊造成較高傷害
- Buff 技能可勾選自動維持
- SP 消耗與技能冷卻
