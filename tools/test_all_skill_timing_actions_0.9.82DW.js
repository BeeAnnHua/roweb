const fs=require('fs'), vm=require('vm'), path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=r=>JSON.parse(fs.readFileSync(path.join(ROOT,r),'utf8'));
const skills={...read('data/skills/skills_core_1.json').skills,...read('data/skills/skills_core_2.json').skills};
const runtime={};
for(const rel of ['data/skill_runtime/runtime_generated_all.json','data/skill_runtime/runtime_core_1_v1.json']){
 const rows=read(rel).skills; for(const [id,row] of Object.entries(rows))runtime[id]=row;
}
const ctx={console,Math,Date,JSON,Number,String,Object,Array,Set,Map,Promise,performance:{now:()=>Date.now()},window:{},document:undefined,player:{aspd:180,sp:999999,hp:999999,maxHp:999999,zeny:999999,activeBuffs:{},runtimeState:{},skillTimingState:{}},skillsData:{runtimeProfiles:runtime,skillIndex:skills},getSkillLevel:()=>10,getActiveBuffBonusTotals:()=>({}),getPassiveSkillBonusTotals:()=>({}),recalculatePlayerStats:()=>{},addBattleLog:()=>{},saveGame:()=>{},updatePlayerUI:()=>{},setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,clearTimeout:()=>{}};ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/battle.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/skill_engine.js'),'utf8'),ctx);
let errors=[],counts={pending:0,passive:0,attack:0,cast:0,zeroDelayPhysical:0,raDelayedPhysical:0,timingLevels:0};
const physicalHandlers=new Set(['physical_attack','physical_attack_size_hits','physical_attack_formula','physical_charge','combo_sequence']);
for(const [id,row] of Object.entries(runtime)){
 const s=skills[id]; if(!s){errors.push(`${id}: runtime without skill`);continue;}
 const rp=row.runtimeProfile||row;
 const max=Math.max(1,Number(s.maxLevel||1));
 for(let lv=1;lv<=max;lv++){
  const t=ctx.getRuntimeSkillTimingProfile(s,lv); counts.timingLevels++;
  for(const [k,v] of Object.entries({variable:t.cast.variableMs,fixed:t.cast.fixedMs,total:t.cast.totalMs,cooldown:t.cooldownMs,after:t.afterCastActDelayMs,walk:t.afterCastWalkDelayMs})){
   if(!Number.isFinite(Number(v))||Number(v)<0)errors.push(`${id} Lv${lv}: invalid ${k}=${v}`);
  }
 }
 const motion=ctx.getRuntimeSkillActionMotion(s);
 const handler=String(rp.handler||'');
 if(!handler || handler==='pending'){
  counts.pending++;
  continue;
 }
 if(handler==='passive'){
  counts.passive++; if(motion!==null)errors.push(`${id}: passive motion ${motion}`);
 }else if(ctx.isRuntimePhysicalAttackSkill(s,rp)){
  counts.attack++; if(motion!=='attack')errors.push(`${id}: physical motion ${motion}`);
  if(ctx.isAspdLimitedZeroDelayPhysicalSkill(s,max))counts.zeroDelayPhysical++;else counts.raDelayedPhysical++;
 }else if(handler==='skill_copy_selector' && String(s.type||'').toLowerCase()==='passive'){
  counts.cast++; if(motion!=='cast')errors.push(`${id}: active selector motion ${motion}`);
 }else{
  counts.cast++; if(rp.actionMotion==null && motion!=='cast')errors.push(`${id}: active nonphysical motion ${motion}`);
 }
}
const result={version:'0.9.82DW',runtimeSkills:Object.keys(runtime).length,counts,errors,summary:{status:errors.length?'FAIL':'PASS',errors:errors.length}};
fs.writeFileSync(path.join(ROOT,'tools/all_skill_timing_action_audit_0.9.82DW.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
process.exit(errors.length?1:0);
