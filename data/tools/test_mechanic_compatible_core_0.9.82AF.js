const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const core=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const rows=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const generated=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_generated_all.json'),'utf8')).skills;
const pending=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_pending_review.json'),'utf8')).skills;
const copyable=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_copyable_skills.json'),'utf8'));
const runtimeProfiles={};for(const [id,row] of Object.entries(rows))runtimeProfiles[id]=row.runtimeProfile||row;
const math=Object.create(Math);math.random=()=>0;
let lastPhysical=null,groundConfig=null;const statusCalls=[];
const monster={name:'機械工匠測試魔物',currentHp:999999,maxHp:999999,level:100,size:'Medium',race:'Formless',element:'Neutral',position:{x:1,y:0},runtimeState:{statuses:{}}};
const learned={2256:5,2257:3,2266:4,2270:1,5006:5};
const ctx={console,Date,Math:math,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,
 player:{hp:10000,maxHp:10000,sp:9999,maxSp:9999,baseLevel:100,jobLevel:70,stats:{str:100,agi:80,vit:70,int:40,dex:80,luk:30},position:{x:0,y:0},activeBuffs:{},runtimeState:{statuses:{}},learnedSkills:learned,equipment:{weapon:1},weaponType:'1hAxe'},
 currentMonster:monster,activeMonsters:[monster],skillsData:{runtimeProfiles},
 getSkillLevel:id=>Number(ctx.player.learnedSkills[id]||0),getSkillDataById:id=>core[String(id)]||null,getCurrentJobSkills:()=>Object.values(core),isSkillBasic:()=>false,
 calculateDerivedPlayerStats:()=>({atk:500,matk:100,stats:{...ctx.player.stats}}),getItemData:()=>({dbSubType:ctx.player.weaponType,weight:1200}),getEquippedWeaponTypeRuntime:()=>ctx.player.weaponType,isPlayerMounted:()=>false,
 updatePlayerUI:()=>{},updateMonsterUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},renderPositionSprites:()=>{},addBattleLog:()=>{},defeatMonster:()=>{},
 playROStudioPlayerMotion:()=>{},playPlayerAttackAnimation:()=>{},playMonsterHitAnimation:()=>{},showDamageNumber:()=>{},showSlashEffect:()=>{},
 TargetingResolver:{collect:(o,c)=>c.filter(Boolean)},MovementEffectResolver:{knockback:()=>true},
 StatusManager:{apply:(target,status,options)=>{statusCalls.push({target,status,options});return{applied:true};}},
 GroundEffectManager:{create:cfg=>{groundConfig=cfg;return cfg;},remove:()=>{}},
 CombatDamagePipeline:{resolvePhysicalSkill:(p,l,t,o)=>{lastPhysical={...o};return{damage:Number(o.ratio||1)};},resolveMagicSkill:()=>({damage:1})},
 MultiHitResolver:{normalize:(p)=>({damageHitCount:Number(p.damageHitCount||1),visualHitCount:Number(p.visualHitCount||1),statusProcMode:'once'}),split:d=>[d]},HitResolver:{resolve:()=>({hit:true})},CriticalResolver:{resolve:()=>({critical:false,multiplier:1})},PerfectDodgeResolver:{resolve:()=>({dodged:false})}
};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);
function assert(c,m){if(!c)throw new Error(m);}
assert(Object.values(generated).filter(x=>x.implementationMode==='official'&&x.executionEnabled).length>=452,'official coverage must not regress below 452');
assert(pending.length<=687,'pending count must not regress above 687');
for(const id of [2256,2257,2266,2270,5006]){assert(runtimeProfiles[id]?.handler!=='pending','runtime '+id);assert(!pending.some(x=>Number(x.skillId)===id),'pending '+id);}
ctx.calculateSkillAttackDamage(core['2256'],5,monster,{});assert(lastPhysical.ratio===1380,'Boost Knuckle '+lastPhysical.ratio);
ctx.calculateSkillAttackDamage(core['2257'],3,monster,{});assert(lastPhysical.ratio===700,'Pile Bunker '+lastPhysical.ratio);
ctx.calculateSkillAttackDamage(core['5006'],5,monster,{});assert(lastPhysical.ratio===700,'Magma slam '+lastPhysical.ratio);
const totals=ctx.getPassiveSkillBonusTotals();assert(totals.defFlat===100,'Mainframe DEF '+totals.defFlat);
monster.runtimeState.statuses={kyrie:{},assumptio:{}};monster.currentHp=999999;
assert(ctx.castAttackSkill(core['2257'],3)===true,'Pile Bunker cast');assert(!monster.runtimeState.statuses.kyrie&&!monster.runtimeState.statuses.assumptio,'Pile Bunker clear statuses');
monster.runtimeState.statuses={hiding:{},cloaking:{}};statusCalls.length=0;
assert(ctx.castDebuffSkill(core['2270'],1)===true,'Infrared cast');assert(!monster.runtimeState.statuses.hiding&&!monster.runtimeState.statuses.cloaking,'Infrared reveal');
const infrared=statusCalls.find(x=>x.status==='infrared_scan');assert(infrared&&infrared.options.effects.fleeRate===-30&&infrared.options.durationMs===3000,'Infrared status');
monster.currentHp=999999;statusCalls.length=0;groundConfig=null;
assert(ctx.castGroundDamageSkill(core['5006'],5)===true,'Magma cast');assert(groundConfig&&groundConfig.rangeCells===3&&groundConfig.tickMs===500&&groundConfig.durationMs===5000,'Magma ground config');
assert(statusCalls.some(x=>x.status==='stun'&&x.options.chancePercent===90&&x.options.durationMs===4500),'Magma initial stun');
const hpBeforeTick=monster.currentHp;groundConfig.onTick([monster]);assert(hpBeforeTick-monster.currentHp===1800,'Magma fixed DOT '+(hpBeforeTick-monster.currentHp));
assert(statusCalls.some(x=>x.status==='burning'&&x.options.chancePercent===50&&x.options.durationMs===18000),'Magma burning');
const repro=(copyable.reproduce||[]).find(x=>Number(x.skillId)===5006);assert(repro?.runtimeReady===true&&repro?.enabled===true,'Magma reproduce ready');
for(const bucket of ['plagiarism','reproduce'])assert(!(copyable[bucket]||[]).some(x=>Number(x.skillId)===2266),'passive copy exclusion '+bucket);
// 2262-2265 were promoted in 0.9.82AM; 2271-2274 in 0.9.82AN; 2259 and 2267 in 0.9.82AO.
// 2258, 2260 and 2261 were promoted in 0.9.82AS.
for(const id of [2258,2260,2261]){assert(runtimeProfiles[id]?.handler!=='pending','later artillery runtime '+id);assert(!pending.some(x=>Number(x.skillId)===id),'later artillery removed pending '+id);}for(const id of [2268,2269,2275,2281,2282,2283]){assert(runtimeProfiles[id]?.handler==='passive','later passive conversion '+id);assert(!pending.some(x=>Number(x.skillId)===id),'later conversion removed pending '+id);}
console.log(JSON.stringify({result:'PASS',official:452,pending:687,boostKnuckleLv5:1380,pileBunkerLv3:700,mainframeDef:100,infrared:{fleeRate:-30,durationMs:3000},magma:{slamLv5:700,dotLv5:1800,burningChance:50}},null,2));
