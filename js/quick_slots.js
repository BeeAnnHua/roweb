//=======================================
// QuickSlotManager v0.9.35
// 玩家手動拖曳制：技能 / 補品 / 普通攻擊都由玩家放到 1~0。
//=======================================

const QUICK_SLOT_LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const QUICK_SLOT_MAX = 10;

function normalizeQuickSlotData() {
  if (!player) return;
  player.quickSlots = Array.isArray(player.quickSlots) ? player.quickSlots.slice(0, QUICK_SLOT_MAX) : [];
  while (player.quickSlots.length < QUICK_SLOT_MAX) player.quickSlots.push({ type: "empty" });
}

function getQuickSlotIconForBasicAttack() {
  const weaponId = player?.equipment?.weapon || 1101;
  const weapon = typeof getItemData === "function" ? getItemData(weaponId) : null;
  return weapon?.icon || "images/items/1101.webp";
}

function sanitizeQuickSlot(slot) {
  if (!slot || slot.type === "empty") return { type: "empty" };

  if (slot.type === "basic") {
    return { type: "basic", name: "普攻", icon: getQuickSlotIconForBasicAttack(), hint: "普通攻擊" };
  }

  if (slot.type === "skill") {
    const skill = typeof getSkillDataById === "function" ? getSkillDataById(slot.id) : null;
    const level = skill && typeof getSkillLevel === "function" ? getSkillLevel(skill.id) : 0;
    if (!skill || level <= 0 || (typeof isRuntimeSkillQuickSlotEligible === "function" ? !isRuntimeSkillQuickSlotEligible(skill) : !["attack", "buff", "heal", "support"].includes(skill.skillType))) return { type: "empty" };
    return {
      type: "skill",
      id: skill.id,
      name: skill.name,
      icon: skill.icon || (skill.officialId ? `images/skills/${skill.officialId}.png` : ""),
      level,
      skillType: typeof getRuntimeSkillUiType === "function" ? getRuntimeSkillUiType(skill) : skill.skillType,
      hint: `${skill.name} Lv${level}`
    };
  }

  if (slot.type === "item") {
    const item = typeof getItemData === "function" ? getItemData(slot.id) : null;
    const inv = typeof findInventoryItemById === "function" ? findInventoryItemById(slot.id) : null;
    if (!item || !inv || Number(inv.count || 0) <= 0) return { type: "empty" };
    if (item.type !== "consume") return { type: "empty" };
    return {
      type: "item",
      id: item.id,
      name: item.name,
      icon: item.icon || `images/items/${item.officialId || item.id}.webp`,
      count: Number(inv.count || 0),
      className: "potion",
      hint: `${item.name} x${Number(inv.count || 0)}`
    };
  }

  return { type: "empty" };
}

function getManualQuickSlots() {
  normalizeQuickSlotData();
  player.quickSlots = player.quickSlots.map(sanitizeQuickSlot);
  return player.quickSlots;
}

function parseQuickDragData(event) {
  const raw = event.dataTransfer.getData("application/json") || event.dataTransfer.getData("text/plain");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function setQuickSlotFromDrag(index, data) {
  normalizeQuickSlotData();
  if (!data) return;

  if (data.type === "basic") {
    player.quickSlots[index] = { type: "basic" };
  } else if (data.type === "skill") {
    const skill = typeof getSkillDataById === "function" ? getSkillDataById(data.id) : null;
    if (!skill || typeof getSkillLevel !== "function" || getSkillLevel(skill.id) <= 0) {
      addBattleLog("尚未學會此技能，不能放入快捷欄。");
      return;
    }
    if (typeof isRuntimeSkillQuickSlotEligible === "function" ? !isRuntimeSkillQuickSlotEligible(skill) : !["attack", "buff", "heal", "support"].includes(skill.skillType)) {
      addBattleLog("被動技能不能拖曳到快捷欄。 ");
      return;
    }
    player.quickSlots[index] = { type: "skill", id: skill.id };
  } else if (data.type === "item") {
    const item = typeof getItemData === "function" ? getItemData(data.id) : null;
    if (!item || item.type !== "consume") {
      addBattleLog("目前只有消耗品可以放入快捷欄。");
      return;
    }
    player.quickSlots[index] = { type: "item", id: item.id };
  }

  updateQuickSlotUI();
  saveGame();
}

function clearQuickSlot(index) {
  normalizeQuickSlotData();
  player.quickSlots[index] = { type: "empty" };
  updateQuickSlotUI();
  saveGame();
}

function updateQuickSlotUI() {
  const bar = document.getElementById("quick-slot-bar");
  if (!bar || !player) return;

  const slots = getManualQuickSlots();
  bar.innerHTML = "";

  slots.forEach((slot, index) => {
    const slotEl = document.createElement("button");
    slotEl.type = "button";
    slotEl.className = `quick-slot ${slot.type || "empty"} ${slot.className || ""}`.trim();
    slotEl.title = slot.hint || slot.name || "拖曳技能或補品到這裡";
    slotEl.dataset.slotIndex = String(index);

    slotEl.addEventListener("dragover", event => {
      event.preventDefault();
      slotEl.classList.add("drag-over");
      event.dataTransfer.dropEffect = "copy";
    });
    slotEl.addEventListener("dragleave", () => slotEl.classList.remove("drag-over"));
    slotEl.addEventListener("drop", event => {
      event.preventDefault();
      slotEl.classList.remove("drag-over");
      setQuickSlotFromDrag(index, parseQuickDragData(event));
    });
    slotEl.addEventListener("contextmenu", event => {
      event.preventDefault();
      clearQuickSlot(index);
    });

    const key = document.createElement("span");
    key.className = "quick-key";
    key.textContent = QUICK_SLOT_LABELS[index] || String(index + 1);
    slotEl.appendChild(key);

    if (slot.type !== "empty") {
      const icon = document.createElement("img");
      icon.src = slot.icon || "";
      icon.alt = slot.name || "快捷";
      icon.onerror = function () { icon.style.display = "none"; };
      slotEl.appendChild(icon);

      if (slot.type === "skill" && Number(slot.level || 0) > 0) {
        const level = document.createElement("b");
        level.className = "quick-level";
        level.textContent = `Lv${slot.level}`;
        slotEl.appendChild(level);
      }

      if (slot.type === "item" && Number(slot.count || 0) > 0) {
        const count = document.createElement("b");
        count.className = "quick-count";
        count.textContent = String(slot.count);
        slotEl.appendChild(count);
      }

      slotEl.addEventListener("click", () => useQuickSlot(slot));
    } else {
      const empty = document.createElement("i");
      empty.textContent = "+";
      slotEl.appendChild(empty);
    }

    bar.appendChild(slotEl);
  });
}

function useQuickSlot(slot) {
  if (!slot || slot.type === "empty") return;

  if (slot.type === "basic") {
    quickSlotNormalAttack();
    return;
  }

  if (slot.type === "item") {
    if (typeof useItem === "function") {
      useItem(slot.id);
      updateQuickSlotUI();
    }
    return;
  }

  if (slot.type === "skill") quickSlotCastSkill(slot.id);
}

function quickSlotEnsureFieldMonster() {
  if (player?.currentCity) {
    addBattleLog("目前位於城鎮，無法攻擊怪物。");
    return false;
  }
  if (!currentMap) {
    addBattleLog("目前沒有練功地圖。");
    return false;
  }
  if (!currentMonster && typeof spawnMonsterFromCurrentMap === "function") spawnMonsterFromCurrentMap();
  return Boolean(currentMonster);
}

function quickSlotNormalAttack() {
  const active = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
  if (Number(active.blocksNormalAttack || 0) > 0) {
    if (typeof addBattleLog === "function") addBattleLog("目前狀態無法進行普通攻擊。");
    return false;
  }
  if (!quickSlotEnsureFieldMonster()) return;
  if (typeof canPlayerAttackNow === "function" && !canPlayerAttackNow()) return;
  if (typeof markPlayerAttackUsed === "function") markPlayerAttackUsed();

  if (typeof resolvePlayerNormalAttack !== "function") {
    console.error("[Renewal Formula] resolvePlayerNormalAttack 尚未載入。");
    return false;
  }
  const normalAttackResult = resolvePlayerNormalAttack();
  if (normalAttackResult.miss) {
    addBattleLog("你攻擊 " + currentMonster.name + "，但是 Miss！");
    playPlayerAttackAnimation();
    updateMonsterUI();
    monsterAttackPlayer();
    return;
  }

  const playerDamage = Math.max(1, Number(normalAttackResult.damage || 1));
  currentMonster.currentHp = Math.max(0, Number(currentMonster.currentHp || 0) - playerDamage);
  if(playerDamage>0&&window.StatusManager?.onDamage)window.StatusManager.onDamage(currentMonster,playerDamage,{source:player,normalAttack:true});
  if (typeof tryGankOnNormalAttack === "function") tryGankOnNormalAttack(currentMonster);
  if (typeof tryGentleTouchEnergyGain === "function") tryGentleTouchEnergyGain("normal_attack");
  if (typeof applyActiveAttackBuffStatuses === "function") applyActiveAttackBuffStatuses(currentMonster, playerDamage);
  if (typeof trySpellFistOnNormalAttack === "function") trySpellFistOnNormalAttack(currentMonster);
  if (typeof trySageAutoSpellOnNormalAttack === "function") trySageAutoSpellOnNormalAttack(currentMonster);
  if (typeof tryAutoShadowSpellOnNormalAttack === "function") tryAutoShadowSpellOnNormalAttack(currentMonster);
  if (typeof tryDupleLightOnNormalAttack === "function") tryDupleLightOnNormalAttack(currentMonster);
  if (typeof tryServantWeaponOnNormalAttack === "function") tryServantWeaponOnNormalAttack(currentMonster);
  if (typeof tryAbyssForceWeaponOnNormalAttack === "function") tryAbyssForceWeaponOnNormalAttack(currentMonster);
  if (typeof tryFalconAutoAttackOnNormal === "function") tryFalconAutoAttackOnNormal(currentMonster);
  if (typeof tryHawkRushAutoAttackOnNormal === "function") tryHawkRushAutoAttackOnNormal(currentMonster);
  if (typeof tryWargAutoStrikeOnNormal === "function") tryWargAutoStrikeOnNormal(currentMonster);
  addBattleLog("你對 " + currentMonster.name + " 造成 " + playerDamage + " 點傷害。");
  playPlayerAttackAnimation();
  updateMonsterUI();
  playMonsterHitAnimation(currentMonster);
  showDamageNumber(playerDamage, {
    target: currentMonster,
    critical: normalAttackResult?.critical === true || normalAttackResult?.critical?.critical === true,
    hitCount: Math.max(1, Number(normalAttackResult?.visualHits || 1)),
    combo: Math.max(1, Number(normalAttackResult?.visualHits || 1)) > 1
  });
  showSlashEffect();

  if (currentMonster.currentHp <= 0) {
    defeatMonster();
    return;
  }
  monsterAttackPlayer();
}


const RO_WEB_TARGETED_SKILL_HANDLERS = new Set([
  "physical_attack","physical_attack_size_hits","physical_attack_formula","physical_charge",
  "magic_multihit","magic_damage","misc_damage","chain_magic","combo_sequence",
  "inspect_monster","steal_item","steal_zeny","ground_damage","ground_protection","ground_debuff",
  "falcon_detect","falcon_spring_trap","trap_detonator","warg_sensitive_keen",
  "dispel","debuff","monster_debuff","soul_exchange"
]);

function quickSlotSkillNeedsFieldTarget(skill, runtimeProfile = null) {
  const profile = runtimeProfile || (typeof getSkillRuntimeProfile === "function" ? getSkillRuntimeProfile(skill) : null) || {};
  const handler = String(profile.handler || "");
  const targetType = String(skill?.targetType || skill?.target || "").trim().toLowerCase();
  if (profile.affectsSelf === true || profile.targetPolicy === "self" || targetType === "self" || targetType === "passive") return false;
  if (targetType === "attack" || targetType === "ground" || targetType === "trap") return true;
  return RO_WEB_TARGETED_SKILL_HANDLERS.has(handler);
}

function quickSlotEnsureSkillTargetRange(skill, level, runtimeProfile = null) {
  if (!quickSlotSkillNeedsFieldTarget(skill, runtimeProfile)) return true;
  if (!quickSlotEnsureFieldMonster()) return false;
  const rangePx = typeof getSkillRangePx === "function" ? Number(getSkillRangePx(skill, level)) : null;
  if (!Number.isFinite(rangePx) || typeof canAttackMonsterByRange !== "function" || canAttackMonsterByRange(currentMonster, rangePx)) return true;
  if (typeof movePlayerTowardMonster === "function") movePlayerTowardMonster(currentMonster, rangePx);
  if (typeof addBattleLog === "function") {
    const cells = typeof pixelsToCells === "function" ? pixelsToCells(rangePx) : rangePx / 36;
    addBattleLog(`${skill.name} 施放距離不足（${Number(cells).toFixed(Number.isInteger(cells) ? 0 : 1)} 格），正在靠近目標。`);
  }
  return false;
}
window.quickSlotSkillNeedsFieldTarget = quickSlotSkillNeedsFieldTarget;
window.quickSlotEnsureSkillTargetRange = quickSlotEnsureSkillTargetRange;

function quickSlotCastSkill(skillId, options = {}) {
  const skill = typeof getSkillDataById === "function" ? getSkillDataById(skillId) : null;
  if (!skill) {
    addBattleLog("找不到快捷技能。");
    updateQuickSlotUI();
    return;
  }

  if (typeof getSkillLevel === "function" && getSkillLevel(skill.id) <= 0) {
    addBattleLog(skill.name + " 尚未學會。");
    updateQuickSlotUI();
    return;
  }

  const runtimeProfile = typeof getSkillRuntimeProfile === "function" ? getSkillRuntimeProfile(skill) : null;
  const runtimeHandler = runtimeProfile?.handler || null;

  const learnedLevel = typeof getSkillLevel === "function" ? getSkillLevel(skill.id) : 1;
  if (!options.skipRuntimeCast && runtimeHandler && runtimeHandler !== "passive" && typeof getRuntimeAdjustedCastTime === "function" && typeof beginRuntimeSkillCast === "function") {
    const timing = getRuntimeAdjustedCastTime(skill, learnedLevel);
    if (Number(timing?.totalMs || 0) > 0) {
      const precheck = typeof canCastSkill === "function" ? canCastSkill(skill, learnedLevel) : { ok: true };
      if (!precheck.ok) return typeof reportPendingRuntime === "function" ? reportPendingRuntime(skill, precheck.reason) : false;
      if (!quickSlotEnsureSkillTargetRange(skill, learnedLevel, runtimeProfile)) return false;
      return beginRuntimeSkillCast(skill, learnedLevel, () => quickSlotCastSkill(skillId, { ...options, skipRuntimeCast: true }));
    }
  }

  if (!quickSlotEnsureSkillTargetRange(skill, learnedLevel, runtimeProfile)) return false;

  if (["physical_attack", "physical_attack_size_hits", "physical_attack_formula", "physical_charge", "magic_multihit", "magic_damage", "misc_damage"].includes(runtimeHandler)) {
    if (!quickSlotEnsureFieldMonster()) return;
    // 技能自身的 RA Cooldown / After Cast Delay / 零延遲物理技能 ASPD 間隔，
    // 統一由 canCastSkill() 與 paySkillCost() 管理，不再預先占用普通攻擊計時器。
    const used = castAttackSkill(skill, getSkillLevel(skill.id));
    if (!used) return;
    if (currentMonster && currentMonster.currentHp <= 0) {
      defeatMonster();
      return;
    }
    if (currentMonster) monsterAttackPlayer();
    return;
  }

  if (runtimeHandler === "chain_magic") { if (!quickSlotEnsureFieldMonster()) return; const used=castChainMagicSkill(skill,getSkillLevel(skill.id)); if(!used)return; if(currentMonster&&currentMonster.currentHp<=0){defeatMonster();return;} if(currentMonster)monsterAttackPlayer(); return; }
  if (runtimeHandler === "spirit_resource") { castSpiritResourceSkill(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "spirit_absorb") { castSpiritAbsorbSkill(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "soul_exchange") { if (!quickSlotEnsureFieldMonster()) return; castSoulExchangeSkill(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "summon_control") { castSummonControlSkill(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "virtual_summon") { castVirtualSummonSkill(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "independent_summon") { castIndependentSummonSkill(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "virtual_summon_dismiss") { castVirtualSummonDismissSkill(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "homunculus_manager") { castHomunculusManagerSkill(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "homunculus_rest") { castHomunculusRestSkill(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "falcon_toggle") { castFalconToggleSkill(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "falcon_detect") { if (!quickSlotEnsureFieldMonster()) return; castFalconDetectSkill(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "falcon_spring_trap") { if (!quickSlotEnsureFieldMonster()) return; castFalconSpringTrapSkill(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "trap_detonator") { if (!quickSlotEnsureFieldMonster()) return; castTrapDetonatorSkill(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "warg_toggle") { castWargToggleSkill(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "warg_sensitive_keen") { castWargSensitiveKeenSkill(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "spirit_assimilate") { castSpiritAssimilateSkill(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "combo_sequence") { if (!quickSlotEnsureFieldMonster()) return; const used=castComboSequenceSkill(skill, getSkillLevel(skill.id)); if(!used)return; if(currentMonster&&currentMonster.currentHp<=0){defeatMonster();return;} if(currentMonster)monsterAttackPlayer(); return; }
  if (runtimeHandler === "inspect_monster") { if (!quickSlotEnsureFieldMonster()) return; castInspectMonsterSkill(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "steal_item") { if (!quickSlotEnsureFieldMonster()) return; castStealItemSkill(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "steal_zeny") { if (!quickSlotEnsureFieldMonster()) return; castStealZenySkill(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "skill_copy_selector") { castSkillCopySelector(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "follow_area") { castFollowAreaSkill(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "ground_damage") { if (!quickSlotEnsureFieldMonster()) return; castGroundDamageSkill(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "ground_protection") { if (!quickSlotEnsureFieldMonster()) return; castGroundProtectionSkill(skill, getSkillLevel(skill.id)); return; }
  if (runtimeHandler === "buff") {
    castBuffSkill(skill, getSkillLevel(skill.id));
    return;
  }
  if (runtimeHandler === "ground_debuff") {
    if (!quickSlotEnsureFieldMonster()) return;
    castGroundDebuffSkill(skill, getSkillLevel(skill.id));
    return;
  }
  if (runtimeHandler === "sanctuary_area") {
    castSanctuarySkill(skill, getSkillLevel(skill.id));
    return;
  }
  if (runtimeHandler === "teleport") {
    castTeleportSkill(skill, getSkillLevel(skill.id));
    return;
  }
  if (runtimeHandler === "movement") {
    castMovementSkill(skill, getSkillLevel(skill.id));
    return;
  }
  if (runtimeHandler === "timed_status") {
    if (!quickSlotEnsureFieldMonster()) return;
    castTimedStatusSkill(skill, getSkillLevel(skill.id));
    return;
  }
  if (runtimeHandler === "dispel") {
    if (!quickSlotEnsureFieldMonster()) return;
    castDispelSkill(skill, getSkillLevel(skill.id));
    return;
  }
  if (runtimeHandler === "debuff") {
    if (!quickSlotEnsureFieldMonster()) return;
    castDebuffSkill(skill, getSkillLevel(skill.id));
    return;
  }
  if (["heal", "heal_fixed"].includes(runtimeHandler)) {
    castHealSkill(skill, getSkillLevel(skill.id));
    return;
  }
  if (runtimeHandler === "monster_debuff") {
    if (!quickSlotEnsureFieldMonster()) return;
    castMonsterDebuffSkill(skill, getSkillLevel(skill.id));
    return;
  }
  if (runtimeHandler === "counter_stance") {
    castCounterStanceSkill(skill, getSkillLevel(skill.id));
    return;
  }
  if (runtimeHandler === "mount_unlock") {
    togglePlayerMount(runtimeProfile.mountType || "peco");
    return;
  }
  addBattleLog(skill.name + " 目前不能放在快捷欄使用。 ");
}

document.addEventListener("keydown", event => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
  const keyMap = { "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5, "7": 6, "8": 7, "9": 8, "0": 9 };
  if (!(event.key in keyMap)) return;
  const slot = getManualQuickSlots()[keyMap[event.key]];
  if (!slot || slot.type === "empty") return;
  event.preventDefault();
  useQuickSlot(slot);
});
