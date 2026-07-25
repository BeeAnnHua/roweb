const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
function assertEq(a,e,l){if(a!==e)throw new Error(`${l}: expected ${e}, got ${a}`)}
const items={
  1:{id:1,slot:'weapon',category:'weapon',dbSubType:'staff',cards:[2]},
  2:{id:2,effects:{magicSizeDamage:{Large:10},magicElementDamage:{Earth:20},magicAttackElementDamage:{Fire:30},magicRaceDamage:{Brute:40},magicClassDamage:{Boss:50},magicDamageRate:60}}
};
const player={baseLevel:100,stats:{int:50,dex:20,luk:0,spl:0},equipment:{weapon:1},activeBuffs:{}};
const target={race:'Brute',size:'Large',element:'Earth',elementLevel:1,isBoss:true,hardMdef:0,softMdef:0,mres:0};
const context={console,Math:Object.assign(Object.create(Math),{random:()=>0.5}),Date,window:null,player,
  getItemData:id=>items[id]||null,
  calculateDerivedPlayerStats:()=>({stats:player.stats,matk:100,matkMin:100,matkMax:100,sMatk:20,crate:0}),
  getActiveBuffBonusTotals:()=>({}),getPassiveSkillBonusTotals:()=>({}),getPassiveCombatModifierTotals:()=>({}),getTrainingBonusTotals:()=>({}),getMonsterRuntimeBonuses:()=>({}),getActiveBuffSpecialValue:(k,d)=>d,
  setInterval:()=>1,clearInterval:()=>{},loadJson:async()=>JSON.parse(fs.readFileSync(path.join(ROOT,'data/combat_runtime/renewal_combat_tables.json'),'utf8'))
};context.window=context;vm.createContext(context);
for(const rel of ['js/combat_mechanics_runtime.js','js/combat_formula_runtime.js','js/ra_renewal_damage_pipeline.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,rel),'utf8'),context,{filename:rel});
(async()=>{
  await context.CombatFormulaRuntime.load();
  const r=context.RARenewalDamagePipeline.resolveMagicSkill({ratio:100,element:'Fire',elementSource:'skill'},1,target,{ratio:100,hits:1});
  // Base 100 MATK -> S.MATK 20% = 120. Property 150%, then Renewal magic card stages:
  // size +10, target element +20, attack element +30, race +40, class +50, magic +60.
  assertEq(r.raw,120,'S.MATK stage');
  assertEq(r.damage,1033,'Renewal magic element/card order');
  const defended={...target,hardMdef:100,softMdef:50,mres:100};
  const noCardsPlayer={...player,equipment:{weapon:null}};
  const saved=context.player;context.player=noCardsPlayer;context.window.player=noCardsPlayer;
  context.calculateDerivedPlayerStats=()=>({stats:noCardsPlayer.stats,matk:100,matkMin:100,matkMax:100,sMatk:20,crate:0});
  const d=context.RARenewalDamagePipeline.resolveMagicSkill({ratio:100,element:'Neutral',elementSource:'skill'},1,defended,{ratio:100,hits:1});
  // 120 -> MRES100 = 101 (floor 19 reduction), then MDEF100/soft50 = floor(101*1100/2000)-50 = 5.
  assertEq(d.damage,5,'MRES then hard/soft MDEF order');
  context.player=saved;context.window.player=saved;
  console.log('PASS 0.9.82EA Renewal magic formula');
  console.log(JSON.stringify({baseMatk:100,sMatk:20,raw:120,fireEarth:150,magicCardResult:r.damage,mresMdefResult:d.damage},null,2));
})().catch(err=>{console.error(err);process.exit(1)});
