const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=r=>JSON.parse(fs.readFileSync(path.join(ROOT,r),'utf8'));
const skills={}; for(const f of ['data/skills/skills_core_1.json','data/skills/skills_core_2.json']) Object.assign(skills,read(f).skills||{});
const runtime=read('data/skill_runtime/runtime_generated_all.json').skills;
function assert(v,m){if(!v)throw new Error(m)}
function eq(a,b,m){if(a!==b)throw new Error(`${m}: ${a} !== ${b}`)}
function make(skillId,level,randomValue=0){
  let now=1_000_000; const target={id:1,name:'Dummy',currentHp:10_000_000,maxHp:10_000_000,position:{x:324,y:0},stats:{vit:0,int:0,dex:0,luk:0},hardDef:0,softDef:0,hardMdef:0,softMdef:0,res:0,mres:0,runtimeState:{statuses:{}}};
  const player={baseLevel:200,jobLevel:70,stats:{str:100,agi:100,vit:100,int:130,dex:130,luk:100},aspd:193,sp:10000,hp:10000,maxHp:10000,zeny:1000000,position:{x:0,y:0},activeBuffs:{},skillTimingState:{},equipment:{weapon:{type:'staff'}}};
  const math=Object.assign(Object.create(Math),{random:()=>randomValue});
  const ctx={console,Math:math,JSON,Number,String,Object,Array,Set,Map,Promise,Date:{now:()=>now},performance:{now:()=>now},window:{},document:undefined,
    player,activeMonsters:[target],skillsData:{runtimeProfiles:runtime,skillIndex:skills},RO_WEB_CELL_SIZE:36,
    getSkillLevel:id=>Number(id)===Number(skillId)?level:0,getSkillDataById:id=>skills[String(id)],getActiveBuffBonusTotals:()=>({}),getPassiveSkillBonusTotals:()=>({}),getPassiveCombatModifierTotals:()=>({}),getTrainingBonusTotals:()=>({}),getItemData:()=>null,
    calculateDerivedPlayerStats:()=>({stats:player.stats,atk:1000,matk:1000,matkMin:1000,matkMax:1000,pAtk:0,sMatk:0,aspd:193}),recalculatePlayerStats:()=>{},
    getSkillRangePx:()=>504,canAttackMonsterByRange:()=>true,movePlayerTowardMonster:()=>{},clampPositionToBounds:p=>p,isGroundSkillPlacementLegal:()=>true,
    setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},renderPositionSprites:()=>{},
    CombatDamagePipeline:{resolveMagicSkill:(profile,level,t,opt)=>({damage:100,ratio:opt?.ratio||100,hits:opt?.hits||1}),resolvePhysicalSkill:()=>({damage:100}),resolveMiscSkill:()=>({damage:100})}
  };ctx.window=ctx;vm.createContext(ctx);
  for(const rel of ['js/combat_mechanics_runtime.js','js/battle.js','js/skill_engine.js']) vm.runInContext(fs.readFileSync(path.join(ROOT,rel),'utf8'),ctx,{filename:rel});
  ctx.currentMonster=target;ctx.MovementEffectResolver={knockback:()=>true};ctx.addBattleLog=()=>{};ctx.updatePlayerUI=()=>{};ctx.updateMonsterUI=()=>{};ctx.saveGame=()=>{};ctx.showDamageNumber=()=>{};ctx.playMonsterHitAnimation=()=>{};
  return {ctx,player,target,get now(){return now},set now(v){now=v}};
}
function castAndTicks(skillId,level,tickMs,ticks,random=0,initialDelay=0){
  const env=make(skillId,level,random),skill=skills[String(skillId)],beforeSp=env.player.sp,beforeHp=env.target.currentHp;
  const h=env.ctx.getSkillRuntimeProfile(skill)?.handler; const caster=h==='ground_damage'?env.ctx.castGroundDamageSkill:h==='ground_debuff'?env.ctx.castGroundDebuffSkill:env.ctx.castAttackSkill; assert(caster(skill,level),`${skill.name} live cast`);
  assert(env.ctx.GroundEffectManager.effects.size===1,`${skill.name} effect created`);
  for(let i=0;i<ticks;i++){env.now=1_000_000+initialDelay+i*tickMs;env.ctx.GroundEffectManager.update(env.now,[env.target]);}
  return {...env,skill,beforeSp,beforeHp,damage:beforeHp-env.target.currentHp};
}
const lov=castAndTicks(85,10,1250,1,0);
eq(lov.ctx.GroundEffectManager.effects.size,0,'LoV one logical application expires');assert(lov.damage>0,'LoV deals damage');assert(lov.ctx.StatusManager.has(lov.target,'blind'),'LoV blind status');
const psychic=castAndTicks(2449,5,500,7,0);
eq(psychic.ctx.GroundEffectManager.effects.size,0,'Psychic Wave seven ticks expire');assert(psychic.damage>0,'Psychic Wave deals damage');
const shock=castAndTicks(2238,5,1000,1,0,1000);
eq(shock.ctx.GroundEffectManager.effects.size,0,'Electric Shocker one trigger expires');assert(shock.ctx.StatusManager.has(shock.target,'electric_shocker'),'Electric Shocker status');
const engine=fs.readFileSync(path.join(ROOT,'js/skill_engine.js'),'utf8');
assert(engine.includes('structured.type || structured.status'),'structured ground status resolver');
assert(engine.includes('profile?.tickIntervalMs ?? unit.Interval'),'RA unit interval fallback');
console.log(JSON.stringify({version:'0.9.82EA',tests:{lordOfVermilion:{damageApplications:1,damage:lov.damage,blind:true},psychicWave:{ticks:7,damage:psychic.damage},electricShocker:{ticks:1,status:true}},status:'PASS'},null,2));
