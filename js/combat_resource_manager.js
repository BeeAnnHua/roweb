// RO_WEB 0.9.82BK - generic combat resource manager (spirit spheres / servant weapons)
(function(){"use strict";
const now=()=>Date.now();
function ensure(){if(!window.player)return {};player.combatResources=player.combatResources||{};return player.combatResources;}
function normalize(type){const all=ensure();const r=all[type]||(all[type]={current:0,max:5,expiresAt:0,nextRegenAt:0,regenIntervalMs:0,regenAmount:1,active:false});if(r.expiresAt&&r.expiresAt<=now()){r.current=0;r.active=false;r.nextRegenAt=0;}if(r.active&&r.regenIntervalMs>0&&r.nextRegenAt&&now()>=r.nextRegenAt){const ticks=Math.max(1,Math.floor((now()-r.nextRegenAt)/r.regenIntervalMs)+1);r.current=Math.min(r.max,r.current+ticks*r.regenAmount);r.nextRegenAt+=ticks*r.regenIntervalMs;}return r;}
const API={
 get(type){return normalize(type).current||0;},
 configure(type,opt={}){const r=normalize(type);r.max=Math.max(0,Number(opt.max??r.max??5));r.current=Math.min(r.max,Math.max(0,Number(opt.start??r.current??0)));r.regenIntervalMs=Math.max(0,Number(opt.regenIntervalMs||0));r.regenAmount=Math.max(1,Number(opt.regenAmount||1));r.expiresAt=opt.durationMs?now()+Number(opt.durationMs):0;r.active=true;r.nextRegenAt=r.regenIntervalMs?now()+r.regenIntervalMs:0;return r.current;},
 add(type,amount=1,max=null){const r=normalize(type);if(max!=null)r.max=Number(max);r.current=Math.min(r.max,Math.max(0,r.current+Number(amount||0)));return r.current;},
 consume(type,amount=1,mode='fixed',minimum=0){const r=normalize(type);let used=mode==='all'?r.current:(mode==='up_to'?Math.min(r.current,Number(amount||0)):Number(amount||0));if(r.current<Math.max(Number(minimum||0),mode==='fixed'?used:0))return {ok:false,used:0,remaining:r.current};used=Math.min(r.current,Math.max(0,used));r.current-=used;return {ok:true,used,remaining:r.current};},
 clear(type){const r=normalize(type);r.current=0;r.active=false;r.nextRegenAt=0;},
 update(){const all=ensure();Object.keys(all).forEach(normalize);}
};
let resourceTimer=null;
function startCombatResourceLoop(){if(resourceTimer)return;resourceTimer=setInterval(()=>{try{API.update();}catch(e){console.warn("Combat resource update failed",e);}},250);}
function stopCombatResourceLoop(){if(resourceTimer){clearInterval(resourceTimer);resourceTimer=null;}}
window.CombatResourceManager=API;
window.startCombatResourceLoop=startCombatResourceLoop;
window.stopCombatResourceLoop=stopCombatResourceLoop;
startCombatResourceLoop();
})();
