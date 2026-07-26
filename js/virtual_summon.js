//=======================================
// 輕量協助型虛擬召喚物核心
// - 無 PNG / 動畫 JSON / 地圖座標
// - 無 HP / SP / EXP / 被攻擊判定
// - 只協助攻擊玩家目前目標
//=======================================
let virtualSummonData = null;
let virtualSummonLastAttackAt = 0;
let virtualSummonUiTimer = null;
let virtualSummonUiSignature = "";
const independentSummonLastActionAt = Object.create(null);

async function loadVirtualSummonData() {
  virtualSummonData = await loadJson("./data/combat_runtime/virtual_summons.json", null);
  if (!virtualSummonData?.summons) {
    console.warn("虛擬召喚物資料載入失敗，協助攻擊功能停用。");
    virtualSummonData = null;
    return false;
  }
  startVirtualSummonUiRefresh();
  updateVirtualSummonUI();
  return true;
}

function getVirtualSummonSettings() {
  if (!player) return { assistEnabled: true };
  player.virtualSummonSettings = player.virtualSummonSettings || { assistEnabled: true };
  if (typeof player.virtualSummonSettings.assistEnabled !== "boolean") player.virtualSummonSettings.assistEnabled = true;
  return player.virtualSummonSettings;
}

function isVirtualSummonBuff(buff) {
  const effects = buff?.effects || {};
  return !!(effects.virtualSummonType || effects.virtualSummonSupportFamily || effects.summonedHighElementalType || effects.summonedElementalType);
}

function clearActiveVirtualSummonBuffs() {
  if (!player?.activeBuffs) return 0;
  let removed = 0;
  Object.keys(player.activeBuffs).forEach(key => {
    if (!isVirtualSummonBuff(player.activeBuffs[key])) return;
    delete player.activeBuffs[key];
    removed += 1;
  });
  return removed;
}

function clearVirtualSummonSupportBuffs(family = "") {
  if (!player?.activeBuffs) return 0;
  let removed = 0;
  Object.keys(player.activeBuffs).forEach(key => {
    const supportFamily = String(player.activeBuffs[key]?.effects?.virtualSummonSupportFamily || "");
    if (!supportFamily || (family && supportFamily !== String(family))) return;
    delete player.activeBuffs[key];
    removed += 1;
  });
  return removed;
}

function getActiveVirtualSummon() {
  if (!player || !virtualSummonData?.summons) return null;
  if (typeof normalizeActiveBuffs === "function") normalizeActiveBuffs();
  const entries = Object.entries(player.activeBuffs || {});
  const selected = entries.find(([, buff]) => buff?.effects?.virtualSummonType)
    || entries.find(([, buff]) => buff?.effects?.summonedHighElementalType)
    || entries.find(([, buff]) => buff?.effects?.summonedElementalType);
  if (!selected) return null;
  const [buffId, buff] = selected;
  const effects = buff?.effects || {};
  const configured = !!effects.virtualSummonType;
  const high = !!effects.summonedHighElementalType;
  const type = String(configured ? effects.virtualSummonType : (high ? effects.summonedHighElementalType : effects.summonedElementalType) || "");
  const definition = virtualSummonData.summons[type];
  if (!definition) return null;
  const level = configured
    ? Math.max(1, Number(effects.virtualSummonLevel || buff?.level || 1))
    : (high ? 3 : Math.max(1, Math.min(3, Number(effects.summonedElementalGrade || buff?.level || 1))));
  return { buffId, buff, configured, high, type, grade: level, level, family: definition.family || (configured ? effects.virtualSummonFamily : "elemental"), definition };
}

function getVirtualSummonAttackIntervalMs(summon) {
  if (!summon) return 4000;
  const list = summon.definition?.attackIntervalMsByGrade;
  if (Array.isArray(list)) return Math.max(500, Number(list[summon.grade - 1] ?? list[list.length - 1] ?? 4000));
  return Math.max(500, Number(summon.definition?.attackIntervalMs || 4000));
}

function getVirtualSummonActionSkill() {
  const id = Number(virtualSummonData?.actionSkillId || 2461);
  return typeof getSkillDataById === "function" ? getSkillDataById(id, true) : skillsData?.skillIndex?.[String(id)] || null;
}

function formatVirtualSummonRemainingTime(expiresAt) {
  const seconds = Math.max(0, Math.ceil((Number(expiresAt || 0) - Date.now()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function getVirtualSummonLevelValue(value, level, fallback = 0) {
  if (typeof getLevelValue === "function") return getLevelValue(value, level, fallback);
  if (Array.isArray(value)) return value[Math.max(0, Math.min(value.length - 1, Number(level || 1) - 1))] ?? fallback;
  return value === undefined || value === null ? fallback : value;
}


function getSummonDamageMasteryRate() {
  const level = Math.max(0, Number(typeof getSkillLevel === "function" ? getSkillLevel(232) : 0));
  return Math.min(10, level * 2);
}

function applySummonDamageMastery(damage) {
  const base = Math.max(0, Math.floor(Number(damage || 0)));
  const rate = getSummonDamageMasteryRate();
  return rate > 0 ? Math.max(0, Math.floor(base * (100 + rate) / 100)) : base;
}

function getActiveIndependentSummons() {
  if (!player?.activeBuffs || !virtualSummonData?.independentSummons) return [];
  return Object.entries(player.activeBuffs).map(([buffId, buff]) => {
    const effects = buff?.effects || {};
    const type = String(effects.independentSummonType || "");
    const definition = virtualSummonData.independentSummons[type];
    if (!type || !definition) return null;
    return {
      buffId, buff, type, definition,
      level: Math.max(1, Number(effects.independentSummonLevel || buff?.level || 1)),
      slot: String(effects.independentSummonSlot || type)
    };
  }).filter(Boolean);
}

function getIndependentSummonElement(definition) {
  if (definition?.elementSource === "weapon" && window.RARenewalDamagePipeline?.resolveAttackElement) {
    return window.RARenewalDamagePipeline.resolveAttackElement({ elementSource:"weapon" });
  }
  return definition?.element || "Neutral";
}

function resolveIndependentSummonDamage(summon, target) {
  if (!summon || !target || !window.RARenewalDamagePipeline?.finalModifiers) return null;
  const def = summon.definition || {};
  const element = getIndependentSummonElement(def);
  const damageType = String(def.damageType || "physical").toLowerCase();
  let raw = 0;
  if (Array.isArray(def.fixedDamageByLevel)) {
    raw = Math.max(1, Number(getVirtualSummonLevelValue(def.fixedDamageByLevel, summon.level, 1)));
  } else {
    const derived = typeof calculateDerivedPlayerStats === "function" ? calculateDerivedPlayerStats() : {};
    const casterAtk = Math.max(1, Number(derived?.atk ?? player?.atk ?? 1));
    const ratio = Math.max(1, Number(getVirtualSummonLevelValue(def.attackRatioByLevel, summon.level, def.attackRatio || 100)));
    raw = Math.max(1, Math.floor(casterAtk * ratio / 100));
  }
  const damage = window.RARenewalDamagePipeline.finalModifiers(raw, target, {
    damageType, element,
    attackRangeType:def.attackRangeType || "long",
    applyWeaponSize:false,
    applyDefense:def.ignoreDefense !== true,
    ignoreDefense:def.ignoreDefense === true,
    ignoreMagicDefense:def.ignoreDefense === true
  });
  return { raw, damage:applySummonDamageMastery(damage), element, actionName:def.actionName || "攻擊" };
}

function applyIndependentSummonAttack(summon, target) {
  if (!summon || !target || Number(target.currentHp || 0) <= 0) return { attacked:false, defeated:false };
  const radius = Math.max(0, Number(summon.definition?.radius || 0));
  const targetProfile = radius > 0 ? { targeting:{ origin:"target", shape:"circle", radius, forcePrimaryTarget:true } } : {};
  const targets = typeof resolveRuntimeSkillTargets === "function" ? resolveRuntimeSkillTargets(targetProfile, target, summon.level) : [target];
  let totalDamage = 0, hitTargets = 0;
  for (const victim of targets || []) {
    if (!victim || Number(victim.currentHp || 0) <= 0) continue;
    const result = resolveIndependentSummonDamage(summon, victim);
    if (!result) continue;
    const dealt = Math.max(0, Math.floor(Number(result.damage || 0)));
    victim.currentHp = Math.max(0, Number(victim.currentHp || 0) - dealt);
    totalDamage += dealt; hitTargets += 1;
    if (victim === currentMonster) {
      if (typeof playMonsterHitAnimation === "function") playMonsterHitAnimation(victim);
      if (typeof showDamageNumber === "function") showDamageNumber(dealt, { source:"summon" });
    }
  }
  if (!hitTargets) return { attacked:false, defeated:false };
  const targetName = String(target?.name || "目標");
  const areaNote = hitTargets > 1 ? `及周圍 ${hitTargets - 1} 個目標` : "";
  if (typeof addBattleLog === "function") addBattleLog(`${summon.definition.displayName}：使用 ${summon.definition.actionName || "攻擊"}，對 ${targetName}${areaNote}造成 ${totalDamage} 點傷害。`, "summon-damage");
  if (typeof updateMonsterUI === "function") updateMonsterUI();
  return { attacked:true, defeated:Number(target.currentHp || 0) <= 0, totalDamage, hitTargets, summonName:summon.definition.displayName, actionName:summon.definition.actionName || "攻擊" };
}

function runIndependentSummonTick(target = currentMonster, options = {}) {
  const now = Date.now();
  let combined = { attacked:false, defeated:false, totalDamage:0, hitTargets:0 };
  for (const summon of getActiveIndependentSummons()) {
    const detonateAt = Number(summon.buff?.effects?.detonateAt || 0);
    const expiresAt = Number(summon.buff?.expiresAt || 0);
    if (summon.type === "MarineSphere") {
      if (detonateAt <= 0 || now < detonateAt) continue;
      delete player.activeBuffs[summon.buffId];
      delete independentSummonLastActionAt[summon.slot];
      const result = target && Number(target.currentHp || 0) > 0 ? applyIndependentSummonAttack(summon, target) : { attacked:false, defeated:false };
      if (!result.attacked && typeof addBattleLog === "function") addBattleLog(`${summon.definition.displayName}：倒數結束，但目前沒有有效目標，自爆後消失。`, "summon");
      combined = { attacked:combined.attacked || result.attacked, defeated:combined.defeated || result.defeated, totalDamage:combined.totalDamage + Number(result.totalDamage || 0), hitTargets:combined.hitTargets + Number(result.hitTargets || 0) };
      if (typeof saveGame === "function") saveGame();
      if (combined.defeated) break;
      continue;
    }
    if (expiresAt > 0 && now >= expiresAt) {
      delete player.activeBuffs[summon.buffId];
      delete independentSummonLastActionAt[summon.slot];
      if (typeof addBattleLog === "function") addBattleLog(`${summon.definition.displayName}：持續時間結束。`, "summon");
      continue;
    }
    if (!target || Number(target.currentHp || 0) <= 0) continue;
    if (!options.manual && getVirtualSummonSettings().assistEnabled !== true) continue;
    const interval = Math.max(500, Number(summon.definition?.attackIntervalMs || 2000));
    const lastAt = Number(independentSummonLastActionAt[summon.slot] || 0);
    if (!options.manual && now - lastAt < interval) continue;
    const result = applyIndependentSummonAttack(summon, target);
    if (result.attacked) independentSummonLastActionAt[summon.slot] = now;
    combined = { attacked:combined.attacked || result.attacked, defeated:combined.defeated || result.defeated, totalDamage:combined.totalDamage + Number(result.totalDamage || 0), hitTargets:combined.hitTargets + Number(result.hitTargets || 0) };
    if (combined.defeated) break;
  }
  return combined;
}

function castIndependentSummonSkill(skill, requestedLevel = null, options = {}) {
  const check = typeof canCastSkill === "function" ? canCastSkill(skill, requestedLevel, ["independent_summon"], options) : { ok:true, level:Number(requestedLevel || 1), profile:getSkillRuntimeProfile?.(skill) };
  if (!check.ok) return typeof reportPendingRuntime === "function" ? reportPendingRuntime(skill, check.reason) : false;
  const { level, profile } = check;
  const type = String(profile?.summonType || "");
  const definition = virtualSummonData?.independentSummons?.[type];
  if (!type || !definition) {
    if (!options.silent && typeof addBattleLog === "function") addBattleLog(`${skill?.name || "獨立召喚技能"}缺少獨立召喚物資料。`, "summon");
    return false;
  }
  if (!options.skipCost && typeof paySkillCost === "function") paySkillCost(skill, level);
  player.activeBuffs = player.activeBuffs || {};
  const slot = String(profile.independentSlot || type);
  for (const active of getActiveIndependentSummons()) {
    if (active.slot === slot) delete player.activeBuffs[active.buffId];
  }
  const now = Date.now();
  const detonationDelay = Math.max(0, Number(profile.detonationDelayMs ?? definition.detonationDelayMs ?? 0));
  const duration = detonationDelay > 0
    ? detonationDelay + 2500
    : Math.max(1000, Number(getVirtualSummonLevelValue(profile.duration, level, 60000)));
  player.activeBuffs[String(skill.id)] = {
    id:skill.id, name:skill.name, level,
    effects:{ independentSummonType:type, independentSummonFamily:definition.family || "independent", independentSummonLevel:level, independentSummonSlot:slot, detonateAt:detonationDelay > 0 ? now + detonationDelay : 0 },
    startedAt:now, activatedAt:now, expiresAt:now + duration
  };
  independentSummonLastActionAt[slot] = 0;
  if (typeof updatePlayerUI === "function") updatePlayerUI();
  if (typeof saveGame === "function") saveGame();
  updateVirtualSummonUI();
  if (!options.silent && typeof addBattleLog === "function") {
    const note = detonationDelay > 0 ? `將於 ${Math.floor(detonationDelay / 1000)} 秒後自爆` : "將獨立協助攻擊目前目標";
    addBattleLog(`施放 ${skill.name} Lv${level}；${definition.displayName}${note}，不占主要召喚夥伴欄位。`, "summon");
  }
  return true;
}

function resolveConfiguredVirtualSummonDamage(summon, target) {
  if (!summon?.configured || !target || !window.RARenewalDamagePipeline?.finalModifiers) return null;
  const def = summon.definition || {};
  const derived = typeof calculateDerivedPlayerStats === "function" ? calculateDerivedPlayerStats() : null;
  const casterStatKey = String(def.casterStat || "atk").toLowerCase();
  const casterStat = Math.max(1, Number(derived?.[casterStatKey] ?? player?.[casterStatKey] ?? derived?.atk ?? player?.atk ?? 1));
  const fallbackMasteryId = String(def.family || "") === "bionic" ? virtualSummonData?.masterySkillId : 0;
  const masterySkillId = Number(def.masterySkillId ?? fallbackMasteryId ?? 0);
  const masteryLevel = Math.max(0, Number(masterySkillId > 0 && typeof getSkillLevel === "function" ? getSkillLevel(masterySkillId) : 0));
  const fixedBase = Number(getVirtualSummonLevelValue(def.baseAttackByLevel, summon.level, 0));
  const atkPerMastery = Math.max(0, Number(def.atkPerMastery || 600));
  const casterStatRate = Math.max(0, Number(def.casterStatRate ?? 200));
  const baseMax = Math.max(1, fixedBase > 0 ? fixedBase : Math.floor(casterStat * casterStatRate / 100) + atkPerMastery * masteryLevel);
  const minRate = Math.max(0, Number(def.atkMinRate ?? 70));
  const atkMin = Math.max(1, Math.floor(baseMax * minRate / 100) + Number(def.atkMinFlat || 0));
  const atkMax = Math.max(atkMin, baseMax + Number(def.atkMaxFlat || 0));
  const rolledAtk = atkMin + Math.floor(Math.random() * (atkMax - atkMin + 1));
  const ratio = Math.max(1, Number(getVirtualSummonLevelValue(def.attackRatioByLevel, summon.level, def.attackRatio || 100)));
  const raw = Math.max(1, Math.floor(rolledAtk * ratio / 100));
  const damageType = String(def.damageType || "physical").toLowerCase();
  const elementCandidates = Array.isArray(def.elementOptions) && def.elementOptions.length ? def.elementOptions : [def.element || "Neutral"];
  let best = null;
  for (const element of elementCandidates) {
    const options = { damageType, element, applyWeaponSize:false, attackRangeType:def.attackRangeType || "long" };
    if (damageType === "magic") options.ignoreMagicDefense = def.ignoreDefense === true;
    else options.ignoreDefense = def.ignoreDefense === true;
    const damage = Math.max(0, window.RARenewalDamagePipeline.finalModifiers(raw, target, options));
    if (!best || damage > best.damage) best = { damage, element };
    if (def.selectBestElement !== true) break;
  }
  const chosenElement = best?.element || def.element || "Neutral";
  const elementLabel = def.elementLabels?.[chosenElement] || def.elementLabel || chosenElement;
  const actionName = elementCandidates.length > 1 ? `${def.actionName || "攻擊"}・${elementLabel}` : (def.actionName || "攻擊");
  return { damage:best?.damage || 0, raw, atkMin, atkMax, rolledAtk, ratio, masteryLevel, chosenElement, actionName };
}

function runConfiguredVirtualSummonSupport(summon) {
  const def = summon?.definition || {};
  const masterySkillId = Number(def.masterySkillId || 0);
  const masteryLevel = Math.max(0, Number(masterySkillId > 0 && typeof getSkillLevel === "function" ? getSkillLevel(masterySkillId) : 0));
  const derived = typeof calculateDerivedPlayerStats === "function" ? calculateDerivedPlayerStats() : null;
  const maxHp = Math.max(1, Number(player?.maxHp ?? derived?.maxHp ?? 1));
  const maxSp = Math.max(0, Number(player?.maxSp ?? derived?.maxSp ?? 0));
  const hpRate = Math.max(0, Number(getVirtualSummonLevelValue(def.healHpRateByLevel, summon.level, def.healHpRate || 0)));
  const spRate = Math.max(0, Number(getVirtualSummonLevelValue(def.healSpRateByLevel, summon.level, def.healSpRate || 0)));
  const hpBefore = Math.max(0, Number(player?.hp || 0));
  const spBefore = Math.max(0, Number(player?.sp || 0));
  const hpHeal = Math.max(0, Math.min(maxHp - hpBefore, Math.floor(maxHp * hpRate / 100)));
  const spHeal = Math.max(0, Math.min(maxSp - spBefore, Math.floor(maxSp * spRate / 100)));
  player.hp = Math.min(maxHp, hpBefore + hpHeal);
  player.sp = Math.min(maxSp, spBefore + spHeal);
  player.activeBuffs = player.activeBuffs || {};
  const supportKey = `virtual_summon_support_${summon.type}`;
  player.activeBuffs[supportKey] = {
    id:supportKey, name:`${def.displayName}支援`, level:summon.level,
    effects:{
      virtualSummonSupportFamily:summon.family || def.family || "generic",
      defFlat:Math.max(0, Number(def.defFlatPerMastery || 0) * masteryLevel),
      mdefFlat:Math.max(0, Number(def.mdefFlatPerMastery || 0) * masteryLevel)
    },
    startedAt:Date.now(), activatedAt:Date.now(), expiresAt:Date.now()+Math.max(1000,Number(def.supportBuffDurationMs||6000))
  };
  if (typeof recalculatePlayerStats === "function") recalculatePlayerStats();
  if (typeof updatePlayerUI === "function") updatePlayerUI();
  if (typeof saveGame === "function") saveGame();
  const actionName = String(def.actionName || "支援");
  if (typeof addBattleLog === "function") addBattleLog(`${def.displayName}：使用 ${actionName}，恢復 HP ${hpHeal}、SP ${spHeal}，並提高 DEF／MDEF。`, "summon");
  return { attacked:true, supported:true, defeated:false, hpHeal, spHeal, summonName:def.displayName, actionName };
}

function runVirtualSummonAssistTick(target = currentMonster, options = {}) {
  const independentResult = runIndependentSummonTick(target, options);
  if (independentResult?.defeated) return independentResult;
  const summon = getActiveVirtualSummon();
  const supportAction = summon?.configured && summon.definition?.supportAction === true;
  if (!summon || (!supportAction && (!target || Number(target.currentHp || 0) <= 0))) return independentResult?.attacked ? independentResult : { attacked: false, defeated: false };
  if (!options.manual && getVirtualSummonSettings().assistEnabled !== true) return { attacked: false, defeated: false };
  const now = Date.now();
  const interval = getVirtualSummonAttackIntervalMs(summon);
  if (!options.manual && now - virtualSummonLastAttackAt < interval) return { attacked: false, defeated: false };
  if (supportAction) {
    const result = runConfiguredVirtualSummonSupport(summon);
    if (result?.attacked) virtualSummonLastAttackAt = now;
    return result || { attacked:false, defeated:false };
  }

  let targetProfile = {};
  let actionName = summon.definition?.actionName || "攻擊";
  let resolver = null;
  let statusApplier = null;
  if (summon.configured) {
    if (Number(summon.definition?.radius || 0) > 0) targetProfile = { targeting:{ origin:"target", shape:"circle", radius:Number(summon.definition.radius), forcePrimaryTarget:true } };
    resolver = victim => resolveConfiguredVirtualSummonDamage(summon, victim);
  } else {
    const actionSkill = getVirtualSummonActionSkill();
    const actionProfile = actionSkill && typeof getSkillRuntimeProfile === "function" ? getSkillRuntimeProfile(actionSkill) : null;
    const spec = actionProfile && typeof getElementalActionRuntimeSpec === "function" ? getElementalActionRuntimeSpec(actionProfile) : null;
    if (!spec) return { attacked:false, defeated:false };
    actionName = String(spec.actionName || actionSkill?.name || "攻擊");
    if (Number(spec.radius || 0) > 0) targetProfile = { targeting:{ origin:"target", shape:"circle", radius:Number(spec.radius), forcePrimaryTarget:true } };
    resolver = victim => {
      const damage = typeof resolveElementalActionRuntimeDamage === "function" ? resolveElementalActionRuntimeDamage(spec, victim) : null;
      return damage === null || damage === undefined ? null : { damage };
    };
    statusApplier = victim => typeof applyElementalActionRuntimeStatus === "function" && applyElementalActionRuntimeStatus(victim, spec);
  }

  const targets = typeof resolveRuntimeSkillTargets === "function" ? resolveRuntimeSkillTargets(targetProfile, target, 1) : [target];
  let totalDamage = 0, hitTargets = 0;
  for (const victim of targets || []) {
    if (!victim || Number(victim.currentHp || 0) <= 0) continue;
    const result = resolver?.(victim);
    if (!result || result.damage === null || result.damage === undefined) continue;
    if (result.actionName) actionName = String(result.actionName);
    const finalDamage = applySummonDamageMastery(result.damage);
    victim.currentHp = Math.max(0, Number(victim.currentHp || 0) - finalDamage);
    totalDamage += finalDamage; hitTargets += 1;
    statusApplier?.(victim);
    if (victim === currentMonster) {
      if (typeof playMonsterHitAnimation === "function") playMonsterHitAnimation(victim);
      if (typeof showDamageNumber === "function") showDamageNumber(finalDamage, { source:"summon" });
    }
  }
  if (!hitTargets) return { attacked:false, defeated:false };
  virtualSummonLastAttackAt = now;
  const summonName = summon.definition.displayName;
  const targetName = String(target?.name || "目標");
  if (typeof addBattleLog === "function") {
    const areaNote = hitTargets > 1 ? `及周圍 ${hitTargets - 1} 個目標` : "";
    addBattleLog(`${summonName}：使用 ${actionName}，對 ${targetName}${areaNote}造成 ${totalDamage} 點傷害。`, "summon-damage");
  }
  if (typeof updateMonsterUI === "function") updateMonsterUI();
  return { attacked:true, defeated:Number(target.currentHp || 0) <= 0, totalDamage:totalDamage + Number(independentResult?.totalDamage || 0), hitTargets:hitTargets + Number(independentResult?.hitTargets || 0), summonName, actionName };
}

function castVirtualSummonSkill(skill, requestedLevel = null, options = {}) {
  const check = typeof canCastSkill === "function" ? canCastSkill(skill, requestedLevel, ["virtual_summon"], options) : { ok:true, level:Number(requestedLevel || 1), profile:getSkillRuntimeProfile?.(skill) };
  if (!check.ok) return typeof reportPendingRuntime === "function" ? reportPendingRuntime(skill, check.reason) : false;
  const { level, profile } = check;
  const type = String(profile?.summonType || "");
  const definition = virtualSummonData?.summons?.[type];
  if (!type || !definition) {
    if (!options.silent && typeof addBattleLog === "function") addBattleLog(`${skill?.name || "召喚技能"}缺少召喚物資料。`);
    return false;
  }
  if (!options.skipCost && typeof paySkillCost === "function") paySkillCost(skill, level);
  player.activeBuffs = player.activeBuffs || {};
  clearActiveVirtualSummonBuffs();
  const duration = Math.max(1000, Number(getVirtualSummonLevelValue(profile.duration, level, 60000)));
  player.activeBuffs[String(skill.id)] = {
    id:skill.id, name:skill.name, level,
    effects:{ virtualSummonType:type, virtualSummonFamily:profile.summonFamily || definition.family || "generic", virtualSummonLevel:level },
    exclusiveBuffGroup:profile.exclusiveBuffGroup || "virtual_summon_partner",
    startedAt:Date.now(), activatedAt:Date.now(), expiresAt:Date.now()+duration
  };
  if (typeof grantRuntimeApFromProfile === "function") grantRuntimeApFromProfile(skill, level, profile, options);
  virtualSummonLastAttackAt = 0;
  if (typeof recalculatePlayerStats === "function") recalculatePlayerStats();
  if (typeof updatePlayerUI === "function") updatePlayerUI();
  if (typeof saveGame === "function") saveGame();
  notifyVirtualSummonStateChanged();
  if (!options.silent && typeof addBattleLog === "function") {
    const roleText = definition.supportAction === true ? "將定期支援玩家" : "將協助攻擊目前目標";
    addBattleLog(`施放 ${skill.name} Lv${level}；${definition.displayName}${roleText}。`, "summon");
  }
  return true;
}


function castVirtualSummonDismissSkill(skill, requestedLevel = null, options = {}) {
  const check = typeof canCastSkill === "function" ? canCastSkill(skill, requestedLevel, ["virtual_summon_dismiss"], options) : { ok:true, level:Number(requestedLevel || 1), profile:getSkillRuntimeProfile?.(skill) };
  if (!check.ok) return typeof reportPendingRuntime === "function" ? reportPendingRuntime(skill, check.reason) : false;
  const { level, profile } = check;
  const summon = getActiveVirtualSummon();
  const requiredFamily = String(profile?.summonFamily || "");
  if (!summon || (requiredFamily && String(summon.family || "") !== requiredFamily)) {
    if (!options.silent && typeof addBattleLog === "function") addBattleLog(`${skill?.name || "召喚解除"}：目前沒有可解除的 FAW。`, "summon");
    return false;
  }
  if (!options.skipCost && typeof paySkillCost === "function") paySkillCost(skill, level);
  const summonName = summon.definition?.displayName || "FAW";
  delete player.activeBuffs[summon.buffId];
  clearVirtualSummonSupportBuffs(summon.family);
  virtualSummonLastAttackAt = 0;
  if (typeof recalculatePlayerStats === "function") recalculatePlayerStats();
  if (typeof updatePlayerUI === "function") updatePlayerUI();
  if (typeof saveGame === "function") saveGame();
  updateVirtualSummonUI();
  if (!options.silent && typeof addBattleLog === "function") addBattleLog(`施放 ${skill.name} Lv${level}；${summonName}已解體。`, "summon");
  return true;
}

function setVirtualSummonAssistEnabled(enabled) {
  const summon = getActiveVirtualSummon(), text = virtualSummonData?.uiText || {};
  if (!summon) { if (typeof addBattleLog === "function") addBattleLog(text.noSummon || "目前沒有可控制的召喚物。", "summon"); return false; }
  getVirtualSummonSettings().assistEnabled = !!enabled;
  if (enabled) virtualSummonLastAttackAt = 0;
  if (typeof addBattleLog === "function") addBattleLog(`${summon.definition.displayName}：${enabled ? (text.assistOn || "協助攻擊中") : (text.assistOff || "已停止攻擊")}。`, "summon");
  if (typeof saveGame === "function") saveGame(); updateVirtualSummonUI(); return true;
}

function commandVirtualSummonAction() {
  const text = virtualSummonData?.uiText || {};
  if (!getActiveVirtualSummon()) { if (typeof addBattleLog === "function") addBattleLog(text.noSummon || "目前沒有可控制的召喚物。", "summon"); return false; }
  const summon = getActiveVirtualSummon();
  const supportAction = summon?.configured && summon.definition?.supportAction === true;
  if (!supportAction && (!currentMonster || Number(currentMonster.currentHp || 0) <= 0)) { if (typeof addBattleLog === "function") addBattleLog(text.noTarget || "目前沒有可供召喚物攻擊的目標。", "summon"); return false; }
  const result = runVirtualSummonAssistTick(currentMonster, { manual:true });
  if (result.defeated && typeof defeatMonster === "function") defeatMonster();
  return result.attacked;
}

function dismissVirtualSummon() {
  const summon = getActiveVirtualSummon();
  if (!summon || !player?.activeBuffs) return false;
  delete player.activeBuffs[summon.buffId]; clearVirtualSummonSupportBuffs(summon.family); virtualSummonLastAttackAt = 0;
  if (typeof recalculatePlayerStats === "function") recalculatePlayerStats();
  if (typeof updatePlayerUI === "function") updatePlayerUI();
  if (typeof saveGame === "function") saveGame();
  if (typeof addBattleLog === "function") addBattleLog(`${summon.definition.displayName}：已解除召喚。`, "summon");
  updateVirtualSummonUI(); return true;
}

function escapeVirtualSummonHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isVirtualSummonWindowVisible() {
  const node = typeof document !== "undefined" ? document.getElementById("virtual-summon-window") : null;
  return !!(node && !node.classList.contains("hidden-window"));
}

function getSummonUiMountEntry() {
  if (!player) return null;
  const mounted = !!player?.mountState?.mounted;
  const activeType = mounted ? String(player?.mountState?.type || player?.mountState?.assetKey || "") : "";
  const candidates = [];
  if (activeType) candidates.push(activeType);
  if (typeof resolvePlayerMountType === "function") candidates.push(String(resolvePlayerMountType("swordman") || ""));
  candidates.push("dragon", "griffon", "peco", "mado");
  const seen = new Set();
  for (const type of candidates) {
    if (!type || seen.has(type)) continue;
    seen.add(type);
    const definition = typeof getMountRuntimeDefinition === "function" ? getMountRuntimeDefinition(type) : null;
    const active = mounted && activeType === type;
    const available = active || (typeof canPlayerUseMount === "function" && canPlayerUseMount(type));
    if (!definition || !available) continue;
    return { type, definition, active };
  }
  return null;
}

function toggleSummonUiMount(type) {
  const requested = String(type || "peco");
  const active = !!player?.mountState?.mounted && String(player?.mountState?.type || "") === requested;
  const result = typeof setPlayerMounted === "function" ? setPlayerMounted(!active, requested) : false;
  updateVirtualSummonUI(true);
  return result;
}

function dismissFalconFromSummonUI() {
  if (typeof setFalconActiveRuntime !== "function") return false;
  const changed = setFalconActiveRuntime(false);
  if (typeof addBattleLog === "function") addBattleLog("獵鷹已收回。", "summon");
  updateVirtualSummonUI(true);
  return changed;
}

function dismissWargFromSummonUI() {
  if (typeof setWargActiveRuntime !== "function") return false;
  const changed = setWargActiveRuntime(false);
  if (typeof addBattleLog === "function") addBattleLog("狼協助狀態已解除。", "summon");
  updateVirtualSummonUI(true);
  return changed;
}

function openHomunculusManagerFromSummonUI() {
  if (window.HomunculusManager?.open) return window.HomunculusManager.open();
  if (typeof openHomunculusWindow === "function") return openHomunculusWindow();
  return false;
}

function renderUnifiedSummonCard({ kind, title, meta = "", note = "", active = true, actions = "" }) {
  return `<article class="virtual-summon-card${active ? " is-active" : " is-inactive"}" data-kind="${escapeVirtualSummonHtml(kind)}">
    <div class="virtual-summon-card-head"><strong>${escapeVirtualSummonHtml(title)}</strong><span>${active ? "活動中" : "待命"}</span></div>
    ${meta ? `<div class="virtual-summon-card-meta">${meta}</div>` : ""}
    ${note ? `<div class="virtual-summon-card-note">${note}</div>` : ""}
    ${actions ? `<div class="virtual-summon-card-actions">${actions}</div>` : ""}
  </article>`;
}

function getUnifiedSummonUiModel() {
  const rows = [];
  const mount = getSummonUiMountEntry();
  if (mount) {
    const isDragon = mount.type === "dragon";
    rows.push({
      kind: "mount",
      title: mount.definition?.displayName || "坐騎",
      active: mount.active,
      meta: `類型：騎乘／${mount.active ? "目前騎乘中" : "目前未騎乘"}`,
      note: isDragon ? "盧恩騎士與盧恩龍爵由「龍駕馭」解鎖；三轉後不再透過二轉騎乘術切換。" : "坐騎狀態會同步人物動畫與需要騎乘的技能條件。",
      actions: `<button type="button" onclick="toggleSummonUiMount('${escapeVirtualSummonHtml(mount.type)}')">${mount.active ? "解除騎乘" : "開始騎乘"}</button>`
    });
  }

  const falconActive = typeof isFalconActiveRuntime === "function" && isFalconActiveRuntime();
  if (falconActive) rows.push({
    kind: "falcon", title: "獵鷹", active: true,
    meta: "類型：遠距離協助召喚物",
    note: "可與狼同時存在；不具有獨立 HP／SP／EXP，也不會被怪物攻擊。",
    actions: '<button type="button" onclick="dismissFalconFromSummonUI()">收回獵鷹</button>'
  });

  const wargActive = typeof isWargActiveRuntime === "function" && isWargActiveRuntime();
  if (wargActive) rows.push({
    kind: "warg", title: "狼", active: true,
    meta: "類型：遊俠協助召喚物",
    note: "RO_WEB 將狼視為協助單位，可與獵鷹同時存在；騎狼術仍為永久移動速度被動。",
    actions: '<button type="button" onclick="dismissWargFromSummonUI()">解除狼協助</button>'
  });

  const homunculus = window.HomunculusManager?.getActive?.() || (typeof getActiveHomunculus === "function" ? getActiveHomunculus() : null);
  if (homunculus) {
    const assist = homunculus.state?.assistEnabled !== false;
    rows.push({
      kind: "homunculus", title: homunculus.definition?.name || "生命體", active: true,
      meta: `類型：生命體・同步 BaseLv ${Math.max(1, Number(homunculus.level || 1))}・${assist ? "自動協助中" : "已停止協助"}`,
      note: "生命體使用專用欄位，可與狼、獵鷹、元素精靈及其他召喚物同時存在。",
      actions: `<button type="button" onclick="setHomunculusAssistEnabled(${assist ? "false" : "true"});updateVirtualSummonUI(true)">${assist ? "停止協助" : "恢復協助"}</button><button type="button" onclick="commandHomunculusAction()">立即行動</button><button type="button" onclick="restHomunculus();updateVirtualSummonUI(true)">安息</button><button type="button" onclick="openHomunculusManagerFromSummonUI()">生命體管理</button>`
    });
  }

  const summon = getActiveVirtualSummon();
  if (summon) {
    const settings = getVirtualSummonSettings();
    const text = virtualSummonData?.uiText || {};
    const activeText = summon.definition.supportAction === true ? "支援運作中" : (text.assistOn || "協助攻擊中");
    const stoppedText = summon.definition.supportAction === true ? "已停止支援" : (text.assistOff || "已停止攻擊");
    const gradeText = summon.configured ? `技能 Lv${summon.level}` : (summon.high ? "高階元素" : `Lv${summon.grade}`);
    const typeText = [summon.definition.categoryLabel || summon.definition.elementLabel || summon.definition.element, summon.definition.roleLabel, gradeText].filter(Boolean).join("・");
    rows.push({
      kind: "virtual", title: summon.definition.displayName, active: true,
      meta: `${escapeVirtualSummonHtml(typeText)}<br>狀態：${settings.assistEnabled ? activeText : stoppedText}<br>剩餘：${formatVirtualSummonRemainingTime(summon.buff?.expiresAt)}`,
      note: summon.definition.supportAction === true ? "定期恢復並支援玩家。" : "協助攻擊玩家目前鎖定的怪物。",
      actions: `<button type="button" onclick="setVirtualSummonAssistEnabled(${settings.assistEnabled ? "false" : "true"})">${settings.assistEnabled ? (text.stop || "停止攻擊") : (text.resume || "恢復協助")}</button><button type="button" onclick="commandVirtualSummonAction()">${text.manualAction || "立即使用技能"}</button><button type="button" onclick="dismissVirtualSummon()">${text.dismiss || "解除召喚"}</button>`
    });
  }

  for (const independent of getActiveIndependentSummons()) {
    const detonateAt = Number(independent.buff?.effects?.detonateAt || 0);
    const remaining = formatVirtualSummonRemainingTime(detonateAt > 0 ? detonateAt : independent.buff?.expiresAt);
    rows.push({
      kind: `independent-${independent.type}`,
      title: independent.definition?.displayName || independent.type,
      active: true,
      meta: `類型：獨立召喚物・${detonateAt > 0 ? `自爆倒數 ${remaining}` : `剩餘 ${remaining}`}`,
      note: "依自身週期行動，不占用狼、獵鷹、生命體或主要召喚物欄位。",
      actions: ""
    });
  }
  return rows;
}

function updateVirtualSummonUI(force = false) {
  const panel = typeof document !== "undefined" ? document.getElementById("virtual-summon-panel") : null;
  if (!panel) return;
  if (!force && !isVirtualSummonWindowVisible()) return;
  const rows = getUnifiedSummonUiModel();
  const signature = JSON.stringify(rows.map(row => ({ kind:row.kind,title:row.title,meta:row.meta,note:row.note,active:row.active,actions:row.actions })));
  if (!force && signature === virtualSummonUiSignature) return;
  virtualSummonUiSignature = signature;
  const activeCount = rows.filter(row => row.active).length;
  const cards = rows.map(renderUnifiedSummonCard).join("");
  panel.innerHTML = `<div class="virtual-summon-summary"><strong>召喚／騎乘狀態</strong><span>${activeCount} 個活動中</span></div>${cards || '<div class="virtual-summon-empty">目前沒有活動中的坐騎、獵鷹、狼、生命體或其他召喚物。召喚後會立即顯示在這裡。</div>'}`;
}

function openVirtualSummonWindow() {
  const node=typeof document!=="undefined"?document.getElementById("virtual-summon-window"):null;
  if(node) node.classList.remove("hidden-window");
  updateVirtualSummonUI(true);
}
function castSummonControlSkill() {
  openVirtualSummonWindow();
  const rows = getUnifiedSummonUiModel();
  if (!rows.length && typeof addBattleLog === "function") addBattleLog(virtualSummonData?.uiText?.noSummon || "目前沒有可控制的召喚物。", "summon");
  return true;
}
function notifyVirtualSummonStateChanged() { virtualSummonLastAttackAt=0; const summon=getActiveVirtualSummon(); if(summon&&typeof addBattleLog==="function")addBattleLog(`${summon.definition.displayName}：已加入戰鬥，${summon.definition.supportAction === true ? "將定期支援玩家" : "將協助攻擊你目前的目標"}。`,"summon"); updateVirtualSummonUI(); }
function startVirtualSummonUiRefresh(){if(virtualSummonUiTimer)return;virtualSummonUiTimer=setInterval(()=>{const result=runIndependentSummonTick(currentMonster);if(result?.defeated&&typeof defeatMonster==="function")defeatMonster();updateVirtualSummonUI();},1000);}
function stopVirtualSummonUiRefresh(){if(!virtualSummonUiTimer)return;clearInterval(virtualSummonUiTimer);virtualSummonUiTimer=null;}

window.toggleSummonUiMount = toggleSummonUiMount;
window.dismissFalconFromSummonUI = dismissFalconFromSummonUI;
window.dismissWargFromSummonUI = dismissWargFromSummonUI;
window.openHomunculusManagerFromSummonUI = openHomunculusManagerFromSummonUI;
window.updateVirtualSummonUI = updateVirtualSummonUI;
window.VirtualSummonManager={getActive:getActiveVirtualSummon,getIndependent:getActiveIndependentSummons,getUiModel:getUnifiedSummonUiModel,assistTick:runVirtualSummonAssistTick,independentTick:runIndependentSummonTick,cast:castVirtualSummonSkill,castIndependent:castIndependentSummonSkill,castDismiss:castVirtualSummonDismissSkill,setAssistEnabled:setVirtualSummonAssistEnabled,commandAction:commandVirtualSummonAction,dismiss:dismissVirtualSummon,open:openVirtualSummonWindow,getSummonDamageMasteryRate};
