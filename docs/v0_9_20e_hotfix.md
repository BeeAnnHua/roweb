# RO_WEB V0.9.20e Hotfix

- 修正背包格子仍被舊版 absolute / nth-child 座標影響，導致 grid 間距與位置異常。
- 背包 5×8 改回真正 CSS Grid：密集排列、上下左右 gap 一致。
- 移除背包 grid 的 transform 位移，避免 scrollbar / 底部按鈕與格子區不同步。
- 裝備欄 X 再往右 10px。
