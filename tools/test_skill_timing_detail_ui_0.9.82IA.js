#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const passes=[]; const failures=[];
function check(ok,name,detail=''){ (ok?passes:failures).push(ok?name:`${name}${detail?`: ${detail}`:''}`); }

function classList(){ const s=new Set(); return {add(...v){v.forEach(x=>s.add(x));},remove(...v){v.forEach(x=>s.delete(x));},contains(v){return s.has(v);}}; }
function makeElement(tag='div'){
  const el={tagName:String(tag).toUpperCase(),className:'',textContent:'',innerHTML:'',style:{},dataset:{},children:[],classList:classList(),
    append(...nodes){this.children.push(...nodes);},appendChild(node){this.children.push(node);return node;},
    querySelector(){return makeElement('div');},querySelectorAll(){return[];},addEventListener(){},remove(){},setAttribute(){}};
  return el;
}
const document={
  activeElement:null,
  createElement:makeElement,
  getElementById(){return null;},
  addEventListener(){},
  querySelectorAll(){return[];}
};
const ctx={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Set,Map,Promise,document,
  player:{stats:{dex:200,int:130},quickSlots:[],equipment:{}},
  calculateDerivedPlayerStats(){return {stats:{dex:200,int:130}};},
  getRuntimeSkillUiType(){return 'attack';},
  getRuntimeSkillTimingProfile(){return {
    cast:{rawVariableMs:1000,variableMs:0,rawFixedMs:500,fixedMs:350,totalMs:350},
    databaseAfterCastMs:1000,rawAfterCastMs:400,afterCastActDelayMs:200,
    comboStatDelayRule:true,comboStatDelayReductionMs:600,
    rawCooldownMs:3000,cooldownMs:2500,afterCastWalkDelayMs:800
  };},
  getRuntimeSkillPerformanceFloorMs(){return 140;},
  setTimeout(){return 1;},clearTimeout(){},setInterval(){return 1;},clearInterval(){}
};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/quick_slots.js'),'utf8'),ctx,{filename:'quick_slots.js'});
const body=makeElement('div');
const ok=ctx.appendSkillRuntimeTimingDetail(body,{id:272,officialId:272,skillType:'attack'},5);
check(ok===true,'timing detail appends for active skill');
check(body.children.length===1,'one timing section appended',String(body.children.length));
const section=body.children[0];
check(section.className==='skill-detail-timing','timing section class');
const flat=[];
(function walk(node){if(!node)return; if(node.textContent)flat.push(node.textContent); for(const c of node.children||[])walk(c);})(section);
const text=flat.join('\n');
for(const token of ['目前實際時序（Lv5）','變動詠唱','固定詠唱','總詠唱','技能後延遲','獨立冷卻','行走延遲','高速施放安全間隔','DEX×2＋INT＝530／530','通用／技能專屬候選取最高','連技公式已減少 600 ms']){
  check(text.includes(token),`UI contains ${token}`,text);
}
check(ctx.formatSkillTimingDuration(0)==='0 秒','zero duration formatting');
check(ctx.formatSkillTimingDuration(140)==='140 ms','millisecond formatting');
check(ctx.formatSkillTimingDuration(2500)==='2.5 秒','second formatting',ctx.formatSkillTimingDuration(2500));
const css=fs.readFileSync(path.join(ROOT,'css/style.css'),'utf8');
for(const cls of ['.skill-detail-timing','.skill-detail-timing-title','.skill-detail-timing-row','.skill-detail-timing-note']) check(css.includes(cls),`CSS contains ${cls}`);
const passiveBody=makeElement('div');
ctx.getRuntimeSkillUiType=()=> 'passive';
check(ctx.appendSkillRuntimeTimingDetail(passiveBody,{id:1,skillType:'passive'},1)===false,'passive skill omits timing section');

const report={version:'0.9.82IA',suite:'skill-timing-detail-ui-contract',passed:passes.length,failed:failures.length,passes,failures};
fs.writeFileSync(path.join(ROOT,'TEST_REPORT_0.9.82IA_SKILL_TIMING_UI.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(failures.length)process.exit(1);
