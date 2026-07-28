const fs=require('fs'), vm=require('vm'), path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=r=>JSON.parse(fs.readFileSync(path.join(ROOT,r),'utf8'));
const skills={...read('data/skills/skills_core_1.json').skills,...read('data/skills/skills_core_2.json').skills};
const runtime={};
for(const rel of ['data/skill_runtime/runtime_generated_all.json','data/skill_runtime/runtime_core_1_v1.json']){
  const rows=read(rel).skills; for(const [id,row] of Object.entries(rows))runtime[id]=row;
}
const ctx={console,Math,Date,JSON,Number,String,Object,Array,Set,Map,Promise,performance:{now:()=>Date.now()},window:{},document:undefined,
  player:{baseLevel:100,stats:{str:50,agi:90,vit:50,int:80,dex:100,luk:30},traitStats:{},aspd:193,sp:999999,hp:999999,maxHp:999999,zeny:999999,activeBuffs:{},runtimeState:{},skillTimingState:{},equipment:{}},
  skillsData:{runtimeProfiles:runtime,skillIndex:skills},getSkillLevel:()=>10,getActiveBuffBonusTotals:()=>({}),getPassiveSkillBonusTotals:()=>({}),getPassiveCombatModifierTotals:()=>({}),getTrainingBonusTotals:()=>({}),getItemData:()=>null,
  calculateDerivedPlayerStats:()=>({stats:{str:50,agi:90,vit:50,int:80,dex:100,luk:30},aspd:193}),recalculatePlayerStats:()=>{},addBattleLog:()=>{},saveGame:()=>{},updatePlayerUI:()=>{},setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,clearTimeout:()=>{}};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/battle.js'),'utf8'),ctx,{filename:'js/battle.js'});
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/skill_engine.js'),'utf8'),ctx,{filename:'js/skill_engine.js'});
let errors=[];
const counts={pending:0,implemented:0,passive:0,attack:0,cast:0,zeroDelayPhysical:0,raDelayedPhysical:0,timingLevels:0,instantActiveLevels:0,castedActiveLevels:0,castBeginLocks:0,commitHandoffs:0};
function err(text){if(errors.length<500)errors.push(text)}
for(const [id,row] of Object.entries(runtime)){
  const s=skills[id]; if(!s){err(`${id}: runtime without skill`);continue;}
  const rp=row.runtimeProfile||row;
  const max=Math.max(1,Number(s.maxLevel||1));
  const handler=String(rp.handler||'');
  if(!handler || handler==='pending')counts.pending++;else counts.implemented++;
  const motion=ctx.getRuntimeSkillActionMotion(s);
  if(handler==='passive'){
    counts.passive++; if(motion!==null)err(`${id}: passive motion ${motion}`);
  }else if(handler && handler!=='pending' && ctx.isRuntimePhysicalAttackSkill(s,rp)){
    counts.attack++; if(motion!=='attack')err(`${id}: physical motion ${motion}`);
    if(ctx.isAspdLimitedZeroDelayPhysicalSkill(s,max))counts.zeroDelayPhysical++;else counts.raDelayedPhysical++;
  }else if(handler && handler!=='pending'){
    counts.cast++; if(rp.actionMotion==null && motion!=='cast')err(`${id}: active nonphysical motion ${motion}`);
  }
  for(let lv=1;lv<=max;lv++){
    const t=ctx.getRuntimeSkillTimingProfile(s,lv); counts.timingLevels++;
    const values={variable:t.cast.variableMs,fixed:t.cast.fixedMs,total:t.cast.totalMs,cooldown:t.cooldownMs,after:t.afterCastActDelayMs,walk:t.afterCastWalkDelayMs};
    for(const [k,v] of Object.entries(values)) if(!Number.isFinite(Number(v))||Number(v)<0)err(`${id} Lv${lv}: invalid ${k}=${v}`);
    if(handler && handler!=='pending' && handler!=='passive'){
      ctx.player.skillTimingState={};
      ctx.window.RO_WEB_CAST_TIMING_HANDOFF=null;
      const now=Date.now();
      const begin=ctx.beginRuntimeSkillTiming(s,lv,{now});
      const expected=Math.max(Number(t.minSkillDelayLimitMs||100),Number(t.cast.totalMs||0),Number(ctx.getPlayerSkillActionLockMs()||0));
      if(!begin)err(`${id} Lv${lv}: missing cast-begin timing token`);
      else if(Math.abs(Number(begin.lockMs||0)-expected)>1)err(`${id} Lv${lv}: cast-begin lock ${begin.lockMs}, expected ${expected}`);
      const state=ctx.player.skillTimingState;
      const beforeCommit=Number(state.actionLockUntil||0);
      if(String(state.actionLockType||'')!=='aspd')err(`${id} Lv${lv}: cast-begin lock type ${state.actionLockType}`);
      counts.castBeginLocks++;
      if(Number(t.cast.totalMs||0)>0)counts.castedActiveLevels++;else counts.instantActiveLevels++;
      // Real cast completion passes a handoff, so commit starts cooldown/global/walk
      // delay without creating a second cast-begin action lock.
      ctx.window.RO_WEB_CAST_TIMING_HANDOFF={skillId:Number(s.officialId??s.id??0),token:begin?.token||null,expiresAt:Date.now()+2000};
      ctx.commitRuntimeSkillTiming(s,lv);
      const afterCommit=Number(state.actionLockUntil||0);
      if(afterCommit!==beforeCommit)err(`${id} Lv${lv}: commit changed cast-begin lock ${beforeCommit} -> ${afterCommit}`);
      if(state.castBeginTokens?.[String(s.officialId??s.id??0)])err(`${id} Lv${lv}: cast-begin token not consumed`);
      counts.commitHandoffs++;
      if(Number(t.cooldownMs||0)>0 && Number(state.skillCooldownUntil?.[String(s.officialId??s.id??0)]||0)<=Date.now())err(`${id} Lv${lv}: cooldown not committed`);
      if(Number(t.afterCastActDelayMs||0)>0 && Number(state.globalDelayUntil||0)<=Date.now())err(`${id} Lv${lv}: after-cast delay not committed`);
      if(Number(t.afterCastWalkDelayMs||0)>0 && Number(state.walkDelayUntil||0)<=Date.now())err(`${id} Lv${lv}: walk delay not committed`);
    }
  }
}
const result={version:'0.9.82DY',renewalOnly:true,runtimeSkills:Object.keys(runtime).length,counts,errors,summary:{status:errors.length?'FAIL':'PASS',errors:errors.length}};
fs.writeFileSync(path.join(ROOT,'tools/all_skill_timing_action_audit_0.9.82DY.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
process.exit(errors.length?1:0);
