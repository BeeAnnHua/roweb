const fs=require('fs');
const vm=require('vm');
function assert(v,m){if(!v)throw new Error(m);}
function eq(a,b,m){if(a!==b)throw new Error(`${m}: expected ${b}, got ${a}`);}
const armor={id:1,name:'效果分類測試鎧甲',combatModifiers:{
  physicalRaceResist:{Demon:7}, magicRaceResist:{Demon:9},
  physicalSizeResist:{Large:5}, magicSizeResist:{Large:8},
  physicalEnemyElementResist:{Fire:10}, magicEnemyElementResist:{Fire:11},
  physicalClassResist:{NonBoss:3}, magicClassResist:{NonBoss:4}
}};
const ctx={console,Math,window:null,player:{equipment:{armor:1},equipmentCards:{}},getItemData:id=>id===1?armor:null};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/combat_formula_runtime.js','utf8'),ctx,{filename:'combat_formula_runtime.js'});
const source={race:'Demon',size:'Large',element:'Fire',isBoss:false};
const physical=ctx.CombatFormulaRuntime.applyDamage(1000,{source,target:ctx.player,damageType:'physical',attackElement:'Neutral',applyWeaponSize:false,applyElement:false,applyDefense:false});
const pTrace=ctx.lastCombatFormulaTrace;
eq(pTrace.defenseBonuses.race,7,'Physical race resistance');
eq(pTrace.defenseBonuses.size,5,'Physical size resistance');
eq(pTrace.defenseBonuses.attackerElement,10,'Physical attacker-property resistance');
eq(pTrace.defenseBonuses.classType,3,'Physical class resistance');
eq(physical,770,'Physical staged reduction');
const magic=ctx.CombatFormulaRuntime.applyDamage(1000,{source,target:ctx.player,damageType:'magic',attackElement:'Neutral',applyWeaponSize:false,applyElement:false,applyDefense:false});
const mTrace=ctx.lastCombatFormulaTrace;
eq(mTrace.defenseBonuses.race,9,'Magic race resistance');
eq(mTrace.defenseBonuses.size,8,'Magic size resistance');
eq(mTrace.defenseBonuses.attackerElement,11,'Magic attacker-property resistance');
eq(mTrace.defenseBonuses.classType,4,'Magic class resistance');
eq(magic,714,'Magic staged reduction');
const pipeline=fs.readFileSync('js/ra_renewal_damage_pipeline.js','utf8');
assert(pipeline.includes("collectScalarBonus?.(opt.source||window.player,'ignoreWeaponSizePenalty'"),'Weapon size-perfect must read common equipment/card/passive/Buff collector');
const schema=JSON.parse(fs.readFileSync('data/combat_runtime/renewal_modifier_schema.json','utf8'));
eq(schema.version,'0.9.82EH','Schema version');
assert(schema.offense.ignoreDefByRace&&schema.defense.physicalEnemyElementResist,'Expanded modifier schema');
console.log('PASS 0.9.82EH ROItemSearch taxonomy bridge and Renewal runtime modifier coverage');
console.log(JSON.stringify({physical:{damage:physical,...pTrace.defenseBonuses},magic:{damage:magic,...mTrace.defenseBonuses}},null,2));
