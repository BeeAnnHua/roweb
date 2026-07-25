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
assert(motions.length===1&&motions[0].motion==='attack','Magic damage skill must start equipped-weapon Attack preparation immediately');
assert(motions[0].options.duration===4400,'Preparation duration must match RA total cast time');
assert(motions[0].options.frameSegment==='prepare','Cast-time damage skill must use only preparation frames before completion');
assert(motions[0].options.holdSegmentLast===true,'Preparation must hold its final ready pose instead of looping');
assert(motions[0].options.compressFrames!==true,'Preparation frames must use native speed, then hold');
const blocked=ctx.canCastSkill(skills['5'],10);
assert(blocked.ok===false&&String(blocked.reason).includes('詠唱中'),'Instant skill must not interrupt another skill cast');
now=5400;tick();
assert(completed===1,'Fire Bolt completion callback missing');
assert(ctx.isRuntimeSkillCasting()===false,'Cast state was not cleared');
assert(motions.length===2,'Completed cast must add exactly one release segment');
assert(motions[1].motion==='attack'&&motions[1].options.frameSegment==='release','Damage must use final Attack release frames at completion');
assert(motions[1].options.duration===undefined,'Release segment must use its native frame duration');

motions=[];tick=null;completed=0;now=10000;ctx.player.skillTimingState={};
const finger=skills['267'];
assert(ctx.beginRuntimeSkillCast(finger,5,()=>{ctx.paySkillCost(finger,5);completed++;})===true,'Finger Offensive cast did not begin');
assert(motions.length===1&&motions[0].motion==='attack','Physical cast-time skill must use weapon Attack preparation');
assert(motions[0].options.duration===1000,'Physical skill preparation duration must include RA variable + fixed cast time');
assert(motions[0].options.frameSegment==='prepare'&&motions[0].options.holdSegmentLast===true,'Physical cast preparation must hold the ready pose');
now=11000;tick();
assert(completed===1,'Finger Offensive completion callback missing');
assert(motions.length===2,'Physical cast completion must add exactly one release segment');
assert(motions[1].motion==='attack'&&motions[1].options.frameSegment==='release','Physical hit must use final Attack release frames');
const cooldown=ctx.getRuntimeSkillDelayBlock(finger,5);
assert(cooldown&&cooldown.type==='cooldown','RA cooldown must start after cast completion');
assert(ctx.isRuntimeSkillMovementDelayed()===true,'RA AfterCastWalkDelay must start after cast completion');

motions=[];tick=null;completed=0;now=20000;ctx.player.skillTimingState={};
const blessing=skills['66'];
assert(ctx.beginRuntimeSkillCast(blessing,10,()=>{ctx.paySkillCost(blessing,10);completed++;})===true,'Blessing cast did not begin');
assert(motions.length===1&&motions[0].motion==='cast','Buff cast must use weaponless Cast preparation');
assert(motions[0].options.frameSegment==='prepare'&&motions[0].options.holdSegmentLast===true,'Buff preparation must stop on the ready pose instead of looping all six frames');
const buffEnds=ctx.getRuntimeSkillCastState().endsAt;now=buffEnds;tick();
assert(completed===1,'Blessing completion callback missing');
assert(motions.length===2,'Buff completion must add exactly one Cast release segment');
assert(motions[1].motion==='cast'&&motions[1].options.frameSegment==='release','Buff effect must use final Cast frames exactly once');

console.log(JSON.stringify({version:'0.9.82EY',status:'PASS',magicDamageMotion:'attack',logs:logs.length,buffCast:{motion:'cast',releaseSegment:true},physicalCast:{motion:'attack',prepareMs:1000,releaseSegment:true,walkDelayMs:800,cooldownMs:1000}},null,2));
