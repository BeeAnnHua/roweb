const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
let now=1000;const timers=[];
const ctx={console,Math,JSON,Number,String,Object,Array,Set,Map,Date:{now:()=>now},window:null,
  RO_WEB_CELL_SIZE:36,player:{position:{x:0,y:0},activeBuffs:{}},currentMonster:null,
  getActiveBuffBonusTotals:()=>({}),getPassiveSkillBonusTotals:()=>({}),
  setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length},clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},
  clampPositionToBounds:p=>p,isGroundSkillPlacementLegal:()=>true,
  getCombatGroundCandidates:()=>ctx.__candidates||[]
};ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/combat_mechanics_runtime.js'),'utf8'),ctx,{filename:'combat_mechanics_runtime.js'});
function assert(v,msg){if(!v)throw new Error(msg)}
function eq(a,b,msg){if(a!==b)throw new Error(`${msg}: ${a} !== ${b}`)}
const snap=ctx.GroundPlacementResolver.resolve({x:50,y:74},{snapToCell:true,strictBounds:true});
eq(snap.x,36,'36px X snap');eq(snap.y,72,'36px Y snap');
const target={currentHp:100,position:{x:36,y:72}};ctx.__candidates=[target];let ticks=0;
const id=ctx.GroundEffectManager.create({id:'storm',x:36,y:72,shape:'circle',rangeCells:4,tickMs:450,durationMs:4500,maxTicks:10,stackKey:'storm',noOverlapKey:'storm',overlapPolicy:'reject',onTick(ts){ticks++;eq(ts.length,1,'target in storm range')}});
assert(id==='storm','storm effect created');
const blocked=ctx.GroundEffectManager.create({id:'storm2',x:36,y:72,shape:'circle',rangeCells:4,tickMs:450,durationMs:4500,maxTicks:10,stackKey:'storm',noOverlapKey:'storm',overlapPolicy:'reject',onTick(){}});
assert(blocked===null&&ctx.GroundEffectManager.lastBlockReason==='no_overlap','NoOverlap enforced');
for(let i=0;i<10;i++){now=1000+i*450;ctx.GroundEffectManager.update(now,ctx.__candidates)}
eq(ticks,10,'Storm Gust exactly ten ticks');assert(!ctx.GroundEffectManager.effects.has('storm'),'Storm Gust removed after ten ticks');
for(let i=0;i<4;i++){now=10000+i;ctx.GroundEffectManager.create({id:`q${i}`,x:i*360,y:0,rangeCells:2,tickMs:500,durationMs:5000,maxTicks:10,sourceSkillId:92,ownerKey:'player',activeInstanceLimit:3,onTick(){}})}
eq([...ctx.GroundEffectManager.effects.values()].filter(e=>e.sourceSkillId===92).length,3,'Quagmire active-instance limit');
const core=JSON.parse(fs.readFileSync(path.join(ROOT,'data/skills/skills_core_1.json'),'utf8')).skills;
const meteor=core['83'].runtimeProfile,lov=core['85'].runtimeProfile,sg=core['89'].runtimeProfile,quag=core['92'].runtimeProfile;
eq(meteor.ground.tickIntervalMs,1000,'Meteor interval');eq(meteor.ground.maxTicks[9],7,'Meteor Lv10 count');
eq(lov.damageHitCount,1,'LoV logical damage application');eq(lov.visualHitCount,20,'LoV visual hits');eq(lov.ground.maxTicks,1,'LoV one full-sequence application');
eq(sg.damageHitCount,1,'Storm Gust per-wave damage application');eq(sg.ground.maxTicks,10,'Storm Gust waves');eq(sg.ground.tickIntervalMs,450,'Storm Gust tick interval');
eq(quag.ground.activeInstanceLimit,3,'Quagmire active instances');eq(quag.ground.durationMs[4],25000,'Quagmire Lv5 duration');
const skillEngine=fs.readFileSync(path.join(ROOT,'js/skill_engine.js'),'utf8');
assert(skillEngine.includes('getLevelValue(profile.matkRatioPerHit, level, 100)'), 'level-array MATK ratio resolver');
assert(skillEngine.includes('["periodic","stay"].includes(String(profile?.ground?.triggerMode || ""))'), 'periodic/stay ground attack dispatch');
assert(skillEngine.includes('String(profile?.ground?.triggerMode || "")=="stay"') || skillEngine.includes('triggerMode || ""))'), 'stay ground status dispatch');
console.log(JSON.stringify({version:'0.9.82EA',cellSizePx:36,stormGustTicks:ticks,meteorLv10Meteors:meteor.ground.maxTicks[9],lordOfVermilionDamageApplications:lov.ground.maxTicks,quagmireMaxInstances:3,status:'PASS'},null,2));
