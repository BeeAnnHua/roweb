// ============================================================
// 彼岸花仙境 / RO_WEB
// V0.9.85P - Right HUD Account Menu / manual save centralized in gear settings
// - Persistent black/gold gear beside HUD fold button
// - Shows current Player ID, account name and character name
// - Safe character switch / account switch / sign out with save flush
// ============================================================
(function(){
  "use strict";

  const VERSION = "0.9.87L";
  const $ = id => document.getElementById(id);
  const UI_STATE_KEY = "ro_web_account_menu_ui_v1";
  const VALID_SIZES = new Set(["small","medium","large"]);
  let uiStateLoaded = false;
  let uiState = { size:"medium", x:null, y:null };

  function loadUiState(){
    if (uiStateLoaded) return uiState;
    uiStateLoaded = true;
    try {
      const raw = JSON.parse(localStorage.getItem(UI_STATE_KEY) || "null");
      if (raw && VALID_SIZES.has(String(raw.size))) uiState.size = String(raw.size);
      if (raw && Number.isFinite(Number(raw.x)) && Number.isFinite(Number(raw.y))) {
        uiState.x = Number(raw.x);
        uiState.y = Number(raw.y);
      }
    } catch (_) {}
    return uiState;
  }

  function saveUiState(){
    try { localStorage.setItem(UI_STATE_KEY, JSON.stringify(uiState)); } catch (_) {}
  }

  function clampPosition(x, y, menu){
    const margin = 8;
    const rect = menu.getBoundingClientRect();
    const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxY = Math.max(margin, window.innerHeight - rect.height - margin);
    return {
      x: Math.min(Math.max(margin, Number(x) || margin), maxX),
      y: Math.min(Math.max(margin, Number(y) || margin), maxY)
    };
  }

  function applyPosition(x, y, persist=true){
    const menu = $("rightHudAccountMenu");
    if (!menu) return false;
    const next = clampPosition(x, y, menu);
    menu.style.setProperty("left", `${Math.round(next.x)}px`, "important");
    menu.style.setProperty("top", `${Math.round(next.y)}px`, "important");
    menu.style.setProperty("right", "auto", "important");
    menu.style.setProperty("bottom", "auto", "important");
    if (persist) {
      uiState.x = next.x;
      uiState.y = next.y;
      saveUiState();
    }
    return true;
  }

  function sizeLabel(size){
    return size === "small" ? "小" : (size === "large" ? "大" : "中");
  }

  function applySize(size, persist=true){
    const menu = $("rightHudAccountMenu");
    if (!menu) return false;
    const next = VALID_SIZES.has(String(size)) ? String(size) : "medium";
    menu.dataset.size = next;
    const cycle = $("accountMenuSizeCycle");
    if (cycle) {
      const label = sizeLabel(next);
      cycle.textContent = label;
      cycle.setAttribute("aria-label", `切換視窗大小，目前${label}`);
      cycle.setAttribute("title", `視窗大小：${label}（點擊切換小／中／大）`);
      cycle.dataset.currentSize = next;
    }
    if (persist) {
      uiState.size = next;
      saveUiState();
    }
    requestAnimationFrame(() => {
      if (uiState.x != null && uiState.y != null) applyPosition(uiState.x, uiState.y, false);
    });
    return true;
  }

  function cycleSize(){
    const menu = $("rightHudAccountMenu");
    if (!menu) return false;
    const current = VALID_SIZES.has(menu.dataset.size) ? menu.dataset.size : "medium";
    const next = current === "small" ? "medium" : (current === "medium" ? "large" : "small");
    return applySize(next, true);
  }

  function restoreWindowUi(){
    loadUiState();
    applySize(uiState.size, false);
    const menu = $("rightHudAccountMenu");
    if (!menu) return;
    requestAnimationFrame(() => {
      if (uiState.x != null && uiState.y != null) {
        applyPosition(uiState.x, uiState.y, false);
      } else {
        const rect = menu.getBoundingClientRect();
        const x = Math.max(8, window.innerWidth - rect.width - 18);
        const y = Math.max(8, Math.min(86, window.innerHeight - rect.height - 8));
        applyPosition(x, y, false);
      }
    });
  }

  function text(value, fallback = "—") {
    const raw = String(value ?? "").trim();
    return raw || fallback;
  }

  function getSnapshot(){
    const cloud = window.ROWebCloudRuntime?.getAccount?.() || {};
    const active = window.CharacterSlotsRuntime?.getActiveCharacter?.() || {};
    const characterName = text(
      window.player?.name || active?.summary?.name || active?.seed?.name,
      "尚未進入角色"
    );
    return {
      playerId: text(cloud.player_id, "—"),
      accountName: text(cloud.account_name, "—"),
      characterName,
      role: text(cloud.account_role, "player"),
      vipActive: window.VIPRuntime?.isActive?.(cloud) === true,
      vipText: window.VIPRuntime?.formatExpiry?.(cloud) || "非 VIP"
    };
  }

  function refresh(){
    const data = getSnapshot();
    if ($("accountMenuPlayerId")) $("accountMenuPlayerId").textContent = data.playerId === "—" ? "—" : `#${data.playerId}`;
    if ($("accountMenuCharacterName")) $("accountMenuCharacterName").textContent = data.characterName;
    if ($("accountMenuAccountName")) $("accountMenuAccountName").textContent = data.accountName;
    if ($("accountMenuRole")) {
      const isGm = String(data.role).toLowerCase() === "gm";
      $("accountMenuRole").textContent = isGm ? "GM" : "PLAYER";
      $("accountMenuRole").classList.toggle("is-gm", isGm);
    }
    if ($("accountMenuVip")) {
      $("accountMenuVip").textContent = data.vipActive ? data.vipText : "未啟用";
      $("accountMenuVip").classList.toggle("is-vip", data.vipActive);
    }
    try { window.ROWebOfflineContinuity?.updateUi?.(); } catch (_) {}
    return data;
  }

  function setOpen(open){
    const menu = $("rightHudAccountMenu");
    const button = $("rightHudAccountButton");
    if (!menu || !button) return false;
    const value = open === true;
    if (value) {
      refresh();
      menu.hidden = false;
      restoreWindowUi();
      requestAnimationFrame(() => $("rightHudAccountMenuClose")?.focus?.({ preventScroll:true }));
    } else {
      menu.hidden = true;
    }
    button.setAttribute("aria-expanded", value ? "true" : "false");
    button.classList.toggle("is-open", value);
    return value;
  }

  function toggle(){
    const menu = $("rightHudAccountMenu");
    if (!menu) return false;
    return setOpen(menu.hidden);
  }

  function close(){ return setOpen(false); }

  async function saveBeforeLeave(reason){
    try {
      if (typeof window.saveGameAndWait === "function") {
        await window.saveGameAndWait({ reason:String(reason || "account-menu"), forceWriter:true, durableDelayMs:0 });
      } else if (typeof window.saveGame === "function") {
        window.saveGame({ reason:String(reason || "account-menu"), forceWriter:true });
      }
      if (!window.ROWebOfflineContinuity?.isOffline?.() && window.ROWebCloudRuntime?.saveSharedStorage && typeof window.getAccountStorageSnapshot === "function") {
        await window.ROWebCloudRuntime.saveSharedStorage(window.getAccountStorageSnapshot());
      }
    } catch (error) {
      console.warn("帳號選單：離開前角色／倉庫同步未完成。", error);
    }
  }

  async function saveNow(){
    const button = $("accountMenuSaveButton");
    const label = button?.querySelector("b");
    if (button) button.disabled = true;
    if (label) label.textContent = "存檔中…";
    try {
      const ok = typeof window.manualSaveGame === "function"
        ? await window.manualSaveGame()
        : (typeof window.saveGameAndWait === "function"
            ? await window.saveGameAndWait({ reason:"account-menu-manual", forceWriter:true, durableDelayMs:0 })
            : false);
      const offline = window.ROWebOfflineContinuity?.isOffline?.() === true;
      if (ok && !offline && window.ROWebCloudRuntime?.saveSharedStorage && typeof window.getAccountStorageSnapshot === "function") {
        await window.ROWebCloudRuntime.saveSharedStorage(window.getAccountStorageSnapshot());
      }
      if (label) label.textContent = ok ? (offline ? "本機已存" : "存檔完成") : "存檔未完成";
      window.setTimeout(() => { if (label) label.textContent = "手動存檔"; if (button) button.disabled = false; }, 1100);
      return Boolean(ok);
    } catch (error) {
      console.warn("帳號選單：手動存檔失敗。", error);
      if (label) label.textContent = "存檔失敗";
      window.setTimeout(() => { if (label) label.textContent = "手動存檔"; if (button) button.disabled = false; }, 1400);
      return false;
    }
  }

  async function toggleOfflineMode(){
    close();
    const runtime = window.ROWebOfflineContinuity;
    if (!runtime?.requestManualOffline) {
      window.ROGoldUI?.alert?.("本地遊玩模組尚未完成載入，請重新整理後再試。", { title:"本地遊玩" });
      return false;
    }
    return runtime.requestManualOffline();
  }

  function renameCharacter(){
    if (window.ROWebOfflineContinuity?.isOffline?.()) return window.ROWebOfflineContinuity.guard("character", "更改角色名稱");
    close();
    if (!window.player) {
      window.ROGoldUI?.alert?.("請先進入角色後再更改角色名稱。", { title:"更改角色名稱" });
      return false;
    }
    if (typeof window.openPlayerIdEditor === "function") {
      window.openPlayerIdEditor();
      return true;
    }
    return false;
  }

  async function switchCharacter(){
    if (window.ROWebOfflineContinuity?.isOffline?.()) return window.ROWebOfflineContinuity.guard("character", "切換人物");
    close();
    window.ROWebLoadingScreen?.navigate?.("正在切換人物…");
    const runtime = window.CharacterSlotsRuntime;
    if (!runtime?.returnToCharacterSelection) return false;
    await runtime.returnToCharacterSelection();
    return true;
  }

  async function switchAccount(){
    if (window.ROWebOfflineContinuity?.isOffline?.()) return window.ROWebOfflineContinuity.guard("character", "切換帳號");
    close();
    window.ROWebLoadingScreen?.navigate?.("正在切換遊戲帳號…");
    await saveBeforeLeave("switch-account");
    if (window.ROWebCloudRuntime?.openAccountCenter) {
      window.ROWebCloudRuntime.openAccountCenter();
      return true;
    }
    return false;
  }

  async function signOut(){
    if (window.ROWebOfflineContinuity?.isOffline?.()) return window.ROWebOfflineContinuity.guard("character", "登出帳號");
    const accountName = getSnapshot().accountName;
    const message = `確定要登出${accountName && accountName !== "—" ? `「${accountName}」` : "目前帳號"}嗎？\n離開前會先嘗試同步目前角色進度。`;
    let ok = false;
    if (window.ROGoldUI?.confirm) {
      ok = await window.ROGoldUI.confirm(message, { title:"登出帳號", confirmText:"登出", danger:true });
    } else {
      ok = window.confirm(message);
    }
    if (!ok) return false;
    close();
    window.ROWebLoadingScreen?.navigate?.("正在登出帳號…");
    await saveBeforeLeave("account-sign-out");
    await window.ROWebCloudRuntime?.signOut?.();
    return true;
  }

  function init(){
    const menu = $("rightHudAccountMenu");
    const button = $("rightHudAccountButton");
    const handle = $("rightHudAccountMenuDragHandle");
    if (!menu || !button) return false;

    loadUiState();
    applySize(uiState.size, false);
    setOpen(false);

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      toggle();
    });
    menu.addEventListener("click", event => event.stopPropagation());
    $("rightHudAccountMenuClose")?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      close();
    });
    $("rightHudCollapseToggle")?.addEventListener("click", () => close());

    $("accountMenuSizeCycle")?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      cycleSize();
    });

    if (handle) {
      let drag = null;
      handle.addEventListener("pointerdown", event => {
        if (event.button !== undefined && event.button !== 0) return;
        if (event.target.closest("button,[role='button'],input,select,a")) return;
        const rect = menu.getBoundingClientRect();
        drag = {
          pointerId:event.pointerId,
          dx:event.clientX - rect.left,
          dy:event.clientY - rect.top
        };
        menu.classList.add("is-dragging");
        try { handle.setPointerCapture(event.pointerId); } catch (_) {}
        event.preventDefault();
      });
      handle.addEventListener("pointermove", event => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        applyPosition(event.clientX - drag.dx, event.clientY - drag.dy, false);
        event.preventDefault();
      });
      const finishDrag = event => {
        if (!drag || (event?.pointerId != null && event.pointerId !== drag.pointerId)) return;
        const rect = menu.getBoundingClientRect();
        uiState.x = rect.left;
        uiState.y = rect.top;
        saveUiState();
        menu.classList.remove("is-dragging");
        try { handle.releasePointerCapture(drag.pointerId); } catch (_) {}
        drag = null;
      };
      handle.addEventListener("pointerup", finishDrag);
      handle.addEventListener("pointercancel", finishDrag);
    }

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !menu.hidden) close();
    });
    window.addEventListener("resize", () => {
      if (!menu.hidden) {
        const rect = menu.getBoundingClientRect();
        applyPosition(rect.left, rect.top, false);
      }
    });
    window.addEventListener("ro-web-ready", refresh);
    window.addEventListener("ro-web-cloud-sync-state", refresh);
    window.addEventListener("ro-web-offline-state", refresh);
    refresh();
    return true;
  }

  window.ROWebAccountMenu = Object.freeze({
    version: VERSION,
    init,
    refresh,
    toggle,
    close,
    setSize: applySize,
    saveNow,
    toggleOfflineMode,
    renameCharacter,
    switchCharacter,
    switchAccount,
    signOut,
    getSnapshot
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once:true });
  else init();
})();
