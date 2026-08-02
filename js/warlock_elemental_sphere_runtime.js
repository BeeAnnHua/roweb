// RO_WEB 0.9.82IJ — Warlock official elemental sphere runtime.
// Source parity: rAthena Renewal WL_SUMMONFB/BL/WB/STONE, WL_TETRAVORTEX and WL_RELEASE Lv2.
(function(){
  'use strict';

  const VERSION='0.9.82IJ';
  const MAX_SPHERES=5;
  const ELEMENTS=Object.freeze({
    Fire:{label:'火',className:'fire'}, Wind:{label:'風',className:'wind'},
    Water:{label:'水',className:'water'}, Earth:{label:'地',className:'earth'}
  });
  const SUMMON_SKILLS=Object.freeze({
    2222:{element:'Fire',label:'火焰球'},2223:{element:'Wind',label:'雷電球'},
    2224:{element:'Water',label:'水球'},2229:{element:'Earth',label:'石塊'}
  });
  let sphereSerial=0;
  let lastRenderedSignature='';

  function now(){ return Date.now(); }
  function getPlayer(){ return typeof player!=='undefined' ? player : window.player; }
  function requestSave(){
    if(typeof window.requestRuntimeCombatSave==='function') window.requestRuntimeCombatSave();
    else if(typeof window.requestGameSave==='function') window.requestGameSave(250);
    else if(typeof saveGame==='function') saveGame();
  }
  function normalizeSphere(raw,index=0){
    if(!raw||!ELEMENTS[String(raw.element||'')])return null;
    const createdAt=Number(raw.createdAt||now());
    const expiresAt=Number(raw.expiresAt||0);
    if(!Number.isFinite(expiresAt)||expiresAt<=now())return null;
    return {
      id:String(raw.id||`sphere-${createdAt}-${index}-${++sphereSerial}`),
      element:String(raw.element),
      skillId:Number(raw.skillId||0),
      skillLevel:Math.max(1,Number(raw.skillLevel||1)),
      createdAt,
      expiresAt
    };
  }
  function normalizeElementalSpheres(options={}){
    const p=getPlayer(); if(!p)return [];
    const before=Array.isArray(p.elementalSpheres)?p.elementalSpheres:[];
    const normalized=before.map(normalizeSphere).filter(Boolean).sort((a,b)=>a.createdAt-b.createdAt).slice(-MAX_SPHERES);
    const changed=JSON.stringify(before)!==JSON.stringify(normalized);
    p.elementalSpheres=normalized;
    if(changed&&options.save!==false)requestSave();
    if(changed||options.render===true)renderElementalSpheres();
    return normalized;
  }
  function getElementalSpheres(){ return normalizeElementalSpheres({save:false}); }
  function getElementalSphereCount(){ return getElementalSpheres().length; }
  function getElementalSphereSummary(){
    const spheres=getElementalSpheres();
    return spheres.map(s=>ELEMENTS[s.element]?.label||s.element).join(' → ')||'無';
  }
  function makeSphere(element,skillId,skillLevel,durationMs,createdOffset=0){
    const createdAt=now()+createdOffset;
    return {id:`sphere-${createdAt}-${++sphereSerial}`,element,skillId:Number(skillId||0),skillLevel:Math.max(1,Number(skillLevel||1)),createdAt,expiresAt:createdAt+Math.max(1000,Number(durationMs||120000))};
  }
  function summonElementalSpheres(element,skillId,skillLevel){
    const p=getPlayer(); if(!p||!ELEMENTS[element])return {ok:false,reason:'元素球資料錯誤'};
    const level=Math.max(1,Math.min(2,Number(skillLevel||1)));
    const duration=level>=2?160000:120000;
    let spheres=getElementalSpheres().slice();
    if(level===1){
      if(spheres.length>=MAX_SPHERES)return {ok:false,reason:'元素球已達 5 顆上限'};
      spheres.push(makeSphere(element,skillId,level,duration));
    }else{
      spheres=[];
      for(let i=0;i<MAX_SPHERES;i++)spheres.push(makeSphere(element,skillId,level,duration,i));
    }
    p.elementalSpheres=spheres;
    renderElementalSpheres(true); requestSave();
    return {ok:true,spheres:spheres.slice(),added:level===1?1:5,replaced:level>=2};
  }
  function consumeTetraVortexSpheres(){
    const p=getPlayer(); if(!p)return [];
    let spheres=getElementalSpheres().slice();
    if(spheres.length<4)return [];
    if(spheres.length===5)spheres.shift(); // official: discard oldest when five are present
    const consumed=spheres.slice(-4).reverse(); // newest sphere attacks first
    p.elementalSpheres=[];
    renderElementalSpheres(true); requestSave();
    return consumed;
  }
  function consumeAllElementalSpheresNewestFirst(){
    const p=getPlayer(); if(!p)return [];
    const consumed=getElementalSpheres().slice().reverse();
    p.elementalSpheres=[];
    renderElementalSpheres(true); requestSave();
    return consumed;
  }
  function ensureLayer(){
    if(typeof document==='undefined')return null;
    const host=document.getElementById('player-sprite'); if(!host)return null;
    let layer=host.querySelector('.warlock-elemental-sphere-layer');
    if(!layer){layer=document.createElement('div');layer.className='warlock-elemental-sphere-layer';layer.setAttribute('aria-hidden','true');host.appendChild(layer);}
    return layer;
  }
  function renderElementalSpheres(force=false){
    const spheres=getElementalSpheres();
    const sig=spheres.map(s=>`${s.id}:${s.element}:${s.expiresAt}`).join('|');
    if(!force&&sig===lastRenderedSignature)return;
    lastRenderedSignature=sig;
    const layer=ensureLayer(); if(!layer)return;
    layer.innerHTML=''; layer.dataset.count=String(spheres.length);
    layer.title=spheres.length?`元素球（舊→新）：${getElementalSphereSummary()}`:'元素球：無';
    spheres.forEach((sphere,index)=>{
      const orb=document.createElement('span');
      const meta=ELEMENTS[sphere.element];
      orb.className=`warlock-elemental-sphere sphere-${meta.className}`;
      orb.style.setProperty('--sphere-index',String(index));
      orb.style.setProperty('--sphere-count',String(Math.max(1,spheres.length)));
      orb.style.setProperty('--sphere-angle',`${(360/Math.max(1,spheres.length))*index}deg`);
      orb.style.setProperty('--sphere-delay',`${-index*0.37}s`);
      orb.dataset.element=sphere.element;
      orb.textContent=meta.label;
      layer.appendChild(orb);
    });
  }
  function report(reason){ if(typeof addBattleLog==='function')addBattleLog(reason); return false; }
  function targetAlive(target){ return !!target&&Number(target.currentHp??target.hp??0)>0; }
  function getTargets(skill,profile,level){
    const primary=typeof currentMonster!=='undefined'?currentMonster:null;
    if(!primary)return [];
    if(typeof window.resolveRuntimeSkillTargets==='function')return window.resolveRuntimeSkillTargets(profile,primary,level,skill).filter(targetAlive);
    return targetAlive(primary)?[primary]:[];
  }
  function resolveSphereMagicDamage(skill,profile,level,target,sphere,ratio){
    const elementProfile={...profile,handler:'magic_damage',damageHandler:'magic_damage',formula:null,elementSource:'fixed',element:sphere.element,damageHitCount:1,visualHitCount:1};
    const result=window.CombatDamagePipeline?.resolveMagicSkill?.(elementProfile,level,target,{ratio:Math.max(1,Number(ratio||100)),hits:1,skipHitCheck:true});
    return result?Math.max(0,Number(result.damage||0)):0;
  }
  function finalizeTarget(target){
    if(!target||Number(target.currentHp??target.hp??0)>0)return;
    if(typeof currentMonster!=='undefined'&&target===currentMonster&&typeof defeatMonster==='function')defeatMonster();
    else if(typeof finalizeSecondaryRuntimeSkillDefeat==='function')finalizeSecondaryRuntimeSkillDefeat(target);
  }
  function castElementalSphereSummonSkill(skill,requestedLevel=null){
    const check=typeof canCastSkill==='function'?canCastSkill(skill,requestedLevel,['elemental_sphere_summon']):{ok:true,level:requestedLevel||1,profile:skill.runtimeProfile||{}};
    if(!check.ok)return typeof reportPendingRuntime==='function'?reportPendingRuntime(skill,check.reason):report(check.reason);
    const sid=Number(skill?.officialId??skill?.id??0),spec=SUMMON_SKILLS[sid];
    if(!spec)return report(`${skill?.name||'元素球技能'}缺少元素設定。`);
    const preview=(check.level===1&&getElementalSphereCount()>=MAX_SPHERES)?{ok:false,reason:'元素球已達 5 顆上限'}:{ok:true};
    if(!preview.ok)return report(preview.reason);
    if(typeof paySkillCost==='function')paySkillCost(skill,check.level);
    const result=summonElementalSpheres(spec.element,sid,check.level);
    if(!result.ok)return report(result.reason);
    if(typeof addBattleLog==='function')addBattleLog(`${skill.name} Lv${check.level}：${result.replaced?'原有元素球被替換，':'新增 '}${spec.label}，目前 ${result.spheres.length}/5（${getElementalSphereSummary()}）。`);
    if(typeof updatePlayerUI==='function')updatePlayerUI();
    return true;
  }
  function castTetraVortexSkill(skill,requestedLevel=null){
    const check=typeof canCastSkill==='function'?canCastSkill(skill,requestedLevel,['tetra_vortex']):{ok:true,level:requestedLevel||1,profile:skill.runtimeProfile||{}};
    if(!check.ok)return typeof reportPendingRuntime==='function'?reportPendingRuntime(skill,check.reason):report(check.reason);
    const targets=getTargets(skill,check.profile,check.level); if(!targets.length)return report('屬性漩渦找不到有效目標。');
    if(getElementalSphereCount()<4)return report('屬性漩渦需要至少 4 顆元素球。');
    if(typeof paySkillCost==='function')paySkillCost(skill,check.level,{target:targets[0],primaryTarget:targets[0]});
    const consumed=consumeTetraVortexSpheres(); if(consumed.length!==4)return report('元素球消耗失敗。');
    const ratio=800+400*check.level, interval=Math.max(0,Number(check.profile.hitIntervalMs||200));
    const totals=new Map(targets.map(t=>[t,0]));
    if(typeof addBattleLog==='function')addBattleLog(`${skill.name} Lv${check.level}：依序消耗 ${consumed.map(s=>ELEMENTS[s.element].label).join('、')} 四顆元素球。`);
    consumed.forEach((sphere,hitIndex)=>{
      window.setTimeout(()=>{
        targets.forEach(target=>{
          if(!targetAlive(target))return;
          const damage=resolveSphereMagicDamage(skill,check.profile,check.level,target,sphere,ratio);
          const applied=typeof applyRuntimeCalculatedDamage==='function'?applyRuntimeCalculatedDamage(target,damage,{skillId:Number(skill?.officialId??skill?.id),hitCount:1,visualHitCount:1,damageSource:'player'}):{dealt:0};
          totals.set(target,(totals.get(target)||0)+Number(applied.dealt||0));
          if(hitIndex===consumed.length-1&&targetAlive(target)&&typeof applyAttackRuntimeStatus==='function')applyAttackRuntimeStatus(check.profile,check.level,target);
          finalizeTarget(target);
        });
        if(hitIndex===consumed.length-1){
          const total=[...totals.values()].reduce((a,b)=>a+b,0);
          if(typeof addBattleLog==='function')addBattleLog(`${skill.name} 四段攻擊完成，共造成 ${total} 點傷害。`);
          if(typeof updateMonsterUI==='function')updateMonsterUI();
          if(typeof updatePlayerUI==='function')updatePlayerUI();
          requestSave();
        }
      },hitIndex*interval);
    });
    return true;
  }
  function castElementalReleaseSkill(skill,requestedLevel=null){
    const check=typeof canCastSkill==='function'?canCastSkill(skill,requestedLevel,['elemental_release']):{ok:true,level:requestedLevel||1,profile:skill.runtimeProfile||{}};
    if(!check.ok)return typeof reportPendingRuntime==='function'?reportPendingRuntime(skill,check.reason):report(check.reason);
    if(check.level===1){
      const preserved=Array.isArray(getPlayer()?.preservedSpells)?getPlayer().preservedSpells:[];
      if(!preserved.length)return report('釋放 Lv1 需要先以閱讀魔法書保存魔法；目前沒有已保存魔法。');
      return report('釋放 Lv1 的魔法書施放分支尚未完成，未消耗 SP 或保存魔法。');
    }
    const target=typeof currentMonster!=='undefined'?currentMonster:null;
    if(!targetAlive(target))return report('釋放找不到有效目標。');
    if(getElementalSphereCount()<1)return report('釋放 Lv2 需要至少 1 顆元素球。');
    if(typeof paySkillCost==='function')paySkillCost(skill,check.level,{target,primaryTarget:target});
    const consumed=consumeAllElementalSpheresNewestFirst();
    const interval=Math.max(0,Number(check.profile.sphereHitIntervalMs||150));
    const baseRatio=Math.max(1,Number(check.profile.sphereAttackRatio||300))*Math.max(1,Number(getPlayer()?.baseLevel||1))/100;
    let total=0;
    if(typeof addBattleLog==='function')addBattleLog(`${skill.name} Lv2：釋放 ${consumed.map(s=>ELEMENTS[s.element].label).join('、')} 共 ${consumed.length} 顆元素球。`);
    consumed.forEach((sphere,index)=>window.setTimeout(()=>{
      if(targetAlive(target)){
        const damage=resolveSphereMagicDamage(skill,check.profile,sphere.skillLevel,target,sphere,baseRatio);
        const applied=typeof applyRuntimeCalculatedDamage==='function'?applyRuntimeCalculatedDamage(target,damage,{skillId:Number(skill?.officialId??skill?.id),hitCount:1,damageSource:'player'}):{dealt:0};
        total+=Number(applied.dealt||0); finalizeTarget(target);
      }
      if(index===consumed.length-1){
        if(typeof addBattleLog==='function')addBattleLog(`${skill.name} 元素球攻擊完成，共造成 ${total} 點傷害。`);
        if(typeof updateMonsterUI==='function')updateMonsterUI(); requestSave();
      }
    },index*interval));
    return true;
  }

  Object.assign(window,{
    RO_WEB_WARLOCK_ELEMENTAL_SPHERE_VERSION:VERSION,
    normalizeWarlockElementalSpheres:normalizeElementalSpheres,
    getWarlockElementalSpheres:getElementalSpheres,
    getWarlockElementalSphereCount:getElementalSphereCount,
    getWarlockElementalSphereSummary:getElementalSphereSummary,
    renderWarlockElementalSpheres:renderElementalSpheres,
    castElementalSphereSummonSkill,castTetraVortexSkill,castElementalReleaseSkill
  });
  if(typeof window.setInterval==='function')window.setInterval(()=>{
    const p=getPlayer();
    if(p&&Number(p.hp||0)<=0&&Array.isArray(p.elementalSpheres)&&p.elementalSpheres.length){p.elementalSpheres=[];requestSave();}
    normalizeElementalSpheres({save:true,render:true});
  },500);
  if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>renderElementalSpheres(true),{once:true});
})();
