// ============================================================
// 彼岸花仙境 / RO_WEB
// V0.9.85P - Right HUD Account Menu / manual save centralized in gear settings
// - Persistent black/gold gear beside HUD fold button
// - Shows current Player ID, account name and character name
// - Safe character switch / account switch / sign out with save flush
// ============================================================
(function(){
  "use strict";

  const VERSION = "0.9.86Q";
  const $ = id => document.getElementById(id);

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
    return data;
  }

  function setOpen(open){
    const menu = $("rightHudAccountMenu");
    const button = $("rightHudAccountButton");
    if (!menu || !button) return false;
    const value = open === true;
    if (value) refresh();
    menu.hidden = !value;
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
      if (window.ROWebCloudRuntime?.saveSharedStorage && typeof window.getAccountStorageSnapshot === "function") {
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
      if (ok && window.ROWebCloudRuntime?.saveSharedStorage && typeof window.getAccountStorageSnapshot === "function") {
        await window.ROWebCloudRuntime.saveSharedStorage(window.getAccountStorageSnapshot());
      }
      if (label) label.textContent = ok ? "存檔完成" : "存檔未完成";
      window.setTimeout(() => { if (label) label.textContent = "手動存檔"; if (button) button.disabled = false; }, 1100);
      return Boolean(ok);
    } catch (error) {
      console.warn("帳號選單：手動存檔失敗。", error);
      if (label) label.textContent = "存檔失敗";
      window.setTimeout(() => { if (label) label.textContent = "手動存檔"; if (button) button.disabled = false; }, 1400);
      return false;
    }
  }

  function renameCharacter(){
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
    close();
    window.ROWebLoadingScreen?.navigate?.("正在切換人物…");
    const runtime = window.CharacterSlotsRuntime;
    if (!runtime?.returnToCharacterSelection) return false;
    await runtime.returnToCharacterSelection();
    return true;
  }

  async function switchAccount(){
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
    if (!menu || !button) return false;
    setOpen(false);
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      toggle();
    });
    menu.addEventListener("click", event => event.stopPropagation());
    $("rightHudCollapseToggle")?.addEventListener("click", () => close());
    document.addEventListener("click", event => {
      if (!menu.hidden && !menu.contains(event.target) && event.target !== button) close();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !menu.hidden) close();
    });
    window.addEventListener("ro-web-ready", refresh);
    window.addEventListener("ro-web-cloud-sync-state", refresh);
    refresh();
    return true;
  }

  window.ROWebAccountMenu = Object.freeze({
    version: VERSION,
    init,
    refresh,
    toggle,
    close,
    saveNow,
    renameCharacter,
    switchCharacter,
    switchAccount,
    signOut,
    getSnapshot
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once:true });
  else init();
})();
