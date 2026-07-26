//=======================================
// RO_WEB 輕量人工生命體核心 0.9.82DD
// - 專用生命體欄位，不占 virtual summon slot
// - 無地圖實體、HP、SP、EXP、餵食、親密度、受擊與死亡
// - 等級在召喚時同步玩家 BaseLv 快照
// - 素質依 RA 基礎值、固定平均成長與進化加成即時計算
// - Batch112 啟用四種進化生命體與五種人工生命體 S 技能 AI
//=======================================
let homunculusData = null;
let homunculusSkillData = null;
let homunculusAiTimer = null;

async function loadHomunculusData() {
  const [definitions, skills] = await Promise.all([
    loadJson("./data/homunculus/homunculi.json", null),
    loadJson("./data/homunculus/homunculus_skills.json", null)
  ]);
  if (!definitions?.definitions || !skills?.skills) {
    console.warn("人工生命體資料載入失敗，生命體系統停用。");
    homunculusData = null;
    homunculusSkillData = null;
    return false;
  }
  homunculusData = definitions;
  homunculusSkillData = skills;
  window.homunculusData = homunculusData;
  window.homunculusSkillData = homunculusSkillData;
  normalizeHomunculusPlayerData();
  startHomunculusAiLoop();
  updateHomunculusUI();
  return true;
}

function normalizeHomunculusPlayerData() {
  if (!player || typeof player !== "object") return null;
  const current = player.homunculus && typeof player.homunculus === "object" && !Array.isArray(player.homunculus)
    ? player.homunculus
    : {};
  const selectedId = String(current.selectedId || "");
  player.homunculus = {
    selectedId: homunculusData?.definitions?.[selectedId] ? selectedId : "",
    active: Boolean(current.active && homunculusData?.definitions?.[selectedId]),
    levelSnapshot: Math.max(1, Math.min(275, Math.floor(Number(current.levelSnapshot || player.baseLevel || 1)))),
    summonedAt: Math.max(0, Number(current.summonedAt || 0)),
    lastActionAt: Math.max(0, Number(current.lastActionAt || 0)),
    assistEnabled: current.assistEnabled !== false,
    skillCooldowns: current.skillCooldowns && typeof current.skillCooldowns === "object" && !Array.isArray(current.skillCooldowns) ? current.skillCooldowns : {},
    internalBuffs: current.internalBuffs && typeof current.internalBuffs === "object" && !Array.isArray(current.internalBuffs) ? current.internalBuffs : {},
    lastAttackSkillId: Math.max(0, Number(current.lastAttackSkillId || 0)),
    lastSkillId: Math.max(0, Number(current.lastSkillId || 0))
  };
  return player.homunculus;
}

function getHomunculusDefinition(id) {
  return homunculusData?.definitions?.[String(id || "")] || null;
}

function isHomunculusSUnlocked() {
  if (!player) return false;
  const jobKey = String(player.jobKey || "").toLowerCase();
  const jobName = String(player.job || "");
  if (["biolo", "life_creator"].includes(jobKey) || jobName.includes("生命締造者")) return true;
  const markerIds = homunculusData?.definitions?.eira?.availability?.fourthJobMarkerSkillIds || [5337, 5344, 5345, 5346, 5348];
  return markerIds.some(id => Number(typeof getSkillLevel === "function" ? getSkillLevel(id) : player?.learnedSkills?.[String(id)] || 0) > 0);
}

function isHomunculusDefinitionAvailable(definition) {
  if (!definition) return false;
  return definition.category !== "homunculus_s" || isHomunculusSUnlocked();
}

function roundScaledPositive(value, scale) {
  const divisor = Math.max(1, Math.floor(Number(scale || 1)));
  const numeric = Math.max(0, Number(value || 0));
  return Math.floor((numeric + divisor / 2) / divisor);
}

function calculateHomunculusStats(definition, requestedLevel) {
  if (!definition) return null;
  const levelRule = definition.levelRule || {};
  const level = Math.max(Number(levelRule.minimum || 1), Math.min(Number(levelRule.maximum || 275), Math.floor(Number(requestedLevel || 1))));
  const formula = definition.statFormula || {};
  const scale = Math.max(1, Number(formula.growthScale || 1000));
  const stats = {};
  for (const key of ["str", "agi", "vit", "int", "dex", "luk"]) {
    const base = Math.max(0, Number(definition.baseStats?.[key] || 0));
    const growthScaled = Math.max(0, Number(definition.growthPerLevelScaled?.[key] || 0));
    const evolutionScaled = Math.max(0, Number(definition.evolutionBonusScaled?.[key] || 0));
    const growth = roundScaledPositive(Math.max(0, level - 1) * growthScaled, scale);
    const evolution = roundScaledPositive(evolutionScaled, scale);
    stats[key] = Math.max(0, Math.floor(base + growth + evolution));
  }
  return { level, ...stats };
}

function calculateHomunculusCombatStats(definition, level) {
  const stats = calculateHomunculusStats(definition, level);
  if (!stats) return null;
  const batk = Math.max(1, 2 * stats.level + stats.str);
  const attackMin = Math.max(1, Math.floor((stats.str + stats.dex) / 5));
  const attackMax = Math.max(attackMin, Math.floor((stats.luk + stats.str + stats.dex) / 3));
  const matkMin = Math.max(1, Math.floor(stats.int + stats.level + (stats.int + stats.dex) / 5));
  const matkMax = Math.max(matkMin, Math.floor(stats.int + stats.level + (stats.luk + stats.int + stats.dex) / 3));
  const hit = Math.max(1, stats.level + stats.dex + 150);
  const flee = Math.max(1, stats.level + stats.agi);
  return { ...stats, batk, attackMin, attackMax, matkMin, matkMax, hit, flee };
}

function getUnlockedHomunculusSkills(definition, level) {
  if (!definition) return [];
  const currentLevel = Math.max(1, Number(level || 1));
  return (definition.skills || []).filter(row => currentLevel >= Math.max(1, Number(row.requiredHomunculusLevel || 1)));
}

function getActiveHomunculus() {
  if (!player?.homunculus?.active) return null;
  const definition = getHomunculusDefinition(player.homunculus.selectedId);
  if (!definition) return null;
  const level = Math.max(1, Math.min(275, Math.floor(Number(player.homunculus.levelSnapshot || player.baseLevel || 1))));
  const combat = calculateHomunculusCombatStats(definition, level);
  return {
    id: definition.id,
    definition,
    level,
    stats: combat,
    skills: getUnlockedHomunculusSkills(definition, level),
    state: player.homunculus
  };
}

function resolveHomunculusBasicAttack(active, target) {
  if (!active || !target || !window.RARenewalDamagePipeline?.finalModifiers) return null;
  const min = active.stats.batk + active.stats.attackMin;
  const max = Math.max(min, active.stats.batk + active.stats.attackMax);
  const rolled = min + Math.floor(Math.random() * (max - min + 1));
  const damage = window.RARenewalDamagePipeline.finalModifiers(rolled, target, {
    damageType: "physical",
    element: active.definition.element || "Neutral",
    attackRangeType: "short",
    applyWeaponSize: false,
    applyDefense: true
  });
  const finalDamage = typeof applySummonDamageMastery === "function"
    ? applySummonDamageMastery(damage)
    : Math.max(0, Math.floor(Number(damage || 0)));
  return { raw: rolled, damage: finalDamage, min, max };
}

function runHomunculusAiTick(target = currentMonster, options = {}) {
  const active = getActiveHomunculus();
  if (!active || !active.state.assistEnabled) return { attacked: false, defeated: false };
  const now = Date.now();
  const interval = Math.max(500, Number(active.definition.aiProfile?.actionIntervalMs || homunculusData?.rules?.defaultActionIntervalMs || 3000));
  if (!options.manual && now - Number(active.state.lastActionAt || 0) < interval) return { attacked: false, defeated: false };
  const skillResult = window.HomunculusSkillRuntime?.takeAction?.(active, target, options) || null;
  if (skillResult?.attacked) {
    active.state.lastActionAt = now;
    return skillResult;
  }
  if (!target || Number(target.currentHp || 0) <= 0) return { attacked: false, defeated: false };
  const result = resolveHomunculusBasicAttack(active, target);
  if (!result) return { attacked: false, defeated: false };
  const dealt = Math.max(0, Math.floor(Number(result.damage || 0)));
  target.currentHp = Math.max(0, Number(target.currentHp || 0) - dealt);
  active.state.lastActionAt = now;
  if (target === currentMonster) {
    if (typeof playMonsterHitAnimation === "function") playMonsterHitAnimation(target);
    if (typeof showDamageNumber === "function") showDamageNumber(dealt, { source: "summon" });
  }
  if (typeof addBattleLog === "function") {
    addBattleLog(`${active.definition.name}：普通攻擊對 ${String(target.name || "目標")}造成 ${dealt} 點傷害。`, "summon-damage");
  }
  if (typeof updateMonsterUI === "function") updateMonsterUI();
  return { attacked: true, defeated: Number(target.currentHp || 0) <= 0, totalDamage: dealt, basicAttack: true };
}

function summonHomunculus(definitionId, options = {}) {
  const definition = getHomunculusDefinition(definitionId);
  if (!definition) return false;
  if (!isHomunculusDefinitionAvailable(definition)) {
    if (!options.silent && typeof addBattleLog === "function") addBattleLog(`${definition.name}目前尚未解鎖。`, "summon");
    return false;
  }
  const summonSkill = typeof getSkillDataById === "function" ? getSkillDataById(243, true) : null;
  const skillLevel = Math.max(1, Number(typeof getSkillLevel === "function" ? getSkillLevel(243) : 1));
  if (!options.skipCost && summonSkill && typeof canCastSkill === "function") {
    const check = canCastSkill(summonSkill, skillLevel, ["homunculus_manager"], options);
    if (!check.ok) return typeof reportPendingRuntime === "function" ? reportPendingRuntime(summonSkill, check.reason) : false;
    if (typeof paySkillCost === "function") paySkillCost(summonSkill, skillLevel);
  }
  normalizeHomunculusPlayerData();
  player.homunculus.selectedId = definition.id;
  player.homunculus.active = true;
  player.homunculus.levelSnapshot = Math.max(1, Math.min(275, Math.floor(Number(player.baseLevel || 1))));
  player.homunculus.summonedAt = Date.now();
  player.homunculus.lastActionAt = 0;
  player.homunculus.assistEnabled = true;
  if (window.HomunculusSkillRuntime?.removeHomunculusPlayerBuffs) window.HomunculusSkillRuntime.removeHomunculusPlayerBuffs({ recalculate: false });
  if (window.HomunculusSkillRuntime?.resetState) window.HomunculusSkillRuntime.resetState(player.homunculus);
  if (typeof saveGame === "function") saveGame();
  if (typeof updatePlayerUI === "function") updatePlayerUI();
  updateHomunculusUI();
  if (typeof updateVirtualSummonUI === "function") updateVirtualSummonUI(true);
  if (!options.silent && typeof addBattleLog === "function") {
    addBattleLog(`召喚 ${definition.name}，生命體等級同步為 BaseLv ${player.homunculus.levelSnapshot}。`, "summon");
  }
  return true;
}

function restHomunculus(options = {}) {
  const active = getActiveHomunculus();
  if (!active) {
    if (!options.silent && typeof addBattleLog === "function") addBattleLog("目前沒有活動中的生命體。", "summon");
    return false;
  }
  const restSkill = typeof getSkillDataById === "function" ? getSkillDataById(244, true) : null;
  const skillLevel = Math.max(1, Number(typeof getSkillLevel === "function" ? getSkillLevel(244) : 1));
  if (!options.skipCost && restSkill && typeof canCastSkill === "function") {
    const check = canCastSkill(restSkill, skillLevel, ["homunculus_rest"], options);
    if (!check.ok) return typeof reportPendingRuntime === "function" ? reportPendingRuntime(restSkill, check.reason) : false;
    if (typeof paySkillCost === "function") paySkillCost(restSkill, skillLevel);
  }
  player.homunculus.active = false;
  player.homunculus.lastActionAt = 0;
  if (window.HomunculusSkillRuntime?.removeHomunculusPlayerBuffs) window.HomunculusSkillRuntime.removeHomunculusPlayerBuffs();
  if (window.HomunculusSkillRuntime?.resetState) window.HomunculusSkillRuntime.resetState(player.homunculus);
  if (typeof saveGame === "function") saveGame();
  updateHomunculusUI();
  if (typeof updateVirtualSummonUI === "function") updateVirtualSummonUI(true);
  if (!options.silent && typeof addBattleLog === "function") addBattleLog(`${active.definition.name}已進入安息狀態。`, "summon");
  return true;
}

function setHomunculusAssistEnabled(enabled) {
  normalizeHomunculusPlayerData();
  if (!player.homunculus.active) return false;
  player.homunculus.assistEnabled = Boolean(enabled);
  if (enabled) player.homunculus.lastActionAt = 0;
  if (typeof saveGame === "function") saveGame();
  updateHomunculusUI();
  if (typeof updateVirtualSummonUI === "function") updateVirtualSummonUI(true);
  return true;
}

function commandHomunculusAction() {
  const result = runHomunculusAiTick(currentMonster, { manual: true });
  if (result.defeated && typeof defeatMonster === "function") defeatMonster();
  return result.attacked;
}

function castHomunculusManagerSkill(skill, requestedLevel = null, options = {}) {
  const check = typeof canCastSkill === "function"
    ? canCastSkill(skill, requestedLevel, ["homunculus_manager"], { ...options, skipCost: true })
    : { ok: true };
  if (!check.ok) return typeof reportPendingRuntime === "function" ? reportPendingRuntime(skill, check.reason) : false;
  openHomunculusWindow();
  return true;
}

function castHomunculusRestSkill(skill, requestedLevel = null, options = {}) {
  const check = typeof canCastSkill === "function"
    ? canCastSkill(skill, requestedLevel, ["homunculus_rest"], options)
    : { ok: true };
  if (!check.ok) return typeof reportPendingRuntime === "function" ? reportPendingRuntime(skill, check.reason) : false;
  return restHomunculus({ ...options, skipCost: false });
}

function escapeHomunculusHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getHomunculusSkillPreview(definition, level) {
  const unlocked = getUnlockedHomunculusSkills(definition, level);
  const names = unlocked.slice(0, 4).map(row => escapeHomunculusHtml(row.name || row.code));
  const more = unlocked.length > names.length ? `，另有 ${unlocked.length - names.length} 招` : "";
  return names.length ? `${names.join("、")}${more}` : "目前沒有符合等級的技能";
}

function renderHomunculusCard(definition, currentLevel) {
  const available = isHomunculusDefinitionAvailable(definition);
  const stats = calculateHomunculusCombatStats(definition, currentLevel);
  const active = player?.homunculus?.active && player.homunculus.selectedId === definition.id;
  const selected = player?.homunculus?.selectedId === definition.id;
  const categoryLabel = definition.category === "homunculus_s" ? "人工生命體 S" : "進化型人工生命體";
  return `
    <article class="homunculus-card${available ? "" : " is-locked"}${active ? " is-active" : ""}">
      <div class="homunculus-card-head">
        <div><strong>${escapeHomunculusHtml(definition.name)}</strong><span>${escapeHomunculusHtml(categoryLabel)}</span></div>
        ${active ? '<b class="homunculus-active-badge">活動中</b>' : selected ? '<b class="homunculus-selected-badge">已選擇</b>' : ""}
      </div>
      <div class="homunculus-role">${escapeHomunculusHtml(definition.role)}・${escapeHomunculusHtml(definition.element)}・${escapeHomunculusHtml(definition.race)}</div>
      <div class="homunculus-stat-grid">
        <span>Lv <b>${stats.level}</b></span><span>ATK <b>${stats.batk + stats.attackMin}～${stats.batk + stats.attackMax}</b></span>
        <span>MATK <b>${stats.matkMin}～${stats.matkMax}</b></span><span>HIT <b>${stats.hit}</b></span>
        <span>STR <b>${stats.str}</b></span><span>AGI <b>${stats.agi}</b></span>
        <span>VIT <b>${stats.vit}</b></span><span>INT <b>${stats.int}</b></span>
        <span>DEX <b>${stats.dex}</b></span><span>LUK <b>${stats.luk}</b></span>
      </div>
      <div class="homunculus-skills"><b>自帶技能：</b>${getHomunculusSkillPreview(definition, currentLevel)}<br><small>${definition.category === "evolved" ? "進化生命體技能 AI 已啟用；不適用現行架構的技能會保留資料但不施放。" : "生命體 S 技能 AI 已啟用；不適用無 HP／死亡／座標架構的技能會保留資料但不施放。"}</small></div>
      <button type="button" ${available ? `onclick="summonHomunculus('${escapeHomunculusHtml(definition.id)}')"` : "disabled"}>${available ? (active ? "重新召喚並同步等級" : "選擇並召喚") : "四轉生命締造者開放"}</button>
    </article>`;
}

function updateHomunculusUI() {
  const body = typeof document !== "undefined" ? document.getElementById("homunculus-modal-body") : null;
  if (!body || !homunculusData?.definitions || !player) return;
  normalizeHomunculusPlayerData();
  const currentLevel = Math.max(1, Math.min(275, Math.floor(Number(player.baseLevel || 1))));
  const active = getActiveHomunculus();
  const definitions = Object.values(homunculusData.definitions);
  const evolved = definitions.filter(row => row.category === "evolved");
  const sTypes = definitions.filter(row => row.category === "homunculus_s");
  const currentHtml = active
    ? `<div class="homunculus-current"><div><strong>${escapeHomunculusHtml(active.definition.name)}</strong><span>召喚快照 Lv${active.level}・${active.state.assistEnabled ? "自動協助中" : "已停止協助"}</span></div><div class="homunculus-current-actions"><button type="button" onclick="setHomunculusAssistEnabled(${active.state.assistEnabled ? "false" : "true"})">${active.state.assistEnabled ? "停止協助" : "恢復協助"}</button><button type="button" onclick="commandHomunculusAction()">立即行動</button><button type="button" onclick="restHomunculus()">安息</button></div></div>`
    : `<div class="homunculus-current is-empty">目前沒有活動中的生命體。選擇生命體後，等級會以目前 BaseLv ${currentLevel} 建立快照。</div>`;
  body.innerHTML = `${currentHtml}
    <div class="homunculus-foundation-note">生命體使用專用欄位，可與元素精靈、FAW、ABR、仿生召喚、地獄植物及氣泡蟲同時存在。沒有 HP／SP／EXP，也不會被怪物攻擊。</div>
    <h3>進化型人工生命體</h3><div class="homunculus-card-grid">${evolved.map(row => renderHomunculusCard(row, currentLevel)).join("")}</div>
    <h3>人工生命體 S</h3><div class="homunculus-card-grid">${sTypes.map(row => renderHomunculusCard(row, currentLevel)).join("")}</div>`;
}

function openHomunculusWindow() {
  const modal = typeof document !== "undefined" ? document.getElementById("homunculus-modal") : null;
  if (!modal) return false;
  modal.classList.remove("hidden-window");
  updateHomunculusUI();
  return true;
}

function closeHomunculusWindow() {
  const modal = typeof document !== "undefined" ? document.getElementById("homunculus-modal") : null;
  if (modal) modal.classList.add("hidden-window");
}

function startHomunculusAiLoop() {
  if (homunculusAiTimer) return;
  homunculusAiTimer = setInterval(() => {
    const result = runHomunculusAiTick(currentMonster);
    if (result?.defeated && typeof defeatMonster === "function") defeatMonster();
  }, 500);
}

function stopHomunculusAiLoop() {
  if (!homunculusAiTimer) return;
  clearInterval(homunculusAiTimer);
  homunculusAiTimer = null;
}

window.HomunculusManager = {
  load: loadHomunculusData,
  getActive: getActiveHomunculus,
  getDefinition: getHomunculusDefinition,
  calculateStats: calculateHomunculusStats,
  calculateCombatStats: calculateHomunculusCombatStats,
  summon: summonHomunculus,
  rest: restHomunculus,
  tick: runHomunculusAiTick,
  open: openHomunculusWindow,
  close: closeHomunculusWindow,
  isHomunculusSUnlocked
};
