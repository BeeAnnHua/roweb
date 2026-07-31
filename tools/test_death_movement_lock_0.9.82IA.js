#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const passes=[]; const failures=[];
function check(ok,name,detail=''){ if(ok) passes.push(name); else failures.push(`${name}${detail?`: ${detail}`:''}`); }

const source=fs.readFileSync(path.join(ROOT,'js/position_engine.js'),'utf8');
const deathSource=fs.readFileSync(path.join(ROOT,'js/death_revival_runtime.js'),'utf8');
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const css=fs.readFileSync(path.join(ROOT,'css/style.css'),'utf8');
check(source.includes('function isPlayerDeathMovementLocked()'),'Position Engine 有死亡移動鎖判定');
check(source.includes('function clearPlayerMovementForDeath(options = {})'),'Position Engine 有死亡路徑清除器');
check(source.includes('if (isPlayerDeathMovementLocked()) {\n      clearPlayerMovementForDeath({ render: false });'),'地圖 pointer/touch/click 入口封鎖死亡移動');
check(source.includes('function setPlayerMoveTarget(x, y) {\n  if (isPlayerDeathMovementLocked())'),'程式移動目標入口封鎖死亡移動');
check(source.includes('function updatePositionMovement(dt) {\n  if (!player?.position) return;\n  if (isPlayerDeathMovementLocked())'),'每 50ms 移動迴圈會清掉死亡殘留路徑');
check(source.includes('function movePlayerTowardMonster') && source.includes('function movePlayerAdjacentToMonster'),'追怪與貼近怪物入口存在');
check(source.includes('角色已死亡，請先選擇復活方式。') && source.includes('角色已死亡，請使用死亡視窗返回村莊。'),'死亡時禁止翅膀繞過正式復活流程');
check(deathSource.includes('if (typeof clearPlayerMovementForDeath === "function") clearPlayerMovementForDeath();'),'死亡 Runtime 會立即清除移動路徑');
check(deathSource.includes('function bindDeathInputShield()'),'死亡遮罩有輸入隔離');
check(html.includes('./js/position_engine.js?v=0.9.82IA') && html.includes('./js/death_revival_runtime.js?v=0.9.82IA'),'HU 快取版本正確載入移動與死亡 Runtime');
check(css.includes('body.player-death-modal-open #battle-field{touch-action:none!important}'),'死亡 UI 開啟時停用地圖觸控手勢');

function classList(initial=[]){ const s=new Set(initial); return {add(...v){v.forEach(x=>s.add(x))},remove(...v){v.forEach(x=>s.delete(x))},contains(v){return s.has(v)},toggle(v,on){if(on)s.add(v);else s.delete(v)}}; }
let logs=[]; let consumed=0;
const bodyClass=classList();
const modal={hidden:true};
const field={offsetWidth:1280,offsetHeight:720,clientWidth:1280,clientHeight:720,dataset:{worldCamera:'true'},style:{},classList:classList(['world-camera-mode']),getBoundingClientRect(){return{left:0,top:0,right:1280,bottom:720,width:1280,height:720}},addEventListener(){},contains(){return false},appendChild(){}};
const ctx={
 console,Math,Date,JSON,Object,Array,Number,String,Boolean,Set,Map,Promise,
 player:{hp:0,maxHp:100,sp:0,maxSp:20,currentCity:null,map:'field',state:'Move',position:{x:100,y:100,targetX:500,targetY:500,moveSpeed:200},inventory:[{id:601,count:1},{id:602,count:1}],autoCombat:{teleport:{enabled:true}}},
 currentMonster:{position:{x:300,y:300},currentHp:100},currentMap:{id:'field',worldCamera:true,worldWidth:1280,worldHeight:720,cameraWidth:1280,cameraHeight:720},autoBattleTimer:null,
 document:{body:{classList:bodyClass,appendChild(el){el.parentElement=this}},getElementById(id){if(id==='playerDeathModal')return modal;if(id==='battle-field')return field;return null},addEventListener(){},createElement(){return{style:{},dataset:{},classList:classList(),appendChild(){},querySelector(){return null}}}},
 window:null,setInterval(){return 1},clearInterval(){},setTimeout(){return 1},clearTimeout(){},requestAnimationFrame(fn){fn()},
 addBattleLog(t){logs.push(t)},getActiveBuffBonusTotals(){return{}},isRuntimeCastingMovementLocked(){return false},isRuntimeSkillMovementDelayed(){return false},
 updateInventoryUI(){},saveGame(){},countInventoryItem(id){return this.player.inventory.find(x=>x.id===id)?.count||0},
 consumeInventoryItemCount(){consumed++;return true},getCityData(){return{id:'prontera',name:'普隆德拉'}},enterCity(){},
};
ctx.window=ctx;ctx.window.innerWidth=1280;ctx.window.innerHeight=720;ctx.window.matchMedia=()=>({matches:false});ctx.window.addEventListener=()=>{};ctx.window.visualViewport={width:1280,height:720,offsetLeft:0,offsetTop:0,addEventListener(){}};
vm.createContext(ctx); vm.runInContext(source,ctx,{filename:'position_engine.js'});
check(ctx.isPlayerDeathMovementLocked()===true,'HP=0 時死亡移動鎖為真');
const x0=ctx.player.position.x,y0=ctx.player.position.y;
check(ctx.setPlayerMoveTarget(700,400)===false,'死亡時 setPlayerMoveTarget 拒絕新目標');
check(ctx.player.position.targetX===null&&ctx.player.position.targetY===null,'死亡時立即清除既有移動目標');
ctx.updatePositionMovement(.5);
check(ctx.player.position.x===x0&&ctx.player.position.y===y0&&ctx.player.state==='Dead','死亡移動迴圈不改變座標並維持 Dead');
check(ctx.movePlayerTowardMonster(ctx.currentMonster,50)===false,'死亡時追怪入口拒絕移動');
check(ctx.movePlayerAdjacentToMonster(ctx.currentMonster)===false,'死亡時瞬間貼近怪物入口拒絕移動');
check(ctx.useFlyWing()===false&&ctx.useButterflyWing()===false&&consumed===0,'死亡時兩種翅膀不消耗也不移動');
check(ctx.maybeAutoTeleportWhenNoTarget()===false,'死亡時自動無目標瞬移停止');
ctx.player.hp=100;ctx.player.state='Idle';modal.hidden=true;bodyClass.remove('player-death-modal-open');
check(ctx.isPlayerDeathMovementLocked()===false,'恢復 HP 且死亡 UI 關閉後解除移動鎖');
check(ctx.setPlayerMoveTarget(700,400)===true,'復活後可重新設定移動目標');
ctx.updatePositionMovement(.5);
check(ctx.player.position.x!==x0||ctx.player.position.y!==y0,'復活後移動迴圈恢復正常');
ctx.player.position.targetX=800;ctx.player.position.targetY=500;modal.hidden=false;
check(ctx.isPlayerDeathMovementLocked()===true,'死亡視窗顯示時即使 HP 暫時恢復仍保持移動鎖');
ctx.updatePositionMovement(.5);
check(ctx.player.position.targetX===null&&ctx.player.position.targetY===null,'死亡視窗 resolving 期間也會清除路徑');

const report={version:'0.9.82IA',suite:'death-movement-lock',passed:passes.length,failed:failures.length,passes,failures};
fs.writeFileSync(path.join(ROOT,'TEST_REPORT_0.9.82IA_DEATH_MOVEMENT_LOCK.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(ROOT,'TEST_REPORT_0.9.82IA_DEATH_MOVEMENT_LOCK.txt'),`RO_WEB 0.9.82IA Death Movement Lock\nPassed: ${passes.length}\nFailed: ${failures.length}\n${failures.join('\n')}\n`);
console.log(JSON.stringify(report,null,2)); if(failures.length)process.exit(1);
