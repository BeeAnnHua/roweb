'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const listeners={};
function fakeContext(){return {setTransform(){},clearRect(){},save(){},restore(){},translate(){},rotate(){},drawImage(){},fillRect(){},get imageSmoothingEnabled(){return true},set imageSmoothingEnabled(v){},set imageSmoothingQuality(v){},set globalAlpha(v){},set globalCompositeOperation(v){},set fillStyle(v){}}}
class FakeElement{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.id='';this.className='';this.dataset={};this.style={};this.children=[];this.clientWidth=1280;this.clientHeight=720;this.parentElement=null;this.isConnected=true;this._rect=null;}
  appendChild(n){n.parentElement=this;this.children.push(n);if(n.id)elements[n.id]=n;return n}
  insertBefore(n){return this.appendChild(n)} remove(){} setAttribute(){} querySelectorAll(){return []} querySelector(){return null}
  contains(n){if(n===this)return true;return this.children.includes(n)||this.children.some(c=>c.contains?.(n))}
  closest(sel){if(sel==='#player-sprite'&&this.id==='player-sprite')return this;let p=this.parentElement;while(p){if(sel==='#player-sprite'&&p.id==='player-sprite')return p;p=p.parentElement}return null}
  getBoundingClientRect(){return this._rect||{left:0,top:0,right:this.clientWidth,bottom:this.clientHeight,width:this.clientWidth,height:this.clientHeight}}
  getContext(){return fakeContext()}
}
const elements={}; const field=new FakeElement();field.id='battle-field';field._rect={left:0,top:0,right:1280,bottom:720,width:1280,height:720};elements[field.id]=field;
const playerSprite=new FakeElement();playerSprite.id='player-sprite';playerSprite._rect={left:500,top:300,right:620,bottom:480,width:120,height:180};field.appendChild(playerSprite);
const legacyMonster=new FakeElement();legacyMonster.id='monster-sprite';legacyMonster._rect={left:0,top:0,right:100,bottom:120,width:100,height:120};field.appendChild(legacyMonster);
class FakeImage{constructor(){this.naturalWidth=64;this.naturalHeight=64}set src(v){this._src=v;this.onload&&this.onload()}get src(){return this._src}}
global.window=global;global.Element=FakeElement;global.document={readyState:'loading',hidden:false,createElement:t=>new FakeElement(t),getElementById:id=>elements[id]||null,addEventListener:(n,f)=>listeners[n]=f};
global.Image=FakeImage;Object.defineProperty(global,'navigator',{value:{hardwareConcurrency:8},configurable:true});global.localStorage={getItem(){return null},setItem(){}};global.matchMedia=()=>({matches:false});global.devicePixelRatio=1;global.innerWidth=1280;Object.defineProperty(global,'performance',{value:{now:()=>Date.now()},configurable:true});global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};global.addEventListener=()=>{};
global.getMapCameraOffset=()=>({x:1000,y:600});global.getLogicalPointClientPosition=pos=>({x:Number(pos.x)-1000,y:Number(pos.y)-600});
global.player={id:'player',isPlayer:true,hp:100,job:'biolo',position:{x:1600,y:1000}};
function monster(instanceId,mobId,x,y,rect){const el=new FakeElement();el.id=`monster-${instanceId}`;el.dataset.instanceId=String(instanceId);el._rect=rect||{left:x-1000-40,top:y-600-80,right:x-1000+40,bottom:y-600+20,width:80,height:100};field.appendChild(el);return {_instanceId:instanceId,id:mobId,mobId,currentHp:100,position:{x,y},_worldTestEntity:true,_worldMonsterEntity:true,_element:el};}
const sameA=monster(101,1002,1300,900,{left:260,top:220,right:340,bottom:320,width:80,height:100});
const sameB=monster(102,1002,2050,1150,{left:1010,top:470,right:1090,bottom:570,width:80,height:100});
global.currentMonster=sameB;global.collectLiveCombatEnemies=()=>[sameA,sameB];global.getWorldMonsterTestEntities=()=>[sameA,sameB];
const db=JSON.parse(fs.readFileSync(path.join(ROOT,'data/skill_runtime/runtime_generated_all.json'),'utf8')).skills;global.skillsData={runtimeProfiles:db};global.getSkillRuntimeProfile=x=>{const id=String(typeof x==='object'?(x.officialId??x.skillId??x.id):x);const r=db[id];return r?.runtimeProfile||r||null};global.getRuntimeSkillUiType=s=>{const h=String(global.getSkillRuntimeProfile(s)?.handler||'');return h==='passive'?'passive':(!h||h==='pending'?'pending':'active')};
global.fetch=async url=>{const rel=String(url).replace(/^\.\//,'');return {ok:true,status:200,json:async()=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'))}};
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js/skill_effect_runtime_v92.js'),'utf8'),{filename:'skill_effect_runtime_v92.js'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{await listeners.DOMContentLoaded();const api=global.SkillEffectRuntimeV92;const c=[];const add=(n,v)=>c.push([n,!!v]);
 add('ready',api.ready);add('self_test',api.selfTest().pass);add('version',api.version==='0.9.82II');
 api.clearAll('exact-instance');api.onSkillBegin({officialId:5341},1,{token:'exact',target:sameB,targetWorldPosition:{x:2050,y:1150}});api.onSkillCommit({officialId:5341},1,{target:sameB,targetWorldPosition:{x:2050,y:1150}});await sleep(120);
 let snap=api.debugSnapshot();let rows=snap.instances.filter(x=>x.skillId===5341&&x.fixedAnchor);add('exact_instance_events',rows.length>=6);add('exact_entity_position',rows.every(x=>x.fixedAnchor.worldPosition.x===2050&&x.fixedAnchor.worldPosition.y===1150));add('not_first_same_species',rows.every(x=>x.fixedAnchor.worldPosition.x!==1300));
 // DOM lies in upper-left, entity position remains authoritative.
 sameB._element._rect={left:0,top:0,right:80,bottom:100,width:80,height:100};api.onSkillHit(5341,sameB,{targetWorldPosition:{x:2050,y:1150}});await sleep(50);snap=api.debugSnapshot();rows=snap.instances.filter(x=>x.skillId===5341&&x.fixedAnchor);add('stale_dom_never_overrides_entity',rows.every(x=>x.fixedAnchor.worldPosition.x===2050&&x.fixedAnchor.worldPosition.y===1150));
 // Moving the player changes camera only; saved world point remains exact.
 global.player.position={x:2200,y:1600};add('player_move_keeps_world_snapshot',rows.every(x=>x.fixedAnchor.worldPosition.x===2050&&x.fixedAnchor.worldPosition.y===1150));
 // A species-only lightweight target is ambiguous; it must queue rather than select sameA.
 api.clearAll('ambiguous');global.currentMonster=null;api.onSkillCommit({officialId:5341},1,{target:{mobId:1002,id:1002}});await sleep(60);snap=api.debugSnapshot();add('ambiguous_species_queues',snap.pendingGroundEvents>0);add('ambiguous_species_no_wrong_spawn',snap.instances.filter(x=>x.skillId===5341).length===0);add('ambiguous_reject_diagnostic',api.diagnostics.ambiguousTargetIdentityRejects>0);
 const failed=c.filter(x=>!x[1]);console.log(JSON.stringify({pass:!failed.length,checks:Object.fromEntries(c),failed:failed.map(x=>x[0]),diagnostics:api.diagnostics},null,2));process.exit(failed.length?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
