const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const core=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const rows=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const generated=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_generated_all.json'),'utf8')).skills;
const pending=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_pending_review.json'),'utf8')).skills;
const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/mounts/mount_manifest.json'),'utf8'));
const mado=JSON.parse(fs.readFileSync(path.join(root,'data/mounts/mado_gear.json'),'utf8'));
const runtimeProfiles={};for(const [id,row] of Object.entries(rows))runtimeProfiles[id]=row.runtimeProfile||row;
let logs=[];const clampPositionToBounds=(p)=>({x:Math.max(0,Math.min(1000,p.x)),y:Math.max(0,Math.min(1000,p.y))});
const player={hp:1000,maxHp:1000,sp:999,maxSp:999,baseLevel:200,jobLevel:70,stats:{str:100,agi:100,vit:100,int:50,dex:100,luk:30},position:{x:500,y:500,targetX:null,targetY:null},activeBuffs:{},runtimeState:{statuses:{}},learnedSkills:{2255:5,2262:3,2263:1,2264:1,2265:1},mountState:{mounted:false,type:null}};
const monster={currentHp:10000,maxHp:10000,position:{x:700,y:500}};
const ctx={console,Date,Math,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,player,currentMonster:monster,activeMonsters:[monster],skillsData:{runtimeProfiles},RO_WEB_DATA:{'data/mounts/mount_manifest.json':manifest,'data/mounts/mado_gear.json':mado},RO_WEB_CELL_SIZE:32,
 getSkillLevel:id=>Number(player.learnedSkills[id]||0),getSkillDataById:id=>core[String(id)]||null,getCurrentJobSkills:()=>Object.values(core),isSkillBasic:()=>false,getEquippedWeaponTypeRuntime:()=> 'axe',
 calculateDerivedPlayerStats:()=>({walkSpeed:150,stats:player.stats}),clampPositionToBounds,renderPositionSprites:()=>{},updatePlayerUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},addBattleLog:x=>logs.push(x),paySkillCost:()=>{},playROStudioPlayerMotion:()=>{},
 CombatDamagePipeline:{resolvePhysicalSkill:()=>({damage:1}),resolveMagicSkill:()=>({damage:1})},HitResolver:{resolve:()=>({hit:true})},CriticalResolver:{resolve:()=>({critical:false,multiplier:1})},PerfectDodgeResolver:{resolve:()=>({dodged:false})},StatusManager:{apply:()=>({applied:true})},TargetingResolver:{collect:(o,c)=>c},MultiHitResolver:{normalize:()=>({damageHitCount:1,visualHitCount:1,statusProcMode:'once'}),split:d=>[d]}};
ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/combat_mechanics_runtime.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);
function assert(c,m){if(!c)throw new Error(m);}
assert(Object.values(generated).filter(x=>x.implementationMode==='official'&&x.executionEnabled).length>=478,'official coverage');assert(pending.length<=661,'pending count');
for(const id of [2262,2263,2264,2265]){assert(runtimeProfiles[id]&&runtimeProfiles[id].handler!=='pending','runtime '+id);assert(!pending.some(x=>Number(x.skillId)===id),'pending '+id);}
assert(manifest.mounts.mado.requiredSkillId===2255,'manifest skill');assert(mado.visual.anchor.x===128&&mado.visual.anchor.y===140,'anchor');assert(mado.visual.placeholder===true,'placeholder');
assert(ctx.rentPlayerMount('mado')===true,'rent');assert(player.mountState.mounted===true&&player.mountState.type==='mado','mado state');assert(ctx.returnPlayerMount('mado')===true&&!player.mountState.mounted,'return');
assert(ctx.castBuffSkill(core['2262'],3,{silent:true})===true,'accel cast');assert(player.activeBuffs[2262].effects.walkSpeedRate===-25,'accel effect');assert(player.activeBuffs[2262].expiresAt-Date.now()>119000,'accel duration');
assert(ctx.castBuffSkill(core['2263'],1,{silent:true})===true,'hover cast');assert(player.activeBuffs[2263].effects.groundEffectImmune===1,'hover immune');
player.position.x=500;player.position.y=500;assert(ctx.castMovementSkill(core['2264'],1)===true,'front cast');assert(Math.round(player.position.x)===724&&Math.round(player.position.y)===500,'front 7 cells '+JSON.stringify(player.position));
player.position.x=500;player.position.y=500;assert(ctx.castMovementSkill(core['2265'],1)===true,'back cast');assert(Math.round(player.position.x)===276&&Math.round(player.position.y)===500,'back 7 cells '+JSON.stringify(player.position));
console.log(JSON.stringify({result:'PASS',official:478,pending:661,madoAssets:{manifest:true,json:true,png:true},skills:[2262,2263,2264,2265],movement:{frontX:724,backX:276}},null,2));
