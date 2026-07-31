#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const passes=[]; const failures=[];
function check(ok,name,detail=''){ if(ok)passes.push(name); else failures.push(`${name}${detail?`: ${detail}`:''}`); }

const battleSource=fs.readFileSync(path.join(ROOT,'js/battle.js'),'utf8');
const css=fs.readFileSync(path.join(ROOT,'css/style.css'),'utf8');
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');

check(html.includes('<title>RO_WEB 0.9.82IA</title>'),'HW title updated');
check(html.includes('./js/battle.js?v=0.9.82IA'),'battle cache version is HW');
check(css.includes('RO_WEB 0.9.82HV — Unified combat-number color contract'),'HV combat-number CSS contract exists');
check(css.includes('.damage-number.incoming-damage-number'),'incoming red class exists');
check(css.includes('ro-web-critical-spark-burst') && css.includes('ro-web-critical-ring-burst'),'critical spark and ring effects exist');
check(css.includes('-webkit-text-fill-color:#ffe84f !important') && css.includes('-webkit-text-stroke:3px #d32b1f !important'),'critical yellow face and red outline exist');
check(battleSource.includes('source:"monster"') && battleSource.includes('incoming:true'),'monster damage bridge emits incoming number');
check(battleSource.includes('target === player') && battleSource.includes('worldY = Number(position.y) - 96'),'player world-anchor exists');

function classList(){const values=new Set();return{add(...v){v.forEach(x=>values.add(x));},remove(...v){v.forEach(x=>values.delete(x));},contains(v){return values.has(v);},toggle(v,on){if(on)values.add(v);else values.delete(v);}};}
function makeElement(tag='div'){
  return {tagName:tag.toUpperCase(),className:'',dataset:{},style:{},textContent:'',classList:classList(),isConnected:true,
    appendChild(){},append(){},remove(){this.isConnected=false;},querySelector(){return null;},querySelectorAll(){return[];},
    getBoundingClientRect(){return{left:430,top:230,width:220,height:250,right:650,bottom:480}}};
}
const battleField=makeElement('div'); battleField.getBoundingClientRect=()=>({left:0,top:0,width:1280,height:720,right:1280,bottom:720}); battleField.appendChild=()=>{};
const playerElement=makeElement('div');
const ctx={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Set,Map,Promise,
  player:{hp:100,maxHp:100,sp:10,maxSp:10,currentCity:null,position:{x:500,y:400,targetX:null,targetY:null},activeBuffs:{},equipment:{}},
  currentMonster:null,currentMap:{id:'test',worldCamera:true},
  document:{readyState:'loading',body:{classList:classList()},addEventListener(){},removeEventListener(){},
    getElementById(id){if(id==='battle-field')return battleField;if(id==='player-sprite')return playerElement;return null;},
    querySelectorAll(){return[];},createElement:makeElement,createDocumentFragment(){return{appendChild(){}};}},
  requestAnimationFrame(){return 1;},cancelAnimationFrame(){},setTimeout(){return 1;},clearTimeout(){},setInterval(){return 1;},clearInterval(){},
  getMapCameraOffset(){return{x:100,y:50};},randomInt(){return 0;},
  updateMonsterUI(){},updatePlayerUI(){},addBattleLog(){},saveGame(){},getActiveBuffBonusTotals(){return{};}
};
ctx.window=ctx; ctx.window.addEventListener=()=>{}; ctx.window.matchMedia=()=>({matches:false});
vm.createContext(ctx); vm.runInContext(battleSource,ctx,{filename:'battle.js'});

const monster={_worldTestEntity:true,_instanceId:'m1',position:{x:700,y:360},currentHp:100};
function classes(entry){return new Set(ctx.createDamageNumberElement(entry).className.split(/\s+/));}
let c=classes({damage:1234,options:{target:monster}});
check(c.has('damage-number')&&!c.has('combo-damage-number')&&!c.has('critical-damage-number')&&!c.has('incoming-damage-number'),'normal player damage is normal class');
c=classes({damage:2345,options:{target:monster,combo:true,hitCount:2}});
check(c.has('combo-damage-number')&&!c.has('critical-damage-number'),'combo damage is yellow class');
c=classes({damage:3456,options:{target:monster,critical:true}});
check(c.has('critical-damage-number')&&!c.has('incoming-damage-number'),'player critical gets critical class');
c=classes({damage:4567,options:{target:ctx.player,source:'monster',incoming:true,critical:true,combo:true,hitCount:8}});
check(c.has('incoming-damage-number')&&!c.has('critical-damage-number')&&!c.has('combo-damage-number'),'incoming damage always suppresses crit/combo palette');
const incoming=ctx.createDamageNumberElement({damage:9876,options:{target:ctx.player,source:'monster',incoming:true,_anchorSnapshot:ctx.captureDamageNumberAnchor(ctx.player)}});
check(incoming.dataset.damageSource==='monster'&&incoming.dataset.damageKind==='incoming','incoming dataset identifies source and kind');
check(Number(incoming.dataset.worldAnchorX)>=480&&Number(incoming.dataset.worldAnchorX)<=520&&Number(incoming.dataset.worldAnchorY)>=285&&Number(incoming.dataset.worldAnchorY)<=325,'incoming damage stores player hit world position',JSON.stringify(incoming.dataset));
const critical=ctx.createDamageNumberElement({damage:99999,options:{target:monster,critical:true}});
check(critical.dataset.damageKind==='critical'&&critical.textContent==='99,999','critical number formatting and kind');
const combo=ctx.createDamageNumberElement({damage:123456,options:{target:monster,hitCount:4}});
check(combo.dataset.damageKind==='combo'&&combo.textContent==='123,456','multi-hit auto-classifies as combo');

const report={version:'0.9.82IA',suite:'damage-number-visual-contract',passed:passes.length,failed:failures.length,passes,failures};
fs.writeFileSync(path.join(ROOT,'TEST_REPORT_0.9.82IA_DAMAGE_NUMBER_VISUAL_CONTRACT.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(ROOT,'TEST_REPORT_0.9.82IA_DAMAGE_NUMBER_VISUAL_CONTRACT.txt'),`RO_WEB 0.9.82IA Damage Number Visual Contract\nPassed: ${passes.length}\nFailed: ${failures.length}\n${failures.join('\n')}\n`);
console.log(JSON.stringify(report,null,2)); if(failures.length)process.exit(1);
