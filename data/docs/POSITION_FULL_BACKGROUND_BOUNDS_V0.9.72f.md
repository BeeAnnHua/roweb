# RO_WEB V0.9.72f - Full Background Bounds + Accurate UI Fade

## 決定版規則

- 玩家可走範圍 = `#battle-field` 整個背景框。
- 怪物出生與追擊範圍 = `#battle-field` 整個背景框。
- 玩家 / 怪物座標 = 腳底中心點。
- 人物圖片本體不參與可走邊界計算。
- UI 不阻擋移動；當腳底 1 Cell 判定框進入 UI 實際 DOM 矩形時，該 UI `opacity = 0.3`。
- 離開後 UI 恢復 `opacity = 1`。

## 修正原因

0.9.72e 仍可能受到舊版 safe bounds 或放大 UI Fade 半徑影響，導致：

- 往右 / 往下仍感覺走不到完整背景。
- 右側 / 下方 UI 在角色很遠時就透明。
- 左側 / 上方 UI 沒有用同一套判定。

0.9.72f 將邊界與 UI Fade 判定集中回 Position Engine。
