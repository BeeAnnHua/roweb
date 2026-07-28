const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const skills=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const rtRows=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const pending=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_pending_review.json'),'utf8')).skills;
const runtimeProfiles={};for(const [id,row] of Object.entries(rtRows))runtimeProfiles[id]=row.runtimeProfile||row;
const logs=[];const DMath=Object.create(Math);DMath.random=()=>0;
const ctx={console,Date,Math:DMath,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,
 player:{hp:10000,maxHp:10000,sp:1000,maxSp:1000,baseLevel:200,jobLevel:70,stats:{str:100,agi:90,dex:80,int:50,vit:80,luk:30},position:{x:0,y:0},activeBuffs:{},runtimeState:{statuses:{}},combatResources:{},learnedSkills:{2333:5},equipment:{}},
 currentMonster:{name:'近距離測試怪',level:100,baseLevel:100,currentHp:100000,maxHp:100000,def:500,mdef:200,race:'DemiHuman',element:'Neutral',size:'Medium',attackRange:1,position:{x:1,y:0},runtimeState:{statuses:{}}},
 activeMonsters:null,mapMonsters:null,skillsData:{runtimeProfiles},
 getSkillLevel:(id)=>Number(ctx.player.learnedSkills[id]||0),getSkillDataById:(id)=>skills[String(id)]||null,getCurrentJobSkills:()=>Object.values(skills),getExtraSkillSkillList:()=>[],isSkillBasic:()=>false,
 calculateDerivedPlayerStats:()=>({atk:500,matk:300,stats:{...ctx.player.stats}}),getItemData:()=>null,getSkillRangePx:()=>9999,canAttackMonsterByRange:()=>true,movePlayerTowardMonster:()=>{},movePlayerAdjacentToMonster:()=>true,
 updatePlayerUI:()=>{},updateMonsterUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},renderPositionSprites:()=>{},addBattleLog:s=>logs.push(s),playROStudioPlayerMotion:()=>{},playPlayerAttackAnimation:()=>{},playMonsterHitAnimation:()=>{},showDamageNumber:()=>{},showSlashEffect:()=>{},defeatMonster:()=>{},
 MultiHitResolver:{normalize:()=>({damageHitCount:1,visualHitCount:1,statusProcMode:'once'}),split:(d)=>[d]},CombatDamagePipeline:{resolvePhysicalSkill:(p,l,t,o)=>({damage:Math.floor(o.ratio||1)}),resolveMagicSkill:(p,l,t,o)=>({damage:Math.floor(o.ratio||1)})},TargetingResolver:{collect:(o,c)=>c.filter(Boolean)},HitResolver:{resolve:()=>({hit:true})},CriticalResolver:{resolve:()=>({critical:false,multiplier:1})},PerfectDodgeResolver:{resolve:()=>({dodged:false})},MovementEffectResolver:{knockback:()=>{throw new Error('knockback must not be called');},backslide:()=>true,moveAdjacent:()=>true},StatusManager:{apply:()=>({applied:true})},RO_WEB_CELL_SIZE:32
};ctx.window=ctx;ctx.activeMonsters=[ctx.currentMonster];vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'js/combat_resource_manager.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);
function assert(c,m){if(!c)throw new Error(m);}ctx.CombatResourceManager.configure('spiritSphere',{max:5,start:5,durationMs:600000});
assert(ctx.castBuffSkill(skills['2333'],5),'cast failed');assert(ctx.CombatResourceManager.get('spiritSphere')===3,'sphere cost');assert(ctx.player.sp===920,'SP cost '+ctx.player.sp);
const buff=ctx.player.activeBuffs['2333'];assert(buff&&buff.effects.crescentElbowChance===100,'chance '+JSON.stringify(buff));
assert(ctx.castBuffSkill(skills['2333'],5)===false,'duplicate cast must fail');assert(ctx.CombatResourceManager.get('spiritSphere')===3&&ctx.player.sp===920,'duplicate consumed cost');
const result=ctx.tryCrescentElbowCounter(ctx.currentMonster,100);assert(result.triggered,'counter not triggered');assert(result.ratio===5000,'ratio cap '+result.ratio);assert(result.damage===25200,'counter damage '+result.damage);assert(result.recoil===2520,'recoil '+result.recoil);assert(ctx.player.hp===7480,'player recoil HP '+ctx.player.hp);assert(ctx.currentMonster.currentHp===74800,'monster HP '+ctx.currentMonster.currentHp);assert(!ctx.player.activeBuffs['2333'],'buff not consumed');
assert(!ctx.tryCrescentElbowCounter(ctx.currentMonster,100).triggered,'counter should be one-shot');assert(!pending.some(x=>Number(x.skillId)===2333),'still pending');assert(Object.keys(rtRows).length>=360,'coverage');
console.log(JSON.stringify({result:'PASS',coverage:Object.keys(rtRows).length,pending:pending.length,chance:100,ratio:result.ratio,damage:result.damage,recoil:result.recoil,noKnockback:true,logs},null,2));
