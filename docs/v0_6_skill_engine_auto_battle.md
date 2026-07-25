# RO_WEB v0.6 - Skill Engine & Auto Battle Foundation

## 本版目標

v0.6 不是單純新增技能，而是建立可擴充的技能引擎與自動戰鬥基礎。

## 核心規則

### 1. 程式不判斷技能名稱

技能行為由 `data/skills.json` 決定。

主要欄位：

```json
{
  "id": "SM_BASH",
  "officialId": 5,
  "name": "狂擊",
  "skillType": "attack",
  "target": "enemy",
  "spCost": [8,8,8,8,8,15,15,15,15,15],
  "power": [130,160,190,220,250,280,310,340,370,400]
}
```

### 2. skillType 分類

目前使用：

- `passive`：被動技能，學會後自動套用能力。
- `attack`：攻擊技能，可由自動戰鬥在 SP 門檻達成時施放。
- `buff`：Buff 技能，學會後自動出現在 Buff 勾選清單。
- `heal`：治癒技能，可設定 HP 低於多少時使用，且可選施放等級。
- `support`：支援或敵方狀態技能，先資料化，後續再接實際效果。

### 3. 自動戰鬥優先序

每一輪自動戰鬥會依序判斷：

```text
自動喝藥
→ 自動治癒
→ 自動維持 Buff
→ 自動攻擊技能
→ 普攻
```

### 4. 自動喝藥

玩家只需要設定 HP / SP 門檻。

若未指定藥水，系統會自動從背包中尋找可用的 HP / SP 恢復物品。

### 5. 治癒技能

治癒類技能支援：

- HP 低於幾 %
- SP 高於幾 %
- 使用哪個治癒技能
- 施放 Lv 1～目前已學等級

### 6. 攻擊技能

攻擊類技能支援：

- SP 高於幾 %
- 使用哪個攻擊技能
- 施放 Lv 1～目前已學等級

### 7. Buff 技能

只要技能資料符合：

```json
"skillType": "buff"
```

並且玩家已經學會，會自動出現在 Buff 設定區。

玩家勾選後，系統會自動維持 Buff。Buff 不受 SP 百分比門檻限制，但仍需要目前 SP 足夠支付技能消耗。

## 本版新增檔案

- `js/skill_engine.js`
- `js/auto_battle.js`
- `docs/v0_6_skill_engine_auto_battle.md`

## 本版修改檔案

- `data/skills.json`
- `js/battle.js`
- `js/player.js`
- `js/job.js`
- `js/game.js`
- `index.html`
- `css/style.css`

## 暫不處理

- 技能圖片正式素材
- 技能特效動畫
- 地面技能
- 範圍技能完整判定
- 正式治癒公式
- 複雜 Cast / Delay / Cooldown 顯示

以上先留到後續版本擴充。
