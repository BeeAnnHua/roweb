# RO_WEB V0.9.64b - Skill Tree Complete + Mobile Layout v3 + UX Fix

## Skill Tree Complete
- 保留初心者與劍士一轉技能流程。
- 技能 Hover、技能介紹、技能點數、前置判斷與待確認配點流程維持完整。

## Skill Path V2
- Hover 有前置技能時，紅金線會由目前技能一路回指所有前置技能。
- 支援多層前置路徑，例如目前技能 → 前置技能 → 更上游前置技能。
- 前置節點使用粗框高亮，避免被可學習 Glow 吃掉。

## Mobile Battle Layout v3
- 人物與怪物往手機可視戰鬥中心收。
- Top UI / 金幣列置中保護。
- Battle Log 與快捷列底部位置修正，避免跑出可視範圍。
- PC 版維持原布局，不受手機規則影響。

## UI Drag Bug Fix
- 修正 CSS zoom / --ui-scale 下拖曳視窗第一下會跳向左上角的問題。
- 拖曳座標改為依縮放倍率換算 offsetX / offsetY。

## Shop Polish
- 商店彈窗維持固定高度。
- 商品列表、商品介紹與購買區保持內部 scrollbar。
- 壓縮多餘 padding 與底部留白。

## Cache
- HTML / CSS / JS cache version updated to `?v=0.9.64b`.
