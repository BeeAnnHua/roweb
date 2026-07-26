const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const core=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const rows=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const generated=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_generated_all.json'),'utf8')).skills;
const pending=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_pending_review.json'),'utf8')).skills;
const runtimeProfiles={};for(const [id,row] of Object.entries(rows))runtimeProfiles[id]=row.runtimeProfile||row;
let logs=[];
const player={hp:1000,maxHp:1000,sp:500,maxSp:500,baseLevel:200,jobLevel:70,stats:{str:100,agi:100,vit:100,int:50,dex:100,luk:30},position:{x:0,y:0},activeBuffs:{},runtimeState:{statuses:{}},learnedSkills:{2255:5,2259:3,2266:4,2267:3},mountState:{mounted:true,type:'mado'},equipment:{}};
const monster={name:'測試怪物',currentHp:200000,maxHp:200000,position:{x:32,y:0},worldX:32,worldY:0,runtimeState:{statuses:{}},def:9999,flee:9999};
const ctx={console,Date,Math:Object.create(Math),setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,player,currentMonster:monster,activeMonsters:[monster],skillsData:{runtimeProfiles},RO_WEB_CELL_SIZE:32,
 getSkillLevel:id=>Number(player.learnedSkills[id]||0),getSkillDataById:id=>core[String(id)]||null,getCurrentJobSkills:()=>Object.values(core),isSkillBasic:()=>false,getEquippedWeaponTypeRuntime:()=> 'axe',
 calculateDerivedPlayerStats:()=>({atk:100,attack:100,def:100,mdef:100,stats:player.stats}),renderPositionSprites:()=>{},updatePlayerUI:()=>{},updateMonsterUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},addBattleLog:x=>logs.push(x),paySkillCost:()=>{},playROStudioPlayerMotion:()=>{},playPlayerAttackAnimation:()=>{},playMonsterHitAnimation:()=>{},showDamageNumber:()=>{},showSlashEffect:()=>{},
 CombatDamagePipeline:{resolvePhysicalSkill:(profile,lv,target,opt)=>({damage:Number(opt.ratio||1)}),resolveMagicSkill:()=>({damage:1})},HitResolver:{resolve:()=>({hit:true})},CriticalResolver:{resolve:()=>({critical:false,multiplier:1})},PerfectDodgeResolver:{resolve:()=>({dodged:false})}};
ctx.Math.random=()=>0;ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/combat_mechanics_runtime.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);
function assert(c,m){if(!c)throw new Error(m);}
assert(Object.values(generated).filter(x=>x.implementationMode==='official'&&x.executionEnabled).length>=484,'official coverage must not regress');assert(pending.length<=655,'pending count must not regress');
for(const id of [2259,2267]){assert(runtimeProfiles[id]&&runtimeProfiles[id].handler!=='pending','runtime '+id);assert(!pending.some(x=>Number(x.skillId)===id),'pending '+id);}
let flame=ctx.calculateSkillAttackDamage(core['2259'],3,monster,{});assert(flame===1600,'flame ratio '+flame);
monster.currentHp=200000;monster.runtimeState={statuses:{}};assert(ctx.castAttackSkill(core['2259'],3,{skipHitCheck:true})===true,'flame cast');let burning=monster.runtimeState.statuses.burning;assert(burning&&burning.expiresAt-Date.now()>20900,'burning duration');
monster.currentHp=200000;monster.runtimeState={statuses:{}};player.mountState={mounted:true,type:'mado'};player.hp=1000;player.sp=500;
let selfDmg=ctx.calculateSkillAttackDamage(core['2267'],3,monster,{preCastHp:1000,preCastSp:500});assert(selfDmg===58600,'self damage '+selfDmg);
assert(ctx.castAttackSkill(core['2267'],3,{skipHitCheck:true})===true,'self cast');assert(monster.currentHp===141400,'self applied '+monster.currentHp);assert(player.mountState.mounted===false,'mado returned');assert(player.sp===500,'sp deferred');
console.log(JSON.stringify({result:'PASS',official:484,pending:655,skills:[2259,2267],flameLv3Base200Ratio:1600,burningMs:21000,selfDestructionDamage:58600,madoReturned:true,spCostDeferred:true},null,2));
