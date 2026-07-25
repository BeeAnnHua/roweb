# 圖片格式與尺寸整理報告

## 採用規則

- 地圖背景：WEBP，1280×720。
- 怪物戰鬥圖：PNG，128×128，保留透明 alpha。
- 技能圖示：WEBP，128×128，保留透明 alpha。
- UI 小按鈕 / 圖示：PNG，保留透明 alpha。
- 大型完整矩形面板：WEBP，縮到約 800px 寬，減少載入量。
- 需要透明外框的面板：PNG，保留 alpha 並縮小。

## 目前檔案清單

| 檔案 | 尺寸 | 格式 | 透明 | 大小 |
|---|---:|---|---|---:|
| `images/backgrounds/prontera.webp` | 1280×720 | WEBP | no | 191.2 KB |
| `images/backgrounds/prontera_south.webp` | 1280×720 | WEBP | no | 196.8 KB |
| `images/monsters/fabre_hit.png` | 128×128 | PNG | yes | 30.5 KB |
| `images/monsters/fabre_normal.png` | 128×128 | PNG | yes | 31.2 KB |
| `images/monsters/lunatic_hit.png` | 128×128 | PNG | yes | 29.2 KB |
| `images/monsters/lunatic_normal.png` | 128×128 | PNG | yes | 30.2 KB |
| `images/monsters/poring_hit.png` | 128×128 | PNG | yes | 20.0 KB |
| `images/monsters/poring_normal.png` | 128×128 | PNG | yes | 19.8 KB |
| `images/skills/knight/attack_speed_boost.webp` | 128×128 | WEBP | yes | 6.7 KB |
| `images/skills/knight/aura_blade.webp` | 128×128 | WEBP | yes | 5.9 KB |
| `images/skills/knight/bash.webp` | 128×128 | WEBP | yes | 6.4 KB |
| `images/skills/knight/berserk.webp` | 128×128 | WEBP | yes | 6.2 KB |
| `images/skills/knight/endure.webp` | 128×128 | WEBP | yes | 5.4 KB |
| `images/skills/knight/hp_recovery.webp` | 128×128 | WEBP | yes | 5.4 KB |
| `images/skills/knight/magic_sword.webp` | 128×128 | WEBP | yes | 6.2 KB |
| `images/skills/knight/pierce.webp` | 128×128 | WEBP | yes | 6.5 KB |
| `images/skills/knight/riding_training.webp` | 128×128 | WEBP | yes | 6.4 KB |
| `images/skills/knight/spiral_pierce.webp` | 128×128 | WEBP | yes | 6.4 KB |
| `images/ui/buttons/auto_battle_button_active.png` | 114×42 | PNG | yes | 10.9 KB |
| `images/ui/buttons/auto_battle_button_normal.png` | 114×42 | PNG | yes | 10.0 KB |
| `images/ui/buttons/btn_arrow_down.png` | 64×64 | PNG | yes | 8.5 KB |
| `images/ui/buttons/btn_close.png` | 64×64 | PNG | yes | 8.4 KB |
| `images/ui/buttons/btn_close_round.png` | 64×64 | PNG | yes | 8.5 KB |
| `images/ui/buttons/btn_decompose.png` | 130×62 | PNG | yes | 15.6 KB |
| `images/ui/buttons/btn_detail_active.png` | 228×75 | PNG | yes | 30.9 KB |
| `images/ui/buttons/btn_detail_normal.png` | 228×75 | PNG | yes | 24.6 KB |
| `images/ui/buttons/btn_lock.png` | 130×62 | PNG | yes | 15.6 KB |
| `images/ui/buttons/btn_page_next.png` | 64×64 | PNG | yes | 8.4 KB |
| `images/ui/buttons/btn_page_prev.png` | 64×64 | PNG | yes | 8.2 KB |
| `images/ui/buttons/btn_skill_close.png` | 129×128 | PNG | yes | 32.9 KB |
| `images/ui/buttons/btn_skill_plus.png` | 128×128 | PNG | yes | 27.3 KB |
| `images/ui/buttons/btn_sort.png` | 130×62 | PNG | yes | 15.6 KB |
| `images/ui/buttons/btn_world_map.png` | 293×34 | PNG | yes | 8.9 KB |
| `images/ui/buttons/tab_consume_active.png` | 214×72 | PNG | yes | 26.3 KB |
| `images/ui/buttons/tab_consume_normal.png` | 214×72 | PNG | yes | 20.3 KB |
| `images/ui/buttons/tab_costume_active.png` | 214×80 | PNG | yes | 27.9 KB |
| `images/ui/buttons/tab_costume_normal.png` | 214×80 | PNG | yes | 23.1 KB |
| `images/ui/buttons/tab_equipment_active.png` | 214×72 | PNG | yes | 24.8 KB |
| `images/ui/buttons/tab_equipment_normal.png` | 214×72 | PNG | yes | 20.8 KB |
| `images/ui/buttons/tab_item_active.png` | 214×72 | PNG | yes | 25.6 KB |
| `images/ui/buttons/tab_item_normal.png` | 214×72 | PNG | yes | 21.9 KB |
| `images/ui/buttons/tab_job1_active.png` | 193×37 | PNG | yes | 13.9 KB |
| `images/ui/buttons/tab_job1_normal.png` | 193×37 | PNG | yes | 11.5 KB |
| `images/ui/buttons/tab_job2_active.png` | 193×37 | PNG | yes | 11.7 KB |
| `images/ui/buttons/tab_job2_normal.png` | 193×37 | PNG | yes | 9.9 KB |
| `images/ui/buttons/tab_job3_active.png` | 193×37 | PNG | yes | 13.7 KB |
| `images/ui/buttons/tab_job3_normal.png` | 193×37 | PNG | yes | 11.0 KB |
| `images/ui/buttons/tab_title_active.png` | 214×80 | PNG | yes | 28.8 KB |
| `images/ui/buttons/tab_title_normal.png` | 214×80 | PNG | yes | 23.9 KB |
| `images/ui/icons/icon_blue_gem.png` | 128×128 | PNG | yes | 18.7 KB |
| `images/ui/icons/icon_blue_gem_128.png` | 128×128 | PNG | yes | 18.7 KB |
| `images/ui/icons/icon_blue_gem_256.png` | 256×256 | PNG | yes | 60.5 KB |
| `images/ui/icons/icon_blue_gem_64.png` | 64×64 | PNG | yes | 5.6 KB |
| `images/ui/icons/icon_blue_gem_96.png` | 96×96 | PNG | yes | 11.4 KB |
| `images/ui/icons/icon_gold.png` | 128×128 | PNG | yes | 30.7 KB |
| `images/ui/icons/icon_gold_128.png` | 128×128 | PNG | yes | 30.7 KB |
| `images/ui/icons/icon_gold_256.png` | 256×256 | PNG | yes | 110.7 KB |
| `images/ui/icons/icon_gold_64.png` | 64×64 | PNG | yes | 8.2 KB |
| `images/ui/icons/icon_gold_96.png` | 96×96 | PNG | yes | 17.7 KB |
| `images/ui/icons/icon_red_gem.png` | 128×128 | PNG | yes | 19.5 KB |
| `images/ui/icons/icon_red_gem_128.png` | 128×128 | PNG | yes | 19.5 KB |
| `images/ui/icons/icon_red_gem_256.png` | 256×256 | PNG | yes | 62.7 KB |
| `images/ui/icons/icon_red_gem_64.png` | 64×64 | PNG | yes | 5.8 KB |
| `images/ui/icons/icon_red_gem_96.png` | 96×96 | PNG | yes | 11.9 KB |
| `images/ui/panels/character_panel.webp` | 800×527 | WEBP | no | 27.4 KB |
| `images/ui/panels/costume_panel.webp` | 800×600 | WEBP | no | 27.1 KB |
| `images/ui/panels/dialog_panel.png` | 1010×208 | PNG | yes | 204.7 KB |
| `images/ui/panels/equipment_panel.webp` | 800×600 | WEBP | no | 26.3 KB |
| `images/ui/panels/inventory_panel.png` | 461×719 | PNG | yes | 411.6 KB |
| `images/ui/panels/map_panel.png` | 597×466 | PNG | yes | 181.0 KB |
| `images/ui/panels/skill_panel.png` | 550×710 | PNG | yes | 498.8 KB |
| `images/ui/panels/skillbar.png` | 600×72 | PNG | yes | 41.6 KB |
| `images/ui/panels/status_panel.webp` | 800×450 | WEBP | no | 20.8 KB |
| `images/ui/panels/title_panel.webp` | 800×600 | WEBP | no | 11.1 KB |
| `images/ui/panels/top_currency_bar_empty.png` | 1008×128 | PNG | yes | 144.9 KB |