# RO_WEB V0.9.78AI - Inventory CSS Purge

## 更新重點

- 背包 CSS 進入 Purge / Hard Lock。
- 背包只保留一套骨架：Header / Tabs / Grid / Footer。
- 強制封鎖舊版 nth-child 固定座標。
- 強制封鎖舊版 absolute / left / top 對背包格子的影響。
- 手機版不再改 grid 結構，只調整視窗縮放。
- `.inventory-body`、`#inventory-panel`、`#inventory-list.inventory-slot-grid`、`.inventory-action-row` 統一解除裁切。
- `applyInventorySlotPosition()` 改成只清除 inline style，不再保留舊座標表。

## 測試重點

1. 電腦版背包 5 x 8 是否完整顯示。
2. 手機版背包是否不再只露左邊一條。
3. 整理 / 分解 / 鎖定 是否固定在格子下方。
4. 消耗 / 裝備 / 道具切換後是否仍維持同一套 grid。
