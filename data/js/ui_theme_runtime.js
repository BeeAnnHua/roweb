// RO_WEB 0.9.82GR — 靜態黑金 UI、按需數量控制器與共用確認視窗
(function initROBlackGoldThemeRuntime(global) {
  "use strict";

  const DOC = global.document;
  const AUDITED_ATTR = "data-ro-gold-audited";
  const NUMBER_READY_ATTR = "data-ro-number-stepper";
  const EXCLUDED_BUTTON_SELECTOR = [
    ".inventory-slot",
    ".equipment-slot",
    ".quick-slot",
    ".skill-card",
    ".skill-button",
    ".world-monster-hitbox",
    ".map-monster-distribution-row",
    ".grade-equipment-row",
    ".refine-equipment-row",
    ".refine-material-choice",
    ".refine-blessing-slot",
    ".storage-item-icon",
    ".character-gender-option"
  ].join(",");
  const DANGER_RE = /刪除|全部刪除|清除|重置|分解|破壞|銷毀|移除角色|delete|reset|danger/i;
  const SECONDARY_RE = /取消|返回|關閉|稍後|再考慮|上一步|否|cancel|back|close/i;

  function buttonLabel(button) {
    return [
      button.textContent,
      button.getAttribute("aria-label"),
      button.className,
      button.id,
      button.getAttribute("title")
    ].filter(Boolean).join(" ").trim();
  }

  function auditButton(button) {
    if (!(button instanceof global.HTMLButtonElement) || button.hasAttribute(AUDITED_ATTR)) return;
    button.setAttribute(AUDITED_ATTR, "1");
    if (button.matches(EXCLUDED_BUTTON_SELECTOR)) return;
    const label = buttonLabel(button);
    button.classList.add("ro-gold-control");
    if (button.classList.contains("window-close") || button.classList.contains("ui-toggle") || /^[×✕✖＋+－−<>‹›^v⌃⌄]$/.test(button.textContent.trim())) {
      button.classList.add("ro-gold-icon-control");
    }
    if (DANGER_RE.test(label)) button.classList.add("ro-gold-danger-control");
    else if (SECONDARY_RE.test(label)) button.classList.add("ro-gold-secondary-control");
  }

  function auditFormControl(control) {
    if (!(control instanceof global.HTMLElement)) return;
    if (control.matches("select, textarea, input:not([type]), input[type='text'], input[type='search'], input[type='password'], input[type='email'], input[type='number']")) {
      control.classList.add("ro-gold-field");
    }
  }

  function numericValue(input) {
    const value = Number(input.value);
    return Number.isFinite(value) ? value : 0;
  }

  function clampNumberInput(input, value) {
    const min = input.min === "" ? -Infinity : Number(input.min);
    const max = input.max === "" ? Infinity : Number(input.max);
    let next = Number(value);
    if (!Number.isFinite(next)) next = Number.isFinite(min) ? min : 0;
    if (Number.isFinite(min)) next = Math.max(min, next);
    if (Number.isFinite(max)) next = Math.min(max, next);
    return next;
  }

  function dispatchNumberChange(input) {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function stepNumberInput(input, direction) {
    if (!input || input.disabled || input.readOnly) return;
    const before = input.value;
    try {
      if (direction > 0 && typeof input.stepUp === "function") input.stepUp();
      else if (direction < 0 && typeof input.stepDown === "function") input.stepDown();
    } catch (_) {
      const step = input.step === "any" || input.step === "" ? 1 : Number(input.step || 1);
      input.value = String(clampNumberInput(input, numericValue(input) + (Number.isFinite(step) ? step : 1) * direction));
    }
    if (before === input.value) {
      const step = input.step === "any" || input.step === "" ? 1 : Number(input.step || 1);
      input.value = String(clampNumberInput(input, numericValue(input) + (Number.isFinite(step) ? step : 1) * direction));
    }
    dispatchNumberChange(input);
    input.focus({ preventScroll: true });
  }

  // 長按計時器只在使用者按住按鈕時存在，放開後立即清除；沒有背景輪詢。
  function bindHoldStepper(button, input, direction) {
    let delayTimer = 0;
    let repeatTimer = 0;
    let lastPointerStepAt = 0;
    const clear = () => {
      global.clearTimeout(delayTimer);
      global.clearInterval(repeatTimer);
      delayTimer = 0;
      repeatTimer = 0;
    };
    button.addEventListener("pointerdown", event => {
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      clear();
      lastPointerStepAt = Date.now();
      stepNumberInput(input, direction);
      delayTimer = global.setTimeout(() => {
        repeatTimer = global.setInterval(() => {
          lastPointerStepAt = Date.now();
          stepNumberInput(input, direction);
        }, 95);
      }, 430);
      try { button.setPointerCapture?.(event.pointerId); } catch (_) {}
    });
    ["pointerup", "pointercancel", "pointerleave", "lostpointercapture"].forEach(type => button.addEventListener(type, clear));
    button.addEventListener("click", event => {
      event.preventDefault();
      if (Date.now() - lastPointerStepAt < 700) { lastPointerStepAt = 0; return; }
      stepNumberInput(input, direction);
    });
  }

  function enhanceNumberInput(input, options = {}) {
    if (!(input instanceof global.HTMLInputElement) || input.type !== "number" || input.hasAttribute(NUMBER_READY_ATTR)) return input;
    input.classList.add("ro-number-input", "ro-gold-field");
    // 自動掛機和商店已有專用控制器，不重複包裝。
    if (input.dataset.roNumberOwner === "auto-combat" || input.dataset.roNumberOwner === "shop" || input.closest("#auto-combat-panel, .auto-number-control, .shop-qty-row")) return input;
    const requested = options.force === true || input.hasAttribute("data-ro-gold-stepper");
    if (!requested) return input;
    const parent = input.parentElement;
    if (!parent) return input;
    input.setAttribute(NUMBER_READY_ATTR, "1");
    const wrapper = DOC.createElement("span");
    wrapper.className = "ro-number-stepper";
    if (input.closest(".auto-inline-setting, .auto-combat-settings, .storage-item-controls")) wrapper.classList.add("is-compact");
    parent.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const minus = DOC.createElement("button");
    minus.type = "button";
    minus.className = "ro-number-step ro-number-step-minus ro-gold-control ro-gold-icon-control";
    minus.setAttribute("aria-label", "減少數量");
    minus.textContent = "−";

    const plus = DOC.createElement("button");
    plus.type = "button";
    plus.className = "ro-number-step ro-number-step-plus ro-gold-control ro-gold-icon-control";
    plus.setAttribute("aria-label", "增加數量");
    plus.textContent = "+";

    wrapper.insertBefore(minus, input);
    wrapper.appendChild(plus);
    bindHoldStepper(minus, input, -1);
    bindHoldStepper(plus, input, 1);
    return input;
  }

  function enhanceNumberInputs(root, options = {}) {
    if (!root) return 0;
    const inputs = [];
    if (root.matches?.("input[type='number']")) inputs.push(root);
    root.querySelectorAll?.("input[type='number']").forEach(input => inputs.push(input));
    inputs.forEach(input => enhanceNumberInput(input, options));
    return inputs.length;
  }

  function auditRoot(root) {
    if (!DOC || !root) return;
    const nodes = root.nodeType === 1 || root.nodeType === 9 ? root : null;
    if (!nodes) return;
    if (nodes.matches?.("button")) auditButton(nodes);
    auditFormControl(nodes);
    nodes.querySelectorAll?.("button").forEach(auditButton);
    nodes.querySelectorAll?.("select, textarea, input:not([type]), input[type='text'], input[type='search'], input[type='password'], input[type='email'], input[type='number']").forEach(auditFormControl);
    if (nodes.matches?.("input[type='number'][data-ro-gold-stepper]")) enhanceNumberInput(nodes);
    nodes.querySelectorAll?.("input[type='number'][data-ro-gold-stepper]").forEach(input => enhanceNumberInput(input));
  }

  let activeDialog = null;
  function ensureDialog() {
    if (!DOC) return null;
    let overlay = DOC.getElementById("roGoldDialogOverlay");
    if (overlay) return overlay;
    overlay = DOC.createElement("section");
    overlay.id = "roGoldDialogOverlay";
    overlay.className = "ro-gold-dialog-overlay";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="ro-gold-dialog" role="document">
        <header class="ro-gold-dialog-header">
          <b id="roGoldDialogTitle">確認</b>
          <button type="button" class="ro-gold-dialog-close ro-gold-secondary-control" aria-label="關閉">×</button>
        </header>
        <div id="roGoldDialogMessage" class="ro-gold-dialog-message"></div>
        <footer class="ro-gold-dialog-actions">
          <button type="button" class="ro-gold-dialog-cancel ro-gold-secondary-control">取消</button>
          <button type="button" class="ro-gold-dialog-confirm">確認</button>
        </footer>
      </div>`;
    DOC.body.appendChild(overlay);
    auditRoot(overlay);
    return overlay;
  }

  function closeDialog(result) {
    if (!activeDialog) return;
    const { overlay, resolve, previousFocus, keyHandler } = activeDialog;
    activeDialog = null;
    overlay.hidden = true;
    DOC.removeEventListener("keydown", keyHandler, true);
    try { previousFocus?.focus?.({ preventScroll: true }); } catch (_) {}
    resolve(result);
  }

  function openDialog(message, options = {}) {
    if (!DOC) return Promise.resolve(options.kind === "alert" ? true : false);
    const overlay = ensureDialog();
    if (!overlay) return Promise.resolve(false);
    if (activeDialog) closeDialog(false);
    const title = overlay.querySelector("#roGoldDialogTitle");
    const body = overlay.querySelector("#roGoldDialogMessage");
    const confirmButton = overlay.querySelector(".ro-gold-dialog-confirm");
    const cancelButton = overlay.querySelector(".ro-gold-dialog-cancel");
    const closeButton = overlay.querySelector(".ro-gold-dialog-close");
    const isAlert = options.kind === "alert";
    title.textContent = String(options.title || (isAlert ? "系統訊息" : "確認操作"));
    body.textContent = String(message || "");
    confirmButton.textContent = String(options.confirmText || (isAlert ? "確定" : "確認"));
    cancelButton.textContent = String(options.cancelText || "取消");
    cancelButton.hidden = isAlert;
    confirmButton.classList.toggle("ro-gold-danger-control", Boolean(options.danger));
    overlay.classList.toggle("is-danger", Boolean(options.danger));
    overlay.hidden = false;

    return new Promise(resolve => {
      const previousFocus = DOC.activeElement;
      const keyHandler = event => {
        if (event.key === "Escape") { event.preventDefault(); closeDialog(isAlert ? true : false); }
        else if (event.key === "Enter") { event.preventDefault(); closeDialog(true); }
      };
      activeDialog = { overlay, resolve, previousFocus, keyHandler };
      DOC.addEventListener("keydown", keyHandler, true);
      confirmButton.onclick = () => closeDialog(true);
      cancelButton.onclick = () => closeDialog(false);
      closeButton.onclick = () => closeDialog(isAlert ? true : false);
      overlay.onclick = event => { if (event.target === overlay) closeDialog(isAlert ? true : false); };
      global.requestAnimationFrame(() => confirmButton.focus({ preventScroll: true }));
    });
  }

  const GoldUI = {
    confirm(message, options = {}) { return openDialog(message, { ...options, kind: "confirm" }); },
    alert(message, options = {}) { return openDialog(message, { ...options, kind: "alert" }); },
    audit: auditRoot,
    refresh(root = DOC) { auditRoot(root); },
    enhanceNumberInput,
    enhanceNumberInputs,
    performanceProfile: Object.freeze({ mutationObserver: false, backgroundPolling: false, staticCss: true, explicitInitialization: true })
  };

  global.ROGoldUI = GoldUI;
  global.ROBlackGoldAudit = { run: () => auditRoot(DOC), auditRoot, enhanceNumberInput, enhanceNumberInputs, auditButton };
  global.__roBlackGoldObserver = null;

  if (DOC) {
    const start = () => {
      DOC.body?.classList.add("ro-black-gold-theme");
      // 僅在啟動時稽查一次；動態按鈕由靜態 CSS 套用。
      auditRoot(DOC);
      ensureDialog();
    };
    if (DOC.readyState === "loading") DOC.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
})(window);
