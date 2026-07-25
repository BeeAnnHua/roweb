# RO_WEB V0.9.59 Auto UI Scale

## 目的
建立 UI 總縮放閥門，讓 1280x720 PC 主畫布保持穩定，同時讓手機與小解析度至少可玩。

## 規則
- 背景戰鬥區與左上角人物資訊不縮放。
- 其他 UI 視窗 / 快捷按鈕 / 對話與操作列統一吃 `--ui-scale`。
- 透過 media query 依解析度自動切換縮放比例。
- 手機版採 Mobile Playable Mode，不做完整 RWD。
- 音效 / sound / audio 架構暫時不預留。

## 快取
本版 HTML 資源引用版本：`?v=0.9.59`。
