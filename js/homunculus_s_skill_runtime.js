//=======================================
// RO_WEB 人工生命體 S 技能 AI Runtime 0.9.82DD
// - 8018~8059（官方未使用 8017）依 rAthena Renewal 公式接入
// - 生命體沒有 HP/SP/死亡/座標：只排除 8022 再生之光，其餘依現行架構保留、簡化或自動化
// - 攻擊、地面傷害、異常狀態、玩家 Buff、生命體內部 Buff、被動與連續技由 AI 自動使用
//=======================================
(function initHomunculusSSkillRuntime(global) {
  "use strict";

  const baseRuntime = global.HomunculusSkillRuntime;
  if (!baseRuntime) {
    console.warn("Homunculus S runtime requires homunculus_skill_runtime.js first.");
    return;
  }

  const S_SKILL_IDS = new Set(Array.from({ length: 42 }, (_, index) => 8018 + index));
  const EXCLUDED_S_SKILL_IDS = new Set([8022]);
  const PASSIVE_S_SKILL_IDS = new Set([8046, 8049, 8052, 8055, 8059]);
  const STATE_S_SKILL_IDS = new Set([8027]);
  const PLAYER_BUFF_S_SKILL_IDS = new Set([8021, 8023, 8033, 8040, 8042, 8045, 8058]);
  const INTERNAL_BUFF_S_SKILL_IDS = new Set([8018, 8032, 8035, 8039]);
  const HEAL_S_SKILL_IDS = new Set([8026]);
  const ATTACK_S_SKILL_IDS = new Set([
    8019, 8020, 8024, 8025, 8028, 8029, 8030, 8031, 8034, 8036, 8037, 8038,
    8041, 8043, 8044, 8047, 8048, 8050, 8051, 8053, 8054, 8056, 8057
  ]);

  const PLAYER_BUFF_PREFIX = "homunculus_skill_";

  function levelValue(value, level, fallback = 0) {
    const lv = Math.max(1, Math.floor(Number(level || 1)));
    if (Array.isArray(value)) return value[Math.min(value.length - 1, lv - 1)] ?? fallback;
    return value === undefined || value === null ? fallback : value;
  }

  function skillMeta(skillId) {
    return global.homunculusSkillData?.skills?.[String(skillId)] || null;
  }

  function skillDisplayName(skillId) {
    return baseRuntime.skillDisplayName?.(skillId)
      || String(skillMeta(skillId)?.displayName || skillMeta(skillId)?.name || skillMeta(skillId)?.code || `技能 ${skillId}`);
  }

  function ensureState(state) {
    if (!state || typeof state !== "object") return null;
    state.skillCooldowns = state.skillCooldowns && typeof state.skillCooldowns === "object" && !Array.isArray(state.skillCooldowns) ? state.skillCooldowns : {};
    state.internalBuffs = state.internalBuffs && typeof state.internalBuffs === "object" && !Array.isArray(state.internalBuffs) ? state.internalBuffs : {};
    state.lastAttackSkillId = Math.max(0, Number(state.lastAttackSkillId || 0));
    state.lastSkillId = Math.max(0, Number(state.lastSkillId || 0));
    state.comboSequence = state.comboSequence && typeof state.comboSequence === "object" && !Array.isArray(state.comboSequence)
      ? state.comboSequence : { family: "", step: 0, expiresAt: 0 };
    state.styleMode = String(state.styleMode || "");
    return state;
  }

  function getSkillLevel(active, skillId) {
    const row = (active?.skills || []).find(entry => Number(entry.skillId) === Number(skillId));
    return Math.max(0, Number(row?.maxLevel || skillMeta(skillId)?.maxLevel || 0));
  }

  function isSkillAvailable(active, skillId) {
    return S_SKILL_IDS.has(Number(skillId))
      && !EXCLUDED_S_SKILL_IDS.has(Number(skillId))
      && getSkillLevel(active, skillId) > 0;
  }

  function isCooldownReady(state, skillId, now = Date.now()) {
    ensureState(state);
    return Number(state?.skillCooldowns?.[String(skillId)] || 0) <= now;
  }

  function startCooldown(state, skillId, level, now = Date.now()) {
    ensureState(state);
    const cooldown = Math.max(0, Number(levelValue(skillMeta(skillId)?.cooldown, level, 0)));
    state.skillCooldowns[String(skillId)] = now + cooldown;
    state.lastSkillId = Number(skillId);
    return cooldown;
  }

  function removeExpiredInternalBuffs(state, now = Date.now()) {
    ensureState(state);
    for (const [key, buff] of Object.entries(state?.internalBuffs || {})) {
      if (Number(buff?.expiresAt || 0) <= now) delete state.internalBuffs[key];
    }
    if (Number(state?.comboSequence?.expiresAt || 0) > 0 && Number(state.comboSequence.expiresAt) <= now) {
      state.comboSequence = { family: "", step: 0, expiresAt: 0 };
    }
  }

  function isInternalBuffActive(state, skillId, now = Date.now()) {
    ensureState(state);
    return Number(state?.internalBuffs?.[String(skillId)]?.expiresAt || 0) > now;
  }

  function isPlayerBuffActive(skillId, now = Date.now()) {
    const buff = global.player?.activeBuffs?.[`${PLAYER_BUFF_PREFIX}${skillId}`];
    return Number(buff?.expiresAt || 0) > now;
  }

  function applyInternalBuff(active, skillId, level, effects, now = Date.now()) {
    const duration = Math.max(1000, Number(levelValue(skillMeta(skillId)?.duration1, level, 1000)));
    ensureState(active.state);
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

  function internalTotals(active, now = Date.now()) {
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
    const internal = internalTotals(active, now);
    const passive = { batkFlat: 0, matkFlat: 0 };

    const classyFlutter = getSkillLevel(active, 8046);
    if (classyFlutter) passive.matkFlat += 100 + 60 * classyFlutter;
    const brushupClaw = getSkillLevel(active, 8049);
    if (brushupClaw) passive.batkFlat += 100 + 60 * brushupClaw;
    const polishingNeedle = getSkillLevel(active, 8052);
    if (polishingNeedle) {
      passive.matkFlat += 50 + 20 * polishingNeedle;
      passive.batkFlat += 100 + 40 * polishingNeedle;
    }
    const lichtGehorn = getSkillLevel(active, 8055);
    if (lichtGehorn) {
      passive.matkFlat += 100 + 30 * lichtGehorn;
      passive.batkFlat += 100 + 30 * lichtGehorn;
    }
    const blazingLava = getSkillLevel(active, 8059);
    if (blazingLava) passive.batkFlat += 100 + 60 * blazingLava;

    const str = Math.max(0, Number(base.str || 0) + Number(internal.strFlat || 0));
    const agi = Math.max(0, Number(base.agi || 0) + Number(internal.agiFlat || 0));
    const vit = Math.max(0, Number(base.vit || 0) + Number(internal.vitFlat || 0));
    const intStat = Math.max(0, Number(base.int || 0) + Number(internal.intFlat || 0));
    const dex = Math.max(0, Number(base.dex || 0) + Number(internal.dexFlat || 0));
    const luk = Math.max(0, Number(base.luk || 0) + Number(internal.lukFlat || 0));
    const level = Math.max(1, Number(base.level || active.level || 1));
    const batk = Math.max(1, 2 * level + str + passive.batkFlat + Number(internal.attackFlat || 0));
    const attackMin = Math.max(1, Math.floor((str + dex) / 5));
    const attackMax = Math.max(attackMin, Math.floor((luk + str + dex) / 3));
    const matkMin = Math.max(1, Math.floor(intStat + level + (intStat + dex) / 5 + passive.matkFlat + Number(internal.magicFlat || 0)));
    const matkMax = Math.max(matkMin, Math.floor(intStat + level + (luk + intStat + dex) / 3 + passive.matkFlat + Number(internal.magicFlat || 0)));
    return {
      ...base,
      str, agi, vit, int: intStat, dex, luk, level,
      batk, attackMin, attackMax, matkMin, matkMax,
      attackRate: Number(internal.attackRate || 0),
      magicRate: Number(internal.magicRate || 0)
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
      attackRangeType: options.attackRangeType || "long",
      applyWeaponSize: false,
      applyDefense: options.ignoreDefense !== true,
      ignoreDefense: options.ignoreDefense === true,
      ignoreMagicDefense: options.ignoreMagicDefense === true
    });
    return typeof global.applySummonDamageMastery === "function"
      ? global.applySummonDamageMastery(damage)
      : Math.max(0, Math.floor(Number(damage || 0)));
  }

  function applyStatus(target, name, chance, durationMs, level, effects = {}) {
    if (!target || !global.StatusManager?.apply) return { applied: false };
    return global.StatusManager.apply(target, name, {
      chancePercent: chance,
      minimumChance: 0,
      maximumChance: 100,
      durationMs: Math.max(0, Number(durationMs || 0)),
      level,
      effects,
      allowBoss: false
    });
  }

  function addBattleLog(text, type = "summon-damage") {
    if (typeof global.addBattleLog === "function") global.addBattleLog(text, type);
  }

  function applyDamage(active, target, damage, skillId, hitCount = 1, options = {}) {
    const dealt = Math.max(0, Math.floor(Number(damage || 0)));
    target.currentHp = Math.max(0, Number(target.currentHp || 0) - dealt);
    if (typeof global.playMonsterHitAnimation === "function") global.playMonsterHitAnimation(target);
    if (typeof global.showDamageNumber === "function") global.showDamageNumber(dealt, { source: "summon", hitCount });
    const hits = hitCount > 1 ? `（${hitCount} 段）` : "";
    const element = options.elementLabel ? `・${options.elementLabel}` : "";
    addBattleLog(`${active.definition.name}：使用「${skillDisplayName(skillId)}」${element}${hits}，對 ${String(target.name || "目標")}造成 ${dealt} 點傷害。`);

    // Summon Legion is adapted to an untargetable support swarm: one supplementary combined hit.
    const legion = active.state?.internalBuffs?.["8018"];
    if (!options.noSupplement && legion && Number(legion.expiresAt || 0) > Date.now()) {
      const count = Math.max(1, Number(legion.effects?.legionCount || 1));
      const supplement = Math.min(Number(target.currentHp || 0), Math.max(1, Math.floor(dealt * count * 0.08)));
      target.currentHp = Math.max(0, Number(target.currentHp || 0) - supplement);
      addBattleLog(`${active.definition.name}：召喚軍團追加造成 ${supplement} 點傷害。`);
    }

    // Magma Flow cannot wait for the Homunculus to be attacked, so it becomes an attack-triggered fire proc.
    const magma = active.state?.internalBuffs?.["8039"];
    if (!options.noSupplement && magma && Number(magma.expiresAt || 0) > Date.now()) {
      const lv = Math.max(1, Number(magma.level || 1));
      if (Math.random() * 100 < 3 * lv) {
        const stats = calculateRuntimeCombatStats(active);
        const ratio = ((100 * lv + 3 * stats.level) * stats.level) / 120;
        const raw = Math.max(1, Math.floor((stats.batk + rollBetween(stats.attackMin, stats.attackMax)) * ratio / 100));
        const extra = finalizeDamage(raw, target, { damageType: "physical", element: "Fire", attackRangeType: "long" });
        const applied = Math.min(Number(target.currentHp || 0), extra);
        target.currentHp = Math.max(0, Number(target.currentHp || 0) - applied);
        addBattleLog(`${active.definition.name}：岩漿流動追加造成 ${applied} 點火屬性傷害。`);
      }
    }

    if (typeof global.updateMonsterUI === "function") global.updateMonsterUI();
    return { attacked: true, defeated: Number(target.currentHp || 0) <= 0, totalDamage: dealt, skillId, hitCount };
  }

  function castPhysical(active, target, skillId, level, ratio, hitCount = 1, options = {}) {
    const stats = calculateRuntimeCombatStats(active);
    if (!stats || !target) return null;
    let rolledAtk = stats.batk + rollBetween(stats.attackMin, stats.attackMax);
    rolledAtk = Math.max(1, Math.floor(rolledAtk * (100 + stats.attackRate) / 100));
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
    return applyDamage(active, target, damage, skillId, hitCount, { ...options, elementLabel: options.elementLabel || element });
  }

  function castMagic(active, target, skillId, level, ratio, element, options = {}) {
    const stats = calculateRuntimeCombatStats(active);
    if (!stats || !target) return null;
    let rolledMatk = rollBetween(stats.matkMin, stats.matkMax);
    rolledMatk = Math.max(1, Math.floor(rolledMatk * (100 + stats.magicRate) / 100));
    const raw = Math.max(1, Math.floor(rolledMatk * Math.max(1, Number(ratio || 100)) / 100));
    const damage = finalizeDamage(raw, target, {
      damageType: "magic",
      element,
      attackRangeType: options.attackRangeType || "long",
      ignoreMagicDefense: options.ignoreMagicDefense === true
    });
    startCooldown(active.state, skillId, level);
    active.state.lastAttackSkillId = skillId;
    return applyDamage(active, target, damage, skillId, options.hitCount || 1, { ...options, elementLabel: options.elementLabel || element });
  }

  function healPlayer(active, skillId, level, amount) {
    if (!global.player) return null;
    const maxHp = Math.max(1, Number(global.player.maxHp || 1));
    const before = Math.max(0, Number(global.player.hp || 0));
    const heal = Math.min(maxHp - before, Math.max(1, Math.floor(Number(amount || 1))));
    if (heal <= 0) return null;
    global.player.hp = Math.min(maxHp, before + heal);
    startCooldown(active.state, skillId, level);
    if (typeof global.updatePlayerUI === "function") global.updatePlayerUI();
    addBattleLog(`${active.definition.name}：使用「${skillDisplayName(skillId)}」，恢復玩家 HP ${heal}。`, "summon-heal");
    return { attacked: true, supported: true, healed: heal, defeated: false, skillId };
  }

  function cleansePlayer() {
    const statuses = global.player?.runtimeState?.statuses;
    if (!statuses || typeof statuses !== "object") return 0;
    const negative = new Set(["stun", "poison", "bleeding", "silence", "blind", "sleep", "freeze", "stone", "curse", "confusion", "fear", "burning", "paralysis", "ash"]);
    let removed = 0;
    for (const key of Object.keys(statuses)) {
      const normalized = String(key).toLowerCase().replace(/[ _-]/g, "");
      if (!negative.has(normalized)) continue;
      delete statuses[key];
      removed += 1;
    }
    return removed;
  }

  function applyPeriodicDamage(target, statusName, damage, durationMs, intervalMs, level, effects = {}) {
    return applyStatus(target, statusName, 100, durationMs, level, {
      periodicIntervalMs: intervalMs,
      periodicDamageMin: Math.max(1, Math.floor(damage)),
      periodicDamageMax: Math.max(1, Math.floor(damage)),
      ...effects
    });
  }

  function skillRatio(skillId, level, stats) {
    const homLv = Math.max(1, stats.level);
    switch (skillId) {
      case 8019: return 450 * level * homLv / 100 + stats.dex;
      case 8020: return 200 * level * homLv / 100 + stats.dex;
      case 8024:
      case 8025: return 450 * level * homLv / 100 + stats.int;
      case 8028: return 60 * level * homLv / 150;
      case 8029: return 250 * level * homLv / 100 + stats.str;
      case 8030: return 450 * level * homLv / 150 + stats.str;
      case 8031: return 1000 + 300 * level * homLv / 150 + stats.vit;
      case 8034: return 1500 + 250 * level * homLv / 150 + stats.vit;
      case 8036:
      case 8037:
      case 8038: return 100;
      case 8041: return 50 * level;
      case 8044: return 70 * level * homLv / 100 + stats.str;
      case 8047: return 480 * level * homLv / 100 + stats.int;
      case 8048: return 1000 + 450 * level * homLv / 100 + stats.int;
      case 8050: return 80 * level * homLv / 100 + stats.str;
      case 8051: return 580 * level * homLv / 100 + stats.str;
      case 8053: return 400 + 450 * level * homLv / 100 + stats.dex;
      case 8054: return 200 + 500 * level * homLv / 100 + stats.dex;
      case 8056: return 300 + 450 * level * homLv / 100 + stats.vit;
      case 8057: return 1200 + 350 * level * homLv / 100 + stats.vit;
      default: return 100;
    }
  }

  function castGroundPeriodic(active, target, skillId, level, options = {}) {
    const stats = calculateRuntimeCombatStats(active);
    if (!stats || !target) return null;
    const ratio = skillRatio(skillId, level, stats);
    const isMagic = options.damageType === "magic";
    const base = isMagic ? rollBetween(stats.matkMin, stats.matkMax) : stats.batk + rollBetween(stats.attackMin, stats.attackMax);
    const raw = Math.max(1, Math.floor(base * ratio / 100));
    const perTick = finalizeDamage(raw, target, {
      damageType: options.damageType || "physical",
      element: options.element || "Neutral",
      attackRangeType: "long",
      ignoreDefense: options.ignoreDefense === true,
      ignoreMagicDefense: options.ignoreMagicDefense === true
    });
    const duration = Math.max(1000, Number(levelValue(skillMeta(skillId)?.duration1, level, 1000)));
    applyPeriodicDamage(target, options.statusName || `homunculus_ground_${skillId}`, perTick, duration, options.intervalMs || 1000, level, options.statusEffects || {});
    startCooldown(active.state, skillId, level);
    active.state.lastAttackSkillId = skillId;
    // Ground skills deal the first tick immediately, then StatusManager handles remaining ticks.
    return applyDamage(active, target, perTick, skillId, options.hitCount || 1, { elementLabel: options.element || "Neutral" });
  }

  function setCombo(active, family, step, durationMs) {
    ensureState(active.state);
    active.state.comboSequence = { family, step, expiresAt: Date.now() + Math.max(1000, Number(durationMs || 5000)) };
  }

  function castSkill(active, target, skillId, now = Date.now()) {
    const level = getSkillLevel(active, skillId);
    if (level <= 0 || !isCooldownReady(active.state, skillId, now)) return null;
    const stats = calculateRuntimeCombatStats(active, now);
    if (!stats) return null;

    switch (skillId) {
      case 8018: {
        const count = [3, 3, 4, 4, 5][Math.min(4, level - 1)];
        const duration = applyInternalBuff(active, skillId, level, { legionCount: count }, now);
        addBattleLog(`${active.definition.name}：施放「${skillDisplayName(skillId)}」，${count} 隻支援蟲群加入攻擊，持續 ${Math.ceil(duration / 1000)} 秒。`, "summon-buff");
        return { attacked: true, supported: true, skillId };
      }
      case 8019: {
        const result = castPhysical(active, target, skillId, level, skillRatio(skillId, level, stats), 1, { element: "Poison", ignoreDefense: true });
        applyStatus(target, "paralysis", 30 + 5 * level, levelValue(skillMeta(skillId)?.duration1, level, 0), level, { defRate: -2 * level, variableCastTimeFlat: 500 * level });
        return result;
      }
      case 8020:
        return castGroundPeriodic(active, target, skillId, level, {
          element: "Poison", damageType: "physical", ignoreDefense: true,
          statusName: "poison_mist", intervalMs: 1000,
          statusEffects: { hitRate: -5 * level }
        });
      case 8021: {
        const reduction = -Math.min(30, 2 + 2 * level);
        const duration = applyPlayerBuff(active, skillId, level, { incomingDamageRate: reduction }, now);
        addBattleLog(`${active.definition.name}：施放「${skillDisplayName(skillId)}」，玩家受到傷害降低 ${Math.abs(reduction)}%，持續 ${Math.ceil(duration / 1000)} 秒。`, "summon-buff");
        return { attacked: true, supported: true, skillId };
      }
      case 8023: {
        const duration = applyPlayerBuff(active, skillId, level, { fleeFlat: 400 + 40 * level, aspdRate: 2 * level, defRate: -50 }, now);
        applyInternalBuff(active, skillId, level, { attackRate: 5 * level, magicRate: 5 * level }, now);
        addBattleLog(`${active.definition.name}：施放「${skillDisplayName(skillId)}」，玩家獲得高迴避與攻速，但 DEF 降低 50%，持續 ${Math.ceil(duration / 1000)} 秒。`, "summon-buff");
        return { attacked: true, supported: true, skillId };
      }
      case 8024:
        return castMagic(active, target, skillId, level, skillRatio(skillId, level, stats), active.definition.element || "Neutral", { hitCount: 6, ignoreMagicDefense: true });
      case 8025: {
        const result = castMagic(active, target, skillId, level, skillRatio(skillId, level, stats), "Wind", { hitCount: 6, ignoreMagicDefense: true });
        applyStatus(target, "bleeding", Math.min(100, 10 * level), Number(skillMeta(skillId)?.duration2 || 120000), level, { periodicIntervalMs: 3000, periodicDamageCurrentHpPercent: 1 });
        return result;
      }
      case 8026: {
        const healed = healPlayer(active, skillId, level, 5 * stats.level + stats.matkMin);
        const removed = cleansePlayer();
        if (removed) addBattleLog(`${active.definition.name}：寂靜微風另外解除玩家 ${removed} 個異常狀態。`, "summon-heal");
        return healed || { attacked: true, supported: true, skillId };
      }
      case 8027:
        active.state.styleMode = active.state.styleMode === "fighting" ? "grappling" : "fighting";
        startCooldown(active.state, skillId, level, now);
        addBattleLog(`${active.definition.name}：使用「${skillDisplayName(skillId)}」，切換為 ${active.state.styleMode === "fighting" ? "戰鬥" : "擒拿"}型態。`, "summon-buff");
        return { attacked: true, supported: true, skillId };
      case 8028: {
        const result = castPhysical(active, target, skillId, level, skillRatio(skillId, level, stats), 3, { attackRangeType: "short" });
        setCombo(active, "fighting", 1, 5000);
        return result;
      }
      case 8029: {
        const result = castPhysical(active, target, skillId, level, skillRatio(skillId, level, stats), 1, { attackRangeType: "short" });
        setCombo(active, "fighting", 2, 5000);
        return result;
      }
      case 8030: {
        const result = castPhysical(active, target, skillId, level, skillRatio(skillId, level, stats), 1, { attackRangeType: "short" });
        setCombo(active, "fighting", 0, 0);
        return result;
      }
      case 8031: {
        const holy = isInternalBuffActive(active.state, 8032, now);
        const result = castPhysical(active, target, skillId, level, skillRatio(skillId, level, stats), 1, { element: holy ? "Holy" : active.definition.element, attackRangeType: "short" });
        applyStatus(target, "stun", 20 + 2 * level, Number(levelValue(skillMeta(skillId)?.duration1, level, 4500)), level, {});
        return result;
      }
      case 8032: {
        const duration = applyInternalBuff(active, skillId, level, { attackRate: 2 + 2 * level, agiFlat: 10 + 10 * level }, now);
        addBattleLog(`${active.definition.name}：施放「${skillDisplayName(skillId)}」，攻擊與機動能力提升，持續 ${Math.ceil(duration / 1000)} 秒。`, "summon-buff");
        return { attacked: true, supported: true, skillId };
      }
      case 8033: {
        const duration = applyPlayerBuff(active, skillId, level, { defFlat: 100 * level, mdefFlat: 30 * level }, now);
        addBattleLog(`${active.definition.name}：施放「${skillDisplayName(skillId)}」，玩家 DEF +${100 * level}、MDEF +${30 * level}，持續 ${Math.ceil(duration / 1000)} 秒。`, "summon-buff");
        return { attacked: true, supported: true, skillId };
      }
      case 8034:
        return castMagic(active, target, skillId, level, skillRatio(skillId, level, stats), "Holy", { hitCount: 1 });
      case 8035: {
        const duration = applyInternalBuff(active, skillId, level, { attackFlat: 50 + 20 * level, attackRate: 5 * level }, now);
        addBattleLog(`${active.definition.name}：施放「${skillDisplayName(skillId)}」，生命體進入攻擊模式，持續 ${Math.ceil(duration / 1000)} 秒。`, "summon-buff");
        return { attacked: true, supported: true, skillId };
      }
      case 8036: {
        const result = castPhysical(active, target, skillId, level, 100, 1, { attackRangeType: "short" });
        applyStatus(target, "tinder_breaker", 100, 5000 + level * 1000, level, { moveSpeedRate: -100 });
        setCombo(active, "grappling", 1, 5000);
        return result;
      }
      case 8037: {
        const result = castPhysical(active, target, skillId, level, 100, 1, { attackRangeType: "short" });
        applyStatus(target, "continual_break", 100, 5000, level, { periodicIntervalMs: 1000, periodicDamageCurrentHpPercent: Math.min(5, level) });
        setCombo(active, "grappling", 2, 5000);
        return result;
      }
      case 8038: {
        const result = castPhysical(active, target, skillId, level, 100, 1, { attackRangeType: "short" });
        applyStatus(target, "eternal_quick_combo", 100, 5000, level, { defRate: -5 * level, periodicIntervalMs: 1000, periodicDamageCurrentHpPercent: 2 * level });
        applyStatus(target, "stun", 20 + 5 * level, 3000, level, {});
        setCombo(active, "grappling", 0, 0);
        return result;
      }
      case 8039: {
        const duration = applyInternalBuff(active, skillId, level, { magmaProcChance: 3 * level }, now);
        addBattleLog(`${active.definition.name}：施放「${skillDisplayName(skillId)}」，攻擊時有機率觸發岩漿傷害，持續 ${Math.ceil(duration / 1000)} 秒。`, "summon-buff");
        return { attacked: true, supported: true, skillId };
      }
      case 8040: {
        const duration = applyPlayerBuff(active, skillId, level, { incomingDamageRate: -2 * level }, now);
        addBattleLog(`${active.definition.name}：施放「${skillDisplayName(skillId)}」，玩家受到傷害降低 ${2 * level}%，持續 ${Math.ceil(duration / 1000)} 秒。`, "summon-buff");
        return { attacked: true, supported: true, skillId };
      }
      case 8041:
        return castGroundPeriodic(active, target, skillId, level, { element: "Fire", damageType: "physical", statusName: "lava_slide", intervalMs: 1000 });
      case 8042: {
        const bonus = 100 + 10 * level;
        const duration = applyPlayerBuff(active, skillId, level, { atkFlat: bonus }, now);
        applyInternalBuff(active, skillId, level, { attackFlat: bonus }, now);
        addBattleLog(`${active.definition.name}：施放「${skillDisplayName(skillId)}」，玩家與生命體 ATK +${bonus}，持續 ${Math.ceil(duration / 1000)} 秒。`, "summon-buff");
        return { attacked: true, supported: true, skillId };
      }
      case 8043:
        applyStatus(target, "volcanic_ash", 100, levelValue(skillMeta(skillId)?.duration1, level, 0), level, { hitRate: -50, atkRate: -25, fleeRate: -25, defRate: -25 });
        startCooldown(active.state, skillId, level, now);
        addBattleLog(`${active.definition.name}：使用「${skillDisplayName(skillId)}」，降低 ${String(target?.name || "目標")} 的命中、攻擊、迴避與防禦。`, "summon-debuff");
        return { attacked: true, supported: true, skillId };
      case 8044:
        return castGroundPeriodic(active, target, skillId, level, { element: "Fire", damageType: "physical", statusName: "blast_forge", intervalMs: 1000 });
      case 8045: {
        const patk = 5 + level;
        const duration = applyPlayerBuff(active, skillId, level, { patkFlat: patk }, now);
        addBattleLog(`${active.definition.name}：施放「${skillDisplayName(skillId)}」，玩家 P.ATK +${patk}，持續 ${Math.ceil(duration / 1000)} 秒。`, "summon-buff");
        return { attacked: true, supported: true, skillId };
      }
      case 8047:
        return castMagic(active, target, skillId, level, skillRatio(skillId, level, stats), "Wind", { hitCount: 2, ignoreMagicDefense: true });
      case 8048:
        return castMagic(active, target, skillId, level, skillRatio(skillId, level, stats), "Wind", { hitCount: 6, ignoreMagicDefense: true });
      case 8050:
        return castPhysical(active, target, skillId, level, skillRatio(skillId, level, stats), 5, { ignoreDefense: true, attackRangeType: "long" });
      case 8051:
        return castPhysical(active, target, skillId, level, skillRatio(skillId, level, stats), 1, { ignoreDefense: true, attackRangeType: "long" });
      case 8053: {
        const result = castPhysical(active, target, skillId, level, skillRatio(skillId, level, stats), 1, { element: "Neutral", ignoreDefense: true, attackRangeType: "short" });
        applyStatus(target, "toxin_of_mandara", 100, levelValue(skillMeta(skillId)?.duration1, level, 0), level, { resFlat: -15 * level });
        return result;
      }
      case 8054:
        return castPhysical(active, target, skillId, level, skillRatio(skillId, level, stats), 1, { element: "Poison", ignoreDefense: true, attackRangeType: "long" });
      case 8056:
        return castPhysical(active, target, skillId, level, skillRatio(skillId, level, stats), 1, { element: "Holy", ignoreDefense: true, attackRangeType: "short" });
      case 8057:
        return castMagic(active, target, skillId, level, skillRatio(skillId, level, stats), "Holy", { hitCount: 1, ignoreMagicDefense: true });
      case 8058: {
        const duration = applyPlayerBuff(active, skillId, level, { resFlat: 3 * level, mresFlat: 3 * level }, now);
        addBattleLog(`${active.definition.name}：施放「${skillDisplayName(skillId)}」，玩家 RES／MRES +${3 * level}，持續 ${Math.ceil(duration / 1000)} 秒。`, "summon-buff");
        return { attacked: true, supported: true, skillId };
      }
      default:
        return null;
    }
  }

  function missingBuff(active, now) {
    const order = {
      sera: [8018, 8021],
      eira: [8023],
      eleanor: [8027],
      bayeri: [8032, 8033, 8035, 8058],
      dieter: [8039, 8040, 8042, 8045]
    }[active.id] || [];
    for (const skillId of order) {
      if (!isSkillAvailable(active, skillId) || !isCooldownReady(active.state, skillId, now)) continue;
      if (PLAYER_BUFF_S_SKILL_IDS.has(skillId) && isPlayerBuffActive(skillId, now)) continue;
      if (INTERNAL_BUFF_S_SKILL_IDS.has(skillId) && isInternalBuffActive(active.state, skillId, now)) continue;
      if (skillId === 8027 && active.state.styleMode) continue;
      return skillId;
    }
    return 0;
  }

  function chooseEleanorCombo(active, now) {
    const combo = active.state.comboSequence || {};
    if (combo.family === "fighting" && Number(combo.expiresAt || 0) > now) {
      if (combo.step === 1 && isCooldownReady(active.state, 8029, now)) return 8029;
      if (combo.step === 2 && isCooldownReady(active.state, 8030, now)) return 8030;
    }
    if (combo.family === "grappling" && Number(combo.expiresAt || 0) > now) {
      if (combo.step === 1 && isCooldownReady(active.state, 8037, now)) return 8037;
      if (combo.step === 2 && isCooldownReady(active.state, 8038, now)) return 8038;
    }
    const openers = [8028, 8036, 8050, 8051].filter(id => isSkillAvailable(active, id) && isCooldownReady(active.state, id, now));
    if (!openers.length) return 0;
    const previous = Number(active.state.lastAttackSkillId || 0);
    const index = openers.indexOf(previous);
    return openers[(index + 1) % openers.length];
  }

  function chooseAttack(active, now) {
    if (active.id === "eleanor") return chooseEleanorCombo(active, now);
    const order = {
      sera: [8019, 8020, 8053, 8054],
      eira: [8024, 8025, 8047, 8048],
      bayeri: [8031, 8034, 8056, 8057],
      dieter: [8041, 8043, 8044]
    }[active.id] || [];
    const available = order.filter(id => isSkillAvailable(active, id) && isCooldownReady(active.state, id, now));
    if (!available.length) return 0;
    const previous = Number(active.state.lastAttackSkillId || 0);
    const index = available.indexOf(previous);
    return available[(index + 1) % available.length];
  }

  function takeSAction(active, target, options = {}) {
    if (!active || active.definition?.category !== "homunculus_s") return null;
    ensureState(active.state);
    const now = Date.now();
    removeExpiredInternalBuffs(active.state, now);

    if (active.id === "eira" && global.player) {
      const hpRate = Number(global.player.hp || 0) / Math.max(1, Number(global.player.maxHp || 1));
      const hasNegative = Object.keys(global.player?.runtimeState?.statuses || {}).length > 0;
      if ((hpRate < 0.70 || hasNegative) && isSkillAvailable(active, 8026) && isCooldownReady(active.state, 8026, now)) {
        const result = castSkill(active, target, 8026, now);
        if (result) return result;
      }
    }

    const buffId = missingBuff(active, now);
    if (buffId) {
      const result = castSkill(active, target, buffId, now);
      if (result) return result;
    }

    if (target && Number(target.currentHp || 0) > 0) {
      const attackId = chooseAttack(active, now);
      if (attackId) {
        const result = castSkill(active, target, attackId, now);
        if (result) return result;
      }
    }
    return null;
  }

  const originalTakeAction = baseRuntime.takeAction.bind(baseRuntime);
  const originalResetState = baseRuntime.resetState.bind(baseRuntime);
  const originalCalculate = baseRuntime.calculateRuntimeCombatStats.bind(baseRuntime);

  function takeAction(active, target, options = {}) {
    if (active?.definition?.category === "homunculus_s") return takeSAction(active, target, options);
    return originalTakeAction(active, target, options);
  }

  function resetState(state) {
    originalResetState(state);
    if (!state || typeof state !== "object") return;
    state.comboSequence = { family: "", step: 0, expiresAt: 0 };
    state.styleMode = "";
  }

  function calculateAnyRuntimeCombatStats(active, now = Date.now()) {
    return active?.definition?.category === "homunculus_s"
      ? calculateRuntimeCombatStats(active, now)
      : originalCalculate(active, now);
  }

  global.HomunculusSkillRuntime = {
    ...baseRuntime,
    version: "0.9.82DD",
    homunculusSSkillIds: Array.from(S_SKILL_IDS),
    excludedHomunculusSSkillIds: Array.from(EXCLUDED_S_SKILL_IDS),
    implementedHomunculusSSkillIds: Array.from(S_SKILL_IDS).filter(id => !EXCLUDED_S_SKILL_IDS.has(id)),
    passiveHomunculusSSkillIds: Array.from(PASSIVE_S_SKILL_IDS),
    attackHomunculusSSkillIds: Array.from(ATTACK_S_SKILL_IDS),
    playerBuffHomunculusSSkillIds: Array.from(PLAYER_BUFF_S_SKILL_IDS),
    takeAction,
    takeSAction,
    castHomunculusSSkill: castSkill,
    calculateRuntimeCombatStats: calculateAnyRuntimeCombatStats,
    calculateHomunculusSRuntimeCombatStats: calculateRuntimeCombatStats,
    resetState,
    isHomunculusSSkillAvailable: isSkillAvailable
  };
})(window);
