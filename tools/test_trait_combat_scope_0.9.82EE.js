const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=r=>JSON.parse(fs.readFileSync(path.join(ROOT,r),'utf8'));
const skills={...read('data/skills/skills_core_1.json').skills,...read('data/skills/skills_core_2.json').skills};
const runtime=read('data/skill_runtime/runtime_generated_all.json').skills;
function assertEq(actual,expected,label){if(actual!==expected)throw new Error(`${label}: expected ${expected}, got ${actual}`);}
function assertTrue(value,label){if(!value)throw new Error(`${label}: expected truthy`);}
const math=Object.create(Math); math.random=()=>0;
const captured=[];
const player={baseLevel:200,jobLevel:60,jobKey:'dragon_knight',stats:{str:50,agi:50,vit:50,int:50,dex:50,luk:10},traitStats:{pow:20,spl:0,con:0,crt:50},traits:{pow:20,spl:0,con:0,crt:50},sp:999999,hp:1000,maxHp:1000,maxSp:500,activeBuffs:{},runtimeState:{},skillTimingState:{},equipment:{weapon:null,shield:900}};
const target={currentHp:999999,maxHp:999999,level:200,stats:{luk:0},race:'Formless',size:'Medium',element:'Neutral',position:{x:0,y:0}};
const ctx={console,Math:math,Date,JSON,Number,String,Object,Array,Set,Map,Promise,performance:{now:()=>Date.now()},window:null,document:undefined,
 player,currentMonster:target,activeMonsters:[target],skillsData:{runtimeProfiles:runtime,skillIndex:skills},
 getSkillLevel:id=>({6503:1,5265:1,5201:1,5259:2,5258:2}[Number(id)]||0),
 getActiveBuffBonusTotals:()=>({}),getPassiveSkillBonusTotals:()=>({}),getPassiveCombatModifierTotals:()=>({}),getTrainingBonusTotals:()=>({}),
 getItemData:id=>Number(id)===900?{weight:100,refine:3,type:'armor'}:null,
 calculateDerivedPlayerStats:()=>({stats:{...player.stats,...player.traitStats},atk:100,matk:100,hPlus:Number(player.traitStats.crt||0),cri:20,crate:Math.floor(Number(player.traitStats.crt||0)/3),aspd:193}),
 recalculatePlayerStats:()=>{},addBattleLog:()=>{},saveGame:()=>{},updatePlayerUI:()=>{},updateMonsterUI:()=>{},showDamageNumber:()=>{},playMonsterHitAnimation:()=>{},
 setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,clearTimeout:()=>{},
 CombatFormulaRuntime:{collectScalarBonus:()=>0},
 CombatDamagePipeline:{resolvePhysicalSkill:(profile,level,t,options)=>{captured.push({profile,level,options});return {damage:Number(options.ratio||0)};},resolveMagicSkill:()=>({damage:1})},
 CombatResourceManager:{value:5,get(){return this.value;},consume(type,amount){if(this.value<amount)return {ok:false,used:0,remaining:this.value};this.value-=amount;return {ok:true,used:amount,remaining:this.value};},add(){},clear(){},configure(){} }
};ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/combat_mechanics_runtime.js'),'utf8'),ctx,{filename:'combat_mechanics_runtime.js'});
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/battle.js'),'utf8'),ctx,{filename:'battle.js'});
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/skill_engine.js'),'utf8'),ctx,{filename:'skill_engine.js'});
ctx.showDamageNumber=()=>{}; ctx.playMonsterHitAnimation=()=>{}; ctx.updateMonsterUI=()=>{}; ctx.updatePlayerUI=()=>{}; ctx.saveGame=()=>{}; ctx.addBattleLog=()=>{};

// H.Plus scope: skill healing and potion pitching include it; fixed/regen/life steal do not.
assertEq(ctx.applyRuntimeHealingModifiers(100,{source:player,target:player,healingCategory:'skill_heal'}),150,'H.Plus skill heal');
assertEq(ctx.applyRuntimeHealingModifiers(100,{source:player,target:player,healingCategory:'periodic_skill_heal'}),150,'H.Plus periodic skill heal');
assertEq(ctx.applyRuntimeHealingModifiers(100,{source:player,target:player,healingCategory:'potion_pitcher'}),150,'H.Plus potion pitcher');
assertEq(ctx.applyRuntimeHealingModifiers(100,{source:player,target:player,healingCategory:'fixed_recovery'}),100,'Fixed recovery excludes H.Plus');
assertEq(ctx.applyRuntimeHealingModifiers(100,{source:player,target:player,healingCategory:'natural_regeneration'}),100,'Natural regen excludes H.Plus');
assertEq(ctx.applyRuntimeHealingModifiers(100,{source:player,target:player,healingCategory:'life_steal'}),100,'Life steal excludes H.Plus');

// CRI controls chance; C.RATE controls multiplier only.
const c0=ctx.CriticalResolver.describe(player,target,{cri:25,crate:0});
const c36=ctx.CriticalResolver.describe(player,target,{cri:25,crate:36});
assertEq(c0.criticalChance,c36.criticalChance,'C.RATE does not change critical chance');
assertEq(c0.criticalDamageMultiplier,1.4,'C.RATE 0 multiplier');
assertTrue(Math.abs(c36.criticalDamageMultiplier - 1.76) < 1e-9, `C.RATE 36 multiplier: expected 1.76, got ${c36.criticalDamageMultiplier}`);
const cCri=ctx.CriticalResolver.describe(player,target,{cri:40,crate:36});
assertTrue(cCri.criticalChance>c36.criticalChance,'CRI raises critical chance');
assertEq(cCri.criticalDamageMultiplier,c36.criticalDamageMultiplier,'CRI does not change critical multiplier');
assertEq(ctx.RO_WEB_CRITICAL_AUTHORITY.chanceStat,'CRI','Critical chance authority');
assertEq(ctx.RO_WEB_CRITICAL_AUTHORITY.damageStat,'C.RATE','Critical damage authority');

// Two formerly missing Imperial Guard trait formulas now resolve exact RA ratio and no longer return null.
captured.length=0;
const radiant=ctx.calculateSkillAttackDamage(skills['6503'],1,target,{criticalResult:{critical:false,multiplier:1}});
assertEq(radiant,19400,'Radiant Spear total 2-hit ratio with POW and mastery');
assertEq(captured.at(-1).options.ratio,19400,'Radiant Spear pipeline ratio');
captured.length=0;
const shield=ctx.calculateSkillAttackDamage(skills['5265'],1,target,{criticalResult:{critical:false,multiplier:1}});
assertEq(shield,74354,'Shield Shooting total 7-hit ratio with POW/mastery/weight/refine');
assertEq(captured.at(-1).options.ratio,74354,'Shield Shooting pipeline ratio');

// Servant Weapon normal-attack autocast: 5% × Lv, consumes one servant, 3-hit POW formula.
player.activeBuffs[5201]={id:5201,level:1,effects:{},expiresAt:Date.now()+60000};
ctx.CombatResourceManager.value=5; captured.length=0; target.currentHp=999999;
assertTrue(ctx.tryServantWeaponOnNormalAttack(target),'Servant Weapon proc');
assertEq(ctx.CombatResourceManager.value,4,'Servant Weapon resource consumed');
assertEq(captured.at(-1).options.ratio,9300,'Servant Weapon 3-hit POW ratio');

console.log('PASS 0.9.82EE trait direct formulas, H.Plus recovery scope, CRI/C.RATE authority and Servant Weapon proc');
console.log(JSON.stringify({healingCategories:Object.keys(ctx.RUNTIME_HEALING_CATEGORIES),critical:{chanceStat:c36.chanceStat,damageStat:c36.damageStat,multiplier36:c36.criticalDamageMultiplier},ratios:{radiant,shield,servant:captured.at(-1).options.ratio}},null,2));
