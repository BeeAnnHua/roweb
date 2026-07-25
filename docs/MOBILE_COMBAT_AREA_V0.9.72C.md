# RO_WEB V0.9.72c Mobile Combat Area + Shop Scroll Fix

## 目標
依照 iPhone Safari 實測截圖，修正手機直式可行走範圍、商店購買窗滾動與金幣列完整數量顯示。

## 主要修正
- 手機直式可行走範圍改為接近實測紅框：避開左上角色卡、右上按鈕、底部戰鬥紀錄與快捷欄。
- Position Engine 手機邊界集中在 `getDynamicPositionBounds()`，避免散落硬寫座標。
- 商店視窗加入內層穩定滾動，避免 iOS Safari 回彈後無法點選底部商品或購買按鈕。
- 點擊上方金幣列可顯示完整 Zeny / 藍寶石 / 紅寶石數量。

## 後續可調參數
- `POSITION_MOBILE_SAFE.left`
- `POSITION_MOBILE_SAFE.topPortrait`
- `POSITION_MOBILE_SAFE.rightPortrait`
- `POSITION_MOBILE_SAFE.bottom`

以上只影響手機/窄螢幕邊界，PC 版仍維持原本 1280x720 手感。
