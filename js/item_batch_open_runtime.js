//============================================================
// RO_WEB 0.9.82HY — ItemBatchOpenRuntime
// Shared controlled quantity opener for MVP gacha, ItemBox/ItemGroup boxes,
// card albums and future container adapters. No hold-to-repeat; users enter
// one explicit amount. Work is sliced by the owning adapter to keep UI responsive.
//============================================================
(() => {
  "use strict";

  const VERSION = "0.9.82HY";
  const DEFAULT_AMOUNT = 100;
  const adapters = [];
  let activeSession = null;

  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const integer = (value, fallback = 0) => Math.floor(number(value, fallback));

  function itemData(value) {
    const id = value && typeof value === "object" ? (value.id ?? value.itemId ?? value.officialId) : value;
    return window.getItemData?.(id) || (value && typeof value === "object" ? value : null);
  }

  function inventoryStack(itemId) {
    if (typeof window.findInventoryItemById === "function") return window.findInventoryItemById(itemId);
    return (window.player?.inventory || []).find(row => String(row?.id) === String(itemId) && !row?.instanceId) || null;
  }

  function registerAdapter(adapter) {
    if (!adapter || typeof adapter !== "object" || !adapter.id || typeof adapter.matches !== "function") return false;
    const index = adapters.findIndex(row => String(row.id) === String(adapter.id));
    if (index >= 0) adapters.splice(index, 1);
    adapters.push(adapter);
    return true;
  }

  function getAdapter(itemOrId) {
    const item = itemData(itemOrId);
    if (!item) return null;
    return adapters.find(adapter => {
      try { return adapter.matches(item) === true; }
      catch (error) { console.warn(`[ItemBatchOpenRuntime] adapter ${adapter.id} match failed`, error); return false; }
    }) || null;
  }

  function canBatchOpen(itemOrId) {
    return Boolean(getAdapter(itemOrId));
  }

  function getAvailableCount(itemOrId) {
    const item = itemData(itemOrId);
    const adapter = getAdapter(item);
    if (!item || !adapter) return 0;
    try {
      return Math.max(0, integer(adapter.getAvailable?.(item), 0));
    } catch (error) {
      console.warn(`[ItemBatchOpenRuntime] adapter ${adapter.id} availability failed`, error);
      return 0;
    }
  }

  function sanitizeRequested(value, available) {
    const requested = Math.max(1, integer(value, 1));
    return Math.min(requested, Math.max(0, integer(available)));
  }

  function setControlBusy(control, busy) {
    if (!control) return;
    control.classList.toggle("is-running", Boolean(busy));
    const input = control.querySelector(".item-batch-open-input");
    const button = control.querySelector(".item-batch-open-button");
    if (input) input.disabled = Boolean(busy);
    if (button) button.disabled = Boolean(busy);
  }

  function updateControlAvailability(control, item) {
    if (!control) return 0;
    const available = getAvailableCount(item);
    const held = control.querySelector(".item-batch-open-held");
    const input = control.querySelector(".item-batch-open-input");
    const button = control.querySelector(".item-batch-open-button");
    if (held) held.textContent = `持有：${available.toLocaleString()}`;
    if (input) {
      input.max = String(Math.max(1, available));
      if (!input.value || integer(input.value) <= 0) input.value = String(Math.min(DEFAULT_AMOUNT, Math.max(1, available)));
      if (integer(input.value) > available && available > 0) input.value = String(available);
    }
    if (button && !activeSession) button.disabled = available <= 0;
    return available;
  }

  function finishSession(reason = "complete", detail = null) {
    const session = activeSession;
    if (!session) return;
    const control = session.control;
    const status = control?.querySelector(".item-batch-open-status");
    const completed = Math.max(0, Math.min(session.accepted, integer((detail?.totalOpened ?? session.startTotal) - session.startTotal)));
    if (status) {
      if (reason === "error") status.textContent = `批量開啟停止：${String(detail?.error || "處理錯誤")}`;
      else if (reason === "canceled-for-save") status.textContent = `已完成 ${completed.toLocaleString()} / ${session.accepted.toLocaleString()}；其餘數量未消耗。`;
      else status.textContent = `完成：${session.accepted.toLocaleString()} 次。`;
    }
    setControlBusy(control, false);
    activeSession = null;
    updateControlAvailability(control, session.item);
  }

  function handleProgress(event) {
    const detail = event?.detail || {};
    const session = activeSession;
    if (!session || String(detail.adapterId) !== String(session.adapter.id) || String(detail.itemId) !== String(session.item.id)) return;
    const completed = Math.max(0, Math.min(session.accepted, integer(detail.totalOpened) - session.startTotal));
    const status = session.control?.querySelector(".item-batch-open-status");
    if (status) status.textContent = `開啟中：${completed.toLocaleString()} / ${session.accepted.toLocaleString()}`;
    if (["complete", "error", "canceled-for-save"].includes(String(detail.reason)) || completed >= session.accepted) {
      finishSession(String(detail.reason || "complete"), detail);
    }
  }

  function openQuantity(itemOrId, requested, options = {}) {
    const item = itemData(itemOrId);
    const adapter = getAdapter(item);
    if (!item || !adapter) return { ok:false, accepted:0, reason:"unsupported" };
    if (activeSession) {
      return { ok:false, accepted:0, reason:"batch-active", activeItemName:activeSession.item?.name || "其他箱子" };
    }
    const available = getAvailableCount(item);
    const amount = sanitizeRequested(requested, available);
    if (amount <= 0) return { ok:false, accepted:0, available, reason:"missing-item" };

    const stateBefore = adapter.getState?.() || {};
    const result = adapter.enqueue(item, amount, {
      source:"batch-open-ui",
      userInitiated:options.userInitiated !== false,
      immediate:true
    }) || { ok:false, accepted:0, reason:"enqueue-failed" };
    const accepted = Math.max(0, integer(result.accepted));
    if (!result.ok || accepted <= 0) return { ...result, accepted:0 };

    const control = options.control || null;
    activeSession = {
      adapter,
      item,
      control,
      accepted,
      startTotal:Math.max(0, integer(stateBefore.totalOpened ?? result.totalOpened))
    };
    if (control) {
      setControlBusy(control, true);
      const status = control.querySelector(".item-batch-open-status");
      if (status) status.textContent = `開啟中：0 / ${accepted.toLocaleString()}`;
    }
    return { ...result, ok:true, accepted };
  }

  function renderControls(container, itemOrId) {
    const item = itemData(itemOrId);
    if (!container || !item || !canBatchOpen(item)) return false;
    container.innerHTML = "";
    container.hidden = false;

    const control = document.createElement("div");
    control.className = "item-batch-open-control";
    control.dataset.itemId = String(item.id);

    const titleRow = document.createElement("div");
    titleRow.className = "item-batch-open-title-row";
    const title = document.createElement("b");
    title.textContent = "指定開啟數量";
    const held = document.createElement("span");
    held.className = "item-batch-open-held";
    titleRow.append(title, held);

    const actionRow = document.createElement("div");
    actionRow.className = "item-batch-open-action-row";
    const input = document.createElement("input");
    input.className = "item-batch-open-input";
    input.type = "number";
    input.inputMode = "numeric";
    input.min = "1";
    input.step = "1";
    input.autocomplete = "off";
    input.setAttribute("aria-label", `${item.name} 開啟數量`);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "item-batch-open-button";
    button.textContent = "開啟";
    actionRow.append(input, button);

    const status = document.createElement("div");
    status.className = "item-batch-open-status";
    status.textContent = "輸入超過持有數量時，只會開啟現有數量。";

    const start = event => {
      event?.preventDefault?.();
      const available = updateControlAvailability(control, item);
      const requested = sanitizeRequested(input.value, available);
      if (requested <= 0) {
        status.textContent = `背包裡沒有 ${item.name}。`;
        return;
      }
      input.value = String(requested);
      const result = openQuantity(item, requested, { control, userInitiated:event?.isTrusted !== false });
      if (!result.ok) {
        status.textContent = result.reason === "batch-active"
          ? `${result.activeItemName || "其他箱子"}仍在批量開啟中。`
          : `無法開啟：${String(result.reason || "未知原因")}`;
      }
    };
    button.addEventListener("click", start);
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") start(event);
    });
    input.addEventListener("change", () => {
      const available = updateControlAvailability(control, item);
      input.value = String(Math.max(1, sanitizeRequested(input.value, Math.max(1, available))));
    });

    control.append(titleRow, actionRow, status);
    container.appendChild(control);
    const available = updateControlAvailability(control, item);
    input.value = String(Math.min(DEFAULT_AMOUNT, Math.max(1, available)));
    button.disabled = available <= 0;
    return true;
  }

  function flushPendingForSave(options = {}) {
    const results = [];
    for (const adapter of adapters) {
      if (typeof adapter.flushPendingForSave !== "function") continue;
      try { results.push({ adapterId:adapter.id, ...(adapter.flushPendingForSave(options) || {}) }); }
      catch (error) {
        console.error(`[ItemBatchOpenRuntime] adapter ${adapter.id} save barrier failed`, error);
        results.push({ adapterId:adapter.id, opened:0, remaining:0, error:String(error?.message || error) });
      }
    }
    const aggregate = results.reduce((out, row) => {
      out.opened += Math.max(0, number(row.opened));
      out.remaining += Math.max(0, number(row.remaining));
      out.canceled += Math.max(0, number(row.canceled));
      return out;
    }, { opened:0, remaining:0, canceled:0 });
    aggregate.results = results;
    return aggregate;
  }

  registerAdapter({
    id:"mvp_gacha",
    matches(item) {
      const config = window.MvpGachaRuntime?.config?.();
      return Boolean(window.MvpGachaRuntime && String(item?.id) === String(config?.gachaItemId || 14848));
    },
    getAvailable(item) {
      const stack = inventoryStack(item.id);
      const state = window.MvpGachaRuntime?.getBatchState?.() || {};
      return Math.max(0, integer(stack?.count) - Math.max(0, integer(state.pending)));
    },
    getState() { return window.MvpGachaRuntime?.getBatchState?.() || {}; },
    enqueue(item, amount, options) { return window.MvpGachaRuntime?.enqueueOpenQuantity?.(item, amount, options); },
    flushPendingForSave(options) { return window.MvpGachaRuntime?.flushPendingForSave?.(options) || {}; }
  });

  registerAdapter({
    id:"item_box",
    matches(item) { return Boolean(window.ItemBoxRuntime?.boxForItem?.(item)); },
    getAvailable(item) {
      const box = window.ItemBoxRuntime?.boxForItem?.(item);
      const consumeCount = Math.max(1, integer(box?.consumeCount, 1));
      const stack = inventoryStack(item.id);
      const state = window.ItemBoxRuntime?.getBatchState?.() || {};
      const pending = String(state.itemId) === String(item.id) ? Math.max(0, integer(state.pending)) : 0;
      return Math.max(0, Math.floor(Math.max(0, number(stack?.count)) / consumeCount) - pending);
    },
    getState() { return window.ItemBoxRuntime?.getBatchState?.() || {}; },
    enqueue(item, amount, options) { return window.ItemBoxRuntime?.enqueueOpenQuantity?.(item, amount, options); },
    flushPendingForSave(options) { return window.ItemBoxRuntime?.flushPendingForSave?.(options) || {}; }
  });

  window.addEventListener?.("ro-web:batch-open-progress", handleProgress);

  window.ItemBatchOpenRuntime = Object.freeze({
    version:VERSION,
    registerAdapter,
    getAdapter,
    canBatchOpen,
    getAvailableCount,
    openQuantity,
    renderControls,
    flushPendingForSave,
    getActiveSession:() => activeSession ? {
      adapterId:activeSession.adapter.id,
      itemId:Number(activeSession.item.id),
      itemName:activeSession.item.name,
      accepted:activeSession.accepted,
      startTotal:activeSession.startTotal
    } : null
  });
})();
