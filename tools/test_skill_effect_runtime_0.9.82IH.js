'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const listeners = {};
function fakeContext(){return {setTransform(){},clearRect(){},save(){},restore(){},translate(){},rotate(){},drawImage(){},fillRect(){},get imageSmoothingEnabled(){return true},set imageSmoothingEnabled(v){},set imageSmoothingQuality(v){},set globalAlpha(v){},set globalCompositeOperation(v){},set fillStyle(v){}}}
class FakeElement {
  constructor(tag='div'){
    this.tagName=tag.toUpperCase();this.id='';this.className='';this.dataset={};this.style={};this.children=[];
    this.clientWidth=1280;this.clientHeight=720;this.parentElement=null;this.firstChild=null;
    this._rect=null;
  }
  appendChild(node){node.parentElement=this;this.children.push(node);if(node.id)elements[node.id]=node;return node}
  insertBefore(node){node.parentElement=this;this.children.unshift(node);if(node.id)elements[node.id]=node;return node}
  remove(){}
  setAttribute(){}
  querySelectorAll(){return []}
  querySelector(){return null}
  closest(selector){ if(selector==='#player-sprite' && this.id==='player-sprite') return this; return null }
  getBoundingClientRect(){return this._rect||{left:0,top:0,width:this.clientWidth||200,height:this.clientHeight||200}}
  getContext(){return fakeContext()}
}
function fakeElement(tag='div'){return new FakeElement(tag)}
const elements = {};
const field=fakeElement('div');field.id='battle-field';field._rect={left:0,top:0,width:1280,height:720};elements[field.id]=field;
const playerSprite=fakeElement('div');playerSprite.id='player-sprite';playerSprite.clientWidth=220;playerSprite.clientHeight=250;playerSprite._rect={left:500,top:300,width:120,height:180};elements[playerSprite.id]=playerSprite;
const monsterSprite=fakeElement('div');monsterSprite.id='monster-sprite';monsterSprite.clientWidth=190;monsterSprite.clientHeight=200;monsterSprite._rect={left:900,top:540,width:100,height:120};elements[monsterSprite.id]=monsterSprite;
class FakeImage { constructor(){this.naturalWidth=64;this.naturalHeight=64;this.decoding='';} set src(v){this._src=v;this.onload&&this.onload()} get src(){return this._src} }
global.window=global;
global.Element=FakeElement;
global.document={
  readyState:'loading', hidden:false,
  createElement:tag=>fakeElement(tag),
  getElementById:id=>elements[id]||null,
  addEventListener:(name,fn)=>{listeners[name]=fn}
};
global.Image=FakeImage;
Object.defineProperty(global,'navigator',{value:{hardwareConcurrency:8},configurable:true});
global.localStorage={getItem(){return null},setItem(){}};
global.matchMedia=()=>({matches:false});
global.devicePixelRatio=1;
global.innerWidth=1280;
Object.defineProperty(global,'performance',{value:{now:()=>Date.now()},configurable:true});
global.requestAnimationFrame=fn=>1;
global.cancelAnimationFrame=()=>{};
global.addEventListener=()=>{};
global.getMapCameraOffset=()=>({x:100,y:50});
global.getLogicalPointClientPosition=pos=>({x:Number(pos.x)-100,y:Number(pos.y)-50});
global.player={id:'test',hp:100,job:'biolo',position:{x:500,y:400}};
function makeMonster(id,x,y){
  const el=fakeElement('div');el.id=`monster-${id}`;el._rect={left:x-100,top:y-50,width:100,height:120};elements[el.id]=el;
  return {id, _instanceId:id, currentHp:100, position:{x,y}, _worldTestEntity:true, _worldMonsterEntity:true, _element:el};
}
global.currentMonster=makeMonster(77,900,640);
global.collectLiveCombatEnemies=()=>global.currentMonster?[global.currentMonster]:[];
global.getWorldMonsterTestEntities=()=>global.currentMonster?[global.currentMonster]:[];
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
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
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

  const payload=api.captureTargetPayload(global.currentMonster,null);
  checks.push(['target_payload_world_position',payload.targetWorldPosition?.x===900&&payload.targetWorldPosition?.y===640]);
  checks.push(['target_payload_identity',payload.targetIdentity==='77']);

  api.onSkillBegin({officialId:5341},1,{token:'acid-1',target:global.currentMonster,targetWorldPosition:{x:900,y:640}});
  api.onSkillCommit({officialId:5341},1,{target:global.currentMonster,targetWorldPosition:{x:900,y:640}});
  await sleep(120);
  let snap=api.debugSnapshot();
  const ground=snap.instances.filter(x=>x.skillId===5341&&x.fixedAnchor);
  checks.push(['acidified_ground_instances_created',ground.length>=6]);
  checks.push(['acidified_ground_uses_target_payload',ground.every(x=>Math.abs(x.fixedAnchor?.worldPosition?.x-950)<0.01&&Math.abs(x.fixedAnchor?.worldPosition?.y-743.2)<0.01)]);
  checks.push(['acidified_no_caster_fallback',ground.every(x=>x.fixedAnchor?.policy==='GROUND_WORLD_SNAPSHOT')]);

  api.clearAll('pending-test');
  global.currentMonster=null;
  api.onSkillCommit({officialId:5341},1,{target:null});
  await sleep(60);
  snap=api.debugSnapshot();
  checks.push(['missing_target_queues_ground_events',snap.pendingGroundEvents>=6]);
  checks.push(['missing_target_does_not_spawn_at_player',snap.instances.filter(x=>x.skillId===5341&&x.fixedAnchor).length===0]);

  global.currentMonster=makeMonster(88,1110,720);
  api.onSkillHit(5341,global.currentMonster,{targetWorldPosition:{x:1110,y:720}});
  await sleep(160);
  snap=api.debugSnapshot();
  const flushed=snap.instances.filter(x=>x.skillId===5341&&x.fixedAnchor);
  checks.push(['hit_payload_flushes_pending',snap.pendingGroundEvents===0]);
  checks.push(['flushed_events_use_hit_target',flushed.length>=6&&flushed.every(x=>Math.abs(x.fixedAnchor?.worldPosition?.x-1160)<0.01&&Math.abs(x.fixedAnchor?.worldPosition?.y-823.2)<0.01)]);


  // Real regression: the event payload/target.position can still equal the caster
  // while the selected monster DOM is rendered elsewhere. Acidified effects must
  // use the monster element foot and then be force-relocated by HIT_CONFIRM.
  api.clearAll('authoritative-foot-test');
  const visualTarget=makeMonster(99,1150,700);
  visualTarget.position={x:500,y:400}; // deliberately stale/caster-like
  visualTarget._element._rect={left:1000,top:500,width:100,height:120};
  global.currentMonster=visualTarget;
  api.onSkillBegin({officialId:5341},1,{token:'acid-authoritative',target:visualTarget,targetWorldPosition:{x:500,y:400}});
  api.onSkillCommit({officialId:5341},1,{target:visualTarget,targetWorldPosition:{x:500,y:400}});
  await sleep(120);
  snap=api.debugSnapshot();
  let authoritative=snap.instances.filter(x=>x.skillId===5341&&x.fixedAnchor);
  const expectedX=1150; // rect center 1050 + camera 100
  const expectedY=653.2; // rect top + 86% height = 603.2 + camera 50
  checks.push(['acidified_prefers_monster_dom_foot',authoritative.length>=6&&authoritative.every(x=>Math.abs(x.fixedAnchor.worldPosition.x-expectedX)<0.01&&Math.abs(x.fixedAnchor.worldPosition.y-expectedY)<0.01)]);
  checks.push(['acidified_rejects_caster_explicit_payload',authoritative.every(x=>Math.abs(x.fixedAnchor.worldPosition.x-500)>100)]);
  // Move player and provide another bad explicit payload; hit must keep/relocate
  // every recent phase to the authoritative monster foot.
  global.player.position={x:800,y:600};
  playerSprite._rect={left:720,top:360,width:120,height:180};
  api.onSkillHit(5341,visualTarget,{targetWorldPosition:{x:800,y:600}});
  await sleep(80);
  snap=api.debugSnapshot();
  authoritative=snap.instances.filter(x=>x.skillId===5341&&x.fixedAnchor);
  checks.push(['hit_force_relocates_all_acidified_phases',authoritative.length>=6&&authoritative.every(x=>Math.abs(x.fixedAnchor.worldPosition.x-expectedX)<0.01&&Math.abs(x.fixedAnchor.worldPosition.y-expectedY)<0.01)]);
  checks.push(['forced_ground_relocation_diagnostic',api.diagnostics.forcedGroundRelocations>=6]);

  checks.push(['acidified_target_ground_snapshot',api.resolveAnchorPolicy(5341,{trigger:'DAMAGE_COMMIT',target:'TARGET_BODY'})==='GROUND_WORLD_SNAPSHOT']);
  checks.push(['acidified_cast_body_ground_snapshot',api.resolveAnchorPolicy(5341,{trigger:'CAST_BEGIN',target:'CASTER_BODY'})==='GROUND_WORLD_SNAPSHOT']);
  checks.push(['acidified_cast_bottom_ground_snapshot',api.resolveAnchorPolicy(5341,{trigger:'CAST_BEGIN',target:'CASTER_FOOT'})==='GROUND_WORLD_SNAPSHOT']);
  checks.push(['ground_spawn_snapshot',api.resolveAnchorPolicy(5002,{trigger:'GROUND_SPAWN',target:'TARGET_FOOT'})==='GROUND_WORLD_SNAPSHOT']);
  checks.push(['buff_caster_live',api.resolveAnchorPolicy(5002,{trigger:'LOOP_START',target:'CASTER_BODY'})==='CASTER_LIVE']);
  checks.push(['ordinary_target_live',api.resolveAnchorPolicy(5002,{trigger:'HIT_CONFIRM',target:'TARGET_BODY'})==='TARGET_LIVE']);
  checks.push(['projectile_live_endpoints',api.resolveAnchorPolicy(5002,{trigger:'PROJECTILE_LAUNCH',target:'PROJECTILE_PATH'})==='PROJECTILE_LIVE_ENDPOINTS']);
  checks.push(['self_test_anchor_contract',api.selfTest().anchorPolicy==='ACIDIFIED_AUTHORITATIVE_MONSTER_FOOT_SNAPSHOT_CASTER_BUFFS_LIVE_TARGET_HITS_LIVE']);
  checks.push(['back_canvas',!!elements['skill-effect-back-canvas']]);
  checks.push(['front_canvas',!!elements['skill-effect-front-canvas']]);
  const failed=checks.filter(x=>!x[1]);
  console.log(JSON.stringify({pass:failed.length===0,checks:Object.fromEntries(checks),failed:failed.map(x=>x[0]),status:api.status,diagnostics:api.diagnostics},null,2));
  process.exit(failed.length?1:0);
})().catch(error=>{console.error(error);process.exit(1)});
