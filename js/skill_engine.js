//=======================================
// SkillEngine 0.9.82EH - RA Renewal 全技能時序、秒7安全上限與地面技能 Runtime
// V0.9.80ZP：新增十字軍信任、盾擊、聖十字攻擊、長矛加速與通用攻擊狀態 Runtime。
// Skill Core 僅保存官方中繼資料；缺少 Runtime Profile 的技能會明確標示 pending，不再回退舊公式。
//=======================================

function clampSkillLevel(skill, requestedLevel) {
  if (!skill) return 0;
  const learned = getSkillLevel(skill.id);
  const max = Number(skill.maxLevel || 1);
  const requested = Number(requestedLevel || learned || 1);
  return Math.max(0, Math.min(learned, max, requested));
}

function getLevelValue(value, level, fallback = 0) {
  if (value === "level") return Number(level || fallback);
  if (Array.isArray(value)) {
    const index = Math.max(0, Number(level || 1) - 1);
    return Number(value[index] ?? value[value.length - 1] ?? fallback);
  }
  if (value && typeof value === "object") {
    const direct = value[level] ?? value[String(level)];
    if (direct !== undefined) return Number(direct ?? fallback);
  }
  return Number(value ?? fallback);
}

function getSkillRuntimeProfile(skillOrId) {
  const id = String(typeof skillOrId === "object" ? (skillOrId.officialId ?? skillOrId.id) : skillOrId);
  const row = skillsData?.runtimeProfiles?.[id] || null;
  return row?.runtimeProfile || row;
}

function isSkillRuntimeReady(skillOrId) {
  const profile = getSkillRuntimeProfile(skillOrId);
  return !!(profile && profile.handler && profile.handler !== "pending");
}

function getSkillRuntimeStatusText(skillOrId) {
  const profile = getSkillRuntimeProfile(skillOrId);
  if (!profile) return "尚未建立 Runtime Profile";
  if (!profile.handler || profile.handler === "pending") return "Runtime Profile 尚未完成";
  return "Runtime 已完成";
}

function getRaLevelValue(value, level, fallback = 0, field = null) {
  if (Array.isArray(value)) {
    const requestedLevel = Math.max(1, Math.floor(Number(level || 1)));
    const keys = field ? [field] : ["Amount", "Time", "Count", "Area", "Value"];
    const levelRows = value.filter(row => row && typeof row === "object" && Number.isFinite(Number(row.Level)));
    if (levelRows.length) {
      // Reproduce rAthena SkillDatabase::parseNode semantics:
      // unspecified levels inside the acquired range remain 0; levels above the
      // last explicit row use a detected linear trend or the last value.
      const explicit = new Map();
      let maxExplicitLevel = 0;
      for (const row of levelRows) {
        const rowLevel = Math.max(1, Math.floor(Number(row.Level || 1)));
        let found = false;
        for (const key of keys) {
          if (row[key] === undefined) continue;
          explicit.set(rowLevel, Number(row[key] ?? fallback));
          found = true;
          break;
        }
        if (found) maxExplicitLevel = Math.max(maxExplicitLevel, rowLevel);
      }
      if (maxExplicitLevel > 0) {
        const values = Array(Math.max(requestedLevel, maxExplicitLevel)).fill(0);
        for (const [rowLevel, rowValue] of explicit.entries()) values[rowLevel - 1] = Number(rowValue || 0);
        if (requestedLevel <= maxExplicitLevel) return Number(values[requestedLevel - 1] ?? fallback);

        let matchedStep = 0;
        let matchedDiff = 0;
        const acquired = maxExplicitLevel;
        for (let step = 1; step <= Math.floor(acquired / 2); step++) {
          const diff = values[acquired - 1] - values[acquired - step - 1];
          let matches = true;
          for (let index = acquired - 1; index >= step; index--) {
            if ((values[index] - values[index - step]) !== diff) {
              matches = false;
              break;
            }
          }
          if (matches) {
            matchedStep = step;
            matchedDiff = diff;
            break;
          }
        }
        if (matchedStep > 0) {
          for (let index = acquired; index < requestedLevel; index++) {
            values[index] = values[index - matchedStep] + matchedDiff;
            if (values[index] < 1 && values[index - 1] >= 0) {
              values[index] = 1;
              matchedDiff = 0;
              matchedStep = 1;
            }
          }
          return Number(values[requestedLevel - 1] ?? fallback);
        }
        return Number(values[maxExplicitLevel - 1] ?? fallback);
      }
    }

    const row = value[Math.max(0, requestedLevel - 1)] || value[value.length - 1];
    if (row && typeof row === "object") {
      for (const key of keys) if (row[key] !== undefined) return Number(row[key] ?? fallback);
    }
  }
  return getLevelValue(value, level, fallback);
}

function getSkillRaRequirements(skill) {
  if (skill?.raRequirements && typeof skill.raRequirements === "object") return skill.raRequirements;
  if (skill?.requires && !Array.isArray(skill.requires) && typeof skill.requires === "object") return skill.requires;
  return {};
}

function getRuntimeSkillSpCost(skill, level) {
  const profile = getSkillRuntimeProfile(skill);
  let baseCost = 0;
  if (profile?.spCost !== undefined) baseCost = Math.max(0, Math.floor(getLevelValue(profile.spCost, level, 0)));
  else if (getSkillRaRequirements(skill).SpCost !== undefined) baseCost = Math.max(0, Math.floor(getRaLevelValue(getSkillRaRequirements(skill).SpCost, level, 0, "Amount")));
  else baseCost = Math.max(0, Math.floor(getLevelValue(skill?.spCost, level, 0)));
  const passive = typeof getPassiveSkillBonusTotals === "function" ? getPassiveSkillBonusTotals() : {};
  const active = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
  const cardCost = window.CardRuntime?.getSkillSpCostModifier ? window.CardRuntime.getSkillSpCostModifier(skill) : { flat:0, rate:0 };
  const reduction = Math.max(0, Math.min(100, Number(passive.spCostReductionRate || 0) + Number(active.spCostReductionRate || 0)));
  const increase = Math.max(0, Number(active.skillSpCostIncreaseRate || 0));
  const cardAdjusted = Math.max(0, Number(baseCost) + Number(cardCost.flat || 0)) * Math.max(0, 100 + Number(cardCost.rate || 0)) / 100;
  return Math.max(0, Math.floor(cardAdjusted * (100 - reduction) / 100 * (100 + increase) / 100));
}

function getRuntimeSkillZenyCost(skill, level) {
  const profile = getSkillRuntimeProfile(skill) || {};
  if (profile.enforceZenyCost !== true) return 0;
  let baseCost = 0;
  if (profile.zenyCost !== undefined) baseCost = Math.max(0, Math.floor(getLevelValue(profile.zenyCost, level, 0)));
  else if (getSkillRaRequirements(skill).ZenyCost !== undefined) baseCost = Math.max(0, Math.floor(getRaLevelValue(getSkillRaRequirements(skill).ZenyCost, level, 0, "Amount")));
  if (baseCost <= 0) return 0;
  const passive = typeof getPassiveSkillBonusTotals === "function" ? getPassiveSkillBonusTotals() : {};
  const discount = Math.max(0, Math.min(100, Number(passive.mammoniteZenyDiscountRate || 0)));
  return Math.max(0, Math.floor(baseCost * (100 - discount) / 100));
}

function getRuntimeHitCount(skill, level) {
  const profile = getSkillRuntimeProfile(skill);
  if (!profile) return null;
  if (profile.hitCount !== undefined) return Math.max(1, getLevelValue(profile.hitCount, level, 1));
  return Math.max(1, getRaLevelValue(skill?.hitCount, level, 1, "Count"));
}

function getRuntimeDuration(skill, level) {
  const profile = getSkillRuntimeProfile(skill);
  if (!profile) return 0;
  if (profile.infiniteDuration === true) return 3153600000000; // 100 years; stored as an effectively infinite toggle.
  if (profile.duration !== undefined) return Math.max(0, Math.floor(getLevelValue(profile.duration, level, 0)));
  if (profile.durationFromSkill === true) {
    // rAthena skill_db stores most status durations in Duration1 as
    // [{Level, Time}], not in a flat `duration` field. Reading only duration
    // made buffs such as Attention Concentrate expire immediately and recast
    // every auto-battle tick.
    const durationSource = skill?.duration1 ?? skill?.duration2 ?? skill?.duration ?? null;
    if (durationSource !== null && durationSource !== undefined) {
      return Math.max(0, Math.floor(getRaLevelValue(durationSource, level, 0, "Time")));
    }
  }
  return 0;
}


function getMountManifestRuntime() {
  return window.RO_WEB_DATA?.["data/mounts/mount_manifest.json"] || null;
}

function getMountRequiredSkillMessage() {
  return String(getMountManifestRuntime()?.uiText?.skillRequiresMount || "需要使用坐騎才能使用該技能。");
}

function resolvePlayerMountType(mountType = "peco") {
  const requested = String(mountType || "peco");
  const manifest = getMountManifestRuntime();
  const resolver = manifest?.resolvers?.[requested] || null;
  if (!resolver) return requested;
  const jobKey = String(player?.jobKey || "");
  return String(resolver?.jobMountMap?.[jobKey] || resolver?.fallbackMountType || requested);
}

function getMountRuntimeDefinition(mountType = "peco") {
  const type = resolvePlayerMountType(mountType);
  const manifest = getMountManifestRuntime();
  const manifestRow = manifest?.mounts?.[type] || null;
  if (!manifestRow) return null;
  const definition = manifestRow.definitionPath ? window.RO_WEB_DATA?.[manifestRow.definitionPath] : null;
  return { ...manifestRow, ...(definition || {}), mountType: String(manifestRow.mountType || type) };
}

function isMountAllowedForCurrentJob(definition) {
  const allowedJobs = Array.isArray(definition?.allowedJobs) ? definition.allowedJobs.map(String) : [];
  if (!allowedJobs.length) return true;
  return allowedJobs.includes(String(player?.jobKey || ""));
}

function canPlayerUseMount(mountType = "peco") {
  const definition = getMountRuntimeDefinition(mountType);
  if (!definition || !isMountAllowedForCurrentJob(definition)) return false;
  const requiredSkillIds = Array.isArray(definition?.requiredSkillIds)
    ? definition.requiredSkillIds.map(Number).filter(id => id > 0)
    : [Number(definition?.requiredSkillId || 0)].filter(id => id > 0);
  if (!requiredSkillIds.length) return true;
  if (typeof getSkillLevel !== "function") return false;
  return requiredSkillIds.every(skillId => Number(getSkillLevel(skillId) || 0) > 0);
}

function normalizePlayerMountCompatibility() {
  if (!player?.mountState?.mounted) return;
  if (typeof getSkillLevel !== "function") return;
  const type = String(player.mountState.type || "");
  if (type && canPlayerUseMount(type)) return;
  player.mountState = { mounted: false, type: null, assetKey: null, rental: false };
  if (typeof window.onROWebMountStateChanged === "function") window.onROWebMountStateChanged(player.mountState);
}

function normalizeRuntimeCombatState() {
  if (!player) return;
  player.runtimeState = player.runtimeState || {};
  player.mountState = player.mountState || { mounted: false, type: null, assetKey: null, rental: false };
  normalizePlayerMountCompatibility();
  const now = Date.now();
  Object.keys(player.runtimeState).forEach(key => {
    const state = player.runtimeState[key];
    if (state && Number(state.expiresAt || 0) > 0 && Number(state.expiresAt) <= now) delete player.runtimeState[key];
  });
}

function isPlayerMounted() {
  normalizeRuntimeCombatState();
  return !!player?.mountState?.mounted;
}

function setPlayerMounted(mounted, mountType = "peco") {
  if (!player) return false;
  normalizeRuntimeCombatState();
  const resolvedType = resolvePlayerMountType(mountType);
  const definition = getMountRuntimeDefinition(resolvedType);
  if (mounted && !canPlayerUseMount(resolvedType)) {
    const displayName = definition?.displayName || String(resolvedType || "坐騎");
    if (typeof addBattleLog === "function") addBattleLog(`目前職業或技能尚不能使用${displayName}。`);
    return false;
  }
  player.mountState = {
    mounted: !!mounted,
    type: mounted ? resolvedType : null,
    assetKey: mounted ? (definition?.mountType || resolvedType) : null,
    rental: mounted ? Boolean(definition?.rental?.enabled ?? definition?.rentalEnabled) : false
  };
  if (typeof recalculatePlayerStats === "function") recalculatePlayerStats();
  if (typeof updatePlayerUI === "function") updatePlayerUI();
  if (typeof saveGame === "function") saveGame();
  if (typeof updateVirtualSummonUI === "function") updateVirtualSummonUI(true);
  // 劍士坐騎圖加入後，由這個單一入口切換 Character Atlas / Body。
  if (typeof window.onROWebMountStateChanged === "function") window.onROWebMountStateChanged(player.mountState);
  if (typeof addBattleLog === "function") {
    const displayName = definition?.displayName || "坐騎";
    addBattleLog(mounted ? `已騎乘${displayName}。` : "已解除騎乘狀態。");
  }
  return true;
}

function togglePlayerMount(mountType = "peco") {
  const resolvedType = resolvePlayerMountType(mountType);
  const sameTypeMounted = isPlayerMounted() && String(player?.mountState?.type || "") === resolvedType;
  return setPlayerMounted(!sameTypeMounted, resolvedType);
}

function rentPlayerMount(mountType = "mado") {
  return setPlayerMounted(true, mountType);
}

function returnPlayerMount(mountType = null) {
  if (!isPlayerMounted()) return true;
  if (mountType && String(player?.mountState?.type || "") !== String(mountType)) return false;
  return setPlayerMounted(false, player?.mountState?.type || "peco");
}

window.getMountRuntimeDefinition = getMountRuntimeDefinition;
window.resolvePlayerMountType = resolvePlayerMountType;
window.canPlayerUseMount = canPlayerUseMount;
window.setPlayerMounted = setPlayerMounted;
window.togglePlayerMount = togglePlayerMount;
window.rentPlayerMount = rentPlayerMount;
window.returnPlayerMount = returnPlayerMount;

function getMonsterRuntimeState(monster = currentMonster) {
  if (!monster) return null;
  monster.runtimeState = monster.runtimeState || {};
  const now = Date.now();
  Object.keys(monster.runtimeState).forEach(key => {
    const state = monster.runtimeState[key];
    if (state && Number(state.expiresAt || 0) > 0 && Number(state.expiresAt) <= now) delete monster.runtimeState[key];
  });
  return monster.runtimeState;
}

function getMonsterRuntimeBonuses(monster = currentMonster) {
  const totals = {};
  const states = getMonsterRuntimeState(monster) || {};
  const now = Date.now();
  const addState = state => {
    if (!state || (Number(state.expiresAt || 0) > 0 && Number(state.expiresAt) <= now)) return;
    Object.entries(state.effects || {}).forEach(([key,value]) => {
      if (typeof value === "number" && Number.isFinite(value)) totals[key] = Number(totals[key] || 0) + value;
      else if (value !== undefined && value !== null) totals[key] = value;
    });
  };
  Object.entries(states).forEach(([key,state]) => {
    if (key === "statuses") Object.values(state || {}).forEach(addState);
    else addState(state);
  });
  return totals;
}

function castMonsterDebuffSkill(skill, requestedLevel = null) {
  const check = canCastSkill(skill, requestedLevel, ["monster_debuff"]);
  if (!check.ok) return reportPendingRuntime(skill, check.reason);
  if (!currentMonster) return false;
  const { level, profile } = check;
  const targetBaseLv = Number(currentMonster.level || currentMonster.baseLevel || 1);
  const casterBaseLv = Number(player.baseLevel || 1);
  const chance = Math.max(0, Math.min(100, 70 + 3 * level + casterBaseLv - targetBaseLv));
  paySkillCost(skill, level);
  if (Math.random() * 100 >= chance) {
    addBattleLog(`${skill.name} 失敗。`);
    updatePlayerUI(); saveGame();
    return true;
  }
  const state = getMonsterRuntimeState(currentMonster);
  const expiresAt = Date.now() + getRuntimeDuration(skill, level);
  if (Array.isArray(profile.monsterDebuffComponents) && profile.monsterDebuffComponents.length) {
    profile.monsterDebuffComponents.forEach(component => {
      const group = String(component.group || skill.id);
      state[`debuff:${group}`] = { id: skill.id, group, name: component.name || skill.name, level, effects: collectRuntimeEffects({effects:component.effects || {}}, level), expiresAt };
    });
  } else {
    state[skill.id] = { id: skill.id, name: skill.name, level, effects: collectRuntimeEffects(profile, level), expiresAt };
  }
  if (profile.forceAggro) currentMonster.aiState = "CHASE";
  addBattleLog(`施放 ${skill.name} Lv${level} 成功。`);
  updateMonsterUI(); updatePlayerUI(); saveGame();
  return true;
}

function castCounterStanceSkill(skill, requestedLevel = null) {
  const check = canCastSkill(skill, requestedLevel, ["counter_stance"]);
  if (!check.ok) return reportPendingRuntime(skill, check.reason);
  const { level, profile } = check;
  paySkillCost(skill, level);
  normalizeRuntimeCombatState();
  player.runtimeState.counterStance = {
    skillId: skill.id,
    skillName: skill.name,
    level,
    reflectRatePercent: Number(getLevelValue(profile.reflectRatePercent, level, 0)),
    expiresAt: Date.now() + Math.max(1, Number(getLevelValue(profile.duration, level, profile.duration || 300000)))
  };
  addBattleLog(`${skill.name} 已啟動：受到物理傷害時持續反射部分傷害。`);
  updatePlayerUI(); saveGame();
  return true;
}

function applyCounterReflect(monster = currentMonster, incomingDamage = 0) {
  normalizeRuntimeCombatState();
  const state = player?.runtimeState?.counterStance;
  if (!state || Number(state.expiresAt || 0) <= Date.now() || !monster) return 0;
  const rate = Math.max(0, Number(state.reflectRatePercent || 0));
  const damage = Math.max(0, Math.floor(Number(incomingDamage || 0) * rate / 100));
  if (damage <= 0) return 0;
  monster.currentHp = Math.max(0, Number(monster.currentHp || 0) - damage);
  addBattleLog(`${state.skillName || "反擊"}反射 ${damage} 點傷害。`);
  if (typeof updateMonsterUI === "function") updateMonsterUI();
  if (typeof showDamageNumber === "function") showDamageNumber(damage);
  return damage;
}

function getEquippedWeaponTypeRuntime() {
  const weaponId = player?.equipment?.weapon;
  if (!weaponId) return "fist";
  const item = typeof getItemData === "function" ? getItemData(weaponId) : null;
  return String(item?.dbSubType || item?.SubType || item?.subType || item?.weaponType || "other");
}

// 0.9.82FO: rAthena uses 1hSword / 2hSword while the RO_WEB runtime
// profiles also contain oneHandSword / twoHandSword.  Compare canonical
// weapon identities instead of relying on raw substring matching.
function normalizeRuntimeWeaponType(value) {
  const raw = String(value || "other").trim().toLowerCase();
  const compact = raw.replace(/[^a-z0-9]/g, "");
  const aliases = {
    fist: "fist", barehand: "fist", unarmed: "fist",
    dagger: "dagger",
    sword: "sword", onehandsword: "onehandsword", "1hsword": "onehandsword",
    twohandsword: "twohandsword", "2hsword": "twohandsword", twohandedsword: "twohandsword",
    axe: "axe", onehandaxe: "onehandaxe", "1haxe": "onehandaxe",
    twohandaxe: "twohandaxe", "2haxe": "twohandaxe", twohandedaxe: "twohandaxe",
    mace: "mace", onehandmace: "onehandmace", "1hmace": "onehandmace",
    twohandmace: "twohandmace", "2hmace": "twohandmace", twohandedmace: "twohandmace",
    spear: "spear", onehandspear: "onehandspear", "1hspear": "onehandspear",
    twohandspear: "twohandspear", "2hspear": "twohandspear", twohandedspear: "twohandspear",
    staff: "staff", onehandstaff: "onehandstaff", "1hstaff": "onehandstaff",
    twohandstaff: "twohandstaff", "2hstaff": "twohandstaff", twohandedstaff: "twohandstaff",
    bow: "bow", katar: "katar", book: "book", knuckle: "knuckle",
    instrument: "instrument", musical: "instrument", whip: "whip",
    gun: "gun", revolver: "revolver", rifle: "rifle", shotgun: "shotgun",
    gatling: "gatling", grenade: "grenade", huuma: "huuma", shuriken: "shuriken"
  };
  return aliases[compact] || compact || "other";
}

function getRuntimeWeaponFamily(value) {
  const type = normalizeRuntimeWeaponType(value);
  if (["sword", "onehandsword", "twohandsword"].includes(type)) return "sword";
  if (["axe", "onehandaxe", "twohandaxe"].includes(type)) return "axe";
  if (["mace", "onehandmace", "twohandmace"].includes(type)) return "mace";
  if (["spear", "onehandspear", "twohandspear"].includes(type)) return "spear";
  if (["staff", "onehandstaff", "twohandstaff"].includes(type)) return "staff";
  if (["gun", "revolver", "rifle", "shotgun", "gatling", "grenade"].includes(type)) return "gun";
  return type;
}

function matchesRuntimeWeaponType(actualType, requiredType) {
  const actual = normalizeRuntimeWeaponType(actualType);
  const required = normalizeRuntimeWeaponType(requiredType);
  if (actual === required) return true;
  const genericFamilies = new Set(["sword", "axe", "mace", "spear", "staff", "gun"]);
  if (genericFamilies.has(required)) return getRuntimeWeaponFamily(actual) === required;
  return false;
}

function matchesAnyRuntimeWeaponType(actualType, requiredTypes = []) {
  return (requiredTypes || []).some(required => matchesRuntimeWeaponType(actualType, required));
}
window.normalizeRuntimeWeaponType = normalizeRuntimeWeaponType;
window.matchesRuntimeWeaponType = matchesRuntimeWeaponType;
window.matchesAnyRuntimeWeaponType = matchesAnyRuntimeWeaponType;

function hasEquippedShieldRuntime() {
  return !!player?.equipment?.shield;
}


function normalizeRuntimeTargetSize(target) {
  const raw = String(target?.size || target?.Size || "Medium").toLowerCase();
  if (raw.includes("small") || raw === "0") return "Small";
  if (raw.includes("large") || raw === "2") return "Large";
  return "Medium";
}

function matchesRuntimeTargetConditions(profile, target) {
  const rule = profile?.targetConditions;
  if (!rule || !target) return true;
  const race = String(target.race || target.Race || "").toLowerCase();
  const element = String(target.element || target.Element || target.defElement || "").toLowerCase();
  const races = (rule.races || []).map(v => String(v).toLowerCase());
  const elements = (rule.elements || []).map(v => String(v).toLowerCase());
  const raceOk = races.some(v => race.includes(v));
  const elementOk = elements.some(v => element.includes(v));
  if (races.length && elements.length) return raceOk || elementOk;
  if (races.length) return raceOk;
  if (elements.length) return elementOk;
  return true;
}

function applyAttackRuntimeStatus(profile, level, monster = currentMonster) {
  if (!profile || !monster || !window.StatusManager) return false;
  if (profile.statusSecondaryOnly && monster === currentMonster) return false;
  if (Array.isArray(profile.statusTargetSizes) && !profile.statusTargetSizes.includes(normalizeRuntimeTargetSize(monster))) return false;

  const applyOne = (rule, fallbackChance = 0) => {
    if (!rule?.status) return false;
    let chance = Math.max(0, Math.min(100, getLevelValue(rule.chancePercent ?? rule.statusChancePercent ?? fallbackChance, level, fallbackChance)));
    const statusChanceFormula=rule.statusChanceFormula || profile.statusChanceFormula;
    if(statusChanceFormula==="renewal_gentle_touch_quiet"){
      const derived=typeof calculateDerivedPlayerStats==="function"?calculateDerivedPlayerStats():null;
      const dex=Number(derived?.stats?.dex||player?.stats?.dex||1),baseLv=Number(player?.baseLevel||1);
      chance=Math.max(0,Math.min(100,5*Number(level||1)+(dex+baseLv)/10));
    }
    if(statusChanceFormula==="renewal_adoramus"){
      chance=Math.max(0,Math.min(100,4*Number(level||1)+Math.floor(Number(player?.jobLevel||50)/2)));
    }
    if(statusChanceFormula==="renewal_earth_strain_strip"){
      const derived=typeof calculateDerivedPlayerStats==="function"?calculateDerivedPlayerStats():null;
      const dex=Number(derived?.stats?.dex||player?.stats?.dex||1),jobLv=Number(player?.jobLevel||1);
      chance=Math.max(0,Math.min(100,6*Number(level||1)+jobLv/4+dex/10));
    }
    if(statusChanceFormula==="renewal_warg_bite"){
      const passive=typeof getPassiveSkillBonusTotals==="function"?getPassiveSkillBonusTotals():{};
      const targetAgi=Number(monster?.stats?.agi??monster?.agi??monster?.level??1);
      chance=Math.max(50,Math.min(100,50+10*Number(level||1)+Number(passive.wargBiteChanceBonus||0)-targetAgi/4));
    }
    let duration = Math.max(0, Number(getLevelValue(rule.durationMs ?? rule.statusDuration ?? 0, level, 0)));
    const statusDurationFormula=rule.statusDurationFormula || profile.statusDurationFormula;
    if(statusDurationFormula==="renewal_earth_strain_strip"){
      const derived=typeof calculateDerivedPlayerStats==="function"?calculateDerivedPlayerStats():null;
      const casterDex=Number(derived?.stats?.dex||player?.stats?.dex||1);
      const targetDex=Number(monster?.stats?.dex??monster?.dex??monster?.level??1);
      duration += 15000 + Math.max(1, Number(level||1) + 500 * (casterDex - targetDex));
    }
    if(statusDurationFormula==="renewal_warg_bite"){
      const passive=typeof getPassiveSkillBonusTotals==="function"?getPassiveSkillBonusTotals():{};
      duration=Math.max(1000,Number(level||1)*1000+Number(passive.wargBiteDurationBonusMs||0));
    }
    if(statusDurationFormula==="renewal_netherworld"){
      const targetLv=Math.max(1,Number(monster?.level||monster?.baseLevel||1));
      duration=Math.max(1000,duration-targetLv*20-100);
    }

    const randomDuration=rule.statusDurationRandom || profile.statusDurationRandom;
    if(Array.isArray(randomDuration)&&randomDuration.length>=2){const lo=Number(randomDuration[0]||0),hi=Number(randomDuration[1]||lo);duration=Math.floor(lo+Math.random()*Math.max(1,hi-lo+1));}
    const effectLevel = profile.statusEffectLinkedSkillId && typeof getSkillLevel === "function" ? Math.max(1, Number(getSkillLevel(profile.statusEffectLinkedSkillId) || 1)) : level;
    const result = window.StatusManager.apply(monster, rule.status, {
      chancePercent: chance, durationMs: duration, level: effectLevel,
      effects: collectRuntimeEffects({ effects: rule.effects || {} }, effectLevel), allowBoss: rule.statusAffectsBoss === true || profile.statusAffectsBoss === true
    });
    if (result.applied && typeof addBattleLog === "function") addBattleLog(`${monster.name} 陷入 ${rule.status} 狀態。`);
    return !!result.applied;
  };

  if (Array.isArray(profile.statusSequence)) {
    for (const rule of profile.statusSequence) {
      const applied = applyOne(rule, 0);
      if (applied && rule.stopOnSuccess !== false) return true;
    }
    return false;
  }

  if (Array.isArray(profile.randomStatusOptions) && profile.randomStatusOptions.length) {
    const option = profile.randomStatusOptions[Math.floor(Math.random() * profile.randomStatusOptions.length)];
    return applyOne(option, getLevelValue(profile.randomStatusChancePercent, level, 0));
  }

  if (!profile.status) return false;
  const structured = (profile.status && typeof profile.status === "object" && !Array.isArray(profile.status)) ? profile.status : null;
  return applyOne(structured ? {
    status: structured.type || structured.status,
    chancePercent: structured.baseChance ?? structured.chancePercent ?? structured.statusChancePercent ?? profile.statusChancePercent,
    statusChanceFormula: structured.chanceFormula || structured.statusChanceFormula || profile.statusChanceFormula,
    durationMs: structured.durationMs ?? structured.statusDuration ?? profile.statusDuration,
    effects: structured.effects || structured.statusEffects || profile.statusEffects || {},
    statusAffectsBoss: structured.statusAffectsBoss === true || profile.statusAffectsBoss === true
  } : {
    status:profile.status, chancePercent:profile.statusChancePercent, statusChanceFormula:profile.statusChanceFormula,
    durationMs:profile.statusDuration, effects:profile.statusEffects||{}, statusAffectsBoss:profile.statusAffectsBoss===true
  },0);
}

function tryCrescentElbowCounter(monster = currentMonster, receivedDamage = 0) {
  if(!player||!monster||Number(receivedDamage||0)<=0)return {triggered:false,damage:0,recoil:0};
  normalizeActiveBuffs();
  const entry=Object.entries(player.activeBuffs||{}).find(([,buff])=>Number(buff?.effects?.crescentElbow||0)>0);
  if(!entry)return {triggered:false,damage:0,recoil:0};
  const [buffId,buff]=entry;
  const level=Math.max(1,Number(buff?.effects?.crescentElbowLevel||buff?.level||1));
  const chance=Math.max(0,Math.min(100,Number(buff?.effects?.crescentElbowChance||0)));
  if(Math.random()*100>=chance)return {triggered:false,damage:0,recoil:0};
  delete player.activeBuffs[buffId];
  const derived=typeof calculateDerivedPlayerStats==="function"?calculateDerivedPlayerStats():null;
  const playerAtk=Math.max(1,Number(derived?.atk??player?.atk??1));
  const attackerHp=Math.max(0,Number(monster?.currentHp??monster?.hp??0));
  const baseLv=Math.max(1,Number(player?.baseLevel||1));
  const ratio=Math.min(5000,Math.max(0,Math.floor(Math.floor(attackerHp/100)*level*baseLv/125)));
  const counterDamage=Math.max(1,Math.floor(playerAtk*ratio/100+Number(receivedDamage||0)*(1+level*0.2)));
  const dealt=Math.min(Math.max(0,Number(monster?.currentHp??0)),counterDamage);
  monster.currentHp=Math.max(0,Number(monster?.currentHp??0)-dealt);
  const recoil=Math.max(0,Math.floor(counterDamage/10));
  player.hp=Math.max(0,Number(player.hp||0)-recoil);
  const skillName=(typeof getSkillDataById==="function"?getSkillDataById(Number(buffId))?.name:null)||buff?.name||"反擊技能";
  if(typeof addBattleLog==="function")addBattleLog(`${skillName}發動，對 ${monster.name||"敵人"} 造成 ${dealt} 點反擊傷害，自身承受 ${recoil} 點反作用力。`);
  if(typeof showDamageNumber==="function")showDamageNumber(dealt);
  if(typeof playMonsterHitAnimation==="function")playMonsterHitAnimation(monster);
  return {triggered:true,damage:dealt,recoil,ratio,chance};
}

function tryLightningWalkBlock(monster = currentMonster) {
  if(!player||!monster)return false;
  normalizeActiveBuffs();
  const entry=Object.entries(player.activeBuffs||{}).find(([,buff])=>Number(buff?.effects?.lightningWalk||0)>0);
  if(!entry)return false;
  const [buffId,buff]=entry;
  const chance=Math.max(0,Math.min(100,Number(buff?.effects?.lightningWalkBlockChance||0)));
  if(Math.random()*100>=chance)return false;
  delete player.activeBuffs[buffId];
  if(typeof recalculatePlayerStats==="function")recalculatePlayerStats();
  if(typeof addBattleLog==="function")addBattleLog(`閃電步發動，完全擋下 ${monster.name||"敵人"} 的遠距離物理攻擊！`);
  return true;
}

function tryGentleTouchEnergyGain(trigger = "attack") {
  if(!player||!window.CombatResourceManager)return false;
  const active=typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals():{};
  const chance=Math.max(0,Math.min(100,Number(active.gentleTouchEnergyGainChance||0)));
  if(chance<=0||Math.random()*100>=chance)return false;
  const max=5+Math.max(0,Number(active.spiritSphereMaxBonus||0));
  const current=Number(window.CombatResourceManager.get("spiritSphere")||0);
  if(current>=max)return false;
  const duration=Math.max(1000,Number(active.gentleTouchSphereDurationMs||600000));
  window.CombatResourceManager.configure("spiritSphere",{max,start:Math.min(max,current+1),durationMs:duration,regenIntervalMs:0});
  if(typeof addBattleLog==="function")addBattleLog(`點穴－球發動，獲得 1 顆氣彈（${Math.min(max,current+1)}/${max}）。`);
  return true;
}

function getWarlockRadiusFixedCastReduction(skill){
  const skillId=Number(skill?.officialId??skill?.id??0);
  if(skillId<2201||skillId>2232||typeof getSkillLevel!=="function")return 0;
  const radiusLevel=Math.max(0,Math.min(3,Number(getSkillLevel(2208)||0)));
  if(radiusLevel<=0)return 0;
  const derived=typeof calculateDerivedPlayerStats==="function"?calculateDerivedPlayerStats():null;
  const intStat=Math.max(0,Number(derived?.stats?.int||player?.stats?.int||0));
  const baseLevel=Math.max(1,Number(player?.baseLevel||1));
  return Math.max(0,Math.floor((intStat+baseLevel)/15)+radiusLevel*5);
}

function getRuntimeTimingFlagSet(skill, field) {
  const raw = skill?.[field];
  if (!raw || typeof raw !== "object") return {};
  return {
    ignoreDex: raw.IgnoreDex === true || raw.ignoreDex === true,
    ignoreStatus: raw.IgnoreStatus === true || raw.ignoreStatus === true,
    ignoreItemBonus: raw.IgnoreItemBonus === true || raw.ignoreItemBonus === true
  };
}

function getRuntimeTimingSkillMapValue(source, names, skillId) {
  if (!source || typeof source !== "object") return 0;
  for (const wrapper of [source, source.effects, source.bonuses, source.timingModifiers, source.runtimeTimingModifiers]) {
    if (!wrapper || typeof wrapper !== "object") continue;
    for (const name of names) {
      const map = wrapper[name];
      if (!map || typeof map !== "object" || Array.isArray(map)) continue;
      const value = map[skillId] ?? map[String(skillId)] ?? map.all ?? map.All;
      if (Number.isFinite(Number(value))) return Number(value);
    }
  }
  return 0;
}

function getRuntimeTimingScalar(source, names) {
  if (!source || typeof source !== "object") return 0;
  let total = 0;
  for (const wrapper of [source, source.effects, source.bonuses, source.timingModifiers, source.runtimeTimingModifiers]) {
    if (!wrapper || typeof wrapper !== "object") continue;
    for (const name of names) {
      const value = wrapper[name];
      if (Number.isFinite(Number(value))) total += Number(value);
    }
  }
  return total;
}

function getRuntimeTimingValues(source, names) {
  const values = [];
  if (!source || typeof source !== "object") return values;
  for (const wrapper of [source, source.effects, source.bonuses, source.timingModifiers, source.runtimeTimingModifiers]) {
    if (!wrapper || typeof wrapper !== "object") continue;
    for (const name of names) {
      const value = wrapper[name];
      if (Array.isArray(value)) {
        for (const row of value) if (Number.isFinite(Number(row))) values.push(Number(row));
      } else if (Number.isFinite(Number(value))) values.push(Number(value));
    }
  }
  return values;
}

function getRuntimeEquippedTimingSources() {
  if (!player?.equipment || typeof getItemData !== "function") return [];
  const sources = [];
  const mainId = player.equipment.weapon;
  const main = mainId ? getItemData(mainId) : null;
  for (const [slot, id] of Object.entries(player.equipment)) {
    if (!id) continue;
    // Two-handed items may be mirrored into the off-hand slot by the equipment UI.
    if ((slot === "shield" || slot === "leftWeapon") && id === mainId && main && (main.twoHanded || main.hands === 2 || main.weaponHands === 2)) continue;
    const item = getItemData(id);
    if (!item) continue;
    sources.push(item);
  }
  if (window.CardRuntime?.getSources) sources.push(...window.CardRuntime.getSources());
  return sources;
}

function collectRuntimeTimingModifiers(skill, level = 1) {
  const skillId = String(skill?.officialId ?? skill?.id ?? 0);
  const active = typeof getActiveBuffBonusTotals === "function" ? (getActiveBuffBonusTotals() || {}) : {};
  const directStatusSources = Object.values(player?.activeBuffs || {}).map(buff => buff?.effects || buff).filter(src => src && typeof src === "object");
  const passive = typeof getPassiveSkillBonusTotals === "function" ? (getPassiveSkillBonusTotals() || {}) : {};
  const system = player?.runtimeTimingModifiers || player?.timingModifiers || {};
  const itemSources = getRuntimeEquippedTimingSources();
  const groups = { status: directStatusSources.length ? directStatusSources : [active], item: itemSources, skill: [passive, system] };
  const aliases = {
    variableRate: ["variableCastReductionRate", "variableCastRateReduction", "varCastReductionRate", "varcastrate"],
    variableMs: ["variableCastReductionMs", "variableCastTimeReductionMs", "variableCastMsReduction", "variableCastFlatReductionMs"],
    variableAddMs: ["variableCastAdditionMs", "variableCastAddMs", "addVariableCastMs", "add_varcast"],
    variableMultiplicative: ["variableCastMultiplicativeReductionRate", "variableCastMultiplierReductionRate", "variableCastMultiplicativeReductionRates"],
    fixedRate: ["fixedCastReductionRate", "fixedCastRateReduction", "fixcastrate"],
    fixedMs: ["fixedCastReductionMs", "fixedCastTimeReductionMs", "fixedCastMsReduction"],
    fixedAddMs: ["fixedCastAdditionMs", "fixedCastAddMs", "addFixedCastMs", "add_fixcast"],
    afterRate: ["afterCastDelayReductionRate", "afterCastActDelayReductionRate", "delayrate"],
    afterMs: ["afterCastDelayReductionMs", "afterCastActDelayReductionMs", "skillDelayReductionMs"],
    afterAddMs: ["afterCastDelayAdditionMs", "afterCastActDelayAdditionMs"],
    cooldownRate: ["cooldownReductionRate", "skillCooldownReductionRate"],
    cooldownMs: ["cooldownReductionMs", "skillCooldownReductionMs"],
    cooldownAddMs: ["cooldownAdditionMs", "skillCooldownAdditionMs"],
    walkRate: ["walkDelayReductionRate", "afterCastWalkDelayReductionRate"],
    walkMs: ["walkDelayReductionMs", "afterCastWalkDelayReductionMs"],
    walkAddMs: ["walkDelayAdditionMs", "afterCastWalkDelayAdditionMs"]
  };
  const skillAliases = {
    variableRate: ["skillVariableCastReductionRate", "skillVariableCastrate", "skillcastrate"],
    variableMs: ["skillVariableCastReductionMs", "skillVariableCastMs", "skillvarcast"],
    fixedRate: ["skillFixedCastReductionRate", "skillFixedCastrate", "skillfixcastrate"],
    fixedMs: ["skillFixedCastReductionMs", "skillFixedCastMs", "skillfixcast"],
    afterMs: ["skillAfterCastDelayReductionMs", "skillDelayReductionMs", "skilldelay"],
    cooldownMs: ["skillCooldownReductionMs", "skillCooldownMs", "skillcooldown"],
    walkMs: ["skillWalkDelayReductionMs"]
  };
  const result = {};
  for (const [group, sources] of Object.entries(groups)) {
    const out = result[group] = {};
    for (const key of Object.keys(aliases)) {
      if (key === "fixedRate") {
        const values = sources.flatMap(src => getRuntimeTimingValues(src, aliases[key]));
        // rAthena pc_bonus(): generic item bFixedCastrate keeps only the
        // strongest reduction. Positive item-script values are ignored rather
        // than becoming a fixed-cast penalty. Status/system penalties remain
        // additive because they are applied after the strongest reduction.
        out.fixedRate = Math.max(0, ...values.filter(v => v > 0));
        out.fixedPenaltyRate = group === "item" ? 0 : values.filter(v => v < 0).reduce((n, v) => n + v, 0);
      } else if (key === "variableMultiplicative") {
        out.variableMultipliers = sources.flatMap(src => getRuntimeTimingValues(src, aliases[key]));
        out.variableMultiplicative = 0;
      } else out[key] = sources.reduce((n, src) => n + getRuntimeTimingScalar(src, aliases[key]), 0);
    }
    for (const [key, names] of Object.entries(skillAliases)) {
      const values = sources.map(src => getRuntimeTimingSkillMapValue(src, names, skillId)).filter(value => Number.isFinite(Number(value)));
      if (key === "fixedRate") {
        // rAthena pc_bonus2(bFixedCastrate): reductions targeting the same
        // skill are accumulated into one per-skill candidate. That candidate
        // then competes with generic/status fixed-cast reductions; they are
        // not added to each other. Non-reduction item values are ignored.
        const targetedCandidate = values.filter(value => Number(value) > 0).reduce((n, value) => n + Number(value), 0);
        out.fixedRate = Math.max(Number(out.fixedRate || 0), targetedCandidate);
      } else {
        out[key] = Number(out[key] || 0) + values.reduce((n, value) => n + Number(value), 0);
      }
    }
  }
  // Skill-specific passive logic that exists in RA source but is not an item/status bonus.
  result.skill.fixedRate = Math.max(Number(result.skill.fixedRate || 0), getWarlockRadiusFixedCastReduction(skill));
  return result;
}

function applyRuntimeVariableMultipliers(time, rate) {
  const normalized = Math.max(-1000, Math.min(100, Number(rate || 0)));
  return Math.max(0, time * (1 - normalized / 100));
}

function getRuntimeAdjustedCastTime(skill, level = 1) {
  const rawVariableMs = Math.max(0, Number(getRaLevelValue(skill?.castTime, level, 0, "Time")));
  const rawFixedMs = Math.max(0, Number(getRaLevelValue(skill?.fixedCastTime, level, 0, "Time")));
  const flags = getRuntimeTimingFlagSet(skill, "castTimeFlags");
  const modifiers = collectRuntimeTimingModifiers(skill, level);
  let variableMs = rawVariableMs;
  let fixedMs = rawFixedMs;
  let additiveVariableRate = 0;
  let strongestFixedRate = 0;
  let variableAddMs = 0;
  let fixedAddMs = 0;
  const variableMultipliers = [];
  let fixedPenaltyRate = 0;

  if (!flags.ignoreItemBonus) {
    additiveVariableRate += Number(modifiers.item.variableRate || 0);
    strongestFixedRate = Math.max(strongestFixedRate, Number(modifiers.item.fixedRate || 0));
    fixedPenaltyRate += Number(modifiers.item.fixedPenaltyRate || 0);
    variableAddMs += Number(modifiers.item.variableAddMs || 0) - Number(modifiers.item.variableMs || 0);
    fixedAddMs += Number(modifiers.item.fixedAddMs || 0) - Number(modifiers.item.fixedMs || 0);
    variableMultipliers.push(...(modifiers.item.variableMultipliers || []));
  }
  if (!flags.ignoreStatus) {
    additiveVariableRate += Number(modifiers.status.variableRate || 0);
    strongestFixedRate = Math.max(strongestFixedRate, Number(modifiers.status.fixedRate || 0));
    fixedPenaltyRate += Number(modifiers.status.fixedPenaltyRate || 0);
    variableAddMs += Number(modifiers.status.variableAddMs || 0) - Number(modifiers.status.variableMs || 0);
    fixedAddMs += Number(modifiers.status.fixedAddMs || 0) - Number(modifiers.status.fixedMs || 0);
    variableMultipliers.push(...(modifiers.status.variableMultipliers || []));
  }
  // Learned passive / project-system modifiers are skill-side effects and are not equipment/status flags.
  additiveVariableRate += Number(modifiers.skill.variableRate || 0);
  strongestFixedRate = Math.max(strongestFixedRate, Number(modifiers.skill.fixedRate || 0));
  fixedPenaltyRate += Number(modifiers.skill.fixedPenaltyRate || 0);
  variableAddMs += Number(modifiers.skill.variableAddMs || 0) - Number(modifiers.skill.variableMs || 0);
  fixedAddMs += Number(modifiers.skill.fixedAddMs || 0) - Number(modifiers.skill.fixedMs || 0);
  variableMultipliers.push(...(modifiers.skill.variableMultipliers || []));

  variableMs = Math.max(0, variableMs + variableAddMs);
  fixedMs = Math.max(0, fixedMs + fixedAddMs);
  for (const rate of variableMultipliers) variableMs = applyRuntimeVariableMultipliers(variableMs, rate);

  let statFactor = 1;
  if (!flags.ignoreDex) {
    const derived = window.RO_WEB_COMBAT_EVAL_CONTEXT?.derivedStats || (typeof calculateDerivedPlayerStats === "function" ? (calculateDerivedPlayerStats() || {}) : {});
    const stats = derived.stats || player?.stats || {};
    const statTotal = Math.max(0, Number(stats.dex || 0) * 2 + Number(stats.int || 0));
    statFactor = Math.max(0, 1 - Math.sqrt(statTotal / 530));
    variableMs *= statFactor;
  }
  const cappedVariableRate = Math.max(-1000, Math.min(100, additiveVariableRate));
  variableMs = Math.max(0, variableMs * (1 - cappedVariableRate / 100));
  const cappedFixedRate = Math.max(-1000, Math.min(100, strongestFixedRate + fixedPenaltyRate));
  fixedMs = Math.max(0, fixedMs * (1 - cappedFixedRate / 100));
  variableMs = Math.floor(variableMs);
  fixedMs = Math.floor(fixedMs);
  return {
    rawVariableMs, rawFixedMs, variableMs, fixedMs, totalMs: variableMs + fixedMs,
    statFactor, variableReductionRate: cappedVariableRate, fixedReductionRate: cappedFixedRate,
    flags, modifiers, source: "rAthena Renewal skill_vfcastfix"
  };
}

const RENEWAL_COMBO_STAT_DELAY_SKILL_IDS = new Set([
  263,  // MO_TRIPLEATTACK
  272,  // MO_CHAINCOMBO
  273,  // MO_COMBOFINISH
  371,  // CH_TIGERFIST
  372,  // CH_CHAINCRUSH
  2326, // SR_DRAGONCOMBO
  2329, // SR_FALLENEMPIRE
  2593  // SJ_PROMINENCEKICK
]);

function getRuntimeBaseAfterCastActDelay(skill, level = 1, options = {}) {
  if (options.ignore === true) {
    return { databaseMs: 0, baseMs: 0, comboStatReductionMs: 0, comboStatRule: false };
  }
  const databaseMs = Math.max(0, Math.floor(getRaLevelValue(skill?.afterCastActDelay, level, 0, "Time")));
  const skillId = Number(skill?.officialId ?? skill?.id ?? 0);
  if (!RENEWAL_COMBO_STAT_DELAY_SKILL_IDS.has(skillId)) {
    return { databaseMs, baseMs: databaseMs, comboStatReductionMs: 0, comboStatRule: false };
  }

  // rAthena skill_delayfix(): these combo skills use 1000ms when the DB delay
  // is zero, then subtract 4*AGI + 2*DEX from final character stats. This is
  // a skill-specific rule and is independent from CastDelayFlags.IgnoreStatus.
  const beforeStats = databaseMs > 0 ? databaseMs : 1000;
  const derived = window.RO_WEB_COMBAT_EVAL_CONTEXT?.derivedStats ||
    (typeof calculateDerivedPlayerStats === "function" ? (calculateDerivedPlayerStats() || {}) : {});
  const stats = derived.stats || player?.stats || {};
  const requestedReduction = Math.max(0, 4 * Number(stats.agi || 0) + 2 * Number(stats.dex || 0));
  const comboStatReductionMs = Math.min(beforeStats, Math.floor(requestedReduction));
  return {
    databaseMs,
    baseMs: Math.max(0, beforeStats - comboStatReductionMs),
    comboStatReductionMs,
    comboStatRule: true
  };
}

// ===== 0.9.82IA：rAthena Renewal skill timing resolver + 140ms active-attack safety floor =====
function getRuntimeSkillTimingProfile(skill, level = 1) {
  const profile = getSkillRuntimeProfile(skill) || {};
  const cast = getRuntimeAdjustedCastTime(skill, level);
  const delayFlags = getRuntimeTimingFlagSet(skill, "castDelayFlags");
  const modifiers = collectRuntimeTimingModifiers(skill, level);
  const ignoreCooldown = profile.ignoreRaCooldown === true;
  const ignoreAfterCast = profile.ignoreRaAfterCastActDelay === true;
  const ignoreWalkDelay = profile.ignoreRaAfterCastWalkDelay === true;
  const rawCooldownMs = ignoreCooldown ? 0 : Math.max(0, Math.floor(getRaLevelValue(skill?.cooldown, level, 0, "Time")));
  const afterCastBase = getRuntimeBaseAfterCastActDelay(skill, level, { ignore: ignoreAfterCast });
  const rawAfterCastMs = Number(afterCastBase.baseMs || 0);
  const explicitWalkDelayMs = ignoreWalkDelay ? 0 : Math.max(0, Math.floor(getRaLevelValue(skill?.afterCastWalkDelay, level, 0, "Time")));

  let afterRate = 0, afterAddMs = 0;
  let cooldownRate = 0, cooldownAddMs = 0;
  let walkRate = 0, walkAddMs = 0;
  if (!delayFlags.ignoreItemBonus) {
    afterRate += Number(modifiers.item.afterRate || 0);
    afterAddMs += Number(modifiers.item.afterAddMs || 0) - Number(modifiers.item.afterMs || 0);
    cooldownRate += Number(modifiers.item.cooldownRate || 0);
    cooldownAddMs += Number(modifiers.item.cooldownAddMs || 0) - Number(modifiers.item.cooldownMs || 0);
    walkRate += Number(modifiers.item.walkRate || 0);
    walkAddMs += Number(modifiers.item.walkAddMs || 0) - Number(modifiers.item.walkMs || 0);
  }
  if (!delayFlags.ignoreStatus) {
    afterRate += Number(modifiers.status.afterRate || 0);
    afterAddMs += Number(modifiers.status.afterAddMs || 0) - Number(modifiers.status.afterMs || 0);
    cooldownRate += Number(modifiers.status.cooldownRate || 0);
    cooldownAddMs += Number(modifiers.status.cooldownAddMs || 0) - Number(modifiers.status.cooldownMs || 0);
    walkRate += Number(modifiers.status.walkRate || 0);
    walkAddMs += Number(modifiers.status.walkAddMs || 0) - Number(modifiers.status.walkMs || 0);
  }
  afterRate += Number(modifiers.skill.afterRate || 0);
  afterAddMs += Number(modifiers.skill.afterAddMs || 0) - Number(modifiers.skill.afterMs || 0);
  cooldownRate += Number(modifiers.skill.cooldownRate || 0);
  cooldownAddMs += Number(modifiers.skill.cooldownAddMs || 0) - Number(modifiers.skill.cooldownMs || 0);
  walkRate += Number(modifiers.skill.walkRate || 0);
  walkAddMs += Number(modifiers.skill.walkAddMs || 0) - Number(modifiers.skill.walkMs || 0);

  const profileElement = getRuntimeEffectValue(profile?.element ?? skill?.element ?? "", level);
  const elementKey = String(profileElement || "").trim().toLowerCase();
  if (!delayFlags.ignoreStatus && elementKey === "wind") afterRate += Math.max(0, Number((typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {})?.windMagicCommonDelayReductionRate || 0));

  afterRate = Math.max(-1000, Math.min(100, afterRate));
  cooldownRate = Math.max(-1000, Math.min(100, cooldownRate));
  walkRate = Math.max(-1000, Math.min(100, walkRate));
  const afterCastActDelayMs = Math.max(0, Math.floor(Math.max(0, rawAfterCastMs + afterAddMs) * (1 - afterRate / 100)));
  const cooldownMs = Math.max(0, Math.floor(Math.max(0, rawCooldownMs + cooldownAddMs) * (1 - cooldownRate / 100)));
  // RA default_walk_delay is applied to active skill completion; DB value is an addition.
  // bNoWalkDelay from equipment/card/combo is a true item-side exemption and
  // therefore applies only when the skill does not explicitly ignore item bonuses.
  const equipmentNoWalkDelay = !delayFlags.ignoreItemBonus && window.EffectRuntime?.hasFlag?.("noWalkDelay", player) === true;
  const baseWalkDelayMs = ignoreWalkDelay || equipmentNoWalkDelay || getRuntimeSkillUiType(skill) === "passive" ? 0 : 300 + explicitWalkDelayMs;
  const afterCastWalkDelayMs = Math.max(0, Math.floor(Math.max(0, baseWalkDelayMs + walkAddMs) * (1 - walkRate / 100)));
  return {
    cast, rawCooldownMs, cooldownMs,
    databaseAfterCastMs: Number(afterCastBase.databaseMs || 0),
    rawAfterCastMs, afterCastActDelayMs,
    comboStatDelayReductionMs: Number(afterCastBase.comboStatReductionMs || 0),
    comboStatDelayRule: afterCastBase.comboStatRule === true,
    explicitWalkDelayMs, afterCastWalkDelayMs, equipmentNoWalkDelay,
    afterCastReductionRate: afterRate, cooldownReductionRate: cooldownRate, walkDelayReductionRate: walkRate,
    castTimeFlags: cast.flags, castDelayFlags: delayFlags, modifiers,
    minSkillDelayLimitMs: 100,
    source: "rAthena Renewal db/re/skill_db.yml + skill.cpp/unit.cpp"
  };
}

function isRuntimePhysicalAttackSkill(skill, profile = null) {
  const runtime = profile || getSkillRuntimeProfile(skill) || {};
  const handler = String(runtime.handler || "").toLowerCase();
  const damageHandler = String(runtime.damageHandler || "").toLowerCase();
  const type = String(skill?.type || "").toLowerCase();
  if (["physical_attack", "physical_attack_size_hits", "physical_attack_formula", "physical_charge", "combo_sequence"].includes(handler)) return true;
  if (damageHandler.includes("physical")) return true;
  if (type === "weapon") return true;
  if (handler === "ground_damage" && (type === "weapon" || damageHandler.includes("physical"))) return true;
  return false;
}

function getRuntimeSkillUiType(skill) {
  if (!skill) return "pending";
  const profile = getSkillRuntimeProfile(skill) || {};
  const handler = String(profile.handler || "").toLowerCase();
  if (!handler || handler === "pending") return "pending";
  // Runtime handler is authoritative. Some imported Skill Core rows still carry
  // legacy skillType/type values that disagree with the executable handler.
  if (handler === "passive") return "passive";
  if (["heal", "heal_fixed"].includes(handler)) return "heal";
  if (handler === "buff") return "buff";
  if ([
    "physical_attack", "physical_attack_size_hits", "physical_attack_formula", "physical_charge",
    "magic_damage", "magic_multihit", "misc_damage", "ground_damage", "chain_magic", "combo_sequence"
  ].includes(handler)) return "attack";
  return "support";
}

function isRuntimeSkillQuickSlotEligible(skill) {
  const type = getRuntimeSkillUiType(skill);
  return type !== "pending" && type !== "passive";
}

function getRuntimeSkillActionMotion(skill, options = {}) {
  const uiType = getRuntimeSkillUiType(skill);
  if (uiType === "passive") return null;
  if (options.toggleOff === true) return null;

  // RO_WEB character-motion contract:
  //   * Every executable damage skill uses the equipped-weapon Attack atlas.
  //   * Buff / heal / debuff / support / performance actions use the weaponless Cast atlas.
  // Runtime handler classification is authoritative. Legacy skill.type === "weapon"
  // must never turn a Buff into a weapon Attack animation.
  if (uiType === "attack") return "attack";
  return "cast";
}

function isAspdLimitedZeroDelayPhysicalSkill(skill, level = 1) {
  const timing = getRuntimeSkillTimingProfile(skill, level);
  return isRuntimePhysicalAttackSkill(skill)
    && Number(timing.cast?.totalMs || 0) <= 0
    && Number(timing.cooldownMs || 0) <= 0
    && Number(timing.afterCastActDelayMs || 0) <= 0;
}

function getRuntimeSkillActionDurationMs(skill, level = 1) {
  if (isRuntimePhysicalAttackSkill(skill) && typeof getPlayerSkillActionLockMs === "function") {
    return Math.max(100, Number(getPlayerSkillActionLockMs() || 360));
  }
  return 0;
}

function playRuntimeSkillActionMotion(skill, level = 1, options = {}) {
  const motion = getRuntimeSkillActionMotion(skill, options);
  if (!motion) return false;
  const requestedDuration = Math.max(0, Number(options.durationMs || options.duration || 0));
  const duration = requestedDuration > 0
    ? requestedDuration
    : (motion === "attack" ? getRuntimeSkillActionDurationMs(skill, level) : 0);
  const castPhase = String(options.castPhase || options.phase || "").trim().toLowerCase();
  if (typeof playROStudioPlayerMotion === "function") {
    const motionOptions = {};
    if (duration > 0) motionOptions.duration = duration;

    // 長讀條技能採兩段式人物動作：
    // 1. 讀條期間只播放前段預備幀一次，之後停在最後一張預備姿勢。
    // 2. 讀條完成／效果結算時，才播放最後 2～3 張攻擊或施法收尾幀。
    if (castPhase === "prepare") {
      motionOptions.frameSegment = "prepare";
      motionOptions.holdSegmentLast = true;
    } else if (castPhase === "release") {
      motionOptions.frameSegment = "release";
      delete motionOptions.duration;
    } else if (motion === "attack" && duration > 0) {
      // 無讀條的攻擊技能維持一套完整 Attack 動作，依 ASPD／動作鎖壓縮。
      motionOptions.compressFrames = true;
    }
    return playROStudioPlayerMotion(motion, motionOptions);
  }
  // 舊圖片 fallback 沒有逐幀能力：讀條期間不重播，僅於結算時播放一次。
  if (motion === "attack" && castPhase !== "prepare" && typeof playPlayerAttackAnimation === "function" && typeof document !== "undefined") {
    playPlayerAttackAnimation(duration > 0 && castPhase !== "release" ? { duration } : {});
    return true;
  }
  return false;
}

function markRuntimeCastAnimationHandoff(skill) {
  if (typeof window === "undefined" || !skill) return;
  window.RO_WEB_CAST_ANIMATION_HANDOFF = {
    skillId: Number(skill.officialId ?? skill.id ?? 0),
    expiresAt: Date.now() + 2000
  };
}

function consumeRuntimeCastAnimationHandoff(skill) {
  if (typeof window === "undefined" || !skill) return false;
  const handoff = window.RO_WEB_CAST_ANIMATION_HANDOFF;
  if (!handoff) return false;
  const matches = Number(handoff.skillId || 0) === Number(skill.officialId ?? skill.id ?? 0)
    && Number(handoff.expiresAt || 0) >= Date.now();
  if (matches) window.RO_WEB_CAST_ANIMATION_HANDOFF = null;
  return matches;
}

function ensureRuntimeSkillTimingState() {
  if (!player) return null;
  player.skillTimingState = player.skillTimingState && typeof player.skillTimingState === "object" ? player.skillTimingState : {};
  const state = player.skillTimingState;
  state.skillCooldownUntil = state.skillCooldownUntil && typeof state.skillCooldownUntil === "object" ? state.skillCooldownUntil : {};
  state.globalDelayUntil = Math.max(0, Number(state.globalDelayUntil || 0));
  state.walkDelayUntil = Math.max(0, Number(state.walkDelayUntil || 0));
  state.actionLockUntil = Math.max(0, Number(state.actionLockUntil || 0));
  state.actionLockType = String(state.actionLockType || "action_lock");
  return state;
}

const RO_WEB_ACTIVE_ATTACK_MIN_INTERVAL_MS = 140;

function isRuntimeActiveAttackSkill(skill, profile = null) {
  const runtime = profile || getSkillRuntimeProfile(skill) || {};
  if (runtime.performanceFloorExempt === true) return false;
  return getRuntimeSkillUiType(skill) === "attack";
}

function getRuntimeSkillPerformanceFloorMs(skill, level = 1) {
  const profile = getSkillRuntimeProfile(skill) || {};
  if (!isRuntimeActiveAttackSkill(skill, profile)) return 0;
  const explicit = Number(getLevelValue(profile.minimumRepeatIntervalMs, level, RO_WEB_ACTIVE_ATTACK_MIN_INTERVAL_MS));
  return Math.max(RO_WEB_ACTIVE_ATTACK_MIN_INTERVAL_MS, Number.isFinite(explicit) ? explicit : RO_WEB_ACTIVE_ATTACK_MIN_INTERVAL_MS);
}

function getRuntimeSkillCastBeginLockProfile(skill, level = 1) {
  const timing = getRuntimeSkillTimingProfile(skill, level);
  const castMs = Math.max(0, Number(timing?.cast?.totalMs || 0));
  const actionMs = Math.max(0, Number(typeof getPlayerSkillActionLockMs === "function" ? getPlayerSkillActionLockMs() : 0));
  const minimumMs = Math.max(0, Number(timing?.minSkillDelayLimitMs || 100));
  const performanceFloorMs = getRuntimeSkillPerformanceFloorMs(skill, level);
  const lockMs = Math.max(minimumMs, castMs, actionMs, performanceFloorMs);
  let type = "action_lock";
  if (lockMs === castMs && castMs > 0) type = "cast";
  else if (lockMs === performanceFloorMs && performanceFloorMs > actionMs) type = "throughput";
  else if (lockMs === actionMs && actionMs > 0) type = "aspd";
  return { lockMs, type, castMs, actionMs, minimumMs, performanceFloorMs, timing };
}

function getRuntimeSkillCastBeginLockMs(skill, level = 1) {
  return getRuntimeSkillCastBeginLockProfile(skill, level).lockMs;
}

function beginRuntimeSkillTiming(skill, level = 1, options = {}) {
  const state = ensureRuntimeSkillTimingState();
  if (!state || !skill || getRuntimeSkillUiType(skill) === "passive") return null;
  const now = Number(options.now || Date.now());
  const skillId = String(skill?.officialId ?? skill?.id ?? 0);
  const lockProfile = getRuntimeSkillCastBeginLockProfile(skill, level);
  const lockMs = lockProfile.lockMs;
  const token = `${skillId}:${now}:${Math.random().toString(36).slice(2)}`;
  state.castBeginTokens = state.castBeginTokens && typeof state.castBeginTokens === "object" ? state.castBeginTokens : {};
  state.castBeginTokens[skillId] = { token, startedAt: now, lockUntil: now + lockMs, lockType: lockProfile.type };
  if (now + lockMs >= Number(state.actionLockUntil || 0)) {
    state.actionLockUntil = now + lockMs;
    state.actionLockType = lockProfile.type;
  }
  // rAthena unit_set_attackdelay(DELAY_EVENT_CASTBEGIN_*): every player skill
  // also pushes normal attackabletime by the current weapon adelay.
  if (typeof markPlayerAttackUsed === "function") markPlayerAttackUsed();
  const timingResult = { token, skillId, startedAt: now, lockMs, lockUntil: now + lockMs };
  // 0.9.82IB / V92：只有 RO_WEB Runtime 仍為可執行主動技能時，才送出特效開始事件。
  // SkillEffectRuntimeV92 會再次檢查 handler/passive/executionEnabled，避免改造被動技能誤播放。
  window.SkillEffectRuntimeV92?.onSkillBegin?.(skill, level, {
    ...options,
    token,
    target: options.target || (typeof currentMonster !== "undefined" ? currentMonster : null)
  });
  return timingResult;
}

function hasRuntimeCastTimingHandoff(skill) {
  const handoff = typeof window !== "undefined" ? window.RO_WEB_CAST_TIMING_HANDOFF : null;
  if (!handoff || Number(handoff.expiresAt || 0) < Date.now()) return false;
  return Number(handoff.skillId || 0) === Number(skill?.officialId ?? skill?.id ?? 0);
}

function consumeRuntimeCastTimingHandoff(skill) {
  if (!hasRuntimeCastTimingHandoff(skill)) return false;
  if (typeof window !== "undefined") window.RO_WEB_CAST_TIMING_HANDOFF = null;
  return true;
}

function getRuntimeSkillDelayBlock(skill, level = 1) {
  const state = ensureRuntimeSkillTimingState();
  if (!state) return null;
  const now = Date.now();
  const skillId = String(skill?.officialId ?? skill?.id ?? 0);
  const cooldownUntil = Math.max(0, Number(state.skillCooldownUntil?.[skillId] || 0));
  if (cooldownUntil > now) return { type: "cooldown", remainingMs: cooldownUntil - now, until: cooldownUntil };
  if (Number(state.globalDelayUntil || 0) > now) return { type: "after_cast", remainingMs: Number(state.globalDelayUntil) - now, until: Number(state.globalDelayUntil) };
  // rAthena Renewal unit_set_castdelay(): every active instant skill has at least
  // min_skill_delay_limit (100ms) of action lock. Zero-delay physical skills use
  // the longer ASPD-derived cast-begin lock instead. This lock is global and
  // therefore blocks every other active skill, not only another physical skill.
  if (Number(state.actionLockUntil || 0) > now && !hasRuntimeCastTimingHandoff(skill)) {
    const remainingMs = Math.max(1, Number(state.actionLockUntil) - now);
    return {
      type: String(state.actionLockType || "action_lock"),
      remainingMs,
      until: Number(state.actionLockUntil)
    };
  }
  return null;
}

function getRuntimeSkillDelayText(block) {
  if (!block) return "";
  const seconds = Math.max(0.01, Number(block.remainingMs || 0) / 1000).toFixed(Number(block.remainingMs || 0) >= 1000 ? 2 : 3);
  if (block.type === "cooldown") return `技能冷卻中，剩餘 ${seconds} 秒`;
  if (block.type === "after_cast") return `技能共通延遲中，剩餘 ${seconds} 秒`;
  if (block.type === "aspd") return `攻擊動作尚未結束，剩餘 ${seconds} 秒`;
  if (block.type === "throughput") return `技能高速施放安全間隔中，剩餘 ${seconds} 秒`;
  if (block.type === "cast") return `技能詠唱動作尚未結束，剩餘 ${seconds} 秒`;
  if (block.type === "action_lock") return `技能動作尚未結束，剩餘 ${seconds} 秒`;
  return `技能暫時無法使用，剩餘 ${seconds} 秒`;
}

function commitRuntimeSkillTiming(skill, level = 1) {
  const state = ensureRuntimeSkillTimingState();
  if (!state || !skill) return null;
  const timing = getRuntimeSkillTimingProfile(skill, level);
  const now = Date.now();
  const skillId = String(skill?.officialId ?? skill?.id ?? 0);
  const hadCastHandoff = consumeRuntimeCastTimingHandoff(skill);
  const existingBegin = state.castBeginTokens?.[skillId] || null;
  if (!hadCastHandoff && !existingBegin && getRuntimeSkillUiType(skill) !== "passive") beginRuntimeSkillTiming(skill, level, { now });
  if (state.castBeginTokens?.[skillId]) delete state.castBeginTokens[skillId];
  if (Number(timing.cooldownMs || 0) > 0) state.skillCooldownUntil[skillId] = Math.max(Number(state.skillCooldownUntil[skillId] || 0), now + Number(timing.cooldownMs));
  if (Number(timing.afterCastActDelayMs || 0) > 0) state.globalDelayUntil = Math.max(Number(state.globalDelayUntil || 0), now + Number(timing.afterCastActDelayMs));
  if (Number(timing.afterCastWalkDelayMs || 0) > 0) state.walkDelayUntil = Math.max(Number(state.walkDelayUntil || 0), now + Number(timing.afterCastWalkDelayMs));
  // 0.9.82IB / V92：成本扣除與技能正式結算時送出 Runtime commit。
  window.SkillEffectRuntimeV92?.onSkillCommit?.(skill, level, {
    target: typeof currentMonster !== "undefined" ? currentMonster : null,
    timing
  });
  return timing;
}

function isRuntimeSkillMovementDelayed() {
  const state = ensureRuntimeSkillTimingState();
  return !!(state && Number(state.walkDelayUntil || 0) > Date.now());
}

function notifyRuntimeSkillMovementDelayed() {
  const state = ensureRuntimeSkillTimingState();
  const remaining = Math.max(0, Number(state?.walkDelayUntil || 0) - Date.now());
  if (remaining <= 0) return;
  const now = Date.now();
  if (now - Number(window.__roWebSkillWalkDelayNoticeAt || 0) < 800) return;
  window.__roWebSkillWalkDelayNoticeAt = now;
  if (typeof addBattleLog === "function") addBattleLog(`技能動作後尚需等待 ${(remaining / 1000).toFixed(2)} 秒才能移動。`);
}

window.getRuntimeSkillTimingProfile = getRuntimeSkillTimingProfile;
window.isRuntimePhysicalAttackSkill = isRuntimePhysicalAttackSkill;
window.getRuntimeSkillUiType = getRuntimeSkillUiType;
window.isRuntimeSkillQuickSlotEligible = isRuntimeSkillQuickSlotEligible;
window.getRuntimeSkillActionMotion = getRuntimeSkillActionMotion;
window.isAspdLimitedZeroDelayPhysicalSkill = isAspdLimitedZeroDelayPhysicalSkill;
window.playRuntimeSkillActionMotion = playRuntimeSkillActionMotion;
window.RO_WEB_ACTIVE_ATTACK_MIN_INTERVAL_MS = RO_WEB_ACTIVE_ATTACK_MIN_INTERVAL_MS;
window.isRuntimeActiveAttackSkill = isRuntimeActiveAttackSkill;
window.getRuntimeSkillPerformanceFloorMs = getRuntimeSkillPerformanceFloorMs;
window.getRuntimeSkillCastBeginLockProfile = getRuntimeSkillCastBeginLockProfile;
window.getRuntimeSkillCastBeginLockMs = getRuntimeSkillCastBeginLockMs;
window.beginRuntimeSkillTiming = beginRuntimeSkillTiming;
window.getRuntimeSkillDelayBlock = getRuntimeSkillDelayBlock;
window.commitRuntimeSkillTiming = commitRuntimeSkillTiming;
window.isRuntimeSkillMovementDelayed = isRuntimeSkillMovementDelayed;
window.notifyRuntimeSkillMovementDelayed = notifyRuntimeSkillMovementDelayed;


function getRuntimeFreeCastLevel() {
  if (typeof getLearnedPassiveRuntimeSkills !== "function" || typeof getSkillLevel !== "function") return 0;
  let result = 0;
  for (const skill of getLearnedPassiveRuntimeSkills()) {
    const profile = getSkillRuntimeProfile(skill);
    if (profile?.handler !== "passive" || profile?.allowsMovementWhileCasting !== true) continue;
    result = Math.max(result, Number(getSkillLevel(skill.id) || 0));
  }
  return result;
}

function canMoveWhileRuntimeCasting() {
  return getRuntimeFreeCastLevel() > 0;
}

function getRuntimeSkillCastState() {
  return (typeof window !== "undefined" && window.RO_WEB_CAST_STATE) ? window.RO_WEB_CAST_STATE : null;
}

function isRuntimeSkillCasting() {
  const state = getRuntimeSkillCastState();
  return !!(state && state.active !== false);
}

function isRuntimeCastingMovementLocked() {
  const state = getRuntimeSkillCastState();
  return !!(state && state.active !== false && state.allowMovement !== true);
}

function notifyRuntimeCastMovementLocked() {
  const now = Date.now();
  if (typeof window !== "undefined" && now - Number(window.__roWebCastMoveNoticeAt || 0) < 1200) return;
  if (typeof window !== "undefined") window.__roWebCastMoveNoticeAt = now;
  if (typeof addBattleLog === "function") addBattleLog("詠唱期間無法移動；學會自由施法後可在綠色讀條期間移動。");
}

function ensureRuntimeSkillCastBar() {
  if (typeof document === "undefined" || typeof document.createElement !== "function") return null;
  const host = document.getElementById("player-sprite") || document.getElementById("battle-field") || document.body;
  if (!host || typeof host.appendChild !== "function") return null;
  let bar = document.getElementById("runtime-skill-cast-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "runtime-skill-cast-bar";
    bar.setAttribute("aria-hidden", "true");
    bar.innerHTML = '<div class="runtime-skill-cast-track"><div class="runtime-skill-cast-fill"></div></div>';
  }
  if (bar.parentElement !== host) host.appendChild(bar);
  return bar;
}

function renderRuntimeSkillCastBar(state, progress = 0) {
  const bar = ensureRuntimeSkillCastBar();
  if (!bar) return;
  const fill = bar.querySelector?.(".runtime-skill-cast-fill");
  if (fill?.style) fill.style.width = `${Math.max(0, Math.min(100, Number(progress || 0) * 100))}%`;
  bar.classList?.add("active");
}

function clearRuntimeSkillCast(reason = "clear") {
  const state = getRuntimeSkillCastState();
  if (state?.timerId !== undefined && state?.timerId !== null) {
    const clear = (typeof window !== "undefined" && typeof window.clearInterval === "function") ? window.clearInterval.bind(window) : (typeof clearInterval === "function" ? clearInterval : null);
    clear?.(state.timerId);
  }
  if (typeof window !== "undefined") window.RO_WEB_CAST_STATE = null;
  const bar = (typeof document !== "undefined") ? document.getElementById?.("runtime-skill-cast-bar") : null;
  bar?.classList?.remove("active");
  const fill = bar?.querySelector?.(".runtime-skill-cast-fill");
  if (fill?.style) fill.style.width = "0%";
  if (player && reason !== "complete" && player.state === "Cast") player.state = "Idle";
}

function beginRuntimeSkillCast(skill, level = 1, onComplete = null) {
  if (!skill || typeof onComplete !== "function") return false;
  if (isRuntimeSkillCasting()) {
    if (typeof addBattleLog === "function") addBattleLog(`${getRuntimeSkillCastState()?.skillName || "技能"}仍在詠唱中。`);
    return false;
  }
  const precheck = typeof canCastSkill === "function"
    ? canCastSkill(skill, level, null, { ignoreCastStateCheck: true })
    : { ok: true };
  if (!precheck.ok) return typeof reportPendingRuntime === "function" ? reportPendingRuntime(skill, precheck.reason) : false;
  const timing = getRuntimeAdjustedCastTime(skill, level);
  if (Number(timing.totalMs || 0) <= 0) { onComplete(); return true; }
  const timingToken = beginRuntimeSkillTiming(skill, level);
  const allowMovement = canMoveWhileRuntimeCasting();
  const startedAt = Date.now();
  const state = {
    active: true,
    skillId: Number(skill.officialId ?? skill.id ?? 0),
    skillName: String(skill.name || "技能"),
    level: Number(level || 1),
    startedAt,
    endsAt: startedAt + Number(timing.totalMs || 0),
    durationMs: Number(timing.totalMs || 0),
    variableMs: Number(timing.variableMs || 0),
    fixedMs: Number(timing.fixedMs || 0),
    allowMovement,
    onComplete,
    timingToken,
    timerId: null
  };
  if (typeof window !== "undefined") window.RO_WEB_CAST_STATE = state;
  if (!allowMovement && player?.position) {
    player.position.targetX = null;
    player.position.targetY = null;
    player.state = "Cast";
  }
  renderRuntimeSkillCastBar(state, 0);
  playRuntimeSkillActionMotion(skill, level, { durationMs: state.durationMs, casting: true, castPhase: "prepare" });
  const tick = () => {
    const current = getRuntimeSkillCastState();
    if (!current || current !== state || current.active === false) return;
    const elapsed = Math.max(0, Date.now() - current.startedAt);
    const progress = current.durationMs > 0 ? Math.min(1, elapsed / current.durationMs) : 1;
    renderRuntimeSkillCastBar(current, progress);
    if (progress < 1) return;
    const callback = current.onComplete;
    current.active = false;
    clearRuntimeSkillCast("complete");
    if (player && player.state === "Cast") player.state = "Idle";
    playRuntimeSkillActionMotion(skill, level, { casting: true, castPhase: "release" });
    markRuntimeCastAnimationHandoff(skill);
    if (typeof window !== "undefined") window.RO_WEB_CAST_TIMING_HANDOFF = {
      skillId: Number(skill.officialId ?? skill.id ?? 0),
      token: current.timingToken?.token || null,
      expiresAt: Date.now() + 2000
    };
    try {
      callback();
    } finally {
      const handoff = typeof window !== "undefined" ? window.RO_WEB_CAST_ANIMATION_HANDOFF : null;
      if (handoff && Number(handoff.skillId || 0) === Number(skill.officialId ?? skill.id ?? 0)) window.RO_WEB_CAST_ANIMATION_HANDOFF = null;
      const timingHandoff = typeof window !== "undefined" ? window.RO_WEB_CAST_TIMING_HANDOFF : null;
      if (timingHandoff && Number(timingHandoff.skillId || 0) === Number(skill.officialId ?? skill.id ?? 0)) window.RO_WEB_CAST_TIMING_HANDOFF = null;
    }
  };
  const set = (typeof window !== "undefined" && typeof window.setInterval === "function") ? window.setInterval.bind(window) : (typeof setInterval === "function" ? setInterval : null);
  state.timerId = set ? set(tick, 25) : null;
  if (!set) tick();
  return true;
}

function getActiveSkillLockState() {
  if (!player) return null;
  if (typeof normalizeActiveBuffs === "function") normalizeActiveBuffs();
  const buffs = Object.values(player.activeBuffs || {});
  for (const buff of buffs) {
    if (Number(buff?.effects?.blocksActiveSkills || 0) <= 0) continue;
    return { buff, name: String(buff?.name || "目前狀態") };
  }
  return null;
}

function isPlayerActiveSkillLocked() {
  return !!getActiveSkillLockState();
}

function getMagicSkillLockState() {
  if (!player) return null;
  if (typeof normalizeActiveBuffs === "function") normalizeActiveBuffs();
  for (const buff of Object.values(player.activeBuffs || {})) {
    if (Number(buff?.effects?.blocksMagicSkills || 0) > 0) return { buff, name: String(buff?.name || "魔力凍結") };
  }
  return null;
}

function isRuntimeMagicSkill(skill, profile = null) {
  const runtime = profile || getSkillRuntimeProfile(skill) || {};
  const handler = String(runtime.damageHandler || runtime.handler || "").toLowerCase();
  const type = String(skill?.type || "").toLowerCase();
  return type === "magic" || ["magic_damage","magic_multihit","chain_magic","ground_damage"].includes(handler) && String(runtime.damageHandler || handler).includes("magic");
}


function getRuntimeResourceDisplayName(type) {
  const labels={spiritSphere:"氣功彈",servantWeapon:"劍體",rollingCutterCharge:"迴旋層數",soulSphere:"靈魂球",elementalSphere:"元素球"};
  return labels[String(type||"")] || "戰鬥資源";
}
function isCopiedSkillResourceWaived(skill, profile=null) {
  const sid=Number(skill?.officialId ?? skill?.id ?? profile?.skillId ?? 0);
  if(!sid)return false;
  if(skill){
    return skill.extraSkill===true&&["plagiarism","reproduce"].includes(String(skill.extraSourceType||skill.sourceType||""));
  }
  if(typeof window.getExtraSkillEntries!=="function")return false;
  return window.getExtraSkillEntries().some(entry=>Number(entry?.skillId)===sid&&["plagiarism","reproduce"].includes(String(entry?.sourceType||"")));
}
function previewRuntimeResourceCost(profile, level = 1, skill = null) {
  const cfg=profile?.resourceCost;
  if(!cfg||!window.CombatResourceManager)return {ok:true,used:0};
  if(isCopiedSkillResourceWaived(skill,profile))return {ok:true,used:0,waived:true,copied:true};
  const sid=Number((skill?.officialId ?? skill?.id ?? profile?.skillId) || 0),active=typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals():{};
  if(cfg.type==="spiritSphere"){
    const waived=(sid===2329&&Number(active.waiveFallenEmpireSphereCost||0)>0)||(sid===2330&&Number(active.waiveTigerCannonSphereCost||0)>0)||(sid===5009&&Number(active.waiveFlashComboSphereCost||0)>0)||(sid===2332&&Number(active.massiveFlameBlaster||0)>0)||(sid===2518&&Number(active.massiveFlameBlaster||0)>0);
    if(waived)return {ok:true,used:0,waived:true};
  }
  const type=String(cfg.type||""),current=Math.max(0,Number(window.CombatResourceManager.get(type)||0));
  let required=Math.max(0,Number(getLevelValue(cfg.amount,level,1)));
  if(cfg.mode==="asura")required=Math.max(5,Number(cfg.minimum||5));
  if(cfg.mode==="up_to")required=Math.max(0,Number(cfg.minimum||0));
  if(current>=required)return {ok:true,type,current,required};
  const label=getRuntimeResourceDisplayName(type);
  return {ok:false,type,current,required,reason:`${label}不足（需要 ${required}，目前 ${current}）`,resourceBlock:{type,current,required,label,retryMs:15000}};
}

function canCastSkill(skill, requestedLevel = null, expectedHandlers = null, options = {}) {
  if (!player || !skill) return { ok: false, reason: "找不到技能" };
  const level = clampSkillLevel(skill, requestedLevel);
  if (level <= 0) return { ok: false, reason: "尚未學會技能" };
  const profile = getSkillRuntimeProfile(skill);
  if (!profile?.handler || profile.handler === "pending") return { ok: false, reason: "此技能 Runtime 尚未完成" };
  if (options.ignoreCastStateCheck !== true && isRuntimeSkillCasting()) {
    return { ok: false, reason: `${getRuntimeSkillCastState()?.skillName || "技能"}仍在詠唱中` };
  }
  if (Array.isArray(expectedHandlers) && !expectedHandlers.includes(profile.handler)) {
    return { ok: false, reason: `Runtime 類型不符：${profile.handler}` };
  }
  if (options.ignoreTimingCheck !== true) {
    const delayBlock = getRuntimeSkillDelayBlock(skill, level);
    if (delayBlock) return { ok: false, reason: getRuntimeSkillDelayText(delayBlock), delayBlock };
  }
  const activeSkillLock = getActiveSkillLockState();
  const normalAttackProc = options?.allowDuringActiveSkillLock === true || options?.triggerSource === "normal_attack_proc";
  const togglingOwnBuffOff = profile.toggleBuff === true && !!(player.activeBuffs?.[skill.id] || player.activeBuffs?.[String(skill.id)]);
  if (activeSkillLock && !normalAttackProc && !togglingOwnBuffOff) {
    return { ok: false, reason: `${activeSkillLock.name}狀態期間無法主動施放其他技能` };
  }
  const magicSkillLock = getMagicSkillLockState();
  if (magicSkillLock && !normalAttackProc && isRuntimeMagicSkill(skill, profile)) {
    return { ok: false, reason: `${magicSkillLock.name}狀態期間無法施放魔法類技能` };
  }
  if (profile.requiresMounted === true && !isPlayerMounted()) return { ok: false, reason: getMountRequiredSkillMessage() };
  if (profile.requiresMountType && (!isPlayerMounted() || String(player?.mountState?.type || "") !== String(profile.requiresMountType))) return { ok: false, reason: getMountRequiredSkillMessage() };
  if (profile.requiresShield === true && !hasEquippedShieldRuntime()) return { ok: false, reason: "必須裝備盾牌" };
  if (profile.requiresActiveVirtualSummon === true) {
    const summon = (typeof getActiveVirtualSummon === "function") ? getActiveVirtualSummon() : window.VirtualSummonManager?.getActive?.();
    const noSummonText = (typeof virtualSummonData !== "undefined" && virtualSummonData?.uiText?.noSummon) || "目前沒有可控制的召喚物";
    if (!summon) return { ok: false, reason: noSummonText };
  }
  if (profile.requiresActiveVirtualSummonFamily) {
    const summon = (typeof getActiveVirtualSummon === "function") ? getActiveVirtualSummon() : window.VirtualSummonManager?.getActive?.();
    const requiredFamily = String(profile.requiresActiveVirtualSummonFamily || "");
    if (!summon || String(summon.family || "") !== requiredFamily) return { ok: false, reason: profile.requiredSummonMessage || `目前沒有 ${requiredFamily} 召喚物` };
  }
  if (profile.requiresFalcon === true && !isFalconActiveRuntime()) return { ok: false, reason: "目前沒有召喚獵鷹" };
  if (profile.requiresFalconOrWarg === true && !isFalconActiveRuntime() && !isWargActiveRuntime()) return { ok: false, reason: "必須召喚獵鷹或狼協助" };
  // 舊資料相容：騎狼術已改為永久被動，舊 requiresFalconOrWargRiding 亦視為狼協助。
  if (profile.requiresFalconOrWargRiding === true && !isFalconActiveRuntime() && !isWargActiveRuntime()) return { ok: false, reason: "必須召喚獵鷹或狼協助" };
  if (profile.requiresWarg === true && !isWargActiveRuntime()) return { ok: false, reason: "目前沒有召喚狼" };
  if (profile.requiresWargRiding === true && !isWargActiveRuntime()) return { ok: false, reason: "目前沒有召喚狼" };
  if (profile.requiresWargOnFoot === true && !isWargActiveRuntime()) return { ok: false, reason: "目前沒有召喚狼" };
  if (profile.requiredSelfBuffEffect) {
    const active = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
    if (Number(active[profile.requiredSelfBuffEffect] || 0) <= 0) return { ok: false, reason: profile.requiredSelfBuffMessage || `缺少 ${profile.requiredSelfBuffEffect} 狀態` };
  }
  // RO_WEB: ignore Hiding/combo/stance activation prerequisites; preserve combat result only.
  if (Array.isArray(profile.weaponTypes) && profile.weaponTypes.length > 0) {
    const wt = getEquippedWeaponTypeRuntime();
    if (!matchesAnyRuntimeWeaponType(wt, profile.weaponTypes)) return { ok: false, reason: "目前武器類型不符合技能需求" };
  }
  const spCost = getRuntimeSkillSpCost(skill, level);
  const hpCost = Math.max(0, Number(getLevelValue(profile.hpCost, level, 0)));
  const zenyCost = getRuntimeSkillZenyCost(skill, level);
  if (options.ignoreSpCostCheck !== true && Number(player.sp || 0) < spCost) return { ok: false, reason: "SP 不足" };
  if (hpCost > 0 && Number(player.hp || 0) <= hpCost) return { ok: false, reason: "HP 不足" };
  if (Number(player.zeny || 0) < zenyCost) return { ok: false, reason: `Zeny 不足，需要 ${zenyCost} Zeny` };
  if(options.ignoreResourceCostCheck!==true){
    const resourceCheck=previewRuntimeResourceCost(profile,level,skill);
    if(!resourceCheck.ok)return {ok:false,level,spCost,hpCost,zenyCost,profile,reason:resourceCheck.reason,resourceBlock:resourceCheck.resourceBlock};
  }
  return { ok: true, level, spCost, hpCost, zenyCost, profile };
}

function consumeMemorizeChargeOnMagicCast(skill) {
  if (!player || !skill || Number(skill?.officialId ?? skill?.id) === 403) return false;
  const profile = getSkillRuntimeProfile(skill) || {};
  if (!isRuntimeMagicSkill(skill, profile)) return false;
  normalizeActiveBuffs();
  const entry = Object.entries(player.activeBuffs || {}).find(([, buff]) => Number(buff?.effects?.memorizeCastReduction || 0) > 0);
  if (!entry) return false;
  const [buffId, buff] = entry;
  buff.remainingCasts = Math.max(0, Number(buff.remainingCasts ?? buff.effects?.memorizeCastLimit ?? 5) - 1);
  if (typeof addBattleLog === "function") addBattleLog(`速讀術剩餘 ${buff.remainingCasts} 次魔法施放。`);
  if (buff.remainingCasts <= 0) delete player.activeBuffs[buffId];
  return true;
}

function paySkillCost(skill, level, options = {}) {
  // 0.9.82GJ：一般技能施放不會清除武器／鎧甲臨時屬性。
  // 只有新的同槽屬性附加會覆蓋，或更換／卸下對應裝備時解除。
  const spCost = getRuntimeSkillSpCost(skill, level);
  const profile = getSkillRuntimeProfile(skill) || {};
  const hpCost = Math.max(0, Number(getLevelValue(profile.hpCost, level, 0)));
  const zenyCost = getRuntimeSkillZenyCost(skill, level);
  player.sp = Math.max(0, Number(player.sp || 0) - spCost);
  if (hpCost > 0) player.hp = Math.max(1, Number(player.hp || 1) - hpCost);
  if (zenyCost > 0) player.zeny = Math.max(0, Number(player.zeny || 0) - zenyCost);
  consumeMemorizeChargeOnMagicCast(skill);
  commitRuntimeSkillTiming(skill, level);
  window.CardRuntime?.onSkillUsed?.(skill, typeof currentMonster!=="undefined" ? currentMonster : null);
  const animationAlreadyPlayed = consumeRuntimeCastAnimationHandoff(skill);
  if (options.skipAnimation !== true && !animationAlreadyPlayed) playRuntimeSkillActionMotion(skill, level, options);
  return spCost;
}

function reportPendingRuntime(skill, reason = null) {
  const text = reason || getSkillRuntimeStatusText(skill);
  const mountMessage = getMountRequiredSkillMessage();
  const timingBlock = /冷卻中|共通延遲中|攻擊動作尚未結束|技能動作尚未結束|技能高速施放安全間隔中|技能詠唱動作尚未結束/.test(String(text));
  if (typeof addBattleLog === "function") {
    if (text === mountMessage) addBattleLog(mountMessage, "error");
    else addBattleLog(`${skill?.name || "技能"}：${text}${/[。！？!?]$/.test(String(text)) ? "" : "。"}`);
  }
  if (!timingBlock) console.warn("[Skill Runtime Pending]", skill?.officialId ?? skill?.id, skill?.name, text);
  return false;
}


function isFalconActiveRuntime() {
  return !!(player && (player.hasFalcon === true || player.falconEquipped === true || player.falconActive === true));
}

function setFalconActiveRuntime(active) {
  if (!player) return false;
  const enabled = active === true;
  player.hasFalcon = enabled;
  player.falconEquipped = enabled;
  player.falconActive = enabled;
  if (typeof saveGame === "function") saveGame();
  if (typeof updatePlayerUI === "function") updatePlayerUI();
  if (typeof updateVirtualSummonUI === "function") updateVirtualSummonUI(true);
  return enabled;
}

function castFalconToggleSkill(skill, requestedLevel = null) {
  const check = canCastSkill(skill, requestedLevel, ["falcon_toggle"]);
  if (!check.ok) return reportPendingRuntime(skill, check.reason);
  const enabling = !isFalconActiveRuntime();
  paySkillCost(skill, check.level, { skipAnimation: !enabling, toggleOff: !enabling });
  // RO_WEB：狼與獵鷹皆為協助召喚物，可同時存在。
  const enabled = setFalconActiveRuntime(enabling);
  if (typeof addBattleLog === "function") addBattleLog(enabled ? `${skill.name}：獵鷹已加入協助。` : `${skill.name}：獵鷹已收回。`);
  return true;
}

function getFalconDamageBaseRuntime(skillLevel = 1) {
  const derived = window.RO_WEB_COMBAT_EVAL_CONTEXT?.derivedStats || (typeof calculateDerivedPlayerStats === "function" ? calculateDerivedPlayerStats() : null);
  const agi = Math.max(0, Number(derived?.stats?.agi ?? player?.stats?.agi ?? 1));
  const dex = Math.max(0, Number(derived?.stats?.dex ?? player?.stats?.dex ?? 1));
  const passive = typeof getPassiveSkillBonusTotals === "function" ? getPassiveSkillBonusTotals() : {};
  const steelCrowFlat = Math.max(0, Number(passive.falconDamageFlat ?? ((typeof getSkillLevel === "function" ? getSkillLevel(128) : 0) * 6) ?? 0));
  return Math.max(1, Math.floor(Number(skillLevel || 1) * 20 + steelCrowFlat + Math.floor(agi / 2) * 2 + Math.floor(dex / 10) * 2));
}

function getFalconAutoBlitzLevelRuntime() {
  const learned = Math.max(0, Number(typeof getSkillLevel === "function" ? getSkillLevel(129) || 0 : 0));
  if (learned <= 0) return 0;
  const jobKey = String(player?.jobKey || "").toLowerCase();
  const rangerBranch = ["ranger", "windhawk", "wind_hawk"].some(token => jobKey.includes(token));
  const jobBased = rangerBranch ? 5 : Math.max(1, Math.floor((Number(player?.jobLevel || 1) + 9) / 10));
  return Math.min(learned, jobBased);
}

function tryFalconAutoAttackOnNormal(target = currentMonster) {
  if (!player || !target || Number(target.currentHp || 0) <= 0 || !isFalconActiveRuntime()) return false;
  const weaponType = String(typeof getEquippedWeaponTypeRuntime === "function" ? getEquippedWeaponTypeRuntime() : player?.weaponType || "").toLowerCase();
  if (!weaponType.includes("bow")) return false;
  const level = getFalconAutoBlitzLevelRuntime();
  if (level <= 0) return false;
  const derived = typeof calculateDerivedPlayerStats === "function" ? calculateDerivedPlayerStats() : null;
  const luk = Math.max(0, Number(derived?.stats?.luk ?? player?.stats?.luk ?? 0));
  const threshold = Math.max(0, Math.min(999, Math.floor(luk * 10 / 3) + 1));
  if (Math.floor(Math.random() * 1000) > threshold) return false;
  const skill = typeof getSkillDataById === "function" ? getSkillDataById(129, true) : skillsData?.skillIndex?.["129"];
  const profile = getSkillRuntimeProfile(129);
  if (!skill || !profile) return false;
  const targets = resolveRuntimeSkillTargets(profile, target, level);
  let total = 0;
  for (const monster of targets) {
    if (!monster || Number(monster.currentHp || 0) <= 0) continue;
    const damage = calculateSkillAttackDamage(skill, level, monster, { skipHitCheck: true, autoFalcon: true });
    if (damage === null) continue;
    const result = applyRuntimeCalculatedDamage(monster, Math.max(1, Number(damage || 1)), { triggeredByNormalAttack:true, skillId:129, hitCount:getRuntimeHitCount(skill, level) });
    total += result.calculatedDamage;
  }
  if (total > 0 && typeof addBattleLog === "function") addBattleLog(`獵鷹自動觸發 ${skill.name} Lv${level}，共造成 ${total} 點傷害。`);
  if (typeof updateMonsterUI === "function") updateMonsterUI();
  return total > 0;
}

function tryHawkRushAutoAttackOnNormal(target = currentMonster) {
  if (!player || !target || Number(target.currentHp || 0) <= 0 || !isFalconActiveRuntime()) return false;
  const weaponType = String(typeof getEquippedWeaponTypeRuntime === "function" ? getEquippedWeaponTypeRuntime() : player?.weaponType || "").toLowerCase();
  if (!weaponType.includes("bow")) return false;
  const level = Math.max(0, Number(typeof getSkillLevel === "function" ? getSkillLevel(5326) || 0 : 0));
  if (level <= 0) return false;
  const derived = typeof calculateDerivedPlayerStats === "function" ? calculateDerivedPlayerStats() : null;
  const con = Math.max(0, Number(derived?.stats?.con ?? player?.stats?.con ?? 0));
  const natureLevel = Math.max(0, Number(typeof getSkillLevel === "function" ? getSkillLevel(5325) || 0 : 0));
  let threshold = Math.floor(con * 10 / 3) + 1;
  threshold += Math.floor(threshold * 20 * natureLevel / 100);
  threshold = Math.max(0, Math.min(999, threshold));
  if (Math.floor(Math.random() * 1000) > threshold) return false;
  const skill = typeof getSkillDataById === "function" ? getSkillDataById(5326, true) : skillsData?.skillIndex?.["5326"];
  if (!skill) return false;
  const damage = calculateSkillAttackDamage(skill, level, target, { skipHitCheck:true, autoHawk:true });
  if (damage === null) return false;
  const calculatedDamage=Math.max(1,Number(damage||1));
  applyRuntimeCalculatedDamage(target,calculatedDamage,{triggeredByNormalAttack:true,skillId:Number(skill?.officialId??skill?.id)});
  if (typeof addBattleLog === "function") addBattleLog(`${skill.name}自動發動，造成 ${calculatedDamage} 點傷害。`);
  if (typeof updateMonsterUI === "function") updateMonsterUI();
  return true;
}

function tryWindSignApGainOnNormalAttack(target = currentMonster) {
  if (!player || !target || !window.StatusManager?.has(target, "wind_sign")) return false;
  const weaponType = String(typeof getEquippedWeaponTypeRuntime === "function" ? getEquippedWeaponTypeRuntime() : player?.weaponType || "").toLowerCase();
  if (!weaponType.includes("bow")) return false;
  const key = window.StatusManager.normalize("wind_sign");
  const state = target?.runtimeState?.statuses?.[key];
  const chance = Math.max(0, Math.min(100, Number(state?.effects?.windSignApChance || 0)));
  if (chance <= 0 || Math.random() * 100 >= chance) return false;
  player.maxAp = Math.max(1, Number(player.maxAp || 200));
  player.ap = Math.min(player.maxAp, Math.max(0, Number(player.ap || 0)) + 1);
  window.lastWindSignApGain = { skillId: 5324, amount: 1, chance, target };
  if (typeof addBattleLog === "function") addBattleLog(`風之標記觸發，AP +1（${player.ap}/${player.maxAp}）。`);
  return true;
}

function revealHiddenMonstersAroundOriginRuntime(origin, radiusCells = 3) {
  const radius = Math.max(0, Number(radiusCells || 0));
  const hiddenTokens = ["hide", "hidden", "hiding", "cloak", "cloaking", "camouflage", "invisible", "invisibility", "stealth"];
  let revealed = 0;
  for (const monster of getRuntimeMonsterCandidates()) {
    if (!monster || !window.AreaShapeResolver?.inRange(origin, monster, "circle", radius)) continue;
    monster.runtimeState = monster.runtimeState || {};
    const statuses = monster.runtimeState.statuses || {};
    let changed = false;
    for (const [key, state] of Object.entries(statuses)) {
      const labels = [key, state?.name, state?.tag, ...(state?.tags || [])].filter(Boolean).map(v => String(v).toLowerCase().replace(/[ _-]/g, ""));
      if (labels.some(label => hiddenTokens.some(token => label.includes(token)))) { delete statuses[key]; changed = true; }
    }
    for (const token of hiddenTokens) if (monster.runtimeState[token] !== undefined) { delete monster.runtimeState[token]; changed = true; }
    if (monster.hidden === true || monster.isHidden === true || monster.visible === false) changed = true;
    monster.hidden = false; monster.isHidden = false; monster.visible = true; monster.revealedUntil = Date.now() + 10000;
    if (changed) revealed++;
  }
  return revealed;
}

const HUNTER_TRAP_RUNTIME_IDS = new Set([115,116,117,118,119,120,121,122,123,125,2238,2239,2249,2250,2251,2252,2253,2254,5331,5332,5333,5335]);

function castFalconDetectSkill(skill, requestedLevel = null) {
  const check = canCastSkill(skill, requestedLevel, ["falcon_detect"]);
  if (!check.ok) return reportPendingRuntime(skill, check.reason);
  if (!currentMonster) return false;
  const { level, profile } = check;
  const skillRange = typeof getSkillRangePx === "function" ? getSkillRangePx(skill, level) : null;
  if (typeof canAttackMonsterByRange === "function" && !canAttackMonsterByRange(currentMonster, skillRange)) {
    if (typeof movePlayerTowardMonster === "function") movePlayerTowardMonster(currentMonster, skillRange);
    if (typeof addBattleLog === "function") addBattleLog(`${skill.name} 距離不足，正在靠近目標。`);
    return false;
  }
  paySkillCost(skill, level);
  const radius = Math.max(0, Number(getLevelValue(profile.detectRadiusCells, level, 3)));
  const revealedMonsters = revealHiddenMonstersAroundOriginRuntime(currentMonster, radius);
  let revealedTraps = 0;
  if (window.GroundEffectManager?.effects) {
    for (const effect of window.GroundEffectManager.effects.values()) {
      if (!HUNTER_TRAP_RUNTIME_IDS.has(Number(effect.sourceSkillId || 0))) continue;
      if (!window.AreaShapeResolver?.inRange(currentMonster, effect, "circle", radius)) continue;
      if (effect.revealed !== true) revealedTraps++;
      effect.revealed = true; effect.revealedUntil = Date.now() + 10000;
    }
  }
  if (typeof addBattleLog === "function") addBattleLog(`${skill.name}：揭露 ${revealedMonsters} 隻隱匿怪物與 ${revealedTraps} 個陷阱。`);
  if (typeof updateMonsterUI === "function") updateMonsterUI();
  if (typeof updatePlayerUI === "function") updatePlayerUI();
  if (typeof saveGame === "function") saveGame();
  return true;
}

function castFalconSpringTrapSkill(skill, requestedLevel = null) {
  const check = canCastSkill(skill, requestedLevel, ["falcon_spring_trap"]);
  if (!check.ok) return reportPendingRuntime(skill, check.reason);
  if (!currentMonster || !window.GroundEffectManager?.effects) return false;
  const { level, profile } = check;
  const skillRange = typeof getSkillRangePx === "function" ? getSkillRangePx(skill, level) : null;
  if (typeof canAttackMonsterByRange === "function" && !canAttackMonsterByRange(currentMonster, skillRange)) {
    if (typeof movePlayerTowardMonster === "function") movePlayerTowardMonster(currentMonster, skillRange);
    if (typeof addBattleLog === "function") addBattleLog(`${skill.name} 距離不足，正在靠近目標。`);
    return false;
  }
  const radius = Math.max(0, Number(getLevelValue(profile.springRadiusCells, level, 1)));
  const maxTraps = Math.max(1, Number(getLevelValue(profile.maxTraps, level, 1)));
  const candidates = [...window.GroundEffectManager.effects.entries()]
    .filter(([,effect]) => HUNTER_TRAP_RUNTIME_IDS.has(Number(effect.sourceSkillId || 0)) && window.AreaShapeResolver?.inRange(currentMonster, effect, "circle", radius))
    .slice(0, maxTraps);
  if (!candidates.length) {
    if (typeof addBattleLog === "function") addBattleLog(`${skill.name}：目標位置附近沒有可爆破的獵人陷阱。`);
    return false;
  }
  paySkillCost(skill, level);
  for (const [id] of candidates) window.GroundEffectManager.remove(id);
  if (typeof addBattleLog === "function") addBattleLog(`${skill.name}：使 ${candidates.length} 個陷阱失效。`);
  if (typeof updatePlayerUI === "function") updatePlayerUI();
  if (typeof saveGame === "function") saveGame();
  return true;
}


function triggerRuntimeTrapEffectNow(effectId, effect) {
  if (!effect || typeof effect.onTick !== "function" || !window.GroundEffectManager) return false;
  const trapOptions={shape:effect.shape||"circle",rangeCells:Number(effect.rangeCells||0),maxTargets:999};
  const candidates = typeof getRuntimeCombatCandidates === "function" ? getRuntimeCombatCandidates({bounds:getRuntimeTargetingBounds(effect,trapOptions),ignoreContext:true}) : [currentMonster].filter(Boolean);
  const targets = window.TargetingResolver?.collect(effect, candidates, trapOptions) || candidates;
  effect.onTick(targets, effect);
  window.GroundEffectManager.remove(effectId);
  return true;
}

function castTrapDetonatorSkill(skill, requestedLevel = null) {
  const check = canCastSkill(skill, requestedLevel, ["trap_detonator"]);
  if (!check.ok) return reportPendingRuntime(skill, check.reason);
  if (!currentMonster || !window.GroundEffectManager?.effects) return false;
  const { level, profile } = check;
  const skillRange = typeof getSkillRangePx === "function" ? getSkillRangePx(skill, level) : null;
  if (typeof canAttackMonsterByRange === "function" && !canAttackMonsterByRange(currentMonster, skillRange)) {
    if (typeof movePlayerTowardMonster === "function") movePlayerTowardMonster(currentMonster, skillRange);
    if (typeof addBattleLog === "function") addBattleLog(`${skill.name} 距離不足，正在靠近目標。`);
    return false;
  }
  const radius = Math.max(0, Number(getLevelValue(profile.detonationRadiusCells, level, 3)));
  const maxTraps = Math.max(1, Number(getLevelValue(profile.maxTraps, level, 999)));
  const traps = [...window.GroundEffectManager.effects.entries()]
    .filter(([,effect]) => HUNTER_TRAP_RUNTIME_IDS.has(Number(effect.sourceSkillId || 0)) && window.AreaShapeResolver?.inRange(currentMonster, effect, "circle", radius))
    .slice(0,maxTraps);
  if (!traps.length) {
    if (typeof addBattleLog === "function") addBattleLog(`${skill.name}：目標位置附近沒有可引爆的陷阱。`);
    return false;
  }
  paySkillCost(skill, level);
  let triggered = 0;
  for (const [id,effect] of traps) if (triggerRuntimeTrapEffectNow(id,effect)) triggered++;
  if (typeof addBattleLog === "function") addBattleLog(`${skill.name}：引爆 ${triggered} 個陷阱。`);
  if (typeof updateMonsterUI === "function") updateMonsterUI();
  if (typeof updatePlayerUI === "function") updatePlayerUI();
  if (typeof saveGame === "function") saveGame();
  return triggered > 0;
}

function breakCamouflageRuntime(options = {}) {
  if (!player?.activeBuffs) return false;
  const entry = Object.entries(player.activeBuffs).find(([,buff]) => Number(buff?.effects?.camouflageLevel || 0) > 0);
  if (!entry) return false;
  delete player.activeBuffs[entry[0]];
  if (typeof recalculatePlayerStats === "function") recalculatePlayerStats();
  if (!options.silent && typeof addBattleLog === "function") addBattleLog(`${entry[1]?.name || "偽裝戰術"}已解除。`);
  return true;
}
window.breakCamouflageRuntime = breakCamouflageRuntime;


function isWargActiveRuntime() {
  return !!(player && (player.hasWarg === true || player.wargActive === true));
}

function isWargRidingRuntime() {
  // 0.9.82DG：2241 騎狼術已改為永久被動，不再存在騎乘狀態。
  return false;
}

function setWargRidingRuntime() {
  // 舊存檔／舊呼叫相容：只負責清除已退役的騎乘狀態與 Buff。
  if (!player) return false;
  player.wargRiding = false;
  player.activeBuffs = player.activeBuffs || {};
  delete player.activeBuffs.warg_rider_runtime;
  delete player.activeBuffs["2241"];
  if (typeof recalculatePlayerStats === "function") recalculatePlayerStats();
  if (player.position && typeof getPlayerMovePixelsPerSecond === "function") player.position.moveSpeed = getPlayerMovePixelsPerSecond();
  return false;
}

function setWargActiveRuntime(active) {
  if (!player) return false;
  const enabled = active === true;
  player.hasWarg = enabled;
  player.wargActive = enabled;
  if (!enabled) setWargRidingRuntime(false);
  if (typeof saveGame === "function") saveGame();
  if (typeof updatePlayerUI === "function") updatePlayerUI();
  if (typeof updateVirtualSummonUI === "function") updateVirtualSummonUI(true);
  return enabled;
}

function castWargToggleSkill(skill, requestedLevel = null) {
  const check = canCastSkill(skill, requestedLevel, ["warg_toggle"]);
  if (!check.ok) return reportPendingRuntime(skill, check.reason);
  const enabling = !isWargActiveRuntime();
  paySkillCost(skill, check.level, { skipAnimation: !enabling, toggleOff: !enabling });
  // RO_WEB：狼與獵鷹皆為協助召喚物，可同時存在。
  const enabled = setWargActiveRuntime(enabling);
  if (typeof addBattleLog === "function") addBattleLog(enabled ? `${skill.name}：協助狀態已啟用。` : `${skill.name}：協助狀態已解除。`);
  return true;
}

function castWargRideToggleSkill(skill) {
  // 0.9.82DG legacy endpoint：技能已是永久被動，不可主動施放。
  setWargRidingRuntime(false);
  if (typeof addBattleLog === "function") addBattleLog(`${skill?.name || "騎狼術"}已改為永久被動，無需施放。`);
  return false;
}

function tryWargAutoStrikeOnNormal(target = currentMonster) {
  if (!player || !target || Number(target.currentHp || 0) <= 0 || !isWargActiveRuntime()) return false;
  const level = Math.max(0, Number(typeof getSkillLevel === "function" ? getSkillLevel(2243) || 0 : 0));
  if (level <= 0) return false;
  const derived = typeof calculateDerivedPlayerStats === "function" ? calculateDerivedPlayerStats() : null;
  const luk = Math.max(0, Number(derived?.stats?.luk ?? player?.stats?.luk ?? 0));
  const threshold = Math.max(0, Math.min(999, Math.floor(luk * 10 / 3) + 1));
  if (Math.floor(Math.random() * 1000) > threshold) return false;
  const skill = typeof getSkillDataById === "function" ? getSkillDataById(2243, true) : skillsData?.skillIndex?.["2243"];
  if (!skill) return false;
  const damage = calculateSkillAttackDamage(skill, level, target, { skipHitCheck:true, autoWarg:true });
  if (damage === null) return false;
  const calculatedDamage=Math.max(1,Number(damage||1));
  applyRuntimeCalculatedDamage(target,calculatedDamage,{triggeredByNormalAttack:true,skillId:Number(skill?.officialId??skill?.id)});
  if (typeof addBattleLog === "function") addBattleLog(`${skill.name}自動發動，造成 ${calculatedDamage} 點傷害。`);
  if (typeof updateMonsterUI === "function") updateMonsterUI();
  return true;
}

function isRuntimeMonsterHidden(monster) {
  if (!monster) return false;
  if (monster.hidden === true || monster.isHidden === true || monster.visible === false) return true;
  const tokens=["hide","hidden","hiding","cloak","cloaking","camouflage","invisible","invisibility","stealth"];
  const statuses=monster?.runtimeState?.statuses||{};
  return Object.entries(statuses).some(([key,state])=>[key,state?.name,state?.tag,...(state?.tags||[])].filter(Boolean).map(v=>String(v).toLowerCase().replace(/[ _-]/g,"")).some(label=>tokens.some(token=>label.includes(token))));
}

function castWargSensitiveKeenSkill(skill, requestedLevel = null) {
  const check = canCastSkill(skill, requestedLevel, ["warg_sensitive_keen"]);
  if (!check.ok) return reportPendingRuntime(skill, check.reason);
  const { level, profile } = check;
  paySkillCost(skill, level);
  const radius = Math.max(1, Number(getLevelValue(profile.detectRadiusCells, level, 3)));
  const candidates = getRuntimeMonsterCandidates().filter(monster => monster && Number(monster.currentHp||0)>0 && window.AreaShapeResolver?.inRange(player, monster, "circle", radius));
  const hidden = candidates.filter(isRuntimeMonsterHidden);
  let totalDamage=0, biteCount=0;
  for (const monster of hidden) {
    revealHiddenMonstersAroundOriginRuntime(monster, 0);
    const damage=calculateSkillAttackDamage({ ...skill, runtimeProfile:{...profile,handler:"physical_attack_formula"} },level,monster,{skipHitCheck:true});
    if (damage !== null) {
      const calculatedDamage=Math.max(1,Number(damage||1));
      applyRuntimeCalculatedDamage(monster,calculatedDamage,{skillId:Number(skill?.officialId??skill?.id)});totalDamage+=calculatedDamage;
    }
    const biteLv=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(2244)||0:0));
    const biteChance=Math.max(0,Math.min(100,Number(getLevelValue(profile.biteProcChancePercent,level,0))));
    if(biteLv>0&&Number(monster.currentHp||0)>0&&Math.random()*100<biteChance){
      const biteSkill=typeof getSkillDataById==="function"?getSkillDataById(2244,true):null;
      const biteProfile=getSkillRuntimeProfile(2244);
      if(biteSkill&&biteProfile){const extra=calculateSkillAttackDamage(biteSkill,biteLv,monster,{skipHitCheck:true,sensitiveKeenProc:true});if(extra!==null){const calculatedDamage=Math.max(1,Number(extra||1));applyRuntimeCalculatedDamage(monster,calculatedDamage,{skillId:Number(biteSkill?.officialId??biteSkill?.id)});totalDamage+=calculatedDamage;applyAttackRuntimeStatus(biteProfile,biteLv,monster);biteCount++;}}
    }
  }
  let removed=0;
  if(window.GroundEffectManager?.effects){for(const [id,effect] of [...window.GroundEffectManager.effects.entries()]){if(HUNTER_TRAP_RUNTIME_IDS.has(Number(effect.sourceSkillId||0))&&window.AreaShapeResolver?.inRange(player,effect,"circle",radius)){window.GroundEffectManager.remove(id);removed++;}}}
  if(typeof addBattleLog==="function")addBattleLog(`${skill.name}：發現 ${hidden.length} 隻隱匿目標，造成 ${totalDamage} 點傷害，追加攻擊 ${biteCount} 次，移除 ${removed} 個陷阱。`);
  if(typeof updateMonsterUI==="function")updateMonsterUI();
  if(typeof updatePlayerUI==="function")updatePlayerUI();
  if(typeof saveGame==="function")saveGame();
  return true;
}

function getSkillsByType(skillType) {
  const merged = [...getCurrentJobSkills(), ...(typeof getExtraSkillSkillList === "function" ? getExtraSkillSkillList() : [])];
  const seen = new Set();
  const expected = String(skillType || "").toLowerCase();
  return merged.filter(skill => {
    const id = String(skill.officialId ?? skill.id);
    const runtimeType = getRuntimeSkillUiType(skill);
    if (seen.has(id) || runtimeType !== expected) return false;
    seen.add(id); return true;
  });
}

function getLearnedSkillsByType(skillType) {
  return getSkillsByType(skillType).filter(skill => getSkillLevel(skill.id) > 0);
}

function getDualWieldHandRateTotals() {
  const rates = { right: 100, left: 100, active: false };
  if (!player || typeof getCurrentJobSkills !== "function") return rates;
  getCurrentJobSkills().forEach(skill => {
    const profile = getSkillRuntimeProfile(skill);
    if (!profile?.dualWieldHand) return;
    rates.active = true;
    const level = Math.max(0, Number(getSkillLevel(skill.id) || 0));
    const rate = Number(profile.dualWieldBaseRate || 100) + Number(profile.dualWieldRatePerLevel || 0) * level;
    if (profile.dualWieldHand === "right") rates.right = rate;
    if (profile.dualWieldHand === "left") rates.left = rate;
  });
  return rates;
}

function isRuntimePassiveSkill(skill) {
  if (!skill) return false;
  const profile = typeof getSkillRuntimeProfile === "function" ? getSkillRuntimeProfile(skill) : null;
  return String(profile?.handler || "").toLowerCase() === "passive";
}
window.isRuntimePassiveSkill = isRuntimePassiveSkill;

function getLearnedPassiveRuntimeSkills() {
  const candidates = [];
  if (typeof getCurrentJobSkills === "function") candidates.push(...(getCurrentJobSkills() || []));
  if (typeof getExtraSkillSkillList === "function") candidates.push(...(getExtraSkillSkillList() || []));

  const learned = (typeof player !== "undefined" && player?.learnedSkills) ? player.learnedSkills : {};
  const index = (typeof skillsData !== "undefined" && skillsData?.skillIndex) ? skillsData.skillIndex : {};
  const indexedSkills = Object.values(index || {});
  Object.keys(learned).forEach(storageKey => {
    let skill = index[String(storageKey)] || null;
    if (!skill) skill = indexedSkills.find(row => String(row?.officialId ?? row?.id) === String(storageKey) || String(row?.key || row?.code || "") === String(storageKey)) || null;
    if (!skill && typeof getSkillDataById === "function") skill = getSkillDataById(storageKey, true);
    if (skill) candidates.push(skill);
  });

  const seen = new Set();
  return candidates.filter(skill => {
    const id = String(skill?.officialId ?? skill?.id ?? skill?.key ?? "");
    if (!id || seen.has(id) || !isRuntimePassiveSkill(skill)) return false;
    seen.add(id);
    return typeof getSkillLevel !== "function" || Number(getSkillLevel(skill.id) || 0) > 0;
  });
}

function getPassiveSkillBonusTotals() {
  const totals = {};
  if (!player || !player.learnedSkills) return totals;
  getLearnedPassiveRuntimeSkills().forEach(skill => {
    if (!isRuntimePassiveSkill(skill)) return;
    if ((typeof isSkillBasic === "function" && isSkillBasic(skill)) || Number(skill.officialId ?? skill.id) === 1) return;
    const level = getSkillLevel(skill.id);
    if (level <= 0) return;
    const profile = getSkillRuntimeProfile(skill);
    if (profile?.handler !== "passive") return;
    if (profile.requiresMounted === true && !isPlayerMounted()) return;
    if (profile.requiresShield === true && !hasEquippedShieldRuntime()) return;
    if (Array.isArray(profile.weaponTypes) && profile.weaponTypes.length) {
      const currentWeaponType = typeof getEquippedWeaponTypeRuntime === "function" ? getEquippedWeaponTypeRuntime() : (player?.weaponType || "fist");
      if (!matchesAnyRuntimeWeaponType(currentWeaponType, profile.weaponTypes)) return;
    }
    const bonuses = profile.passiveBonuses || {};
    if (profile.cartAtkRatePerLevel) totals.atkRate = Number(totals.atkRate || 0) + Math.min(10, Number(profile.cartAtkRatePerLevel) * level);
    Object.keys(bonuses).forEach(key => {
      totals[key] = Number(totals[key] || 0) + getLevelValue(bonuses[key], level, 0);
    });
    // RA TF_MISS: thief second-job branches receive 4 FLEE per level instead of 3.
    if (profile.conditionalJobBonus?.thiefSecondJobFleePerLevel) {
      const jobKey = String(player?.jobKey || "").toLowerCase();
      const thiefSecondJobTokens = ["assassin", "rogue", "stalker", "shadow_chaser", "guillotine_cross", "abyss_chaser"];
      if (thiefSecondJobTokens.some(token => jobKey.includes(token))) {
        totals.fleeFlat = Number(totals.fleeFlat || 0) + Number(profile.conditionalJobBonus.thiefSecondJobFleePerLevel) * level;
      }
    }
    if (Array.isArray(profile.conditionalWeaponBonuses)) {
      const currentWeaponType = typeof getEquippedWeaponTypeRuntime === "function" ? getEquippedWeaponTypeRuntime() : (player?.weaponType || "fist");
      profile.conditionalWeaponBonuses.forEach(rule => {
        if (!matchesAnyRuntimeWeaponType(currentWeaponType, rule.weaponTypes || [])) return;
        Object.entries(rule.bonuses || {}).forEach(([key,value]) => { totals[key] = Number(totals[key] || 0) + getLevelValue(value, level, 0); });
      });
    }
  });
  return totals;
}

function getItemRecoveryRateBonus(kind = "hp", itemData = null) {
  const totals = typeof getPassiveSkillBonusTotals === "function" ? getPassiveSkillBonusTotals() : {};
  const key = String(kind || "hp").toLowerCase() === "sp" ? "itemSpRecoveryRate" : "itemHpRecoveryRate";
  const cardAndEquipment = window.CardRuntime?.getItemRecoveryRate ? Number(window.CardRuntime.getItemRecoveryRate(itemData, kind) || 0) : 0;
  return Math.max(0, Number(totals[key] || 0) + cardAndEquipment);
}

function calculateItemRecoveryAmount(baseAmount, kind = "hp", itemData = null) {
  const base = Math.max(0, Number(baseAmount || 0));
  const itemRate = getItemRecoveryRateBonus(kind, itemData);
  const active = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
  const cardAndEquipment = window.CardRuntime?.getMergedSource ? window.CardRuntime.getMergedSource() : {};
  const receivedRate = String(kind || "hp").toLowerCase() === "hp"
    ? Number(active.healingReceivedRate || 0) + Number(cardAndEquipment.healingReceivedRate || 0)
    : 0;
  return Math.max(0, Math.floor(base * (100 + itemRate + receivedRate) / 100));
}

// Renewal healing categories keep H.Plus away from recovery paths that are not
// caster skill healing. This mirrors rAthena's final skill-heal layer while
// keeping item recovery, natural regeneration, life steal and fixed restoration
// on their own independent paths.
const RUNTIME_HEALING_CATEGORIES = Object.freeze({
  SKILL_HEAL: "skill_heal",
  PERIODIC_SKILL_HEAL: "periodic_skill_heal",
  POTION_PITCHER: "potion_pitcher",
  ITEM_RECOVERY: "item_recovery",
  NATURAL_REGENERATION: "natural_regeneration",
  LIFE_STEAL: "life_steal",
  FIXED_RECOVERY: "fixed_recovery",
  RESURRECTION: "resurrection"
});
const RUNTIME_HEALING_POLICIES = Object.freeze({
  skill_heal: { includeHPlus:true, includeHealPower:true, includeCasterBuffs:true, includeReceived:true },
  periodic_skill_heal: { includeHPlus:true, includeHealPower:true, includeCasterBuffs:true, includeReceived:true },
  potion_pitcher: { includeHPlus:true, includeHealPower:true, includeCasterBuffs:true, includeReceived:true },
  item_recovery: { includeHPlus:false, includeHealPower:false, includeCasterBuffs:false, includeReceived:true },
  natural_regeneration: { includeHPlus:false, includeHealPower:false, includeCasterBuffs:false, includeReceived:false },
  life_steal: { includeHPlus:false, includeHealPower:false, includeCasterBuffs:false, includeReceived:false },
  fixed_recovery: { includeHPlus:false, includeHealPower:false, includeCasterBuffs:false, includeReceived:false },
  resurrection: { includeHPlus:false, includeHealPower:false, includeCasterBuffs:false, includeReceived:false }
});
function getRuntimeHealingModifierPolicy(category = RUNTIME_HEALING_CATEGORIES.SKILL_HEAL) {
  const key = String(category || RUNTIME_HEALING_CATEGORIES.SKILL_HEAL).toLowerCase();
  return { category:key, ...(RUNTIME_HEALING_POLICIES[key] || RUNTIME_HEALING_POLICIES.skill_heal) };
}
function applyRuntimeHealingModifiers(rawAmount, options = {}) {
  const raw = Math.max(0, Number(rawAmount || 0));
  if (raw <= 0) return 0;
  const source = options.source || player;
  const target = options.target || player;
  const api = window.CombatFormulaRuntime;
  const policy = getRuntimeHealingModifierPolicy(options.healingCategory);
  const includeHPlus = options.includeHPlus === undefined ? policy.includeHPlus : options.includeHPlus !== false;
  const includeHealPower = options.includeHealPower === undefined ? policy.includeHealPower : options.includeHealPower !== false;
  const includeCasterBuffs = options.includeCasterBuffs === undefined ? policy.includeCasterBuffs : options.includeCasterBuffs !== false;
  const includeReceived = options.includeReceived === undefined ? policy.includeReceived : options.includeReceived !== false;
  let sourceRate = Number(options.additionalSourceRate || 0);
  if (includeHPlus) {
    const derived = source === player && typeof calculateDerivedPlayerStats === "function" ? calculateDerivedPlayerStats() : source;
    sourceRate += Number(derived?.hPlus || source?.hPlus || 0);
  }
  if (includeHealPower) {
    if (api?.collectScalarBonus) sourceRate += Number(api.collectScalarBonus(source, "healPowerRate", ["healingPowerRate"]) || 0);
    else if (source === player && typeof getPassiveSkillBonusTotals === "function") sourceRate += Number(getPassiveSkillBonusTotals().healPowerRate || 0);
  }
  if (source === player && includeCasterBuffs && options.includeAssumptio !== false) {
    const active = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
    sourceRate += Number(active.assumptioLevel || 0) * 2;
    if (options.includeOffertorium === true) sourceRate += Number(active.offertoriumHealPowerRate || 0);
  }
  let receivedRate = Number(options.additionalReceivedRate || 0);
  if (includeReceived) {
    if (api?.collectScalarBonus) receivedRate += Number(api.collectScalarBonus(target, "healingReceivedRate", ["healReceivedRate"]) || 0);
    else if (target === player && typeof getActiveBuffBonusTotals === "function") receivedRate += Number(getActiveBuffBonusTotals().healingReceivedRate || 0);
  }
  return Math.max(0, Math.floor(raw * (100 + sourceRate + receivedRate) / 100));
}
window.RUNTIME_HEALING_CATEGORIES = RUNTIME_HEALING_CATEGORIES;
window.getRuntimeHealingModifierPolicy = getRuntimeHealingModifierPolicy;
window.applyRuntimeHealingModifiers = applyRuntimeHealingModifiers;


function getPassiveCombatModifierTotals() {
  const totals = { elementResist: {}, raceResist: {}, sizeResist: {}, elementDamage: {}, raceDamage: {}, physicalRaceDamage: {}, magicRaceDamage: {}, sizeDamage: {}, magicSizeDamage: {}, magicElementDamage: {} };
  if (!player || !player.learnedSkills) return totals;
  getLearnedPassiveRuntimeSkills().forEach(skill => {
    if (!isRuntimePassiveSkill(skill)) return;
    const level = getSkillLevel(skill.id);
    if (level <= 0) return;
    const profile = getSkillRuntimeProfile(skill);
    if (profile?.requiresMounted === true && !isPlayerMounted()) return;
    if (profile?.requiresShield === true && !hasEquippedShieldRuntime()) return;
    if (Array.isArray(profile?.weaponTypes) && profile.weaponTypes.length) {
      const currentWeaponType = getEquippedWeaponTypeRuntime();
      if (!matchesAnyRuntimeWeaponType(currentWeaponType, profile.weaponTypes)) return;
    }
    const maps = profile?.passiveCombatModifiers || {};
    Object.keys(maps).forEach(group => {
      totals[group] = totals[group] || {};
      Object.keys(maps[group] || {}).forEach(key => {
        totals[group][key] = Number(totals[group][key] || 0) + getLevelValue(maps[group][key], level, 0);
      });
    });
    // Passive profiles may expose a direct elemental resistance bonus instead of
    // passiveCombatModifiers. Fold it into the shared combat modifier map so
    // every incoming Holy hit uses the same authoritative formula path.
    const directBonuses = profile?.passiveBonuses || {};
    const holyResistRate = getLevelValue(directBonuses.holyResistRate, level, 0);
    if (holyResistRate) {
      totals.elementResist.Holy = Number(totals.elementResist.Holy || 0) + holyResistRate;
    }
  });
  return totals;
}

function getFatalBlowRuntimeForBash(bashLevel) {
  const skill = getCurrentJobSkills().find(s => Number(s.officialId ?? s.id) === 145);
  const learned = skill ? getSkillLevel(skill.id) : 0;
  if (!learned || Number(bashLevel || 0) <= 5) return null;
  return {
    status: "stun",
    chancePercent: Math.max(0, (Number(bashLevel) - 5) * Number(player?.baseLevel || 1) / 10),
    durationMs: 4500
  };
}

function getPassiveTargetDamageBonus(target) {
  if (!player || !target) return 0;
  let total = 0;
  const targetRace = String(target.race || "").toLowerCase();
  const targetElement = String(target.element || target.defElement || "").toLowerCase();
  getLearnedPassiveRuntimeSkills().forEach(skill => {
    if (!isRuntimePassiveSkill(skill)) return;
    const level = getSkillLevel(skill.id);
    if (level <= 0) return;
    const profile = getSkillRuntimeProfile(skill);
    if (profile?.handler !== "passive" || !profile.conditionalDamage) return;
    const rule = profile.conditionalDamage;
    const raceMatch = (rule.races || []).some(v => String(v).toLowerCase() === targetRace);
    const elementMatch = (rule.elements || []).some(v => String(v).toLowerCase() === targetElement);
    if (!raceMatch && !elementMatch) return;
    if (rule.formula === "demon_bane") total += Math.floor(level * (Number(player.baseLevel || 1) / 20 + 3));
    else total += Number(rule.flatAtkPerLevel || 0) * level;
  });
  return Math.max(0, Math.floor(total));
}

function clearSustainedPerformanceAura(buff) {
  const statusNames = [buff?.performanceAuraStatus, ...(Array.isArray(buff?.performanceAuraStatuses) ? buff.performanceAuraStatuses : [])]
    .filter(Boolean).map(v => String(v));
  if (!statusNames.length) return;
  const candidates = typeof getRuntimeCombatCandidates === "function" ? getRuntimeCombatCandidates() : [window.currentMonster].filter(Boolean);
  for (const target of candidates || []) {
    if (!target?.runtimeState) continue;
    for (const statusName of statusNames) {
      const key = statusName.toLowerCase().replace(/[ _-]/g, "");
      if (target.runtimeState.statuses) delete target.runtimeState.statuses[key];
      delete target.runtimeState[key];
    }
  }
}


function tickSustainedPerformancePulse(skillId, buff, now = Date.now()) {
  const formula = String(buff?.performancePulseFormula || "");
  const interval = Math.max(0, Number(buff?.performancePulseIntervalMs || 0));
  if (!formula || interval <= 0 || !player) return 0;
  const last = Number(buff.lastPerformancePulseAt || buff.activatedAt || now);
  const ticks = Math.min(3, Math.max(0, Math.floor((now - last) / interval)));
  if (ticks <= 0) return 0;
  buff.lastPerformancePulseAt = last + ticks * interval;
  const radius = Math.max(0, Number(buff.performancePulseRadius || 4));
  const pulseOptions={shape:"circle",rangeCells:radius,maxTargets:999};
  const candidates = typeof getRuntimeCombatCandidates === "function" ? getRuntimeCombatCandidates({bounds:getRuntimeTargetingBounds(player,pulseOptions),ignoreContext:true}) : [window.currentMonster].filter(Boolean);
  const targets = window.TargetingResolver ? window.TargetingResolver.collect(player, candidates, pulseOptions) : candidates;
  let affected = 0;
  withRuntimeCombatEvaluationContext(() => {
  for (let tick = 0; tick < ticks; tick += 1) {
    for (const target of targets || []) {
      if (!target || Number(target.currentHp ?? target.hp ?? 0) <= 0) continue;
      if (formula === "renewal_dissonance") {
        const ratio = Math.max(1, Math.floor((110 + 50 * Number(buff.level || 1)) * Number(player.jobLevel || 1) / 10));
        const result = window.CombatDamagePipeline?.resolvePhysicalSkill({ handler:"physical_attack", elementSource:"weapon", attackRangeType:"long", ignoreFlee:true }, Number(buff.level || 1), target, { ratio, skipHitCheck:true, allowNormalProc:false });
        if (result?.elementImmune === true) {
          if (typeof showMissNumber === "function") showMissNumber(target);
          continue;
        }
        const damage = Math.max(1, Number(result?.damage || 1));
        applyRuntimeCalculatedDamage(target,damage,{skillId:Number(skillId||0)});
        affected += 1;
      } else if (formula === "renewal_ugly_dance") {
        const amount = Math.max(0, Number(buff.performancePulseValue || 0));
        if (Number.isFinite(Number(target.sp))) target.sp = Math.max(0, Number(target.sp || 0) - amount);
        else {
          const hp = Math.max(0, Number(target.currentHp || 0));
          const dealt = Math.min(Math.max(0, hp - 1), amount);
          target.currentHp = Math.max(1, hp - dealt);
          if (dealt > 0 && typeof showDamageNumber === "function") showDamageNumber(dealt);
        }
        affected += 1;
      } else if (formula === "renewal_lullaby" || formula === "renewal_classical_pluck") {
        const status = formula === "renewal_lullaby" ? "sleep" : "classical_pluck";
        const effects = formula === "renewal_lullaby" ? { blocksActions:1, rooted:1 } : { skillUseBlocked:1 };
        const result = window.StatusManager?.apply(target, status, {
          chancePercent:Number(buff.performancePulseChancePercent || 100),
          durationMs:Math.max(100, Number(buff.performancePulseStatusDurationMs || interval * 2)),
          level:Number(buff.level || 1), effects, allowBoss:buff.performancePulseAffectsBoss === true
        });
        if (result?.applied) affected += 1;
      }
      else if (["renewal_geffenia_nocturn","renewal_ain_rhapsody","renewal_roki_capriccio","renewal_nipelheim_requiem"].includes(formula)) {
        const lv=Math.max(1,Number(buff.level||1));
        const durationMs=Math.max(100,Number(buff.performancePulseStatusDurationMs||interval*2));
        const apply=(status,chance,effects)=>window.StatusManager?.apply(target,status,{chancePercent:chance,durationMs,level:lv,effects,allowBoss:false});
        if(formula==="renewal_geffenia_nocturn") { if(apply("geffenia_nocturn",100,{mresFlat:-10*lv})?.applied)affected+=1; }
        else if(formula==="renewal_ain_rhapsody") { if(apply("ain_rhapsody",100,{resFlat:-10*lv})?.applied)affected+=1; }
        else if(formula==="renewal_roki_capriccio") {
          let hit=false;
          if(apply("confusion",4*lv,{hitRate:-20,walkSpeedRate:20})?.applied)hit=true;
          if(apply("misfortune",5*lv,{hitFlat:-10*lv})?.applied)hit=true;
          if(hit)affected+=1;
        } else {
          let hit=false;
          if(apply("curse",4*lv,{atkRate:-25,walkSpeedRate:30})?.applied)hit=true;
          if(apply("depression",5*lv,{outgoingPhysicalDamageRate:-5*lv,outgoingMagicDamageRate:-5*lv})?.applied)hit=true;
          if(hit)affected+=1;
        }
      }
    }
  }
  }, {candidates:targets||[]});
  if (affected > 0 && typeof updateMonsterUI === "function") updateMonsterUI();
  if (window.currentMonster && Number(window.currentMonster.currentHp || 0) <= 0 && typeof defeatMonster === "function") defeatMonster();
  return affected;
}

function applyRuntimeBuffAfterEffect(skillId, buff, now = Date.now()) {
  const afterEffect = buff?.afterEffect;
  if (!afterEffect || typeof afterEffect !== "object" || !afterEffect.effects) return false;
  const level = Math.max(1, Number(buff?.level || 1));
  const duration = Math.max(0, Number(getLevelValue(afterEffect.duration, level, 0)));
  if (duration <= 0) return false;
  const effects = collectRuntimeEffects(afterEffect, level);
  if (!Object.keys(effects).length) return false;
  player.activeBuffs = player.activeBuffs || {};
  const afterId = `${skillId}_after_effect`;
  player.activeBuffs[afterId] = {
    id: afterId,
    sourceSkillId: Number(buff?.id || skillId || 0),
    name: `${buff?.name || "技能"}（後遺症）`,
    level,
    effects,
    expiresAt: Number(now) + duration,
    afterEffect: null
  };
  return true;
}
window.applyRuntimeBuffAfterEffect = applyRuntimeBuffAfterEffect;

function normalizeActiveBuffs(options = {}) {
  if (!player) return;
  const processPeriodic = options.processPeriodic !== false;
  player.activeBuffs = player.activeBuffs || {};
  // 0.9.82AZ：火狩／怪物情報／火狩芽已改為永久被動。
  // 清除舊存檔殘留的主動 Buff，避免沿用已退役的偵測或觸發攻擊效果。
  ["10", "93", "1006", "2241", "warg_rider_runtime"].forEach(skillId => { delete player.activeBuffs[skillId]; });
  player.wargRiding = false;
  const now = Date.now();
  Object.keys(player.activeBuffs).forEach(skillId => {
    const buff = player.activeBuffs[skillId];
    if (!buff || Number(buff.expiresAt || 0) <= now) {
      if (buff?.performanceAuraStatus) clearSustainedPerformanceAura(buff);
      if (buff?.effects?.clampSpiritSpheresToFiveOnEnd && window.CombatResourceManager) {
        const current=Math.min(5,Number(window.CombatResourceManager.get("spiritSphere")||0));
        window.CombatResourceManager.configure("spiritSphere",{max:5,start:current,durationMs:600000,regenIntervalMs:0});
      }
      if (buff) applyRuntimeBuffAfterEffect(skillId, buff, now);
      delete player.activeBuffs[skillId]; return;
    }
    // 0.9.82GP：能力值彙總只能清理過期 Buff，不可在同一條呼叫鏈執行週期治療／SP 扣除。
    // 持續祈療會讀取衍生 MATK；若在 calculateDerivedPlayerStats -> getActiveBuffBonusTotals
    // 內再次執行週期公式，會形成無限遞迴並在樞機主教存檔載入時爆出 Maximum call stack。
    if (!processPeriodic) return;
    if (Number(buff?.effects?.revealHidden || 0) > 0 && typeof revealHiddenMonstersAroundPlayer === "function") {
      revealHiddenMonstersAroundPlayer(Number(buff.effects.revealHiddenRadius || 3));
    }
    if (buff?.performancePulseFormula) tickSustainedPerformancePulse(skillId, buff, now);
    const interval = Math.max(0, Number(buff.periodicIntervalMs || 0));
    const flatDrain = Math.max(0, Number(buff.periodicSpDrainFlat || 0));
    const rateDrain = Math.max(0, Number(buff.periodicSpDrainRate || 0));
    if (interval > 0 && (flatDrain > 0 || rateDrain > 0) && now - Number(buff.lastPeriodicTick || now) >= interval) {
      const ticks = Math.max(1, Math.floor((now - Number(buff.lastPeriodicTick || now)) / interval));
      const perTick = flatDrain + (rateDrain > 0 ? Math.max(1, Math.floor(Math.max(0, Number(player.maxSp || 0)) * rateDrain / 100)) : 0);
      const cost = Math.max(0, ticks * perTick);
      if (cost > 0 && Number(player.sp || 0) < cost) { applyRuntimeBuffAfterEffect(skillId, buff, now); delete player.activeBuffs[skillId]; if (typeof recalculatePlayerStats === "function") recalculatePlayerStats(); return; }
      player.sp = Math.max(0, Number(player.sp || 0) - cost);
      buff.lastPeriodicTick = Number(buff.lastPeriodicTick || now) + ticks * interval;
    }
    if(buff.periodicHealFormula==="renewal_mediale_votum"){
      const formulaInterval=Math.max(100,Number(buff.periodicHpIntervalMs||2000));
      if(now-Number(buff.lastPeriodicFormulaTick||now)>=formulaInterval){
        const ticks=Math.max(1,Math.floor((now-Number(buff.lastPeriodicFormulaTick||now))/formulaInterval));
        const derived=typeof calculateDerivedPlayerStats==="function"?calculateDerivedPlayerStats():null;
        const intStat=Number(derived?.stats?.int||player?.stats?.int||1),baseLv=Number(player?.baseLevel||1),matk=Number(derived?.matk||0),lv=Math.max(1,Number(buff.periodicHealLevel||buff.level||1));
        const base=Math.max(1,Math.floor(((baseLv+intStat)/5)*30+matk));
        const levelAdjusted=Math.max(1,Math.floor(base*(100+2*lv)/100));
        const perTick=Math.max(1,applyRuntimeHealingModifiers(levelAdjusted,{source:player,target:player,healingCategory:RUNTIME_HEALING_CATEGORIES.PERIODIC_SKILL_HEAL,includeOffertorium:true}));
        player.hp=Math.min(Number(player.maxHp||1),Number(player.hp||0)+ticks*perTick);
        buff.lastPeriodicFormulaTick=Number(buff.lastPeriodicFormulaTick||now)+ticks*formulaInterval;
      }
    }
    if(Array.isArray(buff.periodicClearStatuses)&&buff.periodicClearStatuses.length){
      player.runtimeState=player.runtimeState||{};player.runtimeState.statuses=player.runtimeState.statuses||{};
      for(const name of buff.periodicClearStatuses){const key=String(name).toLowerCase().replace(/[ _-]/g,'');delete player.runtimeState.statuses[key];delete player.runtimeState[key];}
    }
    const hpInterval=Math.max(0,Number(buff.periodicHpIntervalMs||0));
    const hpRate=Math.max(0,Number(buff.periodicHpHealRate||0));
    const hpFlat=Math.max(0,Number(buff.periodicHpHealFlat||0));
    if(hpInterval>0&&(hpRate>0||hpFlat>0)&&now-Number(buff.lastPeriodicHpTick||now)>=hpInterval){
      const ticks=Math.max(1,Math.floor((now-Number(buff.lastPeriodicHpTick||now))/hpInterval));
      const rawPerTick=hpFlat+(hpRate>0?Math.max(1,Math.floor(Number(player.maxHp||1)*hpRate/100)):0);
      let receivedRate=0;for(const other of Object.values(player.activeBuffs||{}))receivedRate+=Number(other?.effects?.healingReceivedRate||0);
      const perTick=Math.max(0,Math.floor(rawPerTick*(100+receivedRate)/100));
      player.hp=Math.min(Number(player.maxHp||1),Number(player.hp||0)+ticks*perTick);
      buff.lastPeriodicHpTick=Number(buff.lastPeriodicHpTick||now)+ticks*hpInterval;
    }
    const spHealInterval=Math.max(0,Number(buff.periodicSpHealIntervalMs||0));
    const spHealRate=Math.max(0,Number(buff.periodicSpHealRate||0));
    const spHealFlat=Math.max(0,Number(buff.periodicSpHealFlat||0));
    if(spHealInterval>0&&(spHealRate>0||spHealFlat>0)&&now-Number(buff.lastPeriodicSpHealTick||now)>=spHealInterval){
      const ticks=Math.max(1,Math.floor((now-Number(buff.lastPeriodicSpHealTick||now))/spHealInterval));
      const perTick=spHealFlat+(spHealRate>0?Math.max(1,Math.floor(Number(player.maxSp||0)*spHealRate/100)):0);
      player.sp=Math.min(Number(player.maxSp||0),Number(player.sp||0)+ticks*perTick);
      buff.lastPeriodicSpHealTick=Number(buff.lastPeriodicSpHealTick||now)+ticks*spHealInterval;
    }
  });
}

function getActiveBuffBonusTotals() {
  const totals = {};
  if (!player) return totals;
  normalizeActiveBuffs({ processPeriodic: false });
  Object.values(player.activeBuffs || {}).forEach(buff => {
    const effects = buff.effects || {};
    Object.keys(effects).forEach(key => {
      const value = effects[key];
      if (typeof value === "boolean") {
        totals[key] = Number(totals[key] || 0) + (value ? 1 : 0);
        return;
      }
      if (typeof value !== "number" || !Number.isFinite(value)) return;
      totals[key] = Number(totals[key] || 0) + value;
    });
  });
  // Normalize legacy/profile-specific effect names into the shared combat and
  // status vocabulary. Keep the original fields too for skill-specific hooks.
  totals.autoGuardBlockRate = Number(totals.autoGuardBlockRate || 0) + Number(totals.blockChance || 0);
  totals.parryBlockRate = Number(totals.parryBlockRate || 0) + Number(totals.parryChance || 0);
  totals.physicalReflectRate = Number(totals.physicalReflectRate || 0) + Number(totals.reflectPhysicalRate || 0);
  totals.finalDamageReduction = Number(totals.finalDamageReduction || 0) + Number(totals.finalDamageReductionRate || 0);
  totals.longPhysicalDamageReductionRate = Number(totals.longPhysicalDamageReductionRate || 0) + Number(totals.longRangeDamageReductionRate || 0);
  totals.moveSpeedRate = Number(totals.moveSpeedRate || 0) - Number(totals.moveSpeedPenaltyRate || 0);
  return totals;
}

function applyConditionalSelfBuffDamageRate(value, profile = null) {
  const base = Number(value);
  if (!Number.isFinite(base) || !profile?.conditionalSelfBuffDamageRate) return value;
  const rows = Array.isArray(profile.conditionalSelfBuffDamageRate)
    ? profile.conditionalSelfBuffDamageRate
    : [profile.conditionalSelfBuffDamageRate];
  const active = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
  let bonusRate = 0;
  for (const row of rows) {
    if (!row?.effect || Number(active[row.effect] || 0) <= 0) continue;
    bonusRate += Number(row.rate || 0);
  }
  return bonusRate ? Math.max(1, Math.floor(base * (100 + bonusRate) / 100)) : value;
}

function getActiveBuffSpecialValue(key, fallback = null) {
  if (!player) return fallback;
  normalizeActiveBuffs();
  let result = fallback;
  Object.values(player.activeBuffs || {}).forEach(buff => {
    const value = buff?.effects?.[key];
    if (value !== undefined && value !== null) result = value;
  });
  return result;
}

function consumeNextPhysicalAttackMultiplier() {
  if (!player) return 100;
  normalizeActiveBuffs();
  const entry = Object.entries(player.activeBuffs || {}).find(([, buff]) => Number(buff?.effects?.nextPhysicalAttackRate || 0) > 0);
  if (!entry) return 100;
  const [buffId, buff] = entry;
  const multiplier = Math.max(1, Number(buff.effects.nextPhysicalAttackRate || 100));
  delete player.activeBuffs[buffId];
  if (typeof recalculatePlayerStats === "function") recalculatePlayerStats();
  if (typeof addBattleLog === "function") addBattleLog(`${buff.name || "突破極限"}發動：本次物理攻擊倍率 ${multiplier}%。`);
  return multiplier;
}
window.consumeNextPhysicalAttackMultiplier = consumeNextPhysicalAttackMultiplier;

function getElementalActionRuntimeSpec(profile, forcedRoll = null) {
  if (!profile || profile.formula !== "renewal_elemental_action") return null;
  const highType = String(typeof getActiveBuffSpecialValue === "function" ? getActiveBuffSpecialValue("summonedHighElementalType", "") : "");
  const baseType = String(typeof getActiveBuffSpecialValue === "function" ? getActiveBuffSpecialValue("summonedElementalType", "") : "");
  const high = !!highType;
  const type = high ? highType : baseType;
  if (!type) return null;
  const grade = high ? 3 : Math.max(1, Math.min(3, Number(typeof getActiveBuffSpecialValue === "function" ? getActiveBuffSpecialValue("summonedElementalGrade", 1) : 1)));
  const table = high ? profile.elementalActions?.high?.[type] : profile.elementalActions?.base?.[type]?.[String(grade)];
  if (!table) return null;
  let selected = { ...table };
  if (Array.isArray(table.variants) && table.variants.length) {
    const roll = forcedRoll === null ? Math.random() * 100 : Number(forcedRoll);
    let cursor = 0, matched = null;
    for (const variant of table.variants) {
      cursor += Math.max(0, Number(variant.chancePercent || 0));
      if (roll < cursor) { matched = variant; break; }
    }
    selected = { ...table, ...(matched || table.default || {}) };
  } else if (table.default) selected = { ...table, ...table.default };
  delete selected.variants; delete selected.default;
  const derived = typeof calculateDerivedPlayerStats === "function" ? calculateDerivedPlayerStats() : null;
  const intStat = Number(derived?.stats?.int || player?.stats?.int || 1);
  const dexStat = Number(derived?.stats?.dex || player?.stats?.dex || 1);
  const maxSp = Math.max(1, Number(player?.maxSp || derived?.maxSp || 1));
  const rules = profile.elementalStatRules || {};
  const passive = typeof getPassiveSkillBonusTotals === "function" ? getPassiveSkillBonusTotals() : {};
  const intDivisor = Math.max(1, Number(rules.casterMatkIntDivisor || 2));
  const dexDivisor = Math.max(1, Number(rules.casterMatkDexDivisor || 4));
  const typeMatk = Number(rules.matkPerGrade?.[type] || 0) * grade;
  const typeAtk = Number(rules.atkPerGrade?.[type] || 0) * grade;
  const sympathyMatk = Number(passive.elementalSpiritMatkFlat || 0);
  const sympathyAtk = Number(passive.elementalSpiritAtkFlat || 0);
  const masteryMatk = high ? Number(passive.highElementalMatkFlat || 0) : 0;
  const masteryAtk = high ? Number(passive.highElementalAtkFlat || 0) : 0;
  const elementalMatk = Math.max(1, grade * (Math.floor(intStat / intDivisor) + Math.floor(dexStat / dexDivisor)) + typeMatk + sympathyMatk + masteryMatk);
  const atkDivisor = Math.max(1, Math.floor(Number(rules.atkMaxSpDivisorBase || 18) / grade));
  const elementalAtkMax = Math.max(1, Math.floor(maxSp / atkDivisor) + typeAtk + sympathyAtk + masteryAtk);
  const elementalAtkMin = Math.max(1, elementalAtkMax - 100);
  let ratio = Number(selected.ratio || selected.baseRatio || 100);
  if (selected.baseLevelScale === true) ratio = Math.floor(ratio * (100 + Number(player?.baseLevel || 1)) / 100);
  return { ...selected, type, grade, high, ratio, elementalMatk, elementalAtkMin, elementalAtkMax };
}

function resolveElementalActionRuntimeDamage(spec, target) {
  if (!spec || !target || !window.RARenewalDamagePipeline?.finalModifiers) return null;
  let raw = 0;
  if (String(spec.damageType || "magic").toLowerCase() === "physical") {
    const min = Math.max(1, Number(spec.elementalAtkMin || 1)), max = Math.max(min, Number(spec.elementalAtkMax || min));
    const atk = min + Math.floor(Math.random() * (max - min + 1));
    raw = Math.floor(atk * Number(spec.ratio || 100) / 100);
    return Math.max(0, window.RARenewalDamagePipeline.finalModifiers(raw, target, { damageType:"physical", element:spec.element || "Neutral", applyWeaponSize:false, attackRangeType:"long", ignoreDefense:spec.ignoreDefense === true }));
  }
  raw = Math.floor(Number(spec.elementalMatk || 1) * Number(spec.ratio || 100) / 100);
  return Math.max(0, window.RARenewalDamagePipeline.finalModifiers(raw, target, { damageType:"magic", element:spec.element || "Neutral", applyWeaponSize:false, ignoreMagicDefense:spec.ignoreDefense === true }));
}

function applyElementalActionRuntimeStatus(target, spec) {
  const status = spec?.status;
  if (!status?.name || !window.StatusManager || !target) return false;
  return !!window.StatusManager.apply(target, status.name, {
    chancePercent: Math.max(0, Math.min(100, Number(status.chancePercent || 0))),
    durationMs: Math.max(0, Number(status.durationMs || 0)),
    level: 1,
    effects: status.effects || {},
    allowBoss: status.allowBoss === true
  })?.applied;
}

function getRuntimeEffectValue(value, level) {
  if (Array.isArray(value)) {
    const index = Math.max(0, Number(level || 1) - 1);
    return value[index] ?? value[value.length - 1] ?? null;
  }
  if (value && typeof value === "object") {
    const direct = value[level] ?? value[String(level)];
    return direct !== undefined ? direct : value;
  }
  return value;
}

function collectRuntimeEffects(profile, level) {
  const result = {};
  const effects = profile?.effects || {};
  Object.keys(effects).forEach(key => { result[key] = getRuntimeEffectValue(effects[key], level); });
  return result;
}

function getRuntimeMonsterCandidates() {
  if (typeof window.getCombatEnemyCandidates === "function") return window.getCombatEnemyCandidates();
  if (typeof window.getCombatGroundCandidates === "function") return window.getCombatGroundCandidates();
  return (typeof currentMonster !== "undefined" && currentMonster) ? [currentMonster] : [];
}

function revealHiddenMonstersAroundPlayer(radiusCells = 3) {
  const radius = Math.max(0, Number(radiusCells || 0));
  const hiddenTokens = ["hide", "hidden", "hiding", "cloak", "cloaking", "camouflage", "invisible", "invisibility", "stealth"];
  let revealed = 0;
  for (const monster of getRuntimeMonsterCandidates()) {
    if (!monster) continue;
    let inRange = true;
    if (typeof distanceBetween === "function") {
      const px = Number(distanceBetween(player?.position || player, monster?.position || monster) || 0);
      const cell = Math.max(1, Number(window.RO_WEB_CELL_SIZE || 36));
      inRange = px <= radius * cell;
    }
    if (!inRange) continue;
    monster.runtimeState = monster.runtimeState || {};
    const statuses = monster.runtimeState.statuses || {};
    let changed = false;
    for (const [key, state] of Object.entries(statuses)) {
      const labels = [key, state?.name, state?.tag, ...(state?.tags || [])]
        .filter(Boolean).map(v => String(v).toLowerCase().replace(/[ _-]/g, ""));
      if (labels.some(label => hiddenTokens.some(token => label.includes(token)))) {
        delete statuses[key]; changed = true;
      }
    }
    for (const token of hiddenTokens) {
      if (monster.runtimeState[token] !== undefined) { delete monster.runtimeState[token]; changed = true; }
    }
    if (monster.hidden === true || monster.isHidden === true || monster.visible === false) changed = true;
    monster.hidden = false; monster.isHidden = false; monster.visible = true;
    if (changed) revealed++;
  }
  return revealed;
}
window.revealHiddenMonstersAroundPlayer = revealHiddenMonstersAroundPlayer;

function trySoulDrainRestore(target, isMagicAttack = false, profile = null) {
  if (!player || !target || !isMagicAttack) return 0;
  if (profile?.targetPolicy === "self" || profile?.handler === "ground_damage" || profile?.groundSkill === true) return 0;
  const passive = typeof getPassiveSkillBonusTotals === "function" ? getPassiveSkillBonusTotals() : {};
  const level = Math.max(0, Number(passive.soulDrainLevel || 0));
  if (level <= 0) return 0;
  const targetLevel = Math.max(1, Number(target.level || target.baseLevel || target.lv || 1));
  const amount = Math.max(1, Math.floor(targetLevel * (95 + 15 * level) / 100));
  const before = Math.max(0, Number(player.sp || 0));
  player.sp = Math.min(Number(player.maxSp || 0), before + amount);
  const restored = Math.max(0, Number(player.sp || 0) - before);
  if (restored > 0 && typeof addBattleLog === "function") addBattleLog(`吸魂效果恢復 ${restored} SP。`);
  return restored;
}

function tryBloodSuckerHealFromDamage(damage = 0) {
  if (!player || Number(damage || 0) <= 0) return 0;
  normalizeActiveBuffs();
  const active = getActiveBuffBonusTotals();
  const chance = Math.max(0, Math.min(100, Number(active.bloodSuckerChancePercent || 0)));
  const rate = Math.max(0, Number(active.bloodSuckerHealPercent || 0));
  if (chance <= 0 || rate <= 0 || Math.random() * 100 >= chance) return 0;
  const before = Math.max(0, Number(player.hp || 0));
  const heal = Math.max(1, Math.floor(Number(damage || 0) * rate / 100));
  player.hp = Math.min(Number(player.maxHp || 1), before + heal);
  const restored = Math.max(0, Number(player.hp || 0) - before);
  if (restored > 0 && typeof addBattleLog === "function") addBattleLog(`吸血植物發動，恢復 ${restored} HP。`);
  return restored;
}

function applyActiveAttackBuffStatuses(monster = currentMonster, dealtDamage = 0) {
  if (!player || !monster || !window.StatusManager) return false;
  normalizeActiveBuffs();
  let applied = false;
  Object.values(player.activeBuffs || {}).forEach(buff => {
    const effects = buff?.effects || {};
    if (effects.attackStatus) {
      const result = window.StatusManager.apply(monster, effects.attackStatus, {
        chancePercent: Number(effects.attackStatusChancePercent || 0),
        durationMs: Number(effects.attackStatusDurationMs || 0),
        level: Number(buff.level || 1)
      });
      if (result?.applied) applied = true;
    }
    const breakDuration = Math.max(0, Number(effects.meltdownBreakDurationMs || 0));
    const weaponChance = Math.max(0, Number(effects.meltdownWeaponBreakChancePercent || 0));
    const armorChance = Math.max(0, Number(effects.meltdownArmorBreakChancePercent || 0));
    if (breakDuration > 0 && weaponChance > 0) {
      const result = window.StatusManager.apply(monster, "meltdown_weapon_break", {
        chancePercent: weaponChance,
        durationMs: breakDuration,
        level: Number(buff.level || 1),
        effects: { atkRate: -Math.abs(Number(effects.meltdownWeaponAtkReductionRate || 25)) }
      });
      if (result?.applied) {
        applied = true;
        if (typeof addBattleLog === "function") addBattleLog(`${buff.name || "野蠻凶砍"}破壞了 ${monster.name || "敵人"} 的武器，ATK -${Math.abs(Number(effects.meltdownWeaponAtkReductionRate || 25))}%（5 秒）。`);
      }
    }
    if (breakDuration > 0 && armorChance > 0) {
      const result = window.StatusManager.apply(monster, "meltdown_armor_break", {
        chancePercent: armorChance,
        durationMs: breakDuration,
        level: Number(buff.level || 1),
        effects: { defRate: -Math.abs(Number(effects.meltdownArmorDefReductionRate || 25)) }
      });
      if (result?.applied) {
        applied = true;
        if (typeof addBattleLog === "function") addBattleLog(`${buff.name || "野蠻凶砍"}破壞了 ${monster.name || "敵人"} 的鎧甲，DEF -${Math.abs(Number(effects.meltdownArmorDefReductionRate || 25))}%（5 秒）。`);
      }
    }
  });
  if (Number(dealtDamage || 0) > 0) tryBloodSuckerHealFromDamage(dealtDamage);
  return applied;
}



function getPassiveIncomingFlatReduction(source) {
  if (!player || !source || typeof getCurrentJobSkills !== "function") return 0;
  const race = String(source?.race || source?.Race || "").toLowerCase();
  const element = String(source?.element || source?.Element || "").toLowerCase();
  let total = 0;
  getCurrentJobSkills().forEach(skill => {
    const level = Number(typeof getSkillLevel === "function" ? getSkillLevel(skill.id) : 0);
    if (level <= 0) return;
    const rule = getSkillRuntimeProfile(skill)?.conditionalIncomingFlatReduction;
    if (!rule) return;
    const raceMatch = (rule.races || []).some(v => race.includes(String(v).toLowerCase()));
    const elementMatch = (rule.elements || []).some(v => element.includes(String(v).toLowerCase()));
    if (!raceMatch && !elementMatch) return;
    if (rule.formula === "divine_protection") total += Math.round(((Number(player.baseLevel || 1) / 25) + 3) * level);
    else if (Number(rule.flatPerLevel || 0) > 0) total += Number(rule.flatPerLevel) * level;
  });
  return Math.max(0, Math.floor(total));
}

function getLatestAutoShadowCopyEntry() {
  const rows = typeof getExtraSkillEntries === "function" ? getExtraSkillEntries() : [];
  return rows.filter(e => ["plagiarism","reproduce"].includes(String(e?.sourceType || "")))
    .sort((a,b) => Number(b?.acquiredAt || 0) - Number(a?.acquiredAt || 0))[0] || null;
}

function resolveMagicRodIncomingDamage(damage, sourceSkillSpCost = 0, source = null, options = {}) {
  if (!player || Number(damage || 0) <= 0) return { absorbed:false, damage:Math.max(0,Number(damage||0)), spRestored:0 };
  normalizeActiveBuffs();
  const buff=player.activeBuffs?.[276]||player.activeBuffs?.["276"];
  if(!buff||Number(buff.effects?.magicRod||0)<=0)return { absorbed:false, damage:Math.max(0,Number(damage||0)), spRestored:0 };
  if(options.singleTarget===false)return { absorbed:false, damage:Math.max(0,Number(damage||0)), spRestored:0 };
  const rate=Math.max(0,Math.min(100,Number(buff.effects?.magicRodAbsorbRate||0)));
  const restored=Math.max(0,Math.floor(Number(sourceSkillSpCost||0)*rate/100));
  if(restored>0)player.sp=Math.min(Number(player.maxSp||0),Number(player.sp||0)+restored);
  if(typeof addBattleLog==="function")addBattleLog(`${buff.name||"魔法懲罰"}吸收了${source?.name?` ${source.name} 的`:""}單體魔法${restored>0?`，恢復 ${restored} SP`:""}。`);
  if(typeof updatePlayerUI==="function")updatePlayerUI();
  return { absorbed:true, damage:0, spRestored:restored, rate };
}

function trySpellFistOnNormalAttack(target = currentMonster) {
  if(!player||!target||Number(target.currentHp||0)<=0)return false;
  normalizeActiveBuffs();
  const buff=player.activeBuffs?.[2445]||player.activeBuffs?.["2445"];
  if(!buff||Number(buff.effects?.spellFist||0)<=0)return false;
  const level=Math.max(1,Number(buff.effects?.spellFistLevel||buff.level||1));
  const boltLevel=Math.max(1,Number(buff.effects?.spellFistBoltLevel||1));
  const element=String(buff.effects?.spellFistElement||"Neutral");
  const ratio=Math.max(1,Number(buff.effects?.spellFistRatio||20*level+100*boltLevel));
  const result=window.CombatDamagePipeline?.resolveMagicSkill({handler:"magic_damage",elementSource:"skill",element,attackRangeType:"short"},level,target,{ratio,hits:1,skipHitCheck:true});
  if(!result)return false;
  if (result.elementImmune === true) {
    if (typeof showMissNumber === "function") showMissNumber(target);
    return false;
  }
  const calculatedDamage=Math.max(1,Number(result.damage||1));
  const applied=applyRuntimeCalculatedDamage(target,calculatedDamage,{triggeredByNormalAttack:true,skillId:Number(buff.id||0)});
  if(typeof addBattleLog==="function")addBattleLog(`${buff.name||"魔力拳"}追加 ${element} 屬性魔法傷害 ${calculatedDamage}。`);
  return true;
}

function createPropertyWalkTrailAt(position = null) {
  if(!player||!window.GroundEffectManager||!position)return false;
  normalizeActiveBuffs();
  const entry=Object.entries(player.activeBuffs||{}).find(([,buff])=>Number(buff?.effects?.propertyWalk||0)>0);
  if(!entry)return false;
  const [buffId,buff]=entry,effects=buff.effects||{},cell=Number(window.RO_WEB_CELL_SIZE||36);
  const x=Number(position.x||0),y=Number(position.y||0);
  if(!Number.isFinite(x)||!Number.isFinite(y))return false;
  if(buff.lastTrailX===undefined||buff.lastTrailY===undefined){buff.lastTrailX=x;buff.lastTrailY=y;return false;}
  if(Math.hypot(x-Number(buff.lastTrailX),y-Number(buff.lastTrailY))<cell)return false;
  const maxCells=Math.max(1,Number(effects.propertyWalkMaxCells||8));
  const placed=Math.max(0,Number(buff.propertyWalkPlaced||0));
  if(placed>=maxCells){delete player.activeBuffs[buffId];return false;}
  const trailX=Number(buff.lastTrailX),trailY=Number(buff.lastTrailY),skillId=Number(effects.propertyWalkSkillId||buff.id),level=Math.max(1,Number(buff.level||1)),element=String(effects.propertyWalkElement||"Neutral");
  const duration=Math.max(1000,Number(effects.propertyWalkCellDurationMs||12000)),ratio=Math.max(1,Math.floor(Number(effects.propertyWalkRatioPerLevel||60)*level*Number(player.baseLevel||1)/100));
  const created=window.GroundEffectManager.create({id:`property_walk_${skillId}_${Date.now()}_${placed}`,x:trailX,y:trailY,shape:"square",rangeCells:0.5,tickMs:1000,durationMs:duration,maxTicks:Math.ceil(duration/1000),isGroundMagic:true,sourceSkillId:skillId,noOverlapKey:`property_walk_${skillId}`,onTick(targets){
    withRuntimeCombatEvaluationContext(() => {
      for(const target of targets||[]){
        if(!target||Number(target.currentHp||0)<=0)continue;
        const result=window.CombatDamagePipeline?.resolveMagicSkill({handler:"magic_damage",elementSource:"skill",element},level,target,{ratio,hits:1,skipHitCheck:true});
        if(!result)continue;
        if(result.elementImmune===true){if(typeof showMissNumber==="function")showMissNumber(target);continue;}
        const calculatedDamage=Math.max(1,Number(result.damage||1));
        applyRuntimeCalculatedDamage(target,calculatedDamage,{skillId});
      }
    });
    if(currentMonster&&Number(currentMonster.currentHp||0)<=0&&typeof defeatMonster==="function")defeatMonster();else if(typeof updateMonsterUI==="function")updateMonsterUI();
  }});
  buff.lastTrailX=x;buff.lastTrailY=y;
  if(!created)return false;
  buff.propertyWalkPlaced=placed+1;
  if(buff.propertyWalkPlaced>=maxCells)delete player.activeBuffs[buffId];
  return true;
}

function castGroundProtectionSkill(skill, requestedLevel = null) {
  const check=canCastSkill(skill,requestedLevel,["ground_protection"]);if(!check.ok)return reportPendingRuntime(skill,check.reason);
  if(!currentMonster||!window.GroundEffectManager)return false;
  const {level,profile}=check;paySkillCost(skill,level);
  const x=Number(currentMonster?.position?.x??currentMonster?.worldX??0),y=Number(currentMonster?.position?.y??currentMonster?.worldY??0),radius=Number(getLevelValue(profile.targeting?.radius,level,3)),duration=Math.max(1000,Number(getLevelValue(profile.duration,level,120000)));
  const id=window.GroundEffectManager.create({id:`land_protector_${skill.id}_${Date.now()}`,x,y,shape:"square",rangeCells:radius,durationMs:duration,blocksGroundMagic:true,ignoreLandProtector:true,sourceSkillId:skill.id});
  if(!id){addBattleLog(`${skill.name}無法在目前位置建立。`);return false;}
  addBattleLog(`施放 ${skill.name} Lv${level}：建立 ${radius*2+1}×${radius*2+1} 地面魔法防護區，持續 ${Math.floor(duration/1000)} 秒。`);
  updatePlayerUI();updateMonsterUI();saveGame();return true;
}

function trySageAutoSpellOnNormalAttack(target = currentMonster) {
  if (!player || !target || Number(target.currentHp || 0) <= 0) return false;
  normalizeActiveBuffs();
  const buff = player.activeBuffs?.[279] || player.activeBuffs?.["279"];
  if (!buff || Number(buff.effects?.sageAutoSpell || 0) <= 0) return false;
  const chance = Math.max(0, Math.min(100, Number(buff.effects?.sageAutoSpellChance || 0)));
  if (chance <= 0 || Math.random() * 100 >= chance) return false;
  const candidates = [14, 19, 20].map(id => {
    const skill = typeof getSkillDataById === "function" ? getSkillDataById(id) : skillsData?.skillIndex?.[String(id)];
    const learned = skill && typeof getSkillLevel === "function" ? Number(getSkillLevel(id) || 0) : 0;
    return { skill, learned };
  }).filter(row => row.skill && row.learned > 0);
  if (!candidates.length) return false;
  const bestLevel = Math.max(...candidates.map(row => row.learned));
  const best = candidates.filter(row => row.learned === bestLevel);
  const selected = best[Math.floor(Math.random() * best.length)];
  const levelCap = Math.max(1, Number(buff.effects?.sageAutoSpellLevelCap || 1));
  const autoLevel = Math.max(1, Math.min(selected.learned, levelCap, Number(selected.skill.maxLevel || 1)));
  const damage = calculateSkillAttackDamage(selected.skill, autoLevel, target, { skipHitCheck:true, autoCast:true, sageAutoSpell:true });
  if (damage === null) return false;
  const calculatedDamage=Math.max(1,Number(damage||1));
  applyRuntimeCalculatedDamage(target,calculatedDamage,{triggeredByNormalAttack:true,skillId:Number(selected.skill?.officialId??selected.skill?.id)});
  if (typeof addBattleLog === "function") addBattleLog(`自動念咒發動 ${selected.skill.name} Lv${autoLevel}，造成 ${calculatedDamage} 點傷害。`);
  return true;
}

function tryAutoShadowSpellOnNormalAttack(target = currentMonster) {
  if (!player || !target || Number(target.currentHp || 0) <= 0) return false;
  normalizeActiveBuffs();
  const buff = player.activeBuffs?.[2286] || player.activeBuffs?.["2286"];
  if (!buff || Number(buff.effects?.autoShadowSpell || 0) <= 0) return false;
  if (String(window.lastRADamageTrace?.rangeType || "short").toLowerCase() !== "short") return false;
  const skillLv = Math.max(1, Number(buff.level || buff.effects?.autoShadowSpellLevel || 1));
  const chance = skillLv >= 10 ? 15 : Math.max(0, 30 - 2 * skillLv);
  if (Math.random() * 100 >= chance) return false;
  const entry = getLatestAutoShadowCopyEntry();
  if (!entry) return false;
  const copied = typeof getSkillDataById === "function" ? getSkillDataById(entry.skillId) : skillsData?.skillIndex?.[String(entry.skillId)];
  const copiedProfile = copied ? getSkillRuntimeProfile(copied) : null;
  const allowed = ["physical_attack","physical_attack_size_hits","physical_attack_formula","physical_charge","magic_multihit","magic_damage","misc_damage","ground_damage"];
  const effective = copiedProfile?.damageHandler || copiedProfile?.handler;
  if (!copied || !allowed.includes(effective)) return false;
  const autoLevel = Math.max(1, Math.min(Number(entry.level || 1), Math.floor((skillLv + 5) / 2), Number(copied.maxLevel || 1)));
  const spCost = Math.floor(getRuntimeSkillSpCost(copied, autoLevel) * 2 / 3);
  if (Number(player.sp || 0) < spCost) return false;
  const damage = calculateSkillAttackDamage(copied, autoLevel, target, { skipHitCheck:true, autoCast:true });
  if (damage === null) return false;
  player.sp = Math.max(0, Number(player.sp || 0) - spCost);
  if (Number(damage || 0) <= 0) {
    if (typeof showMissNumber === "function") showMissNumber(target);
    return false;
  }
  const calculatedDamage=Math.max(1,Number(damage||1));
  applyRuntimeCalculatedDamage(target,calculatedDamage,{triggeredByNormalAttack:true,skillId:Number(copied?.officialId??copied?.id)});
  if (typeof addBattleLog === "function") addBattleLog(`自動魅影念咒發動 ${copied.name} Lv${autoLevel}，造成 ${calculatedDamage} 點傷害。`);
  return true;
}

function tryDupleLightOnNormalAttack(target=currentMonster){
  if(!player||!target||Number(target.currentHp||0)<=0)return false;
  normalizeActiveBuffs();
  const buff=player.activeBuffs?.[2054]||player.activeBuffs?.["2054"];
  if(!buff||Number(buff.effects?.dupleLight||0)<=0)return false;
  if(String(window.lastRADamageTrace?.rangeType||"short").toLowerCase()!=="short")return false;
  const level=Math.max(1,Number(buff.effects?.dupleLightLevel||buff.level||1));
  const chance=10+2*level;let total=0,parts=[];
  if(Math.random()*100<chance){
    const ratio=150+15*level;
    const result=window.CombatDamagePipeline?.resolvePhysicalSkill({handler:"physical_attack",elementSource:"weapon",attackRangeType:"short"},level,target,{ratio,skipHitCheck:true,allowNormalProc:false});
    if(result?.elementImmune===true){if(typeof showMissNumber==="function")showMissNumber(target);}
    else {const calculatedDamage=Math.max(1,Number(result?.damage||1));applyRuntimeCalculatedDamage(target,calculatedDamage,{triggeredByNormalAttack:true,skillId:2054});total+=calculatedDamage;parts.push(`物理 ${calculatedDamage}`);}
  }
  if(Number(target.currentHp||0)>0&&Math.random()*100<chance){
    const ratio=400+40*level;
    const result=window.CombatDamagePipeline?.resolveMagicSkill({handler:"magic_damage",elementSource:"skill",element:"Holy"},level,target,{ratio,hits:1,skipHitCheck:true});
    if(result?.elementImmune===true){if(typeof showMissNumber==="function")showMissNumber(target);}
    else {const calculatedDamage=Math.max(1,Number(result?.damage||1));applyRuntimeCalculatedDamage(target,calculatedDamage,{triggeredByNormalAttack:true,skillId:2054});total+=calculatedDamage;parts.push(`魔法 ${calculatedDamage}`);}
  }
  if(total>0){if(typeof addBattleLog==="function")addBattleLog(`二道聖光發動（${parts.join("、")}）。`);if(typeof playMonsterHitAnimation==="function")playMonsterHitAnimation(target);return true;}return false;
}

function tryServantWeaponOnNormalAttack(target = currentMonster) {
  if (!player || !target || Number(target.currentHp || 0) <= 0 || !window.CombatResourceManager) return false;
  normalizeActiveBuffs();
  const buff = player.activeBuffs?.[5201] || player.activeBuffs?.["5201"];
  if (!buff || window.CombatResourceManager.get("servantWeapon") <= 0) return false;
  const level = Math.max(1, Number(buff.level || 1));
  if (Math.random() * 100 >= Math.min(100, 5 * level)) return false;
  const used = window.CombatResourceManager.consume("servantWeapon", 1, "fixed", 1);
  if (!used.ok) return false;
  const derived = typeof calculateDerivedPlayerStats === "function" ? calculateDerivedPlayerStats() : {};
  const pow = Number(derived?.stats?.pow ?? player?.traitStats?.pow ?? 0);
  const ratioPerHit = Math.floor((600 + 850 * level + 5 * pow) * Number(player?.baseLevel || 1) / 100);
  const crit = window.CriticalResolver?.resolve(player, target, { criticalMode:"normal" }) || { critical:false, multiplier:1 };
  const targets = typeof resolveRuntimeSkillTargets === "function"
    ? resolveRuntimeSkillTargets({ targeting:{ origin:"target", shape:"circle", radius:4, maxTargets:999 } }, target, level)
    : [target];
  let totalDealt = 0;
  for (const enemy of (targets?.length ? targets : [target])) {
    if (!enemy || Number(enemy.currentHp || 0) <= 0) continue;
    const result = window.CombatDamagePipeline?.resolvePhysicalSkill({
      handler:"physical_attack_formula", elementSource:"weapon", attackRangeType:"short", criticalMode:"normal"
    }, level, enemy, { ratio:ratioPerHit * 3, skipHitCheck:true, criticalResult:crit });
    if (result?.elementImmune === true) {
      if (typeof showMissNumber === "function") showMissNumber(enemy);
      continue;
    }
    const damage = Math.max(1, Number(result?.damage || 1));
    applyRuntimeCalculatedDamage(enemy,damage,{triggeredByNormalAttack:true,skillId:Number(buff.id||0)});
    totalDealt += damage;
  }
  if (typeof addBattleLog === "function") {
    const sourceSkill = typeof getSkillDataById === "function" ? getSkillDataById(5201) : skillsData?.skillIndex?.["5201"];
    const sourceName = sourceSkill?.name || `Skill ${sourceSkill?.officialId || sourceSkill?.id || 5201}`;
    addBattleLog(`${sourceName} 發動 3 Hit 範圍攻擊，合計造成 ${totalDealt} 點傷害（剩餘 ${used.remaining}/5）。`);
  }
  return totalDealt > 0;
}

function tryAbyssForceWeaponOnNormalAttack(target = currentMonster) {
  if (!player || !target || Number(target.currentHp || 0) <= 0 || !window.CombatResourceManager) return false;
  normalizeActiveBuffs();
  const buff = player.activeBuffs?.[5317] || player.activeBuffs?.["5317"];
  if (!buff || Number(buff.effects?.abyssForceWeapon || 0) <= 0 || window.CombatResourceManager.get("abyssSphere") <= 0) return false;
  if (Math.random() * 100 >= 25) return false;
  const used = window.CombatResourceManager.consume("abyssSphere",1,"fixed",1);
  if (!used.ok) return false;
  const level = Math.max(1, Number(buff.level || buff.effects?.abyssForceWeaponLevel || 1));
  const derived = typeof calculateDerivedPlayerStats === "function" ? calculateDerivedPlayerStats() : {};
  const spl = Number(derived?.stats?.spl || player?.traitStats?.spl || 0);
  const ratio = Math.floor((150 + 650 * level + 5 * spl) * Number(player.baseLevel || 1) / 100);
  const targets = typeof resolveRuntimeSkillTargets === "function" ? resolveRuntimeSkillTargets({targeting:{origin:"target",shape:"circle",radius:4,maxTargets:999}},target,level) : [target];
  let totalDealt = 0;
  for (const enemy of (targets?.length ? targets : [target])) {
    if (!enemy || Number(enemy.currentHp || 0) <= 0) continue;
    const result = window.CombatDamagePipeline?.resolveMagicSkill({handler:"magic_damage",element:"Neutral",elementSource:"skill"},level,enemy,{ratio,hits:5,skipHitCheck:true});
    if (result?.elementImmune === true) {
      if (typeof showMissNumber === "function") showMissNumber(enemy);
      continue;
    }
    const damage = Math.max(1, Number(result?.damage || 1));
    applyRuntimeCalculatedDamage(enemy,damage,{triggeredByNormalAttack:true,skillId:Number(buff.id||0)});
    totalDealt += damage;
  }
  if (typeof addBattleLog === "function") addBattleLog(`深淵魔力球發動 5 Hit 範圍攻擊，合計造成 ${totalDealt} 點傷害（剩餘 ${used.remaining}/5）。`);
  return totalDealt > 0;
}


const CHARGING_PIERCE_SKILL_IDS = new Set([56,397,2004,5211]);
function isChargingPierceActive() {
  normalizeActiveBuffs();
  return Number(player?.activeBuffs?.[5206]?.effects?.chargingPierce || player?.activeBuffs?.["5206"]?.effects?.chargingPierce || 0) > 0;
}
function isChargingPierceMaxForSkill(skill) {
  const sid=Number(skill?.officialId ?? skill?.id ?? 0);
  return CHARGING_PIERCE_SKILL_IDS.has(sid) && isChargingPierceActive() && Number(window.CombatResourceManager?.get("chargingPierce") || 0) >= 10;
}
function advanceChargingPierceAfterHit(skill) {
  const sid=Number(skill?.officialId ?? skill?.id ?? 0);
  if(!CHARGING_PIERCE_SKILL_IDS.has(sid)||!isChargingPierceActive()||!window.CombatResourceManager)return 0;
  const current=Number(window.CombatResourceManager.get("chargingPierce")||0);
  if(current>=10){window.CombatResourceManager.clear("chargingPierce");return 0;}
  const next=Math.min(10,current+1);
  window.CombatResourceManager.configure("chargingPierce",{max:10,start:next,durationMs:5000,regenIntervalMs:0});
  return next;
}
function consumeVigorHpOnAttack() {
  if(!player)return 0;
  const active=typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals():{};
  const level=Math.max(0,Number(active.vigorLevel||0));
  if(level<=0)return 0;
  const cost=Math.max(0,Number(active.vigorHpCost??(100-10*(level-1))));
  if(cost<=0)return 0;
  player.hp=Math.max(1,Number(player.hp||1)-cost);
  return cost;
}

function applyRuntimeResourceCost(profile, level = 1, skill = null) {
  const cfg=profile?.resourceCost;if(!cfg||!window.CombatResourceManager)return {ok:true,used:0};
  if(isCopiedSkillResourceWaived(skill,profile))return {ok:true,used:0,remaining:Number(window.CombatResourceManager.get(cfg.type)||0),waived:true,copied:true};
  const sid=Number((skill?.officialId ?? skill?.id ?? profile?.skillId) || 0), active=typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals():{};
  if(cfg.type==="spiritSphere"){
    const waived=(sid===2329&&Number(active.waiveFallenEmpireSphereCost||0)>0)||(sid===2330&&Number(active.waiveTigerCannonSphereCost||0)>0)||(sid===5009&&Number(active.waiveFlashComboSphereCost||0)>0)||(sid===2332&&Number(active.massiveFlameBlaster||0)>0)||(sid===2518&&Number(active.massiveFlameBlaster||0)>0);
    if(waived)return {ok:true,used:0,remaining:Number(window.CombatResourceManager.get(cfg.type)||0),waived:true};
  }
  const type=cfg.type, current=Number(window.CombatResourceManager.get(type)||0);
  let amount=Math.max(0,Number(getLevelValue(cfg.amount,level,1)));
  if(cfg.mode==="asura"){
    if(current<Math.max(5,Number(cfg.minimum||5)))return {ok:false,used:0,remaining:current};
    const raising=Number(typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals().spiritSphereMaxBonus||0:0)>0;
    amount=(raising&&current>5)?current:5;
    return window.CombatResourceManager.consume(type,amount,"fixed",5);
  }
  if(amount<=0)return {ok:true,used:0,remaining:current};
  return window.CombatResourceManager.consume(type,amount,cfg.mode||"fixed",Number(cfg.minimum||0));
}
function configureRuntimeResource(profile,level,duration){
  const cfg=profile?.resourceConfig;if(!cfg||!window.CombatResourceManager)return;
  let max=Number(getLevelValue(cfg.max,level,5));
  if(cfg.maxFormula==="five_plus_level")max=5+Number(level||1);
  let start=Number(getLevelValue(cfg.start,level,0));
  if(cfg.startFormula==="max")start=max;
  window.CombatResourceManager.configure(cfg.type,{max,start,regenIntervalMs:getLevelValue(cfg.regenIntervalMs,level,0),regenAmount:Number(cfg.regenAmount||1),durationMs:Number(cfg.durationMs||duration||0)});
}
function targetHasRuntimeStatus(target,status){if(window.StatusManager?.has)return !!window.StatusManager.has(target,status);return !!(target?.runtimeState?.statuses?.[String(status).toLowerCase().replace(/[ _-]/g,"")]||target?.runtimeState?.[status]);}

function grantRuntimeApFromProfile(skill, level, profile, options = {}) {
  if (!player || !profile || profile.apGainMetadata === undefined) return 0;
  let amount = Math.max(0, Math.floor(Number(getLevelValue(profile.apGainMetadata, level, 0))));
  if (amount <= 0) return 0;
  if (profile.stageMannerApBonus === true && typeof getSkillLevel === "function") {
    const mannerLevel = Math.max(0, Number(getSkillLevel(5349) || 0));
    amount += Math.floor(amount * 10 * mannerLevel / 100);
  }
  if (options.fromRetrospection === true) amount += Math.floor(amount * 50 / 100);
  player.maxAp = Math.max(1, Number(player.maxAp || 200));
  player.ap = Math.min(player.maxAp, Math.max(0, Number(player.ap || 0)) + amount);
  window.lastRuntimeApGain = { skillId: Number(skill?.officialId ?? skill?.id ?? 0), amount, fromRetrospection: options.fromRetrospection === true };
  if (!options.silent && typeof addBattleLog === "function") addBattleLog(`${skill.name} AP +${amount}（${player.ap}/${player.maxAp}）。`);
  return amount;
}

function castBuffSkill(skill, requestedLevel = null, options = {}) {
  const check = canCastSkill(skill, requestedLevel, ["buff"], options);
  if (!check.ok) return reportPendingRuntime(skill, check.reason);
  const { level, profile } = check;
  player.activeBuffs = player.activeBuffs || {};
  normalizeActiveBuffs();

  if (profile.performanceAction === "cancel_latest") {
    const activePerformances = Object.entries(player.activeBuffs || {})
      .filter(([, buff]) => Number(buff?.sustainedSpCostPer5s || 0) > 0)
      .sort((a, b) => Number(b[1]?.performanceActivationOrder || b[1]?.activatedAt || 0) - Number(a[1]?.performanceActivationOrder || a[1]?.activatedAt || 0));
    if (!activePerformances.length) {
      if (!options.silent && typeof addBattleLog === "function") addBattleLog(`${skill.name}：目前沒有正在維持的演奏。`);
      return false;
    }
    if (!options.skipCost) paySkillCost(skill, level);
    const [activeId, activeBuff] = activePerformances[0];
    if (typeof clearSustainedPerformanceAura === "function") clearSustainedPerformanceAura(activeBuff);
    delete player.activeBuffs[activeId];
    if (typeof recalculatePlayerStats === "function") recalculatePlayerStats();
    if (typeof updateMonsterUI === "function") updateMonsterUI();
    if (typeof updatePlayerUI === "function") updatePlayerUI();
    if (typeof saveGame === "function") saveGame();
    if (!options.silent && typeof addBattleLog === "function") addBattleLog(`${skill.name}：已解除 ${activeBuff?.name || "最後一首演奏"}。`);
    return true;
  }

  if (profile.performanceAction === "random_cancel_chorus") {
    if (!options.skipCost) paySkillCost(skill, level);
    const chance=Math.max(0,Math.min(100,Number(getLevelValue(profile.successChancePercent,level,0))));
    if(Math.random()*100>=chance){if(!options.silent&&typeof addBattleLog==="function")addBattleLog(`${skill.name}未能解除合唱效果。`);updatePlayerUI();saveGame();return true;}
    let removed=0;
    for(const id of (profile.clearActiveBuffIds||[])){
      const key=String(id),buff=player.activeBuffs?.[key]||player.activeBuffs?.[id];
      if(!buff)continue;if(typeof clearSustainedPerformanceAura==="function")clearSustainedPerformanceAura(buff);delete player.activeBuffs[key];delete player.activeBuffs[id];removed++;
    }
    const statuses=currentMonster?.runtimeState?.statuses||{};
    for(const name of (profile.clearTargetStatuses||[])){const key=String(name).toLowerCase().replace(/[ _-]/g,"");if(statuses[key]||currentMonster?.runtimeState?.[key])removed++;delete statuses[key];if(currentMonster?.runtimeState)delete currentMonster.runtimeState[key];}
    if(typeof recalculatePlayerStats==="function")recalculatePlayerStats();if(typeof updateMonsterUI==="function")updateMonsterUI();updatePlayerUI();saveGame();
    if(!options.silent&&typeof addBattleLog==="function")addBattleLog(`${skill.name}成功，解除 ${removed} 個合唱效果。`);
    return true;
  }

  if (profile.performanceAction === "retrospection") {
    const lastSkillId = Number(player.lastFourthPerformanceSkillId || 0);
    const lastSkill = lastSkillId > 0 && typeof getSkillDataById === "function" ? getSkillDataById(lastSkillId) : null;
    const lastLevel = Math.max(0, Math.min(Number(player.lastFourthPerformanceSkillLevel || 0), Number(lastSkill?.maxLevel || 0), Number(typeof getSkillLevel === "function" && lastSkill ? getSkillLevel(lastSkill.id) : 0)));
    const lastProfile = lastSkill ? getSkillRuntimeProfile(lastSkill) : null;
    if (!lastSkill || lastLevel <= 0 || lastProfile?.fourthPerformanceSong !== true) {
      if (!options.silent && typeof addBattleLog === "function") addBattleLog(`${skill.name}：沒有可以回顧的上一首四轉演奏。`);
      return false;
    }
    const replayCost = Math.max(0, Math.floor(getRuntimeSkillSpCost(lastSkill, lastLevel) * 70 / 100));
    const ownCost = Math.max(0, Number(getRuntimeSkillSpCost(skill, level) || 0));
    if (Number(player.sp || 0) < ownCost + replayCost) {
      if (!options.silent && typeof addBattleLog === "function") addBattleLog(`${skill.name}：SP 不足，無法重播上一首四轉演奏。`);
      return false;
    }
    if (!options.skipCost) paySkillCost(skill, level);
    player.sp = Math.max(0, Number(player.sp || 0) - replayCost);
    const replayOptions = { silent: options.silent, skipCost: true, ignoreSpCostCheck: true, fromRetrospection: true, recordLastPerformance: false };
    if (lastProfile.handler === "buff") return castBuffSkill(lastSkill, lastLevel, replayOptions);
    if (lastProfile.handler === "timed_status") return castTimedStatusSkill(lastSkill, lastLevel, replayOptions);
    return false;
  }

  if (profile.performanceAction === "encore") {
    const lastSkillId = Number(player.lastPerformanceSkillId || 0);
    const lastSkill = lastSkillId > 0 && typeof getSkillDataById === "function" ? getSkillDataById(lastSkillId) : null;
    const lastLevel = Math.max(0, Math.min(Number(player.lastPerformanceSkillLevel || 0), Number(lastSkill?.maxLevel || 0), Number(typeof getSkillLevel === "function" && lastSkill ? getSkillLevel(lastSkill.id) : 0)));
    const lastProfile = lastSkill ? getSkillRuntimeProfile(lastSkill) : null;
    if (!lastSkill || lastLevel <= 0 || lastProfile?.sustainedPerformance !== true) {
      if (!options.silent && typeof addBattleLog === "function") addBattleLog(`${skill.name}：沒有可以重播的上一首演奏。`);
      return false;
    }
    if (lastProfile.handler === "timed_status" && !currentMonster && lastProfile.affectsSelf !== true) {
      if (!options.silent && typeof addBattleLog === "function") addBattleLog(`${skill.name}：上一首演奏需要目前戰鬥目標。`);
      return false;
    }
    if (!options.skipCost) paySkillCost(skill, level);
    const replayOptions = { silent: options.silent, skipCost: true, ignoreSpCostCheck: true, fromEncore: true };
    if (lastProfile.handler === "buff") return castBuffSkill(lastSkill, lastLevel, replayOptions);
    if (lastProfile.handler === "timed_status") return castTimedStatusSkill(lastSkill, lastLevel, replayOptions);
    return false;
  }
  if (profile.preventRecastWhileActive && player.activeBuffs[skill.id]) {
    if (!options.silent && typeof addBattleLog === "function") addBattleLog(`${skill.name}仍在等待反擊，無法重複施放。`);
    return false;
  }
  if (profile.toggleBuff && player.activeBuffs[skill.id]) {
    delete player.activeBuffs[skill.id];
    if (profile.playerMotionWhileActive) {
      player.state = "Idle";
      if (typeof playROStudioPlayerMotion === "function") playROStudioPlayerMotion("idle", { duration: 1 });
    }
    if (typeof recalculatePlayerStats === "function") recalculatePlayerStats();
    if (typeof updatePlayerUI === "function") updatePlayerUI();
    if (typeof saveGame === "function") saveGame();
    if (!options.silent && typeof addBattleLog === "function") addBattleLog(`解除 ${skill.name}。`);
    return true;
  }
  let requiredBuffEntry = null;
  if (Array.isArray(profile.requiresActiveBuffEffectAny) && profile.requiresActiveBuffEffectAny.length) {
    requiredBuffEntry = Object.entries(player.activeBuffs || {}).find(([, buff]) =>
      profile.requiresActiveBuffEffectAny.some(key => Number(buff?.effects?.[key] || 0) > 0)
    ) || null;
    if (!requiredBuffEntry) {
      if (!options.silent && typeof addBattleLog === "function") addBattleLog(profile.requiredBuffMessage || `${skill.name}缺少必要狀態。`);
      return false;
    }
  }
  const duration = getRuntimeDuration(skill, level);
  if (duration <= 0) return reportPendingRuntime(skill, "Runtime 缺少有效持續時間");
  const resource = applyRuntimeResourceCost(profile, level, skill);
  if (!resource.ok) { if (!options.silent) addBattleLog(`${skill.name} 所需戰鬥資源不足。`); return false; }
  if (!options.skipCost) paySkillCost(skill, level);
  if(profile.selfHpRateCost){const rate=Math.max(0,Number(getLevelValue(profile.selfHpRateCost,level,0)));player.hp=Math.max(1,Number(player.hp||1)-Math.floor(Number(player.maxHp||1)*rate/100));}
  if(profile.restoreHpToFull) player.hp=player.maxHp;
  if(profile.restoreHpRate!==undefined){const rate=Math.max(0,Number(getLevelValue(profile.restoreHpRate,level,0)));player.hp=Math.min(Number(player.maxHp||1),Number(player.hp||0)+Math.floor(Number(player.maxHp||1)*rate/100));}
  if(profile.restoreSpRate!==undefined){const rate=Math.max(0,Number(getLevelValue(profile.restoreSpRate,level,0)));player.sp=Math.min(Number(player.maxSp||0),Number(player.sp||0)+Math.floor(Number(player.maxSp||0)*rate/100));}
  configureRuntimeResource(profile,level,duration);
  player.activeBuffs = player.activeBuffs || {};
  const runtimeEffects = collectRuntimeEffects(profile, level);
  if(profile.dynamicEffectFormula==="renewal_clementia"){
    const blessLv=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(34):0))+Math.floor(Number(player?.jobLevel||50)/10);
    runtimeEffects.strFlat=blessLv;runtimeEffects.dexFlat=blessLv;runtimeEffects.intFlat=blessLv;
  }
  if(profile.dynamicEffectFormula==="renewal_canto"){
    const agiLv=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(29):0))+Math.floor(Number(player?.jobLevel||50)/10);
    runtimeEffects.agiFlat=2+agiLv;runtimeEffects.walkSpeedRate=-25;
  }
  if(profile.dynamicEffectFormula==="renewal_whistle"){
    const derived=typeof calculateDerivedPlayerStats==="function"?calculateDerivedPlayerStats():null;
    const agi=Number(derived?.stats?.agi||player?.stats?.agi||1),luk=Number(derived?.stats?.luk||player?.stats?.luk||1);
    const mastery=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(315):0));
    runtimeEffects.fleeFlat=level+Math.floor(agi/10)+Math.floor(mastery/2);
    runtimeEffects.perfectDodgeFlat=Math.floor((level+1)/2)+Math.floor(luk/30)+Math.floor(mastery/5);
  }
  if(profile.dynamicEffectFormula==="renewal_assassin_cross"){
    const derived=typeof calculateDerivedPlayerStats==="function"?calculateDerivedPlayerStats():null;
    const agi=Number(derived?.stats?.agi||player?.stats?.agi||1);
    const mastery=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(315):0));
    runtimeEffects.aspdRate=5+level+Math.floor(agi/20)+Math.floor(mastery/2);
  }
  if(profile.dynamicEffectFormula==="renewal_humming"){
    const derived=typeof calculateDerivedPlayerStats==="function"?calculateDerivedPlayerStats():null;
    const dex=Number(derived?.stats?.dex||player?.stats?.dex||1);
    const mastery=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(323):0));
    runtimeEffects.hitFlat=1+2*level+Math.floor(dex/10)+mastery;
  }
  if(profile.dynamicEffectFormula==="renewal_poem_bragi"){
    const derived=typeof calculateDerivedPlayerStats==="function"?calculateDerivedPlayerStats():null;
    const dex=Number(derived?.stats?.dex||player?.stats?.dex||1),intStat=Number(derived?.stats?.int||player?.stats?.int||1);
    const mastery=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(315):0));
    runtimeEffects.variableCastReductionRate=3*level+Math.floor(dex/10)+mastery;
    runtimeEffects.afterCastDelayReductionRate=(level<10?3*level:50)+Math.floor(intStat/5)+2*mastery;
  }
  if(profile.dynamicEffectFormula==="renewal_apple_idun"){
    const derived=typeof calculateDerivedPlayerStats==="function"?calculateDerivedPlayerStats():null;
    const vit=Number(derived?.stats?.vit||player?.stats?.vit||1);
    const mastery=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(315):0));
    runtimeEffects.maxHpRate=5+2*level+Math.floor(vit/10)+Math.floor(mastery/2);
    runtimeEffects.hpRecoveryRate=10+5*level+mastery;
  }
  if(profile.dynamicEffectFormula==="renewal_fortune_kiss"){
    const derived=typeof calculateDerivedPlayerStats==="function"?calculateDerivedPlayerStats():null;
    const luk=Number(derived?.stats?.luk||player?.stats?.luk||1);
    const mastery=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(323):0));
    runtimeEffects.criFlat=10+level+Math.floor(luk/10)+Math.floor(mastery/2);
  }
  if(profile.dynamicEffectFormula==="renewal_service_for_you"){
    const derived=typeof calculateDerivedPlayerStats==="function"?calculateDerivedPlayerStats():null;
    const intStat=Number(derived?.stats?.int||player?.stats?.int||1);
    const mastery=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(323):0));
    runtimeEffects.maxSpRate=15+level+Math.floor(intStat/10)+Math.floor(mastery/2);
    runtimeEffects.spCostReductionRate=20+3*level+Math.floor(intStat/10)+Math.floor(mastery/2);
  }
  if(profile.dynamicEffectFormula==="renewal_swing_dance"){
    const lesson=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(2412):0));
    const value=3*level+lesson; runtimeEffects.aspdRate=value; runtimeEffects.walkSpeedRate=-value;
  }
  if(profile.dynamicEffectFormula==="renewal_symphony_lovers"){
    const lesson=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(2412):0));
    runtimeEffects.mdefRate=2*level+lesson+Math.floor(Number(player?.jobLevel||1)/4);
    runtimeEffects.elementResistHoly=3*level; runtimeEffects.elementResistGhost=3*level;
  }
  if(profile.dynamicEffectFormula==="renewal_moonlit_serenade"){
    const lesson=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(2412):0));
    runtimeEffects.matkFlat=4+3*level+lesson+Math.floor(Number(player?.jobLevel||1)/5);
  }
  if(profile.dynamicEffectFormula==="renewal_rush_windmill"){
    const lesson=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(2412):0));
    runtimeEffects.atkFlat=4+3*level+lesson+Math.floor(Number(player?.jobLevel||1)/5); runtimeEffects.walkSpeedRate=-25;
  }
  if(profile.dynamicEffectFormula==="renewal_echo_song"){
    const lesson=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(2412):0));
    runtimeEffects.defFlat=6*level+lesson+Math.floor(Number(player?.jobLevel||1)/4);
  }
  if(profile.dynamicEffectFormula==="renewal_harmonize_buff"){
    const bonus=5+5*level;
    runtimeEffects.strFlat=bonus; runtimeEffects.agiFlat=bonus; runtimeEffects.vitFlat=bonus;
    runtimeEffects.intFlat=bonus; runtimeEffects.dexFlat=bonus; runtimeEffects.lukFlat=bonus;
  }
  if(profile.dynamicEffectFormula==="renewal_circle_nature"){
    runtimeEffects.hpRecoveryRate=50*level;
  }
  if(profile.dynamicEffectFormula==="renewal_song_mana"){
    runtimeEffects.spRecoveryRate=50*level;
  }
  if(profile.dynamicEffectFormula==="renewal_dance_warg"){
    runtimeEffects.aspdRate=5*level;
    runtimeEffects.fixedCastReductionRate=20+10*level;
    runtimeEffects.longPhysicalDamageRate=2*level;
  }
  if(profile.dynamicEffectFormula==="renewal_lerads_dew"){
    const lesson=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(2412):0));
    runtimeEffects.maxHpRate=2+3*level+Math.min(3*lesson,25);
  }
  if(profile.dynamicEffectFormula==="renewal_unlimited_humming"){
    const lesson=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(2412):0));
    runtimeEffects.magicDamageRate=4*level+Math.min(3*lesson,15);
    runtimeEffects.castCannotBeInterrupted=1;
  }
  if(profile.dynamicEffectFormula==="renewal_frigg_song"){
    runtimeEffects.maxHpRate=5*level;
  }
  if(profile.dynamicEffectFormula==="renewal_nibelungen_random"){
    const forced=Number(options?.forcedDynamicRoll);
    const roll=Number.isFinite(forced)?Math.max(0,Math.min(10,Math.floor(forced))):Math.floor(Math.random()*11);
    runtimeEffects.nibelungenEffectIndex=roll+1;
    if(roll===0)runtimeEffects.aspdRate=20;
    else if(roll===1)runtimeEffects.atkRate=20;
    else if(roll===2)runtimeEffects.matkRate=20;
    else if(roll===3)runtimeEffects.maxHpRate=30;
    else if(roll===4)runtimeEffects.maxSpRate=30;
    else if(roll===5){runtimeEffects.strFlat=15;runtimeEffects.agiFlat=15;runtimeEffects.vitFlat=15;runtimeEffects.intFlat=15;runtimeEffects.dexFlat=15;runtimeEffects.lukFlat=15;}
    else if(roll===6)runtimeEffects.hitFlat=50;
    else if(roll===7)runtimeEffects.fleeFlat=50;
    else if(roll===8)runtimeEffects.spCostReductionRate=30;
    else if(roll===9)runtimeEffects.hpRecoveryRate=100;
    else runtimeEffects.spRecoveryRate=100;
  }
  if(profile.dynamicEffectFormula==="renewal_camouflage"){
    runtimeEffects.camouflageLevel=level;
    runtimeEffects.stealthField=1;
    runtimeEffects.breakOnAttack=1;
    if(level<=2) runtimeEffects.movementLocked=1;
    else if(level===3) runtimeEffects.walkSpeedRate=50;
    else if(level===4) runtimeEffects.walkSpeedRate=25;
  }
  if(profile.dynamicEffectFormula==="renewal_lightning_walk"){
    runtimeEffects.lightningWalk=1;
    runtimeEffects.lightningWalkBlockChance=Math.max(0,Math.min(100,Math.floor(Number(player?.jobLevel||1)/2)+40+5*level));
  }
  if(profile.dynamicEffectFormula==="renewal_crescent_elbow"){
    runtimeEffects.crescentElbow=1;
    runtimeEffects.crescentElbowLevel=level;
    runtimeEffects.crescentElbowChance=Math.max(0,Math.min(100,Math.floor(Number(player?.jobLevel||1)/2)+50+5*level));
    runtimeEffects.crescentElbowNoKnockback=1;
  }
  if(profile.dynamicEffectFormula==="renewal_gentle_touch_change"){
    const derived=typeof calculateDerivedPlayerStats==="function"?calculateDerivedPlayerStats():null;
    const agi=Number(derived?.stats?.agi||player?.stats?.agi||1);
    runtimeEffects.physicalDamageRate=level;
    runtimeEffects.atkFlat=8*level;
    runtimeEffects.aspdRate=Math.floor(agi*level/60);
    runtimeEffects.gentleTouchChange=1;
  }
  if(profile.dynamicEffectFormula==="renewal_gentle_touch_revitalize"){
    runtimeEffects.maxHpRate=2*level;
    runtimeEffects.hpRecoveryRate=30*level+50;
    runtimeEffects.defRate=20*level;
    runtimeEffects.gentleTouchRevitalize=1;
  }
  if(profile.dynamicEffectFormula==="renewal_striking"){
    const weaponId=player?.equipment?.weapon,weapon=weaponId&&typeof getItemData==="function"?getItemData(weaponId):null;
    const weaponLevel=Math.max(0,Number(weapon?.weaponLevel??weapon?.WeaponLevel??0));
    runtimeEffects.atkFlat=20*level*weaponLevel;
    runtimeEffects.perfectHitRate=20+10*level;
  }
  if(profile.dynamicEffectFormula==="renewal_spell_fist"){
    const boltRows=[
      {id:14,element:"Water"},{id:19,element:"Fire"},{id:20,element:"Wind"}
    ].map(row=>({...row,skill:typeof getSkillDataById==="function"?getSkillDataById(row.id):null,learned:Number(typeof getSkillLevel==="function"?getSkillLevel(row.id)||0:0)})).filter(row=>row.skill&&row.learned>0);
    if(!boltRows.length){if(!options.silent&&typeof addBattleLog==="function")addBattleLog(`${skill.name}需要先學會冰箭術、火箭術或雷擊術。`);return false;}
    const highest=Math.max(...boltRows.map(row=>row.learned));
    const selected=boltRows.filter(row=>row.learned===highest)[0];
    runtimeEffects.spellFist=1;
    runtimeEffects.spellFistLevel=level;
    runtimeEffects.spellFistBoltSkillId=selected.id;
    runtimeEffects.spellFistBoltLevel=selected.learned;
    runtimeEffects.spellFistElement=selected.element;
    runtimeEffects.spellFistRatio=20*level+100*selected.learned;
  }
  if (Number(runtimeEffects.kyrieBarrierMaxHpRate || 0) > 0) {
    runtimeEffects.kyrieBarrierHp = Math.max(1, Math.floor(Number(player.maxHp || 1) * Number(runtimeEffects.kyrieBarrierMaxHpRate) / 100) + Number(runtimeEffects.kyrieBarrierFlat||0));
    runtimeEffects.kyrieBarrierMaxHp = runtimeEffects.kyrieBarrierHp;
  }
  // Guardian Shield: the profile's shieldBarrierRate is the barrier capacity
  // percentage. Snapshot the capacity on cast so later MaxHP changes do not
  // silently refill an already-active barrier.
  if (Number(runtimeEffects.shieldBarrierRate || 0) > 0) {
    runtimeEffects.shieldBarrierHp = Math.max(1, Math.floor(Number(player.maxHp || 1) * Number(runtimeEffects.shieldBarrierRate) / 100));
    runtimeEffects.shieldBarrierMaxHp = runtimeEffects.shieldBarrierHp;
  }
  if (Array.isArray(profile?.effects?.clearStatuses)) {
    const statuses = player?.runtimeState?.statuses || {};
    profile.effects.clearStatuses.forEach(name => { delete statuses[String(name).toLowerCase().replace(/[ _-]/g, "")]; });
  }
  if(Array.isArray(profile.clearStatusesOnlyWhenPresent)){
    const statuses=player?.runtimeState?.statuses||{};
    const normalize=v=>String(v).toLowerCase().replace(/[ _-]/g,"");
    const present=profile.clearStatusesOnlyWhenPresent.filter(name=>statuses[normalize(name)]||player?.runtimeState?.[normalize(name)]);
    if(present.length){
      const chance=Math.max(0,Math.min(100,Number(getLevelValue(profile.clearStatusesChancePercent,level,100))));
      if(Math.random()*100<chance){for(const name of present){delete statuses[normalize(name)];delete player.runtimeState[normalize(name)];} if(!options.silent)addBattleLog(`${skill.name}解除自身異常狀態。`);}
      else if(!options.silent)addBattleLog(`${skill.name}未能解除異常狀態。`);
      if(profile.skipBuffWhenStatusPresent){updatePlayerUI();saveGame();return true;}
    }
  }
  if(profile.exclusiveBuffGroup){ Object.keys(player.activeBuffs).forEach(k=>{if(player.activeBuffs[k]?.exclusiveBuffGroup===profile.exclusiveBuffGroup)delete player.activeBuffs[k];}); }
  if (Number(runtimeEffects.summonedElementalSpirit || 0) > 0 || Number(runtimeEffects.summonedHighElemental || 0) > 0) {
    Object.keys(player.activeBuffs).forEach(key => {
      const effects = player.activeBuffs[key]?.effects || {};
      if (Number(effects.summonedElementalSpirit || 0) > 0 || Number(effects.summonedHighElemental || 0) > 0) delete player.activeBuffs[key];
    });
  }
  if (requiredBuffEntry && Array.isArray(profile.consumeActiveBuffEffectAny) && profile.consumeActiveBuffEffectAny.length) {
    const [, requiredBuff] = requiredBuffEntry;
    if (profile.consumeActiveBuffEffectAny.some(key => Number(requiredBuff?.effects?.[key] || 0) > 0)) delete player.activeBuffs[requiredBuffEntry[0]];
  }
  const resolvedWeaponElement = runtimeEffects?.attackElementOverride;
  if (resolvedWeaponElement !== undefined && resolvedWeaponElement !== null && resolvedWeaponElement !== "") {
    window.cancelConverterForSkillWeaponEndow?.(skill.name || "武器屬性附加技能");
  }
  const resolvedArmorElement = runtimeEffects?.armorElement;
  if (resolvedArmorElement !== undefined && resolvedArmorElement !== null && resolvedArmorElement !== "") {
    window.cancelPreviousArmorElementEndow?.(skill.name || "鎧甲屬性附加技能");
  }
  const performanceActivationOrder = profile.sustainedPerformance === true
    ? (player.performanceActivationSequence = Number(player.performanceActivationSequence || 0) + 1)
    : 0;
  player.activeBuffs[skill.id] = {
    id: skill.id, name: skill.name, level,
    effects: runtimeEffects, exclusiveBuffGroup: profile.exclusiveBuffGroup||null, periodicSpDrainRate:getLevelValue(profile.periodicSpDrainRate,level,0), periodicSpDrainFlat:getLevelValue(profile.periodicSpDrainFlat,level,0), periodicIntervalMs:Number(profile.periodicIntervalMs||1000), lastPeriodicTick:Date.now(), periodicHpHealRate:getLevelValue(profile.periodicHpHealRate,level,0), periodicHpHealFlat:getLevelValue(profile.periodicHpHealFlat,level,0), periodicHpIntervalMs:Number(profile.periodicHpHealIntervalMs||profile.periodicIntervalMs||5000), lastPeriodicHpTick:Date.now(), periodicHealFormula:profile.periodicHealFormula||null, periodicHealLevel:level, lastPeriodicFormulaTick:Date.now(), periodicSpHealRate:getLevelValue(profile.periodicSpHealRate,level,0), periodicSpHealFlat:getLevelValue(profile.periodicSpHealFlat,level,0), periodicSpHealIntervalMs:Number(profile.periodicSpHealIntervalMs||profile.periodicIntervalMs||5000), lastPeriodicSpHealTick:Date.now(), periodicClearStatuses:Array.isArray(profile.periodicClearStatuses)?profile.periodicClearStatuses.slice():[], afterEffect:profile.afterEffect||null,
    remainingHits: profile.hitLimit !== undefined ? Number(profile.hitLimit) : null,
    remainingCasts: profile.castChargeLimit !== undefined ? Number(profile.castChargeLimit) : null,
    sustainedSpCostPer5s: profile.sustainedPerformance ? Number(getLevelValue(profile.sustainedSpCostPer5s, level, 0)) : 0,
    performancePulseFormula: profile.performancePulseFormula || null,
    performancePulseIntervalMs: Number(profile.performancePulseIntervalMs || 0),
    performancePulseRadius: Number(getLevelValue(profile.performancePulseRadius, level, 0)),
    performancePulseValue: Number(getLevelValue(profile.performancePulseValue, level, 0)),
    performancePulseStatusDurationMs: Number(getLevelValue(profile.performancePulseStatusDurationMs, level, 0)),
    performancePulseChancePercent: Number(getLevelValue(profile.performancePulseChancePercent, level, 100)),
    performancePulseAffectsBoss: profile.performancePulseAffectsBoss === true,
    performanceAuraStatus: profile.performanceAuraStatus || null,
    performanceAuraStatuses: Array.isArray(profile.performanceAuraStatuses) ? profile.performanceAuraStatuses.slice() : [],
    lastPerformancePulseAt: profile.performancePulseImmediate === true ? Date.now() - Number(profile.performancePulseIntervalMs || 0) : Date.now(),
    activatedAt: Date.now(),
    performanceActivationOrder,
    startedAt: Date.now(),
    expiresAt: Date.now() + duration
  };
  if (profile.playerMotionWhileActive) {
    player.state = profile.playerMotionWhileActive === "dead" ? "TrickDead" : String(profile.playerMotionWhileActive);
    if (typeof playROStudioPlayerMotion === "function") {
      playROStudioPlayerMotion(profile.playerMotionWhileActive, { holdLast: true, duration });
    }
  }
  if (profile.sustainedPerformance === true && options.recordLastPerformance !== false) {
    player.lastPerformanceSkillId = Number(skill.id);
    player.lastPerformanceSkillLevel = Number(level);
  }
  if (profile.fourthPerformanceSong === true && options.recordLastPerformance !== false) {
    player.lastFourthPerformanceSkillId = Number(skill.id);
    player.lastFourthPerformanceSkillLevel = Number(level);
  }
  grantRuntimeApFromProfile(skill, level, profile, options);
  if (Number(runtimeEffects.revealHidden || 0) > 0 && typeof revealHiddenMonstersAroundPlayer === "function") {
    const revealed = revealHiddenMonstersAroundPlayer(Number(runtimeEffects.revealHiddenRadius || profile.revealHiddenRadius || 3));
    if (revealed > 0 && !options.silent && typeof addBattleLog === "function") addBattleLog(`${skill.name}發現了 ${revealed} 個隱匿目標。`);
  }
  recalculatePlayerStats();
  if (profile.restoreHpToFullAfterBuff === true) player.hp = Number(player.maxHp || 1);
  updatePlayerUI(); saveGame();
  if (Number(runtimeEffects.summonedElementalSpirit || 0) > 0 || Number(runtimeEffects.summonedHighElemental || 0) > 0) {
    if (typeof notifyVirtualSummonStateChanged === "function") notifyVirtualSummonStateChanged();
  }
  if (!options.silent) addBattleLog(`施放 ${skill.name} Lv${level}。`);
  return true;
}

function castGroundDebuffSkill(skill, requestedLevel = null) {
  const check = canCastSkill(skill, requestedLevel, ["ground_debuff"]);
  if (!check.ok) return reportPendingRuntime(skill, check.reason);
  if (!currentMonster || !window.GroundEffectManager || !window.GroundPlacementResolver) return false;
  const { level, profile } = check;
  const skillRange = typeof getSkillRangePx === "function" ? getSkillRangePx(skill, level) : null;
  if (profile.skipPrimaryRangeCheck !== true && typeof canAttackMonsterByRange === "function" && !canAttackMonsterByRange(currentMonster, skillRange)) {
    if (typeof movePlayerTowardMonster === "function") movePlayerTowardMonster(currentMonster, skillRange);
    addBattleLog(`${skill.name} 距離不足，正在靠近目標。`); return false;
  }
  const spec = getRuntimeGroundAttackSpec(skill, profile, level);
  const durationMs = Math.max(100, Number(getLevelValue(profile.groundDuration ?? profile.duration ?? spec.durationMs, level, spec.durationMs)) || spec.durationMs);
  const tickMs = Math.max(16, Number(getLevelValue(profile.tickIntervalMs ?? spec.tickIntervalMs, level, spec.tickIntervalMs)) || spec.tickIntervalMs);
  const initialDelayMs = Math.max(0, Number(getLevelValue(profile.initialDelayMs ?? spec.initialDelayMs, level, spec.initialDelayMs)) || 0);
  const maxTicks = Math.max(1, Number(getLevelValue(profile.maxTicks ?? spec.maxTicks, level, spec.maxTicks)) || spec.maxTicks);
  const maxTargets = Math.max(1, Number(getLevelValue(profile.maxTargets ?? profile.targeting?.maxTargets ?? spec.maxTargets, level, spec.maxTargets)) || spec.maxTargets);
  const placement = resolveRuntimeGroundCastPosition(skill, profile, level, currentMonster);
  if (!placement.ok) { addBattleLog(`${skill.name}：${getRuntimeGroundBlockText(placement.reason)}。`); return false; }
  const stackKey = spec.noOverlap ? `ground_skill_${Number(skill?.officialId ?? skill?.id)}` : null;
  const effectId = window.GroundEffectManager.create({
    id:`skill_${skill.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    x:placement.x, y:placement.y, shape:spec.shape, rangeCells:spec.radiusCells,
    tickMs, durationMs, initialDelayMs, maxTicks, isGroundMagic:true,
    sourceSkillId:Number(skill?.officialId ?? skill?.id), ownerKey:"player",
    stackKey, noOverlapKey:spec.noOverlap ? stackKey : null,
    overlapPolicy:spec.overlapPolicy, activeInstanceLimit:spec.activeInstanceLimit,
    ignoreLandProtector:profile.ignoreLandProtector===true,
    metadata:{skillId:Number(skill?.officialId ?? skill?.id),skillName:skill.name,level,maxTargets,totalHits:0},
    onTick(targets,effect){
      for (const target of (targets || []).slice(0,maxTargets)) {
        if (!target || Number(target.currentHp ?? target.hp ?? 0) <= 0) continue;
        if (!matchesRuntimeTargetConditions(profile, target)) continue;
        if (applyAttackRuntimeStatus(profile, level, target)) effect.metadata.totalHits = Number(effect.metadata.totalHits || 0) + 1;
        const knockbackCells = Math.max(0, (Number(getLevelValue(profile.knockbackCells, level, 0)) || 0) + getCardSkillKnockbackBonus(skill));
        if (knockbackCells > 0) window.MovementEffectResolver?.knockback(target, player, knockbackCells);
      }
      if (typeof updateMonsterUI === "function") updateMonsterUI();
    }
  });
  if (!effectId) { addBattleLog(`${skill.name}：${getRuntimeGroundBlockText(window.GroundEffectManager.lastBlockReason)}。`); return false; }
  const resource = applyRuntimeResourceCost(profile, level, skill);
  if (!resource.ok) { window.GroundEffectManager.remove(effectId); addBattleLog(`${skill.name} 所需戰鬥資源不足。`); return false; }
  paySkillCost(skill, level);
  addBattleLog(profile.trapMaterialPolicy === "ignored"
    ? `施放 ${skill.name} Lv${level}：陷阱已設置在目前目標位置（不消耗陷阱道具）。`
    : `施放 ${skill.name} Lv${level}，效果建立在目標位置。`);
  updatePlayerUI(); saveGame();
  return true;
}

function castSanctuarySkill(skill, requestedLevel = null) {
  const check = canCastSkill(skill, requestedLevel, ["sanctuary_area"]);
  if (!check.ok) return reportPendingRuntime(skill, check.reason);
  if (!window.GroundEffectManager) return reportPendingRuntime(skill, "地面效果管理器尚未載入");
  const { level, profile } = check;
  paySkillCost(skill, level);
  const durationMs = Math.max(1000, Number(getLevelValue(profile.duration, level, 1000)));
  const tickMs = Math.max(100, Number(profile.tickIntervalMs || 1000));
  const radius = Number(profile?.targeting?.radius ?? 2);
  const x = Number(player?.position?.x ?? player?.worldX ?? player?.x ?? 0);
  const y = Number(player?.position?.y ?? player?.worldY ?? player?.y ?? 0);
  const healBase = Math.max(1, Number(getLevelValue(profile.heal, level, 1)));
  window.GroundEffectManager.create({
    id:`sanctuary_${skill.id}_${Date.now()}`, x, y, shape:"circle", rangeCells:radius,
    tickMs, durationMs, maxTicks:Math.max(1,Math.ceil(durationMs/tickMs)), isGroundMagic:true, sourceSkillId:skill.id, ignoreLandProtector:profile.ignoreLandProtector===true,
    onTick(targets,effect){
      if (window.AreaShapeResolver?.inRange(effect, player, "circle", radius)) {
        const heal = Math.max(1, applyRuntimeHealingModifiers(healBase, {source:player,target:player,healingCategory:RUNTIME_HEALING_CATEGORIES.PERIODIC_SKILL_HEAL,includeOffertorium:true}));
        player.hp = Math.min(Number(player.maxHp || 1), Number(player.hp || 0) + heal);
      }
      for (const target of targets || []) {
        if (!matchesRuntimeTargetConditions(profile, target)) continue;
        const damage = Math.max(1, Math.floor(healBase * Number(profile.damageRatioPercent || 50) / 100));
        target.currentHp = Math.max(0, Number(target.currentHp || 0) - damage);
        if (target === currentMonster && target.currentHp <= 0 && typeof defeatMonster === "function") { defeatMonster(); break; }
      }
      if (typeof updatePlayerUI === "function") updatePlayerUI();
      if (typeof updateMonsterUI === "function") updateMonsterUI();
    }
  });
  addBattleLog(`施放 ${skill.name} Lv${level}，光耀之堂建立在目前位置。`);
  updatePlayerUI(); saveGame();
  return true;
}

function castTeleportSkill(skill, requestedLevel = null) {
  const check = canCastSkill(skill, requestedLevel, ["teleport"]);
  if (!check.ok) return reportPendingRuntime(skill, check.reason);
  if (player?.currentCity) {
    addBattleLog(`${skill.name} 在城鎮內無法使用。`);
    return false;
  }
  if (typeof randomPositionInBattleField !== "function" || typeof clampPositionToBounds !== "function") {
    return reportPendingRuntime(skill, "Position Engine 尚未就緒");
  }
  paySkillCost(skill, check.level);
  const previousTarget = currentMonster || null;
  const candidate = randomPositionInBattleField("player");
  if (typeof normalizePositionData === "function") normalizePositionData();
  const position = clampPositionToBounds(candidate, "player");
  player.position = player.position || {};
  player.position.x = position.x;
  player.position.y = position.y;
  player.position.targetX = null;
  player.position.targetY = null;
  if (previousTarget) previousTarget.aiState = "IDLE";
  if (typeof onAutoBattleTeleportCompleted === "function") onAutoBattleTeleportCompleted(previousTarget, { source:"skill", skillId:skill.id });
  else currentMonster = null;
  if (typeof renderPositionSprites === "function") renderPositionSprites();
  if (typeof updatePlayerUI === "function") updatePlayerUI();
  if (typeof saveGame === "function") saveGame();
  addBattleLog(`${skill.name}：瞬移到 (${Math.round(position.x)}, ${Math.round(position.y)})。`);
  return true;
}

function castMovementSkill(skill, requestedLevel = null) {
  const check = canCastSkill(skill, requestedLevel, ["movement"]);
  if (!check.ok) return reportPendingRuntime(skill, check.reason);
  const { level, profile } = check;
  const resource = applyRuntimeResourceCost(profile, level, skill);
  if (!resource.ok) { addBattleLog(`${skill.name} 所需氣彈不足。`); return false; }
  paySkillCost(skill, level);
  let moved = false;
  if (profile.movementType === "backslide") moved = !!window.MovementEffectResolver?.backslide(player, Number(getLevelValue(profile.movementCells,level,5)), currentMonster);
  if (profile.movementType === "frontslide") moved = !!window.MovementEffectResolver?.frontslide(player, Number(getLevelValue(profile.movementCells,level,7)), currentMonster);
  if (profile.movementType === "snap_to_target" && currentMonster) moved = !!window.MovementEffectResolver?.moveAdjacent(currentMonster);
  if (moved && typeof renderPositionSprites === "function") renderPositionSprites();
  addBattleLog(moved ? `施放 ${skill.name}。` : `${skill.name} 無法移動。`);
  updatePlayerUI(); saveGame();
  return moved;
}

function castTimedStatusSkill(skill, requestedLevel = null, options = {}) {
  const check = canCastSkill(skill, requestedLevel, ["timed_status"], options);
  if (!check.ok) return reportPendingRuntime(skill, check.reason);
  const { level, profile } = check;
  if ((!currentMonster && profile.affectsSelf !== true && profile.sustainedPerformance !== true) || !window.StatusManager) return false;
  const statusSpec = profile.status && typeof profile.status === "object" ? profile.status : { type: profile.status };
  const statusName = statusSpec.type || profile.statusType;
  if (!statusName) return reportPendingRuntime(skill, "Timed Status 缺少狀態名稱");

  const targets = profile.targeting && typeof resolveRuntimeSkillTargets === "function"
    ? resolveRuntimeSkillTargets(profile, currentMonster, level)
    : [currentMonster];
  let chance = Number(getLevelValue(statusSpec.baseChance ?? profile.statusChancePercent, level, 100));
  const jobLevel=Math.max(1,Number(player?.jobLevel||1));
  if(profile.statusChanceFormula==="renewal_white_imprison")chance=40+10*level+Math.floor(jobLevel/4);
  if(profile.statusChanceFormula==="renewal_voice_of_siren"){
    const lesson=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(2412)||0:0));
    chance=6*level+2*lesson+Math.floor(jobLevel/2);
  }
  if(profile.statusChanceFormula==="renewal_deep_sleep_lullaby"){
    const lesson=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(2412)||0:0));
    chance=4*level+2*lesson+Math.floor(Number(player?.baseLevel||1)/15)+Math.floor(jobLevel/5);
  }
  if(profile.statusChanceFormula==="renewal_melody_of_sink"){
    const lesson=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(2412)||0:0));
    chance=5+5*level+lesson;
  }
  if(profile.statusChanceFormula==="renewal_beyond_warcry"){
    const lesson=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(2412)||0:0));
    chance=12+3*level+lesson;
  }

  const durationMs = Math.max(0, Number(getLevelValue(statusSpec.durationMs ?? profile.statusDuration, level, 0)));
  const delayMs = Math.max(0, Number(getLevelValue(statusSpec.delayMs, level, 0)));
  const effects = collectRuntimeEffects({ effects: profile.statusEffects || {} }, level);
  if (profile.statusEffectFormula === "renewal_elemental_change") {
    effects.defenseElementOverride = String(profile.element || effects.defenseElementOverride || "Neutral");
    effects.defenseElementLevelOverride = 1 + Math.floor(Math.random() * 4);
  }
  if (profile.statusEffectFormula === "renewal_dont_forget_me") {
    const derived=typeof calculateDerivedPlayerStats==="function"?calculateDerivedPlayerStats():null;
    const dex=Number(derived?.stats?.dex||player?.stats?.dex||1),agi=Number(derived?.stats?.agi||player?.stats?.agi||1);
    const mastery=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(323):0));
    effects.aspdRate=-Math.max(0,3*level+Math.floor(dex/15)+mastery);
    effects.walkSpeedRate=Math.max(0,2*level+Math.floor(agi/20)+Math.floor(mastery/2));
  }
  if (profile.statusEffectFormula === "renewal_gloomy_day") {
    effects.fleeRate=-(20+5*level);
    effects.outgoingPhysicalDamageRate=-(15+5*level);
    if(Math.random()*100<level)effects.walkSpeedRate=100;
  }
  if (profile.statusEffectFormula === "renewal_melody_of_sink") {
    effects.intFlat=-10*level;
    effects.outgoingMagicDamageRate=-(2+2*level);
  }
  if (profile.statusEffectFormula === "renewal_beyond_warcry") {
    effects.strFlat=-(10+10*level);
    effects.outgoingPhysicalDamageRate=-4*level;
    effects.criFlat=4*level;
  }
  if (profile.statusEffectFormula === "renewal_saturday_night_fever") {
    effects.hitFlat=-(50+50*level);
    effects.fleeFlat=-(20+30*level);
    effects.periodicDamageCurrentHpPercent=1;
    effects.periodicDamageNonLethal=true;
    effects.periodicIntervalMs=Number(getLevelValue(profile.statusEffects?.periodicIntervalMs,level,2000));
    effects.onExpireStatus="saturday_night_fever_exhaustion";
    effects.onExpireDurationMs=3000;
    effects.onExpireEffects={blocksActions:1,rooted:1};
  }

  Object.entries(statusSpec.statReductions || {}).forEach(([stat, values]) => {
    effects[`${stat}Flat`] = -Math.abs(Number(getLevelValue(values, level, 0)));
  });
  Object.entries(statusSpec.statRateReductions || {}).forEach(([stat, values]) => {
    effects[`${stat}Rate`] = -Math.abs(Number(getLevelValue(values, level, 0)));
  });
  const movePenalty = Number(getLevelValue(statusSpec.moveSpeedPenaltyPercent, level, 0));
  if (movePenalty) effects.walkSpeedRate = Math.abs(movePenalty);

  if (profile?.ground?.triggerMode === "stay") {
    if (!currentMonster || !window.GroundEffectManager || !window.GroundPlacementResolver) return false;
    const skillRange = typeof getSkillRangePx === "function" ? getSkillRangePx(skill, level) : null;
    if (typeof canAttackMonsterByRange === "function" && !canAttackMonsterByRange(currentMonster, skillRange)) {
      if (typeof movePlayerTowardMonster === "function") movePlayerTowardMonster(currentMonster, skillRange);
      addBattleLog(`${skill.name} 距離不足，正在靠近目標。`); return false;
    }
    const placement = resolveRuntimeGroundCastPosition(skill, profile, level, currentMonster);
    if (!placement.ok) { addBattleLog(`${skill.name}：${getRuntimeGroundBlockText(placement.reason)}。`); return false; }
    const radius = Math.max(0, Number(getLevelValue(profile.targeting?.radius, level, 1)) || 0);
    const zoneDuration = Math.max(500, Number(getLevelValue(profile.ground.durationMs ?? skill.duration1 ?? durationMs, level, durationMs || 500)) || 500);
    const tickMs = Math.max(100, Number(getLevelValue(profile.ground.tickIntervalMs, level, 500)) || 500);
    const effectId = window.GroundEffectManager.create({
      id:`ground_status_${skill.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      x:placement.x,y:placement.y,shape:profile.targeting?.shape||"circle",rangeCells:radius,
      tickMs,durationMs:zoneDuration,maxTicks:Math.max(1,Math.ceil(zoneDuration/tickMs)),
      sourceSkillId:Number(skill?.officialId??skill?.id),ownerKey:"player",activeInstanceLimit:Math.max(0,Number(skill.activeInstance||profile.ground.activeInstanceLimit||0)),
      stackKey:`ground_status_${Number(skill?.officialId??skill?.id)}`,overlapPolicy:String(profile.ground.overlapPolicy||"stack"),
      isGroundMagic:true,ignoreLandProtector:profile.ignoreLandProtector===true,ignoreHovering:skill?.flags?.IgnoreHovering===true,
      metadata:{skillId:Number(skill?.officialId??skill?.id),skillName:skill.name,level,maxTargets:Number(profile.targeting?.maxTargets||999)},
      onTick(targets){
        for(const target of (targets||[]).slice(0,Number(profile.targeting?.maxTargets||999))){
          if(!target||Number(target.currentHp??target.hp??0)<=0)continue;
          window.StatusManager.apply(target,statusName,{chancePercent:chance,durationMs:Math.max(250,tickMs*2),level,effects,allowBoss:profile.statusAffectsBoss===true});
        }
        if(typeof updateMonsterUI==="function")updateMonsterUI();
      }
    });
    if(!effectId){addBattleLog(`${skill.name}：${getRuntimeGroundBlockText(window.GroundEffectManager.lastBlockReason)}。`);return false;}
    if(!options.skipCost)paySkillCost(skill,level);
    addBattleLog(`施放 ${skill.name} Lv${level}：${radius*2+1}×${radius*2+1} 地面效果持續 ${(zoneDuration/1000).toFixed(zoneDuration%1000?1:0)} 秒。`);
    updateMonsterUI();updatePlayerUI();saveGame();return true;
  }

  if (!options.skipCost) paySkillCost(skill, level);
  if (Array.isArray(profile.mutuallyExclusiveBuffIds)) {
    player.activeBuffs = player.activeBuffs || {};
    for (const buffId of profile.mutuallyExclusiveBuffIds) delete player.activeBuffs[String(buffId)];
  }
  let selfApplied = false;
  if (profile.sustainedPerformance === true) {
    player.activeBuffs = player.activeBuffs || {};
    const performanceActivationOrder = player.performanceActivationSequence = Number(player.performanceActivationSequence || 0) + 1;
    player.activeBuffs[String(skill.id)] = {
      id: skill.id, name: skill.name, level, effects: {},
      sustainedSpCostPer5s: Number(getLevelValue(profile.sustainedSpCostPer5s, level, 0)),
      activatedAt: Date.now(), performanceActivationOrder, startedAt: Date.now(), expiresAt: Date.now() + durationMs,
      performanceAuraStatus: statusName
    };
    player.lastPerformanceSkillId = Number(skill.id);
    player.lastPerformanceSkillLevel = Number(level);
    selfApplied = true;
  }
  if (profile.affectsSelf === true) {
    player.activeBuffs = player.activeBuffs || {};
    const selfEffects = collectRuntimeEffects({ effects: profile.selfStatusEffects || profile.statusEffects || {} }, level);
    player.activeBuffs[String(skill.id)] = { id: skill.id, name: skill.name, level, effects: selfEffects, expiresAt: Date.now() + durationMs };
    selfApplied = true;
  }
  if(profile.primaryGateChanceFormula==="renewal_sienna_execrate"){const gateChance=Math.max(0,Math.min(100,45+5*level+Math.floor(jobLevel/4)));const gateTarget=currentMonster;if(!gateTarget||Math.random()*100>=gateChance){addBattleLog(`施放 ${skill.name} Lv${level}，主要目標抵抗了效果。`);updateMonsterUI();updatePlayerUI();saveGame();return true;}chance=Number(getLevelValue(profile.statusChancePercent,level,100));}
  if(profile.primaryGateChanceFormula==="renewal_saturday_night_fever"){
    const derived=typeof calculateDerivedPlayerStats==="function"?calculateDerivedPlayerStats():null;
    const intStat=Number(derived?.stats?.int||player?.stats?.int||1),lesson=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(2412)||0:0));
    const gateChance=Math.max(0,Math.min(100,Math.floor(intStat/6)+Math.floor(jobLevel/5)+4*level+lesson));
    if(Math.random()*100>=gateChance){addBattleLog(`施放 ${skill.name} Lv${level}，狂亂效果未成功。`);updateMonsterUI();updatePlayerUI();saveGame();return true;}chance=100;
  }
  const applyAdditionalStatuses = target => {
    for (const spec of (profile.additionalStatuses || [])) {
      const extraEffects = collectRuntimeEffects({ effects: spec.effects || {} }, level);
      window.StatusManager?.apply(target, spec.status, {
        chancePercent:Number(getLevelValue(spec.chancePercent, level, 100)),
        durationMs:Number(getLevelValue(spec.durationMs, level, 0)),
        level, effects:extraEffects, allowBoss:spec.allowBoss === true || profile.statusAffectsBoss === true
      });
    }
  };
  let appliedCount = selfApplied ? 1 : 0;
  for (const target of targets || []) {
    if (!target) continue;
    const allowBoss = profile.statusAffectsBoss === true;
    let targetChance=chance;
    if(profile.statusChanceFormula==="renewal_arrullo"){
      const derived=typeof calculateDerivedPlayerStats==="function"?calculateDerivedPlayerStats():null;
      const casterInt=Number(derived?.stats?.int||player?.stats?.int||1),targetInt=Number(target?.stats?.int??target?.int??target?.level??1),targetLuk=Number(target?.stats?.luk??target?.luk??0);
      targetChance=(15+5*level)+casterInt/5+jobLevel/5-targetInt/6-targetLuk/10;
    }
    if(profile.statusChanceFormula==="renewal_wink_charm_monster") targetChance=40+Number(player?.baseLevel||1)-Number(target?.level||target?.baseLevel||1);
    let targetDurationMs=durationMs;
    if(profile.statusDurationFormula==="renewal_deep_sleep_lullaby"){
      const targetInt=Number(target?.stats?.int??target?.int??target?.level??1),targetLv=Math.max(1,Number(target?.level||target?.baseLevel||1));
      targetDurationMs=Math.max(1000,durationMs-(targetInt*50+targetLv*50));
    }
    if(profile.statusDurationFormula==="renewal_sound_of_destruction"){
      const lesson=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(2412)||0:0));
      targetDurationMs=Math.max(1000,durationMs+lesson*500);
    }
    if (delayMs > 0) {
      const finalChance = window.StatusManager.chance(target, statusName, targetChance, { allowBoss });
      if (Math.random() * 100 >= finalChance) continue;
      window.StatusManager.apply(target, `${statusName}_wait`, {
        chancePercent: 100, minimumChance: 100, maximumChance: 100,
        durationMs: delayMs, level, effects: { pendingStatus: statusName }, allowBoss
      });
      appliedCount += 1;
      window.setTimeout(() => {
        if (!target || Number(target.currentHp ?? target.hp ?? 0) <= 0) return;
        window.StatusManager.apply(target, statusName, {
          chancePercent: 100, minimumChance: 100, maximumChance: 100,
          durationMs:targetDurationMs, level, effects, allowBoss
        });
        applyAdditionalStatuses(target);
        if (typeof updateMonsterUI === "function") updateMonsterUI();
      }, delayMs);
    } else {
      const result = window.StatusManager.apply(target, statusName, {
        chancePercent: targetChance, durationMs:targetDurationMs, level, effects, allowBoss
      });
      if (result?.applied) { appliedCount += 1; applyAdditionalStatuses(target); }
    }
  }
  if (appliedCount > 0 && profile.fourthPerformanceSong === true && options.recordLastPerformance !== false) {
    player.lastFourthPerformanceSkillId = Number(skill.id);
    player.lastFourthPerformanceSkillLevel = Number(level);
  }
  if (appliedCount > 0) grantRuntimeApFromProfile(skill, level, profile, options);
  addBattleLog(appliedCount
    ? `施放 ${skill.name} Lv${level}，成功影響 ${appliedCount} 個目標。`
    : `施放 ${skill.name} Lv${level}，但狀態未生效。`);
  updateMonsterUI(); updatePlayerUI(); saveGame();
  return appliedCount > 0;
}

function castDispelSkill(skill, requestedLevel = null) {
  const check = canCastSkill(skill, requestedLevel, ["dispel"]);
  if (!check.ok) return reportPendingRuntime(skill, check.reason);
  if (!currentMonster) return false;
  const { level, profile } = check;
  paySkillCost(skill, level);
  const chance = Math.max(0, Math.min(100, Number(getLevelValue(profile.successChancePercent, level, 100))));
  if (Math.random() * 100 >= chance) {
    addBattleLog(`施放 ${skill.name} Lv${level}，但解除失敗。`);
    updateMonsterUI(); updatePlayerUI(); saveGame();
    return true;
  }
  const state = getMonsterRuntimeState(currentMonster) || {};
  let removed = 0;
  const statuses = state.statuses || {};
  for (const [key, value] of Object.entries(statuses)) {
    if (value?.nonDispellable === true || value?.effects?.nonDispellable === true) continue;
    delete statuses[key]; removed++;
  }
  for (const [key, value] of Object.entries(state)) {
    if (key === "statuses" || !value || typeof value !== "object" || !value.effects) continue;
    if (value.nonDispellable === true || value.effects?.nonDispellable === true) continue;
    delete state[key]; removed++;
  }
  addBattleLog(`施放 ${skill.name} Lv${level}，解除 ${removed} 個可解除狀態。`);
  updateMonsterUI(); updatePlayerUI(); saveGame();
  return true;
}

function castDebuffSkill(skill, requestedLevel = null) {
  const check = canCastSkill(skill, requestedLevel, ["debuff"]);
  if (!check.ok) return reportPendingRuntime(skill, check.reason);
  if (!currentMonster) return false;
  const { level, profile } = check;
  if (!matchesRuntimeTargetConditions(profile, currentMonster)) {
    addBattleLog(`${skill.name} 對此目標無效。`);
    return false;
  }
  const resource=applyRuntimeResourceCost(profile, level, skill); if(!resource.ok){addBattleLog(`${skill.name} 所需戰鬥資源不足。`);return false;}
  paySkillCost(skill, level);
  let chance = getLevelValue(profile.statusChancePercent, level, 100);
  if (profile.statusChanceFormula === "signum_crucis") {
    chance = Math.max(0, Math.min(100, 25 + 4 * level + Number(player?.baseLevel || 1) - Number(currentMonster?.level || currentMonster?.baseLevel || 1)));
  }
  const duration = getLevelValue(profile.statusDuration, level, 0);
  const targets=profile.targeting&&typeof resolveRuntimeSkillTargets==="function"?resolveRuntimeSkillTargets(profile,currentMonster,level):[currentMonster];
  let appliedCount=0;
  for(const target of (targets?.length?targets:[currentMonster])){
    if(Array.isArray(profile.blockedByTargetStatuses) && profile.blockedByTargetStatuses.some(name=>window.StatusManager?.has(target,name))) continue;
    if(Array.isArray(profile.clearTargetStatuses)&&target?.runtimeState?.statuses){
      for(const name of profile.clearTargetStatuses){const key=String(name).toLowerCase().replace(/[ _-]/g,"");delete target.runtimeState.statuses[key];delete target.runtimeState.statuses[name];delete target.runtimeState[name];}
    }
    let targetChance = chance;
    if (profile.statusChanceFormula === "renewal_mandragora") {
      const vit = Number(target?.stats?.vit ?? target?.vit ?? 0);
      const luk = Number(target?.stats?.luk ?? target?.luk ?? 0);
      targetChance = Math.max(10, Math.min(100, 25 + 10 * level - Math.floor((vit + luk) / 5)));
    }
    const statusEffects = collectRuntimeEffects({ effects: profile.statusEffects || {} }, level);
    const result = window.StatusManager?.apply(target, profile.status, {
      chancePercent: targetChance, durationMs: duration, level, effects: statusEffects, allowBoss: profile.statusAffectsBoss === true
    });
    if(result?.applied){
      appliedCount++;
      const drainRate=Math.max(0,Number(getLevelValue(profile.targetSpDrainRate,level,0)));
      if(drainRate>0){
        const maxSp=Math.max(0,Number(target?.maxSp??target?.sp??0));
        if(maxSp>0) target.sp=Math.max(0,Number(target?.sp||0)-Math.floor(maxSp*drainRate/100));
      }
    }
  }
  if (appliedCount) addBattleLog(`施放 ${skill.name} Lv${level}，成功影響 ${appliedCount} 個目標。`);
  else addBattleLog(`施放 ${skill.name} Lv${level}，但狀態未生效。`);
  updateMonsterUI(); updatePlayerUI(); saveGame();
  return appliedCount>0;
}

function castHealSkill(skill, requestedLevel = null) {
  const check = canCastSkill(skill, requestedLevel, ["heal", "heal_fixed"]);
  if (!check.ok) return reportPendingRuntime(skill, check.reason);
  const { level, profile } = check;
  const resource=applyRuntimeResourceCost(profile,level,skill);
  if(!resource.ok){addBattleLog(`${skill.name} 所需戰鬥資源不足。`);return false;}
  paySkillCost(skill, level);
  const derived = typeof calculateDerivedPlayerStats === "function" ? calculateDerivedPlayerStats() : null;
  let healAmount = 0;
  let spRestoreAmount = 0;
  let healingCategory = String(profile.healingCategory || RUNTIME_HEALING_CATEGORIES.SKILL_HEAL);
  if (profile.handler === "heal" && profile.formula === "renewal_heal") {
    const totalInt = Number(derived?.stats?.int || player?.stats?.int || 1);
    const baseLv = Number(player?.baseLevel || 1);
    const matk = Number(derived?.matk || 0);
    healAmount = Math.max(1, Math.floor(((baseLv + totalInt) / 5) * 30 * level / 10 + matk));
  } else if(profile.handler==="heal"&&profile.formula==="renewal_coluceo_heal"){
    const totalInt=Number(derived?.stats?.int||player?.stats?.int||1),baseLv=Number(player?.baseLevel||1),matk=Number(derived?.matk||0);
    const healLv=Math.max(1,Number(typeof getSkillLevel==="function"?getSkillLevel(28):1));
    healAmount=Math.max(1,Math.floor(((baseLv+totalInt)/5)*30*healLv/10+matk));
  } else if(profile.handler==="heal"&&profile.formula==="renewal_highness_heal"){
    const totalInt=Number(derived?.stats?.int||player?.stats?.int||1),baseLv=Number(player?.baseLevel||1),matk=Number(derived?.matk||0);
    const base=Math.max(1,Math.floor(((baseLv+totalInt)/5)*30+matk));
    healAmount=Math.max(1,Math.floor(base*(2+0.3*(level-1))));
  } else if(profile.handler==="heal"&&profile.formula==="renewal_reparatio"){
    healingCategory = RUNTIME_HEALING_CATEGORIES.FIXED_RECOVERY;
    healAmount=Math.max(1,Number(player?.maxHp||derived?.maxHp||1)-Number(player?.hp||0));
  } else if(profile.handler==="heal"&&profile.formula==="renewal_dilectio_heal"){
    const totalInt=Number(derived?.stats?.int||player?.stats?.int||1),baseLv=Number(player?.baseLevel||1),matk=Number(derived?.matk||0);
    const base=Math.max(1,Math.floor(((baseLv+totalInt)/5)*30+matk));
    healAmount=Math.max(1,Math.floor(base*(1.15+0.05*level)));
  } else if (profile.handler === "heal" && profile.formula === "renewal_gentle_touch_cure") {
    healAmount=Math.max(1,Math.floor(120*level+Number(player?.maxHp||1)*level/100));
    const dex=Number(derived?.stats?.dex||player?.stats?.dex||1),baseLv=Number(player?.baseLevel||1);
    const chance=Math.max(0,Math.min(100,level*5+(dex+baseLv)/4-(1+Math.floor(Math.random()*10))));
    if(Math.random()*100<chance){
      player.runtimeState=player.runtimeState||{};player.runtimeState.statuses=player.runtimeState.statuses||{};
      for(const name of profile.clearStatuses||[]){const key=String(name).toLowerCase().replace(/[ _-]/g,"");delete player.runtimeState.statuses[key];delete player.runtimeState[key];}
      if(typeof addBattleLog==="function")addBattleLog(`${skill.name}解除身上的異常狀態。`);
    }
  } else if (profile.handler === "heal" && profile.formula === "ro_web_elemental_cure_self") {
    healingCategory = RUNTIME_HEALING_CATEGORIES.FIXED_RECOVERY;
    const maxHp = Math.max(1, Number(player?.maxHp || derived?.maxHp || 1));
    const maxSp = Math.max(1, Number(player?.maxSp || derived?.maxSp || 1));
    healAmount = Math.max(1, Math.floor(maxHp * Number(profile.restoreMaxHpPercent || 10) / 100));
    spRestoreAmount = Math.max(1, Math.floor(maxSp * Number(profile.restoreMaxSpPercent || 10) / 100));
  } else if (profile.handler === "heal" && profile.formula === "renewal_slim_pitcher_self") {
    healingCategory = RUNTIME_HEALING_CATEGORIES.POTION_PITCHER;
    const potionMap = Array.isArray(profile.levelPotionMap) ? profile.levelPotionMap : [];
    const potionKey = String(potionMap[Math.max(0, level - 1)] || "red");
    const potionRange = profile.potionBaseRanges?.[potionKey] || [1, 1];
    const low = Math.max(0, Number(potionRange[0] || 0));
    const high = Math.max(low, Number(potionRange[1] ?? low));
    const basePotion = Math.floor(low + Math.random() * (high - low + 1));
    const cfg = profile.sourceSkillBonus || {};
    const learnedLevel = id => Math.max(0, Number(typeof getSkillLevel === "function" ? getSkillLevel(Number(id || 0)) || 0 : 0));
    const sourceRate = Number(cfg.selfPerLevel || 10) * level
      + Number(cfg.potionPitcherPerLevel || 10) * learnedLevel(cfg.potionPitcherSkillId || 231)
      + Number(cfg.learningPotionPerLevel || 5) * learnedLevel(cfg.learningPotionSkillId || 227);
    const vit = Math.max(0, Number(derived?.stats?.vit || player?.stats?.vit || 0));
    const targetRate = Number(cfg.targetVitPerPoint || 2) * vit
      + Number(cfg.hpRecoveryPerLevel || 10) * learnedLevel(cfg.hpRecoverySkillId || 4);
    healAmount = Math.floor(basePotion * (100 + sourceRate) / 100);
    healAmount = Math.max(1, Math.floor(healAmount * (100 + targetRate) / 100));
  } else if (profile.handler === "heal_fixed") {
    healingCategory = RUNTIME_HEALING_CATEGORIES.FIXED_RECOVERY;
    healAmount = Math.max(1, Math.floor(getLevelValue(profile.heal, level, 1)));
  } else {
    return reportPendingRuntime(skill, "治療公式尚未實作");
  }
  const offertoriumAllowed = [28,70,2043,2051,5268,5269,5280].includes(Number(skill?.officialId ?? skill?.id));
  healAmount = Math.max(1, applyRuntimeHealingModifiers(healAmount, {source:player,target:player,healingCategory,includeOffertorium:offertoriumAllowed}));
  const beforeHp = Number(player.hp || 0);
  const beforeSp = Number(player.sp || 0);
  player.hp = Math.min(player.maxHp, beforeHp + healAmount);
  if (spRestoreAmount > 0) player.sp = Math.min(player.maxSp, beforeSp + spRestoreAmount);
  const actualHp = Math.max(0, Number(player.hp || 0) - beforeHp);
  const actualSp = Math.max(0, Number(player.sp || 0) - beforeSp);
  updatePlayerUI(); saveGame();
  addBattleLog(actualSp > 0
    ? `施放 ${skill.name} Lv${level}，HP 恢復 ${actualHp}，SP 恢復 ${actualSp}。`
    : `施放 ${skill.name} Lv${level}，HP 恢復 ${actualHp}。`);
  return true;
}

function calculateSkillAttackDamageBase(skill, requestedLevel = null, target = currentMonster, combatOptions = {}) {
  if (!target || !skill) return null;
  const level = clampSkillLevel(skill, requestedLevel);
  if (level <= 0) return null;
  const profile = combatOptions.profileOverride || getSkillRuntimeProfile(skill);
  const effectiveHandler = profile?.damageHandler || profile?.handler;
  if (!profile || !["physical_attack", "physical_attack_size_hits", "physical_attack_formula", "physical_charge", "magic_multihit", "magic_damage", "misc_damage", "warg_sensitive_keen"].includes(effectiveHandler)) return null;
  const derived = combatOptions.derivedStats || window.RO_WEB_COMBAT_EVAL_CONTEXT?.derivedStats || (typeof calculateDerivedPlayerStats === "function" ? calculateDerivedPlayerStats() : null);
  const hitMeta = window.MultiHitResolver ? window.MultiHitResolver.normalize(profile, level) : null;
  let hitCount = hitMeta ? hitMeta.damageHitCount : getRuntimeHitCount(skill, level);
  if (profile.dynamicHitCountResource && window.CombatResourceManager) {
    const cfg = profile.dynamicHitCountResource;
    hitCount = Math.max(1, Math.min(Number(cfg.max || 5), Number(window.CombatResourceManager.get(cfg.type) || 0) + Number(cfg.offset || 0)));
  }
  if(profile.damageHitCount==="consumed_resource") hitCount=Math.max(1,Number(combatOptions.consumedResource||1));
  if (profile.conditionalDamageHitCount) {
    const cfg=profile.conditionalDamageHitCount, activeTotals=window.RO_WEB_COMBAT_EVAL_CONTEXT?.activeBuffTotals||(typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals():{}), active=Number(activeTotals?.[cfg.effect]||0)>0;
    hitCount=Math.max(1,Number(active?cfg.active:cfg.inactive)||hitCount);
  }
  if(profile.dynamicHitCountFormula==="spirit_sphere_groups_of_5"&&window.CombatResourceManager)hitCount=Math.max(1,Math.min(3,Math.floor(Number(window.CombatResourceManager.get("spiritSphere")||0)/5)));
  if(profile.dynamicHitCountFormula==="psychic_wave_weapon_double"){
    const weaponType=String(getEquippedWeaponTypeRuntime()||"").toLowerCase();
    hitCount=(weaponType.includes("staff")||weaponType.includes("book"))?2:1;
  }
  if (profile.formula === "renewal_chain_combo" && getEquippedWeaponTypeRuntime().toLowerCase().includes("knuckle")) hitCount = 6;
  if (effectiveHandler === "physical_attack_size_hits") {
    const rawSize = String(target?.size || target?.Size || "medium").toLowerCase();
    const sizeKey = rawSize.includes("small") || rawSize === "0" ? "small" : (rawSize.includes("large") || rawSize === "2" ? "large" : "medium");
    hitCount = Math.max(1, Number(profile.sizeHitCount?.[sizeKey] || 1));
  }
  if (!hitCount) return null;
  if (effectiveHandler === "misc_damage") {
    if (profile.formula === "renewal_blitz_beat") {
      const raw = getFalconDamageBaseRuntime(level) * Math.max(1, hitCount);
      const result = window.CombatDamagePipeline?.resolveMiscSkill(profile, level, target, { rawDamage: raw, skipHitCheck: true });
      return result ? (result.elementImmune === true ? 0 : Math.max(1, Number(result.damage || 0))) : Math.max(1, raw);
    }
    if (profile.formula === "renewal_falcon_assault") {
      const raw = Math.floor(getFalconDamageBaseRuntime(level) * 5 * (150 + 70 * level) / 100);
      const result = window.CombatDamagePipeline?.resolveMiscSkill(profile, level, target, { rawDamage: raw, skipHitCheck: true });
      return result ? (result.elementImmune === true ? 0 : Math.max(1, Number(result.damage || 0))) : Math.max(1, raw);
    }
    if (profile.formula === "renewal_thorn_trap") {
      const intStat = Number(derived?.stats?.int || player?.stats?.int || 1);
      const raw = Math.max(1, 100 + 200 * level + intStat);
      // Renewal Misc damage skips DEF, but still passes through HIT, card/race/
      // class/range and property stages. HIT is resolved by castAttackSkill.
      const result = window.CombatDamagePipeline?.resolveMiscSkill({...profile,ignoreDefense:true}, level, target, { rawDamage:raw, skipHitCheck:true });
      return result ? (result.elementImmune === true ? 0 : Math.max(1, Number(result.damage || 0))) : raw;
    }
    if (profile.formula === "renewal_cluster_bomb") {
      const dex = Number(derived?.stats?.dex || player?.stats?.dex || 1);
      const intStat = Number(derived?.stats?.int || player?.stats?.int || 1);
      const baseLv = Math.max(1, Number(player?.baseLevel || 1));
      const researchLv = Math.max(0, Number(typeof getSkillLevel === "function" ? getSkillLevel(profile.researchTrapSkillId || 2248) || 0 : 0));
      let miscRaw = Math.floor((level * dex + intStat * 5) * baseLv / 100);
      miscRaw = researchLv > 0 ? Math.floor(miscRaw * 20 * researchLv / 50) : 0;
      const miscResult = window.CombatDamagePipeline?.resolveMiscSkill(profile, level, target, { rawDamage:miscRaw, skipHitCheck:true });
      const weaponProfile = { ...profile, handler:"physical_attack_formula", damageHandler:"physical_attack_formula", formula:null, elementSource:"weapon", attackRangeType:"long", ratio:200 + 100 * level, ignoreFlee:true };
      const weaponResult = window.CombatDamagePipeline?.resolvePhysicalSkill(weaponProfile, level, target, { ratio:200 + 100 * level, hits:1, skipHitCheck:true });
      const combinedDamage=Number(miscResult?.damage||0)+Number(weaponResult?.damage||0);
      if(combinedDamage<=0&&(miscResult?.elementImmune===true||weaponResult?.elementImmune===true))return 0;
      return Math.max(1,combinedDamage);
    }
    if (profile.formula === "renewal_ranger_damage_trap") {
      const dex = Number(derived?.stats?.dex || player?.stats?.dex || 1);
      const intStat = Number(derived?.stats?.int || player?.stats?.int || 1);
      const baseLv = Math.max(1, Number(player?.baseLevel || 1));
      const researchLv = Math.max(0, Number(typeof getSkillLevel === "function" ? getSkillLevel(profile.researchTrapSkillId || 2248) || 0 : 0));
      let miscRaw = Math.floor((level * dex + intStat * 5) * baseLv / 100);
      miscRaw = researchLv > 0 ? Math.floor(miscRaw * 20 * researchLv / 100) : 0;
      const miscProfile = { ...profile, ignoreDefense:true, ignoreElement:true, noCardFix:true };
      const miscResult = window.CombatDamagePipeline?.resolveMiscSkill(miscProfile, level, target, { rawDamage:miscRaw, skipHitCheck:true });
      const weaponProfile = { ...profile, handler:"physical_attack_formula", damageHandler:"physical_attack_formula", formula:null, elementSource:"fixed", element:profile.element || "Neutral", attackRangeType:"long", ratio:100, ignoreFlee:true, ignoreDefense:false, noCardFix:false };
      const weaponResult = window.CombatDamagePipeline?.resolvePhysicalSkill(weaponProfile, level, target, { ratio:100, hits:1, skipHitCheck:true });
      const combinedDamage=Number(miscResult?.damage||0)+Number(weaponResult?.damage||0);
      if(combinedDamage<=0&&(miscResult?.elementImmune===true||weaponResult?.elementImmune===true))return 0;
      return Math.max(1,combinedDamage);
    }
    if (profile.formula === "renewal_hunter_damage_trap") {
      const dex = Number(derived?.stats?.dex || player?.stats?.dex || 1);
      const intStat = Number(derived?.stats?.int || player?.stats?.int || 1);
      const baseLv = Math.max(1, Number(player?.baseLevel || 1));
      const researchLv = Math.max(0, Number(typeof getSkillLevel === "function" ? getSkillLevel(profile.researchTrapSkillId || 2248) || 0 : 0));
      let raw = Math.floor(level * dex * (3 + baseLv / 100) * (1 + intStat / 35));
      raw += Math.floor(raw * (Math.floor(Math.random() * 20) - 10) / 100);
      raw += researchLv * 40;
      if (profile.splitDamageByTargets) raw = Math.floor(raw / Math.max(1, Number(combatOptions.targetCount || 1)));
      const result = window.CombatDamagePipeline?.resolveMiscSkill(profile, level, target, { rawDamage:raw, skipHitCheck:true });
      return result ? (result.elementImmune === true ? 0 : Math.max(1, Number(result.damage || 0))) : Math.max(1, raw);
    }
    if (profile.formula === "renewal_stone_fling") return 50;
    if (profile.formula === "renewal_martyrs_reckoning") return Math.max(1, Math.floor(Number(player?.maxHp || 1) * 0.09) * Math.max(1, hitCount));
    if (profile.formula === "renewal_grand_cross") {
      const atk=Number(derived?.atk||derived?.attack||100), matk=Number(derived?.matkMax||derived?.matk||100);
      return Math.max(1, Math.floor((atk+matk) * (100+40*level)/100));
    }
  }
  if (effectiveHandler === "magic_multihit" || effectiveHandler === "magic_damage") {
    let magicRatio = profile.matkRatio !== undefined ? getLevelValue(profile.matkRatio, level, 100) : getLevelValue(profile.matkRatioPerHit, level, 100);
    let runtimeMagicElementOverride = null;
    if (profile.formula === "renewal_elemental_action") {
      const spec = combatOptions.elementalActionSpec || getElementalActionRuntimeSpec(profile);
      return resolveElementalActionRuntimeDamage(spec, target);
    }
    if (profile.formula === "renewal_pressure") {
      magicRatio = Math.floor((500 + 150 * level) * Math.max(1, Number(player?.baseLevel || 1)) / 100);
    }
    if (profile.formula === "renewal_metallic_sound") {
      const lesson=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(2412)||0:0));
      magicRatio=Math.floor((120*level+60*lesson)*Number(player?.baseLevel||1)/100);
      if(targetHasRuntimeStatus(target,"sleep")||targetHasRuntimeStatus(target,"deep_sleep"))magicRatio+=100;
      if(targetHasRuntimeStatus(target,"soundblend"))magicRatio=Math.floor(magicRatio*150/100);
    }
    if (profile.formula === "renewal_reverberation") {
      magicRatio=Math.floor((700+300*level)*Number(player?.baseLevel||1)/100);
      if(targetHasRuntimeStatus(target,"soundblend"))magicRatio=Math.floor(magicRatio*150/100);
    }
    if (profile.formula === "renewal_metallic_fury") {
      const spl=Number(derived?.stats?.spl??player?.stats?.spl??player?.traitStats?.spl??0);
      const manner=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(5349)||0:0));
      magicRatio=3850*level;
      if(targetHasRuntimeStatus(target,"soundblend"))magicRatio+=800*level+2*manner*spl;
      magicRatio=Math.floor(magicRatio*Number(player?.baseLevel||1)/100);
    }
    if (profile.formula === "renewal_sound_blend") {
      const spl=Number(derived?.stats?.spl??player?.stats?.spl??player?.traitStats?.spl??0);
      magicRatio=Math.floor((120*level+5*spl)*Number(player?.baseLevel||1)/100);
      const active=typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals():{};
      if(Number(active.mysticSymphony||0)>0){magicRatio*=2;const race=String(target?.race??target?.Race??"").toLowerCase();if(race.includes("fish")||race.includes("demihuman")||race.includes("human")||race.includes("魚貝")||race.includes("人型"))magicRatio=Math.floor(magicRatio*150/100);}
    }
    if (profile.formula === "renewal_rhythmical_wave") {
      const spl=Number(derived?.stats?.spl??player?.stats?.spl??player?.traitStats?.spl??0);
      const manner=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(5349)||0:0));
      magicRatio=250+3650*level+25*manner+5*spl;
      const active=typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals():{};
      if(Number(active.mysticSymphony||0)>0)magicRatio+=200+1000*level;
      magicRatio=Math.floor(magicRatio*Number(player?.baseLevel||1)/100);
    }
    if (profile.dynamicMagicRatio === "40_plus_base_level") magicRatio = 40 + Number(player?.baseLevel || 1);
    if(profile.formula==="renewal_demonic_fire") magicRatio=110+20*level;
    if(profile.formula==="renewal_soul_expansion"){
      const intStat=Number(derived?.stats?.int||player?.stats?.int||1),baseLv=Number(player?.baseLevel||1);
      magicRatio=Math.floor((1000+200*level+intStat)*baseLv/100);
      if(targetHasRuntimeStatus(target,"white_imprison"))magicRatio*=Math.max(1,Number(profile.whiteImprisonDamageMultiplier||2));
    }
    if(profile.formula==="renewal_frosty_misty")magicRatio=Math.floor((200+100*level)*Number(player?.baseLevel||1)/100);
    if(profile.formula==="renewal_jack_frost"){
      const frosted=targetHasRuntimeStatus(target,"misty_frost");
      magicRatio=Math.floor(((frosted?1200+600*level:1000+300*level))*Number(player?.baseLevel||1)/100);
    }
    if(profile.formula==="renewal_drain_life"){
      const intStat=Number(derived?.stats?.int||player?.stats?.int||1);
      magicRatio=Math.floor((200*level+intStat)*Number(player?.baseLevel||1)/100);
    }
    if(profile.formula==="renewal_crimson_rock")magicRatio=Math.floor((700+600*level)*Number(player?.baseLevel||1)/100);
    if(profile.formula==="renewal_hell_inferno"){
      const baseLv=Number(player?.baseLevel||1);
      const fireRatio=Math.floor(400*level*baseLv/100),darkRatio=Math.floor(600*level*baseLv/100);
      const fire=window.CombatDamagePipeline?.resolveMagicSkill({...profile,element:"Fire"},level,target,{ratio:fireRatio,hits:1,skipHitCheck:true});
      const dark=window.CombatDamagePipeline?.resolveMagicSkill({...profile,element:"Dark"},level,target,{ratio:darkRatio,hits:1,skipHitCheck:true});
      if(!fire&&!dark)return null;
      return Math.max(1,Number(fire?.damage||0)+Number(dark?.damage||0));
    }
    if(profile.formula==="renewal_comet")magicRatio=Math.floor((2500+700*level)*Number(player?.baseLevel||1)/100);
    if(profile.formula==="renewal_earth_strain")magicRatio=Math.floor((1000+600*level)*Number(player?.baseLevel||1)/100);
    if(profile.formula==="renewal_deadly_projection"){const spl=Number(derived?.stats?.spl||player?.traitStats?.spl||0),baseLv=Number(player?.baseLevel||1);magicRatio=Math.floor((2800*level+5*spl)*baseLv/100);}
    if(profile.formula==="renewal_soul_vulcan_strike"){const spl=Number(derived?.stats?.spl||player?.traitStats?.spl||0),baseLv=Number(player?.baseLevel||1);magicRatio=Math.floor((300*level+3*spl)*baseLv/100);}
    if(profile.formula==="renewal_rock_down"||profile.formula==="renewal_storm_cannon"){const spl=Number(derived?.stats?.spl||player?.traitStats?.spl||0),baseLv=Number(player?.baseLevel||1);magicRatio=Math.floor((1550*level+5*spl)*baseLv/100);}
    if(profile.formula==="renewal_frozen_slash"){const spl=Number(derived?.stats?.spl||player?.traitStats?.spl||0),baseLv=Number(player?.baseLevel||1);magicRatio=Math.floor((450+950*level+5*spl)*baseLv/100);}
    if(profile.formula==="renewal_tetra_vortex_holy") magicRatio=800+400*level;
    if(profile.formula==="renewal_gravitation_field") magicRatio=Math.floor((100*level)*Number(player?.baseLevel||1)/100);
    if(profile.formula==="renewal_rain_of_crystal"){const spl=Number(derived?.stats?.spl||player?.traitStats?.spl||0);magicRatio=Math.floor((180+760*level+5*spl)*Number(player?.baseLevel||1)/100);}
    if(profile.formula==="renewal_mystery_illusion"){const spl=Number(derived?.stats?.spl||player?.traitStats?.spl||0);magicRatio=Math.floor((950*level+5*spl)*Number(player?.baseLevel||1)/100);}
    if(profile.formula==="renewal_strantum_tremor"){const spl=Number(derived?.stats?.spl||player?.traitStats?.spl||0);magicRatio=Math.floor((100+730*level+5*spl)*Number(player?.baseLevel||1)/100);}
    if(profile.formula==="renewal_tornado_storm"){const spl=Number(derived?.stats?.spl||player?.traitStats?.spl||0);magicRatio=Math.floor((100+760*level+5*spl)*Number(player?.baseLevel||1)/100);}
    if(profile.formula==="renewal_floral_flare_road"){const spl=Number(derived?.stats?.spl||player?.traitStats?.spl||0);magicRatio=Math.floor((50+740*level+5*spl)*Number(player?.baseLevel||1)/100);}
    if(profile.formula==="renewal_earth_grave"){
      const intStat=Number(derived?.stats?.int||player?.stats?.int||1),endow=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(283)||0:0));
      magicRatio=Math.floor((2*intStat+300*endow+intStat*level)*Number(player?.baseLevel||1)/100);
    }
    if(profile.formula==="renewal_diamond_dust"){
      const intStat=Number(derived?.stats?.int||player?.stats?.int||1),endow=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(281)||0:0));
      magicRatio=Math.floor((2*intStat+300*endow+intStat*level)*Number(player?.baseLevel||1)/100);
    }
    if(profile.formula==="renewal_poison_buster"){
      const intStat=Number(derived?.stats?.int||player?.stats?.int||1),cloudBonus=targetHasRuntimeStatus(target,"cloud_poison")?200*level:0;
      magicRatio=Math.floor((1000+300*level+intStat+cloudBonus)*Number(player?.baseLevel||1)/100);
    }
    if(profile.formula==="renewal_psychic_wave"){
      const intStat=Number(derived?.stats?.int||player?.stats?.int||1);
      magicRatio=Math.floor((70*level+3*intStat)*Number(player?.baseLevel||1)/100);
    }
    if(profile.formula==="renewal_cloud_kill"){
      const intStat=Number(derived?.stats?.int||player?.stats?.int||1);
      magicRatio=Math.floor((40*level+3*intStat)*Number(player?.baseLevel||1)/100);
    }
    if(profile.formula==="renewal_varetyr_spear"){
      const intStat=Number(derived?.stats?.int||player?.stats?.int||1),striking=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(2451)||0:0)),windEndow=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(282)||0:0));
      const perHitRatio=Math.floor((2*intStat+150*(striking+windEndow)+Math.floor(intStat*level/2))/3);
      magicRatio=Math.floor(perHitRatio*Number(player?.baseLevel||1)/100);
    }
    if(profile.formula==="renewal_em_diamond_storm"||profile.formula==="renewal_em_terra_drive"){
      const spl=Number(derived?.stats?.spl||player?.traitStats?.spl||0),baseLv=Number(player?.baseLevel||1),active=typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals():{};
      let ratio=500+2400*level+5*spl;
      if(profile.formula==="renewal_em_diamond_storm"&&Number(active.summonedElementalDiluvio||0)>0)ratio+=7300+200*level+5*spl;
      if(profile.formula==="renewal_em_terra_drive"&&Number(active.summonedElementalTerremotus||0)>0)ratio+=7300+200*level+5*spl;
      magicRatio=Math.floor(ratio*baseLv/100);
    }
    if(profile.formula==="renewal_em_elemental_field"){
      const spl=Number(derived?.stats?.spl||player?.traitStats?.spl||0),baseLv=Number(player?.baseLevel||1),active=typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals():{};
      const key=String(profile.element||"").toLowerCase()==="fire"?"summonedElementalArdor":String(profile.element||"").toLowerCase()==="wind"?"summonedElementalProcella":String(profile.element||"").toLowerCase()==="poison"?"summonedElementalSerpens":null;
      let ratio=700+1100*level+5*spl;if(key&&Number(active[key]||0)>0)ratio+=200*level+2*spl;
      magicRatio=Math.floor(ratio*baseLv/100);
    }
    if(profile.formula==="renewal_elemental_buster"){
      const spl=Number(derived?.stats?.spl||player?.traitStats?.spl||0),baseLv=Number(player?.baseLevel||1),spirit=String(typeof getActiveBuffSpecialValue==="function"?getActiveBuffSpecialValue("summonedHighElementalType",""):"");
      const elementMap={Ardor:"Fire",Diluvio:"Water",Procella:"Wind",Terremotus:"Earth",Serpens:"Poison"};runtimeMagicElementOverride=elementMap[spirit]||null;if(!runtimeMagicElementOverride)return null;
      const race=String(target?.race||target?.Race||"").toLowerCase();let ratio=550+2650*level+10*spl;if(race.includes("formless")||race.includes("dragon")||race.includes("無形")||race.includes("龍族"))ratio+=150*level;magicRatio=Math.floor(ratio*baseLv/100);
    }
    if(profile.formula==="renewal_psychic_stream"){const spl=Number(derived?.stats?.spl||player?.traitStats?.spl||0);magicRatio=Math.floor((1000+3500*level+5*spl)*Number(player?.baseLevel||1)/100);}
    if(profile.formula==="renewal_destructive_hurricane"){const spl=Number(derived?.stats?.spl||player?.traitStats?.spl||0);magicRatio=Math.floor((600+2850*level+5*spl)*Number(player?.baseLevel||1)/100);}
    if(profile.formula==="renewal_violent_quake"||profile.formula==="renewal_all_bloom"){const spl=Number(derived?.stats?.spl||player?.traitStats?.spl||0);magicRatio=Math.floor((200+1200*level+5*spl)*Number(player?.baseLevel||1)/100);}
    if(profile.formula==="renewal_crystal_impact"){const spl=Number(derived?.stats?.spl||player?.traitStats?.spl||0);magicRatio=Math.floor((250+1300*level+5*spl)*Number(player?.baseLevel||1)/100);}
    if(profile.formula==="renewal_astral_strike"){const spl=Number(derived?.stats?.spl||player?.traitStats?.spl||0),baseLv=Number(player?.baseLevel||1),phase=String(combatOptions.phase||"tick"),race=String(target?.race||target?.Race||"").toLowerCase();if(phase==="initial"){magicRatio=300+1800*level+10*spl;if(race.includes("undead")||race.includes("dragon"))magicRatio+=100+300*level;}else magicRatio=650*level+10*spl;magicRatio=Math.floor(magicRatio*baseLv/100);}
    if(profile.formula==="renewal_crimson_arrow_combined"){const spl=Number(derived?.stats?.spl||player?.traitStats?.spl||0);magicRatio=Math.floor((1150*level+8*spl)*Number(player?.baseLevel||1)/100);}
    if(profile.formula==="renewal_judex") magicRatio=Math.floor((300+70*level)*Number(player?.baseLevel||1)/100);
    if(profile.formula==="renewal_adoramus") magicRatio=Math.floor((300+250*level)*Number(player?.baseLevel||1)/100);
    if (profile.formula === "renewal_ray_of_genesis") { const i=Number(derived?.stats?.int||player?.stats?.int||1); magicRatio=350*level+3*i; }
    if (profile.formula === "renewal_judgement_cross") { const spl=Number(derived?.stats?.spl||player?.stats?.spl||0); magicRatio=1950*level+10*spl; }
    if (profile.formula === "renewal_cross_rain") { const m=typeof getSkillLevel==="function"?Number(getSkillLevel(5259)||0):0; const spl=Number(derived?.stats?.spl||player?.stats?.spl||0); magicRatio=(450+10*m)*level+7*spl; }
    if (profile.formula === "renewal_imperial_pressure") { const m=typeof getSkillLevel==="function"?Number(getSkillLevel(5259)||0):0; const spl=Number(derived?.stats?.spl||player?.stats?.spl||0); magicRatio=5600+1850*level+7*spl+50*m; }
    if (profile.formula === "renewal_omega_abyss_strike") { const spl=Number(derived?.stats?.spl||player?.stats?.spl||0), race=String(target?.race||target?.Race||"").toLowerCase(); magicRatio=2650*level+10*spl+((race.includes("demon")||race.includes("angel"))?200*level:0); magicRatio=Math.floor(magicRatio*Number(player?.baseLevel||1)/100); }
    if (profile.formula === "renewal_abyss_square") { const spl=Number(derived?.stats?.spl||player?.stats?.spl||0), mastery=typeof getSkillLevel==="function"?Number(getSkillLevel(5312)||0):0; magicRatio=750*level+40*mastery*level+5*spl; magicRatio=Math.floor(magicRatio*Number(player?.baseLevel||1)/100); }
    if (profile.formula === "renewal_abyss_flame") { const spl=Number(derived?.stats?.spl||player?.stats?.spl||0), mastery=typeof getSkillLevel==="function"?Number(getSkillLevel(5312)||0):0, baseLv=Number(player?.baseLevel||1); const main=Math.floor((820*level+10*spl+30*level*mastery)*baseLv/100), follow=Math.floor((500*level+10*spl+15*level*mastery)*baseLv/100); magicRatio=main+follow; hitCount=1; }
    if(profile.formula==="renewal_arbitrium"){const spl=Number(derived?.stats?.spl||0),fidus=Number(typeof getSkillLevel==="function"?getSkillLevel(5276)||0:0);magicRatio=Math.floor((950*level+10*spl+35*fidus*level)*Number(player?.baseLevel||1)/100);}
    if(profile.formula==="renewal_pneumaticus_procella"){const spl=Number(derived?.stats?.spl||0),fidus=Number(typeof getSkillLevel==="function"?getSkillLevel(5276)||0:0),race=String(target?.race||target?.Race||"").toLowerCase(),extra=(race.includes("undead")||race.includes("demon"))?(50+150*level+2*fidus):0;magicRatio=Math.floor((150+2100*level+10*spl+3*fidus+extra)*Number(player?.baseLevel||1)/100);}
    if(profile.formula==="renewal_framen"){const spl=Number(derived?.stats?.spl||0),fidus=Number(typeof getSkillLevel==="function"?getSkillLevel(5276)||0:0),race=String(target?.race||target?.Race||"").toLowerCase(),extra=(race.includes("undead")||race.includes("demon"))?50*level:0;magicRatio=Math.floor((1300*level+5*fidus*level+5*spl+extra)*Number(player?.baseLevel||1)/100);}
    if(profile.formula==="renewal_divinus_flos"){const spl=Number(derived?.stats?.spl||0),fidus=Number(typeof getSkillLevel==="function"?getSkillLevel(5276)||0:0);magicRatio=Math.floor((4000*level+70*fidus+10*spl)*Number(player?.baseLevel||1)/100);}
    if(profile.formula==="renewal_hn_meteor_storm_buster"){const spl=Number(derived?.stats?.spl||player?.stats?.spl||0),sorcery=Number(typeof getSkillLevel==="function"?getSkillLevel(5450)||0:0),baseLv=Number(player?.baseLevel||1),phase=String(combatOptions?.phase||"tick");magicRatio=Math.floor(((phase==="initial"?300+320*level:450+160*level)+5*sorcery*level+3*spl)*baseLv/100);if(phase==="initial")magicRatio=Math.floor(magicRatio*(100+sorcery)/100);}
    if(profile.formula==="renewal_hn_jupitel_thunder_storm"){const spl=Number(derived?.stats?.spl||player?.stats?.spl||0),sorcery=Number(typeof getSkillLevel==="function"?getSkillLevel(5450)||0:0),baseLv=Number(player?.baseLevel||1);magicRatio=Math.floor((1800*level+3*sorcery*level+3*spl)*baseLv/100);magicRatio=Math.floor(magicRatio*(100+sorcery)/100);}
    if(profile.formula==="renewal_hn_jack_frost_nova"){const spl=Number(derived?.stats?.spl||player?.stats?.spl||0),sorcery=Number(typeof getSkillLevel==="function"?getSkillLevel(5450)||0:0),baseLv=Number(player?.baseLevel||1),phase=String(combatOptions?.phase||"tick");magicRatio=Math.floor(((phase==="initial"?200*level:400+500*level)+3*sorcery*level+(phase==="initial"?2:4)*spl)*baseLv/100);if(phase!=="initial")magicRatio=Math.floor(magicRatio*(100+sorcery)/100);}
    if(profile.formula==="renewal_hn_hells_drive"){const spl=Number(derived?.stats?.spl||player?.stats?.spl||0),sorcery=Number(typeof getSkillLevel==="function"?getSkillLevel(5450)||0:0),baseLv=Number(player?.baseLevel||1);magicRatio=Math.floor((1700+900*level+4*sorcery*level+3*spl)*baseLv/100);magicRatio=Math.floor(magicRatio*(100+sorcery)/100);}
    if(profile.formula==="renewal_hn_ground_gravitation"){const spl=Number(derived?.stats?.spl||player?.stats?.spl||0),sorcery=Number(typeof getSkillLevel==="function"?getSkillLevel(5450)||0:0),baseLv=Number(player?.baseLevel||1),phase=String(combatOptions?.phase||"tick");magicRatio=Math.floor(((phase==="initial"?3000+1500*level:800+700*level)+(phase==="initial"?4:2)*sorcery*level+(phase==="initial"?5:2)*spl)*baseLv/100);if(phase!=="initial")magicRatio=Math.floor(magicRatio*(100+sorcery)/100);}
    if(profile.formula==="renewal_hn_napalm_vulcan_strike"){const spl=Number(derived?.stats?.spl||player?.stats?.spl||0),sorcery=Number(typeof getSkillLevel==="function"?getSkillLevel(5450)||0:0),baseLv=Number(player?.baseLevel||1);magicRatio=Math.floor((350+650*level+4*sorcery*level+3*spl)*baseLv/100);magicRatio=Math.floor(magicRatio*(100+2*sorcery)/100);}
    magicRatio = applyConditionalSelfBuffDamageRate(magicRatio, profile);
    if (profile.climaxSupported === true) {
      const active = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
      const climaxRate = Number(active.climaxDamageRate || (Number(active.climax || 0) > 0 ? 25 : 0));
      if (climaxRate > 0) magicRatio = Math.floor(Number(magicRatio || 0) * (100 + climaxRate) / 100);
    }
    if (profile.conditionalMagicRatio) {
      const sizeKey = normalizeRuntimeTargetSize(target) === "Small" ? "small" : "other";
      magicRatio = getLevelValue(profile.conditionalMagicRatio[sizeKey], level, magicRatio);
    }
    const race = String(target?.race || target?.Race || "").toLowerCase();
    const element = String(target?.element || target?.Element || "").toLowerCase();
    if (profile.undeadRatioBonusPerLevel && (race.includes("undead") || element.includes("undead"))) magicRatio += Number(profile.undeadRatioBonusPerLevel) * level;
    if (profile.formula === "renewal_turn_undead") {
      const derivedStats = typeof calculateDerivedPlayerStats === "function" ? calculateDerivedPlayerStats() : null;
      const luk = Number(derivedStats?.stats?.luk || player?.stats?.luk || 1);
      const intStat = Number(derivedStats?.stats?.int || player?.stats?.int || 1);
      const baseLv = Number(player?.baseLevel || 1);
      const hp = Math.max(0, Number(target?.currentHp || target?.hp || 0));
      const maxHp = Math.max(1, Number(target?.maxHp || 1));
      const immune = !!(target?.isBoss || target?.statusImmune || target?.statusImmunities?.includes?.("instant_death"));
      const chance1000 = Math.min(700, 10 * level + luk + intStat + baseLv + 300 - Math.floor(300 * hp / maxHp));
      if (!immune && Math.floor(Math.random() * 1000) < chance1000) return hp;
      magicRatio = level;
      hitCount = 1;
    }
    const magicProfile = runtimeMagicElementOverride ? { ...profile, element: runtimeMagicElementOverride, elementSource: "fixed" } : profile;
    const result = window.CombatDamagePipeline?.resolveMagicSkill(magicProfile, level, target, { ratio: Number(magicRatio || 100), hits: hitCount, skipHitCheck: true, criticalResult: combatOptions.criticalResult });
    if (!result) return null;
    if (result.elementImmune === true) return 0;
    return Math.max(1, result.damage);
  }
  let ratio = profile.ratio === undefined ? null : Math.max(1, getLevelValue(profile.ratio, level, 100));
  if (profile.formula === "renewal_great_echo") {
    const lesson=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(2412)||0:0));
    ratio=Math.max(1,Math.floor((250+500*level+50*lesson)*Number(player?.baseLevel||1)/100));
  }
  if (profile.formula === "renewal_severe_rainstorm") {
    const dex=Number(derived?.stats?.dex||player?.stats?.dex||1),agi=Number(derived?.stats?.agi||player?.stats?.agi||1),baseLv=Number(player?.baseLevel||1);
    const weapon=String(getEquippedWeaponTypeRuntime()||"").toLowerCase();
    const instrumentBonus=(weapon.includes("instrument")||weapon.includes("musical")||weapon.includes("whip"))?20*level:0;
    ratio=Math.max(1,Math.floor((100*level+Math.floor(dex/300)+Math.floor(agi/200)+instrumentBonus)*baseLv/100));
  }
  if (profile.formula === "renewal_sharpshooting") {
    const baseRatio = 300 + 300 * level;
    const baseLevel = Number(player?.baseLevel || 1);
    ratio = baseLevel > 99 ? Math.floor(baseRatio * baseLevel / 100) : baseRatio;
  }
  if (profile.formula === "renewal_arrow_storm") {
    const fearBreeze = Number(typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals().fearBreezeLevel || 0 : 0) > 0;
    ratio = Math.floor((fearBreeze ? 200 + 250 * level : 200 + 180 * level) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_aimed_bolt") {
    const fearBreeze = Number(typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals().fearBreezeLevel || 0 : 0) > 0;
    ratio = Math.floor((fearBreeze ? 800 + 35 * level : 500 + 20 * level) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_warg_dash") ratio = 300;
  if (profile.formula === "renewal_warg_strike") ratio = 200 * level;
  if (profile.formula === "renewal_warg_bite") ratio = [600,800,1000,1200,1500][Math.max(0,Math.min(4,level-1))];
  if (profile.formula === "renewal_sensitive_keen") ratio = 100 + 50 * level;
  if (profile.formula === "renewal_beast_strafing") {
    const str = Number(derived?.stats?.str || player?.stats?.str || 1);
    ratio = 50 + 8 * str;
  }
  if (profile.formula === "renewal_hn_double_bowling_bash") {
    const pow = Number(derived?.stats?.pow ?? player?.traitStats?.pow ?? player?.stats?.pow ?? 0);
    const tactics = Math.max(0, Number(typeof getSkillLevel === "function" ? getSkillLevel(5449) || 0 : 0));
    ratio = Math.floor((250 + 400 * level + 3 * tactics * level + 5 * pow) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_hn_mega_sonic_blow") {
    const pow = Number(derived?.stats?.pow ?? player?.traitStats?.pow ?? player?.stats?.pow ?? 0);
    const tactics = Math.max(0, Number(typeof getSkillLevel === "function" ? getSkillLevel(5449) || 0 : 0));
    ratio = Math.floor((900 + 750 * level + 5 * tactics * level + 5 * pow) * Number(player?.baseLevel || 1) / 100);
    const hp = Math.max(0, Number(target?.currentHp ?? target?.hp ?? 0)), maxHp = Math.max(1, Number(target?.maxHp || 1));
    if (hp < maxHp / 2) ratio *= 2;
  }
  if (profile.formula === "renewal_hn_shield_chain_rush") {
    const pow = Number(derived?.stats?.pow ?? player?.traitStats?.pow ?? player?.stats?.pow ?? 0);
    const tactics = Math.max(0, Number(typeof getSkillLevel === "function" ? getSkillLevel(5449) || 0 : 0));
    ratio = Math.floor((600 + 1300 * level + 3 * tactics * level + 5 * pow) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_hn_spiral_pierce_max") {
    const pow = Number(derived?.stats?.pow ?? player?.traitStats?.pow ?? player?.stats?.pow ?? 0);
    const tactics = Math.max(0, Number(typeof getSkillLevel === "function" ? getSkillLevel(5449) || 0 : 0));
    ratio = 1000 + 1500 * level + 3 * tactics * level + 5 * pow;
    const size = normalizeRuntimeTargetSize(target);
    ratio = Math.floor(ratio * (size === "Small" ? 150 : (size === "Large" ? 120 : 130)) / 100);
    ratio = Math.floor(ratio * Number(player?.baseLevel || 1) / 100);
  }
  ratio = applyConditionalSelfBuffDamageRate(ratio, profile);
  if (profile.formula === "renewal_arrow_vulcan") {
    ratio = Math.floor((500 + 100 * level) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_hawk_rush") {
    const con=Number(derived?.stats?.con??player?.stats?.con??0), nature=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(5325)||0:0));
    ratio=Math.floor((500*level+5*con)*Number(player?.baseLevel||1)/100);
    ratio=Math.floor(ratio*(100+10*nature)/100);
  }
  if (profile.formula === "renewal_hawk_boomerang") {
    const con=Number(derived?.stats?.con??player?.stats?.con??0), nature=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(5325)||0:0));
    ratio=Math.floor((600*level+10*con)*Number(player?.baseLevel||1)/100);
    ratio=Math.floor(ratio*(100+10*nature)/100);
    const race=String(target?.race??target?.Race??"").toLowerCase();
    if(race.includes("brute")||race.includes("animal")||race.includes("fish"))ratio=Math.floor(ratio*150/100);
  }
  if (profile.formula === "renewal_gale_storm") {
    const con=Number(derived?.stats?.con??player?.stats?.con??0),active=typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals():{};
    ratio=Math.floor((1350*level+10*con)*Number(player?.baseLevel||1)/100);
    if(Number(active.calamityGale||0)>0){const race=String(target?.race??target?.Race??"").toLowerCase();if(race.includes("brute")||race.includes("animal")||race.includes("fish")||race.includes("動物")||race.includes("魚貝"))ratio=Math.floor(ratio*150/100);}
  }
  if (profile.formula === "renewal_windhawk_elemental_trap") {
    const con=Number(derived?.stats?.con??player?.stats?.con??0);
    const advanced=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(5323)||0:0));
    ratio=Math.floor((850*level+5*con)*Number(player?.baseLevel||1)/100);
    ratio=Math.floor(ratio*(100+20*advanced)/100);
  }
  if (profile.formula === "renewal_crescive_bolt") {
    const con=Number(derived?.stats?.con??player?.stats?.con??0);
    const active=typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals():{};
    const stacks=Math.max(0,Math.min(3,Number(active.cresciveBoltStacks||0)));
    ratio=Math.floor((500+1300*level+5*con)*Number(player?.baseLevel||1)/100);
    ratio=Math.floor(ratio*(100+20*stacks)/100);
    if(Number(active.calamityGale||0)>0){ratio=Math.floor(ratio*120/100);const race=String(target?.race??target?.Race??"").toLowerCase();if(race.includes("brute")||race.includes("animal")||race.includes("fish")||race.includes("動物")||race.includes("魚貝"))ratio=Math.floor(ratio*150/100);}
  }
  if (profile.formula === "renewal_wild_walk") {
    const con=Number(derived?.stats?.con??player?.stats?.con??0),baseLv=Number(player?.baseLevel||1);
    const steel=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(128)||0:0));
    const nature=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(5325)||0:0));
    const perHit=[4600,7400,10200,13000,15800][Math.max(0,Math.min(4,level-1))]+5*con+6*steel;
    ratio=Math.floor(perHit*baseLv/100);
    ratio=Math.floor(ratio*(100+10*nature)/100);
    ratio*=3;
  }
  if (profile.formula === "renewal_cart_revolution") {
    // RO_WEB has no cart-weight state: always resolve at the full-load coefficient.
    const loadRate = Math.max(0, Math.min(100, Number(profile.assumedCartLoadRate ?? 100)));
    ratio = 150 + loadRate;
  }
  if (profile.formula === "renewal_cart_termination") {
    // RO_WEB has no cart-weight state: always resolve at the full-load coefficient.
    const loadRate = Math.max(0, Math.min(100, Number(profile.assumedCartLoadRate ?? 100)));
    const divisor = Math.max(1, 10 * (16 - level));
    ratio = Math.max(100, Math.floor((80000 / divisor) * loadRate / 100));
  }
  if (profile.formula === "renewal_flame_launcher") {
    ratio = Math.floor((300 + 300 * level) * Number(player?.baseLevel || 1) / 150);
  }
  if (profile.formula === "renewal_vulcan_arm") {
    const dex = Number(derived?.stats?.dex || player?.stats?.dex || 1);
    ratio = Math.floor((230 * level + dex) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_cold_slower") {
    ratio = Math.floor((300 + 300 * level) * Number(player?.baseLevel || 1) / 150);
  }
  if (profile.formula === "renewal_arm_cannon") {
    ratio = Math.floor((400 + 350 * level) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_self_destruction") {
    const vit = Number(derived?.stats?.vit || player?.stats?.vit || 1);
    const mainframe = Math.max(0, Number(typeof getSkillLevel === "function" ? getSkillLevel(2266) || 0 : 0));
    const preSp = Math.max(0, Number(combatOptions.preCastSp ?? player?.sp ?? 0));
    const preHp = Math.max(1, Number(combatOptions.preCastHp ?? player?.hp ?? 1));
    let fixedDamage = (level + 1) * (mainframe + 8) * (preSp + vit);
    const baseLv = Number(player?.baseLevel || 1);
    if (baseLv > 100) fixedDamage = Math.floor(fixedDamage * baseLv / 100);
    fixedDamage += preHp;
    return Math.max(1, Math.floor(fixedDamage));
  }
  if (profile.formula === "renewal_boost_knuckle") {
    const dex = Number(derived?.stats?.dex || player?.stats?.dex || 1);
    ratio = Math.floor((260 * level + dex) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_pile_bunker") {
    const str = Number(derived?.stats?.str || player?.stats?.str || 1);
    ratio = Math.floor((300 + 100 * level + str) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_cart_cannon") {
    const intStat = Number(derived?.stats?.int || player?.stats?.int || 1);
    const remodelLevel = Math.max(0, Math.min(5, Number(typeof getSkillLevel === "function" ? getSkillLevel(2475) || 0 : 0)));
    const denominator = Math.max(1, 6 - remodelLevel);
    ratio = Math.floor(((250 + 20 * remodelLevel) * level + (2 * intStat / denominator)) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_bomb") {
    ratio = 100 + 20 * level;
  }
  if (profile.formula === "renewal_acid_terror") {
    const learningPotion = Math.max(0, Number(typeof getSkillLevel === "function" ? getSkillLevel(227) || 0 : 0));
    ratio = 200 * level + (learningPotion > 0 ? 100 : 0);
  }
  if (profile.formula === "renewal_acid_demonstration") {
    const intStat = Number(derived?.stats?.int || player?.stats?.int || 1);
    const targetVit = Number(target?.stats?.vit ?? target?.vit ?? target?.status?.vit ?? 1);
    ratio = 200 * level + intStat + targetVit;
    if (target === player || target?.isPlayer === true) ratio = Math.floor(ratio / 2);
  }
  if (profile.formula === "renewal_spore_explosion") {
    ratio = Math.floor((400 + 200 * level) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_wall_of_thorns") {
    ratio = 100 + 10 * level;
  }
  if (profile.formula === "renewal_crazy_weed") {
    ratio = Math.floor((700 + 100 * level) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_cart_tornado") {
    const str = Math.min(120, Number(derived?.stats?.str || player?.stats?.str || 1));
    const remodelLevel = Math.max(0, Number(typeof getSkillLevel === "function" ? getSkillLevel(2475) || 0 : 0));
    const baseCartWeightRaw = Math.max(0, Number(profile.assumedBaseCartWeightRaw || 80000));
    const fullCartWeightRaw = baseCartWeightRaw + remodelLevel * 5000;
    const weightTerm = Math.floor((fullCartWeightRaw / 10) / Math.max(1, 150 - str));
    ratio = 200 * level + weightTerm + remodelLevel * 50;
  }
  if (profile.formula === "renewal_axe_stomp") {
    const pow = Number(derived?.stats?.pow || player?.traitStats?.pow || player?.stats?.pow || 0);
    ratio = Math.floor((450 + 1150 * level + 5 * pow) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_rush_quake") {
    const pow = Number(derived?.stats?.pow || player?.traitStats?.pow || player?.stats?.pow || 0);
    const race = String(target?.race || target?.Race || "").toLowerCase();
    const raceBonus = (race.includes("formless") || race.includes("insect")) ? 150 * level : 0;
    ratio = Math.floor((3600 * level + 10 * pow + raceBonus) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_mighty_smash") {
    const pow = Number(derived?.stats?.pow || player?.traitStats?.pow || player?.stats?.pow || 0);
    const axeStomp = Number(typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals().axeStomp || 0 : 0) > 0;
    ratio = 80 + 240 * level + 5 * pow + (axeStomp ? 20 + 5 * pow : 0);
    ratio = Math.floor(ratio * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_rush_strike") {
    const pow = Number(derived?.stats?.pow || player?.traitStats?.pow || player?.stats?.pow || 0);
    ratio = Math.floor((3500 * level + 5 * pow) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_powerful_swing") {
    const pow = Number(derived?.stats?.pow || player?.traitStats?.pow || player?.stats?.pow || 0);
    const axeStomp = Number(typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals().axeStomp || 0 : 0) > 0;
    ratio = 300 + 850 * level + 5 * pow + (axeStomp ? 100 + 100 * level : 0);
    ratio = Math.floor(ratio * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_spark_blaster") {
    const pow = Number(derived?.stats?.pow || player?.traitStats?.pow || player?.stats?.pow || 0);
    ratio = Math.floor((600 + 1400 * level + 5 * pow) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_triple_laser") {
    const pow = Number(derived?.stats?.pow || player?.traitStats?.pow || player?.stats?.pow || 0);
    ratio = Math.floor((650 + 1150 * level + 12 * pow) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_energy_cannonade") {
    const pow = Number(derived?.stats?.pow || player?.traitStats?.pow || player?.stats?.pow || 0);
    ratio = Math.floor((250 + 750 * level + 5 * pow) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_explosive_powder") {
    const pow = Number(derived?.stats?.pow || player?.traitStats?.pow || player?.stats?.pow || 0);
    const report = Number(typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals().researchReport || 0 : 0) > 0;
    ratio = 500 + 650 * level + 5 * pow + (report ? 100 * level : 0);
    ratio = Math.floor(ratio * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_mayhemic_thorns") {
    const pow = Number(derived?.stats?.pow || player?.traitStats?.pow || player?.stats?.pow || 0);
    const report = Number(typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals().researchReport || 0 : 0) > 0;
    ratio = 200 + 340 * level + 5 * pow + (report ? 200 : 0);
    ratio = Math.floor(ratio * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_mystery_powder") {
    const pow = Number(derived?.stats?.pow || player?.traitStats?.pow || player?.stats?.pow || 0);
    ratio = Math.floor((1500 + 4000 * level + 5 * pow) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_dust_explosion") {
    const pow = Number(derived?.stats?.pow || player?.traitStats?.pow || player?.stats?.pow || 0);
    const report = Number(typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals().researchReport || 0 : 0) > 0;
    ratio = 500 + 620 * level + 5 * pow + (report ? 50 + 210 * level : 0);
    ratio = Math.floor(ratio * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_acidified_zone") {
    const pow = Number(derived?.stats?.pow || player?.traitStats?.pow || player?.stats?.pow || 0);
    const report = Number(typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals().researchReport || 0 : 0) > 0;
    ratio = 400 * level + 5 * pow;
    if (report) {
      ratio = Math.floor(ratio * (100 + Number(profile.researchReportBonusPercent || 50)) / 100);
      const race = String(target?.race || target?.Race || "").toLowerCase();
      if (race.includes("formless") || race.includes("plant")) {
        ratio = Math.floor(ratio * (100 + Number(profile.researchReportRaceBonusPercent || 50)) / 100);
      }
    }
    ratio = Math.floor(ratio * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_magma_eruption_slam") {
    // Current rAthena Renewal formula has no BaseLv damage modifier for the initial slam.
    ratio = 450 + 50 * level;
  }
  if (profile.formula === "renewal_axe_boomerang") {
    const baseLv = Number(player?.baseLevel || 1);
    const weaponId = player?.equipment?.weapon;
    const weapon = weaponId && typeof getItemData === "function" ? getItemData(weaponId) : null;
    const weaponWeight = Math.max(0, Number(weapon?.weight ?? weapon?.Weight ?? 0));
    ratio = Math.floor((150 + 50 * level + Math.floor(weaponWeight / 10)) * baseLv / 100);
  }
  if (profile.formula === "renewal_power_swing") {
    const str = Number(derived?.stats?.str || player?.stats?.str || 1);
    const dex = Number(derived?.stats?.dex || player?.stats?.dex || 1);
    ratio = Math.floor((300 + 100 * level + Math.floor((str + dex) / 2)) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_axe_tornado") {
    const vit = Number(derived?.stats?.vit || player?.stats?.vit || 1);
    ratio = Math.floor((100 + 180 * level + 2 * vit) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_sonic_blow") {
    ratio = 200 + 100 * level;
    if (Number(target?.currentHp || 0) < Number(target?.maxHp || 1) / 2) ratio = Math.floor(ratio * 1.5);
    const passive = typeof getPassiveSkillBonusTotals === "function" ? getPassiveSkillBonusTotals() : {};
    ratio = Math.floor(ratio * (100 + Number(passive.sonicBlowDamageRate || 0)) / 100);
  }
  if (profile.formula === "renewal_soul_destroyer") {
    const str = Number(derived?.stats?.str || player?.stats?.str || 1);
    const intStat = Number(derived?.stats?.int || player?.stats?.int || 1);
    ratio = Math.floor((150 * level + str + intStat) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_meteor_assault") {
    ratio = Math.floor((200 + 120 * level) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_rolling_cutter") {
    ratio = Math.floor((50 + 80 * level) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_cross_ripper") {
    const agi = Number(derived?.stats?.agi || player?.stats?.agi || 1);
    const charges = Math.max(1, Number(combatOptions.consumedResource || 1));
    ratio = Math.floor((80 * level + agi * 3) * Number(player?.baseLevel || 1) / 100) + charges * 200;
  }
  if (profile.formula === "renewal_cross_impact") ratio = Math.floor((1400 + 150 * level) * Number(player?.baseLevel || 1) / 100);
  if (profile.formula === "renewal_dark_illusion") {
    ratio = 100;
    if (Math.random() * 100 < 4 * level) ratio += Math.floor((1400 + 150 * level) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_counter_slash") {
    const agi = Number(derived?.stats?.agi || player?.stats?.agi || 1);
    const jobLv = Number(player?.jobLevel || 1);
    ratio = Math.floor((300 + 150 * level) * Number(player?.baseLevel || 1) / 120) + agi * 2 + jobLv * 4;
  }
  if (profile.formula === "renewal_savage_impact") {
    const pow = Number(derived?.stats?.pow || player?.stats?.pow || 0);
    const shadow = Number(typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals().shadowExceed || 0 : 0);
    ratio = 105 * level + 5 * pow + (shadow ? 20 * level + 2 * pow : 0);
    ratio = Math.floor(ratio * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_eternal_slash") {
    const pow = Number(derived?.stats?.pow || player?.stats?.pow || 0);
    const shadow = Number(typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals().shadowExceed || 0 : 0);
    ratio = 300 * level + 2 * pow + (shadow ? 120 * level + pow : 0);
    ratio = Math.floor(ratio * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_shadow_stab") {
    const pow = Number(derived?.stats?.pow || player?.stats?.pow || 0);
    ratio = Math.floor((650 * level + 5 * pow) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_impact_crater") {
    const pow = Number(derived?.stats?.pow || player?.stats?.pow || 0);
    ratio = Math.floor((80 * level + 5 * pow) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_fatal_shadow_crow") {
    const pow = Number(derived?.stats?.pow || player?.stats?.pow || 0);
    const race = String(target?.race || "").toLowerCase();
    const bonus = (race.includes("demihuman") || race.includes("human") || race.includes("dragon")) ? 150 * level : 0;
    ratio = Math.floor((1300 * level + 10 * pow + bonus) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_cross_slash") {
    const pow = Number(derived?.stats?.pow || player?.stats?.pow || 0);
    const shadow = Number(typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals().shadowExceed || 0 : 0);
    ratio = 300 * level + 5 * pow + (shadow ? 60 * level + 2 * pow : 0);
    ratio = Math.floor(ratio * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_backstab") {
    ratio = 300 + 40 * level;
    if (getEquippedWeaponTypeRuntime().toLowerCase().includes("bow")) ratio = Math.floor(ratio / 2);
  }
  if (profile.formula === "renewal_raid") ratio = 50 + 150 * level;
  if (profile.formula === "renewal_intimidate") ratio = 100 + 30 * level;
  if (profile.formula === "renewal_triangle_shot") {
    const agi = Number(derived?.stats?.agi || player?.stats?.agi || 1);
    ratio = Math.floor((230 * level + 3 * agi) * Number(player?.baseLevel || 1) / 100);
  }
  if (profile.formula === "renewal_feint_bomb") {
    const dex = Number(derived?.stats?.dex || player?.stats?.dex || 1);
    const jobLv = Math.max(1, Number(player?.jobLevel || 1));
    ratio = Math.max(1, Math.floor(((level + 1) * dex) * (jobLv / 10) * Number(player?.baseLevel || 1) / 120));
  }
  if (profile.formula === "renewal_brandish_spear") {
    const totalStr = Number(derived?.stats?.str || player?.stats?.str || 1);
    ratio = 400 + 100 * level + totalStr * 3;
  }
  if (profile.formula === "renewal_holy_cross") {
    const wt = getEquippedWeaponTypeRuntime().toLowerCase();
    const twoHandSpear = wt.includes("twohandspear") || wt.includes("2hspear");
    ratio = 100 + (twoHandSpear ? 70 : 35) * level;
  }
  if (profile.formula === "renewal_chain_combo") {
    const wt = getEquippedWeaponTypeRuntime().toLowerCase();
    ratio = 250 + 50 * level;
    if (wt.includes("knuckle")) ratio *= 2;
  }
  if (profile.formula === "renewal_combo_finish") {
    const totalStr = Number(derived?.stats?.str || player?.stats?.str || 1);
    ratio = 550 + 50 * level + totalStr;
  }
  if (profile.formula === "renewal_hundred_spear") {
    const spiralLv = typeof getSkillLevel === "function" ? Number(getSkillLevel(397) || 0) : 0;
    const auraLv = Number(typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals().dragonicAuraLevel || 0 : 0);
    ratio = 600 + 200 * level + 50 * spiralLv + 160 * auraLv;
  }
  if (profile.formula === "renewal_wind_cutter") {
    const wt = getEquippedWeaponTypeRuntime().toLowerCase();
    const perLevel = wt.includes("spear") ? 400 : (wt.includes("sword") || wt.includes("dagger") ? 250 : 300);
    ratio = perLevel * level;
  }
  if (profile.formula === "renewal_ignition_break") ratio = 450 * level;
  if (profile.formula === "renewal_phantom_thrust") {
    const spearLv = typeof getSkillLevel === "function" ? Number(getSkillLevel(55) || 0) : 0;
    ratio = Math.floor((50 * level + 10 * spearLv) * Number(player?.baseLevel || 1) / 150);
  }
  if (profile.formula === "renewal_spiral_pierce") {
    const mounted = !!(player?.mountState?.mounted || player?.mounted);
    ratio = (150 + 50 * level) * (mounted ? 2 : 1);
  }
  if (profile.formula === "renewal_shield_boomerang") ratio = 80 * level;
  if (profile.formula === "renewal_shield_chain") ratio = 300 + 200 * level;
  if (profile.formula === "renewal_cannon_spear") { const s=Number(derived?.stats?.str||player?.stats?.str||1); ratio=level*(120+s)+400; }
  if (profile.formula === "renewal_banishing_point") { const bash=typeof getSkillLevel==="function"?Number(getSkillLevel(5)||0):0; ratio=100*level+70*bash+800; }
  if (profile.formula === "renewal_shield_press") { const s=Number(derived?.stats?.str||player?.stats?.str||1); ratio=200*level+s; }
  if (profile.formula === "renewal_pinpoint_attack") { const a=Number(derived?.stats?.agi||player?.stats?.agi||1); ratio=100*level+5*a; }
  if (profile.formula === "renewal_overbrand") { const q=typeof getSkillLevel==="function"?Number(getSkillLevel(258)||0):0; ratio=350*level+50*q; }
  if (profile.formula === "renewal_moon_slasher") { const ob=typeof getSkillLevel==="function"?Number(getSkillLevel(2317)||0):0; ratio=120*level+80*ob; }
  if (profile.formula === "renewal_earth_drive") { const s=Number(derived?.stats?.str||player?.stats?.str||1),v=Number(derived?.stats?.vit||player?.stats?.vit||1); ratio=380*level+s+v; }
  if (profile.formula === "renewal_hesperus_lit") { const v=Number(derived?.stats?.vit||player?.stats?.vit||1); ratio=300*level+Math.floor(v/6); }
  if (profile.formula === "renewal_grand_judgement") { const pow=Number(derived?.stats?.pow||player?.stats?.pow||0); ratio=250+1500*level+10*pow; }
  if (profile.formula === "renewal_overslash") { const m=typeof getSkillLevel==="function"?Number(getSkillLevel(5259)||0):0; const pow=Number(derived?.stats?.pow||player?.stats?.pow||0); ratio=220*level+50*m*level+7*pow; }
  if (profile.formula === "renewal_imperial_cross") { const m=typeof getSkillLevel==="function"?Number(getSkillLevel(5259)||0):0; const pow=Number(derived?.stats?.pow||player?.stats?.pow||0); ratio=1650+1350*level+25*m+5*pow; }
  if (profile.formula === "renewal_radiant_spear") {
    hitCount = 2;
    const mastery=typeof getSkillLevel==="function"?Number(getSkillLevel(5259)||0):0;
    const pow=Number(derived?.stats?.pow??player?.traitStats?.pow??0);
    const active=typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals():{};
    const spearScar=Number(active.spearScar||active.spearScarLevel||0)>0;
    ratio=Math.floor((3500+1150*level+50*mastery+5*pow+(spearScar?250*level:0))*Number(player?.baseLevel||1)/100);
  }
  if (profile.formula === "renewal_shield_shooting") {
    hitCount = 7;
    const mastery=typeof getSkillLevel==="function"?Number(getSkillLevel(5258)||0):0;
    const pow=Number(derived?.stats?.pow??player?.traitStats?.pow??0);
    const shieldId=player?.equipment?.shield;
    const shield=shieldId&&typeof getItemData==="function"?getItemData(shieldId):null;
    const shieldWeight=Math.max(0,Number(shield?.weight??shield?.Weight??0));
    const shieldRefine=Math.max(0,Number(window.RefineRuntime?.getEquippedRefine?.("shield")??shield?.refine??shield?.Refine??player?.equipmentRefine?.shield??0));
    const shieldTerm=Math.floor((shieldWeight*7/6)/10)+shieldRefine*100;
    ratio=Math.floor((1000+3500*level+10*pow+150*level*mastery+shieldTerm)*Number(player?.baseLevel||1)/100);
  }
  if (profile.formula === "roweb_rage_burst_fixed") { const missing=Math.max(0,Number(player?.maxHp||1)-Number(player?.hp||0)); ratio=Math.floor((3000+missing)*Number(profile.ratioMultiplier||1.5)); }
  if (profile.formula === "renewal_servant_phantom") { const pow=Number(derived?.stats?.pow||player?.stats?.pow||0); ratio=200+300*level+5*pow; }
  if (profile.formula === "renewal_servant_demolition") { const pow=Number(derived?.stats?.pow||player?.stats?.pow||0); ratio=500*level+5*pow; }
  if (profile.formula === "renewal_abyss_dagger") { const pow=Number(derived?.stats?.pow||player?.stats?.pow||0); ratio=Math.floor((350+1400*level+5*pow)*Number(player?.baseLevel||1)/100); }
  if (profile.formula === "renewal_unlucky_rush") { const pow=Number(derived?.stats?.pow||player?.stats?.pow||0), chasing=Number(typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals().chasing||0:0); ratio=100+300*level+5*pow+(chasing?2500*level:0); ratio=Math.floor(ratio*Number(player?.baseLevel||1)/100); }
  if (profile.formula === "renewal_chain_reaction_shot") { const con=Number(derived?.stats?.con||player?.stats?.con||0), chasing=Number(typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals().chasing||0:0); ratio=combatOptions.secondaryStage?(800+2550*level+15*con+(chasing?700*level:0)):(850*level+15*con); ratio=Math.floor(ratio*Number(player?.baseLevel||1)/100); }
  if (profile.formula === "renewal_rose_blossom") {
    const con=Number(derived?.stats?.con??player?.stats?.con??player?.traitStats?.con??0);
    const manner=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(5349)||0:0));
    ratio=(combatOptions.secondaryStage?250+2800*level:200+2000*level)+(manner>0?3*con:0);
    if(targetHasRuntimeStatus(target,"soundblend"))ratio+=200*level;
    ratio=Math.floor(ratio*Number(player?.baseLevel||1)/100);
    const active=typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals():{};
    if(Number(active.mysticSymphony||0)>0){ratio*=2;const race=String(target?.race??target?.Race??"").toLowerCase();if(race.includes("fish")||race.includes("demihuman")||race.includes("human")||race.includes("魚貝")||race.includes("人型"))ratio=Math.floor(ratio*150/100);}
  }
  if (profile.formula === "renewal_rhythm_shooting") {
    const con=Number(derived?.stats?.con??player?.stats?.con??player?.traitStats?.con??0);
    const manner=Math.max(0,Number(typeof getSkillLevel==="function"?getSkillLevel(5349)||0:0));
    ratio=550+950*level+(manner>0?5*con:0);
    if(targetHasRuntimeStatus(target,"soundblend"))ratio+=300+100*level+2*con;
    ratio=Math.floor(ratio*Number(player?.baseLevel||1)/100);
    const active=typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals():{};
    if(Number(active.mysticSymphony||0)>0){ratio*=2;const race=String(target?.race??target?.Race??"").toLowerCase();if(race.includes("fish")||race.includes("demihuman")||race.includes("human")||race.includes("魚貝")||race.includes("人型"))ratio=Math.floor(ratio*150/100);}
  }
  if (profile.formula === "renewal_deft_stab") { const pow=Number(derived?.stats?.pow||player?.stats?.pow||0); ratio=Math.floor((700+550*level+7*pow)*Number(player?.baseLevel||1)/100); }
  if (profile.formula === "renewal_frenzy_shot") { const con=Number(derived?.stats?.con||player?.stats?.con||0); ratio=Math.floor((250+800*level+15*con)*Number(player?.baseLevel||1)/100); }
  if (profile.formula === "renewal_hit_and_sliding") { const pow=Number(derived?.stats?.pow||player?.stats?.pow||0); ratio=Math.floor((3500*level+5*pow)*Number(player?.baseLevel||1)/100); }
  if (profile.formula === "renewal_chasing_break") { const pow=Number(derived?.stats?.pow||player?.stats?.pow||0), chasing=Number(typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals().chasing||0:0); ratio=1550+450*level+5*pow+(chasing?200+50*level:0); ratio=Math.floor(ratio*Number(player?.baseLevel||1)/100); }
  if (profile.formula === "renewal_chasing_shot") { const con=Number(derived?.stats?.con||player?.stats?.con||0), chasing=Number(typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals().chasing||0:0); ratio=1500+700*level+5*con+(chasing?250*level:0); ratio=Math.floor(ratio*Number(player?.baseLevel||1)/100); }
  if (profile.formula === "renewal_dancing_knife") { const pow=Number(derived?.stats?.pow||player?.stats?.pow||0), baseLv=Number(player?.baseLevel||1); ratio=Math.floor((200*level+5*pow)*baseLv/100); }
  if (profile.formula === "renewal_asura_strike") { const preSp=Math.max(0,Number(combatOptions.preCastSp??player?.sp??0)); ratio=Math.min(500000,800+preSp*10); if(Number(combatOptions.preCastResource||0)>5)ratio*=2; }
  if (profile.formula === "renewal_ki_explosion") ratio=800;
  if (profile.formula === "renewal_dragon_combo") ratio=Math.floor((200+80*level)*Number(player?.baseLevel||1)/100);
  if (profile.formula === "renewal_sky_net_blow") { const agi=Number(derived?.stats?.agi||player?.stats?.agi||1); ratio=Math.floor((200*level+agi/6)*Number(player?.baseLevel||1)/100); }
  if (profile.formula === "renewal_earth_shaker") { const str=Number(derived?.stats?.str||player?.stats?.str||1); ratio=Math.floor(400*level*Number(player?.baseLevel||1)/100)+str*2; }
  if (profile.formula === "renewal_fallen_empire") ratio=Math.floor((100+300*level)*Number(player?.baseLevel||1)/150);
  if (profile.formula === "renewal_tiger_cannon") { const active=typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals():{}; const combo=!combatOptions.fromFlashCombo&&Number(active.fallenEmpireCombo||0)>0; const hp=Math.floor(Number(player?.maxHp||1)*(10+2*level)/100),sp=Math.floor(Number(player?.maxSp||1)*(5+level)/100); ratio=Math.floor(((hp+sp)/(combo?2:4))*Number(player?.baseLevel||1)/100); if(Number(active.gentleTouchRevitalize||0)>0)ratio=Math.floor(ratio*1.3); combatOptions.tigerCannonFlatDamage=(combo?level*500:level*240)+Number(target?.level||target?.baseLevel||1)*40; }
  if (profile.formula === "renewal_rampage_blaster") { const marked=targetHasRuntimeStatus(target,"earthshaker"); ratio=Math.floor((marked?(1500+550*level):(1000+350*level))*Number(player?.baseLevel||1)/(marked?120:150)); }
  if (profile.formula === "renewal_knuckle_arrow") { const boss=!!(target?.isBoss||target?.boss); ratio=Math.floor((500+(boss?200:100)*level)*Number(player?.baseLevel||1)/100); }
  if (profile.formula === "renewal_windmill") { const dex=Number(derived?.stats?.dex||player?.stats?.dex||1),baseLv=Number(player?.baseLevel||1); ratio=Math.floor((baseLv+dex)*baseLv/100); }
  if (profile.formula === "renewal_howling_of_lion") ratio=Math.floor(500*level*Number(player?.baseLevel||1)/100);
  if (profile.formula === "renewal_ride_in_lightning") { const knuckle=String(getEquippedWeaponTypeRuntime()||"").toLowerCase().includes("knuckle"); ratio=Math.floor((knuckle?90:40)*level*Number(player?.baseLevel||1)/100); }
  if (profile.formula === "renewal_gate_of_hell") {
    const active=typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals():{};
    const combo=!combatOptions.fromFlashCombo&&Number(active.fallenEmpireCombo||0)>0;
    const baseLv=Number(player?.baseLevel||1),preHp=Number(combatOptions.preCastHp??player?.hp??1),maxHp=Number(combatOptions.preCastMaxHp??player?.maxHp??1),preSp=Number(combatOptions.preCastSp??player?.sp??0),maxSp=Number(combatOptions.preCastMaxSp??player?.maxSp??0);
    ratio=Math.floor((combo?800:500)*level*baseLv/100);
    if(Number(active.gentleTouchRevitalize||0)>0)ratio=Math.floor(ratio*1.3);
    combatOptions.gateOfHellFlatDamage=Math.max(0,Math.floor(maxHp-preHp)+Math.floor((combo?maxSp:preSp)*(1+level*0.2))+(combo?40:10)*baseLv);
  }
  if (profile.formula === "renewal_gentle_touch_quiet") { const dex=Number(derived?.stats?.dex||player?.stats?.dex||1); ratio=Math.floor((100*level+dex)*Number(player?.baseLevel||1)/100); }
  if (profile.formula === "renewal_occult_impaction") ratio=100*level;
  if (profile.formula === "renewal_finger_offensive") ratio=500+200*level;
  if (profile.formula === "renewal_palm_strike") { const str=Number(derived?.stats?.str||player?.stats?.str||1); ratio=Math.floor((200+100*level+str)*Number(player?.baseLevel||1)/100); }
  if (profile.formula === "renewal_tiger_fist") ratio=Math.floor((500+150*level)*Number(player?.baseLevel||1)/100);
  if (profile.formula === "renewal_chain_crush") ratio=Math.floor((200*level)*Number(player?.baseLevel||1)/100);
  if (profile.formula === "renewal_hack_and_slasher") { const pow=Number(derived?.stats?.pow||player?.traitStats?.pow||0),baseLv=Number(player?.baseLevel||1); ratio=Math.floor((500+1000*level+7*pow)*baseLv/100); }
  if (profile.formula === "renewal_dragonic_breath_dk") {
    const pow=Number(derived?.stats?.pow||player?.traitStats?.pow||0),baseLv=Number(player?.baseLevel||1),maxHp=Number(player?.maxHp||derived?.maxHp||1),maxSp=Number(player?.maxSp||derived?.maxSp||0);
    const auraLv=Number(typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals().dragonicAuraLevel||0:0);
    ratio=250+400*level+7*pow;
    if(auraLv>0) ratio+=3*pow+Math.floor(level*(maxHp*25/100)*7/100)+Math.floor(level*maxSp*7/100);
    else ratio+=Math.floor(level*(maxHp*25/100)*5/100)+Math.floor(level*maxSp*5/100);
    ratio=Math.floor(ratio*baseLv/100);
  }
  if (profile.formula === "renewal_dragonic_aura") { const pow=Number(derived?.stats?.pow||player?.traitStats?.pow||0),baseLv=Number(player?.baseLevel||1),race=String(target?.race||target?.Race||"").toLowerCase(); ratio=100+3650*level+10*pow+((race.includes("demihuman")||race.includes("demi-human")||race.includes("human")||race.includes("angel"))?150*level:0); ratio=Math.floor(ratio*baseLv/100); }
  if (profile.formula === "renewal_madness_crusher") { const pow=Number(derived?.stats?.pow||player?.traitStats?.pow||0),baseLv=Number(player?.baseLevel||1),wid=player?.equipment?.weapon,w=(wid&&typeof getItemData==="function")?getItemData(wid):null,weight=Number(w?.weight||w?.Weight||0),weaponLv=Number(w?.weaponLevel||w?.WeaponLevel||1); ratio=1750+4350*level+10*pow+Math.floor(weight/10)*weaponLv; ratio=Math.floor(ratio*baseLv/100); }
  if (profile.formula === "renewal_storm_slash") { const pow=Number(derived?.stats?.pow||player?.traitStats?.pow||0),baseLv=Number(player?.baseLevel||1),giant=Number(typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals().giantGrowth||0:0); ratio=Math.floor((300+750*level+5*pow)*baseLv/100); if(giant>0&&Math.random()*100<60)ratio*=2; }
  if (profile.formula === "renewal_dragonic_pierce") { const pow=Number(derived?.stats?.pow||player?.traitStats?.pow||0),baseLv=Number(player?.baseLevel||1),auraLv=Number(typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals().dragonicAuraLevel||0:0); ratio=900+730*level+7*pow+(auraLv>0?200+50*level:0); ratio=Math.floor(ratio*baseLv/100); }
  if(profile.formula==="renewal_oleum_sanctum"){const pow=Number(derived?.stats?.pow||0);ratio=Math.floor((500+2000*level+5*pow)*Number(player?.baseLevel||1)/100);}
  if(profile.formula==="renewal_massive_flame_blaster"){const pow=Number(derived?.stats?.pow||0),race=String(target?.race||target?.Race||"").toLowerCase(),extra=(race.includes("brute")||race.includes("demon"))?150*level:0;ratio=Math.floor((2300*level+15*pow+extra)*Number(player?.baseLevel||1)/100);}
  if(profile.formula==="renewal_explosion_blaster"){const pow=Number(derived?.stats?.pow||0),oil=targetHasRuntimeStatus(target,"holy_oil")?950*level:0;ratio=Math.floor((450+2600*level+10*pow+oil)*Number(player?.baseLevel||1)/100);}
  if(profile.formula==="renewal_first_brand"){const pow=Number(derived?.stats?.pow||0);ratio=Math.floor((1200*level+5*pow)*Number(player?.baseLevel||1)/100);}
  if(profile.formula==="renewal_second_flame"){const pow=Number(derived?.stats?.pow||0);ratio=Math.floor((200+2900*level+9*pow)*Number(player?.baseLevel||1)/100);}
  if(profile.formula==="renewal_second_faith"){const pow=Number(derived?.stats?.pow||0);ratio=Math.floor((100+2300*level+5*pow)*Number(player?.baseLevel||1)/100);}
  if(profile.formula==="renewal_second_judgement"){const pow=Number(derived?.stats?.pow||0);ratio=Math.floor((2000+500*level+7*pow)*Number(player?.baseLevel||1)/100);}
  if(profile.formula==="renewal_third_punish"){const pow=Number(derived?.stats?.pow||0);ratio=Math.floor((450+1800*level+10*pow)*Number(player?.baseLevel||1)/100);}
  if(profile.formula==="renewal_third_flame_bomb"){const pow=Number(derived?.stats?.pow||0),hpRate=Math.floor(Number(player?.maxHp||1)*20/100);ratio=Math.floor((650*level+10*pow+hpRate)*Number(player?.baseLevel||1)/100);}
  if(profile.formula==="renewal_third_consecration"){const pow=Number(derived?.stats?.pow||0);ratio=Math.floor((1200*level+10*pow)*Number(player?.baseLevel||1)/100);}
  if(profile.formula==="renewal_blazing_flame_blast"){const pow=Number(derived?.stats?.pow||0),massive=Number(typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals().massiveFlameBlaster||0:0),extra=massive?(1500+400*level):0;ratio=Math.floor((2000+3800*level+10*pow+extra)*Number(player?.baseLevel||1)/100);}
  if(profile.formula==="renewal_effligo"){const pow=Number(derived?.stats?.pow||0),mastery=Number(typeof getSkillLevel==="function"?getSkillLevel(5270)||0:0),race=String(target?.race||target?.Race||"").toLowerCase(),extra=(race.includes("undead")||race.includes("demon"))?(200*level+7*mastery):0;ratio=Math.floor((1800*level+7*pow+8*mastery+extra)*Number(player?.baseLevel||1)/100);}
  if(profile.formula==="renewal_petitio"){const pow=Number(derived?.stats?.pow||0),mastery=Number(typeof getSkillLevel==="function"?getSkillLevel(5270)||0:0);ratio=Math.floor((1200*level+50*mastery*level+5*pow)*Number(player?.baseLevel||1)/100);}
  if (profile.formula === "renewal_dragon_breath") {
    const baseLv = Number(player?.baseLevel || 1);
    const hp = Number(player?.hp || 1);
    const maxSp = Number(player?.maxSp || derived?.maxSp || 0);
    const trainingRate = Number(typeof getPassiveSkillBonusTotals === "function" ? getPassiveSkillBonusTotals().dragonBreathRate || 0 : 0);
    const auraLv = Number(typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals().dragonicAuraLevel || 0 : 0);
    const auraLearned = typeof getSkillLevel === "function" ? Number(getSkillLevel(5210) || 0) > 0 : false;
    const pow = Number(derived?.stats?.pow || player?.traitStats?.pow || 0);
    const specialDamage = Math.max(1, Math.floor((hp / 50 + maxSp / 4) * level * baseLv / 100));
    const totalRate = 100 + trainingRate + auraLv * 10 + (auraLearned ? pow / 5 : 0);
    const raw = Math.max(1, Math.floor(specialDamage * totalRate / 100));
    const result = window.RARenewalDamagePipeline?.resolveSpecialPhysical(profile, level, target, {rawDamage:raw});
    return result ? (result.elementImmune === true ? 0 : Math.max(1, Number(result.damage || 0))) : raw;
  }
  if (ratio === null) return null;
  if (isChargingPierceMaxForSkill(skill)) ratio *= 2;
  const totalRatio = ratio * Math.max(1, hitCount);
  let flatAddition = 0;
  if (profile.formula === "renewal_freezing_trap") {
    const researchLv = Math.max(0, Number(typeof getSkillLevel === "function" ? getSkillLevel(profile.researchTrapSkillId || 2248) || 0 : 0));
    flatAddition = researchLv * 40;
  }
  if (["renewal_warg_dash","renewal_warg_strike","renewal_warg_bite","renewal_sensitive_keen"].includes(profile.formula)) {
    const passive = typeof getPassiveSkillBonusTotals === "function" ? getPassiveSkillBonusTotals() : {};
    flatAddition += Math.max(0, Number(passive.wargDamageFlat || 0));
  }
  if (profile.formula === "renewal_magic_crasher") {
    const matkMin = Math.max(0, Number(derived?.matkMin ?? derived?.matk ?? player?.matk ?? 0));
    const matkMax = Math.max(matkMin, Number(derived?.matkMax ?? derived?.matk ?? player?.matk ?? matkMin));
    flatAddition = matkMax > matkMin ? matkMin + Math.floor(Math.random() * (matkMax - matkMin + 1)) : matkMin;
  }
  const result = window.CombatDamagePipeline?.resolvePhysicalSkill(profile, level, target, { ratio: totalRatio, flatAddition, skipHitCheck: true, criticalResult: combatOptions.criticalResult });
  if (!result) return null;
  if (result.elementImmune === true) return 0;
  if (profile.formula === "renewal_occult_impaction") {
    const targetDef = Math.max(0, Number(target?.hardDef ?? target?.def ?? 0));
    return Math.max(1, Number(result.damage || 0) + Math.floor(targetDef * Number(ratio || 0) / 200));
  }
  if (profile.formula === "renewal_tiger_cannon") return Math.max(1, Number(result.damage || 0) + Number(combatOptions.tigerCannonFlatDamage || 0));
  if (profile.formula === "renewal_gate_of_hell") return Math.max(1, Number(result.damage || 0) + Number(combatOptions.gateOfHellFlatDamage || 0));
  return Math.max(1, result.damage);
}


function applyCardSkillDamageRate(skill, damage) {
  if(damage===null||damage===undefined)return damage;
  const rate=window.CardRuntime?.getSkillDamageRate ? Number(window.CardRuntime.getSkillDamageRate(skill)||0) : 0;
  return rate ? Math.max(0,Math.floor(Number(damage||0)*(100+rate)/100)) : damage;
}
function getCardSkillKnockbackBonus(skill) {
  if(window.EffectRuntime?.getSkillKeyed)return Number(window.EffectRuntime.getSkillKeyed("skillKnockbackBonus",skill,player)||0);
  const total=window.CardRuntime?.getMergedSource?.()||{},map=total.skillKnockbackBonus||{};
  const keys=[String(skill?.officialId??skill?.id??0),String(skill?.key||""),String(skill?.skillKey||""),String(skill?.aegisName||"")];
  return keys.reduce((sum,key)=>sum+Number(map[key]||0),Number(map.All||0));
}
function calculateSkillAttackDamage(skill, requestedLevel = null, target = currentMonster, combatOptions = {}) {
  return applyCardSkillDamageRate(skill, calculateSkillAttackDamageBase(skill, requestedLevel, target, combatOptions));
}

function getRuntimeCombatCandidates(options = {}) {
  const context = window.RO_WEB_COMBAT_EVAL_CONTEXT;
  if (!options.ignoreContext && Array.isArray(context?.candidates)) return context.candidates;
  if (typeof window.getCombatEnemyCandidates === "function") return window.getCombatEnemyCandidates(options);
  if (typeof window.getCombatGroundCandidates === "function") return window.getCombatGroundCandidates(options);
  if (typeof window.getWorldMonsterTestEntities === "function") return (window.getWorldMonsterTestEntities(options) || []).filter(Boolean);
  return currentMonster ? [currentMonster] : [];
}

function createRuntimeCombatEvaluationContext(options = {}) {
  return {
    startedAt: typeof performance !== "undefined" && performance.now ? performance.now() : Date.now(),
    derivedStats: typeof calculateDerivedPlayerStats === "function" ? (calculateDerivedPlayerStats() || {}) : {},
    activeBuffTotals: typeof getActiveBuffBonusTotals === "function" ? (getActiveBuffBonusTotals() || {}) : {},
    passiveSkillBonusTotals: typeof getPassiveSkillBonusTotals === "function" ? (getPassiveSkillBonusTotals() || {}) : {},
    passiveCombatModifierTotals: typeof getPassiveCombatModifierTotals === "function" ? (getPassiveCombatModifierTotals() || {}) : {},
    trainingBonusTotals: typeof getTrainingBonusTotals === "function" ? (getTrainingBonusTotals() || {}) : {},
    // Candidate collection is intentionally opt-in. A single-target cast should
    // not enumerate the whole regional monster population merely to calculate stats.
    candidates: Array.isArray(options.candidates) ? options.candidates : null
  };
}
window.createRuntimeCombatEvaluationContext = createRuntimeCombatEvaluationContext;

function withRuntimeCombatEvaluationContext(callback, options = {}) {
  const previous = window.RO_WEB_COMBAT_EVAL_CONTEXT || null;
  if (previous) return callback(previous);
  const context = createRuntimeCombatEvaluationContext(options);
  window.RO_WEB_COMBAT_EVAL_CONTEXT = context;
  try { return callback(context); }
  finally { window.RO_WEB_COMBAT_EVAL_CONTEXT = previous; }
}
window.withRuntimeCombatEvaluationContext = withRuntimeCombatEvaluationContext;

function applyRuntimeCalculatedDamage(target, calculatedDamage, options = {}) {
  if (!target) return { calculatedDamage:0, dealt:0, killed:false };
  const calculated = Math.max(0, Math.floor(Number(calculatedDamage || 0)));
  const hpKey = target.currentHp !== undefined ? "currentHp" : "hp";
  const before = Math.max(0, Number(target[hpKey] || 0));
  const dealt = Math.min(before, calculated);
  target[hpKey] = Math.max(0, before - dealt);
  if (dealt > 0 && options.notifyStatus !== false && window.StatusManager?.onDamage) {
    window.StatusManager.onDamage(target, dealt, { source:options.source || player, skillId:Number(options.skillId || 0) });
  }
  if (dealt > 0 && Number(options.skillId || 0) > 0) {
    window.SkillEffectRuntimeV92?.onSkillHit?.(Number(options.skillId), target, {
      dealt,
      calculatedDamage: calculated,
      additional: options.additional === true || options.triggeredByNormalAttack === true
    });
  }
  if (calculated > 0 && options.showNumber !== false && typeof showDamageNumber === "function") showDamageNumber(calculated, {
    target,
    source:options.additional === true || options.triggeredByNormalAttack === true ? "additional" : (options.damageSource || "player"),
    critical:options.additional === true || options.triggeredByNormalAttack === true ? false : (options.critical === true || options.criticalResult?.critical === true),
    hitCount:Math.max(1, Number(options.hitCount || 1), Number(options.visualHitCount || 1), Number(options.damageHitCount || 1)),
    combo:options.additional === true || options.triggeredByNormalAttack === true || options.combo === true || options.multiHit === true || Math.max(1, Number(options.hitCount || 1), Number(options.visualHitCount || 1), Number(options.damageHitCount || 1)) > 1,
    offsetX:Number(options.damageNumberOffsetX || 0),
    offsetY:Number(options.damageNumberOffsetY || 0)
  });
  if (dealt > 0 && options.playHit !== false && typeof playMonsterHitAnimation === "function") playMonsterHitAnimation(target);
  return { calculatedDamage:calculated, dealt, killed:before > 0 && Number(target[hpKey] || 0) <= 0 };
}
window.applyRuntimeCalculatedDamage = applyRuntimeCalculatedDamage;

function requestRuntimeCombatSave() {
  if (typeof window.requestGameSave === "function") return window.requestGameSave(300);
  if (typeof saveGame === "function") saveGame();
  return true;
}
window.requestRuntimeCombatSave = requestRuntimeCombatSave;

function getRuntimeTargetingBounds(origin, options = {}) {
  if (!origin) return null;
  const cell = Math.max(1, Number(window.RO_WEB_CELL_SIZE || 36));
  const x = Number(origin?.position?.x ?? origin?.worldX ?? origin?.x ?? 0);
  const y = Number(origin?.position?.y ?? origin?.worldY ?? origin?.y ?? 0);
  const rangePx = Math.max(0, Number(options.rangeCells || 0) * cell);
  const widthPx = Math.max(cell, Number(options.widthCells || 1) * cell);
  const pad = ["directed_line","line"].includes(String(options.shape || "")) ? widthPx : rangePx;
  return { minX:x-rangePx-pad, maxX:x+rangePx+pad, minY:y-rangePx-pad, maxY:y+rangePx+pad };
}

function getRuntimeSplashAreaValue(value, skillLevel = 1, fallback = 0) {
  if (Array.isArray(value) && value.length && value.some(row => row && typeof row === "object")) {
    const level = Math.max(1, Number(skillLevel || 1));
    const rows = value.filter(row => row && typeof row === "object")
      .map(row => ({ level:Number(row.Level ?? row.level ?? 1), area:Number(row.Area ?? row.area ?? row.Value ?? row.value ?? fallback) }))
      .filter(row => Number.isFinite(row.area))
      .sort((a,b) => a.level - b.level);
    const matched = rows.filter(row => row.level <= level).pop() || rows[0];
    return Number(matched?.area ?? fallback);
  }
  return Number(getLevelValue(value, skillLevel, fallback));
}

function getRuntimeEffectiveTargeting(skill, profile = {}, skillLevel = 1) {
  const explicit = profile?.targeting && typeof profile.targeting === "object"
    ? profile.targeting
    : (profile?.area && typeof profile.area === "object" ? profile.area : null);
  const splash = Math.max(0, getRuntimeSplashAreaValue(skill?.splashArea ?? profile?.splashRange, skillLevel, 0) || 0);
  if (explicit && Object.keys(explicit).length) {
    const resolved = { ...explicit };
    const shape = String(resolved.shape || "circle").trim().toLowerCase();
    // Official skill_db SplashArea is the authoritative radius for circular or
    // square AoE. Several older hand-written profiles used smaller placeholder
    // radii, which made Crusader/Blacksmith/Assassin area skills feel single-target.
    // Preserve line/cone geometry because SplashArea there can describe width,
    // not travel length.
    if (splash > 0 && ["circle", "square"].includes(shape)) {
      const explicitRadius = Math.max(0, Number(getLevelValue(resolved.radius ?? resolved.rangeCells, skillLevel, 0)) || 0);
      if (splash > explicitRadius) {
        resolved.radius = splash;
        resolved.officialSplashAreaExpanded = true;
      }
    }
    return resolved;
  }
  if (splash <= 0) return null;
  const targetType = String(skill?.targetType || skill?.target || "").trim().toLowerCase();
  const selfOrigin = targetType === "self" || profile?.affectsSelf === true || String(profile?.targetPolicy || "").toLowerCase() === "self";
  return {
    origin: selfOrigin ? "self" : "target",
    shape: "circle",
    radius: splash,
    maxTargets: 999,
    forcePrimaryTarget: selfOrigin ? false : true,
    derivedFromOfficialSplashArea: true
  };
}

function runtimeSkillRequiresPrimaryTarget(skill, profile = {}, skillLevel = 1) {
  if (profile?.requiresPrimaryTarget === true) return true;
  if (profile?.requiresPrimaryTarget === false) return false;
  const targeting = getRuntimeEffectiveTargeting(skill, profile, skillLevel);
  const targetType = String(skill?.targetType || skill?.target || "").trim().toLowerCase();
  if (!targeting) return !["self", "passive"].includes(targetType);
  const origin = String(targeting.origin || "target").toLowerCase();
  if (origin !== "self") return true;
  const shape = String(targeting.shape || "circle").toLowerCase();
  return ["directed_line", "line", "cone", "sector"].includes(shape) || targeting.directionTargetRequired === true;
}

function runtimeSkillRequiresPrimaryTargetRange(skill, profile = {}, skillLevel = 1) {
  if (profile?.skipPrimaryRangeCheck === true) return false;
  if (profile?.requiresPrimaryTargetRange === true) return true;
  if (profile?.requiresPrimaryTargetRange === false) return false;
  const targeting = getRuntimeEffectiveTargeting(skill, profile, skillLevel);
  const targetType = String(skill?.targetType || skill?.target || "").trim().toLowerCase();
  if (!targeting) return !["self", "passive"].includes(targetType);
  if (targeting.rangeToPrimaryTarget === true) return true;
  return String(targeting.origin || "target").toLowerCase() !== "self";
}

function resolveRuntimeSkillTargets(profile, primaryTarget, skillLevel = 1, explicitSkill = null) {
  const skillId = Number(explicitSkill?.officialId ?? explicitSkill?.id ?? profile?.officialId ?? profile?.skillId ?? profile?.id ?? 0);
  const skill = explicitSkill || (skillId && typeof getSkillDataById === "function" ? getSkillDataById(skillId) : null);
  const targeting = getRuntimeEffectiveTargeting(skill, profile, skillLevel);
  if (!targeting || !window.TargetingResolver) return primaryTarget ? [primaryTarget] : [];
  const origin = (String(targeting.origin || "target").toLowerCase() === "self") ? player : primaryTarget;
  if (!origin) return [];
  let resolvedRangeCells = Number(getLevelValue(targeting.radius ?? targeting.rangeCells ?? profile?.splashRange ?? 1, skillLevel, 1));
  if (targeting.rangeToPrimaryTarget === true && origin && primaryTarget) {
    const cell = Math.max(1, Number(window.RO_WEB_CELL_SIZE || 36));
    const ox = Number(origin?.position?.x ?? origin?.worldX ?? origin?.x ?? 0);
    const oy = Number(origin?.position?.y ?? origin?.worldY ?? origin?.y ?? 0);
    const tx = Number(primaryTarget?.position?.x ?? primaryTarget?.worldX ?? primaryTarget?.x ?? 0);
    const ty = Number(primaryTarget?.position?.y ?? primaryTarget?.worldY ?? primaryTarget?.y ?? 0);
    resolvedRangeCells = Math.max(resolvedRangeCells, Math.ceil(Math.hypot(tx - ox, ty - oy) / cell));
  }
  const rawShape = String(targeting.shape || "circle").toLowerCase();
  const normalizedShape = rawShape === "line" && String(targeting.origin || "target").toLowerCase() === "self" && primaryTarget
    ? "directed_line" : rawShape;
  const options = {
    shape: normalizedShape,
    rangeCells: resolvedRangeCells,
    maxTargets: Number(targeting.maxTargets || 999),
    widthCells: Number(targeting.widthCells || 1),
    halfAngleRadians: Number(targeting.halfAngleRadians || Math.PI / 4),
    directionTarget: primaryTarget
  };
  const bounds = getRuntimeTargetingBounds(origin, options);
  const candidates = getRuntimeCombatCandidates({ bounds, activeOnly:true, ignoreContext:true });
  const targets = window.TargetingResolver.collect(origin, candidates, options);
  const originMode = String(targeting.origin || "target").toLowerCase();
  const forcePrimary = targeting.forcePrimaryTarget === true || (targeting.forcePrimaryTarget !== false && originMode !== "self");
  if (primaryTarget && forcePrimary && !targets.includes(primaryTarget)) targets.unshift(primaryTarget);
  const maxTargets = Math.max(1, Number(options.maxTargets || 999));
  return targets.slice(0, maxTargets);
}
window.getRuntimeSplashAreaValue = getRuntimeSplashAreaValue;
window.getRuntimeEffectiveTargeting = getRuntimeEffectiveTargeting;
window.runtimeSkillRequiresPrimaryTarget = runtimeSkillRequiresPrimaryTarget;
window.runtimeSkillRequiresPrimaryTargetRange = runtimeSkillRequiresPrimaryTargetRange;
window.resolveRuntimeSkillTargets = resolveRuntimeSkillTargets;
window.getRuntimeCombatCandidates = getRuntimeCombatCandidates;

function getRuntimeSkillCriticalMode(skill, profile = {}, activeBuffTotals = null) {
  const skillId = Number(skill?.officialId ?? skill?.id ?? profile?.skillId ?? 0);
  const active = activeBuffTotals || (typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {});
  // rAthena Renewal Gale Storm is non-critical by default and becomes critical
  // only while Calamity Gale is active. Keep this explicit exception ahead of
  // the generic skill_db DamageFlags.Critical fallback.
  if (skillId === 5330) return Number(active?.calamityGale || 0) > 0 ? "normal" : "never";
  const explicit = String(profile?.criticalMode || "").trim().toLowerCase();
  if (explicit) return explicit === "allowed" ? "normal" : explicit;
  const handler = String(profile?.damageHandler || profile?.handler || "").toLowerCase();
  const attackHandler = ["physical_attack", "physical_attack_size_hits", "physical_attack_formula", "physical_charge", "warg_sensitive_keen"].includes(handler);
  if (attackHandler && skill?.damageFlags?.Critical === true) return "normal";
  return "never";
}
window.getRuntimeSkillCriticalMode = getRuntimeSkillCriticalMode;

function getRuntimeGroundAttackSpec(skill, profile, level) {
  const ground = profile?.ground || {};
  const targeting = profile?.targeting || {};
  const unit = skill?.unit || {};
  const durationMs = Math.max(16, Number(getLevelValue(ground.durationMs ?? profile?.duration ?? profile?.groundDuration ?? skill?.duration1, level, 0)) || 0);
  const rawInterval = Number(getLevelValue(ground.tickIntervalMs ?? profile?.tickIntervalMs ?? unit.Interval, level, 1000));
  const tickIntervalMs = Math.max(16, rawInterval > 0 ? rawInterval : 1000);
  let maxTicks = Math.max(0, Number(getLevelValue(ground.maxTicks ?? ground.damageApplications ?? profile?.maxTicks, level, 0)) || 0);
  if (!maxTicks) {
    if (Number(skill?.officialId ?? skill?.id) === 85) maxTicks = 1;
    else if (Array.isArray(profile.damageHitCount) || Number(profile.damageHitCount || 0) > 1) maxTicks = Math.max(1, Number(getLevelValue(profile.damageHitCount, level, 1)));
    else maxTicks = Math.max(1, Math.ceil(Math.max(tickIntervalMs, durationMs || tickIntervalMs) / tickIntervalMs));
  }
  const effectiveDurationMs = Math.max(durationMs || 0, tickIntervalMs * maxTicks);
  const radiusCells = Math.max(0, Number(getLevelValue(targeting.radius ?? targeting.rangeCells ?? skill?.splashArea ?? unit.Layout ?? unit.Range, level, 0)) || 0);
  const flags = unit?.Flag || unit?.flag || {};
  const noOverlap = ground.noOverlap === true || flags.NoOverlap === true;
  return {
    ground, targeting, unit, tickIntervalMs, maxTicks, durationMs: effectiveDurationMs,
    radiusCells, shape: targeting.shape || "circle", maxTargets: Math.max(1, Number(getLevelValue(targeting.maxTargets ?? profile.maxTargets, level, 999)) || 999),
    noOverlap, overlapPolicy: String(ground.overlapPolicy || (noOverlap ? "reject" : "stack")),
    activeInstanceLimit: Math.max(0, Number(getLevelValue(ground.activeInstanceLimit ?? skill?.activeInstance, level, 0)) || 0),
    initialDelayMs: Math.max(0, Number(getLevelValue(ground.initialDelayMs ?? profile?.initialDelayMs, level, 0)) || 0)
  };
}

function resolveRuntimeGroundCastPosition(skill, profile, level, target = currentMonster) {
  const originMode = String(profile?.targeting?.origin || "target").toLowerCase();
  const origin = originMode === "self" ? player : target;
  if (!origin || !window.GroundPlacementResolver) return { ok:false, reason:"找不到地面技能落點" };
  const placement = window.GroundPlacementResolver.resolve(origin, {
    snapToCell:true, strictBounds:true, kind:"ground", skillId:Number(skill?.officialId ?? skill?.id ?? 0),
    source:player, target, rangeCells:typeof getSkillRangeCells === "function" ? getSkillRangeCells(skill, level) : null
  });
  if (!placement?.ok) return { ok:false, reason:placement?.reason || "地面技能落點不合法" };
  return placement;
}

function getRuntimeGroundBlockText(reason) {
  const map = {
    land_protector:"地面受到地元素領域保護，技能無法設置",
    no_overlap:"同類地面技能不能在目前位置重疊",
    out_of_bounds:"技能落點超出地圖範圍",
    illegal_cell:"目前格子不能設置地面技能",
    invalid_position:"找不到有效技能落點"
  };
  return map[String(reason || "")] || "地面技能無法設置";
}

function applyRuntimeGroundAttackTick(skill, level, profile, targets, effect, context = {}) {
  const previousEvalContext=window.RO_WEB_COMBAT_EVAL_CONTEXT||null;
  if(!previousEvalContext)window.RO_WEB_COMBAT_EVAL_CONTEXT=createRuntimeCombatEvaluationContext({candidates:targets||[]});
  try {
  const tickProfile = { ...profile, ground:undefined, damageHitCount:1, visualHitCount:1 };
  let totalDamage = 0, hitTargets = 0;
  const selected = (targets || []).filter(target => target && Number(target.currentHp ?? target.hp ?? 0) > 0).slice(0, Number(effect?.metadata?.maxTargets || 999));
  for (const target of selected) {
    if (!matchesRuntimeTargetConditions(profile, target)) continue;
    const damage = calculateSkillAttackDamage(skill, level, target, {
      profileOverride:tickProfile, skipHitCheck:true, phase:"tick", tickNumber:Number(context.tickNumber || 1), targetCount:selected.length
    });
    if (damage === null) continue;
    const calculatedDamage = Math.max(1, Number(damage || 1));
    const appliedDamage = applyRuntimeCalculatedDamage(target, calculatedDamage, { skillId:Number(skill?.officialId ?? skill?.id), showNumber:false, playHit:false });
    const dealt = appliedDamage.dealt;
    applyAttackRuntimeStatus(profile, level, target);
    const knockbackCells = Math.max(0, (Number(getLevelValue(profile.knockbackCells, level, 0)) || 0) + getCardSkillKnockbackBonus(skill));
    if (knockbackCells > 0) window.MovementEffectResolver?.knockback(target, player, knockbackCells);
    if (typeof showDamageNumber === "function") showDamageNumber(calculatedDamage, { target });
    if (typeof playMonsterHitAnimation === "function") playMonsterHitAnimation(target);
    totalDamage += calculatedDamage; hitTargets += 1;
  }
  if (currentMonster && Number(currentMonster.currentHp || 0) <= 0 && typeof defeatMonster === "function") defeatMonster();
  else if (typeof updateMonsterUI === "function") updateMonsterUI();
  if (hitTargets > 0) effect.metadata.totalHits = Number(effect.metadata.totalHits || 0) + hitTargets;
  effect.metadata.totalDamage = Number(effect.metadata.totalDamage || 0) + totalDamage;
  return { totalDamage, hitTargets };
  } finally { if(!previousEvalContext)window.RO_WEB_COMBAT_EVAL_CONTEXT=previousEvalContext; }
}

function castPeriodicGroundAttackSkill(skill, requestedLevel = null, options = {}, preparedCheck = null) {
  const check = preparedCheck || canCastSkill(skill, requestedLevel, ["physical_attack", "physical_attack_size_hits", "physical_attack_formula", "physical_charge", "magic_multihit", "magic_damage", "misc_damage"]);
  if (!check?.ok) return reportPendingRuntime(skill, check?.reason);
  if (!currentMonster || !window.GroundEffectManager || !window.GroundPlacementResolver) return false;
  const { level, profile } = check;
  const placement = resolveRuntimeGroundCastPosition(skill, profile, level, currentMonster);
  if (!placement.ok) { addBattleLog(`${skill.name}：${getRuntimeGroundBlockText(placement.reason)}。`); return false; }
  const spec = getRuntimeGroundAttackSpec(skill, profile, level);
  const baseX = placement.x, baseY = placement.y;
  const id = `ground_attack_${skill.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const stackKey = spec.noOverlap ? `ground_skill_${Number(skill?.officialId ?? skill?.id)}` : null;
  const randomize = profile?.ground?.randomizeImpactCenter === true || Number(skill?.officialId ?? skill?.id) === 83;
  const randomRadius = Math.max(0, Number(getLevelValue(profile?.ground?.randomCenterRadiusCells, level, spec.radiusCells)) || 0);
  const effectId = window.GroundEffectManager.create({
    id, x:baseX, y:baseY, shape:spec.shape, rangeCells:spec.radiusCells, tickMs:spec.tickIntervalMs,
    durationMs:spec.durationMs, initialDelayMs:spec.initialDelayMs, maxTicks:spec.maxTicks,
    isGroundMagic:true, sourceSkillId:Number(skill?.officialId ?? skill?.id), ownerKey:"player",
    stackKey, noOverlapKey:spec.noOverlap ? stackKey : null, overlapPolicy:spec.overlapPolicy,
    activeInstanceLimit:spec.activeInstanceLimit, ignoreLandProtector:profile.ignoreLandProtector === true,
    metadata:{ skillId:Number(skill?.officialId ?? skill?.id), skillName:skill.name, level, maxTargets:spec.maxTargets, totalDamage:0, totalHits:0, baseX, baseY },
    beforeTick(effect){
      if (!randomize || randomRadius <= 0) return;
      const cell = window.GroundPlacementResolver.cellSize();
      let dx = 0, dy = 0;
      for (let attempt=0; attempt<12; attempt++) {
        dx = Math.floor(Math.random() * (randomRadius * 2 + 1)) - randomRadius;
        dy = Math.floor(Math.random() * (randomRadius * 2 + 1)) - randomRadius;
        if (Math.hypot(dx,dy) <= randomRadius) break;
      }
      const moved = window.GroundPlacementResolver.resolve({x:baseX + dx*cell, y:baseY + dy*cell},{snapToCell:true,strictBounds:false,kind:"ground",skillId:Number(skill?.officialId ?? skill?.id)});
      if (moved?.ok) { effect.x=moved.x; effect.y=moved.y; }
    },
    onTick(targets,effect,context){ applyRuntimeGroundAttackTick(skill,level,profile,targets,effect,context); }
  });
  if (!effectId) { addBattleLog(`${skill.name}：${getRuntimeGroundBlockText(window.GroundEffectManager.lastBlockReason)}。`); return false; }
  const resource = applyRuntimeResourceCost(profile, level, skill);
  if (!resource.ok) { window.GroundEffectManager.remove(effectId); addBattleLog(`${skill.name} 所需戰鬥資源不足。`); return false; }
  options.consumedResource = resource.used;
  paySkillCost(skill, level);
  addBattleLog(`施放 ${skill.name} Lv${level}：${spec.radiusCells * 2 + 1}×${spec.radiusCells * 2 + 1} 範圍，預計 ${spec.maxTicks} 波。`);
  updatePlayerUI(); saveGame(); return true;
}


function finalizeSecondaryRuntimeSkillDefeat(target) {
  if (!target || target === currentMonster || Number(target.currentHp || 0) > 0 || target._deathHandled || target._defeatResolutionQueued) return false;
  if (typeof queueMonsterDefeatResolution === "function") return queueMonsterDefeatResolution(target, { primary:false });
  if (target._worldTestEntity && typeof onWorldMonsterDefeated === "function") onWorldMonsterDefeated(target);
  else if (typeof playMonsterDeathAnimation === "function") playMonsterDeathAnimation(target);
  return true;
}
window.finalizeSecondaryRuntimeSkillDefeat = finalizeSecondaryRuntimeSkillDefeat;

function castAttackSkill(skill, requestedLevel = null, options = {}) {
  const check = canCastSkill(skill, requestedLevel, ["physical_attack", "physical_attack_size_hits", "physical_attack_formula", "physical_charge", "magic_multihit", "magic_damage", "misc_damage"], options);
  if (!check.ok) return reportPendingRuntime(skill, check.reason);
  const level = check.level, profile = check.profile;
  const requiresPrimaryTarget = runtimeSkillRequiresPrimaryTarget(skill, profile, level);
  const requiresPrimaryRange = runtimeSkillRequiresPrimaryTargetRange(skill, profile, level);
  if (!currentMonster && requiresPrimaryTarget) return false;
  const skillRange = typeof getSkillRangePx === "function" ? getSkillRangePx(skill, level) : null;
  if (requiresPrimaryRange && currentMonster && typeof canAttackMonsterByRange === "function" && !canAttackMonsterByRange(currentMonster, skillRange)) {
    if (typeof movePlayerTowardMonster === "function") movePlayerTowardMonster(currentMonster, skillRange);
    addBattleLog(`${skill.name} 距離不足，正在靠近目標。`); return false;
  }
  if(Array.isArray(profile.requiresActiveBuffEffectAny)&&profile.requiresActiveBuffEffectAny.length){
    const active=typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals():{};
    if(!profile.requiresActiveBuffEffectAny.some(key=>Number(active[key]||0)>0)){if(typeof addBattleLog==="function")addBattleLog(profile.requiredBuffMessage || `${skill.name}需要先召喚高階元素。`);return false;}
  }
  if (["periodic","stay"].includes(String(profile?.ground?.triggerMode || ""))) return castPeriodicGroundAttackSkill(skill, level, options, check);
  const elementalActionSpec = profile.formula === "renewal_elemental_action" ? getElementalActionRuntimeSpec(profile) : null;
  const hitMeta = window.MultiHitResolver ? window.MultiHitResolver.normalize(profile, level) : {damageHitCount:1,visualHitCount:1,statusProcMode:"once",hitCheckMode:"once",criticalCheckMode:"once"};
  if (elementalActionSpec) hitMeta.visualHitCount = Math.max(1, Number(elementalActionSpec.visualHits || 1));
  if (profile.dynamicHitCountResource && window.CombatResourceManager) {
    const cfg = profile.dynamicHitCountResource;
    const dynamicHits = Math.max(1, Math.min(Number(cfg.max || 5), Number(window.CombatResourceManager.get(cfg.type) || 0) + Number(cfg.offset || 0)));
    hitMeta.damageHitCount = dynamicHits; hitMeta.visualHitCount = dynamicHits;
  }
  if (profile.randomVisualHitCount) {
    const cfg=profile.randomVisualHitCount, chance=Number(getLevelValue(cfg.chancePercent,level,0));
    hitMeta.visualHitCount=(Math.random()*100<chance)?Number(cfg.success||3):Number(cfg.failure||2);
  }
  if (profile.conditionalVisualHitCount) {
    const cfg=profile.conditionalVisualHitCount, active=Number(typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals()[cfg.effect]||0:0)>0;
    hitMeta.visualHitCount=Number(active?cfg.active:cfg.inactive)||hitMeta.visualHitCount;
  }
  if (profile.weaponVisualHitCount) {
    const cfg=profile.weaponVisualHitCount, wt=String(typeof getEquippedWeaponTypeRuntime==="function"?getEquippedWeaponTypeRuntime():"").toLowerCase();
    const twoHanded=wt.includes("2haxe")||wt.includes("twohandaxe")||wt.includes("two_hand_axe");
    hitMeta.visualHitCount=Number(twoHanded?cfg.twoHanded:cfg.default)||hitMeta.visualHitCount;
  }
  const attackHandler = profile.damageHandler || profile.handler;
  const isMagic = attackHandler === "magic_multihit" || attackHandler === "magic_damage";
  const previousEvalContext = window.RO_WEB_COMBAT_EVAL_CONTEXT || null;
  const targetProfile = elementalActionSpec ? { ...profile, targeting: Number(elementalActionSpec.radius || 0) > 0 ? { origin:"target", shape:"circle", radius:Number(elementalActionSpec.radius), forcePrimaryTarget:true } : null } : profile;
  // Select spatially-near targets first, then cache combat stats for exactly
  // those targets. This removes the full-population scan from every cast.
  const targets = resolveRuntimeSkillTargets(targetProfile, currentMonster, level, skill);
  if (!targets.length) return false;
  const evalContext = createRuntimeCombatEvaluationContext({ candidates:targets });
  window.RO_WEB_COMBAT_EVAL_CONTEXT = evalContext;
  try {
  if(profile.requiresTargetStatus && !targetHasRuntimeStatus(currentMonster,profile.requiresTargetStatus)){if(String(options?.source||"")!=="auto_battle")addBattleLog(`${skill.name} 需要目標先被標記。`);return false;}
  options.preCastHp=Number(player?.hp||0);options.preCastMaxHp=Number(player?.maxHp||0);options.preCastMaxSp=Number(player?.maxSp||0);
  options.preCastSp=Number(player?.sp||0);
  options.preCastResource=profile?.resourceCost?.type&&window.CombatResourceManager?Number(window.CombatResourceManager.get(profile.resourceCost.type)||0):0;
  const resource=applyRuntimeResourceCost(profile, level, skill); if(!resource.ok){addBattleLog(`${skill.name} 所需戰鬥資源不足。`);return false;}
  options.consumedResource=resource.used;
  paySkillCost(skill, level);
  if (profile.moveAdjacentToTarget && typeof movePlayerAdjacentToMonster === "function") movePlayerAdjacentToMonster(currentMonster);
  let totalDamage = 0, hitTargets = 0, missedTargets = 0;
  for (const target of targets) {
    if (!target || Number(target.currentHp || 0) <= 0) continue;
    const targetWasAlive = Number(target.currentHp || 0) > 0;
    if (!matchesRuntimeTargetConditions(profile, target)) { missedTargets++; continue; }
    const canPerfectDodge = !isMagic && profile.canPerfectDodge === true;
    // Renewal order is Lucky Dodge -> critical -> regular HIT/FLEE. A critical
    // skill hit must not be discarded by a legacy pre-critical HIT roll.
    if (!options.skipHitCheck && canPerfectDodge && window.PerfectDodgeResolver?.resolve(target).dodged) { if (profile.statusOnMiss) applyAttackRuntimeStatus(profile,level,target); missedTargets++; continue; }
    const activeBuffTotals=evalContext.activeBuffTotals || {};
    const critMode = getRuntimeSkillCriticalMode(skill, profile, activeBuffTotals);
    const activeCritRate=Number(activeBuffTotals.criticalDamageRate||0);
    const critBonusMultiplier=Number(profile.criticalDamageBonusRateMultiplier??1);
    const crit = !isMagic && window.CriticalResolver ? window.CriticalResolver.resolve(player,target,{criticalMode:critMode,criticalRateBonus:profile.criticalRateBonus,criticalRateMultiplier:profile.criticalRateMultiplier,criticalMultiplier:Number(profile.criticalMultiplier||1.4)*(1+activeCritRate*critBonusMultiplier/100)}) : {critical:false,multiplier:1};
    const hitMode = profile.hitMode || (profile.alwaysHit ? "always_hit" : "normal");
    const passiveHit = evalContext.passiveSkillBonusTotals || {};
    const sonicHitMultiplier = profile.formula === "renewal_sonic_blow" ? Number(passiveHit.sonicBlowHitRateMultiplier || 1) : 1;
    let runtimeHitRateBonus = getLevelValue(profile.hitRateBonus,level,0);
    if (profile.dynamicHitRateFormula === "cart_remodeling") runtimeHitRateBonus += Math.max(0, Number(typeof getSkillLevel === "function" ? getSkillLevel(2475) || 0 : 0)) * 4;
    if (!options.skipHitCheck && !isMagic && !crit.critical && window.HitResolver && !window.HitResolver.resolve(player,target,{hitMode,alwaysHit:profile.alwaysHit,perfectHit:profile.perfectHit,ignoreFlee:profile.ignoreFlee,hitRateBonus:runtimeHitRateBonus,hitRateMultiplier:sonicHitMultiplier}).hit) { if (profile.statusOnMiss) applyAttackRuntimeStatus(profile,level,target); missedTargets++; continue; }
    let damage;
    if (profile.dualStageSplash && ["renewal_chain_reaction_shot","renewal_rose_blossom"].includes(profile.formula)) {
      const secondary=calculateSkillAttackDamage(skill,level,target,{criticalResult:crit,consumedResource:options.consumedResource,secondaryStage:true});
      const primary=target===currentMonster?calculateSkillAttackDamage(skill,level,target,{criticalResult:crit,consumedResource:options.consumedResource}):0;
      damage=(primary===null||secondary===null)?null:Number(primary||0)+Number(secondary||0);
    } else damage = calculateSkillAttackDamage(skill, level, target, { criticalResult: crit, consumedResource: options.consumedResource, preCastHp:options.preCastHp, preCastMaxHp:options.preCastMaxHp, preCastSp:options.preCastSp, preCastMaxSp:options.preCastMaxSp, preCastResource:options.preCastResource, fromFlashCombo:options.fromFlashCombo, elementalActionSpec });
    if (damage === null) return reportPendingRuntime(skill, "攻擊公式尚未實作");
    const calculatedDamage = Math.max(0, Number(damage || 0));
    if (calculatedDamage <= 0) {
      const attackElement = isMagic
        ? window.RARenewalDamagePipeline?.resolveAttackElement?.(profile)
        : window.RARenewalDamagePipeline?.resolvePhysicalAttackElement?.();
      const propertyMiss = window.RARenewalDamagePipeline?.isElementImmuneAgainstTarget?.(attackElement, target, window.RARenewalDamagePipeline?.normalizeFlags?.(profile));
      if (propertyMiss) {
        missedTargets++;
        if (typeof showMissNumber === "function") showMissNumber(target);
        continue;
      }
    }
    const parts = window.MultiHitResolver ? window.MultiHitResolver.split(calculatedDamage,hitMeta.damageHitCount) : [calculatedDamage];
    let dealt = 0;
    for (let i=0;i<parts.length;i++) {
      const appliedPart = Math.min(Number(target.currentHp||0),Math.max(0,Number(parts[i]||0)));
      target.currentHp = Math.max(0,Number(target.currentHp||0)-appliedPart); dealt += appliedPart;
      if (hitMeta.statusProcMode === "per_hit") applyAttackRuntimeStatus(profile,level,target);
      if (target.currentHp <= 0) break;
    }
    if(dealt>0&&window.StatusManager?.onDamage)window.StatusManager.onDamage(target,dealt,{source:player,skillId:Number(skill?.officialId??skill?.id)});
    if(dealt>0)window.SkillEffectRuntimeV92?.onSkillHit?.(skill,target,{dealt,calculatedDamage});
    if(dealt>0&&target===currentMonster&&Array.isArray(profile.consumePrimaryTargetStatusesOnHit)&&target?.runtimeState?.statuses){for(const statusName of profile.consumePrimaryTargetStatusesOnHit){const key=window.StatusManager?.normalize?window.StatusManager.normalize(statusName):String(statusName).toLowerCase().replace(/[ _-]/g,"");delete target.runtimeState.statuses[key];delete target.runtimeState[key];}}
    if (hitMeta.statusProcMode !== "per_hit") applyAttackRuntimeStatus(profile,level,target);
    if (elementalActionSpec) applyElementalActionRuntimeStatus(target, elementalActionSpec);
    if (!isMagic) applyActiveAttackBuffStatuses(target, dealt);
    if (Number(skill?.officialId ?? skill?.id) === 5 && window.StatusManager) {
      const fatalBlow = getFatalBlowRuntimeForBash(level);
      if (fatalBlow) window.StatusManager.apply(target, fatalBlow.status, { chancePercent: fatalBlow.chancePercent, durationMs: fatalBlow.durationMs, level });
    }
    const knockbackCells=Math.max(0,Number(getLevelValue(profile.knockbackCells,level,0))+getCardSkillKnockbackBonus(skill));
    if (knockbackCells>0 && (!profile.knockbackSecondaryOnly || target!==currentMonster)) window.MovementEffectResolver?.knockback(target,player,knockbackCells);
    if(Array.isArray(profile.clearTargetStatusTags)&&target?.runtimeState?.statuses){for(const [key,state] of Object.entries(target.runtimeState.statuses)){const tags=[state?.tag,...(state?.tags||[])].filter(Boolean).map(v=>String(v).toLowerCase());if(profile.clearTargetStatusTags.some(tag=>tags.includes(String(tag).toLowerCase())))delete target.runtimeState.statuses[key];}}
    if(Array.isArray(profile.clearTargetStatuses)&&target?.runtimeState?.statuses){
      const clearChance=Math.max(0,Math.min(100,Number(getLevelValue(profile.clearTargetStatusesChancePercent,level,100))));
      if(Math.random()*100<clearChance){
        for(const name of profile.clearTargetStatuses){const key=String(name).toLowerCase().replace(/[ _-]/g,"");delete target.runtimeState.statuses[key];delete target.runtimeState.statuses[name];delete target.runtimeState[name];}
      }
    }
    totalDamage += calculatedDamage; hitTargets++;
    const officialSkillId=Number(skill?.officialId??skill?.id);
    if(isMagic&&target===currentMonster&&[14,19,20].includes(officialSkillId)){
      const active=typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals():{};
      const doubleChance=Math.max(0,Math.min(100,Number(active.doubleCastChance||0)));
      if(doubleChance>0&&Number(target.currentHp||0)>0&&Math.random()*100<doubleChance){
        const repeatDamage=calculateSkillAttackDamage(skill,level,target,{criticalResult:crit,consumedResource:0,preCastHp:options.preCastHp,preCastMaxHp:options.preCastMaxHp,preCastSp:options.preCastSp,preCastMaxSp:options.preCastMaxSp,doubleCastRepeat:true});
        if(repeatDamage!==null){const repeatCalculated=Math.max(0,Number(repeatDamage||0));const repeatParts=window.MultiHitResolver?window.MultiHitResolver.split(repeatCalculated,hitMeta.damageHitCount):[repeatCalculated];let repeatedApplied=0;for(const value of repeatParts){const applied=Math.min(Number(target.currentHp||0),Math.max(0,Number(value||0)));target.currentHp=Math.max(0,Number(target.currentHp||0)-applied);repeatedApplied+=applied;if(target.currentHp<=0)break;}totalDamage+=repeatCalculated;if(repeatCalculated>0&&typeof showDamageNumber==="function")showDamageNumber(repeatCalculated,{target,hitCount:Math.max(1,Number(hitMeta.visualHitCount||1),Number(hitMeta.damageHitCount||1)),combo:true});if(typeof addBattleLog==="function")addBattleLog(`${skill.name} 觸發雙倍投擲，再造成 ${repeatCalculated} 點傷害。`);}
      }
    }
    if(dealt>0&&profile.lifeStealDamagePercent!==undefined){
      const chance=Math.max(0,Math.min(100,Number(getLevelValue(profile.lifeStealChancePercent,level,100))));
      if(Math.random()*100<chance){
        const rate=Math.max(0,Number(getLevelValue(profile.lifeStealDamagePercent,level,0)));
        const before=Math.max(0,Number(player?.hp||0)),maxHp=Math.max(1,Number(player?.maxHp||1));
        const healed=Math.max(0,Math.min(maxHp-before,Math.floor(dealt*rate/100)));
        if(healed>0){player.hp=before+healed;if(typeof addBattleLog==="function")addBattleLog(`${skill.name} 吸收 ${healed} 點 HP。`);}
      }
    }
    if (targetWasAlive && Number(target.currentHp || 0) <= 0) trySoulDrainRestore(target, isMagic, profile);
    if(profile.formula==="renewal_servant_demolition"&&window.CombatResourceManager)window.CombatResourceManager.add("servantWeapon",1,5);
    if (typeof playMonsterHitAnimation === "function") playMonsterHitAnimation(target);
    if (typeof showDamageNumber === "function") showDamageNumber(calculatedDamage, {
      target,
      critical:crit.critical === true,
      hitCount:Math.max(1, Number(hitMeta.visualHitCount || 1), Number(hitMeta.damageHitCount || 1)),
      combo:Math.max(1, Number(hitMeta.visualHitCount || 1), Number(hitMeta.damageHitCount || 1)) > 1 || String(profile.handler || profile.damageHandler || "") === "combo_sequence"
    });
    if (targetWasAlive && Number(target.currentHp || 0) <= 0) finalizeSecondaryRuntimeSkillDefeat(target);
  }
  if (hitTargets > 0) grantRuntimeApFromProfile(skill, level, profile, options);
  if(hitTargets&&profile.clearGroundEffectsAtTarget&&window.GroundEffectManager?.removeInArea){
    const removed=window.GroundEffectManager.removeInArea(currentMonster,{shape:profile.clearGroundEffectsShape||"circle",rangeCells:Number(getLevelValue(profile.clearGroundEffectsRadius,level,profile.targeting?.radius||4))});
    if(removed>0)addBattleLog(`${skill.name} 清除了 ${removed} 個地面效果。`);
  }
  if(hitTargets&&profile.refillSpiritSpheresOnHit&&window.CombatResourceManager){const raising=Number(typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals().spiritSphereMaxBonus||0:0),max=5+raising;window.CombatResourceManager.configure("spiritSphere",{max,start:max,durationMs:600000,regenIntervalMs:0});}
  if (hitTargets && profile.resourceGainOnHit && window.CombatResourceManager) {
    const cfg = profile.resourceGainOnHit;
    const amount = Number(getLevelValue(cfg.amount, level, 1));
    if (cfg.durationMs) {
      const start = Math.min(Number(cfg.max || 5), Number(window.CombatResourceManager.get(cfg.type) || 0) + amount);
      window.CombatResourceManager.configure(cfg.type,{max:Number(cfg.max||5),start,durationMs:Number(cfg.durationMs)});
    } else window.CombatResourceManager.add(cfg.type, amount, Number(cfg.max || 5));
  }
  if (hitTargets && profile.selfBuffOnHit) {
    const cfg=profile.selfBuffOnHit, duration=Math.max(100,Number(getLevelValue(cfg.duration,level,1000)));
    player.activeBuffs=player.activeBuffs||{};
    const effects={};Object.entries(cfg.effects||{}).forEach(([k,v])=>effects[k]=getRuntimeEffectValue(v,level));
    player.activeBuffs[String(cfg.skillId||skill.id)]={id:Number(cfg.skillId||skill.id),name:skill.name,level,effects,expiresAt:Date.now()+duration};
  }
  if (profile.selfBuffAfterCast) {
    const cfg=profile.selfBuffAfterCast, duration=Math.max(100,Number(getLevelValue(cfg.duration,level,1000)));
    player.activeBuffs=player.activeBuffs||{};
    const effects={};Object.entries(cfg.effects||{}).forEach(([k,v])=>effects[k]=getRuntimeEffectValue(v,level));
    player.activeBuffs[String(cfg.skillId||skill.id)]={id:Number(cfg.skillId||skill.id),name:skill.name,level,effects,expiresAt:Date.now()+duration};
    if(typeof recalculatePlayerStats==="function")recalculatePlayerStats();
  }
  if (profile.selfStackAfterCast) {
    const cfg=profile.selfStackAfterCast, now=Date.now(), buffId=String(cfg.skillId||skill.id), effectKey=String(cfg.effectKey||"stack");
    player.activeBuffs=player.activeBuffs||{};
    const previous=player.activeBuffs[buffId];
    const current=previous&&Number(previous.expiresAt||0)>now?Math.max(0,Number(previous?.effects?.[effectKey]||0)):0;
    const stacks=Math.min(Math.max(1,Number(cfg.max||1)),current+Math.max(1,Number(cfg.increment||1)));
    const duration=Math.max(100,Number(getLevelValue(cfg.duration,level,1000)));
    player.activeBuffs[buffId]={id:Number(cfg.skillId||skill.id),name:skill.name,level,effects:{[effectKey]:stacks},startedAt:now,expiresAt:now+duration};
    if(typeof recalculatePlayerStats==="function")recalculatePlayerStats();
  }
  if (hitTargets && !isMagic) {
    tryGentleTouchEnergyGain("skill_attack");
    advanceChargingPierceAfterHit(skill);
    if (["physical_attack", "physical_attack_size_hits", "physical_attack_formula", "physical_charge"].includes(attackHandler)) consumeVigorHpOnAttack();
  }
  if (hitTargets && (profile.selfBackslideCells || profile.selfBackslideFormula) && window.MovementEffectResolver) {
    let cells=Number(getLevelValue(profile.selfBackslideCells,level,0));
    if(profile.selfBackslideFormula==="skill_level_plus_target_distance"){
      const px=typeof distanceBetween==="function"?Number(distanceBetween(player?.position||player,currentMonster?.position||currentMonster)||0):0;
      cells=level+Math.max(0,Math.ceil(px/Number(window.RO_WEB_CELL_SIZE||36)));
    }
    window.MovementEffectResolver.backslide(player, cells, currentMonster);
    if (typeof renderPositionSprites === "function") renderPositionSprites();
  }
  if(profile.selfHpRateCost){const rate=Number(getLevelValue(profile.selfHpRateCost,level,0));player.hp=Math.max(1,Number(player.hp||1)-Math.floor(Number(player.maxHp||1)*rate/100));}
  if(profile.selfSpRateCost){const rate=Number(getLevelValue(profile.selfSpRateCost,level,0));player.sp=Math.max(0,Number(player.sp||0)-Math.floor(Number(player.maxSp||1)*rate/100));}
  if(profile.postCastSpZero)player.sp=0;
  if(profile.returnMountAfterCast && typeof returnPlayerMount === "function") returnPlayerMount(profile.returnMountAfterCast === true ? null : profile.returnMountAfterCast);
  if(Array.isArray(profile.clearBuffIds)&&player.activeBuffs){for(const id of profile.clearBuffIds)delete player.activeBuffs[String(id)];}
  if(Array.isArray(profile.removeBuffEffectKeys)&&player.activeBuffs){for(const [bid,buff] of Object.entries(player.activeBuffs)){for(const key of profile.removeBuffEffectKeys)if(buff?.effects&&key in buff.effects)delete buff.effects[key];if(buff?.effects&&Object.keys(buff.effects).length===0)delete player.activeBuffs[bid];}}
  if(profile.consumeSelfBuffEffectOnCast&&player.activeBuffs){for(const [bid,buff] of Object.entries(player.activeBuffs)){if(Number(buff?.effects?.[profile.consumeSelfBuffEffectOnCast]||0)>0)delete player.activeBuffs[bid];}}
  const camouflageBroken = typeof breakCamouflageRuntime === "function" ? breakCamouflageRuntime({silent:true}) : false;
  if (camouflageBroken && typeof addBattleLog === "function") addBattleLog("發動攻擊，偽裝戰術解除。");
  if (!hitTargets) addBattleLog(`施放 ${skill.name} Lv${level}，但是 Miss！`);
  else addBattleLog(`施放 ${skill.name} Lv${level}，命中 ${hitTargets} 個目標，共造成 ${totalDamage} 點傷害${missedTargets?`，${missedTargets} 個目標閃避`:""}。`);
  updateMonsterUI(); if(hitTargets&&typeof showSlashEffect==='function')showSlashEffect(); updatePlayerUI(); requestRuntimeCombatSave();
  return true;
  } finally {
    window.RO_WEB_COMBAT_EVAL_CONTEXT = previousEvalContext;
  }
}


function castChainMagicSkill(skill, requestedLevel = null) {
  const check=canCastSkill(skill,requestedLevel,["chain_magic"]);
  if(!check.ok)return reportPendingRuntime(skill,check.reason);
  if(!currentMonster)return false;
  const skillRange=typeof getSkillRangePx==="function"?getSkillRangePx(skill,check.level):null;
  if(typeof canAttackMonsterByRange==="function"&&!canAttackMonsterByRange(currentMonster,skillRange)){if(typeof movePlayerTowardMonster==="function")movePlayerTowardMonster(currentMonster,skillRange);addBattleLog(`${skill.name} 距離不足，正在靠近目標。`);return false;}
  const {level,profile}=check;paySkillCost(skill,level);
  const previousEvalContext=window.RO_WEB_COMBAT_EVAL_CONTEXT||null;
  if(!previousEvalContext)window.RO_WEB_COMBAT_EVAL_CONTEXT=createRuntimeCombatEvaluationContext();
  try {
  const maximumHits=Math.max(1,Number(getLevelValue(profile.maximumHits,level,4+level))),minimumSame=Math.max(1,Number(profile.minimumSameTargetHits||4)),radius=Math.max(0,Number(profile.chainSearchRadiusCells||3));
  let target=currentMonster,totalDamage=0,landed=0;
  for(let hitIndex=0;hitIndex<maximumHits&&target;hitIndex++){
    if(Number(target.currentHp||0)<=0){const searchOpt={shape:"circle",rangeCells:radius,maxTargets:999};const alive=getRuntimeCombatCandidates({bounds:getRuntimeTargetingBounds(target,searchOpt),ignoreContext:true}).filter(m=>m&&m!==target&&Number(m.currentHp||0)>0);target=alive[0]||null;if(!target)break;}
    const baseLv=Math.max(1,Number(player?.baseLevel||1)),remaining=Math.max(0,8-hitIndex),ratio=Math.floor((400+100*level)*baseLv/100)+100*remaining;
    const result=window.CombatDamagePipeline?.resolveMagicSkill(profile,level,target,{ratio,hits:1,skipHitCheck:true});if(!result)break;
    const calculated=Math.max(0,Number(result.damage||0)),applied=applyRuntimeCalculatedDamage(target,calculated,{skillId:Number(skill?.officialId??skill?.id)});totalDamage+=calculated;landed++;
    if(applied.killed)trySoulDrainRestore(target,true,profile);
    const chainOpt={shape:"circle",rangeCells:radius,maxTargets:999};const chainPool=getRuntimeCombatCandidates({bounds:getRuntimeTargetingBounds(target,chainOpt),ignoreContext:true});
    const candidates=window.TargetingResolver?window.TargetingResolver.collect(target,chainPool,chainOpt):chainPool;
    const alternatives=(candidates||[]).filter(m=>m&&m!==target&&Number(m.currentHp||0)>0);
    if(alternatives.length){target=alternatives[Math.floor(Math.random()*alternatives.length)];continue;}
    if(hitIndex+1<minimumSame&&Number(target.currentHp||0)>0)continue;
    target=null;
  }
  addBattleLog(landed?`施放 ${skill.name} Lv${level}，連鎖命中 ${landed} 次，共造成 ${totalDamage} 點傷害。`:`施放 ${skill.name} Lv${level}，但沒有命中目標。`);
  updateMonsterUI();updatePlayerUI();requestRuntimeCombatSave();return true;
  } finally { if(!previousEvalContext)window.RO_WEB_COMBAT_EVAL_CONTEXT=previousEvalContext; }
}



function getSpiritSphereMaximum(profile, level) {
  const raising = Number(typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals().spiritSphereMaxBonus || 0 : 0);
  if (profile.maxMode === "skill_level_plus_raising_dragon") return Math.max(1, Number(level || 1) + raising);
  return Math.max(5, 5 + raising);
}
function castSpiritResourceSkill(skill, requestedLevel = null) {
  const check = canCastSkill(skill, requestedLevel, ["spirit_resource"]);
  if (!check.ok) return reportPendingRuntime(skill, check.reason);
  if (!window.CombatResourceManager) return reportPendingRuntime(skill, "CombatResourceManager 尚未載入");
  const { level, profile } = check;
  const max = getSpiritSphereMaximum(profile, level);
  const current = Number(window.CombatResourceManager.get(profile.resourceType || "spiritSphere") || 0);
  let next = current;
  if (profile.resourceAction === "fill") next = max;
  else next = Math.min(max, current + Math.max(1, Number(getLevelValue(profile.amount, level, 1))));
  paySkillCost(skill, level);
  window.CombatResourceManager.configure(profile.resourceType || "spiritSphere", { max, start:next, durationMs:Number(getLevelValue(profile.duration,level,600000)), regenIntervalMs:0 });
  addBattleLog(`${skill.name}：氣彈 ${next}/${max}。`); updatePlayerUI(); saveGame(); return true;
}
function castSpiritAbsorbSkill(skill, requestedLevel = null) {
  const check = canCastSkill(skill, requestedLevel, ["spirit_absorb"]);
  if (!check.ok) return reportPendingRuntime(skill, check.reason);
  if (!window.CombatResourceManager) return reportPendingRuntime(skill, "CombatResourceManager 尚未載入");
  const { level, profile } = check; paySkillCost(skill, level);
  const type = profile.resourceType || "spiritSphere";
  const count = Number(window.CombatResourceManager.get(type) || 0);
  let restored = 0;
  if (count > 0) { restored = count * Number(profile.spPerSphere || 7); window.CombatResourceManager.clear(type); }
  else if (currentMonster && Math.random()*100 < Number(profile.monsterChancePercent || 20)) restored = Math.max(1, Number(currentMonster.level || currentMonster.baseLevel || 1) * Number(profile.monsterSpPerLevel || 2));
  player.sp = Math.min(Number(player.maxSp || 0), Number(player.sp || 0) + restored);
  addBattleLog(restored > 0 ? `${skill.name}恢復 ${restored} SP。` : `${skill.name}未能吸收到靈氣。`); updatePlayerUI(); saveGame(); return true;
}


function castSoulExchangeSkill(skill, requestedLevel = null) {
  const check = canCastSkill(skill, requestedLevel, ["soul_exchange"]);
  if (!check.ok) return reportPendingRuntime(skill, check.reason);
  if (!currentMonster || Number(currentMonster.currentHp || 0) <= 0) return false;
  const { level, profile } = check;
  const state = getMonsterRuntimeState(currentMonster);
  const onceKey = String(profile.onceStateKey || "soulExhaleUsed");
  if (profile.oncePerMonster === true && state?.[onceKey] === true) {
    addBattleLog(`${skill.name} 對同一隻怪物只能成功使用一次。`);
    return false;
  }
  paySkillCost(skill, level);
  if (state && profile.oncePerMonster === true) state[onceKey] = true;
  const rate = Math.max(0, Number(getLevelValue(profile.restoreMaxSpPercent, level, 3)));
  const before = Math.max(0, Number(player.sp || 0));
  const restored = Math.max(0, Math.min(Math.max(0, Number(player.maxSp || 0) - before), Math.floor(Number(player.maxSp || 0) * rate / 100)));
  player.sp = before + restored;
  addBattleLog(`施放 ${skill.name} Lv${level}，恢復 ${restored} SP。`);
  updatePlayerUI(); updateMonsterUI(); saveGame();
  return true;
}

function castSpiritAssimilateSkill(skill, requestedLevel = null) {
  const check=canCastSkill(skill,requestedLevel,["spirit_assimilate"]);if(!check.ok)return reportPendingRuntime(skill,check.reason);
  if(!window.CombatResourceManager)return reportPendingRuntime(skill,"CombatResourceManager 尚未載入");
  const {level,profile}=check;paySkillCost(skill,level);const type=profile.resourceType||"spiritSphere",count=Number(window.CombatResourceManager.get(type)||0);window.CombatResourceManager.clear(type);
  const restored=Math.floor(Number(player.maxSp||0)*Number(profile.restoreMaxSpPercentPerSphere||1)*count/100);player.sp=Math.min(Number(player.maxSp||0),Number(player.sp||0)+restored);
  addBattleLog(count>0?`${skill.name}吸收 ${count} 顆氣彈，恢復 ${restored} SP。`:`${skill.name}沒有可吸收的氣彈。`);updatePlayerUI();saveGame();return true;
}
function applyComboStageDamage(stageSkill, level, target, options={}) {
  if(!stageSkill||!target)return {damage:0,ok:false};const profile=getSkillRuntimeProfile(stageSkill);if(!profile)return {damage:0,ok:false};
  const damage=calculateSkillAttackDamage(stageSkill,level,target,{skipHitCheck:true,fromFlashCombo:true,preCastSp:Number(player.sp||0),preCastResource:0});if(damage===null)return {damage:0,ok:false};
  const calculatedDamage=Math.max(1,Number(damage||1));applyRuntimeCalculatedDamage(target,calculatedDamage,{skillId:Number(stageSkill?.officialId??stageSkill?.id)});
  if(Number(stageSkill.officialId??stageSkill.id)===2326)applyAttackRuntimeStatus(profile,level,target);
  return {damage:calculatedDamage,ok:true};
}
function castComboSequenceSkill(skill, requestedLevel = null, options = {}) {
  const check=canCastSkill(skill,requestedLevel,["combo_sequence"]);if(!check.ok)return reportPendingRuntime(skill,check.reason);if(!currentMonster)return false;
  const {level,profile}=check;const resource=applyRuntimeResourceCost(profile,level,skill);if(!resource.ok){addBattleLog(`${skill.name} 所需氣彈不足。`);return false;}paySkillCost(skill,level);
  let total=0,stages=0;for(const sid of profile.sequenceSkillIds||[]){if(!currentMonster||Number(currentMonster.currentHp||0)<=0)break;const stage=typeof getSkillDataById==="function"?getSkillDataById(sid):null;const stageLevel=Math.max(1,Number(typeof getSkillLevel==="function"?getSkillLevel(sid)||level:level));const r=applyComboStageDamage(stage,stageLevel,currentMonster,{fromFlashCombo:true});if(r.ok){total+=r.damage;stages++;}}
  addBattleLog(`施放 ${skill.name} Lv${level}，完成 ${stages} 段連擊，共造成 ${total} 點傷害。`);updateMonsterUI();updatePlayerUI();saveGame();return true;
}

function castInspectMonsterSkill(skill, requestedLevel = null) {
  const check = canCastSkill(skill, requestedLevel, ["inspect_monster"]);
  if (!check.ok) return reportPendingRuntime(skill, check.reason);
  if (!currentMonster) return false;
  const { level } = check;
  paySkillCost(skill, level);
  const hp = Math.max(0, Number(currentMonster.currentHp ?? currentMonster.hp ?? 0));
  const maxHp = Math.max(hp, Number(currentMonster.maxHp ?? currentMonster.hpMax ?? hp));
  const monsterLevel = Math.max(1, Number(currentMonster.level ?? currentMonster.baseLevel ?? currentMonster.lv ?? 1));
  const atk = Number(currentMonster.atk ?? currentMonster.attack ?? 0);
  const def = Number(currentMonster.def ?? currentMonster.hardDef ?? 0);
  const mdef = Number(currentMonster.mdef ?? currentMonster.magicDef ?? 0);
  const race = String(currentMonster.race ?? currentMonster.Race ?? "Unknown");
  const element = String(currentMonster.element ?? currentMonster.defElement ?? "Neutral");
  const size = String(currentMonster.size ?? currentMonster.Size ?? "Medium");
  if (typeof addBattleLog === "function") {
    addBattleLog(`${skill.name}：${currentMonster.name || "目標"} Lv${monsterLevel}，HP ${hp}/${maxHp}。`);
    addBattleLog(`種族 ${race}／屬性 ${element}／體型 ${size}／ATK ${atk}／DEF ${def}／MDEF ${mdef}。`);
  }
  if (typeof updateMonsterUI === "function") updateMonsterUI();
  if (typeof updatePlayerUI === "function") updatePlayerUI();
  if (typeof saveGame === "function") saveGame();
  return true;
}

function castStealItemSkill(skill, requestedLevel = null) {
  const check=canCastSkill(skill,requestedLevel,["steal_item"]);if(!check.ok)return reportPendingRuntime(skill,check.reason);if(!currentMonster)return false;
  paySkillCost(skill,check.level);const result=typeof attemptStealItem==="function"?attemptStealItem(currentMonster,check.level,{source:"skill"}):{ok:false,reason:"偷竊系統未載入"};
  addBattleLog(result.ok?`${skill.name}成功：取得 ${result.itemName} ×1。`:`${skill.name}失敗${result.reason?`：${result.reason}`:"。"}`);updatePlayerUI();saveGame();return true;
}
function castStealZenySkill(skill, requestedLevel = null) {
  const check=canCastSkill(skill,requestedLevel,["steal_zeny"]);if(!check.ok)return reportPendingRuntime(skill,check.reason);if(!currentMonster)return false;
  paySkillCost(skill,check.level);const result=typeof attemptStealZeny==="function"?attemptStealZeny(currentMonster,check.level):{ok:false,reason:"偷錢系統未載入"};
  addBattleLog(result.ok?`${skill.name}成功：取得 ${result.amount} Zeny。`:`${skill.name}失敗${result.reason?`：${result.reason}`:"。"}`);updatePlayerUI();saveGame();return true;
}
function castSkillCopySelector(skill, requestedLevel = null) {
  const check=canCastSkill(skill,requestedLevel,["skill_copy_selector"]);if(!check.ok)return reportPendingRuntime(skill,check.reason);
  paySkillCost(skill,check.level);const opened=typeof openSkillCopySelector==="function"&&openSkillCopySelector(check.profile.copyMode||"plagiarism",check.level);if(!opened)return reportPendingRuntime(skill,"技能選擇視窗未載入");updatePlayerUI();saveGame();return true;
}
function castFollowAreaSkill(skill, requestedLevel = null) {
  const check=canCastSkill(skill,requestedLevel,["follow_area"]);if(!check.ok)return reportPendingRuntime(skill,check.reason);if(!window.GroundEffectManager)return false;
  const {level,profile}=check;paySkillCost(skill,level);const id=`follow_skill_${skill.id}`;window.GroundEffectManager.remove(id);
  const duration=Math.max(100,Number(getLevelValue(profile.duration,level,120000))),tick=Math.max(100,Number(getLevelValue(profile.tickIntervalMs,level,300)));
  window.GroundEffectManager.create({id,followTarget:player,shape:profile.targeting?.shape||"circle",rangeCells:Number(profile.targeting?.radius||2),tickMs:tick,durationMs:duration,maxTicks:Math.ceil(duration/tick),onTick(targets){
    withRuntimeCombatEvaluationContext(() => {
      for(const target of targets||[]){if(!target||Number(target.currentHp||0)<=0)continue;const damage=calculateSkillAttackDamage(skill,level,target,{skipHitCheck:true});if(damage===null)continue;const calculatedDamage=Math.max(1,Number(damage||1));applyRuntimeCalculatedDamage(target,calculatedDamage,{skillId:Number(skill?.officialId??skill?.id)});}
    });
    if(currentMonster&&Number(currentMonster.currentHp||0)<=0&&typeof defeatMonster==="function")defeatMonster();else if(typeof updateMonsterUI==="function")updateMonsterUI();
  }});
  addBattleLog(`施放 ${skill.name} Lv${level}：刀刃範圍將跟隨玩家 ${Math.floor(duration/1000)} 秒。`);updatePlayerUI();requestRuntimeCombatSave();return true;
}

function castGroundDamageSkill(skill, requestedLevel = null) {
  const check=canCastSkill(skill,requestedLevel,["ground_damage"]);if(!check.ok)return reportPendingRuntime(skill,check.reason);if(!currentMonster||!window.GroundEffectManager||!window.GroundPlacementResolver)return false;
  const {level,profile}=check;
  const skillRange=typeof getSkillRangePx==="function"?getSkillRangePx(skill,level):null;
  if(profile.skipPrimaryRangeCheck!==true&&typeof canAttackMonsterByRange==="function"&&!canAttackMonsterByRange(currentMonster,skillRange)){
    if(typeof movePlayerTowardMonster==="function")movePlayerTowardMonster(currentMonster,skillRange);
    addBattleLog(`${skill.name} 距離不足，正在靠近目標。`);return false;
  }
  const groundSpec=getRuntimeGroundAttackSpec(skill,profile,level);
  let duration=Math.max(100,Number(getLevelValue(profile.duration??profile.groundDuration??groundSpec.durationMs,level,groundSpec.durationMs))||groundSpec.durationMs);
  if(profile.windhawkTrapDurationUsesPassive){const passive=typeof getPassiveSkillBonusTotals==="function"?getPassiveSkillBonusTotals():{};duration+=Math.max(0,Number(passive.windhawkTrapDurationMs||0));}
  const tick=Math.max(16,Number(getLevelValue(profile.tickIntervalMs??groundSpec.tickIntervalMs,level,groundSpec.tickIntervalMs))||groundSpec.tickIntervalMs),initialDelay=Math.max(0,Number(getLevelValue(profile.initialDelayMs??groundSpec.initialDelayMs,level,groundSpec.initialDelayMs))||0);
  const maxTicks=Math.max(1,Number(getLevelValue(profile.maxTicks??groundSpec.maxTicks,level,Math.ceil(duration/tick)))||Math.ceil(duration/tick)),maxTargets=Math.max(1,Number(getLevelValue(profile.maxTargets??profile.targeting?.maxTargets??groundSpec.maxTargets,level,groundSpec.maxTargets))||groundSpec.maxTargets);
  const originMode=String(profile.targeting?.origin||"target").toLowerCase();
  const originEntity=originMode==="self"?player:currentMonster;
  const placement=window.GroundPlacementResolver.resolve(originEntity,{snapToCell:true,strictBounds:true,kind:"ground",skillId:Number(skill?.officialId??skill?.id),source:player,target:currentMonster});
  if(!placement?.ok){addBattleLog(`${skill.name}：${getRuntimeGroundBlockText(placement?.reason)}。`);return false;}
  const radius=Math.max(0,Number(getLevelValue(profile.targeting?.radius??groundSpec.radiusCells,level,groundSpec.radiusCells))||0);
  const unitFlags=skill?.unit?.Flag||{};
  const noOverlap=profile.noOverlap===true||groundSpec.noOverlap===true||unitFlags.NoOverlap===true;
  const stackKey=noOverlap?`ground_skill_${Number(skill?.officialId??skill?.id)}`:null;
  const effectId=window.GroundEffectManager.create({
    id:`ground_damage_${skill.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    x:placement.x,y:placement.y,shape:profile.targeting?.shape||"circle",rangeCells:radius,tickMs:tick,durationMs:duration,initialDelayMs:initialDelay,
    followTarget:profile.followTarget?currentMonster:null,maxTicks,isGroundMagic:true,sourceSkillId:Number(skill?.officialId??skill?.id),ownerKey:"player",
    activeInstanceLimit:Math.max(0,Number(getLevelValue(profile.activeInstanceLimit??groundSpec.activeInstanceLimit??skill?.activeInstance,level,0))),stackKey,noOverlapKey:noOverlap?stackKey:null,
    overlapPolicy:String(profile.overlapPolicy||groundSpec.overlapPolicy||(noOverlap?"reject":"stack")),ignoreLandProtector:profile.ignoreLandProtector===true,
    metadata:{skillId:Number(skill?.officialId??skill?.id),skillName:skill.name,level,maxTargets,totalDamage:0,totalHits:0},
    onTick(targets,effect,context){
      const selectedTargets=(targets||[]).slice(0,maxTargets);
      withRuntimeCombatEvaluationContext(() => {
      for(const target of selectedTargets){
        if(!target||Number(target.currentHp||0)<=0)continue;
        const damage=profile.dotFlatDamage!==undefined?Math.max(1,Number(getLevelValue(profile.dotFlatDamage,level,1))):calculateSkillAttackDamage(skill,level,target,{skipHitCheck:true,phase:"tick",tickNumber:Number(context?.tickNumber||1),targetCount:selectedTargets.length});
        if(damage===null)continue;
        const calculatedDamage=Math.max(1,Number(damage||1));
        const appliedDamage=applyRuntimeCalculatedDamage(target,calculatedDamage,{skillId:Number(skill?.officialId??skill?.id),showNumber:false,playHit:false});
        const dealt=appliedDamage.dealt;
        effect.metadata.totalDamage=Number(effect.metadata.totalDamage||0)+calculatedDamage;effect.metadata.totalHits=Number(effect.metadata.totalHits||0)+1;
        applyAttackRuntimeStatus(profile,level,target);
        if(profile.dotStatus&&window.StatusManager)window.StatusManager.apply(target,profile.dotStatus,{chancePercent:Number(getLevelValue(profile.dotStatusChancePercent,level,100)),durationMs:Number(getLevelValue(profile.dotStatusDuration,level,0)),level,effects:collectRuntimeEffects({effects:profile.dotStatusEffects||profile.statusEffects||{}},level)});
        const knockbackCells=Math.max(0,Math.max(0,Number(getLevelValue(profile.knockbackCells,level,0))+getCardSkillKnockbackBonus(skill)));if(knockbackCells>0)window.MovementEffectResolver?.knockback(target,player,knockbackCells);
        if(typeof showDamageNumber==="function")showDamageNumber(calculatedDamage,{target});if(typeof playMonsterHitAnimation==="function")playMonsterHitAnimation(target);
      }
      }, {candidates:selectedTargets});
      if(currentMonster&&Number(currentMonster.currentHp||0)<=0&&typeof defeatMonster==="function")defeatMonster();else if(typeof updateMonsterUI==="function")updateMonsterUI();
    }
  });
  if(!effectId){addBattleLog(`${skill.name}：${getRuntimeGroundBlockText(window.GroundEffectManager.lastBlockReason)}。`);return false;}
  const resource=applyRuntimeResourceCost(profile,level,skill);if(!resource.ok){window.GroundEffectManager.remove(effectId);addBattleLog(`${skill.name} 所需戰鬥資源不足。`);return false;}
  paySkillCost(skill,level);
  if(profile.initialBurst){
    const initialProfile=profile.initialTargeting?{...profile,targeting:profile.initialTargeting}:profile;
    const initialTargets=resolveRuntimeSkillTargets(initialProfile,currentMonster,level);
    withRuntimeCombatEvaluationContext(() => {
    for(const target of initialTargets||[]){
      if(!target||Number(target.currentHp||0)<=0)continue;
      const damage=calculateSkillAttackDamage(skill,level,target,{skipHitCheck:true,phase:"initial"});if(damage===null)continue;
      const calculatedDamage=Math.max(1,Number(damage||1));const appliedDamage=applyRuntimeCalculatedDamage(target,calculatedDamage,{skillId:Number(skill?.officialId??skill?.id),showNumber:false,playHit:false});const dealt=appliedDamage.dealt;
      if(profile.initialStatus&&window.StatusManager)window.StatusManager.apply(target,profile.initialStatus,{chancePercent:Number(getLevelValue(profile.initialStatusChancePercent,level,100)),durationMs:Number(getLevelValue(profile.initialStatusDuration,level,0)),level,effects:collectRuntimeEffects({effects:profile.initialStatusEffects||profile.statusEffects||{}},level)});
      if(typeof showDamageNumber==="function")showDamageNumber(calculatedDamage,{target});if(typeof playMonsterHitAnimation==="function")playMonsterHitAnimation(target);
    }
    }, {candidates:initialTargets||[]});
  }
  if(profile.trapMaterialPolicy==="ignored")addBattleLog(`施放 ${skill.name} Lv${level}：陷阱已設置在目前目標位置（不消耗陷阱道具）。`);
  else if(profile.logMode==="delayed_explosion")addBattleLog(`施放 ${skill.name} Lv${level}：${Math.floor(initialDelay/1000)} 秒後在目標位置爆炸。`);
  else addBattleLog(`施放 ${skill.name} Lv${level}：${radius*2+1}×${radius*2+1} 攻擊區域持續 ${(duration/1000).toFixed(duration%1000?1:0)} 秒。`);
  updatePlayerUI();requestRuntimeCombatSave();return true;
}

function getSkillTypeText(skill) {
  const map = { passive:"被動", attack:"攻擊", buff:"Buff", heal:"治癒", support:"支援", pending:"未完成" };
  return map[getRuntimeSkillUiType(skill)] || "技能";
}

Object.assign(window,{previewRuntimeResourceCost,isCopiedSkillResourceWaived,getRuntimeResourceDisplayName,applyCardSkillDamageRate});
