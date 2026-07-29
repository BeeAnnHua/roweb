//=======================================
// UI Skeleton v0.1：視窗開關 / 拖曳 / 位置記憶
//=======================================
const UI_POS_KEY = "ro_web_ui_positions_v0_9_78ad";
const RO_UI_WINDOW_Z_BASE = 20000;
let topZIndex = RO_UI_WINDOW_Z_BASE;

document.addEventListener("DOMContentLoaded", () => {
  initToggleButtons();
  initDraggableWindows();
  initCloseButtons();
  initWindowSizeSystem();
  initGameTooltips();
  initCurrencyDetailPopup();
});

let roUiViewportRecoverTimer = null;
function scheduleRecoverOpenWindows(delay = 80) {
  clearTimeout(roUiViewportRecoverTimer);
  roUiViewportRecoverTimer = setTimeout(() => {
    if (window.RO_WEB_UI_DRAG_ACTIVE) return;
    document.querySelectorAll(".game-window, .ui-size-target").forEach(target => {
      applyWindowSize(target, target.dataset.uiSize || "large", { skipClamp: true });
    });
    document.querySelectorAll(".draggable-window:not(.hidden-window)").forEach(win => {
      if (isMobileViewport() && !win.classList.contains("is-user-positioned")) centerWindowForMobile(win);
      recoverWindowToViewport(win, { centerIfLost: true, persist: true });
    });
  }, Math.max(0, Number(delay || 0)));
}
window.addEventListener("resize", () => scheduleRecoverOpenWindows(80));
window.addEventListener("orientationchange", () => scheduleRecoverOpenWindows(280));
window.addEventListener("pageshow", () => scheduleRecoverOpenWindows(120));


function initToggleButtons() {
  document.querySelectorAll(".ui-toggle").forEach(button => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.target;
      toggleWindow(targetId);
      updateToggleButtonStates();
    });
  });
  updateToggleButtonStates();
}

function initCloseButtons() {
  document.querySelectorAll(".window-close").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      if (typeof hideGameTooltip === "function") hideGameTooltip();
      const targetId = button.dataset.target;
      const target = document.getElementById(targetId);
      if (target) target.classList.add("hidden-window");
      if (targetId === "status-window" && typeof handleStatusWindowVisibilityChange === "function") handleStatusWindowVisibilityChange(false);
      if (targetId === "map-window" && typeof hideMapMonsterDistributionTooltip === "function") hideMapMonsterDistributionTooltip();
      if (targetId === "skill-window" && typeof clearPendingSkillAdds === "function") {
        clearPendingSkillAdds();
        if (typeof updateSkillUI === "function") updateSkillUI();
      }
      updateToggleButtonStates();
    });
  });
}

function isMobileViewport() {
  return window.matchMedia?.("(max-width: 900px)")?.matches || window.innerWidth <= 900;
}

function getViewportSizeForUI() {
  const vv = window.visualViewport;
  return {
    width: Math.max(1, Math.round(vv?.width || window.innerWidth || document.documentElement.clientWidth || 640)),
    height: Math.max(1, Math.round(vv?.height || window.innerHeight || document.documentElement.clientHeight || 900))
  };
}

function getMobileWindowStartPosition(win) {
  const vp = getViewportSizeForUI();
  const rect = win?.getBoundingClientRect?.() || {};
  const w = Math.min(rect.width || win.offsetWidth || 320, Math.max(140, vp.width - 24));
  const h = Math.min(rect.height || win.offsetHeight || 360, Math.max(110, vp.height - 72));
  const safeTop = 64;
  const bottomSafe = 64;
  const id = win?.id || "";
  if (id === "inventory-window") {
    return { x: 10, y: Math.min(Math.max(74, safeTop), Math.max(safeTop, vp.height - h - bottomSafe)) };
  }
  if (id === "equipment-window") {
    return { x: Math.max(10, vp.width - w - 14), y: Math.min(86, Math.max(safeTop, vp.height - h - bottomSafe)) };
  }
  if (id === "skill-window") {
    return { x: Math.max(10, Math.round((vp.width - w) / 2)), y: Math.max(safeTop, Math.min(vp.height - h - bottomSafe, 170)) };
  }
  return {
    x: Math.max(8, Math.round((vp.width - w) / 2)),
    y: Math.max(safeTop, Math.round((vp.height - h) / 2))
  };
}

function centerWindowForMobile(win) {
  if (!win || !isMobileViewport()) return;
  // V0.9.78AD：五欄 UI 清理，手機三大視窗改走乾淨預設排版。
  // 玩家手動拖曳後不再自動置中，避免拖曳時回彈。
  if (win.classList.contains("is-user-positioned")) return;
  const pos = getMobileWindowStartPosition(win);
  win.style.setProperty("left", `${pos.x}px`, "important");
  win.style.setProperty("top", `${pos.y}px`, "important");
  win.style.setProperty("right", "auto", "important");
  win.style.setProperty("bottom", "auto", "important");
  applyStoredWindowVisualScale(win);
}

function refreshWindowContentOnOpen(id) {
  if (id === "status-window") {
    if (typeof handleStatusWindowVisibilityChange === "function") handleStatusWindowVisibilityChange(true);
    else if (typeof updateStatusUI === "function") updateStatusUI({ force: true });
  } else if (id === "skill-window" && typeof updateSkillUI === "function") {
    updateSkillUI();
  } else if (id === "job-window" && typeof updateJobUI === "function") {
    updateJobUI();
  } else if (id === "inventory-window" && typeof updateInventoryUI === "function") {
    updateInventoryUI();
  } else if (id === "equipment-window" && typeof updateEquipmentUI === "function") {
    updateEquipmentUI();
  }
}

function toggleWindow(id) {
  if (typeof hideGameTooltip === "function") hideGameTooltip();
  const win = document.getElementById(id);
  if (!win) return;
  win.classList.toggle("hidden-window");
  if (id === "map-window") {
    if (typeof hideMapMonsterDistributionTooltip === "function") hideMapMonsterDistributionTooltip();
    if (!win.classList.contains("hidden-window") && typeof armMapWindowOpenGuard === "function") armMapWindowOpenGuard(700);
  }
  if (!win.classList.contains("hidden-window")) {
    refreshWindowContentOnOpen(id);
    if (id === "auto-combat-panel" && typeof updateAutoCombatUI === "function") updateAutoCombatUI();
    centerWindowForMobile(win);
    window.requestAnimationFrame(() => {
      recoverWindowToViewport(win, { centerIfLost: true, persist: true });
      window.setTimeout(() => recoverWindowToViewport(win, { centerIfLost: true, persist: true }), 90);
    });
  } else if (id === "status-window" && typeof handleStatusWindowVisibilityChange === "function") {
    handleStatusWindowVisibilityChange(false);
  }
  bringWindowToFront(win);
}

function initDraggableWindows() {
  const saved = getSavedWindowPositions();
  document.querySelectorAll(".draggable-window").forEach(win => {
    const defaultX = Number(win.dataset.defaultX || 40);
    const defaultY = Number(win.dataset.defaultY || 40);
    const pos = saved[win.id] || { x: defaultX, y: defaultY };
    win.style.left = `${pos.x}px`;
    win.style.top = `${pos.y}px`;
    if (isMobileViewport()) centerWindowForMobile(win);
    window.requestAnimationFrame(() => recoverWindowToViewport(win, { centerIfLost: true, persist: true }));
    if (win.id === "basic-skill-info-window") {
      win.style.setProperty("--basic-info-left", `${pos.x}px`);
      win.style.setProperty("--basic-info-top", `${pos.y}px`);
    }

    const handle = win.querySelector(".drag-handle") || win;
    handle.addEventListener("pointerdown", event => startDrag(event, win));
    win.addEventListener("pointerdown", () => bringWindowToFront(win));
  });
}

function startDrag(event, win) {
  if (typeof hideGameTooltip === "function") hideGameTooltip();
  if (event.button !== undefined && event.button !== 0) return;
  if (event.target.closest("button, input, select, textarea, a, [data-no-drag]")) return;

  // V0.9.76c：Mobile Drag Engine V2.1。
  // 修正 V2 在手機上拖曳起手會往左上跳：不要用 getBoundingClientRect() 的視覺座標
  // 直接覆寫 left/top，而是以目前 CSS left/top / offsetLeft 作為邏輯座標，再用 pointer delta 換算。
  event.preventDefault();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();

  const root = document.getElementById("battle-field");
  if (!root) return;

  window.RO_WEB_UI_DRAG_ACTIVE = true;
  document.documentElement.classList.add("ui-drag-active");
  bringWindowToFront(win);

  const handle = event.currentTarget || win;
  const startRect = win.getBoundingClientRect();
  const pointerStartX = event.clientX;
  const pointerStartY = event.clientY;

  const inlineLeft = parseFloat(win.style.left);
  const inlineTop = parseFloat(win.style.top);
  const startLeft = Number.isFinite(inlineLeft) ? inlineLeft : (win.offsetLeft || 0);
  const startTop = Number.isFinite(inlineTop) ? inlineTop : (win.offsetTop || 0);

  // CSS zoom / transform 會讓 pointer 移動距離與 layout px 不一致。
  // 以實際渲染寬高 / layout 寬高估算比例，拖曳時除回 layout 座標。
  const layoutW = Math.max(1, win.offsetWidth || startRect.width || 1);
  const layoutH = Math.max(1, win.offsetHeight || startRect.height || 1);
  const scaleX = Math.max(0.2, Math.min(2, (startRect.width || layoutW) / layoutW));
  const scaleY = Math.max(0.2, Math.min(2, (startRect.height || layoutH) / layoutH));

  win.classList.add("is-user-positioned", "is-dragging");
  win.dataset.dragLocked = "1";

  function setWindowPosition(x, y) {
    win.style.setProperty("--drag-left", `${Math.round(x)}px`);
    win.style.setProperty("--drag-top", `${Math.round(y)}px`);
    win.style.setProperty("left", `${Math.round(x)}px`, "important");
    win.style.setProperty("top", `${Math.round(y)}px`, "important");
    win.style.setProperty("right", "auto", "important");
    win.style.setProperty("bottom", "auto", "important");
    applyStoredWindowVisualScale(win);
    if (win.id === "basic-skill-info-window") {
      win.style.setProperty("--basic-info-left", `${Math.round(x)}px`);
      win.style.setProperty("--basic-info-top", `${Math.round(y)}px`);
    }
  }

  // 只鎖定 transform，不在 pointerdown 當下改變 left/top，避免起手跳動。
  win.style.setProperty("right", "auto", "important");
  win.style.setProperty("bottom", "auto", "important");
  applyStoredWindowVisualScale(win);

  if (event.pointerId !== undefined && handle.setPointerCapture) {
    try { handle.setPointerCapture(event.pointerId); } catch (error) {}
  }

  function clampWindowPosition(x, y) {
    // V0.9.78AD：拖曳邊界改以 viewport 計算，不再用 battle-field 尺寸當牆。
    // 四邊都只要求保留一小段標題可抓回來，因此右邊與下方可以像左邊一樣超出畫面。
    const visibleTitle = 38;
    const winWidth = Math.max(visibleTitle, win.offsetWidth || startRect.width || 320);
    const winHeight = Math.max(visibleTitle, win.offsetHeight || startRect.height || 220);
    const vp = getViewportSizeForUI();
    const minX = -(winWidth - visibleTitle);
    // 右/下也允許像左/上一樣拖出畫面，只保留一小段可抓回來的範圍。
    const maxX = Math.max(0, vp.width - visibleTitle);
    const minY = -(winHeight - visibleTitle);
    const maxY = Math.max(0, vp.height - visibleTitle);
    return {
      x: Math.round(Math.max(minX, Math.min(x, maxX))),
      y: Math.round(Math.max(minY, Math.min(y, maxY)))
    };
  }

  function applyPosition(x, y) {
    const pos = clampWindowPosition(x, y);
    setWindowPosition(pos.x, pos.y);
  }

  function onMove(moveEvent) {
    if (moveEvent.pointerId !== undefined && event.pointerId !== undefined && moveEvent.pointerId !== event.pointerId) return;
    if (moveEvent.cancelable) moveEvent.preventDefault();
    moveEvent.stopPropagation?.();
    moveEvent.stopImmediatePropagation?.();
    const dx = (moveEvent.clientX - pointerStartX) / scaleX;
    const dy = (moveEvent.clientY - pointerStartY) / scaleY;
    applyPosition(startLeft + dx, startTop + dy);
  }

  function onUp(upEvent) {
    upEvent?.stopPropagation?.();
    upEvent?.stopImmediatePropagation?.();
    if (upEvent?.pointerId !== undefined && handle.releasePointerCapture) {
      try { handle.releasePointerCapture(upEvent.pointerId); } catch (error) {}
    }
    win.classList.remove("is-dragging");
    window.RO_WEB_UI_DRAG_ACTIVE = false;
    document.documentElement.classList.remove("ui-drag-active");
    document.removeEventListener("pointermove", onMove, true);
    document.removeEventListener("pointerup", onUp, true);
    document.removeEventListener("pointercancel", onUp, true);
    window.requestAnimationFrame(() => {
      recoverWindowToViewport(win, { centerIfLost: false, persist: true });
      saveWindowPosition(win);
    });
    setTimeout(() => { if (!window.RO_WEB_UI_DRAG_ACTIVE) document.documentElement.classList.remove("ui-drag-active"); }, 0);
  }

  document.addEventListener("pointermove", onMove, { passive: false, capture: true });
  document.addEventListener("pointerup", onUp, { passive: false, capture: true });
  document.addEventListener("pointercancel", onUp, { passive: false, capture: true });
}

function bringWindowToFront(win) {
  topZIndex += 1;
  win.style.zIndex = topZIndex;
}

function getSavedWindowPositions() {
  try {
    return JSON.parse(localStorage.getItem(UI_POS_KEY)) || {};
  } catch (error) {
    return {};
  }
}

function saveWindowPosition(win) {
  const saved = getSavedWindowPositions();
  const cssLeft = parseInt(win.style.getPropertyValue("--basic-info-left"), 10);
  const cssTop = parseInt(win.style.getPropertyValue("--basic-info-top"), 10);
  saved[win.id] = {
    x: Number.isFinite(cssLeft) ? cssLeft : (parseInt(win.style.left, 10) || 0),
    y: Number.isFinite(cssTop) ? cssTop : (parseInt(win.style.top, 10) || 0)
  };
  localStorage.setItem(UI_POS_KEY, JSON.stringify(saved));
}


function updateToggleButtonStates() {
  document.querySelectorAll(".ui-toggle").forEach(button => {
    const target = document.getElementById(button.dataset.target);
    button.classList.toggle("is-open", Boolean(target && !target.classList.contains("hidden-window")));
  });
}

//=======================================
// v0.9.4：技能 / 素質 tooltip
//=======================================
let activeTooltipTarget = null;

function getTooltipElement() {
  let tooltip = document.getElementById("game-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "game-tooltip";
    tooltip.className = "game-tooltip";
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

function escapeTooltipText(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderROColoredTooltipText(text) {
  const escaped = escapeTooltipText(text);
  const parts = escaped.split(/(\^[0-9A-Fa-f]{6})/g);
  let html = "";
  let openColor = false;

  parts.forEach(part => {
    const match = part.match(/^\^([0-9A-Fa-f]{6})$/);
    if (!match) {
      html += part;
      return;
    }

    const color = match[1].toUpperCase();
    if (openColor) {
      html += "</span>";
      openColor = false;
    }
    if (color !== "000000") {
      html += `<span class="ro-text-color" style="color:#${color}">`;
      openColor = true;
    }
  });

  if (openColor) html += "</span>";
  return html.replace(/\n/g, "<br>");
}

function showGameTooltip(text, clientX, clientY) {
  if (!text) return;
  const tooltip = getTooltipElement();
  tooltip.innerHTML = renderROColoredTooltipText(text);
  tooltip.classList.add("is-visible");
  moveGameTooltip(clientX, clientY);
}

function moveGameTooltip(clientX, clientY) {
  const tooltip = getTooltipElement();
  if (!tooltip.classList.contains("is-visible")) return;
  const margin = 14;
  const rect = tooltip.getBoundingClientRect();
  let x = Number(clientX || 0) + margin;
  let y = Number(clientY || 0) + margin;
  if (x + rect.width + 8 > window.innerWidth) x = Math.max(8, Number(clientX || 0) - rect.width - margin);
  if (y + rect.height + 8 > window.innerHeight) y = Math.max(8, Number(clientY || 0) - rect.height - margin);
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function hideGameTooltip() {
  const tooltip = getTooltipElement();
  tooltip.classList.remove("is-visible");
  activeTooltipTarget = null;
}

function initGameTooltips() {
  if (document.documentElement.dataset.gameTooltipBound === "1") return;
  document.documentElement.dataset.gameTooltipBound = "1";

  const findTarget = event => event.target instanceof Element ? event.target.closest("[data-tooltip]") : null;
  document.addEventListener("mouseover", event => {
    const target = findTarget(event);
    if (!target) return;
    activeTooltipTarget = target;
    showGameTooltip(target.dataset.tooltip, event.clientX, event.clientY);
  });
  document.addEventListener("mousemove", event => {
    if (activeTooltipTarget) moveGameTooltip(event.clientX, event.clientY);
  });
  document.addEventListener("mouseout", event => {
    const target = findTarget(event);
    if (!target) return;
    if (!event.relatedTarget || !target.contains(event.relatedTarget)) hideGameTooltip();
  });
  document.addEventListener("click", event => {
    const target = findTarget(event);
    if (!target) {
      hideGameTooltip();
      return;
    }
    showGameTooltip(target.dataset.tooltip, event.clientX || 24, event.clientY || 24);
    activeTooltipTarget = target;
  });
}


// RO_WEB 0.9.82HM：恢復右上貨幣列原地展開／收合。
// 不建立額外浮窗；直接在現有 #top-bar 內切換完整 Zeny／藍寶石／紅寶石。
let currencyBarOutsideBound = false;
let currencyBarLastToggleAt = 0;

function getCurrencyFullValues() {
  const source = window.player || (typeof player !== "undefined" ? player : null) || {};
  return {
    zeny: Number(source.zeny || 0),
    blueGem: Number(source.blueGem || 0),
    redGem: Number(source.redGem || 0)
  };
}

function ensureCurrencyExpandedMarkup() {
  const topBar = document.getElementById("top-bar");
  if (!topBar) return null;
  const rows = [
    ["zeny", "Zeny"],
    ["blueGem", "藍寶石"],
    ["redGem", "紅寶石"]
  ];
  for (const [id, label] of rows) {
    const compact = document.getElementById(id);
    const item = compact?.closest?.(".currency-item");
    if (!compact || !item) continue;
    compact.classList.add("currency-compact-value");
    if (!item.querySelector(".currency-expanded-label")) {
      const labelEl = document.createElement("span");
      labelEl.className = "currency-expanded-label";
      labelEl.textContent = label;
      item.insertBefore(labelEl, compact);
    }
    if (!item.querySelector(".currency-expanded-value")) {
      const fullEl = document.createElement("strong");
      fullEl.className = "currency-expanded-value";
      fullEl.dataset.currencyValueId = id;
      fullEl.textContent = "0";
      item.appendChild(fullEl);
    }
  }
  return topBar;
}

function refreshCurrencyAccessibleLabels() {
  const topBar = ensureCurrencyExpandedMarkup();
  if (!topBar) return;
  const values = getCurrencyFullValues();
  const rows = [
    ["zeny", "Zeny", values.zeny],
    ["blueGem", "藍寶石", values.blueGem],
    ["redGem", "紅寶石", values.redGem]
  ];
  for (const [id, label, amount] of rows) {
    const compact = document.getElementById(id);
    const item = compact?.closest?.(".currency-item");
    if (!item) continue;
    const full = Number(amount || 0).toLocaleString("zh-TW");
    const expandedValue = item.querySelector(".currency-expanded-value");
    if (expandedValue && expandedValue.textContent !== full) expandedValue.textContent = full;
    item.title = `${label}：${full}｜點擊展開全部貨幣`;
    item.setAttribute("aria-label", `${label} ${full}`);
  }
}

function setCurrencyBarExpanded(expanded, options = {}) {
  const topBar = ensureCurrencyExpandedMarkup();
  if (!topBar) return false;
  const next = expanded === true;
  refreshCurrencyAccessibleLabels();
  topBar.classList.toggle("is-currency-expanded", next);
  topBar.setAttribute("aria-expanded", next ? "true" : "false");
  topBar.title = next ? "點擊收合貨幣數量" : "點擊展開完整貨幣數量";
  if (options.focus === true) topBar.focus({ preventScroll: true });
  return next;
}

function toggleCurrencyBarExpanded(event, forceState) {
  const topBar = ensureCurrencyExpandedMarkup();
  if (!topBar) return false;
  const now = Date.now();
  if (event && now - currencyBarLastToggleAt < 90) {
    event.preventDefault?.();
    event.stopPropagation?.();
    return false;
  }
  currencyBarLastToggleAt = now;
  const next = typeof forceState === "boolean"
    ? forceState
    : !topBar.classList.contains("is-currency-expanded");
  topBar.classList.remove("is-currency-pressed");
  setCurrencyBarExpanded(next);
  event?.preventDefault?.();
  event?.stopPropagation?.();
  return false;
}

// 舊 HK／HL 名稱保留為相容入口，但現在控制的是原地貨幣列。
function getCurrencyDetailPopup() {
  return document.getElementById("top-bar");
}
function showCurrencyDetailPopup(event) {
  setCurrencyBarExpanded(true);
  event?.preventDefault?.();
  event?.stopPropagation?.();
  return true;
}
function hideCurrencyDetailPopup() {
  return setCurrencyBarExpanded(false);
}

function initCurrencyDetailPopup() {
  const topBar = ensureCurrencyExpandedMarkup();
  if (!topBar || topBar.dataset.currencyDetailBound === "3") return;
  topBar.dataset.currencyDetailBound = "3";
  topBar.setAttribute("role", "button");
  topBar.setAttribute("tabindex", "0");
  topBar.setAttribute("aria-expanded", "false");
  topBar.setAttribute("aria-label", "持有貨幣，點擊展開完整數量");
  topBar.title = "點擊展開完整貨幣數量";
  topBar.querySelectorAll(".currency-item").forEach(item => {
    item.setAttribute("role", "presentation");
    item.removeAttribute("tabindex");
  });
  refreshCurrencyAccessibleLabels();

  // 捕獲階段直接辨識實際 #top-bar；舊 HUD 即使在 bubble 階段攔截也不影響。
  if (document.documentElement.dataset.currencyInlineCaptureBound !== "1") {
    document.documentElement.dataset.currencyInlineCaptureBound = "1";
    const captureToggle = event => {
      const target = event.target instanceof Element ? event.target.closest("#top-bar") : null;
      if (!target) return;
      toggleCurrencyBarExpanded(event);
    };
    document.addEventListener("pointerup", captureToggle, true);
    document.addEventListener("click", captureToggle, true);
  }
  // index.html 同時保留 inline onclick；若初始化前被點擊仍有最終備援。
  topBar.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") toggleCurrencyBarExpanded(event);
    if (event.key === "Escape") {
      event.preventDefault();
      setCurrencyBarExpanded(false);
    }
  });
  topBar.addEventListener("pointerdown", () => topBar.classList.add("is-currency-pressed"));
  const clearPressed = () => topBar.classList.remove("is-currency-pressed");
  topBar.addEventListener("pointerup", clearPressed);
  topBar.addEventListener("pointercancel", clearPressed);
  topBar.addEventListener("pointerleave", clearPressed);

  if (!currencyBarOutsideBound) {
    currencyBarOutsideBound = true;
    document.addEventListener("pointerdown", event => {
      const current = document.getElementById("top-bar");
      if (!current?.classList.contains("is-currency-expanded")) return;
      if (current.contains(event.target)) return;
      setCurrencyBarExpanded(false);
    }, true);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") setCurrencyBarExpanded(false);
    });
  }
}

Object.assign(window, {
  getCurrencyDetailPopup,
  showCurrencyDetailPopup,
  hideCurrencyDetailPopup,
  setCurrencyBarExpanded,
  toggleCurrencyBarExpanded,
  refreshCurrencyAccessibleLabels
});


//=======================================
// RO_WEB 0.9.82FJ：全視窗大／中／小循環尺寸
// 目前既有尺寸視為「大」100%，中／小分別為 75%／50%。
// 不使用自由拉伸，避免手機瀏覽器手勢衝突。
//=======================================
const RO_UI_SIZE_KEY = "ro_web_ui_window_sizes_v0_9_82fi";
const RO_UI_SIZE_ORDER = ["large", "medium", "small"];
const RO_UI_SIZE_LABELS = { large: "大", medium: "中", small: "小" };

function getWindowSizeTargetId(target) {
  return String(target?.dataset?.uiSizeId || target?.id || "").trim();
}

function getSavedWindowSizes() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(RO_UI_SIZE_KEY)) || {}; } catch (error) {}
  if (typeof player !== "undefined" && player?.uiWindowSizes && typeof player.uiWindowSizes === "object") {
    saved = { ...saved, ...player.uiWindowSizes };
  }
  return saved;
}

function persistWindowSizes(saved) {
  try { localStorage.setItem(RO_UI_SIZE_KEY, JSON.stringify(saved || {})); } catch (error) {}
  if (typeof player !== "undefined" && player) {
    player.uiWindowSizes = { ...(player.uiWindowSizes || {}), ...(saved || {}) };
    if (typeof requestGameSave === "function") requestGameSave(250);
    else if (typeof saveGame === "function") window.setTimeout(() => saveGame(), 0);
  }
}

function normalizeWindowSize(size) {
  return RO_UI_SIZE_ORDER.includes(size) ? size : "large";
}

function getWindowBaseVisualScale(target) {
  if (!target || typeof getComputedStyle !== "function") return 1;
  const value = parseFloat(getComputedStyle(target).getPropertyValue("--ro-ui-base-zoom"));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function applyStoredWindowVisualScale(target) {
  if (!target) return;
  const factor = Math.max(0.25, Math.min(1.2, Number(target.dataset?.uiSizeFactor || 1)));
  const usingZoom = target.dataset?.uiSizeMode === "zoom";
  target.style.setProperty("transform", usingZoom || factor === 1 ? "none" : `scale(${factor})`, "important");
  target.style.setProperty("transform-origin", "top left", "important");
}

function getWindowSizeHeader(target) {
  return target?.querySelector?.(".window-title, .ui-size-header, .item-detail-header, .skill-detail-header, .job-change-confirm-header, .homunculus-modal-header, .skill-copy-header") || null;
}

function getRenderedWindowScale(target, rect = null) {
  const visual = rect || target?.getBoundingClientRect?.() || { width: 0, height: 0 };
  const layoutWidth = Math.max(1, Number(target?.offsetWidth || visual.width || 1));
  const layoutHeight = Math.max(1, Number(target?.offsetHeight || visual.height || 1));
  return {
    x: Math.max(0.2, Math.min(2, Number(visual.width || layoutWidth) / layoutWidth)),
    y: Math.max(0.2, Math.min(2, Number(visual.height || layoutHeight) / layoutHeight))
  };
}

function recoverWindowToViewport(target, options = {}) {
  if (!target?.matches?.(".game-window, .ui-size-target")) return false;
  if (target.classList.contains("hidden-window")) return false;
  applyStoredWindowVisualScale(target);
  const rect = target.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width < 2 || rect.height < 2) return false;

  const vp = getViewportSizeForUI();
  const margin = isMobileViewport() ? 6 : 8;
  const titleVisible = 42;
  const scale = getRenderedWindowScale(target, rect);
  let layoutLeft = parseFloat(target.style.left);
  let layoutTop = parseFloat(target.style.top);
  if (!Number.isFinite(layoutLeft)) layoutLeft = Number(target.offsetLeft || margin);
  if (!Number.isFinite(layoutTop)) layoutTop = Number(target.offsetTop || margin);

  const completelyLost = rect.right < titleVisible || rect.left > vp.width - titleVisible || rect.bottom < titleVisible || rect.top > vp.height - titleVisible;
  let desiredLeft = rect.left;
  let desiredTop = rect.top;

  if (completelyLost && options.centerIfLost !== false) {
    desiredLeft = Math.max(margin, Math.round((vp.width - Math.min(rect.width, vp.width - margin * 2)) / 2));
    desiredTop = Math.max(58, Math.round((vp.height - Math.min(rect.height, vp.height - 70)) / 2));
  } else {
    if (rect.width <= vp.width - margin * 2) desiredLeft = Math.max(margin, Math.min(rect.left, vp.width - margin - rect.width));
    else desiredLeft = Math.max(-(rect.width - titleVisible), Math.min(rect.left, vp.width - titleVisible));
    if (rect.height <= vp.height - margin * 2) desiredTop = Math.max(margin, Math.min(rect.top, vp.height - margin - rect.height));
    else desiredTop = Math.max(-(rect.height - titleVisible), Math.min(rect.top, vp.height - titleVisible));
  }

  const nextLeft = layoutLeft + (desiredLeft - rect.left) / scale.x;
  const nextTop = layoutTop + (desiredTop - rect.top) / scale.y;
  if (!Number.isFinite(nextLeft) || !Number.isFinite(nextTop)) return false;
  const changed = Math.abs(nextLeft - layoutLeft) > 0.5 || Math.abs(nextTop - layoutTop) > 0.5;
  if (changed) {
    target.style.setProperty("left", `${Math.round(nextLeft)}px`, "important");
    target.style.setProperty("top", `${Math.round(nextTop)}px`, "important");
    target.style.setProperty("right", "auto", "important");
    target.style.setProperty("bottom", "auto", "important");
    applyStoredWindowVisualScale(target);
    if (target.id === "basic-skill-info-window") {
      target.style.setProperty("--basic-info-left", `${Math.round(nextLeft)}px`);
      target.style.setProperty("--basic-info-top", `${Math.round(nextTop)}px`);
    }
    if (options.persist === true) saveWindowPosition(target);
  }
  return changed;
}

function clampSizedWindowToViewport(target) {
  return recoverWindowToViewport(target, { centerIfLost: true, persist: true });
}

function resetAllUIWindowPositions() {
  try { localStorage.removeItem(UI_POS_KEY); } catch (error) {}
  document.querySelectorAll(".draggable-window").forEach(win => {
    const x = Number(win.dataset.defaultX || 40);
    const y = Number(win.dataset.defaultY || 40);
    win.classList.remove("is-user-positioned");
    win.style.setProperty("left", `${x}px`, "important");
    win.style.setProperty("top", `${y}px`, "important");
    win.style.setProperty("right", "auto", "important");
    win.style.setProperty("bottom", "auto", "important");
    applyStoredWindowVisualScale(win);
    if (isMobileViewport()) centerWindowForMobile(win);
    recoverWindowToViewport(win, { centerIfLost: true, persist: true });
  });
  return true;
}
window.resetAllUIWindowPositions = resetAllUIWindowPositions;

function applyWindowSize(target, requestedSize, options = {}) {
  if (!target) return;
  const size = normalizeWindowSize(requestedSize);
  target.dataset.uiSize = size;
  const factor = size === "medium" ? 0.75 : (size === "small" ? 0.5 : 1);
  // 背包／技能欄原本已有桌機與手機專用基準 zoom；大尺寸必須維持目前視覺，
  // 中／小再以該基準乘上 75%／50%，而不是被舊 CSS !important 鎖死。
  const baseFactor = getWindowBaseVisualScale(target);
  const effectiveFactor = Math.max(0.25, Math.min(1.2, baseFactor * factor));
  target.dataset.uiSizeFactor = String(effectiveFactor);
  const supportsZoom = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("zoom", "0.75");
  if (supportsZoom) {
    target.dataset.uiSizeMode = "zoom";
    target.style.setProperty("zoom", String(effectiveFactor), "important");
    target.style.removeProperty("scale");
    target.style.setProperty("transform", "none", "important");
  } else {
    // iOS/Safari versions without CSS zoom use transform. Inline !important
    // also neutralizes old inventory/skill zoom rules so all three sizes work.
    target.dataset.uiSizeMode = "transform";
    target.style.setProperty("zoom", "1", "important");
    target.style.removeProperty("scale");
    target.style.setProperty("transform", effectiveFactor === 1 ? "none" : `scale(${effectiveFactor})`, "important");
    target.style.setProperty("transform-origin", "top left", "important");
  }
  const button = target.querySelector(":scope > .window-title .window-size-cycle, :scope > .ui-size-header .window-size-cycle, .window-size-cycle");
  if (button) {
    button.textContent = RO_UI_SIZE_LABELS[size];
    button.title = `視窗大小：${RO_UI_SIZE_LABELS[size]}（點擊切換）`;
    button.setAttribute("aria-label", `視窗大小 ${RO_UI_SIZE_LABELS[size]}，點擊切換`);
  }
  if (!options.skipClamp) window.requestAnimationFrame(() => {
    clampSizedWindowToViewport(target);
    window.setTimeout(() => clampSizedWindowToViewport(target), 90);
  });
}

function saveWindowSize(target, size) {
  const id = getWindowSizeTargetId(target);
  if (!id) return;
  const saved = getSavedWindowSizes();
  saved[id] = normalizeWindowSize(size);
  persistWindowSizes(saved);
}

function cycleWindowSize(target) {
  const current = normalizeWindowSize(target?.dataset?.uiSize);
  const next = RO_UI_SIZE_ORDER[(RO_UI_SIZE_ORDER.indexOf(current) + 1) % RO_UI_SIZE_ORDER.length];
  applyWindowSize(target, next);
  saveWindowSize(target, next);
}

function ensureWindowSizeControl(target) {
  if (!target || target.dataset.uiSizeReady === "1") return;
  const id = getWindowSizeTargetId(target);
  const header = getWindowSizeHeader(target);
  if (!id || !header) return;
  target.dataset.uiSizeReady = "1";
  target.classList.add("ui-size-enabled");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "window-size-cycle";
  button.dataset.noDrag = "1";
  let lastSizeActivationAt = 0;
  const activateSizeCycle = event => {
    const now = Date.now();
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    if (now - lastSizeActivationAt < 320) return;
    lastSizeActivationAt = now;
    cycleWindowSize(target);
  };
  button.addEventListener("pointerdown", event => {
    event.stopPropagation();
    if (event.pointerType === "touch" && event.cancelable) event.preventDefault();
  }, { passive: false });
  button.addEventListener("pointerup", activateSizeCycle, { passive: false });
  button.addEventListener("touchstart", event => event.stopPropagation(), { passive: true });
  button.addEventListener("touchend", activateSizeCycle, { passive: false });
  button.addEventListener("click", activateSizeCycle);
  const headerHidden = typeof getComputedStyle === "function" && getComputedStyle(header).display === "none";
  if (headerHidden) {
    button.classList.add("is-floating-size-control");
    target.appendChild(button);
  } else {
    const close = header.querySelector(".window-close, [aria-label='關閉'], button:last-child");
    if (close) header.insertBefore(button, close);
    else header.appendChild(button);
  }
  const saved = getSavedWindowSizes();
  applyWindowSize(target, saved[id] || "large", { skipClamp: true });
}

function initWindowSizeSystem() {
  document.querySelectorAll(".game-window, .ui-size-target").forEach(ensureWindowSizeControl);
  const observer = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (!(node instanceof Element)) return;
      if (node.matches(".game-window, .ui-size-target")) ensureWindowSizeControl(node);
      node.querySelectorAll?.(".game-window, .ui-size-target").forEach(ensureWindowSizeControl);
    }));
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.RO_WEB_UI_SIZE_OBSERVER = observer;
}

window.addEventListener("ro-web-ready", () => {
  const saved = getSavedWindowSizes();
  document.querySelectorAll(".game-window, .ui-size-target").forEach(target => {
    const id = getWindowSizeTargetId(target);
    if (id) applyWindowSize(target, saved[id] || target.dataset.uiSize || "large", { skipClamp: true });
  });
});

Object.assign(window, {
  initWindowSizeSystem,
  ensureWindowSizeControl,
  applyWindowSize,
  cycleWindowSize,
  recoverWindowToViewport,
  resetAllUIWindowPositions
});


// ============================================================
// RO_WEB 0.9.82FT — collapsible right HUD for small screens.
// The currency bar + nine feature buttons may collapse; the independent
// auto-battle status button always stays visible.
// ============================================================
const RO_WEB_RIGHT_HUD_STORAGE_KEY = "ro_web_right_hud_collapsed_v1";
function setRightHudCollapsed(collapsed, options = {}) {
  const shell = document.getElementById("right-hud-shell");
  const toggle = document.getElementById("rightHudCollapseToggle");
  if (!shell || !toggle) return false;
  const value = collapsed === true;
  shell.classList.toggle("is-collapsed", value);
  toggle.setAttribute("aria-expanded", value ? "false" : "true");
  toggle.setAttribute("aria-label", value ? "展開右上功能列" : "收合右上功能列");
  toggle.title = value ? "展開右上功能列" : "收合右上功能列";
  const icon = toggle.querySelector(".right-hud-toggle-icon");
  if (icon) icon.textContent = value ? "🔽" : "🔼";
  if (options.save !== false) {
    try { localStorage.setItem(RO_WEB_RIGHT_HUD_STORAGE_KEY, value ? "1" : "0"); } catch (_) {}
  }
  return value;
}
function toggleRightHudCollapse(forceState) {
  const shell = document.getElementById("right-hud-shell");
  if (!shell) return false;
  const next = typeof forceState === "boolean" ? forceState : !shell.classList.contains("is-collapsed");
  return setRightHudCollapsed(next, { save: true });
}
function initRightHudCollapse() {
  let stored = null;
  try { stored = localStorage.getItem(RO_WEB_RIGHT_HUD_STORAGE_KEY); } catch (_) {}
  const narrowFirstLoad = window.matchMedia?.("(max-width: 520px)")?.matches === true;
  setRightHudCollapsed(stored === null ? narrowFirstLoad : stored === "1", { save: false });
}
window.setRightHudCollapsed = setRightHudCollapsed;
window.toggleRightHudCollapse = toggleRightHudCollapse;
window.initRightHudCollapse = initRightHudCollapse;
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initRightHudCollapse, { once: true });
else initRightHudCollapse();
