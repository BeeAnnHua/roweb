const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const core=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const rows=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const generated=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_generated_all.json'),'utf8')).skills;
const pending=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_pending_review.json'),'utf8')).skills;
const copyable=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_copyable_skills.json'),'utf8'));
const runtimeProfiles={};for(const [id,row] of Object.entries(rows))runtimeProfiles[id]=row.runtimeProfile||row;
let lastPhysical=null;const monster={name:'火屬性測試魔物',currentHp:999999,maxHp:999999,size:'Medium',race:'Formless',element:'Fire',position:{x:1,y:0},runtimeState:{statuses:{}}};
const learned={2255:5,2276:10,2277:5,2278:5,2279:10,2280:5};
const ctx={console,Date,Math,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,
 player:{hp:10000,maxHp:10000,sp:9999,maxSp:9999,baseLevel:100,jobLevel:70,stats:{str:100,agi:80,vit:70,int:40,dex:80,luk:30},position:{x:0,y:0},activeBuffs:{},runtimeState:{statuses:{}},learnedSkills:learned,equipment:{weapon:1},weaponType:'1hAxe'},
 currentMonster:monster,activeMonsters:[monster],skillsData:{runtimeProfiles},
 getSkillLevel:id=>Number(ctx.player.learnedSkills[id]||0),getSkillDataById:id=>core[String(id)]||null,getCurrentJobSkills:()=>Object.values(core),isSkillBasic:()=>false,
 calculateDerivedPlayerStats:()=>({atk:500,matk:100,stats:{...ctx.player.stats}}),getItemData:()=>({dbSubType:ctx.player.weaponType,weight:1200}),getEquippedWeaponTypeRuntime:()=>ctx.player.weaponType,isPlayerMounted:()=>false,
 updatePlayerUI:()=>{},updateMonsterUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},renderPositionSprites:()=>{},addBattleLog:()=>{},
 playROStudioPlayerMotion:()=>{},playPlayerAttackAnimation:()=>{},playMonsterHitAnimation:()=>{},showDamageNumber:()=>{},showSlashEffect:()=>{},
 TargetingResolver:{collect:(o,c)=>c.filter(Boolean)},MovementEffectResolver:{knockback:()=>true},StatusManager:{apply:()=>({applied:true})},
 CombatDamagePipeline:{resolvePhysicalSkill:(p,l,t,o)=>{lastPhysical={...o};return{damage:Number(o.ratio||1)};},resolveMagicSkill:()=>({damage:1})},
 MultiHitResolver:{normalize:(p)=>({damageHitCount:Number(p.damageHitCount||1),visualHitCount:Number(p.visualHitCount||1),statusProcMode:'once'}),split:d=>[d]},HitResolver:{resolve:()=>({hit:true})},CriticalResolver:{resolve:()=>({critical:false,multiplier:1})},PerfectDodgeResolver:{resolve:()=>({dodged:false})}
};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);
function assert(c,m){if(!c)throw new Error(m);}
assert(Object.values(generated).filter(x=>x.implementationMode==='official'&&x.executionEnabled).length>=452,'official coverage must not regress below 452');
assert(pending.length<=687,'pending count must not regress above 687');
for(const id of [2255,2276,2277,2278,2279,2280]){assert(runtimeProfiles[id]?.handler!=='pending','runtime '+id);assert(!pending.some(x=>Number(x.skillId)===id),'pending '+id);}
let totals=ctx.getPassiveSkillBonusTotals();assert(totals.atkFlat===125,'axe ATK '+totals.atkFlat);assert(totals.hitFlat===30,'axe HIT '+totals.hitFlat);
ctx.player.weaponType='Mace';totals=ctx.getPassiveSkillBonusTotals();assert(totals.atkFlat===115,'mace ATK '+totals.atkFlat);assert(totals.hitFlat===20,'mace HIT '+totals.hitFlat);ctx.player.weaponType='1hAxe';
assert(ctx.getPassiveTargetDamageBonus(monster)===50,'Fire outgoing flat');assert(ctx.getPassiveIncomingFlatReduction(monster)===50,'Fire incoming flat');
ctx.calculateSkillAttackDamage(core['2278'],5,monster,{});assert(lastPhysical.ratio===520,'Axe Boomerang '+lastPhysical.ratio);
ctx.calculateSkillAttackDamage(core['2279'],10,monster,{});assert(lastPhysical.ratio===1390,'Power Swing '+lastPhysical.ratio);
ctx.calculateSkillAttackDamage(core['2280'],5,monster,{});assert(lastPhysical.ratio===1140,'Axe Tornado '+lastPhysical.ratio);
assert(runtimeProfiles['2279'].statusChancePercent===10&&runtimeProfiles['2279'].statusDuration===2000,'Power Swing stun');
assert(JSON.stringify(runtimeProfiles['2280'].targeting.radius)===JSON.stringify([2,2,3,3,3]),'Tornado radius');
for(const bucket of ['plagiarism','reproduce'])for(const id of [2255,2276,2277])assert(!(copyable[bucket]||[]).some(x=>Number(x.skillId)===id),'passive copy exclusion '+bucket+' '+id);
console.log(JSON.stringify({result:'PASS',official:452,pending:687,axeTotals:{atkFlat:125,hitFlat:30},maceTotals:{atkFlat:115,hitFlat:20},researchFireEarth:50,axeBoomerangLv5:520,powerSwingLv10:1390,axeTornadoLv5:1140},null,2));
