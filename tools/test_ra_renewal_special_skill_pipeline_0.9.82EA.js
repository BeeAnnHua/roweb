const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=r=>JSON.parse(fs.readFileSync(path.join(ROOT,r),'utf8'));
const skills={...read('data/skills/skills_core_1.json').skills,...read('data/skills/skills_core_2.json').skills};
const runtime={};for(const rel of ['data/skill_runtime/runtime_generated_all.json','data/skill_runtime/runtime_core_1_v1.json'])for(const [id,row] of Object.entries(read(rel).skills||{}))runtime[id]=row;
const items={1:{id:1,slot:'weapon',dbSubType:'spear',atk:100,weaponLevel:4,cards:[]},2:{id:2,effects:{damageRate:20}}};
const player={baseLevel:100,stats:{str:50,agi:50,vit:50,int:50,dex:50,luk:0,pow:0},traitStats:{},aspd:193,hp:10000,maxHp:10000,sp:1000,maxSp:1000,equipment:{weapon:1},activeBuffs:{},runtimeState:{},skillTimingState:{}};
const target={name:'Dummy',currentHp:999999,maxHp:999999,race:'Formless',size:'Medium',element:'Neutral',elementLevel:1,hardDef:0,softDef:0,hardMdef:0,softMdef:0,res:0,mres:0,flee:0};
const math=Object.create(Math);math.random=()=>0.5;
const ctx={console,Math:math,Date,JSON,Number,String,Object,Array,Set,Map,Promise,performance:{now:()=>Date.now()},window:{},document:undefined,player,currentMonster:target,skillsData:{runtimeProfiles:runtime,skillIndex:skills},RO_WEB_CELL_SIZE:36,
 getSkillLevel:id=>Number(id)===2007?0:10,getActiveBuffBonusTotals:()=>({}),getPassiveSkillBonusTotals:()=>({}),getPassiveCombatModifierTotals:()=>({}),getTrainingBonusTotals:()=>({}),getMonsterRuntimeBonuses:()=>({}),getActiveBuffSpecialValue:(k,f)=>f,
 getItemData:id=>items[id]||null,calculateDerivedPlayerStats:()=>({stats:player.stats,atk:200,matk:100,matkMin:100,matkMax:100,pAtk:0,sMatk:0,crate:0,aspd:193}),recalculatePlayerStats:()=>{},addBattleLog:()=>{},saveGame:()=>{},updatePlayerUI:()=>{},updateMonsterUI:()=>{},setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,clearTimeout:()=>{},loadJson:async()=>read('data/combat_runtime/renewal_combat_tables.json'),getEquippedWeaponTypeRuntime:()=> 'spear'};
ctx.window=ctx;vm.createContext(ctx);
for(const file of ['js/combat_mechanics_runtime.js','js/combat_formula_runtime.js','js/ra_renewal_damage_pipeline.js','js/combat_damage_pipeline.js','js/battle.js','js/skill_engine.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,file),'utf8'),ctx,{filename:file});
function assert(v,l){if(!v)throw new Error(l)}
(async()=>{
 await ctx.CombatFormulaRuntime.load();
 const pressure=skills['367'],pressureProfile=ctx.getSkillRuntimeProfile(pressure);
 assert(pressureProfile.handler==='magic_damage','Pressure must be Renewal magic handler');
 assert(pressureProfile.element==='Holy','Pressure must be Holy');
 let d=ctx.calculateSkillAttackDamage(pressure,1,target,{});
 assert(d===650,`Pressure Lv1 ratio expected 650 damage on zero MDEF, got ${d}`);
 target.hardMdef=100;d=ctx.calculateSkillAttackDamage(pressure,1,target,{});
 assert(d<650&&d>0,`Pressure must pass Renewal MDEF, got ${d}`);target.hardMdef=0;
 const thorn=skills['2479'];d=ctx.calculateSkillAttackDamage(thorn,1,target,{});
 assert(d===350,`Thorn Trap raw Renewal misc expected 350, got ${d}`);
 target.hardDef=500;d=ctx.calculateSkillAttackDamage(thorn,1,target,{});
 assert(d===350,`Thorn Trap must ignore DEF, got ${d}`);target.hardDef=0;
 const dragon=skills['2008'];
 d=ctx.calculateSkillAttackDamage(dragon,10,target,{});const baseDragon=d;
 assert(baseDragon>0,'Dragon Breath damage must resolve through special physical pipeline');
 items[1].cards=[2];d=ctx.calculateSkillAttackDamage(dragon,10,target,{});
 assert(d>baseDragon,`Dragon Breath must receive generic equipment/card damage modifiers: ${baseDragon} -> ${d}`);
 target.element='Earth';d=ctx.calculateSkillAttackDamage(dragon,10,target,{});
 assert(d>baseDragon*1.5,`Dragon Breath Fire property and card stages must apply, got ${d}`);
 console.log('PASS 0.9.82EA Renewal special-skill common pipeline');
 console.log(JSON.stringify({pressure650:true,pressureUsesMdef:true,thorn350:true,thornIgnoresDef:true,dragonBase:baseDragon,dragonCardAndElement:d},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
