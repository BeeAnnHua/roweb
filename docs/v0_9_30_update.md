# RO_WEB V0.9.30 Update

Gameplay Phase 第一波。

## 更新項目
- HP / SP / Base EXP / Job EXP 條改為依目前值浮動，不再永遠滿格。
- 上方 Zeny / 藍寶石 / 紅寶石資源列改為 CSS 元件，移除整張 UI 圖依賴。
- 新增 HP / SP 自然恢復系統，依 VIT / INT 影響恢復量，受到攻擊後短暫延遲恢復。
- 新增 HIT / FLEE 命中判定，玩家與怪物攻擊都可能 Miss。
- 快捷鍵 1-0 與自動戰鬥普攻 / 攻擊技能同步 ASPD 冷卻，不再能鍵盤連按超速攻擊。

## 備註
- ASPD 公式先用 RO_WEB 初版近似：150 ASPD 約 2 秒一擊，190 ASPD 約 0.2 秒一擊。
- 自然恢復公式先保留簡化版，後續可接 rAthena 公式、坐下、裝備與 BUFF。
