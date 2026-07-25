# RO_WEB V0.9.64 - Classic Remaster Alpha

## Skill Path Highlight V2

本版修正 V0.9.62 的箭頭方向問題：

- Hover 目前技能時，紅金路徑仍連接目前技能與前置技能。
- 箭頭頭端改為指向前置技能。
- 用意：提示玩家「要學這招，請先點前一個技能」。

## Skill Icon Remaster Prototype

本版先試作劍士一轉技能 ICON，不正式寫入憲法。

試作原則：

- 參考 RO Classic HD 的方向。
- 保留技能辨識度與清楚剪影。
- 不走過度手遊化、Diablo 化、粒子爆炸風格。
- 狀態效果仍交給 CSS / JS 控制，圖片只負責基礎長相。

## Mobile Battle Layout V2

手機窄螢幕調整：

- 玩家與怪物往畫面中央收。
- 金幣 / 寶石列縮短並移動，避免跑出版面。
- Battle Log 高度縮小。
- 新增 `--battle-offset-x` / `--battle-offset-y` 供後續快速微調。

## 注意

Skill Icon Remaster 與 Mobile Battle Layout V2 仍屬驗證階段，需經實測確認後再決定是否升格為正式憲法規格。
