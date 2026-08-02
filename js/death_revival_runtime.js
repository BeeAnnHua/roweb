//============================================================
// RO_WEB 0.9.82IC — Death / Revival Runtime
// 手動死亡 UI、原地復活之證、自動掛機死亡策略、回城復活
//============================================================
(() => {
  "use strict";

  const VERSION = "0.9.82IC";
  const TOKEN_ITEM_ID = 7621;
  const TOKEN_BOX_ITEM_ID = 12922;
  const DEFAULT_CITY_ID = "prontera";

  const state = {
    dead: false,
    resolving: false,
    autoBattleWasRunning: false,
    defeatedBy: "怪物",
    deadAt: 0,
    revealTimer: null
  };

  function getPlayer() {
    try {
      if (typeof player !== "undefined") return player;
    } catch (_) {}
    return window.player || null;
  }

  function getTokenCount() {
    try {
      if (typeof countInventoryItem === "function") return Math.max(0, Number(countInventoryItem(TOKEN_ITEM_ID) || 0));
    } catch (_) {}
    const target = getPlayer();
    const row = (target?.inventory || []).find(item => String(item?.id) === String(TOKEN_ITEM_ID));
    return Math.max(0, Number(row?.count || 0));
  }

  function consumeToken() {
    try {
      if (typeof consumeInventoryItemCount === "function") return consumeInventoryItemCount(TOKEN_ITEM_ID, 1) === true;
    } catch (_) {}
    const target = getPlayer();
    if (!target || !Array.isArray(target.inventory)) return false;
    const row = target.inventory.find(item => String(item?.id) === String(TOKEN_ITEM_ID));
    if (!row || Number(row.count || 0) < 1) return false;
    row.count = Number(row.count || 0) - 1;
    if (row.count <= 0) target.inventory = target.inventory.filter(item => item !== row);
    return true;
  }

  function saveNow(reason) {
    try {
      if (window.ROWebSaveManager?.saveNow) return window.ROWebSaveManager.saveNow({ reason: reason || "death-revival" });
      if (typeof saveGame === "function") return saveGame({ reason: reason || "death-revival" });
    } catch (error) {
      console.warn("DeathRevivalRuntime save failed:", error);
    }
    return false;
  }

  function refreshAutoCombatTokenCount() {
    const node = document.getElementById("autoCombatReviveTokenCount");
    if (node) node.textContent = `持有 ${getTokenCount()} 個`;
    return getTokenCount();
  }

  function getModalElements() {
    return {
      overlay: document.getElementById("playerDeathModal"),
      cause: document.getElementById("playerDeathCause"),
      tokenButton: document.getElementById("deathReviveTokenButton"),
      tokenCount: document.getElementById("deathReviveTokenCount"),
      returnButton: document.getElementById("deathReturnVillageButton")
    };
  }

  function refreshModal() {
    const count = getTokenCount();
    const { overlay, cause, tokenButton, tokenCount, returnButton } = getModalElements();
    if (cause) cause.textContent = `你被 ${state.defeatedBy || "怪物"} 擊敗了。`;
    if (tokenCount) tokenCount.textContent = `持有 ${count} 個`;
    if (tokenButton) {
      tokenButton.disabled = state.resolving || count <= 0;
      tokenButton.setAttribute("aria-disabled", tokenButton.disabled ? "true" : "false");
      tokenButton.title = count > 0 ? "消耗 1 個原地復活之證，在目前位置復活" : "背包中沒有原地復活之證";
    }
    if (returnButton) returnButton.disabled = state.resolving;
    if (overlay) {
      overlay.hidden = !state.dead;
      overlay.classList.toggle("is-resolving", state.resolving);
    }
    document.body?.classList.toggle("player-death-modal-open", state.dead);
    refreshAutoCombatTokenCount();
    return count;
  }

  function showDeathModal() {
    state.dead = true;
    try { if (typeof clearPlayerMovementForDeath === "function") clearPlayerMovementForDeath(); } catch (_) {}
    refreshModal();
    const button = document.getElementById(getTokenCount() > 0 ? "deathReviveTokenButton" : "deathReturnVillageButton");
    if (button && typeof button.focus === "function") setTimeout(() => button.focus({ preventScroll: true }), 0);
    return true;
  }

  function hideDeathModal() {
    const overlay = document.getElementById("playerDeathModal");
    if (overlay) overlay.hidden = true;
    document.body?.classList.remove("player-death-modal-open");
  }

  function clearDeathAnimation() {
    try {
      if (typeof clearROStudioPlayerMotionOverride === "function") clearROStudioPlayerMotionOverride();
    } catch (_) {}
  }

  function stopAllCombatForDeath() {
    window.RO_WEB_AUTO_BATTLE_RESUME_PENDING = false;
    try {
      if (typeof clearPlayerMovementForDeath === "function") clearPlayerMovementForDeath();
      else {
        const target = getPlayer();
        if (target) {
          target.position = target.position || {};
          target.position.targetX = null;
          target.position.targetY = null;
          target.state = "Dead";
        }
      }
    } catch (_) {}
    try {
      if (typeof stopAutoBattle === "function") stopAutoBattle({ silent: true });
    } catch (_) {}
    try {
      if (typeof stopManualMonsterAttack === "function") stopManualMonsterAttack({ clearTarget: true, silent: true });
    } catch (_) {}
    try {
      if (typeof clearBattleTimersAndMonster === "function") clearBattleTimersAndMonster({ clearMonster: false });
    } catch (_) {}
    try {
      if (typeof currentMonster !== "undefined") currentMonster = null;
    } catch (_) {}
    try {
      if (typeof updateMonsterUI === "function") updateMonsterUI();
    } catch (_) {}
    try {
      if (typeof updateAutoBattleQuickToggleState === "function") updateAutoBattleQuickToggleState();
    } catch (_) {}
  }

  function restorePlayerVitals() {
    const target = getPlayer();
    if (!target) return false;
    try {
      if (typeof recalculatePlayerStats === "function") recalculatePlayerStats();
    } catch (_) {}
    target.hp = Math.max(1, Number(target.maxHp || 1));
    target.sp = Math.max(0, Number(target.maxSp || 0));
    target.state = target.currentCity ? "Town" : "Idle";
    clearDeathAnimation();
    try {
      if (typeof updatePlayerUI === "function") updatePlayerUI();
      if (typeof updateInventoryUI === "function") updateInventoryUI();
      if (typeof updateAutoCombatUI === "function") updateAutoCombatUI();
    } catch (_) {}
    return true;
  }

  function completeRevivalState() {
    if (state.revealTimer) clearTimeout(state.revealTimer);
    state.revealTimer = null;
    state.dead = false;
    state.resolving = false;
    state.autoBattleWasRunning = false;
    state.defeatedBy = "怪物";
    state.deadAt = 0;
    hideDeathModal();
    refreshAutoCombatTokenCount();
  }

  function shouldAutoUseToken() {
    const target = getPlayer();
    return state.autoBattleWasRunning === true
      && target?.autoCombat?.death?.autoUseToken === true;
  }

  function reviveWithToken(options = {}) {
    const target = getPlayer();
    const automatic = options.automatic === true;
    const resumeAuto = options.resumeAuto === true;
    if (!target || state.resolving) return false;
    if (Number(target.hp || 0) > 0 && !state.dead) return false;
    if (getTokenCount() <= 0) {
      if (typeof addBattleLog === "function") addBattleLog("沒有原地復活之證，無法原地復活。");
      showDeathModal();
      return false;
    }

    state.resolving = true;
    refreshModal();
    if (!consumeToken()) {
      state.resolving = false;
      refreshModal();
      if (typeof addBattleLog === "function") addBattleLog("原地復活之證扣除失敗，未進行復活。");
      return false;
    }

    restorePlayerVitals();
    completeRevivalState();
    saveNow(automatic ? "auto-token-revive" : "manual-token-revive");
    if (typeof addBattleLog === "function") {
      addBattleLog(automatic
        ? "自動使用 1 個原地復活之證，在原地復活並恢復 HP／SP。"
        : "使用 1 個原地復活之證，在原地復活並恢復 HP／SP。");
    }

    if (resumeAuto && !target.currentCity && typeof currentMap !== "undefined" && currentMap) {
      setTimeout(() => {
        if (Number(target.hp || 0) <= 0 || target.currentCity) return;
        if (typeof resetAutoBattleController === "function") {
          resetAutoBattleController({ running: false, keepTarget: false, reason: "token_revive" });
        }
        if (typeof startAutoBattle === "function") startAutoBattle();
      }, 120);
    }
    return true;
  }

  function resolveReturnCityId() {
    const target = getPlayer();
    const configured = String(target?.autoCombat?.teleport?.returnHome?.cityId || "").trim();
    if (configured) {
      try {
        if (typeof getCityData !== "function" || getCityData(configured)) return configured;
      } catch (_) {}
    }
    try {
      if (typeof getCityData !== "function" || getCityData(DEFAULT_CITY_ID)) return DEFAULT_CITY_ID;
    } catch (_) {}
    try {
      const first = Array.isArray(cities) ? cities.find(city => city?.id) : null;
      if (first?.id) return String(first.id);
    } catch (_) {}
    return DEFAULT_CITY_ID;
  }

  function returnToVillage() {
    const target = getPlayer();
    if (!target || state.resolving) return false;
    state.resolving = true;
    refreshModal();
    const cityId = resolveReturnCityId();
    const wasAutoBattle = state.autoBattleWasRunning === true;
    restorePlayerVitals();
    completeRevivalState();

    let entered = false;
    try {
      if (typeof enterCity === "function") {
        enterCity(cityId, { wasAutoBattle, source: "death_return" });
        entered = true;
      }
    } catch (error) {
      console.error("DeathRevivalRuntime enterCity failed:", error);
    }
    if (!entered) {
      target.currentCity = cityId;
      target.state = "Town";
      if (target.map) target.lastFieldMap = target.map;
      target.map = null;
      try {
        if (typeof updateTownUI === "function") updateTownUI();
        if (typeof updateMapUI === "function") updateMapUI();
        if (typeof updatePlayerUI === "function") updatePlayerUI();
      } catch (_) {}
      saveNow("death-return-village-fallback");
    }
    if (typeof addBattleLog === "function") addBattleLog("死亡後返回村莊並恢復 HP／SP。");
    return true;
  }

  function revealDeathChoice() {
    state.revealTimer = null;
    if (!state.dead) return false;
    if (shouldAutoUseToken() && getTokenCount() > 0) {
      return reviveWithToken({ automatic: true, resumeAuto: true });
    }
    if (shouldAutoUseToken() && getTokenCount() <= 0 && typeof addBattleLog === "function") {
      addBattleLog("自動復活已啟用，但背包中沒有原地復活之證；自動掛機已停止。");
    }
    return showDeathModal();
  }

  function handleDeath(options = {}) {
    const target = getPlayer();
    if (!target) return false;
    if (state.dead || state.resolving) {
      refreshModal();
      return true;
    }

    if (window.roWebPlayerDeathRecoveryTimer) {
      clearTimeout(window.roWebPlayerDeathRecoveryTimer);
      window.roWebPlayerDeathRecoveryTimer = null;
    }

    state.dead = true;
    state.resolving = false;
    state.autoBattleWasRunning = options.wasAutoBattle === true;
    state.defeatedBy = String(options.defeatedBy || "怪物");
    state.deadAt = Date.now();
    target.hp = 0;

    try {
      if (typeof playROStudioPlayerMotion === "function") {
        playROStudioPlayerMotion("dead", { duration: 900, holdLast: true });
      }
    } catch (_) {}
    if (typeof addBattleLog === "function") addBattleLog(`你被 ${state.defeatedBy} 擊敗了。`);
    stopAllCombatForDeath();
    try {
      if (typeof updatePlayerUI === "function") updatePlayerUI();
    } catch (_) {}
    saveNow("player-death");

    const motionDuration = Math.max(900, Number(
      typeof getROStudioMotionDuration === "function" ? getROStudioMotionDuration("dead") : 0
    ) || 0);
    state.revealTimer = setTimeout(revealDeathChoice, motionDuration);
    return true;
  }

  function recoverPersistedDeathState() {
    const target = getPlayer();
    if (!target || Number(target.hp || 0) > 0) {
      if (!state.dead) hideDeathModal();
      refreshAutoCombatTokenCount();
      return false;
    }
    state.dead = true;
    state.resolving = false;
    state.autoBattleWasRunning = false;
    state.defeatedBy = "怪物";
    state.deadAt = Date.now();
    stopAllCombatForDeath();
    try {
      if (typeof playROStudioPlayerMotion === "function") {
        playROStudioPlayerMotion("dead", { duration: 1, holdLast: true });
      }
    } catch (_) {}
    showDeathModal();
    return true;
  }

  function isDead() {
    const target = getPlayer();
    return state.dead === true || Number(target?.hp || 0) <= 0;
  }

  function bindDeathInputShield() {
    const overlay = document.getElementById("playerDeathModal");
    if (!overlay || overlay.dataset.deathInputShieldBound === "1") return;
    overlay.dataset.deathInputShieldBound = "1";
    const stop = event => {
      if (!state.dead && Number(getPlayer()?.hp || 0) > 0) return;
      // Buttons still receive their own target handlers; bubbling stops here so the
      // world-camera/document movement fallback cannot interpret the same gesture.
      event.stopPropagation?.();
    };
    overlay.addEventListener("pointerdown", stop, { passive: true });
    overlay.addEventListener("touchstart", stop, { passive: true });
    overlay.addEventListener("click", stop);
  }

  window.useDeathReviveToken = () => reviveWithToken({ automatic: false, resumeAuto: false });
  window.returnDeadPlayerToVillage = returnToVillage;
  window.updateDeathRevivalUI = refreshModal;
  window.updateDeathAutoCombatTokenCount = refreshAutoCombatTokenCount;
  window.DeathRevivalRuntime = Object.freeze({
    version: VERSION,
    tokenItemId: TOKEN_ITEM_ID,
    tokenBoxItemId: TOKEN_BOX_ITEM_ID,
    getState: () => ({ ...state, tokenCount: getTokenCount() }),
    getTokenCount,
    handleDeath,
    showDeathModal,
    hideDeathModal,
    reviveWithToken,
    returnToVillage,
    recoverPersistedDeathState,
    refreshUI: refreshModal,
    isDead
  });

  window.addEventListener("ro-web-ready", () => setTimeout(recoverPersistedDeathState, 0), { once: true });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      bindDeathInputShield();
      refreshAutoCombatTokenCount();
    }, { once: true });
  } else {
    bindDeathInputShield();
    refreshAutoCombatTokenCount();
  }
})();
