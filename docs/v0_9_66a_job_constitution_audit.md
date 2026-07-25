# V0.9.66a Job Constitution Audit

本版依使用者決定版補強 Job Engine Constitution。

## 已確認並寫入

- 任何一般轉職、轉生後轉職、未來三轉/四轉，只要剩餘技能點數 > 0，皆不可轉職。
- 尚有暫存技能配點未確認時，不可轉職。
- 轉生前剩餘素質點不會影響轉生後點數。
- 轉生後固定六圍歸 1，原剩餘素質點不保留，固定給 125 點素質點。
- 手推車、獵鷹為已知需解除項目；坐騎、狼、龍、機甲、傭兵、召喚物保留為憲法預留檢查。

## 專案入口 / RA 開機資料抽查

已抽查 `RO_WEB專案資料.zip` 內 rAthena 資料，找到相近規則參考：

- `npc/events/event_skill_reset.txt` 有「需要用完技能點」文字。
- 同檔也檢查 `checkfalcon()`、`checkcart()`、`checkriding()`，作為特殊系統需解除的參考。

## 待使用者確認

- 三轉 Job 上限目前不寫死。
- 四轉條件與 Job 上限目前不寫死，維持 `pending_confirm`。
- 轉生系統本體目前仍為 `reserved`，本版只先把憲法與防呆邏輯寫好。
