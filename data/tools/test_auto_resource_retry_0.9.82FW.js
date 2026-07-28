#!/usr/bin/env node
const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(ROOT,'js/auto_battle.js'),'utf8');
const start=source.indexOf('const AUTO_RESOURCE_RETRY_MS = 15000;');
const end=source.indexOf('function tryAutoHeal()',start);
if(start<0||end<0)throw new Error('resource retry helper block not found');
let now=100000; const logs=[];
const context={
  player:{autoCombat:{}},
  Date:{now:()=>now},
  addBattleLog:text=>logs.push(text),
  console
};
vm.createContext(context);
vm.runInContext(source.slice(start,end)+'\nthis.__retryApi={AUTO_RESOURCE_RETRY_MS,normalizeAutoResourceRetryState,getAutoResourceRetryKey,isAutoSkillResourceSuppressed,suppressAutoSkillForResource,handleAutoSkillResourceBlock};',context,{filename:'auto_resource_retry_helpers.js'});
const api=context.__retryApi; const skill={id:2330,name:'虎砲'};
const check={ok:false,resourceBlock:{type:'spiritSphere',label:'氣功彈',current:1,required:5,retryMs:15000}};
const failures=[]; const assert=(ok,msg)=>{if(!ok)failures.push(msg)};
assert(api.AUTO_RESOURCE_RETRY_MS===15000,'global retry interval must be 15000ms');
assert(api.handleAutoSkillResourceBlock(skill,check)===true,'resource block must be handled');
const key=api.getAutoResourceRetryKey(skill);
assert(context.player.autoCombat.resourceRetryUntil[key]===115000,'retry timestamp incorrect');
assert(api.isAutoSkillResourceSuppressed(skill)===true,'skill should be suppressed immediately');
assert(logs.length===1&&logs[0].includes('氣功彈不足')&&logs[0].includes('15 秒')&&logs[0].includes('普通攻擊'),'warning/fallback log incorrect');
now=114999; assert(api.isAutoSkillResourceSuppressed(skill)===true,'skill should remain suppressed before 15 seconds');
now=115000; assert(api.isAutoSkillResourceSuppressed(skill)===false,'skill should be retryable at 15 seconds');
assert(!(key in context.player.autoCombat.resourceRetryUntil),'expired suppression should be cleaned');
assert(api.handleAutoSkillResourceBlock(skill,{ok:false})===false,'non-resource cast failure must not enter resource retry handler');
const report={version:'0.9.82FW',retryMs:api.AUTO_RESOURCE_RETRY_MS,status:failures.length?'FAIL':'PASS',logs,failures};
fs.writeFileSync(path.join(ROOT,'tools/test_auto_resource_retry_report_0.9.82FW.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
process.exit(failures.length?1:0);
