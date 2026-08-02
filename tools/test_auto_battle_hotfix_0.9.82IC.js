const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

let now = 1_000_000;
const elements = new Map();
function el(id, props = {}) {
  const node = Object.assign({
    id, checked:false, value:'', dataset:{},
    querySelectorAll:()=>[],
    addEventListener:()=>{},
    dispatchEvent:()=>{},
    classList:{contains:()=>false,toggle:()=>{},add:()=>{},remove:()=>{}},
  }, props);
  elements.set(id, node);
  return node;
}
const document = {
  getElementById:id=>elements.get(id)||null,
  querySelectorAll:()=>[],
  createElement:tag=>({tagName:tag.toUpperCase(),dataset:{},appendChild:()=>{},addEventListener:()=>{},classList:{toggle:()=>{}}}),
};
const logs=[];
const player = {
  map:'field', currentCity:null, hp:100, maxHp:100, sp:100, maxSp:100,
  inventory:[{id:601,count:99}], activeBuffs:{}, position:{x:0,y:0},
  autoCombat:null,
};
const context = {
  console, window:null, document, player,
  Date: class extends Date { static now(){return now;} },
  setTimeout:()=>1, clearTimeout:()=>{},
  normalizeItemId:v=>v === '' || v == null ? null : Number(v),
  saveGame:()=>{}, addBattleLog:t=>logs.push(t),
  updatePlayerUI:()=>{}, updateInventoryUI:()=>{}, updateMonsterUI:()=>{},
  getSkillLevel:()=>1, getSkillDataById:id=>({id,officialId:Number(id),name:`Skill ${id}`,skillType:'attack'}),
  getRuntimeSkillUiType:()=> 'attack', getSkillStorageKey:s=>String(s.officialId||s.id),
  getCurrentJobSkills:()=>[], getExtraSkillSkillList:()=>[],
  currentMonster:null, currentMap:{id:'field'},
  useFlyWing:()=>{ context.onAutoBattleTeleportCompleted?.(context.currentMonster,{source:'test'}); return true; },
  collectLiveCombatEnemies:()=>context.__enemies||[],
  getCurrentDistanceToMonster:m=>m.distance||100,
  AUTO_BATTLE_STATES:{},
};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname + '/../js/auto_battle.js','utf8'), context, {filename:'auto_battle.js'});

// Saved skill must survive an unrendered/default empty select.
context.normalizeAutoCombatSettings();
player.autoCombat.attacks[0].skillId='230';
el('autoCombatAttackSkill1',{value:'',dataset:{}});
el('autoCombatAttackEnabled1',{checked:true});
el('autoCombatAttackLevel1',{value:'5'});
el('autoCombatAttackSpPercent1',{value:'0'});
el('autoCombatAttackMinMonsters1',{value:'1'});
context.syncAutoCombatSettingsFromUI({save:false});
assert.strictEqual(player.autoCombat.attacks[0].skillId,'230','unrendered select erased saved skill');

// Once rendered, explicit empty selection is authoritative.
elements.get('autoCombatAttackSkill1').dataset.autoCombatReady='1';
context.syncAutoCombatSettingsFromUI({save:false});
assert.strictEqual(player.autoCombat.attacks[0].skillId,null,'rendered empty select did not clear skill');

// Fixed interval should wait, then teleport even with a current target/cast-like state.
player.autoCombat.teleport.fixedIntervalEnabled=true;
player.autoCombat.teleport.fixedIntervalSeconds=5;
context.AUTO_BATTLE_CONTROLLER.lastFixedIntervalFlyAt=now;
assert.strictEqual(context.tryAutoFixedIntervalTeleport(),false);
now += 5001;
assert.strictEqual(context.tryAutoFixedIntervalTeleport(),true);
assert.strictEqual(context.AUTO_BATTLE_CONTROLLER.lastFixedIntervalFlyAt,now);

// Boss/MVP scan must ignore the current normal target and find another active threat.
player.autoCombat.teleport.avoidBoss=true;
player.autoCombat.teleport.avoidMvp=true;
const normal={name:'normal',currentHp:10,category:'normal',distance:10};
const boss={name:'boss',currentHp:10,isBoss:true,aiState:'ATTACK',distance:20};
context.currentMonster=normal;
context.__enemies=[normal,boss];
assert.strictEqual(context.findAutoAvoidThreat(),boss,'global boss threat was not found');

// Long Renewal casts/action locks must not sleep past fixed-flight due time or Boss polling.
const battleSource = fs.readFileSync(__dirname + '/../js/battle.js','utf8');
assert(battleSource.includes('function getAutoBattleUtilityWakeDelayMs'), 'utility wake scheduler missing');
assert(battleSource.includes('intervalMs - Math.max(0, now - last)'), 'fixed flight due-time wake missing');
assert(battleSource.includes('teleport.avoidBoss === true || teleport.avoidMvp === true'), 'Boss/MVP polling wake missing');

// Position normalization must retain the new saved settings instead of erasing them.
const positionSource = fs.readFileSync(__dirname + '/../js/position_engine.js','utf8');
assert(positionSource.includes('fixedIntervalEnabled: player.autoCombat.teleport?.fixedIntervalEnabled === true'), 'position normalization erases fixed interval enabled');
assert(positionSource.includes('fixedIntervalSeconds: Math.max(1, Math.min(3600'), 'position normalization erases fixed interval seconds');

console.log(JSON.stringify({passed:6,failed:0,logs},null,2));
