#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const ROOT=path.resolve(__dirname,'..');
const checks=[];
function check(name, condition, detail={}) { checks.push({name,ok:!!condition,detail}); if(!condition) console.error('FAIL',name,detail); }
function load(file){ vm.runInThisContext(fs.readFileSync(path.join(ROOT,file),'utf8'),{filename:file}); }

global.window=global;
global.console=console;
global.document=undefined;
global.setInterval=()=>0;
global.clearInterval=()=>{};
global.player={race:'Player',size:'Medium',equipment:{},effects:{}};
global.getItemData=()=>null;
global.loadJson=async (url,fallback)=>{
  const clean=String(url).replace(/^\.\//,'');
  const full=path.join(ROOT,clean);
  return fs.existsSync(full)?JSON.parse(fs.readFileSync(full,'utf8')):fallback;
};
global.DefenseResolver={physical:d=>d,magic:d=>d};

load('js/modifier_key_runtime.js');
load('js/card_runtime.js');
load('js/combat_formula_runtime.js');
load('js/effect_runtime.js');

(async()=>{
  await CombatFormulaRuntime.load();
  const M=ModifierKeyRuntime;
  check('Runtime version',M.version==='0.9.82HZ',{version:M.version});
  const raceAliases={Demihuman:'DemiHuman',DemiHuman:'DemiHuman',Human:'DemiHuman',RC_DemiHuman:'DemiHuman','人形':'DemiHuman','人型':'DemiHuman',RC_Player_Human:'Player',RC_Player_Doram:'Player'};
  for(const [input,expected] of Object.entries(raceAliases)) check(`Race alias ${input}`,M.normalizeRace(input)===expected,{actual:M.normalizeRace(input),expected});
  check('Size alias',M.canonical('sizeDamage','Size_Large')==='Large',{actual:M.canonical('sizeDamage','Size_Large')});
  check('Element alias',M.canonical('elementDamage','Ele_Fire')==='Fire',{actual:M.canonical('elementDamage','Ele_Fire')});
  check('Class alias',M.canonical('classDamage','Class_Normal')==='NonBoss',{actual:M.canonical('classDamage','Class_Normal')});

  const seaScript='bonus2 bAddRace,RC_DemiHuman,20; bonus2 bAddRace,RC_Player_Human,20;';
  const compiled=CardRuntime.compileRawScript(seaScript);
  const sea=CardRuntime._debugEvaluateRecord({id:4035,name:'海葵卡片',compiledScript:compiled,sourceType:'card'},{sourceType:'card'});
  check('Sea Anemone canonical card key',sea.physicalRaceDamage?.DemiHuman===20,{map:sea.physicalRaceDamage});
  check('Sea Anemone player key',sea.physicalRaceDamage?.Player===20,{map:sea.physicalRaceDamage});

  function damage(source,target,damageType='physical',extra={}){
    return CombatFormulaRuntime.applyDamage(100,{source,target,damageType,applyElement:false,applyWeaponSize:false,applyDefense:false,...extra});
  }
  check('Sea Anemone card output changes real DemiHuman damage',damage({race:'Player',...sea},{race:'Demihuman',size:'Medium',element:'Neutral'})===120);
  check('Sea Anemone card output changes real Player damage',damage({race:'Player',...sea},{race:'Player',size:'Medium',element:'Neutral'})===120);

  const canonicalRaces=['Formless','Undead','Brute','Plant','Insect','Fish','Demon','DemiHuman','Angel','Dragon','Player'];
  canonicalRaces.forEach((race,index)=>{
    const other=canonicalRaces[(index+1)%canonicalRaces.length];
    const match=damage({race:'Player',physicalRaceDamage:{[race]:20}},{race,size:'Medium',element:'Neutral'});
    const miss=damage({race:'Player',physicalRaceDamage:{[race]:20}},{race:other,size:'Medium',element:'Neutral'});
    check(`Race matrix ${race} match`,match===120,{match});
    check(`Race matrix ${race} mismatch`,miss===100,{miss,other});
  });

  const demiTargets=['Demihuman','DemiHuman','Human','RC_DemiHuman','人形'];
  for(const race of demiTargets){
    const value=damage({race:'Player',physicalRaceDamage:{DemiHuman:20}},{race,size:'Medium',element:'Neutral'});
    check(`Physical DemiHuman damage target=${race}`,value===120,{value});
  }
  check('Wrong race no specific bonus',damage({race:'Player',physicalRaceDamage:{DemiHuman:20}},{race:'Demon',size:'Medium',element:'Neutral'})===100);
  check('All + specific are additive',damage({race:'Player',physicalRaceDamage:{All:10,Demihuman:20}},{race:'DemiHuman',size:'Medium',element:'Neutral'})===130);
  check('All applies to other race',damage({race:'Player',physicalRaceDamage:{All:10,Demihuman:20}},{race:'Demon',size:'Medium',element:'Neutral'})===110);
  check('Magic race alias',damage({race:'Player',magicRaceDamage:{Human:25}},{race:'Demihuman',size:'Medium',element:'Neutral'},'magic')===125);
  check('Race resistance alias',damage({race:'Human'},{race:'Player',size:'Medium',element:'Neutral',raceResist:{Demihuman:20}})===80);
  check('Size alias damage',damage({race:'Player',sizeDamage:{size_large:15}},{race:'Demon',size:'Large',element:'Neutral'})===115);
  check('Class alias damage',damage({race:'Player',physicalClassDamage:{Class_Normal:12}},{race:'Demon',size:'Medium',element:'Neutral',isBoss:false})===112);
  check('Boss class still distinct',damage({race:'Player',physicalClassDamage:{Class_Normal:12}},{race:'Demon',size:'Medium',element:'Neutral',isBoss:true})===100);
  check('EffectRuntime canonical lookup',EffectRuntime.keyedFrom({physicalRaceDamage:{Demihuman:20,All:5}},'physicalRaceDamage','DemiHuman')===25,{value:EffectRuntime.keyedFrom({physicalRaceDamage:{Demihuman:20,All:5}},'physicalRaceDamage','DemiHuman')});
  check('Combat keyed lookup canonical',CombatFormulaRuntime.collectKeyedBonus({physicalRaceDamage:{Human:20}},'physicalRaceDamage','Demihuman',false)===20);
  check('EXP race lookup canonical value',M.valueFromMap({Demihuman:25,All:5},'expRaceRate','Human')===30);
  check('Race critical lookup canonical value',M.valueFromMap({RC_DemiHuman:7},'criticalChanceByRace','Demihuman')===7);
  check('Race DEF pierce lookup canonical value',M.valueFromMap({Human:35},'ignoreDefByRace','DemiHuman')===35);
  const statusSource=fs.readFileSync(path.join(ROOT,'js/status_system.js'),'utf8');
  check('Advanced status UI uses canonical resolver',statusSource.includes('ModifierKeyRuntime?.valueFromMap'));

  const table=JSON.parse(fs.readFileSync(path.join(ROOT,'data/combat_runtime/renewal_combat_tables.json'),'utf8'));
  check('Renewal table canonical DemiHuman',table.races.includes('DemiHuman')&&!table.races.includes('Demihuman'),{races:table.races});
  const monsters=JSON.parse(fs.readFileSync(path.join(ROOT,'data/monsters.json'),'utf8'));
  const invalidHuman=monsters.filter(row=>['human','demihuman'].includes(String(row.race).toLowerCase())&&row.race!=='DemiHuman');
  check('Monster races canonical',invalidHuman.length===0,{invalidHuman:invalidHuman.map(x=>({id:x.id,race:x.race}))});
  const heart=monsters.find(row=>Number(row.id)===21599);
  check('Heart Hunter AT is DemiHuman',heart?.race==='DemiHuman',{race:heart?.race});

  const report={version:'0.9.82HZ',suite:'canonical keyed combat modifiers',passed:checks.filter(x=>x.ok).length,total:checks.length,failed:checks.filter(x=>!x.ok),checks};
  fs.writeFileSync(path.join(ROOT,'TEST_REPORT_0.9.82HZ_RACE_MODIFIER_CANONICALIZATION.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,total:report.total,failed:report.failed.length},null,2));
  process.exitCode=report.failed.length?1:0;
})().catch(err=>{console.error(err);process.exitCode=1;});
