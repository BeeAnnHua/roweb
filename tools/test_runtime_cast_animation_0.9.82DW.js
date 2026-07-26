const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
const skills={...read('data/skills/skills_core_1.json').skills,...read('data/skills/skills_core_2.json').skills};
const runtime={};
for(const rel of ['data/skill_runtime/runtime_generated_all.json','data/skill_runtime/runtime_core_1_v1.json']){
  for(const [id,row] of Object.entries(read(rel).skills))runtime[id]=row;
}
let now=1000,tick=null,motions=[],completed=0,logs=[];
class FakeDate extends Date{static now(){return now;}}
const ctx={console,Math,Date:FakeDate,JSON,Number,String,Object,Array,Set,Map,Promise,performance:{now:()=>now},window:{},document:undefined,
 player:{aspd:190,sp:99999,hp:99999,maxHp:99999,zeny:99999,activeBuffs:{},runtimeState:{},skillTimingState:{},position:{}},
 skillsData:{runtimeProfiles:runtime,skillIndex:skills},getSkillLevel:id=>id===267?5:10,getActiveBuffBonusTotals:()=>({}),getPassiveSkillBonusTotals:()=>({}),
 recalculatePlayerStats:()=>{},addBattleLog:t=>logs.push(t),saveGame:()=>{},updatePlayerUI:()=>{},
 setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>{},setTimeout:()=>1,clearTimeout:()=>{},
 playROStudioPlayerMotion:(motion,options={})=>{motions.push({motion,options:{...options}});return true;},
 canPlayerAttackNow:()=>true,markPlayerAttackUsed:()=>{},getPlayerAttackDelayMs:()=>200,getPlayerAttackRemainingMs:()=>0};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/skill_engine.js'),'utf8'),ctx,{filename:'skill_engine.js'});
const assert=(c,m)=>{if(!c)throw new Error(m)};

const fire=skills['19'];
assert(ctx.beginRuntimeSkillCast(fire,10,()=>{ctx.paySkillCost(fire,10);completed++;})===true,'Fire Bolt cast did not begin');
assert(ctx.isRuntimeSkillCasting()===true,'Cast state missing');
assert(motions.length===1&&motions[0].motion==='attack','Magic damage skill must start equipped-weapon Attack animation immediately');
assert(motions[0].options.duration===4400,'Cast animation duration must match RA total cast time');
assert(motions[0].options.compressFrames===true,'Cast-time damage skill should stretch one complete Attack cycle');
const blocked=ctx.canCastSkill(skills['5'],10);
assert(blocked.ok===false&&String(blocked.reason).includes('詠唱中'),'Instant skill must not interrupt another skill cast');
now=5400;tick();
assert(completed===1,'Fire Bolt completion callback missing');
assert(ctx.isRuntimeSkillCasting()===false,'Cast state was not cleared');
assert(motions.length===1,'Completed cast must not replay a second action animation');

motions=[];tick=null;completed=0;now=10000;ctx.player.skillTimingState={};
const finger=skills['267'];
assert(ctx.beginRuntimeSkillCast(finger,5,()=>{ctx.paySkillCost(finger,5);completed++;})===true,'Finger Offensive cast did not begin');
assert(motions.length===1&&motions[0].motion==='attack','Physical cast-time skill must use weapon Attack motion');
assert(motions[0].options.duration===1000,'Physical skill cast duration must include RA variable + fixed cast time');
assert(motions[0].options.compressFrames===true,'Physical cast-time skill should stretch one complete Attack cycle');
now=11000;tick();
assert(completed===1,'Finger Offensive completion callback missing');
assert(motions.length===1,'Physical cast completion must not duplicate Attack animation');
const cooldown=ctx.getRuntimeSkillDelayBlock(finger,5);
assert(cooldown&&cooldown.type==='cooldown','RA cooldown must start after cast completion');
assert(ctx.isRuntimeSkillMovementDelayed()===true,'RA AfterCastWalkDelay must start after cast completion');

console.log(JSON.stringify({version:'0.9.82EX',status:'PASS',magicDamageMotion:'attack',logs:logs.length,physicalCast:{motion:'attack',durationMs:1000,walkDelayMs:800,cooldownMs:1000}},null,2));
