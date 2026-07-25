//=======================================
// RO_WEB 進化人工生命體技能 AI Runtime 0.9.82DD
// - 8001~8016：依 RA 公式與 RO_WEB 輕量生命體規則分類
// - 生命體沒有 HP/SP/死亡/位置，因此相關技能保留資料但不進 AI 池
// - 治療、玩家 Buff、內部 Buff、被動與攻擊技能由 AI 每次行動擇一施放
//=======================================
(function initHomunculusSkillRuntime(global) {
  "use strict";

  const EVOLVED_SKILL_IDS = new Set(Array.from({ length: 16 }, (_, index) => 8001 + index));
  const EXCLUDED_SKILL_IDS = new Set([8005, 8007, 8011, 8016]);
  const PASSIVE_SKILL_IDS = new Set([8003, 8015]);
  const PLAYER_BUFF_SKILL_IDS = new Set([8002, 8006]);
  const INTERNAL_BUFF_SKILL_IDS = new Set([8004, 8008, 8010]);
  const HEAL_SKILL_IDS = new Set([8001, 8014]);
  const ATTACK_SKILL_IDS = new Set([8009, 8012, 8013]);

  const PLAYER_BUFF_PREFIX = "homunculus_skill_";
  const INSTRUCT_INT = [1, 2, 2, 4, 5];
  const INSTRUCT_STR = [1, 1, 3, 4, 4];
  const MOONLIGHT_RATIO = [220, 330, 440, 550, 660];
  const MOONLIGHT_HITS = [1, 2, 2, 2, 3];
  const SBR44_RATIO = [100, 200, 300];

  function levelValue(value, level, fallback = 0) {
    const lv = Math.max(1, Math.floor(Number(level || 1)));
    if (Array.isArray(value)) return value[Math.min(value.length - 1, lv - 1)] ?? fallback;
    return value === undefined || value === null ? fallback : value;
  }

  function skillMeta(skillId) {
    return global.homunculusSkillData?.skills?.[String(skillId)] || null;
  }

  function skillDisplayName(skillId) {
    const meta = skillMeta(skillId);
    return String(meta?.displayName || meta?.name || meta?.code || `技能 ${skillId}`);
  }

  function ensureRuntimeState(state) {
    if (!state || typeof state !== "object") return null;
    state.skillCooldowns = state.skillCooldowns && typeof state.skillCooldowns === "object" && !Array.isArray(state.skillCooldowns)
      ? state.skillCooldowns : {};
    state.internalBuffs = state.internalBuffs && typeof state.internalBuffs === "object" && !Array.isArray(state.internalBuffs)
      ? state.internalBuffs : {};
    state.lastAttackSkillId = Math.max(0, Number(state.lastAttackSkillId || 0));
    state.lastSkillId = Math.max(0, Number(state.lastSkillId || 0));
    return state;
  }

  function removeExpiredInternalBuffs(state, now = Date.now()) {
    ensureRuntimeState(state);
    let changed = false;
    for (const [key, buff] of Object.entries(state?.internalBuffs || {})) {
      if (Number(buff?.expiresAt || 0) > now) continue;
      delete state.internalBuffs[key];
      changed = true;
    }
    return changed;
  }

  function removeHomunculusPlayerBuffs(options = {}) {
    if (!global.player?.activeBuffs) return 0;
    let removed = 0;
    for (const key of Object.keys(global.player.activeBuffs)) {
      const buff = global.player.activeBuffs[key];
      if (!String(key).startsWith(PLAYER_BUFF_PREFIX) && buff?.sourceType !== "homunculus") continue;
      delete global.player.activeBuffs[key];
      removed += 1;
    }
    if (removed && options.recalculate !== false) {
      if (typeof global.recalculatePlayerStats === "function") global.recalculatePlayerStats();
      if (typeof global.updatePlayerUI === "function") global.updatePlayerUI();
    }
    return removed;
  }

  function removeExpiredHomunculusPlayerBuffs(now = Date.now()) {
    if (!global.player?.activeBuffs) return false;
    let changed = false;
    for (const key of Object.keys(global.player.activeBuffs)) {
      const buff = global.player.activeBuffs[key];
      if (!String(key).startsWith(PLAYER_BUFF_PREFIX) && buff?.sourceType !== "homunculus") continue;
      if (Number(buff?.expiresAt || 0) > now) continue;
      delete global.player.activeBuffs[key];
      changed = true;
    }
    if (changed) {
      if (typeof global.recalculatePlayerStats === "function") global.recalculatePlayerStats();
      if (typeof global.updatePlayerUI === "function") global.updatePlayerUI();
    }
    return changed;
  }

  function getSkillLevel(active, skillId) {
    const row = (active?.skills || []).find(entry => Number(entry.skillId) === Number(skillId));
    return Math.max(0, Number(row?.maxLevel || skillMeta(skillId)?.maxLevel || 0));
  }

  function isSkillAvailable(active, skillId) {
    return EVOLVED_SKILL_IDS.has(Number(skillId))
      && !EXCLUDED_SKILL_IDS.has(Number(skillId))
      && getSkillLevel(active, skillId) > 0;
  }

  function isCooldownReady(state, skillId, now = Date.now()) {
    ensureRuntimeState(state);
    return Number(state?.skillCooldowns?.[String(skillId)] || 0) <= now;
  }

  function startCooldown(state, skillId, level, now = Date.now()) {
    ensureRuntimeState(state);
    const cooldown = Math.max(0, Number(levelValue(skillMeta(skillId)?.cooldown, level, 0)));
    state.skillCooldowns[String(skillId)] = now + cooldown;
    state.lastSkillId = Number(skillId);
    return cooldown;
  }

  function isInternalBuffActive(state, skillId, now = Date.now()) {
    ensureRuntimeState(state);
    return Number(state?.internalBuffs?.[String(skillId)]?.expiresAt || 0) > now;
  }

  function isPlayerBuffActive(skillId, now = Date.now()) {
    const buff = global.player?.activeBuffs?.[`${PLAYER_BUFF_PREFIX}${skillId}`];
    return Number(buff?.expiresAt || 0) > now;
  }

  function applyInternalBuff(active, skillId, level, effects, now = Date.now()) {
    const duration = Math.max(1000, Number(levelValue(skillMeta(skillId)?.duration1, level, 1000)));
    ensureRuntimeState(active.state);
    active.state.internalBuffs[String(skillId)] = {
      skillId,
      name: skillDisplayName(skillId),
      level,
      effects: { ...(effects || {}) },
      startedAt: now,
      expiresAt: now + duration
    };
    startCooldown(active.state, skillId, level, now);
    return duration;
  }

  function applyPlayerBuff(active, skillId, level, effects, now = Date.now()) {
    if (!global.player) return 0;
    const duration = Math.max(1000, Number(levelValue(skillMeta(skillId)?.duration1, level, 1000)));
    global.player.activeBuffs = global.player.activeBuffs || {};
    global.player.activeBuffs[`${PLAYER_BUFF_PREFIX}${skillId}`] = {
      id: skillId,
      name: `${active.definition.name}・${skillDisplayName(skillId)}`,
      level,
      sourceType: "homunculus",
      sourceHomunculusId: active.id,
      effects: { ...(effects || {}) },
      startedAt: now,
      activatedAt: now,
      expiresAt: now + duration
    };
    startCooldown(active.state, skillId, level, now);
    if (typeof global.recalculatePlayerStats === "function") global.recalculatePlayerStats();
    if (typeof global.updatePlayerUI === "function") global.updatePlayerUI();
    return duration;
  }

  function getInternalBonusTotals(active, now = Date.now()) {
    removeExpiredInternalBuffs(active?.state, now);
    const totals = {};
    for (const buff of Object.values(active?.state?.internalBuffs || {})) {
      for (const [key, value] of Object.entries(buff?.effects || {})) {
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        totals[key] = Number(totals[key] || 0) + value;
      }
    }
    return totals;
  }

  function calculateRuntimeCombatStats(active, now = Date.now()) {
    if (!active?.stats) return null;
    const base = { ...active.stats };
    const passive = {};

    // HLIF_BRAIN: HP/SP portions are unused; retain RA Heal Power +2% per level.
    const brainLv = getSkillLevel(active, 8003);
    if (brainLv > 0) passive.healPowerRate = brainLv * 2;

    // HVAN_INSTRUCT: RA permanent STR/INT bonuses.
    const instructLv = getSkillLevel(active, 8015);
    if (instructLv > 0) {
      passive.strFlat = INSTRUCT_STR[Math.min(INSTRUCT_STR.length - 1, instructLv - 1)] || 0;
      passive.intFlat = INSTRUCT_INT[Math.min(INSTRUCT_INT.length - 1, instructLv - 1)] || 0;
    }

    const internal = getInternalBonusTotals(active, now);
    const str = Math.max(0, Number(base.str || 0) + Number(passive.strFlat || 0) + Number(internal.strFlat || 0));
    const agi = Math.max(0, Number(base.agi || 0) + Number(internal.agiFlat || 0));
    const vit = Math.max(0, Number(base.vit || 0) + Number(internal.vitFlat || 0));
    const intStat = Math.max(0, Number(base.int || 0) + Number(passive.intFlat || 0) + Number(internal.intFlat || 0));
    const dex = Math.max(0, Number(base.dex || 0) + Number(internal.dexFlat || 0));
    const luk = Math.max(0, Number(base.luk || 0) + Number(internal.lukFlat || 0));
    const level = Math.max(1, Number(base.level || active.level || 1));
    const batk = Math.max(1, 2 * level + str);
    const attackMin = Math.max(1, Math.floor((str + dex) / 5));
    const attackMax = Math.max(attackMin, Math.floor((luk + str + dex) / 3));
    const matkMin = Math.max(1, Math.floor(intStat + level + (intStat + dex) / 5));
    const matkMax = Math.max(matkMin, Math.floor(intStat + level + (luk + intStat + dex) / 3));
    return {
      ...base,
      str, agi, vit, int: intStat, dex, luk, level,
      batk, attackMin, attackMax, matkMin, matkMax,
      attackRate: Number(internal.attackRate || 0),
      magicRate: Number(internal.magicRate || 0),
      healPowerRate: Number(passive.healPowerRate || 0) + Number(internal.healPowerRate || 0)
    };
  }

  function rollBetween(minimum, maximum) {
    const min = Math.max(0, Math.floor(Number(minimum || 0)));
    const max = Math.max(min, Math.floor(Number(maximum || min)));
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function finalizeDamage(raw, target, options = {}) {
    if (!target || !global.RARenewalDamagePipeline?.finalModifiers) return 0;
    const damage = global.RARenewalDamagePipeline.finalModifiers(Math.max(1, Math.floor(raw)), target, {
      damageType: options.damageType || "physical",
      element: options.element || "Neutral",
      attackRangeType: options.attackRangeType || "short",
      applyWeaponSize: false,
      applyDefense: options.ignoreDefense !== true,
      ignoreDefense: options.ignoreDefense === true,
      ignoreMagicDefense: options.ignoreMagicDefense === true
    });
    return typeof global.applySummonDamageMastery === "function"
      ? global.applySummonDamageMastery(damage)
      : Math.max(0, Math.floor(Number(damage || 0)));
  }

  function applyDamageToTarget(active, target, damage, skillId, hitCount = 1, options = {}) {
    const dealt = Math.max(0, Math.floor(Number(damage || 0)));
    target.currentHp = Math.max(0, Number(target.currentHp || 0) - dealt);
    if (typeof global.playMonsterHitAnimation === "function") global.playMonsterHitAnimation(target);
    if (typeof global.showDamageNumber === "function") global.showDamageNumber(dealt, { source: "summon", hitCount });
    if (typeof global.addBattleLog === "function") {
      const hits = hitCount > 1 ? `（${hitCount} 段）` : "";
      const element = options.elementLabel ? `・${options.elementLabel}` : "";
      global.addBattleLog(`${active.definition.name}：使用「${skillDisplayName(skillId)}」${element}${hits}，對 ${String(target.name || "目標")}造成 ${dealt} 點傷害。`, "summon-damage");
    }
    if (typeof global.updateMonsterUI === "function") global.updateMonsterUI();
    return { attacked: true, defeated: Number(target.currentHp || 0) <= 0, totalDamage: dealt, skillId, hitCount };
  }

  function castPhysicalAttack(active, target, skillId, level, ratio, hitCount = 1, options = {}) {
    const stats = calculateRuntimeCombatStats(active);
    if (!stats || !target) return null;
    let rolledAtk = stats.batk + rollBetween(stats.attackMin, stats.attackMax);
    rolledAtk = Math.max(1, Math.floor(rolledAtk * (100 + Number(stats.attackRate || 0)) / 100));
    const raw = Math.max(1, Math.floor(rolledAtk * Math.max(1, Number(ratio || 100)) / 100));
    const element = options.element || active.definition.element || "Neutral";
    const damage = finalizeDamage(raw, target, {
      damageType: "physical",
      element,
      attackRangeType: options.attackRangeType || "long",
      ignoreDefense: options.ignoreDefense === true
    });
    startCooldown(active.state, skillId, level);
    active.state.lastAttackSkillId = skillId;
    return applyDamageToTarget(active, target, damage, skillId, hitCount, options);
  }

  function castMagicAttack(active, target, skillId, level, ratio, element, options = {}) {
    const stats = calculateRuntimeCombatStats(active);
    if (!stats || !target) return null;
    let rolledMatk = rollBetween(stats.matkMin, stats.matkMax);
    rolledMatk = Math.max(1, Math.floor(rolledMatk * (100 + Number(stats.magicRate || 0)) / 100));
    const raw = Math.max(1, Math.floor(rolledMatk * Math.max(1, Number(ratio || 100)) / 100));
    const damage = finalizeDamage(raw, target, {
      damageType: "magic",
      element,
      attackRangeType: options.attackRangeType || "long",
      ignoreMagicDefense: options.ignoreMagicDefense === true
    });
    startCooldown(active.state, skillId, level);
    active.state.lastAttackSkillId = skillId;
    return applyDamageToTarget(active, target, damage, skillId, options.hitCount || 1, {
      ...options,
      elementLabel: options.elementLabel || element
    });
  }

  function calculateHealing(active, skillLevel, options = {}) {
    const stats = calculateRuntimeCombatStats(active);
    if (!stats) return 0;
    // RA Renewal Heal: ((Lv + INT) / 5 * 30) * SkillLv/10 + MATK, then Heal Power modifiers.
    const base = Math.floor(((stats.level + stats.int) / 5) * 30 * Math.max(1, skillLevel) / 10);
    const matk = rollBetween(stats.matkMin, stats.matkMax);
    const randomRate = Number(options.randomRate || 100);
    const raw = Math.max(1, Math.floor((base + matk) * randomRate / 100));
    return Math.max(1, Math.floor(raw * (100 + Number(stats.healPowerRate || 0)) / 100));
  }

  function healPlayer(active, skillId, level, options = {}) {
    if (!global.player) return null;
    const maxHp = Math.max(1, Number(global.player.maxHp || 1));
    const before = Math.max(0, Number(global.player.hp || 0));
    const heal = Math.min(maxHp - before, calculateHealing(active, level, options));
    if (heal <= 0) return null;
    global.player.hp = Math.min(maxHp, before + heal);
    startCooldown(active.state, skillId, level);
    if (typeof global.updatePlayerUI === "function") global.updatePlayerUI();
    if (typeof global.addBattleLog === "function") {
      global.addBattleLog(`${active.definition.name}：使用「${skillDisplayName(skillId)}」，恢復玩家 HP ${heal}。`, "summon-heal");
    }
    return { attacked: true, supported: true, healed: heal, defeated: false, skillId };
  }

  function castSkill(active, target, skillId, now = Date.now()) {
    const level = getSkillLevel(active, skillId);
    if (level <= 0 || !isCooldownReady(active.state, skillId, now)) return null;
    switch (skillId) {
      case 8001:
        return healPlayer(active, skillId, level);
      case 8002: {
        const duration = applyPlayerBuff(active, skillId, level, { walkSpeedRate: -10 * level }, now);
        if (typeof global.addBattleLog === "function") global.addBattleLog(`${active.definition.name}：施放「${skillDisplayName(skillId)}」，玩家移動速度提高 ${10 * level}%，持續 ${Math.ceil(duration / 1000)} 秒。`, "summon-buff");
        return { attacked: true, supported: true, skillId };
      }
      case 8004: {
        const duration = applyInternalBuff(active, skillId, level, { vitFlat: 30 * level, intFlat: 20 * level }, now);
        if (typeof global.addBattleLog === "function") global.addBattleLog(`${active.definition.name}：施放「${skillDisplayName(skillId)}」，VIT +${30 * level}、INT +${20 * level}，持續 ${Math.ceil(duration / 1000)} 秒。`, "summon-buff");
        return { attacked: true, supported: true, skillId };
      }
      case 8006: {
        const vit = 5 + 5 * level;
        const duration = applyPlayerBuff(active, skillId, level, { vitFlat: vit }, now);
        if (typeof global.addBattleLog === "function") global.addBattleLog(`${active.definition.name}：施放「${skillDisplayName(skillId)}」，玩家 VIT +${vit}，持續 ${Math.ceil(duration / 1000)} 秒。`, "summon-buff");
        return { attacked: true, supported: true, skillId };
      }
      case 8008: {
        const attackRate = 20 + 10 * level;
        const duration = applyInternalBuff(active, skillId, level, { attackRate }, now);
        if (typeof global.addBattleLog === "function") global.addBattleLog(`${active.definition.name}：施放「${skillDisplayName(skillId)}」，生命體物理傷害 +${attackRate}%，持續 ${Math.ceil(duration / 1000)} 秒。`, "summon-buff");
        return { attacked: true, supported: true, skillId };
      }
      case 8009:
        return castPhysicalAttack(active, target, skillId, level, MOONLIGHT_RATIO[Math.min(4, level - 1)], MOONLIGHT_HITS[Math.min(4, level - 1)], { attackRangeType: "long" });
      case 8010: {
        const attackRate = 5 + 5 * level;
        const duration = applyInternalBuff(active, skillId, level, { attackRate }, now);
        if (typeof global.addBattleLog === "function") global.addBattleLog(`${active.definition.name}：施放「${skillDisplayName(skillId)}」，生命體物理傷害 +${attackRate}%，持續 ${Math.ceil(duration / 1000)} 秒。`, "summon-buff");
        return { attacked: true, supported: true, skillId };
      }
      case 8012:
        return castPhysicalAttack(active, target, skillId, level, SBR44_RATIO[Math.min(2, level - 1)], 1, { attackRangeType: "long" });
      case 8013: {
        // RA randomly chooses Cold/Fire/Lightning Bolt or Earth Spike. RO_WEB chooses the best current element.
        const candidates = [
          ["Water", "水"], ["Fire", "火"], ["Wind", "風"], ["Earth", "地"]
        ];
        let best = null;
        const stats = calculateRuntimeCombatStats(active);
        let rolledMatk = rollBetween(stats.matkMin, stats.matkMax);
        rolledMatk = Math.max(1, Math.floor(rolledMatk * (100 + Number(stats.magicRate || 0)) / 100));
        const raw = Math.max(1, rolledMatk * level); // Bolt/Earth Spike: 100% MATK per hit, SkillLv hits.
        for (const [element, label] of candidates) {
          const damage = finalizeDamage(raw, target, { damageType: "magic", element, attackRangeType: "long" });
          if (!best || damage > best.damage) best = { damage, element, label };
        }
        startCooldown(active.state, skillId, level, now);
        active.state.lastAttackSkillId = skillId;
        return applyDamageToTarget(active, target, best?.damage || 0, skillId, level, { elementLabel: best?.label || "無" });
      }
      case 8014: {
        // RA may heal the Homunculus, master, or an enemy. With no Homunculus HP, keep the useful master-heal branch.
        const effectiveLevel = 1 + Math.floor(Math.random() * level);
        return healPlayer(active, skillId, effectiveLevel, { randomRate: 100 });
      }
      default:
        return null;
    }
  }

  function chooseMissingBuffSkill(active, now) {
    const orderByType = {
      lif_evolved: [8002, 8004],
      amistr_evolved: [8006, 8008],
      filir_evolved: [8010],
      vanilmirth_evolved: []
    };
    for (const skillId of orderByType[active.id] || []) {
      if (!isSkillAvailable(active, skillId) || !isCooldownReady(active.state, skillId, now)) continue;
      if (PLAYER_BUFF_SKILL_IDS.has(skillId) && isPlayerBuffActive(skillId, now)) continue;
      if (INTERNAL_BUFF_SKILL_IDS.has(skillId) && isInternalBuffActive(active.state, skillId, now)) continue;
      return skillId;
    }
    return 0;
  }

  function chooseAttackSkill(active, now) {
    const attacksByType = {
      lif_evolved: [],
      amistr_evolved: [],
      filir_evolved: [8009, 8012],
      vanilmirth_evolved: [8013]
    };
    const available = (attacksByType[active.id] || []).filter(skillId => isSkillAvailable(active, skillId) && isCooldownReady(active.state, skillId, now));
    if (!available.length) return 0;
    if (available.length === 1) return available[0];
    const previous = Number(active.state.lastAttackSkillId || 0);
    const previousIndex = available.indexOf(previous);
    return available[(previousIndex + 1) % available.length];
  }

  function takeAction(active, target, options = {}) {
    if (!active || active.definition.category !== "evolved") return null;
    ensureRuntimeState(active.state);
    const now = Date.now();
    removeExpiredInternalBuffs(active.state, now);
    removeExpiredHomunculusPlayerBuffs(now);

    const hpRate = global.player ? (Number(global.player.hp || 0) / Math.max(1, Number(global.player.maxHp || 1))) : 1;
    const healCandidates = active.id === "lif_evolved" ? [8001]
      : active.id === "vanilmirth_evolved" ? [8014] : [];
    if (hpRate < 0.70) {
      for (const skillId of healCandidates) {
        if (isSkillAvailable(active, skillId) && isCooldownReady(active.state, skillId, now)) {
          const result = castSkill(active, target, skillId, now);
          if (result) return result;
        }
      }
    }

    const buffSkillId = chooseMissingBuffSkill(active, now);
    if (buffSkillId) {
      const result = castSkill(active, target, buffSkillId, now);
      if (result) return result;
    }

    if (target && Number(target.currentHp || 0) > 0) {
      const attackSkillId = chooseAttackSkill(active, now);
      if (attackSkillId) {
        const result = castSkill(active, target, attackSkillId, now);
        if (result) return result;
      }
    }

    return null;
  }

  function resetState(state) {
    if (!state || typeof state !== "object") return;
    state.skillCooldowns = {};
    state.internalBuffs = {};
    state.lastAttackSkillId = 0;
    state.lastSkillId = 0;
  }

  global.HomunculusSkillRuntime = {
    version: "0.9.82DD",
    evolvedSkillIds: Array.from(EVOLVED_SKILL_IDS),
    excludedSkillIds: Array.from(EXCLUDED_SKILL_IDS),
    implementedSkillIds: Array.from(EVOLVED_SKILL_IDS).filter(id => !EXCLUDED_SKILL_IDS.has(id)),
    passiveSkillIds: Array.from(PASSIVE_SKILL_IDS),
    takeAction,
    castSkill,
    calculateRuntimeCombatStats,
    getInternalBonusTotals,
    removeHomunculusPlayerBuffs,
    resetState,
    skillDisplayName,
    isSkillAvailable
  };
})(window);
