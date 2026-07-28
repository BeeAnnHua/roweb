const fs=require('fs'),vm=require('vm');
function assertEq(a,e,l){if(a!==e)throw new Error(`${l}: expected ${e}, got ${a}`)}
function assert(v,l){if(!v)throw new Error(l)}
const math=Object.create(Math);math.random=()=>0.5;
const items={
  1:{id:1,slot:'weapon',dbSubType:'knuckle',atk:100,weaponLevel:1,cards:[2]},
  2:{id:2,effects:{critAtkRate:20,bossDamageRate:20}},
  3:{id:3,slot:'weapon',category:'weapon',dbType:'Weapon',dbSubType:'dagger',atk:60,weaponLevel:1},
  4:{id:4,slot:'weapon',category:'weapon',dbType:'Weapon',dbSubType:'katar',atk:100,weaponLevel:1}
};
const player={baseLevel:100,stats:{str:50,dex:20,luk:0,pow:0},equipment:{weapon:1,shield:null,leftWeapon:null},activeBuffs:{}};
const target={race:'Brute',size:'Large',element:'Neutral',elementLevel:1,isBoss:true,def:0,mdef:0,res:0,mres:0};
const context={console,Math:math,Date,window:null,player,currentMonster:target,RO_WEB_CELL_SIZE:36,
 getItemData:id=>items[id]||null,getSkillLevel:id=>Number(id)===48?10:0,
 calculateDerivedPlayerStats:()=>({stats:player.stats,atk:179,pAtk:20,crate:10,matk:0,sMatk:0}),
 getActiveBuffBonusTotals:()=>({}),getPassiveSkillBonusTotals:()=>({}),getPassiveCombatModifierTotals:()=>({}),getTrainingBonusTotals:()=>({}),
 getActiveBuffSpecialValue:(key,fallback)=>fallback,getMonsterRuntimeBonuses:()=>({}),consumeNextPhysicalAttackMultiplier:()=>100,
 recalculatePlayerStats:()=>{},addBattleLog:()=>{},updateMonsterUI:()=>{},saveGame:()=>{},
 setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,clearTimeout:()=>{},loadJson:async()=>JSON.parse(fs.readFileSync('data/combat_runtime/renewal_combat_tables.json','utf8'))
};context.window=context;vm.createContext(context);
for(const file of ['js/combat_mechanics_runtime.js','js/combat_formula_runtime.js','js/ra_renewal_damage_pipeline.js','js/combat_damage_pipeline.js','js/battle.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
(async()=>{
 await context.CombatFormulaRuntime.load();
 // With card: weapon size only on W.ATK, right StatusATK doubled, P.ATK before mastery/ratio,
 // bCritAtkRate +20%, Boss +20%, final critical 1.4 + C.RATE10%.
 let r=context.RARenewalDamagePipeline.resolveNormalAttack(target,{criticalResult:{critical:true}});
 assertEq(r.parts.right.baseStatusAtk,79,'base StatusATK');
 assertEq(r.parts.right.statusAtk,158,'right StatusATK doubled');
 assertEq(r.parts.right.weaponSizeRate,75,'Renewal Knuckle large-size rate');
 assertEq(r.parts.right.weaponAtk,97,'Renewal size penalty only weapon ATK');
 assertEq(r.critAtkRate,20,'card bCritAtkRate');
 assertEq(r.damage,660,'normal critical Renewal order');
 assertEq(context.lastCombatFormulaTrace.critical.multiplier,1.5,'final critical C.RATE multiplier');
 // Target critical damage reduction is after the final critical multiplier.
 target.criticalDefenseRate=20;
 r=context.RARenewalDamagePipeline.resolveNormalAttack(target,{criticalResult:{critical:true}});
 assertEq(r.damage,528,'target critical damage reduction');
 target.criticalDefenseRate=0;
 // Critical skills use half of bCritAtkRate.
 r=context.RARenewalDamagePipeline.resolvePhysicalSkill({ratio:200,attackRangeType:'short'},1,target,{ratio:200,criticalResult:{critical:true}});
 assertEq(r.critAtkRate,20,'skill bCritAtkRate source');
 assertEq(r.damage,1210,'critical skill half bCritAtkRate Renewal order');
 // Non-critical attacks do not receive C.RATE final critical multiplier.
 r=context.RARenewalDamagePipeline.resolveNormalAttack(target,{criticalResult:{critical:false}});
 assertEq(r.damage,361,'noncritical normal attack');
 // Renewal attack resolution order: Lucky Dodge -> critical -> regular HIT/FLEE. Criticals always hit.
 const evasive={...target,flee:999,perfectDodge:0};
 let pipeline=context.CombatDamagePipeline.resolveNormalAttack(evasive,{criticalResult:{critical:true}});
 assert(pipeline.miss===false&&pipeline.critical===true,'critical must bypass HIT/FLEE');
 pipeline=context.CombatDamagePipeline.resolveNormalAttack(evasive,{criticalResult:{critical:false}});
 assert(pipeline.miss===true,'noncritical must use HIT/FLEE');
 const lucky={...evasive,perfectDodge:100};
 pipeline=context.CombatDamagePipeline.resolveNormalAttack(lucky,{criticalResult:{critical:true}});
 assert(pipeline.miss===true&&pipeline.perfectDodged===true,'Lucky Dodge precedes critical');
 // Actual battle.js normal-attack entry must not perform a second legacy HIT roll.
 context.currentMonster=evasive;
 let battleResult=context.resolvePlayerNormalAttack({criticalResult:{critical:true}});
 assert(battleResult.miss===false&&battleResult.critical===true,'battle normal attack preserves critical auto-hit');
 battleResult=context.resolvePlayerNormalAttack({criticalResult:{critical:false}});
 assert(battleResult.miss===true,'battle normal attack uses Renewal HIT/FLEE for noncritical');
 context.currentMonster=lucky;
 battleResult=context.resolvePlayerNormalAttack({criticalResult:{critical:true}});
 assert(battleResult.miss===true&&battleResult.perfectDodged===true,'battle normal attack preserves Lucky Dodge priority');
 // Renewal hand rules: normal attacks may use both hands; active skills use the
 // right hand only unless a verified profile explicitly opts in.
 player.equipment={weapon:1,shield:3,leftWeapon:null};
 let dual=context.RARenewalDamagePipeline.resolveNormalAttack(target,{criticalResult:{critical:false}});
 assert(dual.parts.left&&dual.handFinalDamage.left>0,'dual-wield normal attack includes left hand');
 let rightOnly=context.RARenewalDamagePipeline.resolvePhysicalSkill({ratio:100,attackRangeType:'short'},1,target,{ratio:100,criticalResult:{critical:false}});
 assert(rightOnly.parts.left===null&&rightOnly.handDamage.left===0,'physical skill defaults to right hand only');
 // Katar normal attack secondary hand formula: 1 + 2*TF_DOUBLE level = 21%.
 player.equipment={weapon:4,shield:null,leftWeapon:null};
 const katar=context.RARenewalDamagePipeline.resolveNormalAttack(target,{criticalResult:{critical:false}});
 assert(katar.handFinalDamage.katar===Math.max(1,Math.floor(katar.handFinalDamage.right*21/100)),'Katar secondary hit formula');
 player.equipment={weapon:1,shield:null,leftWeapon:null};
 console.log('PASS 0.9.82DZ Renewal physical damage order');
 console.log(JSON.stringify({statusAtk:158,weaponAtkAfterSize:97,pAtk:20,critAtkRate:20,bossDamageRate:20,crate:10,normalCritical:660,criticalDefense20:528,criticalSkill:1210,nonCritical:361},null,2));
})().catch(err=>{console.error(err);process.exit(1)});
