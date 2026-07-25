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

window.addEventListener("resize", () => {
  if (!isMobileViewport()) return;
  if (window.RO_WEB_UI_DRAG_ACTIVE) return;
  document.querySelectorAll(".draggable-window:not(.hidden-window)").forEach(centerWindowForMobile);
});
window.addEventListener("orientationchange", () => {
  setTimeout(() => {
    if (!isMobileViewport()) return;
    if (window.RO_WEB_UI_DRAG_ACTIVE) return;
    document.querySelectorAll(".draggable-window:not(.hidden-window)").forEach(centerWindowForMobile);
  }, 250);
});


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
  win.style.setProperty("transform", "none", "important");
}

function toggleWindow(id) {
  if (typeof hideGameTooltip === "function") hideGameTooltip();
  const win = document.getElementById(id);
  if (!win) return;
  win.classList.toggle("hidden-window");
  if (id === "map-window" && win.classList.contains("hidden-window") && typeof hideMapMonsterDistributionTooltip === "function") hideMapMonsterDistributionTooltip();
  if (!win.classList.contains("hidden-window")) centerWindowForMobile(win);
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
    win.style.setProperty("transform", "none", "important");
    win.style.setProperty("transform-origin", "top left", "important");
    if (win.id === "basic-skill-info-window") {
      win.style.setProperty("--basic-info-left", `${Math.round(x)}px`);
      win.style.setProperty("--basic-info-top", `${Math.round(y)}px`);
    }
  }

  // 只鎖定 transform，不在 pointerdown 當下改變 left/top，避免起手跳動。
  win.style.setProperty("right", "auto", "important");
  win.style.setProperty("bottom", "auto", "important");
  win.style.setProperty("transform", "none", "important");
  win.style.setProperty("transform-origin", "top left", "important");

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
    saveWindowPosition(win);
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
  document.addEventListener("mouseover", event => {
    const target = event.target.closest("[data-tooltip]");
    if (!target) return;
    activeTooltipTarget = target;
    showGameTooltip(target.dataset.tooltip, event.clientX, event.clientY);
  });

  document.addEventListener("mousemove", event => {
    if (activeTooltipTarget) moveGameTooltip(event.clientX, event.clientY);
  });

  document.addEventListener("mouseout", event => {
    const target = event.target.closest("[data-tooltip]");
    if (!target) return;
    if (!event.relatedTarget || !target.contains(event.relatedTarget)) hideGameTooltip();
  });

  document.addEventListener("click", event => {
    const target = event.target.closest("[data-tooltip]");
    if (!target) {
      hideGameTooltip();
      return;
    }
    // 手機 / 平板沒有 hover，點一下文字或技能 icon 也能看說明。
    showGameTooltip(target.dataset.tooltip, event.clientX || 24, event.clientY || 24);
    activeTooltipTarget = target;
  });
}


// V0.9.72d：手機金幣列空間不足時，點擊資源列顯示完整數量，3 秒後自動熄滅。
let currencyDetailHideTimer = null;
function initCurrencyDetailPopup() {
  const topBar = document.getElementById("top-bar");
  if (!topBar || topBar.dataset.currencyDetailBound === "1") return;
  topBar.dataset.currencyDetailBound = "1";
  topBar.setAttribute("role", "button");
  topBar.setAttribute("tabindex", "0");
  topBar.title = "點擊顯示完整貨幣數量";

  const show = event => {
    const z = Number(player?.zeny || 0).toLocaleString("zh-TW");
    const b = Number(player?.blueGem || 0).toLocaleString("zh-TW");
    const r = Number(player?.redGem || 0).toLocaleString("zh-TW");
    const text = `Zeny：${z}
藍寶石：${b}
紅寶石：${r}`;
    if (typeof showGameTooltip === "function") {
      const point = event?.touches?.[0] || event;
      showGameTooltip(text, point?.clientX || window.innerWidth - 180, point?.clientY || 48);
      clearTimeout(currencyDetailHideTimer);
      currencyDetailHideTimer = setTimeout(() => {
        if (typeof hideGameTooltip === "function") hideGameTooltip();
      }, 3000);
    } else {
      alert(`Zeny：${z}
藍寶石：${b}
紅寶石：${r}`);
    }
  };

  topBar.addEventListener("click", show);
  topBar.addEventListener("touchstart", event => {
    if (event.cancelable) event.preventDefault();
    show(event);
  }, { passive: false });
  topBar.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") show(event);
  });
}


//=======================================
// RO_WEB 0.9.82FH：全視窗大／中／小循環尺寸
// 目前既有尺寸視為「大」100%，中／小分別為 75%／50%。
// 不使用自由拉伸，避免手機瀏覽器手勢衝突。
//=======================================
const RO_UI_SIZE_KEY = "ro_web_ui_window_sizes_v0_9_82fh";
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

function getWindowSizeHeader(target) {
  return target?.querySelector?.(".window-title, .ui-size-header, .item-detail-header, .skill-detail-header, .job-change-confirm-header, .homunculus-modal-header, .skill-copy-header") || null;
}

function clampSizedWindowToViewport(target) {
  if (!target?.classList?.contains("game-window") || target.classList.contains("hidden-window")) return;
  const rect = target.getBoundingClientRect();
  const vp = getViewportSizeForUI();
  const margin = 8;
  let left = parseFloat(target.style.left);
  let top = parseFloat(target.style.top);
  if (!Number.isFinite(left)) left = target.offsetLeft || margin;
  if (!Number.isFinite(top)) top = target.offsetTop || margin;
  if (rect.right < 38) left += (38 - rect.right);
  if (rect.left > vp.width - 38) left -= (rect.left - (vp.width - 38));
  if (rect.bottom < 34) top += (34 - rect.bottom);
  if (rect.top > vp.height - 34) top -= (rect.top - (vp.height - 34));
  target.style.setProperty("left", `${Math.round(left)}px`, "important");
  target.style.setProperty("top", `${Math.round(top)}px`, "important");
  target.style.setProperty("right", "auto", "important");
  target.style.setProperty("bottom", "auto", "important");
}

function applyWindowSize(target, requestedSize, options = {}) {
  if (!target) return;
  const size = normalizeWindowSize(requestedSize);
  target.dataset.uiSize = size;
  target.style.zoom = size === "medium" ? "0.75" : (size === "small" ? "0.5" : "1");
  const button = target.querySelector(":scope > .window-title .window-size-cycle, :scope > .ui-size-header .window-size-cycle, .window-size-cycle");
  if (button) {
    button.textContent = RO_UI_SIZE_LABELS[size];
    button.title = `視窗大小：${RO_UI_SIZE_LABELS[size]}（點擊切換）`;
    button.setAttribute("aria-label", `視窗大小 ${RO_UI_SIZE_LABELS[size]}，點擊切換`);
  }
  if (!options.skipClamp) window.requestAnimationFrame(() => clampSizedWindowToViewport(target));
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
  button.addEventListener("pointerdown", event => event.stopPropagation());
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    cycleWindowSize(target);
  });
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
  cycleWindowSize
});
