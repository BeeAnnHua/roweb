// RO_WEB 0.9.82FX - RA Renewal mechanics + unified item/card effect consumers
(function(){
"use strict";
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
const pct=(v,r)=>Math.max(0,Math.floor((Number(v)||0)*(100+Number(r||0))/100));
function derived(unit){
 if(unit===window.player){const cached=window.RO_WEB_COMBAT_EVAL_CONTEXT?.derivedStats;if(cached)return cached;if(typeof window.calculateDerivedPlayerStats==='function')return window.calculateDerivedPlayerStats()||{};}
 return unit||{};
}
function renewalUnitHit(unit,data={}){
 const explicit=data.hit??unit?.hit??unit?.Hit;
 if(explicit!==undefined&&explicit!==null)return Number(explicit)||0;
 if(unit&&unit!==window.player)return 175+Math.max(1,Number(unit.level||unit.baseLevel||1));
 return 0;
}
function renewalUnitFlee(unit,data={}){
 const explicit=data.flee??unit?.flee??unit?.Flee;
 if(explicit!==undefined&&explicit!==null)return Number(explicit)||0;
 if(unit&&unit!==window.player)return 95+Math.max(1,Number(unit.level||unit.baseLevel||1));
 return 0;
}
const HitResolver={
 chance(attacker,defender,opt={}){
  if(opt.alwaysHit||opt.perfectHit||opt.ignoreFlee||['always','always_hit','ignore_flee'].includes(opt.hitMode)) return 100;
  const a=derived(attacker),d=derived(defender);
  const hit=Number(opt.hit??renewalUnitHit(attacker,a)), flee=Number(opt.flee??renewalUnitFlee(defender,d));
  // Renewal battle.cpp starts from 0: final hit rate is HIT - FLEE plus skill modifiers, then capped.
  let chance=Number(opt.baseRate??0)+hit-flee+Number(opt.hitRateBonus||0);
  chance*=Number(opt.hitRateMultiplier||1);
  return clamp(chance,Number(opt.minimumRate??5),Number(opt.maximumRate??100));
 },
 resolve(attacker,defender,opt={}){
  const active=attacker===window.player?(window.RO_WEB_COMBAT_EVAL_CONTEXT?.activeBuffTotals||(typeof window.getActiveBuffBonusTotals==='function'?window.getActiveBuffBonusTotals():{})):{};
  const api=window.CombatFormulaRuntime;
  const perfectChance=clamp(Number(api?.collectScalarBonus?.(attacker,'perfectHitRate')||active.perfectHitRate||0),0,100);
  if(perfectChance>0&&Math.random()*100<perfectChance)return {hit:true,chance:100,perfect:true,perfectChance};
  const chance=this.chance(attacker,defender,opt); return {hit:Math.random()*100<chance,chance,perfect:false,perfectChance};
 }
};
const CriticalResolver={
 chance(attacker,defender,opt={}){
  if(opt.neverCrit||['disabled','never'].includes(opt.criticalMode)) return 0;
  if(opt.alwaysCrit||opt.criticalMode==='always') return 100;
  const a=derived(attacker),d=derived(defender);
  const rawCri=Number(opt.cri??a.cri??attacker?.cri??0), luk=Number(d?.stats?.luk??defender?.stats?.luk??defender?.luk??0);
  const scale=Number(opt.scale||1000);
  // Player derived CRI is exposed as a percentage. Raw RA per-mille values must opt in explicitly.
  const raScaled=opt.useRaScale===true||a?.criUnit==='permille'||attacker?.criUnit==='permille';
  const cri=raScaled?rawCri/scale*100:rawCri;
  const race=String(defender?.race||defender?.Race||'Formless');
  const api=window.CombatFormulaRuntime;
  const raceBonus=Number(api?.collectKeyedBonus?.(attacker,'criticalChanceByRace',race)||api?.collectKeyedBonus?.(attacker,'criticalRateByRace',race)||0);
  const rangeType=String(opt.attackRangeType||opt.rangeType||'short').toLowerCase();
  const longBonus=rangeType==='long'?Number(api?.collectScalarBonus?.(attacker,'longRangeCriticalChanceFlat')||0):0;
  let chance=cri-(luk*Number(opt.targetLukPenaltyPerPoint??2)/scale*100)+Number(opt.criticalRateBonus||0)+raceBonus+longBonus;
  if(opt.criticalMode==='half_rate') chance/=2;
  chance*=Number(opt.criticalRateMultiplier||1);
  const criticalDef=clamp(Number(api?.collectScalarBonus?.(defender,'criticalChanceReductionRate',['criticalDef'])||defender?.criticalDef||0),0,100);
  chance*=1-criticalDef/100;
  return clamp(chance,0,100);
 },
 resolve(attacker,defender,opt={}){
  const chance=this.chance(attacker,defender,opt),a=derived(attacker);
  const cri=Math.max(0,Number(opt.cri??a.cri??attacker?.cri??0));
  const crate=Math.max(0,Number(opt.crate??a.crate??attacker?.crate??0));
  const base=Number(opt.criticalMultiplier??1.4),multiplier=base+crate*0.01;
  return {critical:Math.random()*100<chance,chance,criticalChance:chance,cri,crate,multiplier,criticalDamageMultiplier:multiplier,crateIncluded:true,authority:{chanceStat:'CRI',damageStat:'C.RATE'}};
 },
 describe(attacker,defender,opt={}){
  const a=derived(attacker),chance=this.chance(attacker,defender,opt),cri=Math.max(0,Number(opt.cri??a.cri??attacker?.cri??0)),crate=Math.max(0,Number(opt.crate??a.crate??attacker?.crate??0)),base=Number(opt.criticalMultiplier??1.4);
  return {cri,criticalChance:chance,crate,criticalDamageMultiplier:base+crate*0.01,chanceStat:'CRI',damageStat:'C.RATE'};
 }
};
const RO_WEB_CRITICAL_AUTHORITY=Object.freeze({chanceStat:'CRI',damageStat:'C.RATE',chanceRule:'CRI minus target LUK and skill modifiers',damageRule:'1.40 + C.RATE × 0.01',note:'C.RATE never raises critical occurrence chance.'});
const PerfectDodgeResolver={
 chance(defender,opt={}){ const d=derived(defender),hasFlee2=(d.flee2!==undefined||defender?.flee2!==undefined),raw=Number(hasFlee2?(d.flee2??defender?.flee2??0):(d.perfectDodge??defender?.perfectDodge??defender?.perfectFlee??0)); return clamp(hasFlee2?raw/Number(opt.scale||1000)*100:raw,0,100); },
 resolve(defender,opt={}){ const chance=this.chance(defender,opt); return {dodged:Math.random()*100<chance,chance}; }
};
const DefenseResolver={
 physical(raw,target,opt={}){
  if(opt.ignoreDefense===true) return Math.max(1,Math.floor(raw));
  const d=derived(target), runtime=typeof window.getMonsterRuntimeBonuses==='function'?window.getMonsterRuntimeBonuses(target):{}, defRate=Number(runtime.defRate||0), hard=Math.max(0,Number(opt.hardDef??d.hardDef??target?.hardDef??d.def??target?.def??0)*(100+defRate)/100);
  const api=window.CombatFormulaRuntime,source=opt.source||window.player,race=String(target?.race||target?.Race||'Formless');
  const buffPierce=Number(typeof window.getActiveBuffBonusTotals==='function' ? window.getActiveBuffBonusTotals().resPiercePercent || 0 : 0);
  const genericPierce=Number(api?.collectScalarBonus?.(source,'ignoreResRate',['resPiercePercent'])||0)+Number(api?.collectKeyedBonus?.(source,'ignoreResByRace',race)||0);
  const resPierce=clamp(Number(opt.resPiercePercent??0)+buffPierce+genericPierce,0,50);
  const resRate=Number(runtime.resRate||0),rawRes=Math.max(0,Number(opt.res??d.res??target?.res??0)*(100+resRate)/100+Number(runtime.resFlat||0)),res=rawRes*(100-resPierce)/100;
  const soft=Math.max(0,Number(opt.softDef??d.softDef??target?.softDef??0)*(100+defRate)/100);
  const targetElement=String(target?.element||target?.Element||target?.defElement||'Neutral');
  const targetClass=(target?.isBoss||target?.isMvp||target?.boss)?'Boss':'NonBoss';
  const genericDefPierce=Number(api?.collectScalarBonus?.(source,'ignoreDefRate',['defPiercePercent'])||0)
    +Number(api?.collectKeyedBonus?.(source,'ignoreDefByRace',race)||0)
    +Number(api?.collectKeyedBonus?.(source,'ignoreDefByElement',targetElement)||0)
    +Number(api?.collectKeyedBonus?.(source,'ignoreDefByClass',targetClass)||0);
  const pierce=clamp(Number(opt.defPiercePercent||0)+genericDefPierce,0,100), effective=hard*(100-pierce)/100;
  let out=(Number(raw)||0);if(res>0)out-=Math.floor((res/(res+400))*0.80*out);
  if(opt.simpleDefense===true)return Math.max(1,Math.floor(out-effective-soft-Number(opt.flatReduction||0)));
  return Math.max(1,Math.floor(out*(4000+effective)/(4000+effective*10)-soft-Number(opt.flatReduction||0)));
 },
 magic(raw,target,opt={}){
  if(opt.ignoreMagicDefense===true||opt.ignoreMdef===true) return Math.max(1,Math.floor(raw));
  const d=derived(target), runtime=typeof window.getMonsterRuntimeBonuses==='function'?window.getMonsterRuntimeBonuses(target):{}, mdefRate=Number(runtime.mdefRate||0),mresRate=Number(runtime.mresRate||0), hard=Math.max(0,Number(opt.hardMdef??d.hardMdef??target?.hardMdef??d.mdef??target?.mdef??0)*(100+mdefRate)/100),rawMres=Math.max(0,Number(opt.mres??d.mres??target?.mres??0)*(100+mresRate)/100+Number(runtime.mresFlat||0));
  const api=window.CombatFormulaRuntime,source=opt.source||window.player,race=String(target?.race||target?.Race||'Formless');
  const mresPierce=clamp(Number(opt.mresPiercePercent||0)+Number(api?.collectScalarBonus?.(source,'ignoreMresRate',['mresPiercePercent'])||0)+Number(api?.collectKeyedBonus?.(source,'ignoreMresByRace',race)||0),0,50);
  const mres=rawMres*(100-mresPierce)/100;
  const soft=Math.max(0,Number(opt.softMdef??d.softMdef??target?.softMdef??0)*(100+mdefRate)/100);
  const targetElement=String(target?.element||target?.Element||target?.defElement||'Neutral');
  const targetClass=(target?.isBoss||target?.isMvp||target?.boss)?'Boss':'NonBoss';
  const genericMdefPierce=Number(api?.collectScalarBonus?.(source,'ignoreMdefRate',['mdefPiercePercent'])||0)
    +Number(api?.collectKeyedBonus?.(source,'ignoreMdefByRace',race)||0)
    +Number(api?.collectKeyedBonus?.(source,'ignoreMdefByElement',targetElement)||0)
    +Number(api?.collectKeyedBonus?.(source,'ignoreMdefByClass',targetClass)||0);
  const pierce=clamp(Number(opt.mdefPiercePercent||0)+genericMdefPierce,0,100), effective=hard*(100-pierce)/100;
  let out=(Number(raw)||0);if(mres>0)out-=Math.floor((mres/(mres+400))*0.80*out);return Math.max(1,Math.floor(out*(1000+effective)/(1000+effective*10)-soft-Number(opt.flatReduction||0)));
 }
};
const STATUS_RULES={
 stun:{resistStat:'vit'},poison:{resistStat:'vit'},bleeding:{resistStat:'vit'},silence:{resistStat:'int'},blind:{resistStat:'int'},
 sleep:{resistStat:'int'},freeze:{resistStat:'mdef'},stone:{resistStat:'mdef'},curse:{resistStat:'luk'},confusion:{resistStat:'luk'},fear:{resistStat:'luk'},burning:{resistStat:'mdef'}
};
function stateOf(target){ target.runtimeState=target.runtimeState||{}; target.runtimeState.statuses=target.runtimeState.statuses||{}; return target.runtimeState.statuses; }
const StatusManager={
 normalize(name){return String(name||'').toLowerCase().replace(/[ _-]/g,'');},
 chance(target,status,base,opt={}){
  if(target?.isBoss||target?.isMvp||target?.boss) { if(opt.allowBoss!==true) return 0; }
  const id=this.normalize(status); if((target?.statusImmunities||[]).map(x=>this.normalize(x)).includes(id)) return 0;
  const rule=STATUS_RULES[id]||{}, d=derived(target), stat=Number(d?.stats?.[rule.resistStat]??target?.stats?.[rule.resistStat]??target?.[rule.resistStat]??0);
  let chance=Number(base||0)+Number(opt.bonusChance||0);
  if(opt.chanceFormula==='dex_vs_dex') chance+=Number(opt.attackerDex||0)-Number(d?.stats?.dex??target?.dex??0);
  else if(opt.chanceFormula==='luk_based') chance+=Number(opt.attackerLuk||0)/3-Number(d?.stats?.luk??target?.luk??0)/5;
  else if(opt.chanceFormula==='level_difference') chance+=Number(opt.attackerBaseLevel||1)-Number(target?.level||target?.baseLevel||1);
  const activeResistance=target===window.player&&typeof window.getActiveBuffBonusTotals==='function'?Number(window.getActiveBuffBonusTotals().statusResistanceRate||0):0;
  const effectResistance=target===window.player?Number(window.EffectRuntime?.collectKeyed?.('statusResist',status,target,{includePassive:false,includeActive:false})||window.EffectRuntime?.collectKeyed?.('statusResist',id,target,{includePassive:false,includeActive:false})||0)/100:0;
  chance-=Math.floor(stat/5)+Number(target?.statusResist?.[id]||0)+activeResistance+effectResistance;
  return clamp(chance,Number(opt.minimumChance||0),Number(opt.maximumChance||100));
 },
 apply(target,status,opt={}){
  if(!target||!status) return {applied:false,chance:0};
  const normalized=this.normalize(status);
  if(target===window.player && normalized==='poison' && Number(typeof window.getActiveBuffBonusTotals==='function' ? window.getActiveBuffBonusTotals().poisonSuppressed || 0 : 0)>0) return {applied:false,chance:0,blocked:true,id:normalized};
  if(target===window.player){
   const active=typeof window.getActiveBuffBonusTotals==='function'?window.getActiveBuffBonusTotals():{};
   if(Number(active.statusImmune||0)>0) return {applied:false,chance:0,blocked:true,id:normalized};
   const groups={
    weapon:['stripweapon','weaponstrip','weaponbreak','breakweapon','meltdownweaponbreak'],
    shield:['stripshield','shieldstrip','shieldbreak','breakshield'],
    armor:['striparmor','armorstrip','armorbreak','breakarmor','meltdownarmorbreak'],
    headgear:['striphelm','striphead','stripheadgear','helmbreak','headbreak','headgearbreak'],
    shadow:['stripshadow','shadowstrip','shadowbreak','breakshadow','shadowequipmentbreak','stripshadowequipment']
   };
   const whole=Number(active.equipmentProtectionAll||0)>0;
   const unbreakableWeapon=window.EffectRuntime?.hasFlag?.('unbreakableWeapon',target)===true;
   const unbreakableShield=window.EffectRuntime?.hasFlag?.('unbreakableShield',target)===true;
   const unbreakableArmor=window.EffectRuntime?.hasFlag?.('unbreakableArmor',target)===true;
   const blocked=(whole&&[...groups.weapon,...groups.shield,...groups.armor,...groups.headgear].includes(normalized))
    ||((Number(active.weaponProtection||0)>0||unbreakableWeapon)&&groups.weapon.includes(normalized))
    ||((Number(active.shieldProtection||0)>0||unbreakableShield)&&groups.shield.includes(normalized))
    ||((Number(active.armorProtection||0)>0||unbreakableArmor)&&groups.armor.includes(normalized))
    ||(Number(active.headgearProtection||0)>0&&groups.headgear.includes(normalized))
    ||(Number(active.shadowEquipmentProtection||0)>0&&groups.shadow.includes(normalized));
   if(blocked)return {applied:false,chance:0,blocked:true,id:normalized,reason:'equipment_protected'};
  }
  const chance=this.chance(target,status,opt.chancePercent??100,opt);
  if(Math.random()*100>=chance) return {applied:false,chance};
  const id=this.normalize(status), duration=Math.max(0,Number(opt.durationMs||0));
  const effects=opt.effects||{[id]:1},periodicInterval=Math.max(0,Number(effects.periodicIntervalMs||effects.periodicDamageIntervalMs||effects.periodicHealIntervalMs||0)); stateOf(target)[id]={id,name:status,level:Number(opt.level||1),effects,expiresAt:duration?Date.now()+duration:0,nextPeriodicAt:periodicInterval?Date.now()+periodicInterval:0};
  return {applied:true,chance,id,duration};
 },
 has(target,status){ const id=this.normalize(status),s=stateOf(target)[id]; if(!s)return false; if(s.expiresAt&&s.expiresAt<=Date.now()){this.expire(target,id,s);return false;} return true; },
  onDamage(target,damage=0,opt={}){if(!target||Number(damage||0)<=0)return 0;const statuses=stateOf(target);let removed=0;for(const [key,state] of Object.entries(statuses)){if(Number(state?.effects?.breakOnDamage||0)>0){delete statuses[key];removed++;}}return removed;},

 tickPeriodic(target,now=Date.now()){
  if(!target)return 0;let total=0;const statuses=stateOf(target);
  for(const [key,state] of Object.entries(statuses)){
   if(state?.expiresAt&&state.expiresAt<=now){this.expire(target,key,state);continue;}
   const effects=state?.effects||{},interval=Math.max(0,Number(effects.periodicIntervalMs||effects.periodicDamageIntervalMs||effects.periodicHealIntervalMs||0));
   if(!interval)continue;if(!state.nextPeriodicAt)state.nextPeriodicAt=now+interval;if(now<state.nextPeriodicAt)continue;
   const hpKey=target.currentHp!==undefined?'currentHp':'hp',maxHp=Math.max(1,Number(target.maxHp??target.hpMax??target[hpKey]??1)),hp=Math.max(0,Number(target[hpKey]||0));
   const min=Math.max(0,Number(effects.periodicDamageMin??effects.periodicDamageFlat??0)),max=Math.max(min,Number(effects.periodicDamageMax??min));
   let damage=Math.floor(min+Math.random()*(max-min+1))+Math.floor(maxHp*Math.max(0,Number(effects.periodicDamageMaxHpPercent||0))/100)+Math.floor(hp*Math.max(0,Number(effects.periodicDamageCurrentHpPercent||0))/100);
   if(effects.periodicDamageNonLethal===true&&damage>=hp)damage=Math.max(0,hp-1);damage=Math.min(hp,Math.max(0,damage));
   const afterDamage=Math.max(0,hp-damage),heal=Math.max(0,Math.floor(maxHp*Math.max(0,Number(effects.periodicHealMaxHpPercent||0))/100)+Number(effects.periodicHealFlat||0));
   target[hpKey]=Math.min(maxHp,afterDamage+heal);total+=damage;state.nextPeriodicAt=now+interval;
   if(damage>0&&typeof window.showDamageNumber==='function')window.showDamageNumber(damage);
  }return total;
 },
 expire(target,key,state){
  const statuses=stateOf(target),effects=state?.effects||{},flat=Math.max(0,Number(effects.expireDamageFlat||0));
  const nextStatus=effects.onExpireStatus,nextDuration=Math.max(0,Number(effects.onExpireDurationMs||0)),nextEffects=effects.onExpireEffects||{};
  delete statuses[key];
  if(flat>0){const hpKey=target.currentHp!==undefined?'currentHp':'hp',hp=Math.max(0,Number(target[hpKey]||0)),damage=Math.min(hp,flat);target[hpKey]=Math.max(0,hp-damage);if(damage>0&&typeof window.showDamageNumber==='function')window.showDamageNumber(damage);if(damage>0&&typeof window.addBattleLog==='function')window.addBattleLog(`${state?.name||'狀態'}自然解除，造成 ${damage} 點傷害。`);if(target===window.currentMonster&&target[hpKey]<=0&&typeof window.defeatMonster==='function'&&typeof window.setTimeout==='function')window.setTimeout(()=>window.defeatMonster(),0);}
  if(nextStatus&&nextDuration>0&&Number(target?.currentHp??target?.hp??1)>0)this.apply(target,nextStatus,{chancePercent:100,minimumChance:100,maximumChance:100,durationMs:nextDuration,level:Number(state?.level||1),effects:nextEffects,allowBoss:true});
  return flat;
 },
 clearExpired(target){const s=stateOf(target),now=Date.now();Object.keys(s).forEach(k=>{if(s[k]?.expiresAt&&s[k].expiresAt<=now)this.expire(target,k,s[k]);});}
};
const MovementEffectResolver={
 frontslide(source,cells=7,target=window.currentMonster){
  if(!source?.position) return false;
  const cell=Number(window.RO_WEB_CELL_SIZE||36),dist=Math.max(0,Number(cells||0))*cell;
  let dx=0,dy=-1;
  if(target?.position){dx=Number(target.position.x||0)-Number(source.position.x||0);dy=Number(target.position.y||0)-Number(source.position.y||0);}
  else if(source.position.targetX!=null&&source.position.targetY!=null){dx=Number(source.position.targetX)-Number(source.position.x||0);dy=Number(source.position.targetY)-Number(source.position.y||0);}
  const len=Math.hypot(dx,dy)||1;
  const next={x:Number(source.position.x||0)+dx/len*dist,y:Number(source.position.y||0)+dy/len*dist};
  const safe=typeof window.clampPositionToBounds==='function'?window.clampPositionToBounds(next,'player'):next;
  source.position.x=safe.x;source.position.y=safe.y;source.position.targetX=null;source.position.targetY=null;
  return true;
 },
 backslide(source,cells=5,target=window.currentMonster){
  if(!source?.position) return false;
  const cell=Number(window.RO_WEB_CELL_SIZE||36),dist=Math.max(0,Number(cells||0))*cell;
  let dx=0,dy=1;
  if(target?.position){dx=Number(target.position.x||0)-Number(source.position.x||0);dy=Number(target.position.y||0)-Number(source.position.y||0);}
  else if(source.position.targetX!=null&&source.position.targetY!=null){dx=Number(source.position.targetX)-Number(source.position.x||0);dy=Number(source.position.targetY)-Number(source.position.y||0);}
  const len=Math.hypot(dx,dy)||1;
  const next={x:Number(source.position.x||0)-dx/len*dist,y:Number(source.position.y||0)-dy/len*dist};
  const safe=typeof window.clampPositionToBounds==='function'?window.clampPositionToBounds(next,'player'):next;
  source.position.x=safe.x;source.position.y=safe.y;source.position.targetX=null;source.position.targetY=null;
  return true;
 },
 knockback(target,source,cells=1,opt={}){
  if(!target||!source||target.knockbackImmune||target.isBoss||target.isMvp) return false;
  if(target===window.player&&window.EffectRuntime?.hasFlag?.('noKnockback',target))return false;
  if(typeof window.knockbackMonsterFromPlayer==='function' && source===window.player) return window.knockbackMonsterFromPlayer(target,cells);
  const tp=target.position||{x:Number(target.worldX||target.x||0),y:Number(target.worldY||target.y||0)};
  const sp=source.position||{x:Number(source.worldX||source.x||0),y:Number(source.worldY||source.y||0)};
  const dx=Number(tp.x||0)-Number(sp.x||0),dy=Number(tp.y||0)-Number(sp.y||0),len=Math.hypot(dx,dy)||1,dist=Math.max(0,Number(cells))*Number(window.RO_WEB_CELL_SIZE||36);
  const next={x:Number(tp.x||0)+dx/len*dist,y:Number(tp.y||0)+dy/len*dist};
  const safe=typeof window.clampPositionToBounds==='function'?window.clampPositionToBounds(next,'monster'):next;
  target.position=target.position||{};target.position.x=safe.x;target.position.y=safe.y;target.worldX=safe.x;target.worldY=safe.y;
  if(typeof window.refreshWorldMonsterSpatialEntity==='function'&&target?._worldTestEntity)window.refreshWorldMonsterSpatialEntity(target);
  if(typeof window.renderPositionSprites==='function') window.renderPositionSprites(); return true;
 },
 pull(target,source,cells=1){
  const tp=target?.position||{x:Number(target?.worldX||target?.x||0),y:Number(target?.worldY||target?.y||0)};
  const sp=source?.position||{x:Number(source?.worldX||source?.x||0),y:Number(source?.worldY||source?.y||0)};
  return this.knockback(target,{position:{x:Number(tp.x||0)+(Number(tp.x||0)-Number(sp.x||0))*2,y:Number(tp.y||0)+(Number(tp.y||0)-Number(sp.y||0))*2}},cells);
 },
 moveAdjacent(target){ if(typeof window.movePlayerAdjacentToMonster==='function') return window.movePlayerAdjacentToMonster(target); return false; }
};
const AreaShapeResolver={
 inRange(origin,target,shape='circle',range=1,opt={}){
  const ox=Number((origin?.worldX ?? origin?.x ?? origin?.position?.x) || 0),oy=Number((origin?.worldY ?? origin?.y ?? origin?.position?.y) || 0),tx=Number((target?.worldX ?? target?.x ?? target?.position?.x) || 0),ty=Number((target?.worldY ?? target?.y ?? target?.position?.y) || 0),cell=Number(window.RO_WEB_CELL_SIZE||36),r=Number(range)*cell,dx=tx-ox,dy=ty-oy;
  if(shape==='square') return Math.max(Math.abs(dx),Math.abs(dy))<=r;
  if(shape==='line') return Math.abs(dy)<=Number(opt.widthCells||1)*cell/2 && Math.abs(dx)<=r;
  if(shape==='directed_line'){
   const direction=opt.directionTarget||null,dx2=Number((direction?.worldX??direction?.x??direction?.position?.x)||0)-ox,dy2=Number((direction?.worldY??direction?.y??direction?.position?.y)||0)-oy,len=Math.hypot(dx2,dy2)||1,ux=dx2/len,uy=dy2/len,along=dx*ux+dy*uy,perp=Math.abs(dx*uy-dy*ux);
   return along>=0&&along<=r&&perp<=Number(opt.widthCells||1)*cell/2;
  }
  if(shape==='cone'){
   const direction=opt.directionTarget||null;
   const facing=direction?Math.atan2(Number((direction?.worldY??direction?.y??direction?.position?.y)||0)-oy,Number((direction?.worldX??direction?.x??direction?.position?.x)||0)-ox):Number(opt.facingRadians||0);
   const angle=Math.atan2(dy,dx),diff=Math.abs(Math.atan2(Math.sin(angle-facing),Math.cos(angle-facing)));
   return Math.hypot(dx,dy)<=r&&diff<=Number(opt.halfAngleRadians||Math.PI/4);
  }
  return Math.hypot(dx,dy)<=r;
 }
};
const TargetingResolver={
 collect(origin,candidates,opt={}){return (candidates||[]).filter(t=>t&&Number(t.currentHp??t.hp??0)>0&&AreaShapeResolver.inRange(origin,t,opt.shape||'circle',opt.rangeCells??1,opt)).slice(0,Math.max(1,Number(opt.maxTargets||999)));}
};
const MultiHitResolver={
 normalize(profile={},level=1){
  const value=v=>Array.isArray(v)?Number(v[Math.max(0,Math.min(v.length-1,level-1))]||0):Number(v||0);
  return {damageHitCount:Math.max(1,value(profile.damageHitCount??profile.hitCount??1)),visualHitCount:Math.max(1,value(profile.visualHitCount??profile.hitCount??1)),statusProcMode:profile.statusProcMode||profile.status?.procMode||'once',hitCheckMode:profile.hitCheckMode||'once',criticalCheckMode:profile.criticalCheckMode||'once'};
 },
 split(total,hits){const n=Math.max(1,Number(hits||1)),base=Math.floor(Number(total||0)/n),out=Array(n).fill(base);out[0]+=Number(total||0)-base*n;return out;}
};
const ResourceFormulaResolver={
 cartAtkRate(skillLevel){return clamp(Number(skillLevel||0),0,10);},
 inputs(source,target){return {hp:Number(source?.hp||0),maxHp:Number(source?.maxHp||0),sp:Number(source?.sp||0),maxSp:Number(source?.maxSp||0),baseLevel:Number(source?.baseLevel||1),jobLevel:Number(source?.jobLevel||1),weaponWeight:Number(source?.weaponWeight||0),shieldWeight:Number(source?.shieldWeight||0),targetHp:Number((target?.currentHp ?? target?.hp) || 0)};}
};
const BossRuleResolver={isBoss:t=>!!(t?.isBoss||t?.isMvp||t?.boss),canKnockback(t){return !this.isBoss(t)&&!t?.knockbackImmune;},canInstantKill(t){return !this.isBoss(t)&&!t?.instantKillImmune;}};
const GroundPlacementResolver={
 cellSize(){return Math.max(1,Number(window.RO_WEB_CELL_SIZE||36));},
 positionOf(entity){
  if(!entity)return null;
  const x=Number(entity?.position?.x??entity?.worldX??entity?.x),y=Number(entity?.position?.y??entity?.worldY??entity?.y);
  return Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;
 },
 snap(position,opt={}){
  const p=this.positionOf(position);if(!p)return null;
  if(opt.snapToCell===false)return p;
  const cell=this.cellSize();return{x:Math.round(p.x/cell)*cell,y:Math.round(p.y/cell)*cell};
 },
 resolve(position,opt={}){
  const raw=this.positionOf(position);if(!raw)return{ok:false,reason:'invalid_position'};
  const snapped=this.snap(raw,opt);if(!snapped)return{ok:false,reason:'invalid_position'};
  const bounded=typeof window.clampPositionToBounds==='function'?window.clampPositionToBounds(snapped,opt.kind||'ground'):snapped;
  if(!bounded||!Number.isFinite(Number(bounded.x))||!Number.isFinite(Number(bounded.y)))return{ok:false,reason:'out_of_bounds'};
  if(opt.strictBounds===true&&(Math.abs(Number(bounded.x)-snapped.x)>0.001||Math.abs(Number(bounded.y)-snapped.y)>0.001))return{ok:false,reason:'out_of_bounds'};
  if(typeof window.isGroundSkillPlacementLegal==='function'){
   const hook=window.isGroundSkillPlacementLegal({x:Number(bounded.x),y:Number(bounded.y)},opt);
   if(hook===false||hook?.ok===false)return{ok:false,reason:hook?.reason||'illegal_cell'};
  }
  return{ok:true,x:Number(bounded.x),y:Number(bounded.y),cellSizePx:this.cellSize(),snapped:opt.snapToCell!==false,source:raw};
 },
 distanceCells(a,b){const pa=this.positionOf(a),pb=this.positionOf(b);if(!pa||!pb)return Infinity;return Math.hypot(pa.x-pb.x,pa.y-pb.y)/this.cellSize();}
};
const GroundEffectManager={
 effects:new Map(),seq:1,lastBlockReason:null,
 overlaps(a,b){
  const cell=GroundPlacementResolver.cellSize(),ar=Math.max(0,Number(a?.rangeCells||0))*cell,br=Math.max(0,Number(b?.rangeCells||0))*cell;
  const dx=Number(a?.x||0)-Number(b?.x||0),dy=Number(a?.y||0)-Number(b?.y||0);
  const shapeA=String(a?.shape||'circle'),shapeB=String(b?.shape||'circle');
  if(shapeA==='circle'&&shapeB==='circle')return Math.hypot(dx,dy)<=ar+br;
  return Math.max(Math.abs(dx),Math.abs(dy))<=ar+br;
 },
 matchingEffects(opt={}){
  const key=String(opt.stackKey||opt.noOverlapKey||'');
  if(!key)return[];
  return[...this.effects.values()].filter(e=>String(e.stackKey||e.noOverlapKey||'')===key&&this.overlaps(e,opt));
 },
 blockersAt(opt={}){return[...this.effects.values()].filter(e=>e.blocksGroundMagic===true&&this.overlaps(e,opt));},
 removeGroundMagicInArea(zone){let removed=0;for(const[id,e]of[...this.effects]){if(e.isGroundMagic===true&&e.ignoreLandProtector!==true&&this.overlaps(zone,e)){this.effects.delete(id);removed++;}}this.reschedule();return removed;},
 enforceInstanceLimit(opt={}){
  const limit=Math.max(0,Number(opt.activeInstanceLimit||0));if(limit<=0)return;
  const skillId=Number(opt.sourceSkillId||0),ownerKey=String(opt.ownerKey||'player');
  const matches=[...this.effects.values()].filter(e=>Number(e.sourceSkillId||0)===skillId&&String(e.ownerKey||'player')===ownerKey).sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0));
  while(matches.length>=limit){const oldest=matches.shift();if(oldest)this.effects.delete(oldest.id);}
 },
 create(opt={}){
  this.lastBlockReason=null;
  const followTarget=opt.followTarget||null;
  const placement=followTarget?GroundPlacementResolver.resolve(followTarget,{snapToCell:false,strictBounds:false}):GroundPlacementResolver.resolve({x:opt.x,y:opt.y},{snapToCell:opt.snapToCell!==false,strictBounds:opt.strictBounds===true,kind:'ground',skillId:Number(opt.sourceSkillId||0)});
  if(!placement?.ok){this.lastBlockReason=placement?.reason||'invalid_position';return null;}
  const probe={...opt,x:placement.x,y:placement.y};
  if(opt.isGroundMagic===true&&opt.ignoreLandProtector!==true&&this.blockersAt(probe).length){this.lastBlockReason='land_protector';return null;}
  const overlapPolicy=String(opt.overlapPolicy||'stack').toLowerCase();
  const matching=this.matchingEffects(probe);
  if((overlapPolicy==='reject'||opt.noOverlapKey)&&matching.length){this.lastBlockReason='no_overlap';return null;}
  if(overlapPolicy==='replace'){for(const e of matching)this.effects.delete(e.id);}
  if(overlapPolicy==='refresh'&&matching.length){
   const e=matching[matching.length-1],now=Date.now(),durationMs=Math.max(0,Number(opt.durationMs||e.durationMs||0)),initialDelayMs=Math.max(0,Number(opt.initialDelayMs||0));
   e.x=placement.x;e.y=placement.y;e.createdAt=now;e.initialDelayMs=initialDelayMs;e.durationMs=durationMs;e.expiresAt=durationMs?now+initialDelayMs+durationMs:0;e.nextTick=now+initialDelayMs;e.ticks=0;e.maxTicks=Math.max(1,Number(opt.maxTicks||e.maxTicks||1));e.beforeTick=opt.beforeTick||e.beforeTick;e.onTick=opt.onTick||e.onTick;e.onExpire=opt.onExpire||e.onExpire;
   this.reschedule();return e.id;
  }
  this.enforceInstanceLimit(opt);
  const id=String(opt.id||`ground_${this.seq++}`),now=Date.now(),initialDelayMs=Math.max(0,Number(opt.initialDelayMs||0)),durationMs=Math.max(0,Number(opt.durationMs||0));
  const tickMs=Math.max(16,Number(opt.tickMs||1000)),maxTicks=Math.max(1,Number(opt.maxTicks||1));
  const entry={id,x:placement.x,y:placement.y,shape:opt.shape||'circle',rangeCells:Number(opt.rangeCells??1),tickMs,maxTicks,ticks:0,nextTick:now+initialDelayMs,initialDelayMs,durationMs,expiresAt:durationMs?now+initialDelayMs+durationMs:0,overlapPolicy,followTarget,isGroundMagic:opt.isGroundMagic===true,ignoreLandProtector:opt.ignoreLandProtector===true,blocksGroundMagic:opt.blocksGroundMagic===true,sourceSkillId:Number(opt.sourceSkillId||0),ownerKey:String(opt.ownerKey||'player'),stackKey:opt.stackKey||opt.noOverlapKey||null,noOverlapKey:opt.noOverlapKey||null,createdAt:now,beforeTick:opt.beforeTick,onTick:opt.onTick,onExpire:opt.onExpire,ignoreHovering:opt.ignoreHovering===true,metadata:opt.metadata||{},snapToCell:opt.snapToCell!==false,catchUpLimit:Math.max(1,Number(opt.catchUpLimit||2)),targetHitCounts:new Map()};
  if(entry.blocksGroundMagic)this.removeGroundMagicInArea(entry);
  this.effects.set(id,entry);this.reschedule();return id;
 },
 remove(id){const key=String(id),e=this.effects.get(key);if(e&&typeof e.onExpire==='function')e.onExpire(e,{reason:'removed'});this.effects.delete(key);this.reschedule();},
 clear(reason='clear'){for(const e of this.effects.values())if(typeof e.onExpire==='function')e.onExpire(e,{reason});this.effects.clear();this.reschedule();},
 removeInArea(origin,opt={}){const shape=opt.shape||'circle',rangeCells=Math.max(0,Number(opt.rangeCells||0));let removed=0;for(const[id,e]of[...this.effects]){if(AreaShapeResolver.inRange(origin,e,shape,rangeCells,opt)){this.effects.delete(id);removed++;}}this.reschedule();return removed;},
 collectCandidates(options={}){
  const rows=typeof window.getCombatGroundCandidates==='function'?window.getCombatGroundCandidates(options):[window.currentMonster].filter(Boolean),out=[],seen=new Set();
  for(const target of rows||[]){if(!target||seen.has(target))continue;seen.add(target);out.push(target);}return out;
 },
 effectCandidateBounds(e){
  const cell=GroundPlacementResolver.cellSize(),r=Math.max(0,Number(e?.rangeCells||0))*cell;
  return{minX:Number(e?.x||0)-r,maxX:Number(e?.x||0)+r,minY:Number(e?.y||0)-r,maxY:Number(e?.y||0)+r};
 },
 update(now=Date.now(),candidates=null){
  const periodicCandidates=candidates||this.collectCandidates();for(const target of periodicCandidates||[])StatusManager.tickPeriodic(target,now);
  for(const[id,e]of[...this.effects]){
   if(e.followTarget){const p=GroundPlacementResolver.positionOf(e.followTarget);if(p){e.x=p.x;e.y=p.y;}}
   if(e.expiresAt&&now>=e.expiresAt&&e.ticks>=e.maxTicks){if(typeof e.onExpire==='function')e.onExpire(e,{reason:'expired'});this.effects.delete(id);continue;}
   if(typeof e.onTick!=='function')continue;
   let loops=0;
   while(now>=e.nextTick&&e.ticks<e.maxTicks&&loops<e.catchUpLimit){
    e.ticks++;loops++;const scheduledAt=e.nextTick;e.nextTick+=e.tickMs;
    const effectCandidates=candidates||this.collectCandidates({bounds:this.effectCandidateBounds(e),activeOnly:true});
    if(typeof e.beforeTick==='function')e.beforeTick(e,{tickNumber:e.ticks,scheduledAt,now,candidates:effectCandidates});
    let targets=TargetingResolver.collect(e,effectCandidates,{shape:e.shape,rangeCells:e.rangeCells});
    targets=targets.filter(target=>{if(target!==window.player||e.ignoreHovering===true)return true;const active=typeof window.getActiveBuffBonusTotals==='function'?window.getActiveBuffBonusTotals():{};return Number(active.groundEffectImmune||0)<=0;});
    e.onTick(targets,e,{tickNumber:e.ticks,scheduledAt,now});
   }
   if(e.ticks>=e.maxTicks||(e.expiresAt&&now>=e.expiresAt)){if(typeof e.onExpire==='function')e.onExpire(e,{reason:'completed'});this.effects.delete(id);}
  }
  this.reschedule();
 },
 nextDelay(now=Date.now()){
  if(!this.effects.size)return 100;
  let next=100;
  for(const e of this.effects.values()){
   if(typeof e.onTick==='function')next=Math.min(next,Math.max(0,Number(e.nextTick||now)-now));
   if(e.expiresAt)next=Math.min(next,Math.max(0,Number(e.expiresAt)-now));
  }
  return Math.max(16,Math.min(100,Math.ceil(next)));
 },
 reschedule(){if(typeof scheduleGroundRuntimeLoop==='function')scheduleGroundRuntimeLoop();}
};
let groundLoopTimer=null;
function scheduleGroundRuntimeLoop(){
 if(groundLoopTimer){clearTimeout(groundLoopTimer);groundLoopTimer=null;}
 if(!GroundEffectManager.effects.size)return;
 groundLoopTimer=setTimeout(()=>{groundLoopTimer=null;GroundEffectManager.update(Date.now());},GroundEffectManager.nextDelay(Date.now()));
}
function startGroundRuntimeLoop(){scheduleGroundRuntimeLoop();}
function stopGroundRuntimeLoop(){if(groundLoopTimer){clearTimeout(groundLoopTimer);groundLoopTimer=null;}}
window.startGroundRuntimeLoop=startGroundRuntimeLoop;window.stopGroundRuntimeLoop=stopGroundRuntimeLoop;window.scheduleGroundRuntimeLoop=scheduleGroundRuntimeLoop;
window.RO_WEB_CRITICAL_AUTHORITY=RO_WEB_CRITICAL_AUTHORITY;
window.ROCombatMechanics={HitResolver,CriticalResolver,PerfectDodgeResolver,DefenseResolver,StatusManager,MovementEffectResolver,AreaShapeResolver,TargetingResolver,MultiHitResolver,ResourceFormulaResolver,BossRuleResolver,GroundPlacementResolver,GroundEffectManager,RO_WEB_CRITICAL_AUTHORITY};
Object.assign(window,{HitResolver,CriticalResolver,PerfectDodgeResolver,DefenseResolver,StatusManager,MovementEffectResolver,AreaShapeResolver,TargetingResolver,MultiHitResolver,ResourceFormulaResolver,BossRuleResolver,GroundPlacementResolver,GroundEffectManager});
})();
