#!/usr/bin/env node
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
const results=[];const check=(ok,name,detail='')=>{assert.ok(ok,`${name}: ${detail}`);results.push({name,detail:String(detail||'PASS')});};

// A. Runtime targeting derived from official splashArea.
{
  const core=read('data/skills/skills_core_1.json').skills;
  const rt=read('data/skill_runtime/runtime_generated_all.json').skills;
  const profiles={}; for(const row of Object.values(rt))profiles[String(row.skillId||row.id)]=row.runtimeProfile||row.formula||row;
  const ctx={console,Math,Date,JSON,Number,String,Object,Array,Set,Map,Promise,performance:{now:()=>Date.now()},window:null,document:undefined,
    player:{position:{x:0,y:0},activeBuffs:{},runtimeState:{},skillTimingState:{},stats:{},traitStats:{}},currentMonster:null,
    skillsData:{runtimeProfiles:profiles,skillIndex:core},getSkillLevel:()=>10,getActiveBuffBonusTotals:()=>({}),getPassiveSkillBonusTotals:()=>({}),getPassiveCombatModifierTotals:()=>({}),getTrainingBonusTotals:()=>({}),calculateDerivedPlayerStats:()=>({stats:{}}),
    setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,clearTimeout:()=>{},addBattleLog:()=>{},getSkillDataById:id=>core[String(id)]||null};
  ctx.window=ctx;
  const near1={name:'near1',currentHp:100,position:{x:36,y:0}},near2={name:'near2',currentHp:100,position:{x:70,y:0}},far={name:'far',currentHp:100,position:{x:360,y:0}};
  ctx.currentMonster=far; ctx.getCombatEnemyCandidates=()=>[near1,near2,far];
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js/combat_mechanics_runtime.js'),'utf8'),ctx,{filename:'combat_mechanics_runtime.js'});
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js/skill_engine.js'),'utf8'),ctx,{filename:'skill_engine.js'});
  const magnum=core['7'],overbrand=core['2317'],overbrandBrandish=core['2319'],moonSlasher=core['2320'],ray=core['2321'],shield=core['5265'],martyr=core['368'];
  const magnumProfile=profiles['7']||magnum.runtimeProfile||{};
  const overProfile=profiles['2317']||overbrand.runtimeProfile||{};
  const brandishProfile=profiles['2319']||overbrandBrandish.runtimeProfile||{};
  const moonProfile=profiles['2320']||moonSlasher.runtimeProfile||{};
  const rayProfile=profiles['2321']||ray.runtimeProfile||{};
  const shieldProfile=profiles['5265']||shield.runtimeProfile||{};
  const martyrProfile=profiles['368']||martyr.runtimeProfile||{};
  const mt=ctx.getRuntimeEffectiveTargeting(magnum,magnumProfile,10);
  check(mt&&mt.origin==='self'&&Number(mt.radius)>=2,'Magnum Break derives self AoE from official splashArea',JSON.stringify(mt));
  check(ctx.runtimeSkillRequiresPrimaryTargetRange(magnum,magnumProfile,10)===false,'Self-centred Magnum Break bypasses selected-target range');
  check(ctx.runtimeSkillRequiresPrimaryTargetRange(overbrand,overProfile,5)===false,'Over Brand self AoE bypasses selected-target range');
  const brandishTargeting=ctx.getRuntimeEffectiveTargeting(overbrandBrandish,brandishProfile,5);
  const moonTargeting=ctx.getRuntimeEffectiveTargeting(moonSlasher,moonProfile,5);
  const rayTargeting=ctx.getRuntimeEffectiveTargeting(ray,rayProfile,10);
  const shieldTargeting=ctx.getRuntimeEffectiveTargeting(shield,shieldProfile,5);
  check(Number(brandishTargeting.radius)>=5,'Over Brand Brandish uses official 11x11 radius instead of smaller placeholder',JSON.stringify(brandishTargeting));
  check(Number(moonTargeting.radius)>=3,'Moon Slasher uses official 7x7 radius instead of smaller placeholder',JSON.stringify(moonTargeting));
  check(rayTargeting.origin==='self'&&Number(rayTargeting.radius)>=5&&ctx.runtimeSkillRequiresPrimaryTargetRange(ray,rayProfile,10)===false,'Ray of Genesis is self-centred and bypasses target range',JSON.stringify(rayTargeting));
  check(shieldTargeting.origin==='target'&&Number(shieldTargeting.radius)>=3&&ctx.runtimeSkillRequiresPrimaryTargetRange(shield,shieldProfile,5)===true,'Shield Shooting remains target-locked 7x7 AoE',JSON.stringify(shieldTargeting));
  check(ctx.runtimeSkillRequiresPrimaryTarget(martyr,martyrProfile,5)===true&&ctx.runtimeSkillRequiresPrimaryTargetRange(martyr,martyrProfile,5)===true,'Martyr Reckoning remains a target/range skill');
  const targets=ctx.resolveRuntimeSkillTargets(magnumProfile,far,10,magnum);
  check(targets.includes(near1)&&targets.includes(near2)&&!targets.includes(far),'Self AoE hits nearby monsters and does not force far selected monster',targets.map(x=>x.name).join(','));
}

// B. Auto attack slots rotate 1 -> 2 -> 3 -> 4 after successful commits.
{
  const source=fs.readFileSync(path.join(ROOT,'js/auto_battle.js'),'utf8');
  const ctx={console,Date,Math,Number,String,Boolean,Object,Array,Set,Map,JSON,window:null,document:{getElementById:()=>null,querySelectorAll:()=>[],querySelector:()=>null},setTimeout:()=>1,clearTimeout:()=>{}};ctx.window=ctx;
  vm.createContext(ctx);
  vm.runInContext(`
    let currentMonster={currentHp:100,hp:100,position:{x:0,y:0}};
    let player={hp:100,maxHp:100,sp:100,maxSp:100,currentCity:null,position:{x:0,y:0},inventory:[],activeBuffs:{},
      autoCombat:{attacks:[1,2,3,4].map(id=>({enabled:true,skillId:String(id),level:1,spPercent:0,minMonsters:1,fallbackNormal:true})),normalAttack:{enabled:true},teleport:{enabled:false}}};
    function normalizeItemId(v){return v?String(v):null;} function addBattleLog(){} function resetAutoNoTargetTimer(){}
    function getSkillDataById(id){return {id:Number(id),officialId:Number(id),skillType:'attack',name:'S'+id};}
    function getRuntimeSkillUiType(){return 'attack';} function getSkillLevel(){return 1;} function canCastSkill(s,l){return {ok:true,level:l||1};}
    function getSkillRuntimeProfile(){return {};} function resolveRuntimeSkillTargets(p,t,l,s){return [t];}
    function isPlayerActiveSkillLocked(){return false;} function getActiveBuffBonusTotals(){return {};} function normalizeActiveBuffs(){}
    function collectLiveCombatEnemies(){return [currentMonster];} function getCurrentDistanceToMonster(){return 0;} function getPercent(v,m){return v/m*100;}
  `,ctx);
  vm.runInContext(source,ctx,{filename:'auto_battle.js'});
  const order=[];
  for(let i=0;i<8;i++){
    const choice=ctx.getAutoAttackSkill(vm.runInContext('currentMonster',ctx));
    order.push(choice.slotIndex+1);ctx.commitAutoAttackSkillRotation(choice.slotIndex);
  }
  check(order.join(',')==='1,2,3,4,1,2,3,4','Four auto attack slots rotate in order',order.join(','));
}

// C. Physical skill property priority.
{
  const ctx={console,Math,Date,Number,String,Object,Array,Set,Map,window:null,
    player:{equipment:{weapon:1},activeBuffs:{item_physical_element_endow:{expiresAt:Date.now()+999999,effects:{attackElementOverride:'Fire'}}}},
    getItemData:id=>({id,slot:'weapon',category:'weapon',dbType:'Weapon',weaponType:'sword',element:'Neutral'}),
    calculateDerivedPlayerStats:()=>({stats:{}}),getActiveBuffBonusTotals:()=>({}),getPassiveSkillBonusTotals:()=>({}),getTrainingBonusTotals:()=>({})};ctx.window=ctx;
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(ROOT,'js/ra_renewal_damage_pipeline.js'),'utf8'),ctx,{filename:'ra_renewal_damage_pipeline.js'});
  const pipe=ctx.RARenewalDamagePipeline,weapon={element:'Neutral'};
  check(pipe.resolvePhysicalSkillElement({elementSource:'fixed',element:'Water'},weapon)==='Water','Fixed Water Acidified Zone ignores Fire converter');
  check(pipe.resolvePhysicalSkillElement({elementSource:'fixed',element:'Earth'},weapon)==='Earth','Fixed Earth Acidified Zone ignores Fire converter');
  check(pipe.resolvePhysicalSkillElement({elementSource:'fixed',element:'Wind'},weapon)==='Wind','Fixed Wind Acidified Zone ignores Fire converter');
  check(pipe.resolvePhysicalSkillElement({elementSource:'fixed',element:'Fire'},weapon)==='Fire','Fixed Fire Acidified Zone stays Fire');
  check(pipe.resolvePhysicalSkillElement({elementSource:'weapon'},weapon)==='Fire','Weapon-property skill uses active converter');
  check(pipe.resolvePhysicalAttackElement(weapon)==='Fire','Normal attack uses active converter');
}

// D. Drop master valve scales ordinary/card/map-exclusive categories.
{
  const ctx={console,Math,Date,Number,String,Object,Array,window:null,applyRate:(v,key)=>key==='drop'?Math.floor(Number(v)*200):Number(v),getRate:key=>1,applyTrainingRewardBonus:v=>v};ctx.window=ctx;
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(ROOT,'js/loot.js'),'utf8'),ctx,{filename:'loot.js'});
  check(ctx.getFinalDropChanceBasisPoints(100,'mapExclusive')===10000,'1% map gacha reaches 100% under current 200x global drop valve',ctx.getFinalDropChanceBasisPoints(100,'mapExclusive'));
  check(ctx.getFinalDropChanceBasisPoints(1,'card')===200,'0.01% card becomes 2% under current 200x global drop valve',ctx.getFinalDropChanceBasisPoints(1,'card'));
  check(ctx.getFinalDropChanceBasisPoints(10,'normal')===2000,'Ordinary drop also uses same global master',ctx.getFinalDropChanceBasisPoints(10,'normal'));
}

// E. Windhawk coexist/data and converter cleanup wiring.
{
  const core=read('data/skills/skills_core_1.json').skills;
  const rt=read('data/skill_runtime/runtime_core_1_v1.json').skills;
  const profile=rt['5328'].runtimeProfile||rt['5328'];
  const skillSource=fs.readFileSync(path.join(ROOT,'js/skill_engine.js'),'utf8');
  const itemUiSource=fs.readFileSync(path.join(ROOT,'js/item_instance_ui.js'),'utf8');
  check(!Array.isArray(profile.mutuallyExclusiveBuffIds),'Calamity Gale no longer removes Elite Sniping');
  check(!skillSource.includes('無法與憤怒暴風同時存在'),'Elite Sniping cast is no longer blocked by Calamity Gale');
  check(skillSource.includes("if (skillId === 5330) return Number(active?.calamityGale || 0) > 0 ? \"normal\" : \"never\""),'Gale Storm becomes critical under Calamity Gale');
  check(skillSource.includes("ratio=Math.floor(ratio*120/100)"),'Crescive Bolt retains Calamity Gale +20% damage interaction');
  check(itemUiSource.includes('slot === "weapon" && typeof clearPhysicalElementEndow === "function"'),'Instance-based weapon unequip clears converter endow');
  check(String(core['5328'].description).includes('可與菁英狙擊同時存在'),'Skill description matches coexistence rule',core['5328'].description);
}

// F. Gacha icon and policy.
{
  const cash=read('data/items/cash.json'),gacha=read('data/mvp_gacha.json'),server=read('data/server_config.json');
  const a=fs.readFileSync(path.join(ROOT,'images/items/14848.webp')),b=fs.readFileSync(path.join(ROOT,'images/items/9525.webp'));
  check(cash['14848'].icon==='images/items/9525.webp','MVP gacha item points to ITEM 9525 icon',cash['14848'].icon);
  check(a.equals(b),'Fallback 14848 image bytes equal ITEM 9525 image');
  check(gacha.dropRatePolicy==='global_drop_master_with_mapExclusiveDrop_relative_multiplier','Gacha policy uses global drop master',gacha.dropRatePolicy);
  check(server.server.rates.cardDrop===100&&server.server.rates.mapExclusiveDrop===100,'Category valves default to 1x relative multiplier',JSON.stringify(server.server.rates));
}

console.log(JSON.stringify({version:'0.9.82GA',status:'PASS',checks:results.length,results},null,2));
