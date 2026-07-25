# RO_WEB V0.9.72b Mobile Bounds Fix

## 目標
修正 V0.9.72a 在 iPhone 直式螢幕可移動後出現的邊界與座標問題。

## 更新內容
- Position Engine 新增手機動態可行走區。
- 桌機保留原本 1280x720 手感。
- 手機依 `battle-field` 實際尺寸計算可行走區。
- 玩家與怪物座標都會被限制在安全邊界內。
- 右側功能按鈕區與底部戰鬥紀錄/快捷欄區域納入安全邊界參考。
- `resize` / `orientationchange` 時會重新校正角色與怪物位置。

## 設計原則
這版只修手機邊界與可走區，不改 Position Combat 的核心規則、不改射程、不改傷害。
