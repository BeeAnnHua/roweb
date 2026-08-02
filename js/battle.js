//=======================================
// 戰鬥系統 battle.js
//=======================================

let currentMonster = null;
try { Object.defineProperty(window, "currentMonster", { configurable: true, get: () => currentMonster, set: value => { currentMonster = value; } }); } catch (_) {}
function collectLiveCombatEnemies(options = {}) {
  const result = [], seen = new Set();
  const includeDead = options.includeDead === true;
  const append = monster => {
    if (!monster || seen.has(monster)) return;
    if (!includeDead && Number(monster.currentHp ?? monster.hp ?? 0) <= 0) return;
    if (monster._deathHandled && !includeDead) return;
    seen.add(monster); result.push(monster);
  };
  // Formal 3x3 world monsters are authoritative. When a skill supplies a
  // bounding box, use the incremental spatial hash instead of scanning the
  // whole streamed population. Legacy arrays remain developer-map fallbacks.
  let formal = [];
  if (options.bounds && typeof queryWorldMonsterEntitiesInBounds === "function") {
    formal = queryWorldMonsterEntitiesInBounds(options.bounds, { includeDead, activeOnly:options.activeOnly !== false });
  } else if (typeof getWorldMonsterTestEntities === "function") {
    formal = getWorldMonsterTestEntities({ includeDead, activeOnly:options.activeOnly !== false }) || [];
  }
  formal.forEach(append);
  if (Array.isArray(window.activeMonsters)) window.activeMonsters.forEach(append);
  if (Array.isArray(window.mapMonsters)) window.mapMonsters.forEach(append);
  append(currentMonster);
  return result;
}
window.collectLiveCombatEnemies = collectLiveCombatEnemies;
window.getCombatEnemyCandidates = collectLiveCombatEnemies;
window.getCombatGroundCandidates = collectLiveCombatEnemies;
window.getSkillTargetCandidates = collectLiveCombatEnemies;
let autoBattleTimer = null;
let autoBattleRunning = false;
let autoBattleWatchdogTimer = null;
let autoBattleLastTickAt = 0;
let autoBattleNextDueAt = 0;
let autoBattleWakeReason = "";
let autoBattleScheduleGeneration = 0;
let autoBattleLastControllerErrorAt = 0;
let autoBattleMutationBlockedSince = 0;
let manualAttackTimer = null;
let manualAttackRunning = false;
let manualAttackTarget = null;
let spawnTimer = null;

// 0.9.82FA: Auto Battle Controller v1.1 keeps the event-driven scheduler. The old fixed 250ms poll imposed an
// accidental 4 actions/second ceiling. The scheduler now sleeps until the
// latest still-blocking Renewal timing gate, with a small browser-safe timer floor.
const AUTO_BATTLE_MIN_SCHEDULE_MS = 8;
const AUTO_BATTLE_MAX_IDLE_MS = 250;
const RESPAWN_DELAY = 1500;        // 僅供 legacy 單怪地圖；正式多怪地圖死亡後立即換目標
let lastPlayerAttackAt = 0;

// ===== 0.9.82EH：rAthena Renewal ASPD / action-lock 唯一公式 =====
// RA internal values: amotion = 2000 - ASPD * 10, adelay = amotion * 2.
// RO_WEB deliberately uses the approved global cap 193 for every implemented job.
const RO_WEB_MAX_ASPD = 193;
const RO_WEB_MIN_ATTACK_MOTION_MS = Math.max(1, 2000 - RO_WEB_MAX_ASPD * 10); // 70ms
function getPlayerAspdValue() {
  if (typeof recalculatePlayerStats === "function") recalculatePlayerStats();
  return Math.max(1, Math.min(RO_WEB_MAX_ASPD, Number(player?.aspd || 150)));
}
function getPlayerAttackMotionMs() {
  return Math.max(RO_WEB_MIN_ATTACK_MOTION_MS, Math.round(2000 - getPlayerAspdValue() * 10));
}
function getPlayerAttackDelayMs() {
  return Math.max(RO_WEB_MIN_ATTACK_MOTION_MS * 2, getPlayerAttackMotionMs() * 2);
}
// 0.9.82FJ：普通攻擊視覺必須在下一次 ASPD 攻擊前完整播完。
// 慢速角色保留原本完整動作手感；高 ASPD 時將全部 Attack Atlas 幀壓縮到實際攻擊週期內，
// 避免每次新攻擊都把動畫重設回第 1 幀。
function getPlayerAttackVisualDurationMs() {
  const attackDelay = Math.max(RO_WEB_MIN_ATTACK_MOTION_MS * 2, Number(getPlayerAttackDelayMs() || 360));
  return Math.max(136, Math.min(720, Math.round(attackDelay * 0.98)));
}
function getPlayerAttackEffectDurationMs() {
  return Math.max(82, Math.min(280, Math.round(getPlayerAttackVisualDurationMs() * 0.78)));
}
function getPlayerSkillActionLockMs() {
  // unit_set_attackdelay(DELAY_EVENT_CASTBEGIN_*): amotion + minimum reachable amotion.
  return Math.max(RO_WEB_MIN_ATTACK_MOTION_MS * 2, getPlayerAttackMotionMs() + RO_WEB_MIN_ATTACK_MOTION_MS);
}
window.RO_WEB_MAX_ASPD = RO_WEB_MAX_ASPD;
window.getPlayerAspdValue = getPlayerAspdValue;
window.getPlayerAttackMotionMs = getPlayerAttackMotionMs;
window.getPlayerAttackDelayMs = getPlayerAttackDelayMs;
window.getPlayerAttackVisualDurationMs = getPlayerAttackVisualDurationMs;
window.getPlayerAttackEffectDurationMs = getPlayerAttackEffectDurationMs;
window.getPlayerSkillActionLockMs = getPlayerSkillActionLockMs;

function canPlayerAttackNow() {
  const active = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
  if (Number(active.blocksNormalAttack || 0) > 0) return false;
  const actionLockUntil = Number(player?.skillTimingState?.actionLockUntil || 0);
  if (actionLockUntil > Date.now()) return false;
  return Date.now() - lastPlayerAttackAt >= getPlayerAttackDelayMs();
}

function getPlayerAttackRemainingMs() {
  return Math.max(0, getPlayerAttackDelayMs() - (Date.now() - lastPlayerAttackAt));
}

function markPlayerAttackUsed() {
  lastPlayerAttackAt = Date.now();
}

function clearBattleTimersAndMonster(options = {}) {
  autoBattleRunning = false;
  stopAutoBattleWatchdog();
  autoBattleNextDueAt = 0;
  updateAutoBattleQuickToggleState();
  manualAttackRunning = false;
  manualAttackTarget = null;
  if (manualAttackTimer) {
    clearTimeout(manualAttackTimer);
    manualAttackTimer = null;
  }
  if (autoBattleTimer) {
    clearTimeout(autoBattleTimer);
    autoBattleTimer = null;
  }
  if (spawnTimer) {
    clearTimeout(spawnTimer);
    spawnTimer = null;
  }
  if (options.clearMonster !== false) {
    currentMonster = null;
  }
  if (typeof resetAutoBattleController === "function") resetAutoBattleController({ running: false, keepTarget: options.clearMonster === false, reason: "clear_timers" });
  if (player) player.state = "Idle";
}


function getAutoBattleTimingCandidates(now = Date.now()) {
  const waits = [];
  const castState = typeof getRuntimeSkillCastState === "function" ? getRuntimeSkillCastState() : null;
  if (castState?.active !== false && Number(castState?.endsAt || 0) > now) waits.push(Number(castState.endsAt) - now);
  const timingState = player?.skillTimingState;
  if (Number(timingState?.globalDelayUntil || 0) > now) waits.push(Number(timingState.globalDelayUntil) - now);
  if (Number(timingState?.actionLockUntil || 0) > now) waits.push(Number(timingState.actionLockUntil) - now);

  const validTarget = typeof isAutoBattleTargetValid === "function" ? isAutoBattleTargetValid(currentMonster) : !!currentMonster;
  const normalEnabled = player?.autoCombat?.normalAttack?.enabled !== false;
  const attackChoice = validTarget && typeof getAutoAttackSkill === "function" ? getAutoAttackSkill(currentMonster) : null;

  if (attackChoice?.blocked) {
    const block = attackChoice.delayBlock;
    if (Number(block?.remainingMs || 0) > 0 && (!normalEnabled || block.type !== "cooldown")) {
      waits.push(Number(block.remainingMs));
    }
  }

  const willUseNormal = normalEnabled && (!attackChoice || (attackChoice.blocked && attackChoice.delayBlock?.type === "cooldown"));
  if (willUseNormal && typeof getPlayerAttackRemainingMs === "function") {
    const remaining = Number(getPlayerAttackRemainingMs() || 0);
    if (remaining > 0) waits.push(remaining);
  }
  return waits.filter(value => Number.isFinite(value) && value > 0);
}


function getAutoBattleUtilityWakeDelayMs(now = Date.now()) {
  if (!player || player.currentCity) return Number.POSITIVE_INFINITY;
  const teleport = player.autoCombat?.teleport || {};
  let delay = Number.POSITIVE_INFINITY;

  // Boss / MVP may enter or start attacking while the player is locked in a long cast.
  // Keep a lightweight threat poll so "encounter = fly" never waits for the current target/cast.
  if (teleport.avoidBoss === true || teleport.avoidMvp === true) delay = Math.min(delay, 80);

  // Fixed flight should wake exactly at its next due time even when Renewal timing gates
  // would otherwise put the controller to sleep until CAST_COMPLETE / action-lock end.
  if (teleport.fixedIntervalEnabled === true) {
    const intervalMs = Math.max(1000, Math.min(3600000, Number(teleport.fixedIntervalSeconds || 10) * 1000));
    const last = Number(window.AUTO_BATTLE_CONTROLLER?.lastFixedIntervalFlyAt || now);
    delay = Math.min(delay, Math.max(AUTO_BATTLE_MIN_SCHEDULE_MS, intervalMs - Math.max(0, now - last)));
  }
  return delay;
}

function getAutoBattleNextDelayMs(now = Date.now()) {
  if (!autoBattleRunning) return AUTO_BATTLE_MAX_IDLE_MS;
  const waits = getAutoBattleTimingCandidates(now);
  const utilityWake = getAutoBattleUtilityWakeDelayMs(now);
  const capForUtility = value => {
    const base = Math.max(AUTO_BATTLE_MIN_SCHEDULE_MS, Number(value || AUTO_BATTLE_MIN_SCHEDULE_MS));
    return Number.isFinite(utilityWake) ? Math.min(base, Math.max(AUTO_BATTLE_MIN_SCHEDULE_MS, utilityWake)) : base;
  };
  const validTarget = typeof isAutoBattleTargetValid === "function" ? isAutoBattleTargetValid(currentMonster) : !!currentMonster;
  if (!validTarget) return Math.min(AUTO_BATTLE_MAX_IDLE_MS, capForUtility(Math.max(32, waits.length ? Math.min(...waits) : 80)));
  if (player?.state === "Approaching" || player?.state === "Moving" || player?.state === "Move") return capForUtility(16);

  if (!waits.length && typeof getAutoCombatAttackAction === "function") {
    const action = getAutoCombatAttackAction(currentMonster);
    if (action?.action === "utility") return capForUtility(80);
  }

  const desired = waits.length ? Math.max(...waits) : AUTO_BATTLE_MIN_SCHEDULE_MS;
  return Math.max(AUTO_BATTLE_MIN_SCHEDULE_MS, Math.min(AUTO_BATTLE_MAX_IDLE_MS, Math.ceil(capForUtility(desired))));
}


function runAutoBattleControllerTick() {
  autoBattleLastTickAt = Date.now();
  if (!autoBattleRunning || !player || player.currentCity || Number(player.hp || 0) <= 0) return false;
  if (window.RO_WEB_PLAYER_BUILD_MUTATION === true) return true;

  const utility = typeof runAutoCombatUtilityTick === "function" ? runAutoCombatUtilityTick() : { action: "none" };
  if (utility?.action === "utility") {
    if (typeof updatePlayerUI === "function") updatePlayerUI();
    return true;
  }

  let target = typeof acquireAutoBattleTarget === "function"
    ? acquireAutoBattleTarget({ reason: "controller_tick" })
    : currentMonster;
  if (!target) {
    if (typeof setAutoBattleControllerState === "function") setAutoBattleControllerState(AUTO_BATTLE_STATES.SEARCHING, { reason: "no_target" });
    const teleported = typeof maybeAutoTeleportWhenNoTarget === "function" ? maybeAutoTeleportWhenNoTarget() : false;
    if (teleported && typeof acquireAutoBattleTarget === "function") target = acquireAutoBattleTarget({ reason: "post_teleport" });
    if (!target) return true;
  }

  if (typeof maybeAutoEscapeFromTarget === "function" && maybeAutoEscapeFromTarget(target)) return true;

  autoAttackMonster({ utilityHandled: true, controller: true });
  return true;
}

function scheduleAutoBattleTick(delayMs = null) {
  if (!autoBattleRunning) return false;
  const delay = delayMs === null ? getAutoBattleNextDelayMs() : Math.max(AUTO_BATTLE_MIN_SCHEDULE_MS, Number(delayMs || 0));
  if (autoBattleTimer) clearTimeout(autoBattleTimer);
  const generation = ++autoBattleScheduleGeneration;
  autoBattleNextDueAt = Date.now() + delay;
  autoBattleTimer = setTimeout(() => {
    if (generation !== autoBattleScheduleGeneration) return;
    autoBattleTimer = null;
    autoBattleNextDueAt = 0;
    if (!autoBattleRunning) return;
    try {
      runAutoBattleControllerTick();
    } catch (error) {
      autoBattleLastControllerErrorAt = Date.now();
      console.error('[AutoBattle 0.9.82II] controller tick recovered after error', error);
    } finally {
      // Always restore the scheduler. A status-window DOM rebuild or any one-off
      // runtime exception must not permanently freeze auto battle until retoggled.
      if (autoBattleRunning && generation === autoBattleScheduleGeneration) {
        scheduleAutoBattleTick(getAutoBattleNextDelayMs());
      }
    }
  }, delay);
  return true;
}

// 0.9.82ID：素質欄等大型 UI 建立 DOM 時，瀏覽器可能延遲或遺失原本的戰鬥 timer。
// Watchdog 只在掛機中啟用；偵測排程逾期後立即補上一個 tick，不改變目標、技能輪替或 Renewal 時序。
function stopAutoBattleWatchdog() {
  if (autoBattleWatchdogTimer) {
    clearInterval(autoBattleWatchdogTimer);
    autoBattleWatchdogTimer = null;
  }
}

function startAutoBattleWatchdog() {
  stopAutoBattleWatchdog();
  autoBattleLastTickAt = Date.now();
  autoBattleWatchdogTimer = setInterval(() => {
    if (!autoBattleRunning) {
      stopAutoBattleWatchdog();
      return;
    }
    if (!player || player.currentCity || Number(player.hp || 0) <= 0) return;
    const now = Date.now();
    const dueExpired = !autoBattleTimer || (autoBattleNextDueAt > 0 && now > autoBattleNextDueAt + 420);
    const tickStale = now - Number(autoBattleLastTickAt || 0) > 900;
    if (window.RO_WEB_PLAYER_BUILD_MUTATION === true) {
      if (!autoBattleMutationBlockedSince) autoBattleMutationBlockedSince = now;
      return;
    }
    autoBattleMutationBlockedSince = 0;
    if (dueExpired || tickStale) {
      autoBattleWakeReason = "watchdog";
      scheduleAutoBattleTick(AUTO_BATTLE_MIN_SCHEDULE_MS);
    }
  }, 250);
}

function wakeAutoBattleScheduler(reason = "external_ui") {
  if (!autoBattleRunning || !player || player.currentCity || Number(player.hp || 0) <= 0) return false;
  autoBattleWakeReason = String(reason || "external_ui");
  autoBattleLastTickAt = Date.now();
  return scheduleAutoBattleTick(AUTO_BATTLE_MIN_SCHEDULE_MS);
}

function recoverAutoBattleScheduler(reason = "recovery") {
  if (!autoBattleRunning || !player || player.currentCity || Number(player.hp || 0) <= 0) return false;
  autoBattleWakeReason = String(reason || "recovery");
  // A generation bump invalidates a stale callback left behind by a large DOM rebuild.
  if (autoBattleTimer) { clearTimeout(autoBattleTimer); autoBattleTimer = null; }
  autoBattleNextDueAt = 0;
  autoBattleLastTickAt = Date.now();
  scheduleAutoBattleTick(AUTO_BATTLE_MIN_SCHEDULE_MS);
  startAutoBattleWatchdog();
  return true;
}

function isAutoBattleRunning() {
  return autoBattleRunning === true;
}

function updateAutoBattleQuickToggleState() {
  const button = document.getElementById("autoBattleQuickToggle");
  if (!button) return false;
  const active = autoBattleRunning === true || window.RO_WEB_AUTO_BATTLE_RESUME_PENDING === true;
  button.classList.toggle("is-active", active);
  button.setAttribute("aria-pressed", active ? "true" : "false");
  button.title = active ? "停止自動掛機" : "開始自動掛機";
  const label = button.querySelector(".auto-battle-label");
  if (label) label.textContent = active ? "掛機中" : "掛機";
  else button.textContent = active ? "掛機中" : "掛機";
  return active;
}

function toggleAutoBattleQuick() {
  if (window.RO_WEB_AUTO_BATTLE_RESUME_PENDING === true) {
    window.RO_WEB_AUTO_BATTLE_RESUME_PENDING = false;
    stopAutoBattle({ silent: true });
    if (typeof addBattleLog === "function") addBattleLog("已取消復活後繼續掛機。");
  } else if (autoBattleRunning) stopAutoBattle();
  else startAutoBattle();
  updateAutoBattleQuickToggleState();
  return autoBattleRunning === true || window.RO_WEB_AUTO_BATTLE_RESUME_PENDING === true;
}
window.updateAutoBattleQuickToggleState = updateAutoBattleQuickToggleState;
window.toggleAutoBattleQuick = toggleAutoBattleQuick;
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateAutoBattleQuickToggleState, { once: true });
  } else {
    updateAutoBattleQuickToggleState();
  }
}
window.getAutoBattleTimingCandidates = getAutoBattleTimingCandidates;
window.getAutoBattleNextDelayMs = getAutoBattleNextDelayMs;
window.scheduleAutoBattleTick = scheduleAutoBattleTick;
window.getAutoBattleUtilityWakeDelayMs = getAutoBattleUtilityWakeDelayMs;
window.getAutoBattleNextDelayMs = getAutoBattleNextDelayMs;
window.runAutoBattleControllerTick = runAutoBattleControllerTick;
window.isAutoBattleRunning = isAutoBattleRunning;
window.wakeAutoBattleScheduler = wakeAutoBattleScheduler;
window.recoverAutoBattleScheduler = recoverAutoBattleScheduler;
window.startAutoBattleWatchdog = startAutoBattleWatchdog;
window.stopAutoBattleWatchdog = stopAutoBattleWatchdog;

// ===== 0.9.82EM：左鍵直接鎖定並連續普通攻擊 =====
// 手動點怪與自動掛機分離：手動模式只使用普通攻擊，不會自動施放掛機技能。
function getManualAttackTimingCandidates(now = Date.now()) {
  const waits = [];
  const castState = typeof getRuntimeSkillCastState === "function" ? getRuntimeSkillCastState() : null;
  if (castState?.active !== false && Number(castState?.endsAt || 0) > now) waits.push(Number(castState.endsAt) - now);
  const timingState = player?.skillTimingState;
  if (Number(timingState?.globalDelayUntil || 0) > now) waits.push(Number(timingState.globalDelayUntil) - now);
  if (Number(timingState?.actionLockUntil || 0) > now) waits.push(Number(timingState.actionLockUntil) - now);
  if (typeof getPlayerAttackRemainingMs === "function") {
    const remaining = Number(getPlayerAttackRemainingMs() || 0);
    if (remaining > 0) waits.push(remaining);
  }
  return waits.filter(value => Number.isFinite(value) && value > 0);
}

function isManualCombatTargetValid(monster) {
  if (!monster || monster._deathHandled || monster._defeatResolutionQueued) return false;
  if (Number(monster.currentHp ?? monster.hp ?? 0) <= 0) return false;
  if (!player || player.currentCity || Number(player.hp || 0) <= 0) return false;
  return true;
}

function getManualAttackNextDelayMs(now = Date.now()) {
  if (!manualAttackRunning) return AUTO_BATTLE_MAX_IDLE_MS;
  if (!isManualCombatTargetValid(manualAttackTarget) || currentMonster !== manualAttackTarget) return AUTO_BATTLE_MIN_SCHEDULE_MS;
  if (["Approaching", "Moving", "Move"].includes(String(player?.state || ""))) return 16;
  const waits = getManualAttackTimingCandidates(now);
  return Math.max(AUTO_BATTLE_MIN_SCHEDULE_MS, Math.min(AUTO_BATTLE_MAX_IDLE_MS, Math.ceil(waits.length ? Math.max(...waits) : 16)));
}

function stopManualMonsterAttack(options = {}) {
  const target = manualAttackTarget;
  manualAttackRunning = false;
  manualAttackTarget = null;
  if (manualAttackTimer) {
    clearTimeout(manualAttackTimer);
    manualAttackTimer = null;
  }
  if (options.clearTarget && currentMonster === target) {
    currentMonster = null;
    document.querySelectorAll(".world-monster-entity.is-selected").forEach(el => el.classList.remove("is-selected"));
    if (typeof updateMonsterUI === "function") updateMonsterUI();
  }
  if (player && !autoBattleRunning && ["Attacking", "Approaching"].includes(String(player.state || ""))) player.state = "Idle";
  return true;
}

function scheduleManualMonsterAttack(delayMs = null) {
  if (!manualAttackRunning || autoBattleRunning) return false;
  const delay = delayMs === null ? getManualAttackNextDelayMs() : Math.max(AUTO_BATTLE_MIN_SCHEDULE_MS, Number(delayMs || 0));
  if (manualAttackTimer) clearTimeout(manualAttackTimer);
  manualAttackTimer = setTimeout(() => {
    manualAttackTimer = null;
    if (!manualAttackRunning || autoBattleRunning) return;
    if (!isManualCombatTargetValid(manualAttackTarget) || currentMonster !== manualAttackTarget) {
      stopManualMonsterAttack({ clearTarget: false, silent: true });
      return;
    }
    autoAttackMonster({ manual: true });
    if (manualAttackRunning && currentMonster === manualAttackTarget && Number(manualAttackTarget.currentHp || 0) > 0) {
      scheduleManualMonsterAttack(getManualAttackNextDelayMs());
    } else {
      stopManualMonsterAttack({ clearTarget: false, silent: true });
    }
  }, delay);
  return true;
}

function startManualMonsterAttack(monster = currentMonster, options = {}) {
  if (!isManualCombatTargetValid(monster)) return false;
  if (autoBattleRunning) {
    if (typeof forceAutoBattleTarget === "function") forceAutoBattleTarget(monster, { announce: false, manual: true, priorityMs: 12000 });
    else {
      currentMonster = monster;
      if (player) player.state = "Attacking";
      if (typeof updateMonsterUI === "function") updateMonsterUI();
    }
    scheduleAutoBattleTick(AUTO_BATTLE_MIN_SCHEDULE_MS);
    return true;
  }
  manualAttackTarget = monster;
  manualAttackRunning = true;
  currentMonster = monster;
  if (player) player.state = "Attacking";
  if (typeof updateMonsterUI === "function") updateMonsterUI();
  scheduleManualMonsterAttack(options.immediate === false ? 16 : AUTO_BATTLE_MIN_SCHEDULE_MS);
  return true;
}

function requestManualRetaliationAgainstMonster(monster, options = {}) {
  if (!isManualCombatTargetValid(monster) || autoBattleRunning) return false;

  // 玩家已經手動鎖定另一個有效目標時，主動怪不得搶走目標。
  if (manualAttackRunning && isManualCombatTargetValid(manualAttackTarget) && manualAttackTarget !== monster) return false;
  if (!manualAttackRunning && isManualCombatTargetValid(currentMonster) && currentMonster !== monster) return false;

  const changed = currentMonster !== monster || manualAttackTarget !== monster || manualAttackRunning !== true;
  if (monster._worldTestEntity && typeof selectWorldMonsterTestTarget === "function") {
    selectWorldMonsterTestTarget(monster, { announce: false, attacking: true });
  } else {
    currentMonster = monster;
    if (player) player.state = "Attacking";
    if (typeof updateMonsterUI === "function") updateMonsterUI();
  }
  const started = startManualMonsterAttack(monster, { immediate: true, retaliation: true });
  if (started && changed && options.announce !== false && typeof addBattleLog === "function") {
    addBattleLog(`遭到 ${monster.name || "怪物"} 攻擊，開始反擊。`);
  }
  return started;
}

window.isManualCombatTargetValid = isManualCombatTargetValid;
window.getManualAttackTimingCandidates = getManualAttackTimingCandidates;
window.getManualAttackNextDelayMs = getManualAttackNextDelayMs;
window.scheduleManualMonsterAttack = scheduleManualMonsterAttack;
window.startManualMonsterAttack = startManualMonsterAttack;
window.stopManualMonsterAttack = stopManualMonsterAttack;
window.requestManualRetaliationAgainstMonster = requestManualRetaliationAgainstMonster;
window.isManualMonsterAttackRunning = () => manualAttackRunning === true;
window.getManualMonsterAttackTarget = () => manualAttackTarget;

// 開始自動戰鬥
function startAutoBattle() {
  window.RO_WEB_AUTO_BATTLE_RESUME_PENDING = false;
  stopManualMonsterAttack({ clearTarget: false, silent: true });
  if (autoBattleRunning) {
    addBattleLog("自動戰鬥已經在進行中。");
    return;
  }

  if (player?.currentCity) {
    addBattleLog("目前位於城鎮，請先前往練功地圖再開始戰鬥。");
    return;
  }

  if (!currentMap) {
    addBattleLog("目前沒有地圖資料，無法開始戰鬥。");
    return;
  }

  if (player.hp <= 0) {
    if (window.DeathRevivalRuntime?.recoverPersistedDeathState) {
      window.DeathRevivalRuntime.recoverPersistedDeathState();
    }
    addBattleLog("角色已死亡，請先選擇原地復活或回到村莊。");
    return;
  }

  // 開始戰鬥前先同步一次 Auto Battle Controller v1 設定
  if (typeof syncAutoCombatSettingsFromUI === "function") {
    syncAutoCombatSettingsFromUI({
      silent: true,
      save: true
    });
  }

  autoBattleRunning = true;
  updateAutoBattleQuickToggleState();
  if (typeof resetAutoBattleController === "function") resetAutoBattleController({ running: true, keepTarget: true, reason: "start" });
  player.state = "Searching";
  addBattleLog("開始自動戰鬥。");
  if (typeof canAutoBattleSearchForConfiguredTargets === "function" && !canAutoBattleSearchForConfiguredTargets()) {
    addBattleLog("目前設定為只攻擊勾選怪物，但尚未勾選任何目標；角色會原地等待。");
  }

  spawnMonsterFromCurrentMap();
  if (typeof acquireAutoBattleTarget === "function") acquireAutoBattleTarget({ reason: "start", announce: false });
  scheduleAutoBattleTick(AUTO_BATTLE_MIN_SCHEDULE_MS);
  startAutoBattleWatchdog();
}

// 停止自動戰鬥
function stopAutoBattle(options = {}) {
  if (options.keepResumePending !== true) window.RO_WEB_AUTO_BATTLE_RESUME_PENDING = false;
  const wasRunning = Boolean(autoBattleRunning || autoBattleTimer || spawnTimer);
  autoBattleRunning = false;
  autoBattleScheduleGeneration += 1;
  updateAutoBattleQuickToggleState();
  stopAutoBattleWatchdog();
  autoBattleNextDueAt = 0;

  if (autoBattleTimer) {
    clearTimeout(autoBattleTimer);
    autoBattleTimer = null;
  }

  if (spawnTimer) {
    clearTimeout(spawnTimer);
    spawnTimer = null;
  }

  if (typeof resetAutoBattleController === "function") resetAutoBattleController({ running: false, keepTarget: true, reason: "stop" });
  if (player) player.state = "Idle";

  if (wasRunning && !options.silent) {
    addBattleLog("已停止自動戰鬥。");
  }
  if (wasRunning && typeof isStatusWindowVisible === "function" && isStatusWindowVisible() && typeof requestStatusUIUpdate === "function") {
    requestStatusUIUpdate({ force: true, reason: "auto_battle_stopped" });
  }
}

// 從目前地圖生成怪物
function spawnMonsterFromCurrentMap() {
  if (typeof isAutoBattleTargetValid === "function" ? isAutoBattleTargetValid(currentMonster) : currentMonster) return;

  if (!currentMap) {
    addBattleLog("目前沒有地圖資料，無法生怪。");
    return;
  }

  if (!currentMap.monsters || currentMap.monsters.length === 0) {
    addBattleLog("這張地圖沒有怪物。");
    return;
  }

  // V0.9.82EM: RA 模式區域怪物串流；戰鬥鎖定玩家附近最近的存活實體。
  if (currentMap.monsterVisualTest && typeof getNearestWorldMonsterTestTarget === "function") {
    const target = typeof acquireAutoBattleTarget === "function"
      ? acquireAutoBattleTarget({ reason: "spawn_scan" })
      : getNearestWorldMonsterTestTarget();
    if (!target) {
      if (player) player.state = "Searching";
      return;
    }
    if (typeof applyAutoBattleTarget !== "function") {
      if (typeof selectWorldMonsterTestTarget === "function") selectWorldMonsterTestTarget(target, { announce: false });
      else currentMonster = target;
    }
    if (typeof resetAutoNoTargetTimer === "function") resetAutoNoTargetTimer();
    if (player) player.state = "Attacking";
    updateMonsterUI();
    return;
  }

  const eligibleMonsterIds = currentMap.monsters.filter(id => {
    if (typeof isAutoBattleMonsterAllowed !== "function") return true;
    const source = monsters.find(monster => Number(monster.id) === Number(id)) || { id };
    return isAutoBattleMonsterAllowed(source);
  });
  if (!eligibleMonsterIds.length) {
    if (player) player.state = "Searching";
    return;
  }

  let monsterId;
  if (Array.isArray(currentMap.monsterTestSequence) && currentMap.monsterTestSequence.length) {
    const sequence = currentMap.monsterTestSequence.filter(id => eligibleMonsterIds.some(value => Number(value) === Number(id)));
    if (!sequence.length) return;
    currentMap._monsterTestCursor = Number(currentMap._monsterTestCursor || 0);
    monsterId = sequence[currentMap._monsterTestCursor % sequence.length];
    currentMap._monsterTestCursor += 1;
  } else {
    monsterId = getRandomFromArray(eligibleMonsterIds);
  }
  const monsterData = monsters.find(monster => monster.id === monsterId);

  if (!monsterData) {
    addBattleLog("找不到怪物資料：" + monsterId);
    return;
  }

  currentMonster = {
    ...monsterData,
    currentHp: monsterData.maxHp || monsterData.hp
  };

  if (typeof assignMonsterSpawnPosition === "function") assignMonsterSpawnPosition(currentMonster);
  autoNoTargetSince = null;

  if (player) player.state = "Attacking";
  updateMonsterUI();
  if (typeof syncROStudioMonsterAtlas === "function") syncROStudioMonsterAtlas(currentMonster);
  addBattleLog("出現了 " + currentMonster.name + "！");
}

// 玩家自動攻擊怪物
function autoAttackMonster(options = {}) {
  if (!options.manual) {
    if (!options.utilityHandled && typeof runAutoCombatUtilityTick === "function") {
      const utility = runAutoCombatUtilityTick();
      if (utility?.action === "utility") {
        if (typeof updatePlayerUI === "function") updatePlayerUI();
        return;
      }
    }
    if (typeof isAutoBattleTargetValid === "function" && !isAutoBattleTargetValid(currentMonster)) {
      if (typeof acquireAutoBattleTarget === "function") acquireAutoBattleTarget({ reason: "attack_entry" });
    }
  }
  if (!currentMonster) {
    if (!options.manual && typeof setAutoBattleControllerState === "function") setAutoBattleControllerState(AUTO_BATTLE_STATES.SEARCHING, { reason: "attack_no_target" });
    return;
  }
  if (typeof runVirtualSummonAssistTick === "function") {
    const summonResult = runVirtualSummonAssistTick(currentMonster);
    if (summonResult?.defeated) { defeatMonster(); return; }
  }
  if (typeof isRuntimeSkillCasting === "function" && isRuntimeSkillCasting()) return;

  // v0.9.72：先決定本 tick 要用普攻還是攻擊技能，再用對應射程判定。
  // 這樣投擲長矛 / 弓類技能不會被普攻 1 Cell 射程綁死。
  let autoAction = options.manual
    ? { action: "normal", source: "manual_click" }
    : (typeof getAutoCombatAttackAction === "function"
      ? getAutoCombatAttackAction(currentMonster)
      : (typeof runAutoCombatTick === "function" ? runAutoCombatTick(currentMonster, { skipUtility: true }) : { action: "normal" }));

  if (autoAction && autoAction.action === "utility") {
    if (!options.manual && typeof setAutoBattleControllerState === "function") setAutoBattleControllerState(AUTO_BATTLE_STATES.UTILITY, { action: "wait", reason: autoAction.waitForSkill ? "wait_for_skill" : "utility" });
    updatePlayerUI();
    return;
  }

  const autoActionIsSkill = autoAction && ["attackSkill", "prerequisiteSkill"].includes(autoAction.action);
  const autoSkillProfile = autoActionIsSkill && typeof getSkillRuntimeProfile === "function"
    ? (getSkillRuntimeProfile(autoAction.skill) || {}) : null;
  const autoSkillNeedsPrimaryRange = autoActionIsSkill && typeof runtimeSkillRequiresPrimaryTargetRange === "function"
    ? runtimeSkillRequiresPrimaryTargetRange(autoAction.skill, autoSkillProfile || {}, autoAction.level)
    : true;
  const intendedRange = autoActionIsSkill
    ? (autoSkillNeedsPrimaryRange && typeof getSkillRangePx === "function" ? getSkillRangePx(autoAction.skill, autoAction.level) : Number.POSITIVE_INFINITY)
    : (typeof getPlayerNormalAttackRange === "function" ? getPlayerNormalAttackRange() : null);
  // 0.9.82FM：自動近戰追逐移動怪物時給予一小段命中容差，避免雙方每幀同向移動而永遠差一點打不到。
  // 手動點擊與遠距離技能仍嚴格使用原始 RA 射程。
  const effectiveRange = !options.manual && typeof getAutoBattleEffectiveAttackRange === "function"
    ? getAutoBattleEffectiveAttackRange(currentMonster, intendedRange)
    : intendedRange;

  if ((!autoActionIsSkill || autoSkillNeedsPrimaryRange) && typeof canAttackMonsterByRange === "function" && !canAttackMonsterByRange(currentMonster, effectiveRange)) {
    if (!options.manual && typeof setAutoBattleControllerState === "function") setAutoBattleControllerState(AUTO_BATTLE_STATES.APPROACHING, { action: autoAction?.action || "normal", reason: "out_of_range" });
    if (typeof movePlayerTowardMonster === "function") movePlayerTowardMonster(currentMonster, effectiveRange);
    updateMonsterUI();
    return;
  }

  // V0.9.79E：進入攻擊距離後立刻停步，避免等 ASPD 期間仍播放走路動畫。
  if (typeof stopPlayerCombatMovementForAttack === "function") stopPlayerCombatMovementForAttack(currentMonster);
  if (!options.manual && typeof setAutoBattleControllerState === "function") setAutoBattleControllerState(AUTO_BATTLE_STATES.COMBAT, { action: autoAction?.action || "normal", reason: "in_range" });

  if (autoAction && autoAction.action === "prerequisiteSkill") {
    const prerequisiteAction = autoAction;
    const recheck = typeof canCastSkill === "function" ? canCastSkill(prerequisiteAction.skill, prerequisiteAction.level) : { ok: true, level: prerequisiteAction.level };
    if (!recheck.ok) {
      if (typeof handleAutoSkillResourceBlock === "function") handleAutoSkillResourceBlock(prerequisiteAction.skill, recheck, { silent: true });
      return;
    }
    const executePrerequisite = () => {
      const used = typeof castAutoSkillPrerequisite === "function" ? castAutoSkillPrerequisite(prerequisiteAction) : false;
      if (used && currentMonster && typeof monsterAttackPlayer === "function") monsterAttackPlayer();
      return used;
    };
    const timing = typeof getRuntimeAdjustedCastTime === "function" ? getRuntimeAdjustedCastTime(prerequisiteAction.skill, prerequisiteAction.level) : { totalMs: 0 };
    if (Number(timing?.totalMs || 0) > 0 && typeof beginRuntimeSkillCast === "function") {
      beginRuntimeSkillCast(prerequisiteAction.skill, prerequisiteAction.level, executePrerequisite);
      return;
    }
    executePrerequisite();
    return;
  }

  if (autoAction && autoAction.action === "attackSkill") {
    const recheck = typeof canCastSkill === "function" ? canCastSkill(autoAction.skill, autoAction.level) : { ok: true, level: autoAction.level };
    if (!recheck.ok) {
      if (typeof handleAutoSkillResourceBlock === "function" && handleAutoSkillResourceBlock(autoAction.skill,recheck)) {
        autoAction={action:"normal",fallbackFromResource:true};
      } else return;
    }
    if (autoAction.action === "attackSkill") {
      const autoCastTiming = typeof getRuntimeAdjustedCastTime === "function" ? getRuntimeAdjustedCastTime(autoAction.skill, autoAction.level) : { totalMs: 0 };
      if (Number(autoCastTiming?.totalMs || 0) > 0 && typeof beginRuntimeSkillCast === "function" && typeof quickSlotCastSkill === "function") {
        beginRuntimeSkillCast(autoAction.skill, autoAction.level, () => {
          const result = quickSlotCastSkill(autoAction.skill.id, { skipRuntimeCast: true, source: "auto_battle" });
          if (typeof commitAutoAttackSkillRotation === "function") commitAutoAttackSkillRotation(autoAction.slotIndex);
          return result;
        });
        return;
      }
      const autoProfile=typeof getSkillRuntimeProfile==="function"?getSkillRuntimeProfile(autoAction.skill):null;
      const used=autoProfile?.handler==="combo_sequence"
        ? castComboSequenceSkill(autoAction.skill,autoAction.level,{source:"auto_battle"})
        : castAttackSkill(autoAction.skill, autoAction.level, { source: "auto_battle" });
      if (used) {
        if (typeof commitAutoAttackSkillRotation === "function") commitAutoAttackSkillRotation(autoAction.slotIndex);
        if (currentMonster.currentHp <= 0) { defeatMonster(); return; }
        monsterAttackPlayer(); return;
      }
      // 最後執行階段失敗時（姿態、瞬間目標變化或 Runtime 條件），
      // 輪到下一格並回退普攻，避免近戰角色原地反覆重試同一招而看起來卡頓。
      if (typeof commitAutoAttackSkillRotation === "function") commitAutoAttackSkillRotation(autoAction.slotIndex);
      if (player?.autoCombat?.normalAttack?.enabled === false) return;
      autoAction = { action:"normal", fallbackFromFailedSkill:true };
    }
  }

  if (!canPlayerAttackNow()) return;

  if ((!autoActionIsSkill || autoSkillNeedsPrimaryRange) && typeof canAttackMonsterByRange === "function" && !canAttackMonsterByRange(currentMonster, effectiveRange)) {
    if (typeof movePlayerTowardMonster === "function") movePlayerTowardMonster(currentMonster, effectiveRange);
    return;
  }

  if (typeof stopPlayerCombatMovementForAttack === "function") stopPlayerCombatMovementForAttack(currentMonster);

  markPlayerAttackUsed();

  const normalAttackResult = resolvePlayerNormalAttack();
  if (normalAttackResult.miss) {
    addBattleLog("你攻擊 " + currentMonster.name + "，但是 Miss！");
    if (typeof showMissNumber === "function") showMissNumber(currentMonster);
    if (typeof breakCamouflageRuntime === "function" && breakCamouflageRuntime({silent:true})) addBattleLog("發動攻擊，偽裝戰術解除。");
    playPlayerAttackAnimation();
    updateMonsterUI();
    monsterAttackPlayer();
    return;
  }

  const playerDamage = Math.max(1, Number(normalAttackResult.damage || 1));
  const primaryDamage = Math.max(1, Math.min(playerDamage, Number(normalAttackResult.primaryDamage || playerDamage)));
  const additionalDamage = Math.max(0, Math.min(playerDamage - primaryDamage, Number(normalAttackResult.additionalDamage || 0)));

  currentMonster.provoked = true;
  currentMonster.currentHp -= playerDamage;
  if (typeof consumeVigorHpOnAttack === "function") consumeVigorHpOnAttack();
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
  if (typeof tryWindSignApGainOnNormalAttack === "function") tryWindSignApGainOnNormalAttack(currentMonster);
  if (typeof tryWargAutoStrikeOnNormal === "function") tryWargAutoStrikeOnNormal(currentMonster);
  window.CardRuntime?.onNormalAttack?.(currentMonster,playerDamage,{damageType:"physical",rangeType:normalAttackResult.rangeType,rangeCells:normalAttackResult.rangeType==="long"?Math.max(2,Number(normalAttackResult.rangeCells||2)):1});
  if (typeof breakCamouflageRuntime === "function" && breakCamouflageRuntime({silent:true})) addBattleLog("發動攻擊，偽裝戰術解除。");

  if (currentMonster.currentHp < 0) {
    currentMonster.currentHp = 0;
  }

  const additionalName = window.lastNormalAttackWasTriple ? "六合拳" : (window.lastNormalAttackWasDouble ? "二刀連擊" : "追加攻擊");
  addBattleLog("你對 " + currentMonster.name + " 造成 " + primaryDamage + " 點普通攻擊傷害。");
  if (additionalDamage > 0) addBattleLog(additionalName + "追加造成 " + additionalDamage + " 點傷害。");

  playPlayerAttackAnimation();
  updateMonsterUI();
  playMonsterHitAnimation(currentMonster);
  // 0.9.82FM：六合拳／二刀連擊等普通攻擊多段傷害以同一個總傷害逐段累加顯示。
  showDamageNumber(playerDamage, {
    target: currentMonster,
    critical: normalAttackResult?.critical === true || normalAttackResult?.critical?.critical === true,
    hitCount: Math.max(1, Number(normalAttackResult?.visualHits || 1)),
    combo: Number(normalAttackResult?.visualHits || 1) > 1
  });
  showSlashEffect();

  if (currentMonster.currentHp <= 0) {
    defeatMonster();
    return;
  }

  monsterAttackPlayer();
}

// 計算玩家傷害
function resolvePlayerNormalAttack(options = {}) {
  if (typeof recalculatePlayerStats === "function") recalculatePlayerStats();
  window.lastNormalAttackWasDouble = false;
  window.lastNormalAttackWasTriple = false;
  if (!window.CombatDamagePipeline || !currentMonster) {
    console.error("[Renewal Formula] CombatDamagePipeline 尚未載入，拒絕使用舊普通攻擊公式。");
    return { damage: 0, miss: true, hit: false, formulaError: true };
  }
  // One authoritative Renewal roll only: Lucky Dodge -> Critical -> HIT/FLEE.
  const result = window.CombatDamagePipeline.resolveNormalAttack(currentMonster, options);
  window.lastNormalAttackWasTriple = result.proc?.key === "triple";
  window.lastNormalAttackWasDouble = result.proc?.key === "double";
  window.lastNormalAttackVisualHits = result.visualHits || 1;
  return result;
}

window.resolvePlayerNormalAttack = resolvePlayerNormalAttack;

function applyEnergyCoatToIncomingDamage(rawDamage = 0) {
  let damage = Math.max(0, Number(rawDamage || 0));
  if (!player || damage <= 0) return damage;
  const entry = Object.entries(player.activeBuffs || {}).find(([, buff]) => Number(buff?.effects?.energyCoat || 0) > 0);
  if (!entry) return damage;
  const [buffId, buff] = entry;
  const maxSp = Math.max(1, Number(player.maxSp || 1));
  const currentSp = Math.max(0, Number(player.sp || 0));
  const per = Math.max(0, Math.min(4, Math.trunc(((100 * currentSp / maxSp) - 1) / 20)));
  const reductionRate = 6 * (1 + per);
  const spCost = Math.max(1, Math.floor((10 + 5 * per) * maxSp / 1000));
  if (currentSp >= spCost) player.sp = Math.max(0, currentSp - spCost);
  else delete player.activeBuffs[buffId];
  damage = Math.max(0, Math.floor(damage * (100 - reductionRate) / 100));
  if (typeof addBattleLog === "function") addBattleLog(`${buff?.name || "防護效果"}減少 ${reductionRate}% 傷害，消耗 ${currentSp >= spCost ? spCost : 0} SP。`);
  return damage;
}

function tryTriggerSightBlaster(monster) {
  if (!player || !monster || Number(monster.currentHp || 0) <= 0) return false;
  const entry = Object.entries(player.activeBuffs || {}).find(([, buff]) => Number(buff?.effects?.sightBlaster || 0) > 0);
  if (!entry) return false;
  const cell = Math.max(1, Number(window.RO_WEB_CELL_SIZE || 36));
  const distance = typeof getCurrentDistanceToMonster === "function" ? Number(getCurrentDistanceToMonster(monster) || 0) : 0;
  if (distance > cell * 1.05) return false;
  const [buffId, buff] = entry;
  const ratio = Math.max(1, Number(buff?.effects?.sightBlasterMatkRatio || 600));
  const profile = { handler:"magic_damage", formula:"renewal_sight_blaster", elementSource:"skill", element:"Fire", defenseMode:"normal" };
  const result = window.CombatDamagePipeline?.resolveMagicSkill(profile, Number(buff.level || 1), monster, { ratio, hits:1 });
  if (result?.elementImmune === true) {
    delete player.activeBuffs[buffId];
    if (typeof addBattleLog === "function") addBattleLog(`${buff?.name || "反擊效果"}發動，但屬性完全無效。`);
    if (typeof showMissNumber === "function") showMissNumber(monster);
    return true;
  }
  const dealt = Math.min(Number(monster.currentHp || 0), Math.max(1, Number(result?.damage || 1)));
  monster.currentHp = Math.max(0, Number(monster.currentHp || 0) - dealt);
  const cells = Math.max(0, Number(buff?.effects?.sightBlasterKnockbackCells || 3));
  if (cells > 0) window.MovementEffectResolver?.knockback(monster, player, cells);
  delete player.activeBuffs[buffId];
  if (typeof addBattleLog === "function") addBattleLog(`${buff?.name || "反擊效果"}發動，對 ${monster.name || "敵人"} 造成 ${dealt} 點傷害。`);
  if (typeof playMonsterHitAnimation === "function") playMonsterHitAnimation(monster);
  if (typeof showDamageNumber === "function") showDamageNumber(dealt);
  if (typeof updateMonsterUI === "function") updateMonsterUI();
  if (typeof updatePlayerUI === "function") updatePlayerUI();
  if (typeof saveGame === "function") saveGame();
  return true;
}

// 怪物攻擊玩家
function applyGuardianShieldBarrier(incomingDamage) {
  let damage = Math.max(0, Math.floor(Number(incomingDamage || 0)));
  const guardianEntry = Object.entries(player?.activeBuffs || {}).find(([,buff]) => Number(buff?.effects?.shieldBarrierHp || 0) > 0);
  const guardianId = guardianEntry?.[0], guardian = guardianEntry?.[1];
  if (!guardian || damage <= 0) return { damage, absorbed: 0, remaining: Number(guardian?.effects?.shieldBarrierHp || 0) };
  const absorbed = Math.min(damage, Number(guardian.effects.shieldBarrierHp || 0));
  guardian.effects.shieldBarrierHp = Math.max(0, Number(guardian.effects.shieldBarrierHp || 0) - absorbed);
  damage = Math.max(0, damage - absorbed);
  if (typeof addBattleLog === "function") addBattleLog(`${guardian.name || "守護盾"}吸收 ${absorbed} 點傷害，剩餘護盾 ${guardian.effects.shieldBarrierHp}。`);
  if (guardian.effects.shieldBarrierHp <= 0) delete player.activeBuffs[guardianId];
  return { damage, absorbed, remaining: Math.max(0, Number(guardian.effects.shieldBarrierHp || 0)) };
}
window.applyGuardianShieldBarrier = applyGuardianShieldBarrier;

function applyActivePhysicalReflect(monster, incomingDamage, options = {}) {
  if (!monster || Number(incomingDamage || 0) <= 0) return 0;
  const active = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
  const isMagic = options.magic === true;
  const rangeCells = Math.max(1, Number(options.rangeCells || 1));
  const cardRate = isMagic
    ? Number(window.EffectRuntime?.collectScalar?.("magicReflectRate", [], player, { includePassive:false, includeActive:false }) || 0)
    : (rangeCells <= 1 ? Number(window.EffectRuntime?.collectScalar?.("shortPhysicalReflectRate", [], player, { includePassive:false, includeActive:false }) || 0) : 0);
  const magicReflectChance = isMagic
    ? Math.max(0, Number(window.EffectRuntime?.collectScalar?.("magicReflectChancePercent", [], player, { includePassive:false, includeActive:false }) || 0))
    : 0;
  if (isMagic && magicReflectChance > 0 && Math.random() * 100 >= Math.min(100, magicReflectChance)) return 0;
  const rate = Math.max(0, (isMagic && magicReflectChance > 0 ? 100 : (isMagic ? 0 : Number(active.physicalReflectRate || 0))) + cardRate);
  if (rate <= 0) return 0;
  const reflected = Math.max(1, Math.floor(Number(incomingDamage || 0) * rate / 100));
  monster.currentHp = Math.max(0, Number(monster.currentHp || 0) - reflected);
  if (typeof addBattleLog === "function") addBattleLog(`反射效果對 ${monster.name || "敵人"} 造成 ${reflected} 點傷害。`);
  if (typeof updateMonsterUI === "function") updateMonsterUI();
  if (typeof showDamageNumber === "function") showDamageNumber(reflected);
  return reflected;
}
window.applyActivePhysicalReflect = applyActivePhysicalReflect;

let RO_WEB_WORLD_MONSTER_COMBAT_SAVE_TIMER = null;
function requestWorldMonsterCombatSave(delayMs = 600) {
  if (RO_WEB_WORLD_MONSTER_COMBAT_SAVE_TIMER) return true;
  RO_WEB_WORLD_MONSTER_COMBAT_SAVE_TIMER = setTimeout(() => {
    RO_WEB_WORLD_MONSTER_COMBAT_SAVE_TIMER = null;
    if (typeof saveGame === "function") saveGame();
  }, Math.max(100, Number(delayMs || 600)));
  return true;
}
window.requestWorldMonsterCombatSave = requestWorldMonsterCombatSave;

function monsterAttackPlayer(options = {}) {
  if (!currentMonster) return;
  const persistMonsterAttackState = () => {
    if (options.source === "world_monster_stream") return requestWorldMonsterCombatSave(600);
    if (typeof saveGame === "function") return saveGame();
    return false;
  };
  const aiBehavior = typeof getMonsterAiBehavior === "function" ? getMonsterAiBehavior(currentMonster) : null;
  if (aiBehavior && aiBehavior.canAttack === false) { currentMonster.aiState = "IDLE"; return; }
  if (options.respectCooldown) {
    const now = Date.now();
    if (now < Number(currentMonster._nextActiveAttackAt || 0)) return;
    currentMonster._nextActiveAttackAt = now + Math.max(480, Number(currentMonster.AttackDelay || currentMonster.attackDelay || 1000));
  }
  const runtimeControl=typeof getMonsterRuntimeBonuses==="function"?getMonsterRuntimeBonuses(currentMonster):{};
  if(Number(runtimeControl.blocksActions||0)>0){addBattleLog(`${currentMonster.name || "怪物"}目前無法行動。`);updateMonsterUI();return;}
  if(Number(runtimeControl.blocksPlayerAttacks||0)>0){addBattleLog(`${currentMonster.name || "怪物"}受到魅惑，無法攻擊你。`);updateMonsterUI();return;}


  if (typeof getCurrentDistanceToMonster === "function" && typeof getMonsterAttackRangePx === "function") {
    if (getCurrentDistanceToMonster(currentMonster) > getMonsterAttackRangePx(currentMonster)) {
      currentMonster.aiState = "CHASE";
      return;
    }
  }

  if (typeof playROStudioMonsterMotion === "function") playROStudioMonsterMotion("attack", { monster: currentMonster });

  const preTargetBuffs = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
  if (Number(preTargetBuffs.untargetableByNormalAttack || preTargetBuffs.trickDead || 0) > 0) {
    addBattleLog(`${currentMonster.name} 沒有把你視為可攻擊目標。`);
    currentMonster.aiState = "IDLE";
    return;
  }
  const canDetectCamouflage = Boolean(currentMonster?.isBoss || currentMonster?.isMvp || currentMonster?.boss || currentMonster?.detector || currentMonster?.canDetectHidden || currentMonster?.detectHidden);
  if (Number(preTargetBuffs.stealthField || 0) > 0 && !canDetectCamouflage) {
    const stealthBuff = Object.values(player?.activeBuffs || {}).find(buff => Number(buff?.effects?.stealthField || 0) > 0);
    addBattleLog(`${stealthBuff?.name || "偽裝狀態"}使你不會成為 ${currentMonster.name} 的攻擊目標。`);
    updatePlayerUI(); persistMonsterAttackState(); return;
  }

  if (typeof tryTriggerSightBlaster === "function" && tryTriggerSightBlaster(currentMonster)) {
    if (Number(currentMonster.currentHp || 0) <= 0 && typeof defeatMonster === "function") defeatMonster();
    return;
  }

  if (!window.CombatDamagePipeline?.resolveMonsterAttack) {
    console.error("[Renewal Formula] resolveMonsterAttack 尚未載入，拒絕使用舊怪物傷害公式。");
    return;
  }
  const monsterAttackResult = window.CombatDamagePipeline.resolveMonsterAttack(currentMonster, player);
  if (monsterAttackResult.perfectDodged) {
    addBattleLog(currentMonster.name + " 攻擊你，但被完全迴避！");
    updatePlayerUI();
    return;
  }
  if (monsterAttackResult.miss) {
    addBattleLog(currentMonster.name + " 攻擊你，但是 Miss！");
    updatePlayerUI();
    return;
  }
  const preDamageBuffs = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
  const monsterAttackType=String(currentMonster?.attackType??currentMonster?.damageType??currentMonster?.attackDamageType??"physical").toLowerCase();
  const monsterRangeCells = Number(currentMonster?.attackRange ?? currentMonster?.AttackRange ?? currentMonster?.attack_range ?? currentMonster?.range ?? 1);
  const isHiddenDetector = Boolean(currentMonster?.isBoss || currentMonster?.isMvp || currentMonster?.boss || currentMonster?.detector || currentMonster?.canDetectHidden || currentMonster?.detectHidden);
  if (Number(preDamageBuffs.stealthField || 0) > 0 && !isHiddenDetector) {
    const stealthBuff = Object.values(player?.activeBuffs || {}).find(buff => Number(buff?.effects?.stealthField || 0) > 0);
    addBattleLog(`${stealthBuff?.name || "偽裝狀態"}使你不會成為 ${currentMonster.name} 的攻擊目標。`);
    updatePlayerUI(); persistMonsterAttackState(); return;
  }
  if (Number(preDamageBuffs.physicalDamageImmunity || 0) > 0 && !monsterAttackType.includes("magic")) {
    const barrierBuff = Object.values(player?.activeBuffs || {}).find(buff => Number(buff?.effects?.physicalDamageImmunity || 0) > 0);
    addBattleLog(`${barrierBuff?.name || "物理結界"}完全擋下 ${currentMonster.name} 的物理攻擊！`);
    updatePlayerUI(); persistMonsterAttackState(); return;
  }
  if (Number(preDamageBuffs.longRangePhysicalImmunity || 0) > 0 && monsterRangeCells > 1 && !monsterAttackType.includes("magic")) {
    const barrierBuff = Object.values(player?.activeBuffs || {}).find(buff => Number(buff?.effects?.longRangePhysicalImmunity || 0) > 0);
    addBattleLog(`${barrierBuff?.name || "防護罩"}完全擋下 ${currentMonster.name} 的遠距離物理攻擊！`);
    updatePlayerUI(); persistMonsterAttackState(); return;
  }
  if (monsterRangeCells > 1 && typeof tryLightningWalkBlock === "function" && tryLightningWalkBlock(currentMonster)) { updatePlayerUI(); persistMonsterAttackState(); return; }
  if (monsterAttackType.includes("magic")) {
    const magicEvasionRate = Math.max(0, Math.min(100, Number(preDamageBuffs.magicEvasionRate || 0)));
    if (magicEvasionRate > 0 && Math.random() * 100 < magicEvasionRate) {
      addBattleLog(`魔法迴避成功，完全避開 ${currentMonster.name} 的魔法攻擊！`);
      updatePlayerUI(); persistMonsterAttackState(); return;
    }
  } else {
    const hasShield = typeof hasEquippedShieldRuntime === "function" ? hasEquippedShieldRuntime() : !!player?.equipment?.shield;
    const autoGuardRate = hasShield ? Math.max(0, Math.min(100, Number(preDamageBuffs.autoGuardBlockRate || 0))) : 0;
    if (autoGuardRate > 0 && Math.random() * 100 < autoGuardRate) {
      addBattleLog(`自動防禦成功，完全擋下 ${currentMonster.name} 的攻擊！`);
      if (Number(preDamageBuffs.autoGuardKnockback || 0) > 0 && window.MovementEffectResolver?.knockback) {
        window.MovementEffectResolver.knockback(currentMonster, player, 2);
      }
      updatePlayerUI(); persistMonsterAttackState(); return;
    }
    const weaponType = String(typeof getEquippedWeaponTypeRuntime === "function" ? getEquippedWeaponTypeRuntime() : "").toLowerCase();
    const canParry = weaponType.includes("twohandsword") || weaponType.includes("2hsword") || weaponType.includes("two_hand_sword");
    const parryRate = canParry ? Math.max(0, Math.min(100, Number(preDamageBuffs.parryBlockRate || 0))) : 0;
    if (parryRate > 0 && Math.random() * 100 < parryRate) {
      addBattleLog(`雙劍格擋成功，完全擋下 ${currentMonster.name} 的攻擊！`);
      updatePlayerUI(); persistMonsterAttackState(); return;
    }
    const physicalBlockRate = Math.max(0, Math.min(100, Number(preDamageBuffs.physicalBlockRate || 0)));
    if (physicalBlockRate > 0 && Math.random() * 100 < physicalBlockRate) {
      addBattleLog(`武器格擋成功，完全擋下 ${currentMonster.name} 的攻擊！`);
      updatePlayerUI(); persistMonsterAttackState(); return;
    }
  }

  let monsterDamage = Math.max(0, Number(monsterAttackResult.damage || 0));
  if(monsterAttackType.includes("magic")&&typeof resolveMagicRodIncomingDamage==="function"){
    const rod=resolveMagicRodIncomingDamage(monsterDamage,Number(currentMonster?.skillSpCost??currentMonster?.spCost??0),currentMonster,{singleTarget:currentMonster?.isAreaMagic!==true});
    if(rod.absorbed){updatePlayerUI();persistMonsterAttackState();return;}monsterDamage=rod.damage;
  }
  monsterDamage = applyEnergyCoatToIncomingDamage(monsterDamage);
  const guardianResult = applyGuardianShieldBarrier(monsterDamage);
  monsterDamage = guardianResult.damage;
  const kyrieEntry = Object.entries(player?.activeBuffs || {}).find(([,buff]) => Number(buff?.effects?.kyrieBarrierHp || 0) > 0 && Number(buff?.effects?.kyrieBarrierHits || 0) > 0);
  const kyrieId = kyrieEntry?.[0], kyrie = kyrieEntry?.[1];
  if (kyrie) {
    const absorbed = Math.min(monsterDamage, Number(kyrie.effects.kyrieBarrierHp || 0));
    kyrie.effects.kyrieBarrierHp = Math.max(0, Number(kyrie.effects.kyrieBarrierHp || 0) - absorbed);
    kyrie.effects.kyrieBarrierHits = Math.max(0, Number(kyrie.effects.kyrieBarrierHits || 0) - 1);
    monsterDamage = Math.max(0, monsterDamage - absorbed);
    addBattleLog(`${kyrie.name || "霸邪之陣"}吸收 ${absorbed} 點傷害，剩餘護盾 ${kyrie.effects.kyrieBarrierHp}，可承受 ${kyrie.effects.kyrieBarrierHits} 次攻擊。`);
    if (kyrie.effects.kyrieBarrierHp <= 0 || kyrie.effects.kyrieBarrierHits <= 0) delete player.activeBuffs[kyrieId];
  }
  if (monsterDamage <= 0) { updatePlayerUI(); persistMonsterAttackState(); return; }
  const cappedDamage=window.EffectRuntime?.applyIncomingDamageCap?.(monsterDamage,player,{fixedDamage:monsterAttackResult?.fixedDamage===true});
  if(cappedDamage){
    if(cappedDamage.capped&&typeof addBattleLog==="function")addBattleLog(`裝備／卡片效果將單次傷害限制為最大 HP 的 ${cappedDamage.rate}%（${cappedDamage.cap}）。`);
    monsterDamage=cappedDamage.damage;
  }

  player.hp -= monsterDamage;
  // IL1：先用「受擊前已存在」的反射狀態處理本次傷害，再觸發受擊型裝備。
  // 避免瘋狂兔寶寶剛由本次魔法觸發魔法鏡，就反射同一發攻擊。
  applyActivePhysicalReflect(currentMonster, monsterDamage, { magic:monsterAttackType.includes("magic"), rangeCells:monsterRangeCells });
  window.CardRuntime?.onPlayerDamaged?.(currentMonster,monsterDamage,{magic:monsterAttackType.includes("magic"),rangeCells:monsterRangeCells});
  let crescentElbowResult = null;
  if (player.hp > 0 && monsterRangeCells <= 1 && typeof tryCrescentElbowCounter === "function") {
    crescentElbowResult = tryCrescentElbowCounter(currentMonster, monsterDamage);
  }
  if (typeof tryGentleTouchEnergyGain === "function") tryGentleTouchEnergyGain("being_attacked");
  window.lastPlayerDamageAt = Date.now();

  if (player.hp < 0) {
    player.hp = 0;
  }

  addBattleLog(currentMonster.name + " 對你造成 " + monsterDamage + " 點傷害。");
  // 0.9.82HV：怪物對玩家造成的任何傷害統一使用紅色受擊數字。
  // 不論物理、魔法或怪物端暴擊，都不得套用玩家的白／黃／黃紅傷害樣式。
  if (typeof showDamageNumber === "function") {
    showDamageNumber(monsterDamage, {
      target:player,
      source:"monster",
      incoming:true,
      critical:false,
      combo:false,
      cumulative:false,
      offsetY:-4
    });
  }
  if (crescentElbowResult?.triggered && Number(currentMonster.currentHp || 0) <= 0) {
    if (player.hp <= 0) { updatePlayerUI(); persistMonsterAttackState(); playerDead(); return; }
    defeatMonster(); return;
  }
  if (typeof applyCounterReflect === "function") {
    applyCounterReflect(currentMonster, monsterDamage);
    if (currentMonster.currentHp <= 0) { defeatMonster(); return; }
  }
  const activeRuntimeBuffs = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
  if (!Number(activeRuntimeBuffs.noHitStun || 0) && typeof playROStudioPlayerMotion === "function") {
    playROStudioPlayerMotion("hurt", { duration: 360 });
  }
  if (Number(activeRuntimeBuffs.noHitStun || 0) && player.activeBuffs?.[8]) {
    player.activeBuffs[8].remainingHits = Number(player.activeBuffs[8].remainingHits ?? 7) - 1;
    if (player.activeBuffs[8].remainingHits <= 0) delete player.activeBuffs[8];
  }

  // 先判斷死亡，再允許自動喝水。避免 HP 歸零後靠藥水復活。
  if (player.hp <= 0) {
    updatePlayerUI();
    persistMonsterAttackState();
    playerDead();
    return;
  }

  // 怪物打完玩家後，自動檢查是否需要喝水
  if (typeof autoUsePotion === "function") {
    autoUsePotion();
  }

  updatePlayerUI();
  persistMonsterAttackState();
}
// 玩家死亡：保留技能型自動復活；一般死亡交由 0.9.82HT 死亡／復活 Runtime。
function playerDead() {
  if(typeof normalizeActiveBuffs==="function")normalizeActiveBuffs();
  const reviveEntry=Object.entries(player?.activeBuffs||{}).find(([,buff])=>Number(buff?.effects?.valleyOfDeathAutoRevive||0)>0);
  if(reviveEntry){
    const [buffId,buff]=reviveEntry,spBefore=Math.max(0,Number(player?.sp||0)),lossRate=Math.max(0,Math.min(100,Number(buff?.effects?.valleyOfDeathSpLossRate||0)));
    delete player.activeBuffs[buffId];
    player.hp=Math.min(Math.max(1,Number(player.maxHp||1)),Math.max(1,spBefore));
    player.sp=Math.max(0,Math.floor(spBefore*(100-lossRate)/100));
    if(typeof recalculatePlayerStats==="function")recalculatePlayerStats();
    if(typeof updatePlayerUI==="function")updatePlayerUI();if(typeof saveGame==="function")saveGame();
    if(typeof addBattleLog==="function")addBattleLog(`${buff?.name||"復活效果"}發動：恢復 ${player.hp} HP，剩餘 ${player.sp} SP。`);
    return true;
  }

  const defeatedBy = currentMonster?.name || "怪物";
  const wasAutoBattle = autoBattleRunning === true || window.RO_WEB_AUTO_BATTLE_RESUME_PENDING === true;
  if (window.DeathRevivalRuntime?.handleDeath) {
    return window.DeathRevivalRuntime.handleDeath({ defeatedBy, wasAutoBattle });
  }

  // Fail-safe：Runtime 未載入時也不得免費自動復活。
  player.hp = 0;
  if (typeof playROStudioPlayerMotion === "function") playROStudioPlayerMotion("dead", { duration: 900, holdLast: true });
  if (typeof addBattleLog === "function") addBattleLog(`你被 ${defeatedBy} 擊敗了。`);
  window.RO_WEB_AUTO_BATTLE_RESUME_PENDING = false;
  if (typeof stopAutoBattle === "function") stopAutoBattle({ silent: true });
  if (typeof stopManualMonsterAttack === "function") stopManualMonsterAttack({ clearTarget: true, silent: true });
  currentMonster = null;
  if (typeof updateMonsterUI === "function") updateMonsterUI();
  if (typeof updatePlayerUI === "function") updatePlayerUI();
  if (typeof saveGame === "function") saveGame({ reason: "player-death-failsafe" });
  return true;
}

// ===== 0.9.82IK：怪物死亡身分鎖定 =====
// 同一個死亡封包的名稱、EXP、掉落、卡片、MVP 獎勵與公告必須全部使用
// 同一個權威 Mob ID。動畫 Atlas、DOM 名稱、currentMonster 後續切換都不得改寫。
const RO_WEB_MONSTER_DEATH_IDENTITY_AUDIT = window.RO_WEB_MONSTER_DEATH_IDENTITY_AUDIT || {
  version: "0.9.82IK",
  queued: 0,
  resolved: 0,
  canonicalMissing: 0,
  identityMismatch: 0,
  cardSourceMismatchBlocked: 0,
  records: []
};
window.RO_WEB_MONSTER_DEATH_IDENTITY_AUDIT = RO_WEB_MONSTER_DEATH_IDENTITY_AUDIT;

function appendMonsterDeathIdentityAudit(record) {
  if (!record || typeof record !== "object") return;
  RO_WEB_MONSTER_DEATH_IDENTITY_AUDIT.records.push({ at: Date.now(), ...record });
  if (RO_WEB_MONSTER_DEATH_IDENTITY_AUDIT.records.length > 120) {
    RO_WEB_MONSTER_DEATH_IDENTITY_AUDIT.records.splice(0, RO_WEB_MONSTER_DEATH_IDENTITY_AUDIT.records.length - 120);
  }
}
window.appendMonsterDeathIdentityAudit = appendMonsterDeathIdentityAudit;

function getAuthoritativeMonsterDeathId(monster) {
  const candidates = [
    monster?._deathIdentity?.monsterId,
    monster?._spawnEntry?.monsterId,
    monster?.officialId,
    monster?.combatMonsterId,
    monster?.id
  ];
  for (const candidate of candidates) {
    const id = Number(candidate || 0);
    if (Number.isInteger(id) && id > 0) return id;
  }
  return 0;
}
window.getAuthoritativeMonsterDeathId = getAuthoritativeMonsterDeathId;

function resolveCanonicalDeathMonster(monsterId) {
  const list = typeof monsters !== "undefined" && Array.isArray(monsters) ? monsters : [];
  return list.find(row => Number(row?.officialId || row?.id || 0) === Number(monsterId || 0)) || null;
}

function canonicalDeathMonsterName(monsterId, canonical, fallbackMonster) {
  if (Number(monsterId) === 1719) return "迪塔勒泰晤勒斯";
  if (Number(monsterId) === 1779) return "冰晶龍";
  return String(canonical?.name || fallbackMonster?.name || fallbackMonster?.displayName || `怪物 ${monsterId || ""}`).trim();
}

function cloneMonsterRewardRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(row => row && typeof row === "object" ? { ...row } : row);
}

function createMonsterDeathRewardSnapshot(monster) {
  if (!monster) return null;
  const monsterId = getAuthoritativeMonsterDeathId(monster);
  const canonical = resolveCanonicalDeathMonster(monsterId);
  if (!canonical) RO_WEB_MONSTER_DEATH_IDENTITY_AUDIT.canonicalMissing += 1;

  const runtimeId = Number(monster?.id || 0);
  const officialId = Number(monster?.officialId || 0);
  const spawnId = Number(monster?._spawnEntry?.monsterId || 0);
  const mismatchIds = [runtimeId, officialId, spawnId].filter(id => id > 0 && monsterId > 0 && id !== monsterId);
  if (mismatchIds.length) {
    RO_WEB_MONSTER_DEATH_IDENTITY_AUDIT.identityMismatch += 1;
    appendMonsterDeathIdentityAudit({
      type: "DEATH_IDENTITY_MISMATCH",
      authoritativeMonsterId: monsterId,
      runtimeId,
      officialId,
      spawnId,
      instanceId: Number(monster?._instanceId || 0)
    });
  }

  const identity = Object.freeze({
    monsterId,
    officialId: monsterId,
    aegisName: String(canonical?.aegisName || monster?.aegisName || ""),
    name: canonicalDeathMonsterName(monsterId, canonical, monster),
    instanceId: Number(monster?._instanceId || monster?._worldTestIndex || 0),
    mapId: String(currentMap?.id || player?.map || ""),
    lockedAt: Date.now()
  });
  const snapshot = {
    ...(canonical || {}),
    ...monster,
    id: monsterId,
    officialId: monsterId,
    combatMonsterId: monsterId,
    aegisName: identity.aegisName,
    name: identity.name,
    drops: cloneMonsterRewardRows(canonical?.drops ?? monster?.drops),
    mvpDrops: cloneMonsterRewardRows(canonical?.mvpDrops ?? monster?.mvpDrops),
    _deathIdentity: identity,
    _deathSourceMonster: monster,
    _deathRewardSnapshot: true,
    _rewardsGranted: false
  };
  monster._deathIdentity = identity;
  RO_WEB_MONSTER_DEATH_IDENTITY_AUDIT.queued += 1;
  appendMonsterDeathIdentityAudit({
    type: "DEATH_IDENTITY_LOCKED",
    monsterId,
    monsterName: identity.name,
    aegisName: identity.aegisName,
    instanceId: identity.instanceId
  });
  return snapshot;
}
window.createMonsterDeathRewardSnapshot = createMonsterDeathRewardSnapshot;

// ===== 0.9.82ES：怪物死亡結算拆離傷害影格 =====
// 怪物死亡時只在當前影格完成「死亡狀態／動畫／解除鎖定」。
// EXP、掉落、背包重建、戰鬥紀錄與存檔改在下一個 idle 時段批次處理，
// 避免高傷害一擊擊殺時出現使用者感受到的約 0.1 秒停頓。
const RO_WEB_DEFEAT_RESOLUTION_BATCH = { queue: [], scheduled: false, flushing: false };

function scheduleDefeatResolutionBatch() {
  if (RO_WEB_DEFEAT_RESOLUTION_BATCH.scheduled) return;
  RO_WEB_DEFEAT_RESOLUTION_BATCH.scheduled = true;
  const afterPaint = typeof requestAnimationFrame === "function"
    ? requestAnimationFrame
    : callback => setTimeout(callback, 0);
  afterPaint(() => {
    const run = deadline => flushDefeatResolutionBatch(deadline);
    if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 120 });
    else setTimeout(() => run(null), 0);
  });
}

function queueRewardBatchLog(text, type = null) {
  window.RO_WEB_REWARD_BATCH_LOGS = window.RO_WEB_REWARD_BATCH_LOGS || [];
  window.RO_WEB_REWARD_BATCH_LOGS.push({ text:String(text || ""), type });
}
window.queueRewardBatchLog = queueRewardBatchLog;

function flushRewardBatchUi() {
  if (window.RO_WEB_REWARD_PLAYER_UI_DIRTY && typeof updatePlayerUI === "function") updatePlayerUI();
  if (window.RO_WEB_REWARD_JOB_UI_DIRTY) {
    if (typeof updateJobUI === "function") updateJobUI();
    if (typeof updateSkillUI === "function") updateSkillUI();
  }
  if (window.RO_WEB_REWARD_INVENTORY_UI_DIRTY) {
    const inventoryWindow = document.getElementById("inventory-window");
    const visible = inventoryWindow && !inventoryWindow.classList.contains("hidden-window") && inventoryWindow.offsetParent !== null;
    if (visible && typeof updateInventoryUI === "function") updateInventoryUI();
    else window.RO_WEB_INVENTORY_DIRTY = true;
  }
  const logs = Array.isArray(window.RO_WEB_REWARD_BATCH_LOGS) ? window.RO_WEB_REWARD_BATCH_LOGS.splice(0) : [];
  if (logs.length) {
    if (typeof addBattleLogBatch === "function") addBattleLogBatch(logs);
    else logs.forEach(entry => addBattleLog(entry.text, entry.type));
  }
  if (window.RO_WEB_REWARD_SAVE_DIRTY) {
    if (typeof requestGameSave === "function") requestGameSave(400);
    else if (typeof saveGame === "function") setTimeout(saveGame, 0);
  }
  window.RO_WEB_REWARD_PLAYER_UI_DIRTY = false;
  window.RO_WEB_REWARD_JOB_UI_DIRTY = false;
  window.RO_WEB_REWARD_INVENTORY_UI_DIRTY = false;
  window.RO_WEB_REWARD_SAVE_DIRTY = false;
}

function flushDefeatResolutionBatch(deadline = null) {
  RO_WEB_DEFEAT_RESOLUTION_BATCH.scheduled = false;
  if (RO_WEB_DEFEAT_RESOLUTION_BATCH.flushing || !RO_WEB_DEFEAT_RESOLUTION_BATCH.queue.length) return;
  RO_WEB_DEFEAT_RESOLUTION_BATCH.flushing = true;
  window.RO_WEB_REWARD_BATCH_ACTIVE = true;
  let processed = 0;
  try {
    while (RO_WEB_DEFEAT_RESOLUTION_BATCH.queue.length) {
      if (processed > 0 && deadline && typeof deadline.timeRemaining === "function" && deadline.timeRemaining() < 2) break;
      const item = RO_WEB_DEFEAT_RESOLUTION_BATCH.queue.shift();
      const monster = item?.monster;
      const sourceMonster = item?.sourceMonster || monster?._deathSourceMonster || null;
      if (!monster || monster._rewardsGranted || sourceMonster?._rewardsGranted) continue;
      monster._rewardsGranted = true;
      if (sourceMonster) sourceMonster._rewardsGranted = true;
      if (typeof recordMapMonsterDiscovery === "function") recordMapMonsterDiscovery(monster);
      if (typeof grantMonsterRewards === "function") grantMonsterRewards(monster);
      const deathName = monster?._deathIdentity?.name || monster.name || "怪物";
      queueRewardBatchLog(`${deathName} 被擊敗了！`, "death");
      RO_WEB_MONSTER_DEATH_IDENTITY_AUDIT.resolved += 1;
      processed += 1;
      // One reward package per idle slice is enough to keep mobile frames smooth.
      if (!deadline && processed >= 1) break;
      if (processed >= 4) break;
    }
  } finally {
    window.RO_WEB_REWARD_BATCH_ACTIVE = false;
    RO_WEB_DEFEAT_RESOLUTION_BATCH.flushing = false;
    flushRewardBatchUi();
  }
  if (RO_WEB_DEFEAT_RESOLUTION_BATCH.queue.length) scheduleDefeatResolutionBatch();
}
window.flushDefeatResolutionBatch = flushDefeatResolutionBatch;

function queueMonsterDefeatResolution(monster, options = {}) {
  if (!monster || monster._defeatResolutionQueued || monster._rewardsGranted) return false;
  monster._defeatResolutionQueued = true;
  const isPrimary = options.primary === true || monster === currentMonster;

  // Mark the streamed entity dead immediately so later hits cannot target it.
  if (monster._worldTestEntity && typeof onWorldMonsterDefeated === "function") {
    onWorldMonsterDefeated(monster);
  } else if (typeof playMonsterDeathAnimation === "function") {
    playMonsterDeathAnimation(monster);
  }

  const rewardSnapshot = createMonsterDeathRewardSnapshot(monster);
  if (!rewardSnapshot) return false;
  RO_WEB_DEFEAT_RESOLUTION_BATCH.queue.push({ monster:rewardSnapshot, sourceMonster:monster, primary:isPrimary, queuedAt:Date.now() });
  scheduleDefeatResolutionBatch();

  if (isPrimary) {
    if (typeof noteAutoBattleTargetDefeated === "function") noteAutoBattleTargetDefeated(monster);
    currentMonster = null;
    if (typeof markAutoNoTargetNow === "function") markAutoNoTargetNow();
    if (player) player.state = "Searching";
    if (typeof updateMonsterUI === "function") setTimeout(updateMonsterUI, 0);
    if (spawnTimer) { clearTimeout(spawnTimer); spawnTimer = null; }

    const formalMultiMonsterMap = Boolean(currentMap?.monsterVisualTest && typeof getLivingWorldMonsterTestEntities === "function");
    if (autoBattleRunning && formalMultiMonsterMap) {
      // Formal world maps already contain many living entities. Reacquire on the
      // next micro-task instead of waiting for a legacy 1.5-second respawn.
      setTimeout(() => {
        if (!autoBattleRunning) return;
        if (typeof acquireAutoBattleTarget === "function") acquireAutoBattleTarget({ reason: "target_defeated" });
        scheduleAutoBattleTick(AUTO_BATTLE_MIN_SCHEDULE_MS);
      }, 0);
    } else if (!formalMultiMonsterMap) {
      spawnTimer = setTimeout(() => {
        spawnTimer = null;
        spawnMonsterFromCurrentMap();
      }, RESPAWN_DELAY);
    }
  }
  return true;
}
window.queueMonsterDefeatResolution = queueMonsterDefeatResolution;

// 怪物死亡
function defeatMonster(explicitMonster = null) {
  const defeatedMonster = explicitMonster || currentMonster;
  if (!defeatedMonster) return false;
  return queueMonsterDefeatResolution(defeatedMonster, { primary:defeatedMonster === currentMonster });
}

// 掉寶判定
// chance 採用萬分比：10000 = 100%，1000 = 10%，1 = 0.01%
function checkDrops(monster) {
  if (!monster.drops || monster.drops.length === 0) return;

  monster.drops.forEach(drop => {
    const roll = Math.floor(Math.random() * 10000) + 1;

    if (roll <= drop.chance) {
      const itemId = normalizeItemId(drop.itemId);
      const itemData = getItemData(itemId);
      const itemName = itemData?.name || drop.name || `Item ${itemId}`;

      addItem({
        id: itemId,
        name: itemName
      }, drop.qty || 1);
    }
  });
}

// 更新怪物 UI
function updateMonsterUI() {
  // Streamed world monsters own their visible name/HP UI. Avoid rebuilding the
  // hidden legacy singleton panel on every hit; this removes redundant DOM work
  // from the damage landing frame.
  if (!player?.currentCity && currentMonster?._worldTestEntity && currentMap?.monsterVisualTest) {
    if (typeof updateWorldMonsterFieldTestUi === "function") updateWorldMonsterFieldTestUi(currentMonster);
    return;
  }
  const monsterSpriteEl = document.getElementById("monster-sprite");
  const nameEl = document.getElementById("monsterName");
  const levelEl = document.getElementById("monsterLevel");
  const hpEl = document.getElementById("monsterHp");
  const imageEl = document.getElementById("monsterImage");
  const placeholderEl = document.querySelector(".monster-placeholder");
  const hpBarEl = document.getElementById("monsterHpBar");

  if (!nameEl || !levelEl || !hpEl) return;

  const inTown = Boolean(player?.currentCity);
  if (monsterSpriteEl) {
    monsterSpriteEl.classList.toggle("town-mode", inTown);
    monsterSpriteEl.classList.toggle("no-target", !inTown && !currentMonster);
  }

  if (inTown) {
    nameEl.textContent = "城鎮中";
    levelEl.textContent = "-";
    hpEl.textContent = "";
    if (imageEl) {
      imageEl.hidden = true;
      imageEl.removeAttribute("src");
    }
    if (placeholderEl) {
      placeholderEl.style.display = "none";
      placeholderEl.textContent = "?";
    }
    if (hpBarEl) hpBarEl.style.width = "0%";
    return;
  }

  if (!currentMonster) {
    // 0.9.82FG：多怪物世界已不再使用舊版單怪等待提示。
    nameEl.textContent = "";
    levelEl.textContent = "-";
    hpEl.textContent = "";
    if (imageEl) {
      imageEl.hidden = true;
      imageEl.removeAttribute("src");
    }
    if (placeholderEl) {
      placeholderEl.textContent = "";
      placeholderEl.style.display = "none";
    }
    if (hpBarEl) hpBarEl.style.width = "0%";
    return;
  }

  const maxHp = currentMonster.maxHp || currentMonster.hp || 1;
  const hpPercent = Math.max(0, Math.min(100, Math.round((currentMonster.currentHp / maxHp) * 100)));

  nameEl.textContent = currentMonster.name;
  levelEl.textContent = currentMonster.level || "-";
  hpEl.textContent = `${currentMonster.currentHp} / ${maxHp}`;
  if (hpBarEl) hpBarEl.style.width = `${hpPercent}%`;

  if (currentMonster.useAnimatedAtlas && currentMap?.monsterVisualTest && currentMonster._worldTestEntity) {
    if (typeof updateWorldMonsterFieldTestUi === "function") updateWorldMonsterFieldTestUi(currentMonster);
    if (imageEl) imageEl.hidden = true;
    if (placeholderEl) placeholderEl.style.display = "none";
  } else if (currentMonster.useAnimatedAtlas && typeof syncROStudioMonsterAtlas === "function") {
    syncROStudioMonsterAtlas(currentMonster);
    if (imageEl) imageEl.hidden = true;
    if (placeholderEl) placeholderEl.style.display = "none";
  } else if (imageEl && currentMonster.image) {
    imageEl.onerror = function () {
      imageEl.hidden = true;
      if (placeholderEl) placeholderEl.style.display = "grid";
    };
    imageEl.src = currentMonster.image;
    imageEl.hidden = false;
    if (placeholderEl) placeholderEl.style.display = "none";
  } else {
    if (imageEl) imageEl.hidden = true;
    if (placeholderEl) {
      placeholderEl.style.display = "grid";
      placeholderEl.textContent = currentMonster.name || "MON";
    }
  }
}


// 玩家攻擊動畫
function playPlayerAttackAnimation(options = {}) {
  const requested = Number(options.duration || 0);
  const duration = Math.max(80, requested > 0 ? requested : getPlayerAttackVisualDurationMs());
  if (typeof playROStudioPlayerMotion === "function" && playROStudioPlayerMotion("attack", { duration, compressFrames: true })) {
    return;
  }

  const playerSprite = document.getElementById("player-sprite");
  if (!playerSprite) return;

  playerSprite.style.setProperty("--ro-player-attack-visual-ms", `${Math.round(duration)}ms`);
  if (playerSprite._roAttackVisualTimer) clearTimeout(playerSprite._roAttackVisualTimer);
  playerSprite.classList.remove("is-attacking");
  void playerSprite.offsetWidth;
  playerSprite.classList.add("is-attacking");

  playerSprite._roAttackVisualTimer = setTimeout(() => {
    playerSprite.classList.remove("is-attacking");
    playerSprite._roAttackVisualTimer = null;
  }, duration);
}

// 怪物受擊視覺與 Assist 連動以單一 animation frame 批次處理。
// 傷害與仇恨立即生效；DOM、動畫切換與同伴支援延後到下一幀，
// 避免範圍技能命中多目標時重複同步 layout 與 N×M Assist 掃描。
const RO_WEB_MONSTER_IMPACT_BATCH = { targets:new Set(), scheduled:false };
function flushMonsterImpactBatch() {
  RO_WEB_MONSTER_IMPACT_BATCH.scheduled = false;
  if (!RO_WEB_MONSTER_IMPACT_BATCH.targets.size) return;
  const targets = [...RO_WEB_MONSTER_IMPACT_BATCH.targets];
  RO_WEB_MONSTER_IMPACT_BATCH.targets.clear();
  if (typeof propagateWorldMonsterAssistBatch === "function") propagateWorldMonsterAssistBatch(targets);
  for (const target of targets) {
    if (!target || target._deathHandled) continue;
    if (typeof playROStudioMonsterMotion === "function" && target.useAnimatedAtlas) {
      playROStudioMonsterMotion("hit", { monster:target, skipAggro:true, deferUi:true });
    }
    if (typeof updateWorldMonsterFieldTestUi === "function") updateWorldMonsterFieldTestUi(target);
  }
}
function queueMonsterImpact(monster) {
  if (!monster?._worldTestEntity) return false;
  if (typeof markWorldMonsterAttacked === "function") markWorldMonsterAttacked(monster, { reason:"damage", propagateAssist:false });
  // HP width is a write-only update and can be reflected immediately without
  // forcing the full monster UI/motion pipeline to run inside the damage loop.
  if (typeof updateWorldMonsterHpBarFast === "function") updateWorldMonsterHpBarFast(monster);
  RO_WEB_MONSTER_IMPACT_BATCH.targets.add(monster);
  if (!RO_WEB_MONSTER_IMPACT_BATCH.scheduled) {
    RO_WEB_MONSTER_IMPACT_BATCH.scheduled = true;
    const schedule = typeof requestAnimationFrame === "function" ? requestAnimationFrame : callback => setTimeout(callback, 0);
    schedule(flushMonsterImpactBatch);
  }
  return true;
}
window.flushMonsterImpactBatch = flushMonsterImpactBatch;

// 怪物被打動畫：短暫切換 hit 圖
function playMonsterHitAnimation(monsterSnapshot) {
  if (monsterSnapshot?._worldTestEntity) {
    queueMonsterImpact(monsterSnapshot);
    return;
  }
  if (typeof playROStudioMonsterMotion === "function" && monsterSnapshot?.useAnimatedAtlas) {
    playROStudioMonsterMotion("hit", { monster: monsterSnapshot });
  }
  const monsterSprite = document.getElementById("monster-sprite");
  const imageEl = document.getElementById("monsterImage");
  if (!monsterSprite || !monsterSnapshot) return;

  monsterSprite.classList.remove("is-hit");
  void monsterSprite.offsetWidth;
  monsterSprite.classList.add("is-hit");

  if (imageEl && monsterSnapshot.hitImage) {
    imageEl.src = monsterSnapshot.hitImage;
  }

  setTimeout(() => {
    monsterSprite.classList.remove("is-hit");
    if (imageEl && currentMonster && currentMonster.image) {
      imageEl.src = currentMonster.image;
    }
  }, 230);
}

// 怪物死亡動畫
function playMonsterDeathAnimation(monsterSnapshot = currentMonster) {
  if (typeof playROStudioMonsterMotion === "function" && monsterSnapshot?.useAnimatedAtlas) {
    playROStudioMonsterMotion("dead", { monster: monsterSnapshot, holdLast: true });
  }
  const monsterSprite = document.getElementById("monster-sprite");
  if (!monsterSprite) return;

  monsterSprite.classList.remove("is-hit");
  monsterSprite.classList.add("is-dying");

  setTimeout(() => {
    monsterSprite.classList.remove("is-dying");
  }, 420);
}

// 傷害數字浮起
const RO_WEB_DAMAGE_NUMBER_BATCH = {
  queue: [],
  scheduled: false,
  maxPerFrame: 24,
  sequence: 0,
  activeSequences: new Map()
};

function captureDamageNumberAnchor(target) {
  if (!target) return null;
  const camera = typeof getMapCameraOffset === "function" ? getMapCameraOffset() : { x:0, y:0 };

  // 0.9.82HV：玩家受到怪物傷害時，傷害字固定在命中瞬間的玩家世界座標。
  // 這與怪物傷害數字使用相同的 world-anchor 契約；玩家之後移動時，數字留在原命中位置。
  if (target === player || target?.isPlayer === true || target?.entityType === "player") {
    const position = target?.position;
    if (position && Number.isFinite(Number(position.x)) && Number.isFinite(Number(position.y))) {
      const worldX = Number(position.x);
      const worldY = Number(position.y) - 96;
      return {
        x:worldX - Number(camera.x || 0),
        y:worldY - Number(camera.y || 0),
        worldX,
        worldY,
        instanceId:"player"
      };
    }
    const playerElement = document.getElementById?.("player-sprite");
    const battleField = document.getElementById?.("battle-field");
    if (playerElement?.getBoundingClientRect && battleField?.getBoundingClientRect) {
      const playerRect = playerElement.getBoundingClientRect();
      const fieldRect = battleField.getBoundingClientRect();
      return {
        x:playerRect.left - fieldRect.left + playerRect.width / 2,
        y:playerRect.top - fieldRect.top + Math.min(58, playerRect.height * .28),
        instanceId:"player"
      };
    }
  }

  const world = target._damageNumberAnchorWorld;
  if (world && Number.isFinite(Number(world.x)) && Number.isFinite(Number(world.y))) {
    return {
      x:Number(world.x) - Number(camera.x || 0),
      y:Number(world.y) - Number(camera.y || 0),
      worldX:Number(world.x),
      worldY:Number(world.y),
      instanceId:target._instanceId || null
    };
  }
  // The world renderer keeps a no-layout-read screen anchor for every visible monster.
  const cached = target._damageNumberAnchorScreen;
  if (cached && Number.isFinite(Number(cached.x)) && Number.isFinite(Number(cached.y))) {
    return { x:Number(cached.x), y:Number(cached.y), instanceId:target._instanceId || null };
  }
  if (target._worldTestEntity && target.position) {
    const worldX = Number(target.position.x || 0);
    const worldY = Number(target.position.y || 0) - 76;
    return {
      x:worldX - Number(camera.x || 0),
      y:worldY - Number(camera.y || 0),
      worldX,
      worldY,
      instanceId:target._instanceId || null
    };
  }
  return null;
}
function createDamageNumberElement(entry) {
  const options = entry.options || {};
  const number = document.createElement("div");
  const source = String(options.source || "player").toLowerCase();
  const incoming = options.incoming === true || source === "monster" || source === "enemy";
  const critical = !incoming && (options.critical === true || options.isCritical === true || options.criticalResult?.critical === true);
  const hitCount = Math.max(1, Number(options.hitCount || options.visualHits || options.damageHitCount || 1));
  const combo = !incoming && (options.combo === true || options.isCombo === true || options.multiHit === true || hitCount > 1 || options.cumulative === true);
  const classes = ["damage-number"];
  if (incoming) classes.push("incoming-damage-number");
  if (!incoming && source === "summon") classes.push("summon-damage-number");
  if (!incoming && source === "additional") classes.push("additional-damage-number", "combo-damage-number");
  if (combo && source !== "summon" && source !== "additional") classes.push("combo-damage-number");
  if (critical && source !== "additional") classes.push("critical-damage-number");
  if (options.cumulative === true) classes.push("cumulative-damage-number");
  if (options.cumulativeFinal === true) classes.push("cumulative-damage-final");
  if (options.miss === true || options.textOverride === "MISS") classes.push("miss-damage-number");
  number.className = classes.join(" ");
  number.dataset.damageSource = source;
  number.dataset.damageKind = incoming ? "incoming" : (critical ? "critical" : (combo ? "combo" : "normal"));
  const numericDamage = Math.max(0, Math.floor(Number(entry.damage || 0)));
  number.textContent = options.textOverride !== undefined
    ? String(options.textOverride)
    : String(numericDamage).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const isCumulative = options.cumulative === true;
  const randomX = isCumulative ? 0 : randomInt(-12, 18);
  const randomY = isCumulative ? 0 : randomInt(-8, 8);
  const laneOffsetX = source === "summon" ? -46 : (source === "additional" ? 46 : 0);
  const laneOffsetY = source === "summon" ? 18 : (source === "additional" ? 2 : 0);
  const explicitOffsetX = Number(options.offsetX || 0);
  const explicitOffsetY = Number(options.offsetY || 0);
  const anchor = options._anchorSnapshot || captureDamageNumberAnchor(options.target);
  if (anchor) {
    const offsetX = laneOffsetX + explicitOffsetX + randomX;
    const offsetY = laneOffsetY + explicitOffsetY + randomY;
    if (Number.isFinite(Number(anchor.worldX)) && Number.isFinite(Number(anchor.worldY))) {
      const camera = typeof getMapCameraOffset === "function" ? getMapCameraOffset() : { x:0, y:0 };
      const worldX = Number(anchor.worldX) + offsetX;
      const worldY = Number(anchor.worldY) + offsetY;
      number.dataset.worldAnchorX = String(worldX);
      number.dataset.worldAnchorY = String(worldY);
      number.style.left = `${Math.round(worldX - Number(camera.x || 0))}px`;
      number.style.top = `${Math.round(worldY - Number(camera.y || 0))}px`;
    } else {
      number.style.left = `${Math.round(Number(anchor.x || 0) + offsetX)}px`;
      number.style.top = `${Math.round(Number(anchor.y || 0) + offsetY)}px`;
    }
  } else {
    number.style.left = `${760 + laneOffsetX + explicitOffsetX + randomX}px`;
    number.style.top = `${300 + laneOffsetY + explicitOffsetY + randomY}px`;
  }
  if (options.sequenceId) number.dataset.damageSequenceId = String(options.sequenceId);
  return number;
}
function removeCumulativeDamageSequence(sequenceId, expectedElement = null) {
  const key = String(sequenceId || "");
  const active = RO_WEB_DAMAGE_NUMBER_BATCH.activeSequences.get(key);
  if (!active || (expectedElement && active.element !== expectedElement)) return;
  if (active.removeTimer) clearTimeout(active.removeTimer);
  active.element?.remove();
  RO_WEB_DAMAGE_NUMBER_BATCH.activeSequences.delete(key);
}

// 0.9.82FN：同一段多段攻擊只維持一個 DOM，數字在完全相同位置逐段更新。
// 這能做出 RO 式「答、答、答」累積跳字，也避免高段數技能大量建立節點。
function renderCumulativeDamageEntry(entry, battleField, fragment = null) {
  const options = entry.options || {};
  const sequenceId = String(options.sequenceId || "");
  if (!sequenceId) return null;

  let active = RO_WEB_DAMAGE_NUMBER_BATCH.activeSequences.get(sequenceId);
  const fresh = createDamageNumberElement(entry);
  let number = active?.element || null;

  const targetClassName = fresh.className;
  const isNewElement = !number || !number.isConnected;
  if (isNewElement) {
    number = fresh;
    active = { element:number, removeTimer:null };
    RO_WEB_DAMAGE_NUMBER_BATCH.activeSequences.set(sequenceId, active);
    if (fragment) fragment.appendChild(number); else battleField.appendChild(number);
  } else {
    number.textContent = fresh.textContent;
    number.style.left = fresh.style.left;
    number.style.top = fresh.style.top;
    if (fresh.dataset.worldAnchorX && fresh.dataset.worldAnchorY) {
      number.dataset.worldAnchorX = fresh.dataset.worldAnchorX;
      number.dataset.worldAnchorY = fresh.dataset.worldAnchorY;
    } else {
      delete number.dataset.worldAnchorX;
      delete number.dataset.worldAnchorY;
    }
    number.dataset.damageSequenceId = sequenceId;
    // CSS animation 使用 !important，因此以移除／重加 class 的方式可靠重啟每一跳。
    number.className = targetClassName
      .split(/\s+/)
      .filter(name => name !== "cumulative-damage-number" && name !== "cumulative-damage-final")
      .join(" ");
    void number.offsetWidth;
    number.className = targetClassName;
  }

  if (active.removeTimer) clearTimeout(active.removeTimer);

  const isFinal = options.cumulativeFinal === true;
  const life = isFinal ? 3050 : Math.max(900, Number(options.hitIntervalMs || 100) * 4);
  active.removeTimer = setTimeout(() => removeCumulativeDamageSequence(sequenceId, number), life);
  return number;
}

function flushDamageNumberBatch() {
  RO_WEB_DAMAGE_NUMBER_BATCH.scheduled = false;
  if (!RO_WEB_DAMAGE_NUMBER_BATCH.queue.length) return;
  const battleField = document.getElementById("battle-field");
  if (!battleField) { RO_WEB_DAMAGE_NUMBER_BATCH.queue.length = 0; return; }
  const take = Math.min(RO_WEB_DAMAGE_NUMBER_BATCH.maxPerFrame, RO_WEB_DAMAGE_NUMBER_BATCH.queue.length);
  const batch = RO_WEB_DAMAGE_NUMBER_BATCH.queue.splice(0, take);
  const fragment = typeof document.createDocumentFragment === "function" ? document.createDocumentFragment() : null;
  for (const entry of batch) {
    if (entry.options?.cumulative === true && entry.options?.sequenceId) {
      renderCumulativeDamageEntry(entry, battleField, fragment);
      continue;
    }
    const number = createDamageNumberElement(entry);
    if (fragment) fragment.appendChild(number); else battleField.appendChild(number);
    setTimeout(() => number.remove(), 850);
  }
  if (fragment) battleField.appendChild(fragment);
  if (RO_WEB_DAMAGE_NUMBER_BATCH.queue.length) scheduleDamageNumberBatch();
}
function scheduleDamageNumberBatch() {
  if (RO_WEB_DAMAGE_NUMBER_BATCH.scheduled) return;
  RO_WEB_DAMAGE_NUMBER_BATCH.scheduled = true;
  const schedule = typeof requestAnimationFrame === "function" ? requestAnimationFrame : callback => setTimeout(callback, 0);
  schedule(flushDamageNumberBatch);
}
function enqueueDamageNumber(damage, options = {}) {
  RO_WEB_DAMAGE_NUMBER_BATCH.queue.push({ damage:Number(damage || 0), options });
  scheduleDamageNumberBatch();
}

// 0.9.82FP：傷害數字保存世界座標。玩家移動導致 Camera 改變時，
// 數字會跟地圖一起移動並停留在命中位置，不再黏著畫面中央的玩家。
function refreshWorldAnchoredDamageNumbers(camera = null) {
  const resolvedCamera = camera || (typeof getMapCameraOffset === "function" ? getMapCameraOffset() : { x:0, y:0 });
  const cameraX = Number(resolvedCamera?.x || 0);
  const cameraY = Number(resolvedCamera?.y || 0);
  document.querySelectorAll?.("#battle-field .damage-number[data-world-anchor-x][data-world-anchor-y]").forEach(number => {
    const worldX = Number(number.dataset.worldAnchorX);
    const worldY = Number(number.dataset.worldAnchorY);
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return;
    number.style.left = `${Math.round(worldX - cameraX)}px`;
    number.style.top = `${Math.round(worldY - cameraY)}px`;
  });
}
function showMissNumber(target = currentMonster, options = {}) {
  const anchor = captureDamageNumberAnchor(target);
  enqueueDamageNumber(0, {
    ...options,
    target,
    _anchorSnapshot:anchor,
    textOverride:"MISS",
    miss:true,
    cumulative:false,
    combo:false,
    critical:false
  });
  return true;
}
window.refreshWorldAnchoredDamageNumbers = refreshWorldAnchoredDamageNumbers;
window.showMissNumber = showMissNumber;

// 0.9.82FN：多段傷害在同一座標逐段更新累積值；中間節奏放慢，最後總傷放大並停留 3 秒。
// 最後一跳仍精確等於實際總傷。
// 為避免高段數技能建立過多 DOM，視覺節點最多 30 個，但計算總傷與最後結果完全不變。
function buildCumulativeDamageSteps(totalDamage, hitCount, maxVisualSteps = 30) {
  const total = Math.max(0, Math.floor(Number(totalDamage || 0)));
  const hits = Math.max(1, Math.floor(Number(hitCount || 1)));
  const visualSteps = Math.max(1, Math.min(hits, Math.max(1, Number(maxVisualSteps || 30))));
  const values = [];
  for (let step = 1; step <= visualSteps; step += 1) {
    const representedHit = Math.max(1, Math.ceil(step * hits / visualSteps));
    const value = step === visualSteps ? total : Math.max(1, Math.floor(total * representedHit / hits));
    if (!values.length || value > values[values.length - 1]) values.push(value);
  }
  if (!values.length || values[values.length - 1] !== total) values.push(total);
  return values;
}
function showDamageNumber(damage, options = {}) {
  const target = options.target || currentMonster || null;
  const total = Math.max(0, Math.floor(Number(damage || 0)));
  const hitCount = Math.max(1, Math.floor(Number(options.hitCount || options.visualHits || options.damageHitCount || 1)));
  const anchor = captureDamageNumberAnchor(target);
  if (hitCount <= 1 || options.cumulative === false || total <= 0) {
    enqueueDamageNumber(total, { ...options, target, _anchorSnapshot:anchor });
    return;
  }
  const sequenceId = `damage_${Date.now()}_${++RO_WEB_DAMAGE_NUMBER_BATCH.sequence}`;
  const values = buildCumulativeDamageSteps(total, hitCount, options.maxVisualSteps || 30);
  const intervalMs = Math.max(80, Math.min(150, Number(options.hitIntervalMs || (values.length >= 15 ? 85 : (values.length >= 8 ? 100 : 115)))));
  values.forEach((value, index) => {
    const emit = () => enqueueDamageNumber(value, {
      ...options,
      target,
      _anchorSnapshot:anchor,
      hitCount:1,
      combo:true,
      cumulative:true,
      cumulativeStep:index,
      cumulativeFinal:index === values.length - 1,
      hitIntervalMs:intervalMs,
      sequenceId
    });
    if (index === 0) emit(); else setTimeout(emit, intervalMs * index);
  });
}
function showAdditionalDamageNumber(damage, target = currentMonster, options = {}) {
  const amount = Math.max(0, Math.floor(Number(damage || 0)));
  if (amount <= 0) return false;
  showDamageNumber(amount, {
    ...options,
    target: target || currentMonster || null,
    source: "additional",
    combo: true,
    critical: false
  });
  return true;
}
window.buildCumulativeDamageSteps = buildCumulativeDamageSteps;
window.showDamageNumber = showDamageNumber;
window.showAdditionalDamageNumber = showAdditionalDamageNumber;
window.flushDamageNumberBatch = flushDamageNumberBatch;

// 斬擊特效
// 0.9.82FJ：每次攻擊建立獨立短生命週期特效，不再重設同一個 DOM。
// 高 ASPD 時各次特效能依攻擊週期完成，也不會被下一擊截斷。
function showSlashEffect(options = {}) {
  const template = document.getElementById("slashEffect");
  const playerSprite = document.getElementById("player-sprite");
  const host = template?.parentElement || playerSprite;
  if (!host) return false;

  const requested = Number(options.duration || 0);
  const duration = Math.max(70, requested > 0 ? requested : getPlayerAttackEffectDurationMs());
  const effect = document.createElement("div");
  effect.className = "slash-effect attack-effect-instance play";
  effect.setAttribute("aria-hidden", "true");
  effect.style.setProperty("--ro-slash-duration", `${Math.round(duration)}ms`);
  host.appendChild(effect);

  // 極端連發時只保留最近幾個特效，避免 DOM 無限制累積。
  const active = host.querySelectorAll(".slash-effect.attack-effect-instance");
  if (active.length > 5) {
    for (let index = 0; index < active.length - 5; index += 1) active[index]?.remove?.();
  }
  setTimeout(() => effect.remove(), duration + 48);
  return true;
}

// 戰鬥紀錄，最多保留 100 行；玩家往上查看時暫停自動追蹤最新訊息
const RO_WEB_MAX_BATTLE_LOG_LINES = 100;

function isBattleLogAtBottom(logBox) {
  if (!logBox) return true;
  const threshold = 8;
  return (logBox.scrollHeight - logBox.scrollTop - logBox.clientHeight) <= threshold;
}

function getBattleLogNotice() {
  let notice = document.getElementById("battle-log-new-notice");
  const panel = document.getElementById("battle-log");
  if (!notice && panel) {
    notice = document.createElement("button");
    notice.id = "battle-log-new-notice";
    notice.type = "button";
    notice.textContent = "▼ 新訊息";
    notice.onclick = () => {
      const logBox = document.getElementById("battle-log-list");
      if (!logBox) return;
      logBox.dataset.autoScroll = "1";
      logBox.scrollTop = logBox.scrollHeight;
      notice.classList.remove("show");
      notice.dataset.count = "0";
      notice.textContent = "▼ 新訊息";
    };
    panel.appendChild(notice);
  }
  return notice;
}

function setupBattleLogScrollState(logBox) {
  if (!logBox || logBox.dataset.scrollStateReady === "1") return;
  logBox.dataset.scrollStateReady = "1";
  logBox.dataset.autoScroll = "1";

  logBox.addEventListener("scroll", () => {
    const atBottom = isBattleLogAtBottom(logBox);
    logBox.dataset.autoScroll = atBottom ? "1" : "0";
    if (atBottom) {
      const notice = getBattleLogNotice();
      if (notice) {
        notice.classList.remove("show");
        notice.dataset.count = "0";
        notice.textContent = "▼ 新訊息";
      }
    }
  });
}

function getBattleLogType(text) {
  const msg = String(text || "");
  if (/需要使用坐騎才能使用該技能/.test(msg)) return "error";
  if (/：使用 .*造成.*傷害/.test(msg)) return "summon-damage";
  if (/死亡|陣亡|倒下|死/.test(msg)) return "death";
  if (/稀有|★★★★|卡片|裝備掉落/.test(msg)) return "rare";
  if (/獲得道具|獲得：|取得道具|掉落|x\s*\d+|×\s*\d+/.test(msg)) return "item";
  if (/Zeny|zeny|金錢|金幣/.test(msg)) return "zeny";
  if (/Base EXP|Base經驗|Base 經驗/.test(msg)) return "base-exp";
  if (/Job EXP|Job經驗|Job 經驗/.test(msg)) return "job-exp";
  if (/對你造成|攻擊你|受到.*傷害/.test(msg)) return "monster-damage";
  if (/你對|造成\s*\d+\s*點傷害|造成.*傷害/.test(msg)) return "player-damage";
  if (/技能|配點|施放|確認配點|初始化|重置/.test(msg)) return "skill";
  return "system";
}

function addBattleLog(text, type = null) {
  const logBox = document.getElementById("battle-log-list");

  if (!logBox) {
    console.log(text);
    return;
  }

  setupBattleLogScrollState(logBox);

  const shouldAutoScroll = logBox.dataset.autoScroll !== "0" || isBattleLogAtBottom(logBox);

  const line = document.createElement("div");
  const logType = type || getBattleLogType(text);
  line.className = `log-line log-${logType}`;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = `[${hh}:${mm}:${ss}]`;

  const body = document.createElement("span");
  body.className = "log-text";
  body.textContent = ` ${text}`;

  line.appendChild(time);
  line.appendChild(body);
  logBox.appendChild(line);

  while (logBox.children.length > RO_WEB_MAX_BATTLE_LOG_LINES) {
    logBox.removeChild(logBox.firstChild);
  }

  if (shouldAutoScroll) {
    logBox.dataset.autoScroll = "1";
    requestAnimationFrame(() => {
      logBox.scrollTop = logBox.scrollHeight;
    });
  } else {
    const notice = getBattleLogNotice();
    if (notice) {
      const count = Number(notice.dataset.count || "0") + 1;
      notice.dataset.count = String(count);
      notice.textContent = `▼ 新訊息(${count})`;
      notice.classList.add("show");
    }
  }
}

// Append several reward/death messages with one DOM mutation and one scroll read.
function addBattleLogBatch(entries = []) {
  const logBox = document.getElementById("battle-log-list");
  if (!logBox || !Array.isArray(entries) || !entries.length) return;
  setupBattleLogScrollState(logBox);
  const shouldAutoScroll = logBox.dataset.autoScroll !== "0" || isBattleLogAtBottom(logBox);
  const fragment = document.createDocumentFragment();
  const now = new Date();
  const stamp = `[${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}]`;
  for (const raw of entries) {
    const entry = typeof raw === "string" ? { text:raw } : (raw || {});
    const line = document.createElement("div");
    line.className = `log-line log-${entry.type || getBattleLogType(entry.text)}`;
    const time = document.createElement("span");
    time.className = "log-time";
    time.textContent = stamp;
    const body = document.createElement("span");
    body.className = "log-text";
    body.textContent = ` ${String(entry.text || "")}`;
    line.append(time, body);
    fragment.appendChild(line);
  }
  logBox.appendChild(fragment);
  while (logBox.children.length > RO_WEB_MAX_BATTLE_LOG_LINES) logBox.removeChild(logBox.firstChild);
  if (shouldAutoScroll) {
    logBox.dataset.autoScroll = "1";
    requestAnimationFrame(() => { logBox.scrollTop = logBox.scrollHeight; });
  } else {
    const notice = getBattleLogNotice();
    if (notice) {
      const count = Number(notice.dataset.count || "0") + entries.length;
      notice.dataset.count = String(count);
      notice.textContent = `▼ 新訊息(${count})`;
      notice.classList.add("show");
    }
  }
}
window.addBattleLogBatch = addBattleLogBatch;

// 陣列隨機取一個
function getRandomFromArray(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// 隨機整數
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
