const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const json = rel => JSON.parse(read(rel));
const tests = [];
function test(name, fn) {
  try { const value=fn(); tests.push({name, pass:true, promise:value && typeof value.then==='function' ? value : null}); }
  catch (error) { tests.push({name, pass:false, error:String(error?.stack || error), promise:null}); }
}

test('status window uses frozen combat snapshot and scheduler wake/watchdog', () => {
  const status = read('js/status_system.js');
  const battle = read('js/battle.js');
  const ui = read('js/ui.js');
  assert(status.includes('if (typeof isAutoBattleRunning === "function" && isAutoBattleRunning()) return true;'));
  assert(status.includes('wakeAutoBattleScheduler("status_window_open")'));
  assert(battle.includes('function startAutoBattleWatchdog()'));
  assert(battle.includes('function wakeAutoBattleScheduler(reason = "external_ui")'));
  assert(battle.includes('now > autoBattleNextDueAt + 420'));
  assert(ui.includes('wakeAutoBattleScheduler("status_window_ui_open")'));
});

test('incorrect speculative alchemist skill-selector persistence was removed', () => {
  const src = read('js/auto_battle.js');
  assert(!src.includes('dataset.autoCombatReady'));
  assert(src.includes('if (skill) slot.skillId = skill.value || null;'));
  assert(src.includes('if (slot.skillId && !valid) slot.skillId = null;'));
});

function makeTownContext(autoRunning) {
  const logs=[];
  const ctx={console,window:null,player:{currentCity:null,state:'Idle',map:'field_a'},cities:[{id:'prontera',name:'普隆德拉'}],npcs:[],currentMap:{id:'field_a'},currentMonster:{},
    document:{getElementById:()=>null,createElement:()=>({appendChild(){},classList:{}})},
    isAutoBattleRunning:()=>autoRunning,clearFieldCombatRuntimeForTravel:()=>{},updateTownUI:()=>{},updateMapUI:()=>{},updateMonsterUI:()=>{},updateTownBackground:()=>{},saveGame:()=>{},addBattleLog:t=>logs.push(t)};
  ctx.window=ctx; vm.createContext(ctx); vm.runInContext(read('js/town.js'),ctx,{filename:'town.js'}); return {ctx,logs};
}
test('town logs exact stop message only when auto battle was active', () => {
  let t=makeTownContext(false); t.ctx.enterCity('prontera'); assert(!t.logs.includes('回到村莊，停止自動掛機。'));
  t=makeTownContext(true); t.ctx.enterCity('prontera'); assert(t.logs.includes('回到村莊，停止自動掛機。'));
  assert(!read('js/battle.js').includes('RO_WEB_SUPPRESS_PASSIVE_RETALIATION'));
  assert(!read('js/town.js').includes('RO_WEB_SUPPRESS_PASSIVE_RETALIATION'));
});

test('MVP arena uses Violent Coelacanth 2190 instead of magic-immune Mutant 2189', () => {
  const monsters=json('data/monsters.json');
  const maps=json('data/maps.json');
  const spawn=json('data/monster_spawn_config.json');
  const violent=monsters.find(x=>Number(x.id)===2190);
  const mutant=monsters.find(x=>Number(x.id)===2189);
  assert(violent && violent.name==='暴力腔棘魚');
  assert.deepStrictEqual(violent.Modes,['IgnoreMelee','IgnoreRanged','Mvp']);
  assert(mutant.Modes.includes('IgnoreMagic'));
  const arena=maps.find(x=>x.id==='geffenia_mvp_arena_3x3_region_camera');
  assert(arena.monsters.includes(2190)); assert(!arena.monsters.includes(2189));
  const pool=spawn.regions.geffenia_mvp_arena_3x3_region_camera.pool.map(x=>Number(x.monsterId));
  assert(pool.includes(2190)); assert(!pool.includes(2189));
  const atlas=json('assets/monsters/animations/2189/2189.json');
  assert(atlas.usedByMonsterIds.includes(2190));
});

test('combat formula distinguishes coelacanth immunities and Boitata Fire3 / DamageTaken 10', () => {
  const tables=json('data/combat_runtime/renewal_combat_tables.json');
  const ctx={console,window:null,player:{id:'p',race:'Player',size:'Medium',element:'Neutral',equipment:{}},Math,
    ModifierKeyRuntime:null,CardRuntime:null,EffectRuntime:null,
    getActiveBuffBonusTotals:()=>({}),getPassiveCombatModifierTotals:()=>({}),getMonsterRuntimeBonuses:()=>({}),
    calculateDerivedPlayerStats:()=>({}),getItemData:()=>null,
    DefenseResolver:{magic:(d)=>d,physical:(d)=>d},loadJson:async()=>tables};
  ctx.window=ctx; vm.createContext(ctx); vm.runInContext(read('js/combat_formula_runtime.js'),ctx,{filename:'combat_formula_runtime.js'});
  // Directly inject loaded tables through the runtime loader.
  return ctx.CombatFormulaRuntime.load().then(()=>{
    const violent={id:2190,element:'Water',elementLevel:2,size:'Large',race:'Fish',isBoss:true,isMvp:true,Modes:['IgnoreMelee','IgnoreRanged','Mvp'],DamageTaken:100};
    const mutant={...violent,id:2189,Modes:['IgnoreMagic','Mvp']};
    const boitata={id:2068,element:'Fire',elementLevel:3,size:'Large',race:'Brute',isBoss:true,isMvp:true,Modes:['Mvp'],DamageTaken:10};
    assert.strictEqual(ctx.CombatFormulaRuntime.applyDamage(10000,{source:ctx.player,target:violent,damageType:'magic',element:'Neutral',applyDefense:false}),10000);
    assert.strictEqual(ctx.CombatFormulaRuntime.applyDamage(10000,{source:ctx.player,target:violent,damageType:'physical',attackRangeType:'short',element:'Neutral',applyDefense:false}),1);
    assert.strictEqual(ctx.CombatFormulaRuntime.applyDamage(10000,{source:ctx.player,target:mutant,damageType:'magic',element:'Neutral',applyDefense:false}),1);
    assert.strictEqual(ctx.CombatFormulaRuntime.applyDamage(10000,{source:ctx.player,target:boitata,damageType:'magic',element:'Water',applyDefense:false}),2000);
    assert.strictEqual(ctx.CombatFormulaRuntime.applyDamage(10000,{source:ctx.player,target:boitata,damageType:'magic',element:'Fire',applyDefense:false}),0);
  });
});

test('refine warning covers +7 blessing stage and +14 to +15 unavailable stage', () => {
  const rules=json('data/refine_rules.json');
  const items={984:{id:984,name:'神之金屬',type:'etc'},6240:{id:6240,name:'高濃縮神之金屬',type:'etc'},6635:{id:6635,name:'鐵匠的祝福',type:'etc'},900001:{id:900001,name:'測試四級武器',type:'equipment',category:'weapon',slot:'weapon',weaponLevel:4,refineable:true}};
  const prompts=[];
  const ctx={console,window:null,Math,Date,setTimeout:(fn)=>fn(),clearTimeout:()=>{},player:null,RO_WEB_DATA:{'data/refine_rules.json':rules},
    getItemData:id=>items[Number(id)]||null,buildEquipmentInstanceName:(i,d)=>`+${i.refine} ${d.name}`,addBattleLog:()=>{},saveGame:()=>{},updatePlayerUI:()=>{},updateEquipmentUI:()=>{},updateInventoryUI:()=>{},recalculatePlayerStats:()=>{},
    ROGoldUI:{confirm:(message,options)=>{prompts.push({message,options}); return Promise.resolve(false);}}};
  ctx.window=ctx; vm.createContext(ctx); vm.runInContext(read('js/refine_runtime.js'),ctx,{filename:'refine_runtime.js'});
  function run(refine){
    const chance=rules.groups.Weapon.levels['4'].refineLevels[String(refine+1)].chances[0];
    ctx.player=ctx.window.player={zeny:1e9,inventory:[{id:900001,itemId:900001,count:1,instanceId:'eq'+refine,refine},{id:chance.materialItemId,count:99},{id:6635,count:99}],equipment:{},equipmentInstances:{}};
    ctx.RefineRuntime.state.selected=null;ctx.RefineRuntime.state.chanceIndex=0;ctx.RefineRuntime.state.useBlessing=false;ctx.RefineRuntime.state.lastResult=null;
    ctx.openRefineWindow({name:'精煉匠人'}); ctx.attemptSelectedRefine(); return prompts.at(-1)?.message||'';
  }
  const p7=run(7); assert(p7.includes('可使用 1 個鐵匠的祝福'));
  const p14=run(14); assert(p14.includes('目標 +15')); assert(p14.includes('無法使用鐵匠的祝福')); assert(p14.includes('失敗'));
});

(async()=>{
  // Support async tests returned above.
  for (const row of tests) {
    if (row.pass && row.promise) { try { await row.promise; } catch(error) { row.pass=false; row.error=String(error?.stack||error); } }
    delete row.promise;
  }
  const failed=tests.filter(x=>!x.pass);
  const report={title:'RO_WEB 0.9.82IF Regression',version:'0.9.82IF',passed:tests.length-failed.length,failed:failed.length,tests};
  console.log(JSON.stringify(report,null,2));
  if(failed.length) process.exit(1);
})().catch(err=>{console.error(err);process.exit(1)});
