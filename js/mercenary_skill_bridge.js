//============================================================
// RO_WEB V0.9.88B9 — 傭兵共用玩家 Skill Engine Bridge
// 不複製技能公式、不修改自創技能；只在一次施放期間切換施法者上下文。
//============================================================
(() => {
  "use strict";
  const VERSION = "0.9.88B9";
  const clone = value => {
    try { return structuredClone(value); } catch (_) {}
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  };
  const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function skillIdOf(skill) {
    return Number(skill?.officialId ?? skill?.skillId ?? skill?.id ?? 0);
  }

  function getSkill(id) {
    try { return typeof getSkillDataById === "function" ? getSkillDataById(Number(id), true) : null; }
    catch (_) { return null; }
  }

  function buildDerived(actor) {
    const stats = { str:1,agi:1,vit:1,int:1,dex:1,luk:1,...(actor?.stats || actor?.snapshot?.stats || {}) };
    return {
      ...actor,
      stats,
      maxHp:Math.max(1,n(actor?.maxHp,1)),
      maxSp:Math.max(0,n(actor?.maxSp,0)),
      atk:Math.max(1,n(actor?.atk,1)),
      weaponAtk:Math.max(1,n(actor?.weaponAtk ?? actor?.atk,1)),
      statusAtk:Math.max(0,n(actor?.statusAtk,0)),
      matk:Math.max(0,n(actor?.matk,0)),
      def:Math.max(0,n(actor?.def,0)),
      mdef:Math.max(0,n(actor?.mdef,0)),
      hit:Math.max(0,n(actor?.hit,stats.dex+n(actor?.baseLevel,1))),
      flee:Math.max(0,n(actor?.flee,stats.agi+n(actor?.baseLevel,1))),
      crit:Math.max(0,n(actor?.crit,1+stats.luk/3)),
      perfectDodge:Math.max(0,n(actor?.perfectDodge,stats.luk/10)),
      aspd:Math.max(100,n(actor?.aspd,160)),
      attackRange:Math.max(1,n(actor?.attackRange,1))
    };
  }

  function installProfileOverride() {
    const original = window.getSkillRuntimeProfile;
    if (typeof original !== "function" || original.__mercenaryB9Wrapped) return;
    const wrapped = function(skillOrId) {
      const profile = original(skillOrId);
      const id = Number(skillOrId?.officialId ?? skillOrId?.skillId ?? skillOrId?.id ?? skillOrId ?? 0);
      return id === 54 && profile ? { ...profile, handler:"resurrection_ally" } : profile;
    };
    wrapped.__mercenaryB9Wrapped = true;
    wrapped.__original = original;
    window.getSkillRuntimeProfile = wrapped;
  }

  function installEffectCasterOverride() {
    const runtime = window.SkillEffectRuntimeV92;
    if (!runtime || runtime.__mercenaryB9Wrapped) return;
    for (const method of ["onSkillBegin","onSkillCommit"]) {
      const original = runtime[method];
      if (typeof original !== "function") continue;
      runtime[method] = function(skill, level, options = {}) {
        const actor = window.RO_WEB_MERCENARY_CAST_CONTEXT?.actor;
        return original.call(runtime, skill, level, actor ? { ...options, casterWorldPosition:actor.position } : options);
      };
    }
    runtime.__mercenaryB9Wrapped = true;
  }

  function installMotionOverride() {
    const originalMotion = window.playROStudioPlayerMotion;
    if (typeof originalMotion === "function" && !originalMotion.__mercenaryB9Wrapped) {
      const wrapped = function(motion, options = {}) {
        const actor = window.RO_WEB_MERCENARY_CAST_CONTEXT?.actor;
        if (actor) {
          const duration = Math.max(150,n(options.duration,360));
          return window.ROWebMercenaryRuntime?.playSkillMotion?.(actor.characterId,String(motion || "cast"),duration) === true;
        }
        return originalMotion(motion,options);
      };
      wrapped.__mercenaryB9Wrapped = true;
      wrapped.__original = originalMotion;
      window.playROStudioPlayerMotion = wrapped;
    }
    const originalAttack = window.playPlayerAttackAnimation;
    if (typeof originalAttack === "function" && !originalAttack.__mercenaryB9Wrapped) {
      const wrappedAttack = function(options = {}) {
        const actor = window.RO_WEB_MERCENARY_CAST_CONTEXT?.actor;
        if (actor) return window.ROWebMercenaryRuntime?.playSkillMotion?.(actor.characterId,"attack",Math.max(150,n(options.duration,360))) === true;
        return originalAttack(options);
      };
      wrappedAttack.__mercenaryB9Wrapped = true;
      wrappedAttack.__original = originalAttack;
      window.playPlayerAttackAnimation = wrappedAttack;
    }
  }

  function installRuntimeOverrides() {
    installProfileOverride();
    installEffectCasterOverride();
    installMotionOverride();
  }

  function createSuppressedPartyRuntime(runtime) {
    if (!runtime) return runtime;
    return new Proxy(runtime,{
      get(target,property,receiver) {
        if (property === "applyPartyBuff" || property === "applyBuffToParty") return () => ({ok:true,applied:0});
        if (property === "healParty") return () => ({ok:true,affected:0,healed:0});
        if (property === "removePartyBuff") return () => 0;
        return Reflect.get(target,property,receiver);
      }
    });
  }

  function withActor(actor, target, callback) {
    if (!actor || typeof callback !== "function") return null;
    installRuntimeOverrides();
    const previousPlayer = window.player;
    const previousMonster = window.currentMonster;
    const previousRuntime = window.ROWebMercenaryRuntime;
    const previousCastState = window.RO_WEB_CAST_STATE;
    const previousContext = window.RO_WEB_MERCENARY_CAST_CONTEXT || null;
    const previousEval = window.RO_WEB_COMBAT_EVAL_CONTEXT || null;
    const previousZeny = actor.zeny;
    const previousEquipment = actor.equipment;
    const previousInstances = actor.equipmentInstances;
    const derivedStats = buildDerived(actor);
    const context = {actor,target:target || null,derivedStats};

    actor.learnedSkills = actor.learnedSkills || actor.snapshot?.learnedSkills || {};
    actor.extraSkills = actor.extraSkills || actor.snapshot?.extraSkills || {};
    actor.activeBuffs = actor.activeBuffs || {};
    actor.runtimeState = actor.runtimeState || {statuses:{}};
    actor.combatResources = actor.combatResources || {};
    actor.skillTimingState = actor.skillTimingState || {};
    actor.zeny = 1e15;
    actor.equipment = {...(actor.equipment || {})};
    actor.equipmentInstances = {...(actor.equipmentInstances || {})};
    if (actor.weaponType && !actor.equipment.weapon) {
      actor.equipment.weapon = "__mercenary_snapshot_weapon__";
      actor.equipmentInstances.weapon = {weaponType:actor.weaponType};
    }
    if (actor.hasShield && !actor.equipment.shield) actor.equipment.shield = "__mercenary_snapshot_shield__";

    try {
      window.player = actor;
      window.currentMonster = target || null;
      window.RO_WEB_CAST_STATE = null;
      window.RO_WEB_MERCENARY_CAST_CONTEXT = context;
      window.RO_WEB_COMBAT_EVAL_CONTEXT = {
        startedAt:typeof performance !== "undefined" && performance.now ? performance.now() : Date.now(),
        derivedStats,
        activeBuffTotals:typeof getActiveBuffBonusTotals === "function" ? (getActiveBuffBonusTotals() || {}) : {},
        passiveSkillBonusTotals:typeof getPassiveSkillBonusTotals === "function" ? (getPassiveSkillBonusTotals() || {}) : {},
        passiveCombatModifierTotals:typeof getPassiveCombatModifierTotals === "function" ? (getPassiveCombatModifierTotals() || {}) : {},
        trainingBonusTotals:typeof getTrainingBonusTotals === "function" ? (getTrainingBonusTotals() || {}) : {},
        candidates:target ? [target] : []
      };
      window.ROWebMercenaryRuntime = createSuppressedPartyRuntime(previousRuntime);
      return callback(context);
    } finally {
      actor.zeny = previousZeny;
      actor.equipment = previousEquipment;
      actor.equipmentInstances = previousInstances;
      window.ROWebMercenaryRuntime = previousRuntime;
      window.RO_WEB_COMBAT_EVAL_CONTEXT = previousEval;
      window.RO_WEB_MERCENARY_CAST_CONTEXT = previousContext;
      window.RO_WEB_CAST_STATE = previousCastState;
      window.currentMonster = previousMonster;
      window.player = previousPlayer;
    }
  }

  function clearPrepared(actor, skill) {
    const id = skillIdOf(skill);
    if (Number(actor?._preparedMercenarySkillId || 0) !== id) return false;
    actor._preparedMercenarySkillId = 0;
    if (actor.skillTimingState) actor.skillTimingState.actionLockUntil = 0;
    return true;
  }

  function castByHandler(actor,target,skill,level,options={}) {
    return withActor(actor,target,() => {
      const profile = window.getSkillRuntimeProfile?.(skill) || {};
      const handler = String(profile.damageHandler || profile.handler || "");
      const prepared = clearPrepared(actor,skill);
      const common = {source:"mercenary",target,primaryTarget:target,ignoreTimingCheck:prepared,...options};
      let used = false;
      if (["physical_attack","physical_attack_size_hits","physical_attack_formula","physical_charge","magic_multihit","magic_damage","misc_damage"].includes(handler)) {
        used = typeof castAttackSkill === "function" && castAttackSkill(skill,level,common) === true;
      } else if (handler === "chain_magic") {
        used = typeof castChainMagicSkill === "function" && castChainMagicSkill(skill,level) === true;
      } else if (handler === "ground_damage") {
        used = typeof castGroundDamageSkill === "function" && castGroundDamageSkill(skill,level) === true;
      } else if (handler === "follow_area") {
        used = typeof castFollowAreaSkill === "function" && castFollowAreaSkill(skill,level) === true;
      } else if (handler === "combo_sequence") {
        used = typeof castComboSequenceSkill === "function" && castComboSequenceSkill(skill,level,common) === true;
      } else if (handler === "sanctuary_area") {
        used = typeof castSanctuarySkill === "function" && castSanctuarySkill(skill,level) === true;
      } else if (handler === "buff") {
        used = typeof castBuffSkill === "function" && castBuffSkill(skill,level,common) === true;
      }
      const id = skillIdOf(skill);
      return {used,buff:used?clone(actor.activeBuffs?.[String(id)] || actor.activeBuffs?.[id] || null):null};
    }) || {used:false};
  }

  function castPlayerResurrection(skill, requestedLevel = null) {
    const level = Math.max(1,n(requestedLevel,1));
    const target = window.ROWebMercenaryRuntime?.getRuntimeMembers?.().find(member => member?.dead);
    if (!target) {
      window.addBattleLog?.(`${skill?.name || "復活術"}：目前沒有倒下的友軍。`);
      return false;
    }
    const check = typeof canCastSkill === "function" ? canCastSkill(skill,level,null) : {ok:true,level};
    if (!check.ok) return typeof reportPendingRuntime === "function" ? reportPendingRuntime(skill,check.reason) : false;
    if (typeof paySkillCost === "function") paySkillCost(skill,check.level,{target,primaryTarget:target});
    const rates = [10,30,50,80];
    const hpRate = n(rates[Math.max(0,check.level-1)],80)/100;
    const revived = window.ROWebMercenaryRuntime?.resurrect?.(target.characterId,{hpRate,spRate:0}) === true;
    if (revived) window.addBattleLog?.(`${window.player?.name || "玩家"} 使用復活術救起 ${target.name}。`);
    return revived;
  }

  window.castResurrectionSkill = castPlayerResurrection;
  window.ROWebMercenarySkillBridge = Object.freeze({
    version:VERSION,
    preview(actor,target,id,level) {
      const skill=getSkill(id);
      if(!skill)return {ok:false,reason:"SKILL_NOT_FOUND"};
      return withActor(actor,target,()=>{
        const check=typeof canCastSkill==="function"?canCastSkill(skill,level,null,{ignoreCastStateCheck:true}):{ok:false,reason:"SKILL_ENGINE_NOT_READY"};
        const timing=typeof getRuntimeSkillTimingProfile==="function"?getRuntimeSkillTimingProfile(skill,level):{cast:{totalMs:0}};
        return {...check,timing};
      })||{ok:false,reason:"MERCENARY_CONTEXT_FAILED"};
    },
    begin(actor,target,id,level) {
      const skill=getSkill(id);
      if(!skill)return {ok:false,reason:"SKILL_NOT_FOUND"};
      return withActor(actor,target,()=>{
        const check=canCastSkill(skill,level,null,{ignoreCastStateCheck:true});
        if(!check.ok)return check;
        const timing=getRuntimeSkillTimingProfile(skill,level);
        actor._preparedMercenarySkillId=skillIdOf(skill);
        beginRuntimeSkillTiming(skill,level,{target,primaryTarget:target,casterWorldPosition:actor.position});
        playRuntimeSkillActionMotion?.(skill,level,{durationMs:n(timing?.cast?.totalMs,500),casting:true,castPhase:"prepare"});
        return {ok:true,timing};
      })||{ok:false,reason:"MERCENARY_CONTEXT_FAILED"};
    },
    cast(actor,target,id,level,options={}) {
      const skill=getSkill(id);
      return skill?castByHandler(actor,target,skill,level,options):{used:false,reason:"SKILL_NOT_FOUND"};
    },
    heal(actor,target,id,level) {
      const skill=getSkill(id);
      if(!skill)return {used:false,reason:"SKILL_NOT_FOUND"};
      return withActor(actor,target,()=>{
        const prepared=clearPrepared(actor,skill);
        const check=canCastSkill(skill,level,["heal","heal_fixed"],{ignoreCastStateCheck:true,ignoreTimingCheck:prepared});
        if(!check.ok)return {used:false,reason:check.reason};
        const beforeHp=n(actor.hp,0);
        actor.hp=0;
        const used=typeof castHealSkill==="function"&&castHealSkill(skill,level)===true;
        const healAmount=used?Math.max(0,n(actor.hp,0)):0;
        actor.hp=Math.max(1,beforeHp-n(check.hpCost,0));
        return {used,healAmount};
      })||{used:false,reason:"MERCENARY_CONTEXT_FAILED"};
    },
    consume(actor,target,id,level) {
      const skill=getSkill(id);
      if(!skill)return {used:false,reason:"SKILL_NOT_FOUND"};
      return withActor(actor,target,()=>{
        const prepared=clearPrepared(actor,skill);
        const check=canCastSkill(skill,level,null,{ignoreCastStateCheck:true,ignoreTimingCheck:prepared});
        if(!check.ok)return {used:false,reason:check.reason};
        paySkillCost(skill,check.level,{target,primaryTarget:target,casterWorldPosition:actor.position});
        return {used:true};
      })||{used:false,reason:"MERCENARY_CONTEXT_FAILED"};
    }
  });
  installRuntimeOverrides();
})();
