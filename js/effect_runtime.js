//=======================================
// RO_WEB EffectRuntime v0.9.82FZ
// Unified equipment/card/combo effect source and coverage registry.
// New item/card scripts are evaluated by CardRuntime and automatically flow
// through the same status, combat, timing, recovery and event-hook consumers.
//=======================================
(function () {
  "use strict";

  const number = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  function wrappers(source) {
    return source ? [
      source, source.effects, source.bonuses, source.statusModifiers,
      source.runtimeStatusModifiers, source.combatModifiers,
      source.runtimeCombatModifiers, source.timingModifiers,
      source.runtimeTimingModifiers
    ].filter(value => value && typeof value === "object" && !Array.isArray(value)) : [];
  }

  function baseEquipmentSources(unit = window.player) {
    if (unit !== window.player || !unit?.equipment || typeof window.getItemData !== "function") return [];
    const result = [];
    const mainId = unit.equipment.weapon;
    const main = mainId ? window.getItemData(mainId) : null;
    for (const [slot, itemId] of Object.entries(unit.equipment)) {
      if (!itemId) continue;
      if ((slot === "shield" || slot === "leftWeapon") && String(itemId) === String(mainId) && main &&
          (main.twoHanded || Number(main.hands || main.weaponHands) === 2)) continue;
      const item = window.getItemData(itemId);
      if (item) result.push(window.RefineRuntime?.decorateStatusSource ? window.RefineRuntime.decorateStatusSource(slot, item) : item);
    }
    return result;
  }

  function getSources(unit = window.player, options = {}) {
    const rows = options.includeBaseItems === false ? [] : baseEquipmentSources(unit);
    if (unit === window.player && options.includeScripts !== false && window.CardRuntime?.getSources) {
      rows.push(...window.CardRuntime.getSources());
    }
    return rows;
  }

  function scalarFrom(source, key, aliases = []) {
    let total = 0;
    for (const wrapper of wrappers(source)) {
      for (const name of [key, ...aliases]) {
        const value = wrapper[name];
        if (Number.isFinite(Number(value))) total += Number(value);
        else if (value && typeof value === "object" && !Array.isArray(value)) {
          const nested = value.current ?? value.all ?? value.All ?? value.ALL;
          if (Number.isFinite(Number(nested))) total += Number(nested);
        }
      }
    }
    return total;
  }

  function keyedFrom(source, group, key) {
    let total = 0;
    const normalized = String(key ?? "All");
    const lower = normalized.toLowerCase();
    for (const wrapper of wrappers(source)) {
      const map = wrapper[group];
      if (!map || typeof map !== "object" || Array.isArray(map)) continue;
      total += number(map[normalized] ?? map[lower] ?? map.All ?? map.all ?? map.ALL);
    }
    return total;
  }

  function collectScalar(key, aliases = [], unit = window.player, options = {}) {
    let total = scalarFrom(unit, key, aliases);
    for (const source of getSources(unit, options)) total += scalarFrom(source, key, aliases);
    if (options.includePassive !== false && unit === window.player) {
      const passive = window.RO_WEB_COMBAT_EVAL_CONTEXT?.passiveCombatModifierTotals ||
        (typeof window.getPassiveCombatModifierTotals === "function" ? window.getPassiveCombatModifierTotals() : {});
      total += scalarFrom(passive, key, aliases);
    }
    if (options.includeActive !== false && unit === window.player) {
      const active = window.RO_WEB_COMBAT_EVAL_CONTEXT?.activeBuffTotals ||
        (typeof window.getActiveBuffBonusTotals === "function" ? window.getActiveBuffBonusTotals() : {});
      total += scalarFrom(active, key, aliases);
    }
    return total;
  }

  function collectKeyed(group, key, unit = window.player, options = {}) {
    let total = keyedFrom(unit, group, key);
    for (const source of getSources(unit, options)) total += keyedFrom(source, group, key);
    if (options.includePassive !== false && unit === window.player) {
      const passive = window.RO_WEB_COMBAT_EVAL_CONTEXT?.passiveCombatModifierTotals ||
        (typeof window.getPassiveCombatModifierTotals === "function" ? window.getPassiveCombatModifierTotals() : {});
      total += keyedFrom(passive, group, key);
    }
    if (options.includeActive !== false && unit === window.player) {
      const active = window.RO_WEB_COMBAT_EVAL_CONTEXT?.activeBuffTotals ||
        (typeof window.getActiveBuffBonusTotals === "function" ? window.getActiveBuffBonusTotals() : {});
      total += keyedFrom(active, group, key);
    }
    return total;
  }

  function mergedScriptSource() {
    return window.CardRuntime?.getMergedSource?.() || {};
  }

  function hasFlag(key, unit = window.player) {
    return collectScalar(key, [], unit) > 0;
  }

  function skillKeys(skill) {
    return [...new Set([
      String(skill?.officialId ?? skill?.id ?? skill ?? ""),
      String(skill?.key || ""), String(skill?.skillKey || ""),
      String(skill?.aegisName || skill?.AegisName || "")
    ].filter(Boolean))];
  }

  function getSkillKeyed(group, skill, unit = window.player) {
    return skillKeys(skill).reduce((sum, key) => sum + collectKeyed(group, key, unit), collectKeyed(group, "All", unit));
  }

  // Every canonical key currently emitted by the 910 cards, 141 equipment
  // scripts and 784 combos must have a named consumer. Release audit fails if
  // a future script emits a key absent from this registry.
  const COVERAGE = Object.freeze({
    // Character/derived status calculation.
    allStatsFlat:"status", strFlat:"status", agiFlat:"status", vitFlat:"status", intFlat:"status", dexFlat:"status", lukFlat:"status",
    powFlat:"status", staFlat:"status", wisFlat:"status", splFlat:"status", conFlat:"status", crtFlat:"status",
    atkFlat:"status", atkRate:"status", matkFlat:"status", matkRate:"status", defFlat:"status", defRate:"status", mdefFlat:"status", mdefRate:"status",
    hitFlat:"status", fleeFlat:"status", criFlat:"status", criRate:"status", perfectDodgeFlat:"status", aspdFlat:"status", aspdRate:"status",
    maxHpFlat:"status", maxHpRate:"status", maxSpFlat:"status", maxSpRate:"status", resFlat:"status", mresFlat:"status", pAtk:"status", sMatk:"status", crateFlat:"status", moveSpeedRate:"status",
    hpRecoveryRate:"natural_recovery", spRecoveryRate:"natural_recovery", noHpRegen:"natural_recovery", noSpRegen:"natural_recovery",
    armorElement:"combat_profile", weaponElement:"combat_profile",

    // Outgoing/incoming damage and hit/critical/defense formula.
    weaponAtkRate:"combat", physicalRaceDamage:"combat", physicalRace2Damage:"combat", magicRaceDamage:"combat",
    physicalElementDamage:"combat", magicElementDamage:"combat", magicAttackElementDamage:"combat", sizeDamage:"combat", magicSizeDamage:"combat",
    physicalClassDamage:"combat", magicClassDamage:"combat", raceResist:"combat", elementResist:"combat", sizeResist:"combat",
    physicalSizeResist:"combat", magicSizeResist:"combat", classResist:"combat", enemyArmorElementResist:"combat",
    longDamageRate:"combat", shortDamageRate:"combat", longDamageReduction:"combat", shortDamageReduction:"combat",
    critAtkRate:"combat", criticalChanceByRace:"critical", longRangeCriticalChanceFlat:"critical", perfectHitRate:"hit",
    ignoreDefByRace:"defense", ignoreDefByClass:"defense", ignoreMdefByRace:"defense", ignoreMdefByClass:"defense", ignoreMresByRace:"defense",
    ignoreWeaponSizePenalty:"weapon_size", weaponTypeDamageRate:"weapon_type", defRatioAttackClass:"defense_ratio",
    monsterDamageRate:"monster_specific", monsterDamageReductionRate:"monster_specific", magicImmune:"magic_immunity",
    incomingDamageMaxHpCapRate:"incoming_cap", magicReflectRate:"reflection", shortPhysicalReflectRate:"reflection", reflectDamageReductionRate:"reflection",
    skillDamageRate:"skill_damage", skillDamageReductionRate:"skill_damage", skillKnockbackBonus:"skill_movement",

    // Skill timing, costs and grants.
    grantedSkills:"skill_grant", variableCastReductionRate:"skill_timing", fixedCastReductionRate:"skill_timing",
    fixedCastReductionMs:"skill_timing", afterCastDelayReductionRate:"skill_timing", skillCooldownReductionMs:"skill_timing",
    skillFixedCastReductionMs:"skill_timing", skillFixedCastReductionRate:"skill_timing", skillVariableCastReductionMs:"skill_timing",
    skillSpCostFlat:"skill_cost", skillSpCostRate:"skill_cost", spCostRate:"skill_cost",
    noCastCancel:"cast_policy", noGemstone:"resource_exemption", noMadoFuel:"resource_exemption",

    // Healing/recovery/item use.
    healPowerRate:"healing", healingReceivedRate:"healing", itemHpRecoveryRate:"item_recovery", itemSpRecoveryRate:"item_recovery",
    itemHpHealRate:"item_recovery", itemSpHealRate:"item_recovery", itemGroupHealRate:"item_recovery", periodicHpRegen:"periodic", periodicSpRegen:"periodic",
    percentHpRegen:"periodic", periodicHpLoss:"periodic", periodicSpLoss:"periodic",

    // Attack/hit/skill/kill event hooks.
    autoBonuses:"attack_hook", autoSpellProcs:"attack_hook", hpDrainProcs:"attack_hook", spDrainProcs:"attack_hook",
    statusOnAttack:"status_hook", statusOnAttackRules:"status_hook", statusOnSelfAttack:"status_hook", statusWhenHit:"status_hook", statusWhenHitRules:"status_hook", skillStatusOnHit:"status_hook",
    statusResist:"status_resistance", breakArmorRate:"break_hook", breakWeaponRate:"break_hook", comaRaceRate:"coma_hook", comaClassRate:"coma_hook",
    classChangeRate:"class_change", splashRange:"splash", spVanishOnHit:"attack_hook", spOnAttackFlat:"attack_hook",
    killHpFlat:"kill_hook", killSpFlat:"kill_hook", magicKillHpFlat:"kill_hook", spGainRace:"kill_hook", zenyOnKillProcs:"kill_hook",
    expRaceRate:"reward", extraDrops:"reward", restartFullRecover:"death_recovery",
    instantHealHp:"immediate_effect", instantHealSp:"immediate_effect", statusStarts:"immediate_effect",
    transforms:"visual_transform", scriptMessages:"ui_feedback", visualEffects:"visual_feedback",

    // Equipment/visual/movement policies.
    unbreakableWeapon:"equipment_break_policy", unbreakableArmor:"equipment_break_policy", unbreakableShield:"equipment_break_policy",
    noKnockback:"movement", noWalkDelay:"movement", intravision:"visibility"
  });

  function applyIncomingDamageCap(damage, target = window.player, options = {}) {
    let value=Math.max(0,number(damage));
    if(options.fixedDamage===true||value<=0)return {damage:value,capped:false,rate:0,cap:value};
    const rate=Math.max(0,collectScalar("incomingDamageMaxHpCapRate",[],target,{includePassive:false,includeActive:false}));
    if(rate<=0)return {damage:value,capped:false,rate:0,cap:value};
    const maxHp=Math.max(1,number(target?.maxHp??target?.hpMax,1)),cap=Math.max(1,Math.floor(maxHp*rate/100));
    return {damage:Math.min(value,cap),capped:value>cap,rate,cap};
  }

  function applyReflectionReduction(damage, target = window.player) {
    const rate=Math.max(0,Math.min(100,collectScalar("reflectDamageReductionRate",[],target,{includePassive:false,includeActive:false})));
    return {damage:Math.max(0,Math.floor(number(damage)*(100-rate)/100)),rate};
  }

  function getSkillKnockbackBonus(skill, unit = window.player) { return getSkillKeyed("skillKnockbackBonus",skill,unit); }
  function blocksEquipmentBreak(kind, unit = window.player) {
    const key={weapon:"unbreakableWeapon",armor:"unbreakableArmor",shield:"unbreakableShield"}[String(kind||"").toLowerCase()];
    return key ? hasFlag(key,unit) : false;
  }

  function auditCanonicalSource(source) {
    const ignored = new Set(["id", "name", "sourceId", "sourceType", "runtimeError", "rawBonuses"]);
    const emitted = Object.keys(source || {}).filter(key => !ignored.has(key));
    const missing = emitted.filter(key => !COVERAGE[key]);
    const rawBonuses=Object.keys(source?.rawBonuses||{});
    return { emitted, missing, rawBonuses, covered: emitted.length - missing.length, ok:missing.length===0&&rawBonuses.length===0&&!source?.runtimeError };
  }
  function auditSources(sources=[]) {
    const emitted=new Set(),missing=new Set(),rawBonuses=new Set(),runtimeErrors=[];
    for(const source of sources||[]){
      const row=auditCanonicalSource(source);row.emitted.forEach(key=>emitted.add(key));row.missing.forEach(key=>missing.add(key));row.rawBonuses.forEach(key=>rawBonuses.add(key));
      if(source?.runtimeError)runtimeErrors.push({sourceType:source.sourceType,sourceId:source.sourceId,name:source.name,error:source.runtimeError});
    }
    return {ok:missing.size===0&&rawBonuses.size===0&&runtimeErrors.length===0,emitted:[...emitted].sort(),missing:[...missing].sort(),rawBonuses:[...rawBonuses].sort(),runtimeErrors};
  }

  window.EffectRuntime = {
    version:"0.9.82GG",
    wrappers,
    getBaseEquipmentSources:baseEquipmentSources,
    getSources,
    getMergedScriptSource:mergedScriptSource,
    scalarFrom,
    keyedFrom,
    collectScalar,
    collectKeyed,
    hasFlag,
    getSkillKeyed,
    getSkillKnockbackBonus,
    applyIncomingDamageCap,
    applyReflectionReduction,
    blocksEquipmentBreak,
    getCoverageManifest:() => COVERAGE,
    auditCanonicalSource,
    auditSources
  };
})();
