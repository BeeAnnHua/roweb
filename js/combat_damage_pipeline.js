// RO_WEB 0.9.82EH - RA Renewal common combat pipeline / registry runtime
(function(){
"use strict";
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,num(v)));
function registry(name){
  const entries=[];
  return {
    name,
    register(entry){ if(entry&&entry.key&&typeof entry.apply==='function'&&!entries.some(x=>x.key===entry.key)) entries.push(entry); return this; },
    run(ctx){ for(const entry of entries){ try{ if(entry.condition && !entry.condition(ctx)) continue; const out=entry.apply(ctx); if(out&&typeof out==='object') Object.assign(ctx,out); if(ctx.stopRegistry) break; }catch(err){ console.warn(`[${name}] ${entry.key} skipped`,err); } } ctx.stopRegistry=false; return ctx; },
    list(){ return entries.map(x=>x.key); }
  };
}
const PassiveProcRegistry=registry('PassiveProcRegistry');
const ElementModifierRegistry=registry('ElementModifierRegistry');
const RaceModifierRegistry=registry('RaceModifierRegistry');
const SizeModifierRegistry=registry('SizeModifierRegistry');
const DefenseModifierRegistry=registry('DefenseModifierRegistry');
const StatusModifierRegistry=registry('StatusModifierRegistry');

function passiveTotals(){ return window.RO_WEB_COMBAT_EVAL_CONTEXT?.passiveSkillBonusTotals||(typeof window.getPassiveSkillBonusTotals==='function'?(window.getPassiveSkillBonusTotals()||{}):{}); }
PassiveProcRegistry
.register({key:'triple_attack',condition:ctx=>ctx.kind==='normal'&&ctx.allowNormalProc!==false&&num(passiveTotals().tripleAttackChance)>0,apply(ctx){const p=passiveTotals();if(Math.random()*100>=clamp(p.tripleAttackChance,0,100))return;ctx.proc={key:'triple',ratio:num(p.tripleAttackRatio,100),hits:num(p.tripleAttackHits,3)};ctx.ratio=ctx.proc.ratio;ctx.visualHits=ctx.proc.hits;ctx.stopRegistry=true;}})
.register({key:'double_attack',condition:ctx=>ctx.kind==='normal'&&ctx.allowNormalProc!==false&&num(passiveTotals().doubleAttackHits,1)>1,apply(ctx){const p=passiveTotals();if(Math.random()*100>=clamp(p.doubleAttackChance,0,100))return;ctx.proc={key:'double',ratio:num(p.doubleAttackHits,2)*100,hits:num(p.doubleAttackHits,2)};ctx.ratio=ctx.proc.ratio;ctx.visualHits=ctx.proc.hits;ctx.stopRegistry=true;}})
.register({key:'auto_spell',condition:ctx=>ctx.kind==='normal'&&Array.isArray(ctx.source?.autoSpellProcs)&&ctx.source.autoSpellProcs.length>0,apply(ctx){ctx.secondaryProcs=ctx.secondaryProcs||[];for(const p of ctx.source.autoSpellProcs){if(Math.random()*100<clamp(p.chance,0,100))ctx.secondaryProcs.push({key:'auto_spell',skillId:p.skillId,level:p.level||1});}}})
.register({key:'weapon_proc',condition:ctx=>ctx.kind==='normal'&&Array.isArray(ctx.weapon?.procs),apply(ctx){ctx.secondaryProcs=ctx.secondaryProcs||[];for(const p of ctx.weapon.procs){if(Math.random()*100<clamp(p.chance,0,100))ctx.secondaryProcs.push({key:'weapon_proc',...p});}}})
.register({key:'card_proc',condition:ctx=>ctx.kind==='normal'&&Array.isArray(ctx.source?.cardProcs),apply(ctx){ctx.secondaryProcs=ctx.secondaryProcs||[];for(const p of ctx.source.cardProcs){if(Math.random()*100<clamp(p.chance,0,100))ctx.secondaryProcs.push({key:'card_proc',...p});}}});

ElementModifierRegistry.register({key:'resolve_attack_element',apply(ctx){const api=window.RARenewalDamagePipeline;ctx.element=(ctx.kind==='normal'||ctx.kind==='physical')?api?.resolvePhysicalAttackElement(ctx.weapon):api?.resolveAttackElement(ctx.profile||{},ctx.weapon);ctx.element=ctx.element||'Neutral';}});
RaceModifierRegistry.register({key:'race_metadata',apply(ctx){ctx.targetRace=ctx.target?.race||ctx.target?.Race||'Formless';}});
SizeModifierRegistry.register({key:'size_metadata',apply(ctx){ctx.targetSize=ctx.target?.size||ctx.target?.Size||'Medium';}});
DefenseModifierRegistry.register({key:'defense_mode',apply(ctx){const mode=String(ctx.profile?.defenseMode||'normal');ctx.defenseMode=mode;ctx.ignoreDefense=mode==='ignore';const active=window.RO_WEB_COMBAT_EVAL_CONTEXT?.activeBuffTotals||(typeof window.getActiveBuffBonusTotals==='function'?window.getActiveBuffBonusTotals():{});ctx.defPiercePercent=clamp((mode==='half'?50:num(ctx.profile?.defensePiercePercent))+num(active.defPiercePercent),0,100);ctx.mdefPiercePercent=clamp((mode==='half'?50:num(ctx.profile?.mdefPiercePercent))+num(active.mdefPiercePercent),0,100);}});
StatusModifierRegistry.register({key:'collect_status',condition:ctx=>!!ctx.profile?.status||Array.isArray(ctx.profile?.statuses),apply(ctx){ctx.pendingStatuses=Array.isArray(ctx.profile.statuses)?ctx.profile.statuses:(ctx.profile.status?[ctx.profile.status]:[]);}});

function buildContext(kind,profile,level,target,options={}){
 return {kind,profile:profile||{},level:num(level,1),target,source:options.source||window.player,weapon:null,ratio:num(options.ratio,profile?.ratio??100),flatAddition:num(options.flatAddition,profile?.flatAddition??0),visualHits:num(options.visualHits,1),allowNormalProc:options.allowNormalProc!==false,skipHitCheck:!!options.skipHitCheck,criticalResult:options.criticalResult||null,options};
}
function resolveHit(ctx){
 if(ctx.skipHitCheck||ctx.kind==='magic'||ctx.kind==='misc'||ctx.critical?.critical===true) {ctx.hit=true;return ctx;}
 const hitMode=ctx.profile.hitMode||(ctx.profile.alwaysHit?'always_hit':'normal');
 if(!window.HitResolver) throw new Error('[Renewal Formula] HitResolver 尚未載入；禁止使用舊命中公式。');
 const r=window.HitResolver.resolve(ctx.source,ctx.target,{hitMode,alwaysHit:ctx.profile.alwaysHit,perfectHit:ctx.profile.perfectHit,ignoreFlee:ctx.profile.ignoreFlee});
 ctx.hit=!!r.hit;ctx.hitRate=r.chance;return ctx;
}
function resolveCritical(ctx){
 if(ctx.kind==='magic'||ctx.kind==='misc'){ctx.critical={critical:false,multiplier:1};return ctx;}
 const mode=ctx.kind==='normal'?'normal':(ctx.profile.criticalMode||'never');
 if(!ctx.criticalResult&&!window.CriticalResolver) throw new Error('[Renewal Formula] CriticalResolver 尚未載入；禁止使用舊暴擊公式。');
 ctx.critical=ctx.criticalResult||window.CriticalResolver.resolve(ctx.source,ctx.target,{criticalMode:mode,criticalRateBonus:ctx.profile.criticalRateBonus,criticalRateMultiplier:ctx.profile.criticalRateMultiplier});return ctx;
}
function resolvePerfectDodge(ctx){
 ctx.hit=true;
 if(ctx.skipHitCheck||ctx.kind==='magic'||ctx.kind==='misc'||ctx.profile.canPerfectDodge!==true&&ctx.kind!=='normal')return ctx;
 if(!window.PerfectDodgeResolver) throw new Error('[Renewal Formula] PerfectDodgeResolver 尚未載入；禁止略過幸運閃避判定。');
 if(window.PerfectDodgeResolver.resolve(ctx.target).dodged){ctx.hit=false;ctx.perfectDodged=true;}return ctx;
}
function calculate(ctx){
 if(!window.RARenewalDamagePipeline) throw new Error('RARenewalDamagePipeline missing');
 if(ctx.kind==='normal') return window.RARenewalDamagePipeline.resolveNormalAttack(ctx.target,{criticalResult:ctx.critical,allowNormalProc:false,ratioOverride:ctx.ratio,procOverride:ctx.proc,atkRate:ctx.options.atkRate,masteryAtk:ctx.options.masteryAtk});
 if(ctx.kind==='magic') return window.RARenewalDamagePipeline.resolveMagicSkill(ctx.profile,ctx.level,ctx.target,{ratio:ctx.ratio,hits:num(ctx.options.hits,1),flatAddition:ctx.flatAddition});
 if(ctx.kind==='misc') return window.RARenewalDamagePipeline.resolveMiscSkill(ctx.profile,ctx.level,ctx.target,ctx.options);
 return window.RARenewalDamagePipeline.resolvePhysicalSkill(ctx.profile,ctx.level,ctx.target,{ratio:ctx.ratio,flatAddition:ctx.flatAddition,criticalResult:ctx.critical,hits:num(ctx.options.hits??ctx.profile?.hits??ctx.profile?.hitCount??ctx.visualHits,1)});
}
function resolveMonsterAttack(source,target=window.player,options={}){
 const attacker=source||{};
 const defender=target||window.player||{};
 const attackType=String(options.damageType||attacker.attackType||attacker.damageType||attacker.attackDamageType||'physical').toLowerCase();
 const damageType=attackType.includes('magic')?'magic':'physical';
 const rangeCells=Math.max(1,num(options.attackRangeCells,attacker.attackRange??attacker.AttackRange??attacker.attack_range??attacker.range??1));
 const attackRangeType=rangeCells>1?'long':'short';
 if(!options.skipPerfectDodge){
  const dodge=window.PerfectDodgeResolver?.resolve(defender)||{dodged:false,chance:0};
  if(dodge.dodged)return {damage:0,miss:true,perfectDodged:true,perfectDodge:dodge,hit:false,damageType,attackRangeType};
 }
 if(!options.skipHitCheck){
  const hit=window.HitResolver?.resolve(attacker,defender,{hit:options.hit,flee:options.flee,hitMode:options.hitMode,alwaysHit:options.alwaysHit,ignoreFlee:options.ignoreFlee})||{hit:false,chance:0};
  if(!hit.hit)return {damage:0,miss:true,perfectDodged:false,hit:false,hitResult:hit,damageType,attackRangeType};
 }
 const runtime=typeof window.getMonsterRuntimeBonuses==='function'?(window.getMonsterRuntimeBonuses(attacker)||{}):{};
 const base=damageType==='magic'
  ?num(attacker.matk??attacker.magicAtk??attacker.magicAttack??attacker.atk??attacker.attack,1)
  :num(attacker.atk??attacker.attack,1);
 const explicitMin=num(damageType==='magic'?(attacker.matkMin??attacker.magicAtkMin):(attacker.atkMin??attacker.attackMin),NaN);
 const explicitMax=num(damageType==='magic'?(attacker.matkMax??attacker.magicAtkMax):(attacker.atkMax??attacker.attackMax),NaN);
 const min=Number.isFinite(explicitMin)?explicitMin:Math.max(1,base-2);
 const max=Number.isFinite(explicitMax)?Math.max(min,explicitMax):Math.max(min,base+2);
 let raw=Math.floor(min+Math.random()*(max-min+1));
 raw=Math.floor(raw*(100+num(runtime.atkRate))/100);
 raw=Math.floor(raw*(100+num(runtime.outgoingDamageRate))/100);
 raw=Math.floor(raw*(100+num(damageType==='magic'?runtime.outgoingMagicDamageRate:runtime.outgoingPhysicalDamageRate))/100);
 if(attackRangeType==='long')raw=Math.floor(raw*(100+num(runtime.outgoingLongRangeDamageRate))/100);
 const element=options.attackElement||attacker.attackElement||attacker.element||'Neutral';
 if(!window.CombatFormulaRuntime?.applyDamage) throw new Error('[Renewal Formula] CombatFormulaRuntime.applyDamage 尚未載入；禁止使用舊怪物傷害公式。');
 let damage=window.CombatFormulaRuntime.applyDamage(raw,{damageType,source:attacker,target:defender,attackElement:element,sourceRace:attacker.race||attacker.Race||'Formless',sourceSize:attacker.size||attacker.Size||'Medium',attackRangeType,applyWeaponSize:false,applyEquipmentModifiers:false,minimumDamage:1});
 // Player-only runtime reductions are centralized here so battle.js never re-applies an old second formula path.
 if(defender===window.player){
  const active=typeof window.getActiveBuffBonusTotals==='function'?(window.getActiveBuffBonusTotals()||{}):{};
  const flat=typeof window.getPassiveIncomingFlatReduction==='function'?num(window.getPassiveIncomingFlatReduction(attacker)):0;
  damage=Math.max(0,Math.floor(damage-flat));
  const taken=num(active.incomingDamageRate);
  if(taken)damage=Math.max(0,Math.floor(damage*(100+taken)/100));
  if(damageType==='physical'&&attackRangeType==='long'){const reduction=clamp(active.longPhysicalDamageReductionRate,0,100);if(reduction)damage=Math.max(0,Math.floor(damage*(100-reduction)/100));}
  const finalReduction=clamp(active.finalDamageReduction,0,100);
  if(finalReduction)damage=Math.max(0,Math.floor(damage*(100-finalReduction)/100));
 }
 return {damage:Math.max(0,damage),raw,miss:false,perfectDodged:false,hit:true,damageType,attackRangeType,element,source:attacker,target:defender};
}

function resolve(kind,profile,level,target,options={}){
 const ctx=buildContext(kind,profile,level,target,options);
 ctx.weapon=(window.player?.equipment?.weapon&&typeof window.getItemData==='function')?window.getItemData(window.player.equipment.weapon):null;
 // Renewal order: Lucky Dodge first, critical check second, regular HIT/FLEE last. Criticals always hit.
 resolvePerfectDodge(ctx); if(!ctx.hit)return {...ctx,damage:0,miss:true};
 resolveCritical(ctx);
 resolveHit(ctx); if(!ctx.hit)return {...ctx,damage:0,miss:true};
 if(kind==='normal') PassiveProcRegistry.run(ctx);
 ElementModifierRegistry.run(ctx);RaceModifierRegistry.run(ctx);SizeModifierRegistry.run(ctx);DefenseModifierRegistry.run(ctx);StatusModifierRegistry.run(ctx);
 const result=calculate(ctx);
 return {...ctx,...result,miss:false,secondaryProcs:ctx.secondaryProcs||[]};
}
const API={
 resolveNormalAttack:(target,options={})=>resolve('normal',{elementSource:'weapon'},1,target,options),
 resolvePhysicalSkill:(profile,level,target,options={})=>resolve('physical',profile,level,target,options),
 resolveMagicSkill:(profile,level,target,options={})=>resolve('magic',profile,level,target,options),
 resolveMiscSkill:(profile,level,target,options={})=>resolve('misc',profile,level,target,options),
 resolveMonsterAttack,
 resolve,
 registries:{PassiveProcRegistry,ElementModifierRegistry,RaceModifierRegistry,SizeModifierRegistry,DefenseModifierRegistry,StatusModifierRegistry},
 buildAttackContext:buildContext
};
window.CombatDamagePipeline=API;
window.AttackPipeline=API;
window.RO_WEB_FORMULA_AUTHORITY=Object.freeze({
 version:'0.9.82EH',
 ruleset:'rAthena Renewal',
 normalAttack:'CombatDamagePipeline.resolveNormalAttack',
 physicalSkill:'CombatDamagePipeline.resolvePhysicalSkill',
 magicSkill:'CombatDamagePipeline.resolveMagicSkill',
 miscSkill:'CombatDamagePipeline.resolveMiscSkill',
 monsterAttack:'CombatDamagePipeline.resolveMonsterAttack',
 modifiers:'CombatFormulaRuntime.applyDamage',
 hit:'HitResolver',
 critical:'CriticalResolver',
 defense:'DefenseResolver'
});
})();
