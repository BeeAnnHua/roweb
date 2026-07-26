// RO_WEB 0.9.82FX - RA Renewal damage formula + Trait P.ATK/S.MATK/C.RATE + universal physical element endow
(function(){
"use strict";
const floor=n=>Math.floor(Number(n)||0), clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
function evalContext(){return window.RO_WEB_COMBAT_EVAL_CONTEXT||null;}
function derived(u){if(u===window.player){const cached=evalContext()?.derivedStats;if(cached)return cached;return typeof window.calculateDerivedPlayerStats==='function'?(window.calculateDerivedPlayerStats()||{}):(u||{});}return u||{};}
function activeTotals(){const cached=evalContext()?.activeBuffTotals;return cached||(typeof window.getActiveBuffBonusTotals==='function'?(window.getActiveBuffBonusTotals()||{}):{});}
function passiveTotals(){const cached=evalContext()?.passiveSkillBonusTotals;return cached||(typeof window.getPassiveSkillBonusTotals==='function'?(window.getPassiveSkillBonusTotals()||{}):{});}
function trainingTotals(){const cached=evalContext()?.trainingBonusTotals;return cached||(typeof window.getTrainingBonusTotals==='function'?(window.getTrainingBonusTotals()||{}):{});}
function itemAt(slot){
 let id=window.player?.equipment?.[slot];
 // 0.9.82DN：刺客副手實際存於盾牌／副手欄。只有該欄真的是武器時才視為 leftWeapon。
 if(slot==='leftWeapon'&&!id) id=window.player?.equipment?.shield;
 if(!id||typeof window.getItemData!=='function') return null;
 const item=window.getItemData(id);
 if(slot==='leftWeapon'){
  const isWeapon=item&&(item.slot==='weapon'||item.category==='weapon'||item.dbType==='Weapon'||item.Type==='Weapon');
  if(!isWeapon) return null;
 }
 return item||null;
}
function weapon(slot='weapon'){return itemAt(slot);}
function stats(){const d=derived(window.player),s=d.stats||window.player?.stats||{};return {d,s,baseLevel:Number(window.player?.baseLevel||1)};}
function normType(w){return String(w?.dbSubType||w?.SubType||w?.subType||w?.weaponType||w?.subCategory||'fist').toLowerCase();}
function isRangedWeapon(w){return /bow|instrument|whip|gun|rifle|shotgun|gatling|grenade/.test(normType(w));}
function attackRangeType(profile={},w=weapon()){
 const explicit=String(profile.attackRangeType||profile.rangeType||'').toLowerCase();
 if(explicit==='short'||explicit==='long') return explicit;
 const dynamic=profile.rangeTypeByWeapon||null,type=normType(w);
 if(dynamic){for(const [token,value] of Object.entries(dynamic)){if(token==='default')continue;if(type.includes(String(token).toLowerCase()))return String(value).toLowerCase();}if(dynamic.default)return String(dynamic.default).toLowerCase();}
 if(profile.longRange===true||isRangedWeapon(w)) return 'long';
 return 'short';
}
function attackElement(profile={},w=weapon()){
 // 技能／魔法自身屬性解析。肯貝特只作用物理傷害，因此此函式不讀取物理附魔 Buff。
 const mode=String(profile.elementSource||'').toLowerCase();
 if(mode==='neutral') return 'Neutral';
 if(mode==='forced'||mode==='skill') return profile.element||'Neutral';
 if(profile.element && mode!=='weapon') return profile.element;
 if(mode==='weapon') return w?.element||w?.attackElement||'Neutral';
 return profile.element||w?.element||w?.attackElement||'Neutral';
}
function physicalAttackElement(w=weapon()){
 // 道具肯貝特具有最高優先權，且一張同時作用主手、副手與所有 physical 技能。
 const itemBuff=window.player?.activeBuffs?.item_physical_element_endow;
 if(itemBuff&&Number(itemBuff.expiresAt||0)>Date.now()&&itemBuff.effects?.attackElementOverride){
  return itemBuff.effects.attackElementOverride;
 }
 const buffElement=typeof window.getActiveBuffSpecialValue==='function'?window.getActiveBuffSpecialValue('attackElementOverride',null):null;
 if(buffElement) return buffElement;
 const equipmentElement=window.CardRuntime?.getMergedSource?.()?.weaponElement;
 if(equipmentElement) return equipmentElement;
 if(window.player?.attackElement) return window.player.attackElement;
 return w?.element||w?.attackElement||'Neutral';
}
function getElementRateAgainstTarget(element,target){
 const runtime=window.CombatFormulaRuntime;
 if(!runtime?.getTargetProfile||!runtime?.getElementMultiplier)return 100;
 const profile=runtime.getTargetProfile(target);
 return Number(runtime.getElementMultiplier(element,profile.element,profile.elementLevel));
}
function isElementImmuneAgainstTarget(element,target,flags={}){
 if(flags?.ignoreElement)return false;
 return getElementRateAgainstTarget(element,target)<=0;
}
function refineAtk(w){
 const refine=Math.max(0,Number(w?.refine??w?.Refine??0));
 const wlv=Math.max(1,Number(w?.weaponLevel??w?.WeaponLevel??1));
 const per=[0,2,3,5,7,10][Math.min(5,wlv)]||2;
 const over=Math.max(0,refine-Number(w?.safeRefine??w?.SafeRefine??0));
 const overBonus=over?floor(over*per/2):0;
 return refine*per+overBonus;
}
function ammoAtk(){return 0; /* RO_WEB 不使用箭矢／子彈／砲彈／苦無等彈藥 ATK。 */}
function buildHandParts(slot='weapon',opt={}){
 const {d,s,baseLevel}=stats(),w=weapon(slot),ranged=isRangedWeapon(w);
 const primary=ranged?Number(s.dex||1):Number(s.str||1);
 const baseStatusAtk=floor(baseLevel/4)+primary+floor(Number(ranged?s.str:s.dex||0)/5)+floor(Number(s.luk||0)/3)+5*Number(s.pow||0);
 // Renewal doubles right-hand StatusATK after property adjustment; left-hand keeps the base value.
 const statusAtk=slot==='weapon'?baseStatusAtk*2:baseStatusAtk;
 const watk=Math.max(0,Number(w?.atk||w?.Attack||0));
 const wlv=Math.max(0,Number(w?.weaponLevel||w?.WeaponLevel||0));
 const variance=Math.max(0,floor(watk*0.05*wlv));
 const statBonus=floor(watk*primary/200);
 const maximize=Number(activeTotals().maximizeWeaponDamage||0)>0;
 const critical=!!opt.critical;
 let rolled=(critical||maximize)?watk+variance+statBonus:Math.max(0,watk+statBonus+(variance?floor(Math.random()*(variance*2+1))-variance:0));
 const sizeRate=opt.ignoreSize===true?100:Number(window.CombatFormulaRuntime?.getWeaponSizeMultiplier?.(normType(w),opt.target?.size||opt.target?.Size||'Medium')||100);
 rolled=floor(rolled*sizeRate/100);
 const refine=refineAtk(w);
 const ammo=0;
 const mainWeapon=weapon('weapon'),leftWeapon=weapon('leftWeapon');
 const mainWatk=Math.max(0,Number(mainWeapon?.atk||mainWeapon?.Attack||0));
 const leftWatk=leftWeapon&&leftWeapon!==mainWeapon?Math.max(0,Number(leftWeapon?.atk||leftWeapon?.Attack||0)):0;
 // Derived ATK contains status ATK, equipped weapon ATK and flat ATK bonuses. Remove weapon bases to recover Renewal E.ATK-like bonuses.
 let equipTotal=Math.max(0,Number(d.atk||baseStatusAtk)-baseStatusAtk-mainWatk-leftWatk);
 let weaponAtk=rolled;
 const edpMultiplier=Number(typeof window.getActiveBuffSpecialValue==='function'?window.getActiveBuffSpecialValue('edpWeaponAtkMultiplierPercent',100):100);
 if(edpMultiplier!==100){weaponAtk=floor(weaponAtk*edpMultiplier/100);equipTotal=floor(equipTotal*edpMultiplier/100);}
 const activeMastery=Number(activeTotals().masteryAtkFlat||0);
 const masteryAtk=Number(opt.masteryAtk||0)+activeMastery;
 const atkRate=Number(opt.atkRate||0);
 const percentAtk=floor((weaponAtk+refine+ammo+Math.max(0,equipTotal))*atkRate/100);
 return {slot,statusAtk,baseStatusAtk,weaponAtk,weaponSizeRate:sizeRate,refineAtk:refine,ammoAtk:ammo,equipmentAtk:Math.max(0,equipTotal),masteryAtk,percentAtk,weapon:w,weaponType:normType(w),edpMultiplier};
}
function buildPhysicalParts(opt={}){
 const right=buildHandParts('weapon',opt),left=buildHandParts('leftWeapon',opt);
 // rAthena battle.cpp is_attack_left_handed(): normal attacks may use the left
 // hand, while active skills use the right hand unless a skill profile opts in
 // to a verified special exception.
 const hasLeft=opt.includeLeftHand===true&&!!left.weapon;
 return {right,left:hasLeft?left:null,dualWield:hasLeft,rangeType:attackRangeType(opt.profile||{},right.weapon)};
}
function sumHand(p){return p.statusAtk+p.weaponAtk+p.refineAtk+p.ammoAtk+p.equipmentAtk+p.masteryAtk+p.percentAtk;}
function normalizeFlags(profile={}){
 const f=profile.flags||profile.nkFlags||{};
 return {
  ignoreDefense:!!(f.ignoreDefense||profile.ignoreDefense),ignoreMagicDefense:!!(f.ignoreMagicDefense||profile.ignoreMagicDefense),
  ignoreElement:!!(f.ignoreElement||profile.ignoreElement),ignoreSize:!!(f.ignoreSize||profile.ignoreSize),
  ignoreRaceModifier:!!(f.ignoreRaceModifier||profile.ignoreRaceModifier),ignoreEquipmentModifiers:!!(f.ignoreEquipmentModifiers||profile.ignoreEquipmentModifiers),
  splitDamageByTargets:!!(f.splitDamageByTargets||profile.splitDamageByTargets),noCardFix:!!(f.noCardFix||profile.noCardFix),ignoreMagicImmunity:!!(f.ignoreMagicImmunity||profile.ignoreMagicImmunity),
  noWeaponDamage:!!(f.noWeaponDamage||profile.noWeaponDamage),fixedDamage:!!(f.fixedDamage||profile.fixedDamage),
  ignorePAtk:!!(f.ignorePAtk||profile.ignorePAtk)
 };
}
function defenseOptions(profile={},damageType='physical'){
 const mode=String(profile.defenseMode||'normal').toLowerCase(),flags=normalizeFlags(profile);
 return {flags,damageType,applyDefense:!flags.fixedDamage,ignoreDefense:flags.ignoreDefense||mode==='ignore',ignoreMagicDefense:flags.ignoreMagicDefense||mode==='ignore',
  defPiercePercent:Math.min(100,(mode==='half'?50:Number(profile.defensePiercePercent||0))+Number(activeTotals().defPiercePercent||0)),mdefPiercePercent:Math.min(100,(mode==='half'?50:Number(profile.mdefPiercePercent||0))+Number(activeTotals().mdefPiercePercent||0)),
  hardDef:profile.hardDef,softDef:profile.softDef,hardMdef:profile.hardMdef,softMdef:profile.softMdef,simpleDefense:mode==='simple'||profile.simpleDefense===true,
  res:profile.res,mres:profile.mres,flatReduction:profile.flatReduction,minimumDamage:profile.minimumDamage,damageImmunity:profile.damageImmunity};
}
function targetStatusTakenRate(target,opt={}){
 const statuses=target?.runtimeState?.statuses||{};let rate=0;
 Object.values(statuses).forEach(state=>{
  if(state?.expiresAt&&state.expiresAt<=Date.now())return;const e=state?.effects||{};
  rate+=Number(e.allDamageTakenRate||0);
  if(opt.damageType==='physical') rate+=Number(e.physicalDamageTakenRate||0);
  if(opt.damageType==='magic') rate+=Number(e.magicDamageTakenRate||0);
  if(opt.damageType==='physical'&&opt.attackRangeType==='short'){let v=Number(e.shortPhysicalDamageTakenRate||0);if(state.id==='darkcrow'&&(target?.isBoss||target?.isMvp||target?.boss))v/=2;rate+=v;}
  if(opt.damageType==='physical'&&opt.attackRangeType==='long') rate+=Number(e.longPhysicalDamageTakenRate||0);
  if(String(opt.element||'').toLowerCase()==='poison') rate+=Number(e.poisonDamageTakenRate||0);
  if(String(opt.element||'').toLowerCase()==='holy') rate+=Number(e.holyDamageTakenRate||0);
  if(String(opt.element||'').toLowerCase()==='fire') rate+=Number(e.fireDamageTakenRate||0);
  if(String(opt.element||'').toLowerCase()==='water') rate+=Number(e.waterDamageTakenRate||0);
  if(String(opt.element||'').toLowerCase()==='wind'&&opt.damageType==='magic') rate+=Number(e.windMagicDamageTakenRate||0);
 });return rate;
}
function finalModifiers(raw,target,opt={}){
 const flags=opt.flags||{};
 const imprisoned=!!window.StatusManager?.has(target,'white_imprison'),incomingElement=String(opt.element||'Neutral').toLowerCase();
 if(imprisoned&&incomingElement!=='ghost')return 0;
 const runtime=typeof window.getMonsterRuntimeBonuses==='function'?(window.getMonsterRuntimeBonuses(target)||{}):{};
 const magicImmune=target?.magicImmune===true||target?.magicImmunity===true||target?.immuneMagic===true;
 if(String(opt.damageType||'').toLowerCase()==='magic'&&magicImmune&&Number(runtime.magicImmunityDisabled||0)<=0&&!flags.ignoreMagicImmunity)return 0;
 if(target?.damageImmune===true||opt.damageImmunity===true) return 0;
 let damage=Math.max(0,floor(raw));
 if(typeof window.applyROCombatDamageModifiers!=='function'){
  throw new Error('[Renewal Formula] CombatFormulaRuntime.applyDamage 尚未載入；禁止退回舊公式。');
 }
 damage=window.applyROCombatDamageModifiers(damage,{damageType:opt.damageType||'physical',target,source:opt.source||window.player,attackElement:flags.ignoreElement?'Neutral':opt.element,
  weaponType:opt.weaponType,attackRangeType:opt.attackRangeType,applyWeaponSize:opt.applyWeaponSize!==false&&!flags.ignoreSize&&!(Number(window.CombatFormulaRuntime?.collectScalarBonus?.(opt.source||window.player,'ignoreWeaponSizePenalty',['weaponSizePerfect','perfectSizeDamage'])||0)>0),
  applyElement:!flags.ignoreElement,applyRaceModifier:!flags.ignoreRaceModifier,applyEquipmentModifiers:!flags.ignoreEquipmentModifiers&&!flags.noCardFix,
  applyDefense:opt.applyDefense!==false,ignoreDefense:opt.ignoreDefense,ignoreMagicDefense:opt.ignoreMagicDefense,defPiercePercent:opt.defPiercePercent,
  mdefPiercePercent:opt.mdefPiercePercent,hardDef:opt.hardDef,softDef:opt.softDef,hardMdef:opt.hardMdef,softMdef:opt.softMdef,res:opt.res,mres:opt.mres,flatReduction:opt.flatReduction,simpleDefense:opt.simpleDefense,critical:opt.critical===true,minimumDamage:opt.minimumDamage,hitCount:Math.max(1,Number(opt.hitCount??opt.hits??1)||1),skillId:opt.skillId,skill:opt.skill,skillKey:opt.skillKey});
 const activeBuffs=activeTotals();
 const targetElement=String(target?.element||target?.Element||target?.defElement||'').toLowerCase();
 let basilicaRate=0;
 if(String(opt.damageType||'physical').toLowerCase()==='physical' && (targetElement.includes('dark')||targetElement.includes('undead'))) basilicaRate+=Number(activeBuffs.basilicaPhysicalDarkUndeadRate||0);
 if(String(opt.damageType||'').toLowerCase()==='magic' && String(opt.element||'').toLowerCase()==='holy') basilicaRate+=Number(activeBuffs.holyMagicDamageRate||0);
 if(basilicaRate) damage=Math.max(0,floor(damage*(100+basilicaRate)/100));
 const takenRate=targetStatusTakenRate(target,opt);if(takenRate)damage=Math.max(0,floor(damage*(100+takenRate)/100));
 const fixed=Math.max(0,Number(target?.fixedDamageReduction||0)+Number(opt.fixedDamageReduction||0));
 damage=Math.max(0,floor(damage-fixed));
 const percent=clamp(Number(target?.finalDamageReduction||0)+Number(opt.finalDamageReduction||0),0,100);
 damage=floor(damage*(100-percent)/100);
 const minimum=Math.max(0,Number(opt.minimumDamage??1));
 if(damage>0) damage=Math.max(minimum,damage);
 if(damage>0&&imprisoned&&incomingElement==='ghost'){const statuses=target?.runtimeState?.statuses||{};delete statuses.whiteimprison;delete statuses.white_imprison;}
 if(damage>0 && window.StatusManager?.has(target,"aeterna")) {
  damage=Math.floor(damage*2);
  const statuses=target?.runtimeState?.statuses||{};
  delete statuses.aeterna;
 }
 if(damage>0){
  const statuses=target?.runtimeState?.statuses||{},element=String(opt.element||'').toLowerCase();
  for(const [key,state] of Object.entries(statuses)){
   const effects=state?.effects||{};
   if(effects.clearOnDamage===true||Number(effects.clearOnDamage||0)>0||(element==='fire'&&(effects.clearOnFireDamage===true||Number(effects.clearOnFireDamage||0)>0)))delete statuses[key];
  }
 }
 return damage;
}
function fearBreezeProc(active={},weaponType='fist'){
 const level=clamp(floor(active?.fearBreezeLevel||0),0,5);
 if(level<=0||!String(weaponType||'').toLowerCase().includes('bow'))return null;
 const chance=Math.random()*100;let hits=1;
 if(level>=5&&chance<4)hits=5;
 else if(level>=4&&chance<7)hits=4;
 else if(level>=3&&chance<10)hits=3;
 else if(chance<13)hits=2;
 return hits>1?{key:'fear_breeze',ratio:hits*100,hits}:null;
}
function procPassives(profile={}){
 const p=typeof window.getPassiveSkillBonusTotals==='function'?window.getPassiveSkillBonusTotals():{};
 const tripleChance=clamp(p.tripleAttackChance||0,0,100);
 if(profile.allowNormalProc!==false&&tripleChance>0&&Math.random()*100<tripleChance)return {key:'triple',ratio:Number(p.tripleAttackRatio||100),hits:Number(p.tripleAttackHits||3)};
 const doubleChance=clamp(p.doubleAttackChance||0,0,100),doubleHits=Math.max(1,Number(p.doubleAttackHits||1));
 if(profile.allowNormalProc!==false&&doubleHits>1&&Math.random()*100<doubleChance)return {key:'double',ratio:doubleHits*100,hits:doubleHits};
 return null;
}
function applyComponentRatio(parts,ratio,flags={}){
 const pAtk=flags.ignorePAtk?0:Number(derived(window.player)?.pAtk||window.player?.pAtk||0);
 function hand(h){
  if(!h)return 0;
  const weaponPart=flags.noWeaponDamage?0:(h.weaponAtk+h.refineAtk+h.ammoAtk);
  const equip=flags.ignoreEquipmentModifiers?0:h.equipmentAtk;
  // Renewal order: Status/W.ATK/E.ATK/PercentATK -> P.ATK -> MasteryATK -> skill ratio.
  let base=h.statusAtk+weaponPart+equip+h.percentAtk;
  if(pAtk)base=floor(base*(100+pAtk)/100);
  base+=h.masteryAtk;
  return floor(base*ratio/100);
 }
 const out={right:hand(parts.right),left:hand(parts.left)};
 if(parts.dualWield&&typeof window.getDualWieldHandRateTotals==='function'){
  const rates=window.getDualWieldHandRateTotals()||{};
  if(rates.active){out.right=floor(out.right*Number(rates.right||100)/100);out.left=floor(out.left*Number(rates.left||100)/100);}
 }
 return out;
}
function applyActiveFieldElementRate(raw,element,active){
 const fieldElement=typeof window.getActiveBuffSpecialValue==='function'?window.getActiveBuffSpecialValue('fieldElementDamageElement',null):null;
 const rate=Number(active?.fieldElementDamageRate||0);
 return rate&&String(fieldElement||'').toLowerCase()===String(element||'').toLowerCase()?floor(Number(raw||0)*(100+rate)/100):Number(raw||0);
}
function applyActiveElementDamageRate(raw,element,active){
 let out=applyActiveFieldElementRate(raw,element,active);
 if(String(element||'').toLowerCase()==='holy') out=floor(out*(100+Number(active?.holyDamageRate||0))/100);
 return out;
}
function activeSubElementDamage(baseRaw,target,profile={},weaponType='fist',rangeType='short'){
 if(typeof window.getActiveBuffSpecialValue!=='function')return 0;
 const rate=Number(window.getActiveBuffSpecialValue('subElementDamageRate',0)||0);
 const element=window.getActiveBuffSpecialValue('subElement',null);
 if(rate<=0||!element)return 0;
 return finalModifiers(floor(Number(baseRaw||0)*rate/100),target,{damageType:'physical',element,weaponType,attackRangeType:rangeType});
}
function vigorDamageRate(active,target,rangeType){
 if(String(rangeType||'short').toLowerCase()!=='short')return 0;
 const lv=Math.max(0,Number(active?.vigorLevel||0));if(lv<=0)return 0;
 const race=String(target?.race||target?.Race||'').toLowerCase();
 return 100+15*lv+((race.includes('demihuman')||race.includes('demi-human')||race.includes('human')||race.includes('angel'))?10*lv:0);
}
function renewalCritAtkRate(flags={}){
 const api=window.CombatFormulaRuntime;
 return Number(api?.collectScalarBonus?.(window.player,'critAtkRate',['criticalAtkRate','criticalDamageRate'],!flags.ignoreEquipmentModifiers&&!flags.noCardFix)||0);
}
function renewalNonCritAtkRate(flags={}){
 const api=window.CombatFormulaRuntime;
 return Number(api?.collectScalarBonus?.(window.player,'nonCritAtkRate',['nonCriticalDamageRate'],!flags.ignoreEquipmentModifiers&&!flags.noCardFix)||0);
}
function resolveNormalAttack(target,opt={}){
 const mainWeapon=weapon('weapon'),preRange=attackRangeType({elementSource:'weapon'},mainWeapon);
 const crit=opt.criticalResult||window.CriticalResolver?.resolve(window.player,target,{criticalMode:'normal',attackRangeType:preRange})||{critical:false,multiplier:1.4};
 const cardPerfectSize=Number(window.CombatFormulaRuntime?.collectScalarBonus?.(window.player,'ignoreWeaponSizePenalty',['weaponSizePerfect','perfectSizeDamage'])||0)>0;
 const parts=buildPhysicalParts({critical:crit.critical,atkRate:Number(opt.atkRate||0),masteryAtk:Number(opt.masteryAtk||0),profile:{elementSource:'weapon'},target,ignoreSize:cardPerfectSize,includeLeftHand:true});
 const active=activeTotals();
 let proc=opt.procOverride||null;if(!proc&&opt.allowNormalProc!==false)proc=fearBreezeProc(active,parts.right.weaponType);if(!proc&&opt.allowNormalProc!==false)proc=procPassives(opt);const ratio=Number(opt.ratioOverride||(proc?.ratio)||100);
 const comp=applyComponentRatio(parts,ratio,{});
 const nextPhysicalMultiplier=typeof window.consumeNextPhysicalAttackMultiplier==='function'?Number(window.consumeNextPhysicalAttackMultiplier()||100):100;
 const passive=passiveTotals();
 const unlimitedRate=parts.rangeType==='long'?Number(active.longPhysicalDamageRate||0):0;
 const passiveLongRate=parts.rangeType==='long'?Number(passive.longPhysicalDamageRate||0):0;
 const globalRate=(Number(trainingTotals().damageRate||0))+Number(passive.damageRate||0)+Number(passive.weaponAtkRate||0)+Number(active.damageRate||0)+Number(active.physicalDamageRate||0)+unlimitedRate+passiveLongRate+vigorDamageRate(active,target,parts.rangeType);
 const flatTargetBonus=typeof window.getPassiveTargetDamageBonus==='function'?Number(window.getPassiveTargetDamageBonus(target)||0):0;
 const critAtkRate=renewalCritAtkRate(),nonCritAtkRate=renewalNonCritAtkRate();
 function prepareHand(value){
  let out=Math.max(0,Number(value||0));
  if(nextPhysicalMultiplier!==100)out=floor(out*nextPhysicalMultiplier/100);
  out=floor(out*(100+globalRate)/100);
  out+=flatTargetBonus;
  if(crit.critical&&critAtkRate)out=floor(out*(100+critAtkRate)/100);
  else if(!crit.critical&&nonCritAtkRate)out=floor(out*(100+nonCritAtkRate)/100);
  return out;
 }
 const rightRaw=prepareHand(comp.right),leftRaw=parts.left?prepareHand(comp.left):0;
 const rightElement=physicalAttackElement(parts.right.weapon),leftElement=parts.left?physicalAttackElement(parts.left.weapon):rightElement;
 const rightPrepared=applyActiveElementDamageRate(rightRaw,rightElement,active),leftPrepared=parts.left?applyActiveElementDamageRate(leftRaw,leftElement,active):0;
 const plantTarget=window.CombatFormulaRuntime?.isInfiniteDefenseTarget?.(target,{damageType:'physical',attackRangeType:parts.rangeType})===true;
 const procHits=Math.max(1,Number(proc?.hits||1));
 // rAthena caps dual-wield plant damage at one per hand; otherwise DAMAGE_DIV_FIX keeps one per hit.
 const rightHitCount=plantTarget&&parts.left?1:procHits;
 const rightDamage=finalModifiers(rightPrepared,target,{damageType:'physical',element:rightElement,weaponType:parts.right.weaponType,attackRangeType:parts.rangeType,applyWeaponSize:false,critical:!!crit.critical,hitCount:rightHitCount});
 const leftDamage=parts.left?finalModifiers(leftPrepared,target,{damageType:'physical',element:leftElement,weaponType:parts.left.weaponType,attackRangeType:parts.rangeType,applyWeaponSize:false,critical:!!crit.critical,hitCount:1}):0;
 // Renewal Katar normal attacks add a secondary hand hit after the right-hand
 // result. TF_DOUBLE raises it from 1% to 21% at Lv10. Active skills remain
 // right-hand only unless a profile explicitly requests a left-hand exception.
 const katarDoubleLevel=String(parts.right.weaponType||'').includes('katar')&&typeof window.getSkillLevel==='function'?Math.max(0,Number(window.getSkillLevel(48)||0)):0;
 const katarOffhandDamage=!plantTarget&&!parts.left&&String(parts.right.weaponType||'').includes('katar')?Math.max(1,floor(rightDamage*(1+katarDoubleLevel*2)/100)):0;
 const subElementDamage=activeSubElementDamage(comp.right+comp.left,target,{},parts.right.weaponType,parts.rangeType);
 const damage=rightDamage+leftDamage+katarOffhandDamage+subElementDamage;
 const raw=rightRaw+leftRaw;
 const rightElementRate=getElementRateAgainstTarget(rightElement,target),leftElementRate=parts.left?getElementRateAgainstTarget(leftElement,target):rightElementRate;
 const elementImmune=rightElementRate<=0&&(!parts.left||leftElementRate<=0)&&subElementDamage<=0;
 const result={damage,raw,parts,handDamage:comp,handFinalDamage:{right:rightDamage,left:leftDamage,katar:katarOffhandDamage},critical:!!crit.critical,critAtkRate,nonCritAtkRate,proc,visualHits:Math.max(proc?.hits||1,katarOffhandDamage>0?2:1),element:rightElement,leftElement,rightElementRate,leftElementRate,elementImmune,subElementDamage,rangeType:parts.rangeType};window.lastRADamageTrace={type:'normal',...result};return result;
}
function resolvePhysicalSkill(profile,level,target,opt={}){
 const flags=normalizeFlags(profile),crit=opt.criticalResult||{critical:false,multiplier:1};
 // rAthena clears BDMG_CRIT before Sharpshooting base damage: a successful
 // critical roll ignores FLEE/DEF, but does not receive the 1.40+C.RATE damage
 // multiplier or critical weapon max-roll/card stage.
 const sharpshootingCritical=profile.formula==='renewal_sharpshooting'&&crit.critical===true;
 const damageCritical=crit.critical===true&&!sharpshootingCritical;
 const cardPerfectSize=!flags.ignoreEquipmentModifiers&&!flags.noCardFix&&Number(window.CombatFormulaRuntime?.collectScalarBonus?.(window.player,'ignoreWeaponSizePenalty',['weaponSizePerfect','perfectSizeDamage'])||0)>0;
 const parts=buildPhysicalParts({critical:damageCritical,atkRate:Number(profile.atkRate||0),masteryAtk:Number(profile.masteryAtk||0),profile,target,ignoreSize:profile.applyWeaponSize===false||flags.ignoreSize||cardPerfectSize,includeLeftHand:profile.includeLeftHandDamage===true||profile.useLeftHandDamage===true});
 const ratio=Number(opt.ratio??profile.ratio??100),flat=Number(opt.flatAddition??profile.flatAddition??0),hits=Math.max(1,Number(opt.hits??profile.hits??profile.hitCount??1)||1),comp=applyComponentRatio(parts,ratio,flags);
 let raw=comp.right+comp.left+flat;
 const nextPhysicalMultiplier=typeof window.consumeNextPhysicalAttackMultiplier==='function'?Number(window.consumeNextPhysicalAttackMultiplier()||100):100;
 if(nextPhysicalMultiplier!==100)raw=floor(raw*nextPhysicalMultiplier/100);
 raw+=typeof window.getPassiveTargetDamageBonus==='function'?Number(window.getPassiveTargetDamageBonus(target)||0):0;
 const active=activeTotals();
 const passive=passiveTotals();
 const trainingRate=Number(trainingTotals().damageRate||0);
 const unlimitedRate=(parts.rangeType==='long'&&profile.unlimitExcluded!==true)?Number(active.longPhysicalDamageRate||0):0;
 const shieldSkillRate=profile.requiresShield===true?Number(passive.shieldAtkRate||0):0;
 const physicalRate=trainingRate+Number(passive.damageRate||0)+Number(passive.weaponAtkRate||0)+shieldSkillRate+Number(active.damageRate||0)+Number(active.physicalDamageRate||0)+unlimitedRate+vigorDamageRate(active,target,parts.rangeType);
 raw=floor(raw*(100+physicalRate)/100);
 const passiveLongRate=parts.rangeType==='long'?Number(passive.longPhysicalDamageRate||0):0;
 if(passiveLongRate)raw=floor(raw*(100+passiveLongRate)/100);
 const critAtkRate=renewalCritAtkRate(flags),nonCritAtkRate=renewalNonCritAtkRate(flags);
 // Renewal applies bCritAtkRate at half effectiveness to critical skills.
 if(!sharpshootingCritical&&crit.critical&&critAtkRate)raw=floor(raw*(100+critAtkRate/2)/100);
 else if(!crit.critical&&nonCritAtkRate)raw=floor(raw*(100+nonCritAtkRate)/100);
 const element=physicalAttackElement(parts.right.weapon),def=defenseOptions(profile,'physical');
 if(sharpshootingCritical)def.ignoreDefense=true;
 raw=applyActiveElementDamageRate(raw,element,active);
 let damage=finalModifiers(raw,target,{...def,element,weaponType:parts.right.weaponType,attackRangeType:parts.rangeType,applyWeaponSize:false,critical:damageCritical,hitCount:hits,skill:profile,skillId:profile.officialId??profile.id,skillKey:profile.key??profile.skillKey??profile.aegisName});
 const baseComp=applyComponentRatio(parts,100,flags);const subElementDamage=activeSubElementDamage(baseComp.right+baseComp.left,target,profile,parts.right.weaponType,parts.rangeType);damage+=subElementDamage;
 const elementRate=getElementRateAgainstTarget(element,target),elementImmune=isElementImmuneAgainstTarget(element,target,flags)&&damage<=0&&subElementDamage<=0;
 const result={damage,raw,parts,handDamage:comp,ratio,flat,hits,critical:!!crit.critical,sharpshootingCritical,damageCritical,critAtkRate,nonCritAtkRate,element,elementRate,elementImmune,subElementDamage,defenseMode:profile.defenseMode||'normal',flags,rangeType:parts.rangeType};window.lastRADamageTrace={type:'physical_skill',...result};return result;
}
function resolveSpecialPhysical(profile,level,target,opt={}){
 const flags=normalizeFlags(profile),active=activeTotals(),passive=passiveTotals();
 let raw=Math.max(0,floor(opt.rawDamage??profile.rawDamage??0));
 const rangeType=attackRangeType(profile,weapon()),element=attackElement(profile);
 // Special Renewal weapon damage (Dragon Breath, Max-HP based attacks, etc.)
 // does not rebuild Status/W.ATK, refine or mastery. It still receives the
 // common skill/global physical rates and the normal element/card/range/target
 // reduction stages allowed by its RA flags.
 const trainingRate=Number(trainingTotals().damageRate||0);
 const globalRate=trainingRate+Number(passive.damageRate||0)+Number(active.damageRate||0)+Number(active.physicalDamageRate||0)+(rangeType==='long'?Number(active.longPhysicalDamageRate||0)+Number(passive.longPhysicalDamageRate||0):0);
 if(globalRate)raw=floor(raw*(100+globalRate)/100);
 raw=applyActiveElementDamageRate(raw,element,active);
 const def=defenseOptions(profile,'physical');
 const damage=finalModifiers(raw,target,{...def,element,weaponType:normType(weapon()),attackRangeType:rangeType,applyWeaponSize:false,critical:false,skill:profile,skillId:profile.officialId??profile.id,skillKey:profile.key??profile.skillKey??profile.aegisName});
 const elementRate=getElementRateAgainstTarget(element,target),elementImmune=isElementImmuneAgainstTarget(element,target,flags)&&damage<=0;
 const result={damage,raw,element,elementRate,elementImmune,rangeType,flags,defenseMode:profile.defenseMode||'normal',specialPhysical:true};window.lastRADamageTrace={type:'special_physical',...result};return result;
}
function resolveMagicSkill(profile,level,target,opt={}){
 const {d}=stats(),flags=normalizeFlags(profile);const min=Math.max(1,Number(d.matkMin??d.matk??window.player?.matk??1)),max=Math.max(min,Number(d.matkMax??d.matk??window.player?.matk??min));
 const active=activeTotals();
 const recognized=Number(active.recognizedSpell||0)>0;
 const matk=recognized?max:min+floor(Math.random()*(max-min+1)),smatk=Number(d.smatkRate||d.sMatk||window.player?.sMatk||0),ratio=Number(opt.ratio??profile.matkRatioPerHit??profile.ratio??100),hits=Math.max(1,Number(opt.hits||1)),flat=Number(opt.flatAddition??profile.flatAddition??0);
 let raw=floor(matk*(100+smatk)/100*ratio/100*hits)+flat;
 const passive=passiveTotals();
 const globalRate=(Number(trainingTotals().damageRate||0))+Number(passive.damageRate||0)+Number(passive.magicDamageRate||0)+Number(active.damageRate||0)+Number(active.magicDamageRate||0);
 raw=floor(raw*(100+globalRate)/100);
 const element=attackElement({...profile,elementSource:profile.elementSource||'skill'});
 const ghostRate=String(element||'').toLowerCase()==='ghost'?Number(active.ghostMagicDamageRate||0):0;if(ghostRate)raw=floor(raw*(100+ghostRate)/100);
 const endowMagicElement=typeof window.getActiveBuffSpecialValue==='function'?window.getActiveBuffSpecialValue('magicElementDamageElement',null):null;
 const endowMagicRate=Number(active.magicElementDamageRate||0);if(endowMagicRate&&String(endowMagicElement||'').toLowerCase()===String(element||'').toLowerCase())raw=floor(raw*(100+endowMagicRate)/100);
 raw=applyActiveElementDamageRate(raw,element,active);
 const def=defenseOptions(profile,'magic');
 const damage=finalModifiers(raw,target,{...def,element,applyWeaponSize:false,hitCount:hits,skill:profile,skillId:profile.officialId??profile.id,skillKey:profile.key??profile.skillKey??profile.aegisName});
 const elementRate=getElementRateAgainstTarget(element,target),elementImmune=isElementImmuneAgainstTarget(element,target,flags)&&damage<=0;
 const result={damage,raw,matk,matkMin:min,matkMax:max,recognizedSpell:recognized,smatk,ratio,hits,element,elementRate,elementImmune,flags,defenseMode:profile.defenseMode||'normal'};window.lastRADamageTrace={type:'magic_skill',...result};return result;
}
function resolveMiscSkill(profile,level,target,opt={}){
 const flags=normalizeFlags(profile),src=window.player||{},inputs=window.ResourceFormulaResolver?.inputs(src,target)||{};
 const mode=String(profile.miscFormulaMode||profile.formulaMode||'fixed').toLowerCase();let raw=0;
 if(mode==='max_hp')raw=floor(Number(inputs.maxHp||0)*Number(profile.basePercent||0)/100);
 else if(mode==='current_hp')raw=floor(Number(inputs.hp||0)*Number(profile.basePercent||0)/100);
 else if(mode==='max_sp')raw=floor(Number(inputs.maxSp||0)*Number(profile.basePercent||0)/100);
 else if(mode==='base_level')raw=floor(Number(inputs.baseLevel||1)*Number(profile.levelMultiplier||1)+Number(profile.flatAddition||0));
 else if(mode==='atk_matk_mix'){const d=stats().d;raw=floor(Number(d.atk||0)*Number(profile.atkRatio||0)/100+Number(d.matk||0)*Number(profile.matkRatio||0)/100+Number(profile.flatAddition||0));}
 else raw=Number(opt.rawDamage??profile.fixedDamage??profile.flatAddition??0);
 if(profile.targetCount&&flags.splitDamageByTargets)raw=floor(raw/Math.max(1,Number(profile.targetCount)));
 const element=attackElement(profile),def=defenseOptions(profile,'misc');if(flags.fixedDamage)def.applyDefense=false;
 const hits=Math.max(1,Number(opt.hits??profile.hits??profile.hitCount??1)||1);
 const damage=finalModifiers(raw,target,{...def,element,applyWeaponSize:false,minimumDamage:profile.minimumDamage??0,hitCount:hits,skill:profile,skillId:profile.officialId??profile.id,skillKey:profile.key??profile.skillKey??profile.aegisName});
 const elementRate=getElementRateAgainstTarget(element,target),elementImmune=isElementImmuneAgainstTarget(element,target,flags)&&damage<=0;
 const result={damage,raw,element,elementRate,elementImmune,flags,formulaMode:mode,hits};window.lastRADamageTrace={type:'misc_skill',...result};return result;
}
function resolveReflection(result,target,profile={}){
 if(!result||result.damage<=0)return {reflected:0};const type=result.damageType||profile.damageType||'physical';
 const runtime=typeof window.getMonsterRuntimeBonuses==='function'?(window.getMonsterRuntimeBonuses(target)||{}):{};
 const rate=Number(type==='magic'?(Number(runtime.magicReflectionDisabled||0)>0?0:(target?.magicReflectRate||0)):(target?.physicalReflectRate||target?.reflectRate||0));
 const flat=Number(target?.reflectFlatDamage||0);let reflected=Math.max(0,floor(result.damage*rate/100)+flat);
 const reduced=window.EffectRuntime?.applyReflectionReduction?.(reflected,window.player)||{damage:reflected,rate:0};
 return {reflected:reduced.damage,reductionRate:reduced.rate};
}
window.RARenewalDamagePipeline={buildPhysicalParts,buildHandParts,resolveNormalAttack,resolvePhysicalSkill,resolveSpecialPhysical,resolveMagicSkill,resolveMiscSkill,resolveReflection,resolveAttackElement:attackElement,resolvePhysicalAttackElement:physicalAttackElement,resolveAttackRangeType:attackRangeType,getElementRateAgainstTarget,isElementImmuneAgainstTarget,normalizeFlags,finalModifiers,fearBreezeProc};
})();
