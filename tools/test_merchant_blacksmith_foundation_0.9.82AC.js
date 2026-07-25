const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const core=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const rows=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const generated=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_generated_all.json'),'utf8')).skills;
const pending=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_pending_review.json'),'utf8')).skills;
const runtimeProfiles={};for(const [id,row] of Object.entries(rows))runtimeProfiles[id]=row.runtimeProfile||row;
let lastPhysical=null;const logs=[];
const monster={name:'測試魔物',currentHp:999999,maxHp:999999,size:'Medium',race:'Formless',element:'Neutral',position:{x:1,y:0},runtimeState:{statuses:{}}};
const ctx={console,Date,Math,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,
 player:{hp:10000,maxHp:10000,sp:9999,maxSp:9999,baseLevel:200,jobLevel:70,stats:{str:100,agi:80,vit:80,int:40,dex:80,luk:30},position:{x:0,y:0},activeBuffs:{},runtimeState:{statuses:{}},learnedSkills:{39:10,153:1,155:1,459:1,387:1,485:10,486:5},equipment:{weapon:1}},
 currentMonster:monster,activeMonsters:[monster],skillsData:{runtimeProfiles},
 getSkillLevel:id=>Number(ctx.player.learnedSkills[id]||0),getSkillDataById:id=>core[String(id)]||null,getCurrentJobSkills:()=>Object.values(core),isSkillBasic:()=>false,
 calculateDerivedPlayerStats:()=>({atk:500,matk:100,stats:{...ctx.player.stats}}),getItemData:()=>({dbSubType:'1hAxe'}),isPlayerMounted:()=>false,
 updatePlayerUI:()=>{},updateMonsterUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},renderPositionSprites:()=>{},addBattleLog:s=>logs.push(s),
 playROStudioPlayerMotion:()=>{},playPlayerAttackAnimation:()=>{},playMonsterHitAnimation:()=>{},showDamageNumber:()=>{},showSlashEffect:()=>{},
 TargetingResolver:{collect:(o,c)=>c.filter(Boolean)},MovementEffectResolver:{knockback:()=>true},
 StatusManager:{apply:(target,status,opt)=>{target.runtimeState.statuses[String(status).toLowerCase().replace(/[ _-]/g,'')]={effects:opt.effects||{},durationMs:opt.durationMs};return{applied:true};}},
 CombatDamagePipeline:{resolvePhysicalSkill:(p,l,t,o)=>{lastPhysical={...o};return{damage:Number(o.ratio||1)};},resolveMagicSkill:()=>({damage:1})},
 MultiHitResolver:{normalize:()=>({damageHitCount:1,visualHitCount:1,statusProcMode:'once'}),split:(d)=>[d]},HitResolver:{resolve:()=>({hit:true})},CriticalResolver:{resolve:()=>({critical:false,multiplier:1})},PerfectDodgeResolver:{resolve:()=>({dodged:false})}
};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);
function assert(c,m){if(!c)throw new Error(m);}
assert(Object.values(generated).filter(x=>x.implementationMode==='official'&&x.executionEnabled).length>=452,'official coverage must not regress below 452');
assert(pending.length<=687,'pending count must not regress above 687');
for(const id of [39,153,459,387,485,486]){assert(runtimeProfiles[id]&&runtimeProfiles[id].handler!=='pending','profile '+id);assert(!pending.some(x=>Number(x.skillId)===id),'pending '+id);}
ctx.calculateSkillAttackDamage(core['153'],1,monster,{});assert(lastPhysical.ratio===250,'cart revolution full cart '+lastPhysical.ratio);
ctx.calculateSkillAttackDamage(core['485'],10,monster,{});assert(lastPhysical.ratio===1333,'cart termination Lv10 '+lastPhysical.ratio);
ctx.player.learnedSkills[39]=0;ctx.calculateSkillAttackDamage(core['153'],1,monster,{});assert(lastPhysical.ratio===250,'cart revolution without pushcart '+lastPhysical.ratio);ctx.player.learnedSkills[39]=10;
assert(ctx.castBuffSkill(core['155'],1),'loud');assert(ctx.player.activeBuffs['155'].effects.strFlat===4&&ctx.player.activeBuffs['155'].effects.atkFlat===30,'loud effects');
assert(ctx.castBuffSkill(core['459'],1),'adrenaline2');assert(ctx.player.activeBuffs['459'].effects.aspdRate===30,'adrenaline2 effect');
assert(ctx.castBuffSkill(core['387'],1),'cart boost');assert(ctx.player.activeBuffs['387'].effects.walkSpeedRate===-20,'cart boost effect');
assert(ctx.castBuffSkill(core['486'],5),'overthrust max');assert(ctx.player.activeBuffs['486'].effects.physicalDamageRate===100,'overthrust max effect');
assert(runtimeProfiles['485'].statusChancePercent[9]===50&&runtimeProfiles['485'].statusDuration===4500,'termination stun');
console.log(JSON.stringify({result:'PASS',official:452,pending:687,cartRevolutionFull:250,cartTerminationLv10:1333,loud:ctx.player.activeBuffs['155'].effects,overthrustMax:ctx.player.activeBuffs['486'].effects},null,2));
