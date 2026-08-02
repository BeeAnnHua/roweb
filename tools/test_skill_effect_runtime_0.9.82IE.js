'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const listeners = {};
function fakeContext(){return {setTransform(){},clearRect(){},save(){},restore(){},translate(){},rotate(){},drawImage(){},fillRect(){},get imageSmoothingEnabled(){return true},set imageSmoothingEnabled(v){},set imageSmoothingQuality(v){},set globalAlpha(v){},set globalCompositeOperation(v){},set fillStyle(v){}}}
function fakeElement(tag='div'){
  return {
    tagName:tag.toUpperCase(), id:'', className:'', dataset:{}, style:{}, children:[], clientWidth:1280, clientHeight:720,
    parentElement:null, firstChild:null,
    appendChild(node){node.parentElement=this;this.children.push(node);if(node.id) elements[node.id]=node;return node;},
    insertBefore(node){node.parentElement=this;this.children.unshift(node);if(node.id) elements[node.id]=node;return node;},
    remove(){}, setAttribute(){}, querySelectorAll(){return []}, querySelector(){return null},
    getBoundingClientRect(){return {left:0,top:0,width:this.clientWidth||200,height:this.clientHeight||200}},
    getContext(){return fakeContext()}
  };
}
const elements = {};
const field=fakeElement('div');field.id='battle-field';elements[field.id]=field;
const playerSprite=fakeElement('div');playerSprite.id='player-sprite';playerSprite.clientWidth=220;playerSprite.clientHeight=250;elements[playerSprite.id]=playerSprite;
const monsterSprite=fakeElement('div');monsterSprite.id='monster-sprite';monsterSprite.clientWidth=190;monsterSprite.clientHeight=200;elements[monsterSprite.id]=monsterSprite;
class FakeImage { constructor(){this.naturalWidth=64;this.naturalHeight=64;this.decoding='';} set src(v){this._src=v;this.onload&&this.onload()} get src(){return this._src} }
global.window=global;
global.document={
  readyState:'loading', hidden:false,
  createElement:tag=>fakeElement(tag),
  getElementById:id=>elements[id]||null,
  addEventListener:(name,fn)=>{listeners[name]=fn}
};
global.Element=function(){};
global.Image=FakeImage;
Object.defineProperty(global,'navigator',{value:{hardwareConcurrency:8},configurable:true});
global.localStorage={getItem(){return null},setItem(){}};
global.matchMedia=()=>({matches:false});
global.devicePixelRatio=1;
global.innerWidth=1280;
Object.defineProperty(global,'performance',{value:{now:()=>Date.now()},configurable:true});
global.requestAnimationFrame=fn=>{return 1};
global.cancelAnimationFrame=()=>{};
global.setInterval=()=>1;
global.clearInterval=()=>{};
global.addEventListener=()=>{};
global.currentMonster={id:77,currentHp:100,position:{x:900,y:640}};
global.player={id:'test',hp:100,job:'biolo',position:{x:500,y:400}};
global.skillsData={runtimeProfiles:{}};
const runtimeDb=JSON.parse(fs.readFileSync(path.join(ROOT,'data/skill_runtime/runtime_generated_all.json'),'utf8')).skills;
for(const [id,row] of Object.entries(runtimeDb)) global.skillsData.runtimeProfiles[id]=row;
global.getSkillRuntimeProfile=(x)=>{const id=String(typeof x==='object'?(x.officialId??x.id):x);const row=global.skillsData.runtimeProfiles[id];return row?.runtimeProfile||row||null};
global.getRuntimeSkillUiType=(skill)=>{const p=global.getSkillRuntimeProfile(skill)||{};const h=String(p.handler||'').toLowerCase();return h==='passive'?'passive':(!h||h==='pending'?'pending':'support')};
global.fetch=async(url)=>{
  const rel=String(url).replace(/^\.\//,'');
  const full=path.join(ROOT,rel);
  return {ok:true,status:200,json:async()=>JSON.parse(fs.readFileSync(full,'utf8'))};
};
const code=fs.readFileSync(path.join(ROOT,'js/skill_effect_runtime_v92.js'),'utf8');
vm.runInThisContext(code,{filename:'skill_effect_runtime_v92.js'});
(async()=>{
  await listeners.DOMContentLoaded();
  const api=global.SkillEffectRuntimeV92;
  const checks=[];
  checks.push(['ready',api.ready===true]);
  checks.push(['self_test',api.selfTest().pass===true]);
  checks.push(['skill_count',api.selfTest().skills===55]);
  checks.push(['effect_count',api.selfTest().effects===454]);
  checks.push(['active_skill_eligible',api.isEligible({officialId:5002})===true]);
  checks.push(['converted_passive_not_candidate',api.isEligible({officialId:2241})===false]);
  const old=global.skillsData.runtimeProfiles['5002'];
  global.skillsData.runtimeProfiles['5002']={...old,handler:'passive',runtimeProfile:{...(old.runtimeProfile||{}),handler:'passive'}};
  checks.push(['dynamic_passive_guard',api.isEligible({officialId:5002})===false]);
  global.skillsData.runtimeProfiles['5002']=old;
  api.onSkillBegin({officialId:5002},1,{token:'t1',target:global.currentMonster});
  api.onSkillCommit({officialId:5002},1,{target:global.currentMonster});
  api.onSkillHit(5002,global.currentMonster,{});
  checks.push(['event_hooks',api.diagnostics.begins>=1&&api.diagnostics.commits>=1&&api.diagnostics.hits>=1]);
  checks.push(['acidified_target_ground_snapshot',api.resolveAnchorPolicy(5341,{trigger:'DAMAGE_COMMIT',target:'TARGET_BODY'})==='GROUND_WORLD_SNAPSHOT']);
  checks.push(['ground_spawn_snapshot',api.resolveAnchorPolicy(5002,{trigger:'GROUND_SPAWN',target:'TARGET_FOOT'})==='GROUND_WORLD_SNAPSHOT']);
  checks.push(['buff_caster_live',api.resolveAnchorPolicy(5002,{trigger:'LOOP_START',target:'CASTER_BODY'})==='CASTER_LIVE']);
  checks.push(['ordinary_target_live',api.resolveAnchorPolicy(5002,{trigger:'HIT_CONFIRM',target:'TARGET_BODY'})==='TARGET_LIVE']);
  checks.push(['projectile_live_endpoints',api.resolveAnchorPolicy(5002,{trigger:'PROJECTILE_LAUNCH',target:'PROJECTILE_PATH'})==='PROJECTILE_LIVE_ENDPOINTS']);
  checks.push(['self_test_anchor_contract',api.selfTest().anchorPolicy==='CASTER_LIVE_TARGET_LIVE_GROUND_WORLD_SNAPSHOT']);
  checks.push(['back_canvas',!!elements['skill-effect-back-canvas']]);
  checks.push(['front_canvas',!!elements['skill-effect-front-canvas']]);
  const failed=checks.filter(x=>!x[1]);
  console.log(JSON.stringify({pass:failed.length===0,checks:Object.fromEntries(checks),failed:failed.map(x=>x[0]),status:api.status},null,2));
  process.exit(failed.length?1:0);
})().catch(error=>{console.error(error);process.exit(1)});
