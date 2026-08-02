const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const results=[]; const assert=(name,cond,detail='')=>{results.push({name,pass:!!cond,detail});if(!cond)throw new Error(name+': '+detail);};
let timers=[];
const sandbox={console,Date,Math,JSON,Number,String,Object,Array,Map,Set,Promise,
  player:{sp:9999,hp:10000,maxHp:10000,maxSp:9999,baseLevel:200,elementalSpheres:[],position:{x:100,y:100}},
  currentMonster:{id:999,name:'Target',currentHp:999999,maxHp:999999,element:'Neutral',elementLevel:1,position:{x:300,y:300}},
  addBattleLog:()=>{},updatePlayerUI:()=>{},updateMonsterUI:()=>{},saveGame:()=>{},requestGameSave:()=>{},
  canCastSkill:(skill,level,expected)=>({ok:true,level:Number(level||1),profile:skill.runtimeProfile}),
  paySkillCost:()=>true,reportPendingRuntime:()=>false,defeatMonster:()=>{},finalizeSecondaryRuntimeSkillDefeat:()=>{},
  applyAttackRuntimeStatus:()=>true,showDamageNumber:()=>{},playMonsterHitAnimation:()=>{},
  applyRuntimeCalculatedDamage:(target,damage)=>{const dealt=Math.min(target.currentHp,Math.max(0,Math.floor(damage)));target.currentHp-=dealt;return {dealt,killed:target.currentHp<=0};},
  setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},
  document:undefined,
  CombatDamagePipeline:{resolveMagicSkill:(profile,level,target,opts)=>{sandbox._elements.push(profile.element);return {damage:100+opts.ratio};}},
  resolveRuntimeSkillTargets:(profile,primary)=>[primary]
};
sandbox.window=sandbox;sandbox._elements=[];
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'js/warlock_elemental_sphere_runtime.js'),'utf8'),sandbox);
const skill=(id,handler,extra={})=>({id,officialId:id,name:'S',runtimeProfile:{handler,...extra}});
assert('initial sphere count',sandbox.getWarlockElementalSphereCount()===0);
assert('summon fire lv1',sandbox.castElementalSphereSummonSkill(skill(2222,'elemental_sphere_summon'),1)===true);
assert('lv1 adds one',sandbox.getWarlockElementalSphereCount()===1);
assert('summon wind lv1',sandbox.castElementalSphereSummonSkill(skill(2223,'elemental_sphere_summon'),1)===true);
assert('summon water lv1',sandbox.castElementalSphereSummonSkill(skill(2224,'elemental_sphere_summon'),1)===true);
assert('summon earth lv1',sandbox.castElementalSphereSummonSkill(skill(2229,'elemental_sphere_summon'),1)===true);
assert('ordered four spheres',sandbox.getWarlockElementalSphereSummary()==='火 → 風 → 水 → 地',sandbox.getWarlockElementalSphereSummary());
// fifth sphere: official Tetra discards oldest then consumes newest->oldest.
assert('fifth sphere',sandbox.castElementalSphereSummonSkill(skill(2222,'elemental_sphere_summon'),1)===true);
const tetra=skill(2217,'tetra_vortex',{hitIntervalMs:200,targeting:{origin:'target',shape:'circle',radius:0},randomStatusOptions:[]});
assert('tetra cast',sandbox.castTetraVortexSkill(tetra,5)===true);
for(const t of timers.sort((a,b)=>a.ms-b.ms))t.fn();timers=[];
assert('tetra consumes all remaining four',sandbox.getWarlockElementalSphereCount()===0);
assert('tetra newest-first and oldest discarded',sandbox._elements.slice(-4).join(',')==='Fire,Earth,Water,Wind',sandbox._elements.slice(-4).join(','));
// Lv2 replaces all prior spheres with five of selected element.
sandbox.player.elementalSpheres=[];
assert('summon water lv2',sandbox.castElementalSphereSummonSkill(skill(2224,'elemental_sphere_summon'),2)===true);
assert('lv2 creates five',sandbox.getWarlockElementalSphereCount()===5);
assert('lv2 all water',sandbox.getWarlockElementalSpheres().every(s=>s.element==='Water'));
const release=skill(2230,'elemental_release',{sphereHitIntervalMs:150,sphereAttackRatio:300});
assert('release lv2 cast',sandbox.castElementalReleaseSkill(release,2)===true);
for(const t of timers.sort((a,b)=>a.ms-b.ms))t.fn();timers=[];
assert('release consumes all spheres',sandbox.getWarlockElementalSphereCount()===0);
assert('release fired five water hits',sandbox._elements.slice(-5).every(e=>e==='Water'));

// Combat mode authority test.
const combatSandbox={window:null,console,Math,Number,String,Object,Array,Map,Set,Promise,player:{},loadJson:async()=>({})};combatSandbox.window=combatSandbox;
vm.createContext(combatSandbox);vm.runInContext(fs.readFileSync(path.join(root,'js/combat_formula_runtime.js'),'utf8'),combatSandbox);
const C=combatSandbox.CombatFormulaRuntime;
const violent={id:2189,officialId:2189,aegisName:'COELACANTH_H_A',name:'暴力腔棘魚',Modes:['IgnoreMagic'],behavior:{ignoreMagic:true}};
const mutant={id:2190,officialId:2190,aegisName:'COELACANTH_H_M',name:'變異腔棘魚',Modes:['IgnoreMelee','IgnoreRanged']};
assert('violent identity forced 2190',combatSandbox.getAuthoritativeMonsterCombatIdentity(violent)===2190);
assert('violent does not ignore magic',C.hasMonsterMode(violent,'IgnoreMagic')===false);
assert('violent ignores melee',C.hasMonsterMode(violent,'IgnoreMelee')===true);
assert('violent magic damage not forced to one',C.normalizeIncomingDamage(violent,54321,{damageType:'magic',hitCount:1})===54321);
assert('violent melee forced to one',C.normalizeIncomingDamage(violent,54321,{damageType:'physical',rangeType:'short',hitCount:1})===1);
assert('mutant identity forced 2189',combatSandbox.getAuthoritativeMonsterCombatIdentity(mutant)===2189);
assert('mutant ignores magic',C.normalizeIncomingDamage(mutant,54321,{damageType:'magic',hitCount:1})===1);

// Verify the earlier Renewal pipeline immunity pre-check also honors authoritative identity.
combatSandbox.getMonsterRuntimeBonuses=()=>({});
combatSandbox.applyROCombatDamageModifiers=(damage)=>damage;
combatSandbox.StatusManager={has:()=>false};
combatSandbox.activeTotals=()=>({});
vm.runInContext(fs.readFileSync(path.join(root,'js/ra_renewal_damage_pipeline.js'),'utf8'),combatSandbox);
assert('violent stale magicImmune bypassed in renewal pipeline',combatSandbox.RARenewalDamagePipeline.finalModifiers(54321,{...violent,magicImmune:true},{damageType:'magic',element:'Neutral'})===54321);
assert('mutant authoritative magic immunity enforced in renewal pipeline',combatSandbox.RARenewalDamagePipeline.finalModifiers(54321,{...mutant,magicImmune:false},{damageType:'magic',element:'Neutral'})===0);

console.log(JSON.stringify({version:'0.9.82IJ',passed:results.filter(r=>r.pass).length,total:results.length,results},null,2));
