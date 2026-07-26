// RO_WEB 0.9.82EH - rAthena Renewal shared combat formula runtime
(function () {
  "use strict";
  const FALLBACK = {
    elements:["Neutral","Water","Earth","Fire","Wind","Poison","Holy","Dark","Ghost","Undead"],
    races:["Formless","Undead","Brute","Plant","Insect","Fish","Demon","DemiHuman","Angel","Dragon","Player","Boss","NonBoss"],
    attributeLevels:{"1":{}}, weaponSizeModifiers:{}, weaponTypeToRa:{},
    defaults:{attackElement:"Neutral",defenseElement:"Neutral",defenseElementLevel:1,race:"Formless",size:"Medium"}
  };
  let tables = FALLBACK;
  const cap=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
  const percentStage=(damage,rate)=>Math.floor(Number(damage||0)*(100+Number(rate||0))/100);
  function canon(value,allowed,fallback){const raw=String(value??"").trim().toLowerCase().replace(/[ _-]/g,"");const found=(Array.isArray(allowed)?allowed:[]).find(x=>String(x).toLowerCase().replace(/[ _-]/g,"")===raw);return found||fallback;}
  function normalizeElement(v){return canon(v,tables.elements||FALLBACK.elements,"Neutral");}
  function normalizeSize(v){return canon(v,["Small","Medium","Large"],"Medium");}
  function normalizeRace(v){return canon(v,tables.races||FALLBACK.races,"Formless");}
  function levelOf(v){return String(cap(Math.floor(Number(v)||1),1,4));}

  function modifierWrappers(source){return source?[source,source.effects,source.bonuses,source.combatModifiers,source.runtimeCombatModifiers].filter(x=>x&&typeof x==='object'):[];}
  function scalarRate(source,key,aliases=[]){let total=0;for(const obj of modifierWrappers(source)){for(const name of [key,...aliases]){const v=obj[name];if(typeof v==='number')total+=Number(v)||0;else if(v&&typeof v==='object'&&!Array.isArray(v)){const d=v.current??v.all??v.All??v.ALL;if(typeof d==='number')total+=Number(d)||0;}}}return total;}
  function keyedRate(source,group,key){let total=0;for(const obj of modifierWrappers(source)){const map=obj[group];if(!map||typeof map!=='object'||Array.isArray(map))continue;total+=Number(map[key]??map[String(key).toLowerCase()]??map.all??map.All??0)||0;}return total;}
  function getItem(id){return id&&typeof window.getItemData==='function'?window.getItemData(id):null;}
  function equipmentSources(unit=window.player){
    if(unit!==window.player||!unit?.equipment||typeof window.getItemData!=='function')return [];
    const result=[];const mainId=unit.equipment.weapon;const main=getItem(mainId);
    for(const [slot,id] of Object.entries(unit.equipment)){
      if(!id)continue;
      if((slot==='shield'||slot==='leftWeapon')&&id===mainId&&main&&(main.twoHanded||main.hands===2||main.weaponHands===2))continue;
      const item=getItem(id);if(!item)continue;result.push(item);
    }
    if(window.CardRuntime?.getSources)result.push(...window.CardRuntime.getSources());
    return result;
  }
  function passive(){return window.RO_WEB_COMBAT_EVAL_CONTEXT?.passiveCombatModifierTotals||(typeof window.getPassiveCombatModifierTotals==='function'?(window.getPassiveCombatModifierTotals()||{}):{});}
  function active(){return window.RO_WEB_COMBAT_EVAL_CONTEXT?.activeBuffTotals||(typeof window.getActiveBuffBonusTotals==='function'?(window.getActiveBuffBonusTotals()||{}):{});}
  function collectScalar(source,key,aliases=[],includeEquipment=true){let total=scalarRate(source,key,aliases);if(source===window.player){if(includeEquipment)for(const item of equipmentSources(source))total+=scalarRate(item,key,aliases);total+=scalarRate(passive(),key,aliases)+scalarRate(active(),key,aliases);}return total;}
  function collectKeyed(source,group,key,includeEquipment=true){let total=keyedRate(source,group,key);if(source===window.player){if(includeEquipment)for(const item of equipmentSources(source))total+=keyedRate(item,group,key);total+=keyedRate(passive(),group,key)+keyedRate(active(),group,key);}return total;}
  function getWeaponItem(){return getItem(window.player?.equipment?.weapon);}
  function getAttackElement(override=null){if(override)return normalizeElement(override);const w=getWeaponItem();return normalizeElement(w?.element||w?.attackElement||window.player?.attackElement||"Neutral");}
  function isBossUnit(target){return target?.isBoss===true||target?.isMvp===true||target?.boss===true||String(target?.class||target?.Class||'').toLowerCase()==='boss';}
  function getTargetProfile(target){
    const activeArmorElement=target===window.player&&typeof window.getActiveBuffSpecialValue==='function'?window.getActiveBuffSpecialValue('armorElement',null):null;
    const holyDefense=target===window.player&&Number(active().holyDefenseElement||0)>0;
    const runtime=target!==window.player&&typeof window.getMonsterRuntimeBonuses==='function'?(window.getMonsterRuntimeBonuses(target)||{}):{};
    const playerElementOverride=activeArmorElement||(holyDefense?'Holy':null);
    return {race:normalizeRace(target?.race||target?.Race||"Formless"),size:normalizeSize(target?.size||target?.Size||"Medium"),element:normalizeElement(playerElementOverride||runtime.defenseElementOverride||target?.element||target?.Element||target?.defElement||"Neutral"),elementLevel:playerElementOverride?1:cap(Math.floor(Number(runtime.defenseElementLevelOverride||target?.elementLevel||target?.ElementLevel||target?.eleLv||1)),1,4),classType:isBossUnit(target)?'Boss':'NonBoss'};
  }
  function getElementMultiplier(atk,def,lv){const row=tables.attributeLevels?.[levelOf(lv)]||{};return Number(row?.[normalizeElement(atk)]?.[normalizeElement(def)]??100);}
  function getWeaponSizeMultiplier(type,size){const web=String(type||"fist").toLowerCase();const raKey=String(tables.weaponTypeToRa?.[web]||web).toLowerCase();return Number(tables.weaponSizeModifiers?.[raKey]?.[normalizeSize(size).toLowerCase()]??100);}

  function hasMonsterMode(target,key){
    if(!target)return false;
    const flags=target.modeFlags||target.Modes||target.modes||{};
    if(Array.isArray(flags))return flags.some(name=>String(name).toLowerCase()===String(key).toLowerCase());
    if(flags&&typeof flags==='object'){
      if(flags[key]===true)return true;
      const found=Object.keys(flags).find(name=>String(name).toLowerCase()===String(key).toLowerCase());
      if(found)return flags[found]===true;
    }
    const behavior=target.behavior||{};
    const behaviorKey={IgnoreMelee:'ignoreMelee',IgnoreMagic:'ignoreMagic',IgnoreRanged:'ignoreRanged',IgnoreMisc:'ignoreMisc'}[key];
    return behaviorKey?behavior[behaviorKey]===true:false;
  }
  function isInfiniteDefenseTarget(target,context={}){
    if(!target)return false;
    if(target.infiniteDefense===true)return true;
    const type=String(context.damageType||'physical').toLowerCase();
    if(type==='magic')return hasMonsterMode(target,'IgnoreMagic');
    if(type==='misc')return hasMonsterMode(target,'IgnoreMisc');
    const range=String(context.attackRangeType||context.rangeType||'short').toLowerCase();
    return range==='long'?hasMonsterMode(target,'IgnoreRanged'):hasMonsterMode(target,'IgnoreMelee');
  }
  function normalizeIncomingDamage(target,damage,context={}){
    const value=Math.max(0,Number(damage)||0);
    if(value<=0)return 0;
    if(!isInfiniteDefenseTarget(target,context))return value;
    // rAthena battle_calc_attack_plant: 1 damage per successful hit, then DAMAGE_DIV_FIX.
    const hits=Math.max(1,Math.floor(Number(context.hitCount??context.hits??1)||1));
    return Math.max(1,Number(target?.fixedDamagePerHit||1))*hits;
  }

  function collectAttackBonuses(targetProfile,source=window.player,damageType='physical',includeEquipment=true,attackElement='Neutral'){
    const r=targetProfile.race,s=targetProfile.size,e=targetProfile.element,c=targetProfile.classType,magic=String(damageType).toLowerCase()==='magic';
    const raceGroup=magic?'magicRaceDamage':'physicalRaceDamage',sizeGroup=magic?'magicSizeDamage':'sizeDamage',classGroup=magic?'magicClassDamage':'physicalClassDamage';
    const attackEle=normalizeElement(attackElement);
    const typeRateKey=magic?'magicDamageRate':'physicalDamageRate';
    return {
      race:collectKeyed(source,'raceDamage',r,includeEquipment)+collectKeyed(source,raceGroup,r,includeEquipment),
      size:collectKeyed(source,sizeGroup,s,includeEquipment),
      element:collectKeyed(source,'elementDamage',e,includeEquipment)+(magic?collectKeyed(source,'magicElementDamage',e,includeEquipment):collectKeyed(source,'physicalElementDamage',e,includeEquipment)),
      attackElement:collectKeyed(source,'attackElementDamage',attackEle,includeEquipment)+(magic?collectKeyed(source,'magicAttackElementDamage',attackEle,includeEquipment):collectKeyed(source,'physicalAttackElementDamage',attackEle,includeEquipment)),
      classType:collectKeyed(source,'classDamage',c,includeEquipment)+collectKeyed(source,classGroup,c,includeEquipment)+collectScalar(source,c==='Boss'?'bossDamageRate':'nonBossDamageRate',[],includeEquipment),
      // Active/passive global type rates are already applied by RARenewalDamagePipeline. Equipment/card type rates are centralized here.
      all:scalarRate(source,'damageRate',['allDamageRate'])+scalarRate(source,typeRateKey)+(includeEquipment?equipmentSources(source).reduce((n,item)=>n+scalarRate(item,'damageRate',['allDamageRate'])+scalarRate(item,typeRateKey),0):0)
    };
  }
  function collectDefenseBonuses(target,attackerProfile,damageType='physical'){
    const r=attackerProfile.race,s=attackerProfile.size,e=attackerProfile.element,c=attackerProfile.classType;
    const attackerArmorElement=normalizeElement(attackerProfile.armorElement||attackerProfile.sourceElement||'Neutral');
    const type=String(damageType||'physical').toLowerCase();
    const magic=type==='magic';
    const typeReduction=magic
      ?collectScalar(target,'magicDamageReductionRate',['magicDefRate'])
      :type==='misc'
        ?collectScalar(target,'miscDamageReductionRate',['miscDefRate'])
        :collectScalar(target,'physicalDamageReductionRate',['weaponDamageReductionRate','physicalDefRate']);
    const raceTypeGroup=magic?'magicRaceResist':'physicalRaceResist';
    const sizeTypeGroup=magic?'magicSizeResist':'physicalSizeResist';
    const classTypeGroup=magic?'magicClassResist':'physicalClassResist';
    const enemyElementGroup=magic?'magicEnemyElementResist':'physicalEnemyElementResist';
    return {
      race:collectKeyed(target,'raceResist',r)+collectKeyed(target,raceTypeGroup,r),
      size:collectKeyed(target,'sizeResist',s)+collectKeyed(target,sizeTypeGroup,s),
      element:collectKeyed(target,'elementResist',e),
      attackerElement:collectKeyed(target,enemyElementGroup,attackerArmorElement),
      classType:collectKeyed(target,'classResist',c)+collectKeyed(target,classTypeGroup,c)+collectScalar(target,c==='Boss'?'bossDamageReduction':'nonBossDamageReduction'),
      type:typeReduction,
      all:collectScalar(target,'damageReductionRate',['allDamageReduction'])
    };
  }
  function resolveCrate(source){if(source===window.player){const d=window.RO_WEB_COMBAT_EVAL_CONTEXT?.derivedStats||(typeof window.calculateDerivedPlayerStats==='function'?(window.calculateDerivedPlayerStats()||{}):{});return Math.max(0,Number(d.crate||0));}return Math.max(0,Number(source?.crate||0)+scalarRate(source,'crateFlat',['criticalFinalRate']));}
  function resolveCriticalDefenseRate(target){return cap(collectScalar(target,'criticalDefenseRate',['critDefRate','criticalDamageReductionRate']),0,100);}

  function applyDamage(raw,context={}){
    const target=context.target||{},source=context.source||window.player,type=String(context.damageType||'physical').toLowerCase();
    const attackElement=getAttackElement(context.element||context.attackElement),targetProfile=getTargetProfile(target);
    const sourceProfile={race:normalizeRace(context.sourceRace||source?.race||(source===window.player?'Player':'Formless')),size:normalizeSize(context.sourceSize||source?.size||'Medium'),element:attackElement,armorElement:getTargetProfile(source).element,classType:isBossUnit(source)?'Boss':'NonBoss'};
    let damage=Math.max(0,Number(raw)||0);const trace={raw:damage,type,attackElement,target:targetProfile};
    if(context.damageImmunity===true)return 0;
    if(damage>0&&isInfiniteDefenseTarget(target,{...context,damageType:type})){
      damage=normalizeIncomingDamage(target,damage,{...context,damageType:type});
      trace.infiniteDefense=true;trace.final=damage;window.lastCombatFormulaTrace=trace;return damage;
    }
    if(context.applyWeaponSize!==false&&type==='physical'){const rate=getWeaponSizeMultiplier(context.weaponType,targetProfile.size);damage=Math.floor(damage*rate/100);trace.weaponSize=rate;}
    if(context.applyElement!==false){const elem=getElementMultiplier(attackElement,targetProfile.element,targetProfile.elementLevel);damage=Math.floor(damage*elem/100);trace.element=elem;}else trace.element='ignored';
    const includeEquipment=context.applyEquipmentModifiers!==false;const atk=collectAttackBonuses(targetProfile,source,type,includeEquipment,attackElement);
    // Renewal card-fix stages are consecutive and round down after each category.
    if(type==='magic'){
      damage=percentStage(damage,atk.size);damage=percentStage(damage,atk.element);damage=percentStage(damage,atk.attackElement);
      if(context.applyRaceModifier!==false)damage=percentStage(damage,atk.race);
    }else{
      if(context.applyRaceModifier!==false)damage=percentStage(damage,atk.race);
      damage=percentStage(damage,atk.element);damage=percentStage(damage,atk.attackElement);damage=percentStage(damage,atk.size);
    }
    damage=percentStage(damage,atk.classType);damage=percentStage(damage,atk.all);
    const rangeKey=context.attackRangeType==='long'?'long':'short';
    damage=percentStage(damage,scalarRate(source,rangeKey==='long'?'longDamageRate':'shortDamageRate')+(includeEquipment?equipmentSources(source).reduce((n,item)=>n+scalarRate(item,rangeKey==='long'?'longDamageRate':'shortDamageRate'),0):0));
    if(context.applyDefense!==false){
      if(!window.DefenseResolver) throw new Error('[Renewal Formula] DefenseResolver 尚未載入；禁止略過 Renewal 防禦公式。');
      const defenseContext={...context,source};
      if(type==='magic')damage=window.DefenseResolver.magic(damage,target,defenseContext);
      else if(type==='physical')damage=window.DefenseResolver.physical(damage,target,defenseContext);
      trace.defenseApplied=true;
    }
    // Target race/size/element/class/range reductions occur before the final critical stage in Renewal.
    const def=collectDefenseBonuses(target,sourceProfile,type);
    damage=percentStage(damage,-collectScalar(target,rangeKey==='long'?'longDamageReduction':'shortDamageReduction'));
    damage=percentStage(damage,-def.race);damage=percentStage(damage,-def.size);damage=percentStage(damage,-def.element);damage=percentStage(damage,-def.attackerElement);damage=percentStage(damage,-def.classType);damage=percentStage(damage,-def.type);damage=percentStage(damage,-def.all);
    // Renewal: C.RATE final critical multiplier after RES/DEF, property and target card reductions; bCritDefRate follows it.
    if(context.critical===true&&type==='physical'){
      const crate=Math.max(0,Math.floor(resolveCrate(source)));const critMultiplier=(140+crate)/100;damage=Math.floor(damage*(140+crate)/100);
      const critDef=resolveCriticalDefenseRate(target);damage=percentStage(damage,-critDef);
      trace.critical={crate,multiplier:critMultiplier,targetReductionRate:critDef};
    }
    const flatRaceReduction=collectKeyed(target,'raceFlatReduction',sourceProfile.race);damage=Math.max(0,damage-flatRaceReduction);
    if(context.minimumDamage!==undefined&&damage>0)damage=Math.max(Number(context.minimumDamage)||0,damage);
    trace.attackBonuses=atk;trace.defenseBonuses=def;trace.flatRaceReduction=flatRaceReduction;trace.final=Math.max(0,damage);window.lastCombatFormulaTrace=trace;return Math.max(0,damage);
  }
  async function load(){try{tables=typeof window.loadJson==='function'?await window.loadJson('./data/combat_runtime/renewal_combat_tables.json',FALLBACK):FALLBACK;}catch(err){console.warn('[CombatFormulaRuntime] table fallback',err);tables=FALLBACK;}window.ROCombatFormulaTables=tables;return tables;}
  window.CombatFormulaRuntime={load,applyDamage,getElementMultiplier,getWeaponSizeMultiplier,getTargetProfile,normalizeElement,normalizeRace,normalizeSize,collectScalarBonus:collectScalar,collectKeyedBonus:collectKeyed,equipmentModifierSources:equipmentSources,isBossUnit,resolveCrate,resolveCriticalDefenseRate,hasMonsterMode,isInfiniteDefenseTarget,normalizeIncomingDamage};
  window.applyROCombatDamageModifiers=applyDamage;
})();
