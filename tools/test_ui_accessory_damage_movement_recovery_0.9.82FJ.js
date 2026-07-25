const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const playerJs=read('js/player.js');
const itemUi=read('js/item_instance_ui.js');
const ui=read('js/ui.js');
const css=read('css/style.css');
const position=read('js/position_engine.js');
const battle=read('js/battle.js');
const quick=read('js/quick_slots.js');
const skill=read('js/skill_engine.js');
const pipeline=read('js/combat_damage_pipeline.js');
const index=read('index.html');

// Accessories are driven by rAthena Locations, even when legacy slot is absent.
assert(playerJs.includes('if (locations.Both_Accessory) { add("accessory1"); add("accessory2"); }'),'Both_Accessory mapping missing');
assert(playerJs.includes('const empty = accessoryCandidates.find(slot => !player?.equipment?.[slot]);'),'Empty accessory side selection missing');
assert(playerJs.includes('const slotCandidates = getItemEquipmentSlotCandidates(itemData);'),'Legacy equip flow still rejects slotless RA accessories');
assert(itemUi.includes('const slot = resolveEquipmentTargetSlot(itemData);'),'Instance equip flow must use shared slot resolver');
const drops=JSON.parse(read('data/items/monster_drops_0_9_82EI.json'));
const rows=Array.isArray(drops)?drops:Object.values(drops);
const accessory=rows.find(row=>row?.Locations?.Both_Accessory===true && !row.slot);
assert(accessory,'Need a real slotless Both_Accessory fixture');

// Mobile size switching and lost-window recovery.
assert(ui.includes('button.addEventListener("touchend", activateSizeCycle'),'Touch-end size cycling missing');
assert(ui.includes('applyStoredWindowVisualScale'),'Transform fallback preservation missing');
assert(ui.includes('target.style.setProperty("transform", effectiveFactor === 1 ? "none" : `scale(${effectiveFactor})`'),'Safari transform scaling fallback missing');
assert(ui.includes('recoverWindowToViewport(win, { centerIfLost: true, persist: true })'),'Viewport recovery missing');
assert(ui.includes('window.addEventListener("pageshow"'),'Page-return recovery missing');
assert(ui.includes('window.resetAllUIWindowPositions = resetAllUIWindowPositions'),'Emergency UI reset API missing');

// Battle-log controls/footer must not occupy the scrollable message layer.
assert(index.includes('<div class="battle-log-toolbar">'),'Battle-log toolbar missing');
assert(css.includes('grid-template-rows: 27px minmax(0, 1fr) 38px'),'Desktop log grid separation missing');
assert(css.includes('#battle-log-list') && css.includes('grid-row: 2 !important'),'Scrollable message row missing');
assert(css.includes('#battle-log #position-coordinate-ui') && css.includes('grid-row: 3 !important'),'Location footer row missing');

// Player only gets 1.5x base walking speed.
assert(position.includes('playerBaseMultiplier: 1.5'),'Player movement multiplier missing');
assert(position.includes('base * ROWEB_MOVEMENT.playerBaseMultiplier'),'Player movement multiplier not applied');
const monsterFn=position.slice(position.indexOf('function getMonsterMovePixelsPerSecond'),position.indexOf('function getMonsterMovePixelsPerSecond')+900);
assert(!monsterFn.includes('playerBaseMultiplier'),'Monster movement must not receive player multiplier');

// Chained/normal-trigger damage gets a separate yellow lane.
assert(css.includes('.damage-number.additional-damage-number') && css.includes('#ffe14f'),'Yellow additional damage style missing');
assert(battle.includes('function showAdditionalDamageNumber'),'Additional damage renderer missing');
assert(battle.includes('source === "additional" ? 46 : 0'),'Additional damage side lane missing');
assert(quick.includes('normalAttackResult.additionalDamage'),'Quick-slot normal attack split missing');
assert(skill.match(/triggeredByNormalAttack:true/g)?.length>=7,'Normal-trigger proc marking incomplete');
assert(skill.includes('source:options.additional === true || options.triggeredByNormalAttack === true ? "additional"'),'Triggered damage source mapping missing');

// Runtime split check: a guaranteed 2-hit Double Attack keeps total damage but
// exposes primary and additional portions separately.
const sandbox={console,Math:Object.create(Math)};
sandbox.Math.random=()=>0;
sandbox.window={
  player:{equipment:{}},
  getPassiveSkillBonusTotals:()=>({doubleAttackChance:100,doubleAttackHits:2}),
  PerfectDodgeResolver:{resolve:()=>({dodged:false})},
  CriticalResolver:{resolve:()=>({critical:false,multiplier:1})},
  HitResolver:{resolve:()=>({hit:true,chance:100})},
  RARenewalDamagePipeline:{
    resolvePhysicalAttackElement:()=> 'Neutral',
    resolveAttackElement:()=> 'Neutral',
    resolveNormalAttack:(target,options)=>({damage:200,ratioOverride:options.ratioOverride})
  }
};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(pipeline,sandbox,{filename:'combat_damage_pipeline.js'});
const out=sandbox.window.CombatDamagePipeline.resolveNormalAttack({race:'Formless',size:'Medium'});
assert.strictEqual(out.damage,200);
assert.strictEqual(out.primaryDamage,100);
assert.strictEqual(out.additionalDamage,100);
assert.strictEqual(out.additionalHitCount,1);
assert.strictEqual(out.additionalProcKey,'double');

console.log(JSON.stringify({version:'0.9.82FJ',status:'PASS',accessoryFixture:accessory.name,playerWalkMultiplier:1.5,additionalDamageLane:'yellow'},null,2));
