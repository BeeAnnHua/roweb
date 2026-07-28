const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const index=read('index.html');
const ui=read('js/ui.js');
const css=read('css/style.css');
const quick=read('js/quick_slots.js');
const job=read('js/job.js');
const player=read('js/player.js');
const itemUi=read('js/item_instance_ui.js');
const position=read('js/position_engine.js');
const game=read('js/game.js');

// Three-size cycle: existing UI is Large, then Medium 75%, Small 50%.
assert(ui.includes('const RO_UI_SIZE_ORDER = ["large", "medium", "small"]'),'Size cycle order missing');
assert(ui.includes('const RO_UI_SIZE_LABELS = { large: "大", medium: "中", small: "小" }'),'Chinese size labels missing');
assert(ui.includes('target.style.zoom = size === "medium" ? "0.75" : (size === "small" ? "0.5" : "1")'),'100/75/50 zoom contract missing');
assert(ui.includes('document.querySelectorAll(".game-window, .ui-size-target")'),'All game windows/modal targets must be enrolled');
assert(ui.includes('player.uiWindowSizes ='),'Player save persistence missing');
assert(player.includes('player.uiWindowSizes = getPlainPlayerObject(player.uiWindowSizes);'),'Save normalization for window sizes missing');
assert(css.includes('.window-size-cycle'),'Size cycle button CSS missing');
assert(ui.includes('button.classList.add("is-floating-size-control")'),'Headerless-window size control fallback missing');
assert(css.includes('.game-window .window-title .window-size-cycle') && css.includes('.is-floating-size-control'),'Size control alignment rules missing');
assert(index.includes('class="item-detail-card ui-size-target"') && index.includes('class="skill-detail-card ui-size-target"'),'Detail modals must support size cycle');

// Save tools are inside system log toolbar and no longer below/over the hotbar.
assert(index.includes('class="battle-log-toolbar"'),'System log toolbar missing');
assert(index.includes('class="battle-log-save-actions"'),'Save action group missing');
assert(index.includes('onclick="saveGame()"') && index.includes('onclick="resetGameSave()"'),'Save/reset buttons missing');
assert(!index.includes('class="dev-buttons"'),'Old bottom save controls must be removed');
assert(css.includes('#battle-log-list { padding-top: 31px'),'Chat content must clear toolbar');

// Current city/region appears above coordinate.
assert(position.includes('<span class="location-name">目前位置</span>'),'Location label DOM missing');
assert(position.includes('location.textContent = city?.displayName || city?.name || currentMap?.displayName || currentMap?.name || "未知地區";'),'Location update missing');
assert(css.includes('grid-template-areas: "location location" "label value"'),'Location-above-coordinate layout missing');

// Mobile/coarse pointers do not rely on drag. PC can retain drag.
assert(player.includes('slot.draggable = !mobileUi;'),'Inventory mobile drag disable missing');
assert(job.match(/draggable = !\(\(typeof isMobileViewport/g)?.length >= 2,'Skill mobile drag disable missing');
assert(quick.includes('renderQuickSlotPicker'),'Click-to-assign picker missing');
assert(quick.includes('QUICK_SLOT_LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]'),'1-0 labels missing');
assert(quick.includes('被動技能不能放入快捷欄'),'Passive skill guard missing');
assert(quick.includes('學會此技能後才能放入快捷欄'),'Unlearned skill guard missing');
assert(quick.includes('count,\n      className: `potion${count <= 0 ? " is-unavailable" : ""}`'),'Zero-count consumable shortcut retention missing');
assert(index.includes('id="skill-detail-quick-picker"') && index.includes('id="item-detail-quick-picker"'),'Skill/item picker containers missing');

// Equipment detail supports equip/unequip under the close area.
assert(index.includes('id="item-detail-primary-action"'),'Item primary action button missing');
assert(itemUi.includes("primary.textContent = '穿戴'") && itemUi.includes("primary.textContent = '卸下'"),'Equip/unequip actions missing');
assert(itemUi.includes('const check = canEquipItem(data);'),'Equipment restriction check missing');
assert(css.includes('.item-detail-primary-action'),'Equipment action layout missing');

assert(game.includes('const RO_WEB_VERSION = "0.9.82FH";'),'Runtime version must be FH');
assert([...index.matchAll(/\?v=([^"']+)/g)].every(m=>m[1]==='0.9.82FH'),'All cache keys must be FH');
console.log(JSON.stringify({version:'0.9.82FH',status:'PASS',windowSizes:['100%','75%','50%'],clickQuickSlots:true,equipAction:true,locationHeader:true},null,2));
