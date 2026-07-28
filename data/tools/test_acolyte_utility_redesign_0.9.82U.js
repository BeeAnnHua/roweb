const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const skills=read('data/skills/skills_core_1.json').skills;
const core=read('data/skill_runtime/runtime_core_1_v1.json').skills;
const gen=read('data/skill_runtime/runtime_generated_all.json');
const pen=read('data/skill_runtime/runtime_pending_review.json');
const ids=[24,26,31,1014];
for(const id of ids){if(!core[String(id)])throw Error('missing '+id);if(gen.skills[String(id)].implementationMode!=='official')throw Error('not official '+id);}
if(pen.skills.some(x=>ids.includes(Number(x.skillId))))throw Error('still pending');
if(skills['26'].maxLevel!==1)throw Error('teleport max level');
for(const id of [24,31,1014]){const b=core[String(id)].runtimeProfile.passiveBonuses;if(b.atkRate!==3||b.matkRate!==3)throw Error('passive mismatch '+id);}
for(const file of ['data/skill_trees/acolyte.json','data/skill_trees/supernovice.json']){const t=read(file);const tp=t.skills.find(x=>x.skillId===26);if(tp.maxLevel!==1)throw Error('tree max '+file);const warp=t.skills.find(x=>x.skillId===27);if(warp.requires.find(x=>x.skillId===26).level!==1)throw Error('warp prereq '+file);}
const runtimeProfiles={};for(const [id,row] of Object.entries(core))runtimeProfiles[id]=row.runtimeProfile||row;
const logs=[];const ctx={console,Date,Math,window:null,
 player:{sp:100,maxSp:100,currentCity:null,position:{x:10,y:20},learnedSkills:{26:1},activeBuffs:{}},currentMonster:{aiState:'CHASE'},skillsData:{runtimeProfiles},
 getSkillLevel:id=>id===26?1:0,randomPositionInBattleField:()=>({x:333,y:444}),clampPositionToBounds:p=>p,normalizePositionData:()=>{},renderPositionSprites:()=>{},updatePlayerUI:()=>{},saveGame:()=>{},addBattleLog:s=>logs.push(s),getCurrentJobSkills:()=>[],getExtraSkillSkillList:()=>[],isSkillBasic:()=>false
};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);
if(!ctx.castTeleportSkill(skills['26'],1))throw Error('teleport cast failed');
if(ctx.player.position.x!==333||ctx.player.position.y!==444||ctx.player.sp!==90||ctx.currentMonster.aiState!=='IDLE')throw Error('teleport result '+JSON.stringify(ctx.player));
console.log(JSON.stringify({result:'PASS',official:gen.summary.official,pending:pen.summary.pending,position:ctx.player.position,sp:ctx.player.sp,log:logs.at(-1)},null,2));
