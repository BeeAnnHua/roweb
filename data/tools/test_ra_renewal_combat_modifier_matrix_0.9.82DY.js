const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
function assertEq(a,e,l){if(a!==e)throw new Error(`${l}: expected ${e}, got ${a}`)}
function assertNear(a,e,t,l){if(Math.abs(a-e)>t)throw new Error(`${l}: expected ${e}, got ${a}`)}
function stage(n,r){return Math.floor(n*(100+r)/100)}
const items={
  1:{id:1,slot:'weapon',category:'weapon',effects:{
    raceDamage:{Brute:10},elementDamage:{Earth:20},attackElementDamage:{Fire:30},sizeDamage:{Large:40},classDamage:{Boss:50},physicalDamageRate:60,longDamageRate:70,
    ignoreDefByRace:{Brute:50},ignoreMdefByRace:{Brute:50},ignoreResByRace:{Brute:50},ignoreMresByRace:{Brute:50}
  }}
};
const player={race:'Player',size:'Medium',baseLevel:100,stats:{luk:0},equipment:{weapon:1},equipmentCards:{}};
const context={console,Math:Object.create(Math),Date,window:null,player,
  getItemData:id=>items[id]||null,
  calculateDerivedPlayerStats:()=>({stats:player.stats,cri:50,crate:10,perfectDodge:20,hardDef:0,softDef:0,hardMdef:0,softMdef:0,res:0,mres:0}),
  getActiveBuffBonusTotals:()=>({}),getPassiveCombatModifierTotals:()=>({}),getPassiveSkillBonusTotals:()=>({}),
  getMonsterRuntimeBonuses:()=>({}),getActiveBuffSpecialValue:(k,d)=>d,
  setInterval:()=>1,clearInterval:()=>{},loadJson:async()=>JSON.parse(fs.readFileSync(path.join(ROOT,'data/combat_runtime/renewal_combat_tables.json'),'utf8'))
};context.window=context;vm.createContext(context);
for(const rel of ['js/combat_mechanics_runtime.js','js/combat_formula_runtime.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,rel),'utf8'),context,{filename:rel});
(async()=>{
  await context.CombatFormulaRuntime.load();
  const api=context.CombatFormulaRuntime;
  // Renewal attribute and weapon-size tables imported from db/re.
  assertEq(api.getElementMultiplier('Fire','Earth',1),150,'Fire -> Earth Lv1');
  assertEq(api.getElementMultiplier('Fire','Water',1),90,'Fire -> Water Lv1');
  assertEq(api.getElementMultiplier('Neutral','Ghost',4),0,'Neutral -> Ghost Lv4');
  assertEq(api.getWeaponSizeMultiplier('knuckle','Large'),75,'Knuckle large');
  assertEq(api.getWeaponSizeMultiplier('whip','Large'),75,'Whip large');
  assertEq(api.getWeaponSizeMultiplier('sword','Large'),100,'Sword large defaults 100 in current Renewal DB');

  // Attacker card/equipment categories are consecutive and floor after each category.
  const boss={race:'Brute',size:'Large',element:'Earth',elementLevel:1,isBoss:true,def:0,mdef:0,res:0,mres:0};
  let expected=1000;
  for(const rate of [10,20,30,40,50,60,70])expected=stage(expected,rate);
  const physical=context.applyROCombatDamageModifiers(1000,{damageType:'physical',source:player,target:boss,attackElement:'Fire',attackRangeType:'long',applyElement:false,applyWeaponSize:false,applyDefense:false});
  assertEq(physical,expected,'physical attacker modifier stages');
  assertEq(physical,9798,'physical matrix concrete result');

  // Real property table is a separate stage from card/equipment attack-element bonuses.
  const elementOnly=context.applyROCombatDamageModifiers(1000,{damageType:'physical',source:{race:'Player',size:'Medium'},target:{race:'Formless',size:'Medium',element:'Earth',elementLevel:1},attackElement:'Fire',applyWeaponSize:false,applyDefense:false,applyEquipmentModifiers:false});
  assertEq(elementOnly,1500,'property table application');

  // Target reduction categories are consecutive and happen before the final critical stage.
  const monster={race:'Brute',size:'Large',element:'Fire',isBoss:false};
  const defender={race:'DemiHuman',size:'Medium',element:'Neutral',elementLevel:1,
    longDamageReduction:70,
    raceResist:{Brute:10},sizeResist:{Large:20},elementResist:{Fire:30},classResist:{NonBoss:40},
    physicalDamageReductionRate:50,damageReductionRate:60,
    def:0,mdef:0,res:0,mres:0,stats:{luk:0}
  };
  let reducedExpected=100000;
  for(const reduction of [70,10,20,30,40,50,60])reducedExpected=stage(reducedExpected,-reduction);
  const reduced=context.applyROCombatDamageModifiers(100000,{damageType:'physical',source:monster,target:defender,attackElement:'Fire',attackRangeType:'long',applyElement:false,applyWeaponSize:false,applyDefense:false,applyEquipmentModifiers:false});
  assertEq(reduced,reducedExpected,'target reduction stages');
  assertEq(reduced,1814,'target reduction concrete result');

  // C.RATE final multiplier is after target card reductions; bCritDefRate follows it.
  const criticalTarget={...defender,raceResist:{Player:10},sizeResist:{Medium:20},criticalDefenseRate:20};
  let criticalExpected=Math.floor(reducedExpected*1.5);criticalExpected=stage(criticalExpected,-20);
  const critical=context.applyROCombatDamageModifiers(100000,{damageType:'physical',source:player,target:criticalTarget,attackElement:'Fire',attackRangeType:'long',applyElement:false,applyWeaponSize:false,applyDefense:false,critical:true});
  // The player's equipment attack modifiers are intentionally disabled for this target-side order check.
  const criticalNoAtk=context.applyROCombatDamageModifiers(100000,{damageType:'physical',source:player,target:criticalTarget,attackElement:'Fire',attackRangeType:'long',applyElement:false,applyWeaponSize:false,applyDefense:false,applyEquipmentModifiers:false,critical:true});
  assertEq(criticalNoAtk,criticalExpected,'critical final order');
  assertEq(criticalNoAtk,2176,'critical target reduction concrete result');
  if(!(critical>criticalNoAtk))throw new Error('attacker modifiers should increase critical result');

  // Renewal Hard/Soft DEF and MDEF are separate; race pierce affects only Hard DEF/MDEF.
  const brute={race:'Brute',size:'Medium',element:'Neutral',elementLevel:1,hardDef:100,softDef:50,hardMdef:100,softMdef:50,res:0,mres:0};
  const noPierceSource={race:'Player',size:'Medium'};
  assertEq(context.DefenseResolver.physical(1000,brute,{source:noPierceSource}),770,'Hard/Soft DEF split');
  assertEq(context.DefenseResolver.magic(1000,brute,{source:noPierceSource}),500,'Hard/Soft MDEF split');
  assertEq(context.DefenseResolver.physical(1000,brute,{source:player}),850,'race DEF pierce 50%');
  assertEq(context.DefenseResolver.magic(1000,brute,{source:player}),650,'race MDEF pierce 50%');

  const resTarget={race:'Brute',hardDef:0,softDef:0,hardMdef:0,softMdef:0,res:100,mres:100};
  assertEq(context.DefenseResolver.physical(1000,resTarget,{source:noPierceSource}),840,'RES reduction');
  assertEq(context.DefenseResolver.magic(1000,resTarget,{source:noPierceSource}),840,'MRES reduction');
  assertEq(context.DefenseResolver.physical(1000,resTarget,{source:player}),912,'RES pierce capped/used');
  assertEq(context.DefenseResolver.magic(1000,resTarget,{source:player}),912,'MRES pierce capped/used');

  // Renewal hit, critical chance and perfect dodge base rules.
  assertEq(context.HitResolver.chance({hit:200},{flee:150}),50,'Renewal HIT - FLEE');
  assertEq(context.HitResolver.chance({hit:0},{flee:999}),5,'minimum hit rate');
  assertEq(context.HitResolver.chance({hit:999},{flee:0}),100,'maximum hit rate');
  const critChance=context.CriticalResolver.chance({cri:50},{stats:{luk:100},criticalChanceReductionRate:50});
  assertNear(critChance,15,1e-9,'target LUK and critical chance reduction');
  assertEq(context.PerfectDodgeResolver.chance({perfectDodge:20}),20,'perfect dodge percent');

  console.log('PASS 0.9.82DY Renewal combat modifier matrix');
  console.log(JSON.stringify({attribute:{fireEarth1:150,fireWater1:90,neutralGhost4:0},size:{knuckleLarge:75,whipLarge:75,swordLarge:100},physical,elementOnly,reduced,criticalNoAtk,defSplit:{physical:770,magic:500,physicalPierced:850,magicPierced:650},res:{normal:840,pierced:912},hit:{difference:50,min:5,max:100},critChance,perfectDodge:20},null,2));
})().catch(err=>{console.error(err);process.exit(1)});
