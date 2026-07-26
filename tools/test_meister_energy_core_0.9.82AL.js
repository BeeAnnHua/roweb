const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const core=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const rows=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const generated=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_generated_all.json'),'utf8')).skills;
const pending=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_pending_review.json'),'utf8')).skills;
const runtimeProfiles={};for(const [id,row] of Object.entries(rows))runtimeProfiles[id]=row.runtimeProfile||row;
let lastPhysical=null;
const monster={name:'能量測試魔物',currentHp:999999999,maxHp:999999999,level:250,size:'Large',race:'Formless',element:'Neutral',position:{x:2,y:0},runtimeState:{statuses:{}}};
const learned={6002:10,6003:5,6508:5};
const ctx={console,Date,Math,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,
 player:{hp:100000,maxHp:100000,sp:999999,maxSp:999999,baseLevel:200,jobLevel:50,stats:{str:100,agi:80,vit:80,int:30,dex:100,luk:30,pow:20},traitStats:{pow:20},position:{x:0,y:0},activeBuffs:{},runtimeState:{statuses:{}},learnedSkills:learned,equipment:{weapon:1},weaponType:'2hAxe'},
 currentMonster:monster,activeMonsters:[monster],skillsData:{runtimeProfiles},
 getSkillLevel:id=>Number(ctx.player.learnedSkills[id]||0),getSkillDataById:id=>core[String(id)]||null,getCurrentJobSkills:()=>Object.values(core),isSkillBasic:()=>false,
 calculateDerivedPlayerStats:()=>({atk:1000,matk:100,stats:{...ctx.player.stats,pow:20}}),getItemData:()=>({dbSubType:'2hAxe',weight:2000}),getEquippedWeaponTypeRuntime:()=> '2hAxe',isPlayerMounted:()=>false,
 updatePlayerUI:()=>{},updateMonsterUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},renderPositionSprites:()=>{},addBattleLog:()=>{},defeatMonster:()=>{},paySkillCost:()=>{},
 playROStudioPlayerMotion:()=>{},playPlayerAttackAnimation:()=>{},playMonsterHitAnimation:()=>{},showDamageNumber:()=>{},showSlashEffect:()=>{},canAttackMonsterByRange:()=>true,
 TargetingResolver:{collect:(o,c)=>c.filter(Boolean)},MovementEffectResolver:{knockback:()=>true},StatusManager:{apply:()=>({applied:true})},
 CombatDamagePipeline:{resolvePhysicalSkill:(p,l,t,o)=>{lastPhysical={profile:p,...o};return{damage:Number(o.ratio||1)};},resolveMagicSkill:()=>({damage:1})},
 MultiHitResolver:{normalize:(p)=>({damageHitCount:Number(p.damageHitCount||1),visualHitCount:Number(p.visualHitCount||1),statusProcMode:'once'}),split:(d,h)=>Array.from({length:h},(_,i)=>Math.floor(d/h)+(i<d%h?1:0))},
 HitResolver:{resolve:()=>({hit:true})},CriticalResolver:{resolve:()=>({critical:false,multiplier:1})},PerfectDodgeResolver:{resolve:()=>({dodged:false})}
};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);
function assert(c,m){if(!c)throw new Error(m);}function ratio(id,lv){const out=ctx.calculateSkillAttackDamage(core[String(id)],lv,monster,{});assert(out!==null,'null damage '+id);return lastPhysical.ratio;}
assert(Object.values(generated).filter(x=>x.implementationMode==='official'&&x.executionEnabled).length>=474,'official coverage regression');
assert(pending.length<=665,'pending count regression');
for(const id of [6002,6003,6508]){assert(runtimeProfiles[id]?.handler==='physical_attack_formula','runtime '+id);assert(!pending.some(x=>Number(x.skillId)===id),'pending '+id);}
assert(core['6002'].name==='閃光衝擊波','Spark name');assert(core['6003'].name==='三連雷射','Triple name');assert(core['6508'].name==='能量轟炸','Energy name');
assert(ratio(6002,10)===58800,'Spark total ratio '+ratio(6002,10));
assert(ratio(6003,5)===39840,'Triple total ratio '+ratio(6003,5));
assert(ratio(6508,5)===57400,'Energy total ratio '+ratio(6508,5));
assert(runtimeProfiles[6002].damageHitCount===2&&runtimeProfiles[6002].flags.ignoreDefense===true,'Spark metadata');
assert(runtimeProfiles[6002].targeting.radius[0]===3&&runtimeProfiles[6002].targeting.radius[9]===4,'Spark area');
assert(runtimeProfiles[6003].damageHitCount===3&&runtimeProfiles[6003].criticalMode==='allowed'&&runtimeProfiles[6003].criticalDamageBonusRateMultiplier===0.5,'Triple critical metadata');
assert(runtimeProfiles[6508].damageHitCount===7&&runtimeProfiles[6508].flags.ignoreDefense===true,'Energy metadata');
assert(JSON.stringify(runtimeProfiles[6508].targeting.radius)===JSON.stringify([2,2,3,3,4]),'Energy area');
console.log(JSON.stringify({result:'PASS',official:474,pending:665,skills:[6002,6003,6508],ratios:{sparkBlasterLv10PerHit:29400,sparkBlasterLv10Total:58800,tripleLaserLv5PerHit:13280,tripleLaserLv5Total:39840,energyCannonadeLv5PerHit:8200,energyCannonadeLv5Total:57400}},null,2));
