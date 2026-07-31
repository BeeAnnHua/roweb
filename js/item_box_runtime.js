//=======================================
// RO_WEB ItemBoxRuntime v0.9.82HY
// Generic weighted loot-box runtime with controlled quantity batching.
// Supports EP19 Dim Glacier, rAthena Gift/Old Blue/Old Purple boxes,
// Token of Siegfried box, and future data/item_boxes.json entries.
//=======================================
(function () {
  "use strict";

  const VERSION = "0.9.82HY";
  const DATA_KEY = "data/item_boxes.json";
  const BATCH_SLICE_LIMIT = 32;
  const BATCH_DELAY_MS = 24;
  const CHECKPOINT_INTERVAL = 256;
  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const integer = (value, fallback = 0) => Math.floor(number(value, fallback));
  const config = () => window.RO_WEB_DATA?.[DATA_KEY] || { boxes:{} };
  const allBoxes = () => Object.values(config().boxes || {});
  const itemData = id => window.getItemData?.(id) || null;

  function boxForItem(item) {
    if (!item) return null;
    const byKey = item.lootBoxId && config().boxes?.[String(item.lootBoxId)];
    return byKey || allBoxes().find(box => String(box.itemId) === String(item.id)) || null;
  }

  function inventoryStack(itemId) {
    return (window.player?.inventory || []).find(row => String(row.id) === String(itemId) && !row?.instanceId && number(row.count) > 0) || null;
  }

  function removeStack(itemId, amount = 1) {
    const stack = inventoryStack(itemId);
    const count = Math.max(1, integer(amount, 1));
    if (!stack || number(stack.count) < count) return false;
    stack.count = number(stack.count) - count;
    if (stack.count <= 0) {
      const index = window.player.inventory.indexOf(stack);
      if (index >= 0) window.player.inventory.splice(index, 1);
    }
    return true;
  }

  function restoreStack(item, amount = 1) {
    const count = Math.max(1, integer(amount, 1));
    const stack = inventoryStack(item.id);
    if (stack) stack.count = number(stack.count) + count;
    else {
      window.player.inventory = Array.isArray(window.player.inventory) ? window.player.inventory : [];
      window.player.inventory.push({ id:item.id, name:item.name, count, locked:false });
    }
  }

  function weightedReward(box) {
    // Never filter missing item data out of the denominator. openBoxOnce validates
    // the selected item before consuming the container, preserving official weights.
    const rewards = (box?.rewards || []).filter(row => number(row.weight) > 0);
    if (!rewards.length) return null;
    const total = rewards.reduce((sum, row) => sum + number(row.weight), 0);
    if (!(total > 0)) return null;
    let roll = Math.random() * total;
    for (const row of rewards) {
      roll -= number(row.weight);
      if (roll < 0) return row;
    }
    return rewards[rewards.length - 1];
  }

  function rewardChanceBasisPoints(box, reward) {
    if (!box || !reward) return 0;
    if (window.RareItemAnnouncementRuntime?.weightedItemChanceBasisPoints) {
      return window.RareItemAnnouncementRuntime.weightedItemChanceBasisPoints(box.rewards, reward, 10000);
    }
    const rewards = (box.rewards || []).filter(row => number(row.weight) > 0);
    const total = rewards.reduce((sum, row) => sum + number(row.weight), 0);
    if (!(total > 0)) return 0;
    const selectedId = String(reward.itemId);
    const matching = rewards.reduce((sum, row) => String(row.itemId) === selectedId ? sum + number(row.weight) : sum, 0);
    return Math.max(0, Math.min(10000, matching / total * 10000));
  }

  function openBoxOnce(item, options = {}) {
    const box = boxForItem(item);
    if (!box) return { ok:false, reason:"not-box" };
    const consumeCount = Math.max(1, integer(box.consumeCount, 1));
    const stack = inventoryStack(item.id);
    if (!stack || number(stack.count) < consumeCount) {
      if (!options.silent) window.addBattleLog?.(`背包裡沒有 ${item.name}。`);
      return { ok:false, reason:"missing-item" };
    }
    const reward = weightedReward(box);
    if (!reward) {
      if (!options.silent) window.addBattleLog?.(`${item.name} 的獎池資料異常，未消耗箱子。`);
      return { ok:false, reason:"invalid-pool" };
    }
    const rewardItem = itemData(reward.itemId);
    if (!rewardItem) {
      if (!options.silent) window.addBattleLog?.(`${item.name} 的獎勵物品 ${reward.itemId} 資料尚未載入，未消耗箱子。`);
      return { ok:false, reason:"missing-reward", rewardItemId:reward.itemId };
    }
    if (!removeStack(item.id, consumeCount)) return { ok:false, reason:"remove-failed" };

    const rewardQuantity = Math.max(1, integer(reward.quantity, 1));
    const previousBatch = window.RO_WEB_REWARD_BATCH_ACTIVE;
    const previousSuppress = window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG;
    try {
      window.RO_WEB_REWARD_BATCH_ACTIVE = true;
      window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG = true;
      window.addItem?.({ id:Number(rewardItem.id), name:rewardItem.name }, rewardQuantity);
    } catch (error) {
      restoreStack(item, consumeCount);
      console.error("[ItemBoxRuntime] rollback", error);
      if (!options.silent) window.addBattleLog?.(`${item.name} 開啟失敗，箱子已自動歸還。`);
      return { ok:false, reason:"reward-failed", error:String(error?.message || error) };
    } finally {
      window.RO_WEB_REWARD_BATCH_ACTIVE = previousBatch;
      window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG = previousSuppress;
    }

    const actualChance = rewardChanceBasisPoints(box, reward);
    const result = {
      ok:true,
      box,
      item,
      reward,
      rewardItem,
      rewardQuantity,
      chanceBasisPoints:actualChance,
      consumeCount
    };

    if (!options.silent) {
      window.RareItemAnnouncementRuntime?.announceAcquisition?.({
        itemId:rewardItem.id,
        itemName:rewardItem.name,
        quantity:rewardQuantity,
        chanceBasisPoints:actualChance,
        source:"item_box",
        sourceLabel:item.name
      });
      window.addBattleLog?.(`開啟 ${item.name}，獲得 ${rewardItem.name} ×${rewardQuantity}。`, "rare-item");
      window.updateInventoryUI?.();
      window.updateQuickSlotUI?.({ skipIfUnchanged:true });
      window.saveGame?.({ reason:"item-box-reward" });
    }
    return result;
  }

  const BATCH = {
    item:null,
    pending:0,
    processing:false,
    scheduled:false,
    timerId:0,
    openedSinceCheckpoint:0,
    totalOpened:0,
    lastError:""
  };

  function emitProgress(reason = "progress") {
    if (typeof window.dispatchEvent !== "function" || typeof window.CustomEvent !== "function") return;
    window.dispatchEvent(new window.CustomEvent("ro-web:batch-open-progress", {
      detail:{
        adapterId:"item_box",
        itemId:Number(BATCH.item?.id || 0),
        itemName:String(BATCH.item?.name || "箱子"),
        pending:Math.max(0, integer(BATCH.pending)),
        processing:Boolean(BATCH.processing),
        totalOpened:Math.max(0, integer(BATCH.totalOpened)),
        reason:String(reason || "progress"),
        error:BATCH.lastError || ""
      }
    }));
  }

  function formatSummary(item, opened, summary) {
    const rows = [...summary.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "zh-Hant"));
    const visible = rows.slice(0, 8).map(row => `${row.name} ×${row.quantity}`);
    if (rows.length > visible.length) visible.push(`另 ${rows.length - visible.length} 種`);
    return `批量開啟 ${item.name} ×${opened}，獲得：${visible.join("、")}。`;
  }

  function refreshBatchUi(item, opened, summary, rareAcquisitions, options = {}) {
    if (opened <= 0) return;
    const inventoryWindow = document.getElementById?.("inventory-window");
    const inventoryVisible = inventoryWindow && !inventoryWindow.classList.contains("hidden-window") && inventoryWindow.offsetParent !== null;
    if (inventoryVisible) window.updateInventoryUI?.();
    else window.RO_WEB_INVENTORY_DIRTY = true;
    window.updateQuickSlotUI?.({ skipIfUnchanged:true });

    if (rareAcquisitions.length && window.RareItemAnnouncementRuntime?.announceBatch) {
      window.RareItemAnnouncementRuntime.announceBatch(rareAcquisitions);
    } else if (rareAcquisitions.length) {
      rareAcquisitions.forEach(row => window.RareItemAnnouncementRuntime?.announceAcquisition?.(row));
    }
    window.addBattleLog?.(formatSummary(item, opened, summary), "item");

    if (!options.skipSave && !window.RO_WEB_SAVE_PREPARING_REWARDS) {
      if (typeof window.requestGameSave === "function") window.requestGameSave(1200, "item-box-batch");
      else window.setTimeout(() => window.saveGame?.({ reason:"item-box-batch", preparePendingRewards:false }), 0);
    }
    window.RO_WEB_REWARD_PLAYER_UI_DIRTY = false;
    window.RO_WEB_REWARD_JOB_UI_DIRTY = false;
    window.RO_WEB_REWARD_INVENTORY_UI_DIRTY = false;
    window.RO_WEB_REWARD_SAVE_DIRTY = false;
    if (Array.isArray(window.RO_WEB_REWARD_BATCH_LOGS)) window.RO_WEB_REWARD_BATCH_LOGS.length = 0;
  }

  function processBatch(options = {}) {
    BATCH.scheduled = false;
    BATCH.timerId = 0;
    if (BATCH.processing || BATCH.pending <= 0 || !window.player || !BATCH.item) return false;
    BATCH.processing = true;
    BATCH.lastError = "";
    const item = BATCH.item;
    const summary = new Map();
    const rareAcquisitions = [];
    let opened = 0;
    try {
      const limit = options.drainAll === true ? BATCH.pending : Math.min(BATCH_SLICE_LIMIT, BATCH.pending);
      for (let index = 0; index < limit; index += 1) {
        const result = openBoxOnce(item, { silent:true });
        if (!result.ok) {
          BATCH.lastError = result.reason || "open-failed";
          BATCH.pending = 0;
          window.addBattleLog?.(`${item.name} 批量開啟已停止：${BATCH.lastError}。`, "error");
          break;
        }
        BATCH.pending -= 1;
        opened += 1;
        const key = String(result.rewardItem.id);
        const aggregate = summary.get(key) || { id:result.rewardItem.id, name:result.rewardItem.name, quantity:0 };
        aggregate.quantity += result.rewardQuantity;
        summary.set(key, aggregate);
        if (window.RareItemAnnouncementRuntime?.tierForChanceBasisPoints?.(result.chanceBasisPoints)) {
          rareAcquisitions.push({
            itemId:result.rewardItem.id,
            itemName:result.rewardItem.name,
            quantity:result.rewardQuantity,
            chanceBasisPoints:result.chanceBasisPoints,
            source:"item_box",
            sourceLabel:item.name
          });
        }
      }
    } catch (error) {
      console.error("[ItemBoxRuntime] batch failed", error);
      BATCH.lastError = String(error?.message || error || "batch-failed");
      BATCH.pending = 0;
      window.addBattleLog?.(`${item.name} 批量開啟發生錯誤，尚未處理的數量已取消。`, "error");
    } finally {
      BATCH.processing = false;
      refreshBatchUi(item, opened, summary, rareAcquisitions, options);
    }

    BATCH.openedSinceCheckpoint += opened;
    BATCH.totalOpened += opened;
    if (!options.skipCheckpoint && BATCH.openedSinceCheckpoint >= CHECKPOINT_INTERVAL) {
      BATCH.openedSinceCheckpoint %= CHECKPOINT_INTERVAL;
      window.saveGame?.({ reason:"item-box-checkpoint", durableDelayMs:0, preparePendingRewards:false });
    }
    if (BATCH.pending > 0 && options.skipSchedule !== true) scheduleBatch(BATCH_DELAY_MS);
    if (BATCH.pending <= 0 && opened > 0 && !options.skipSave && !window.RO_WEB_SAVE_PREPARING_REWARDS) {
      window.saveGame?.({ reason:"item-box-final", durableDelayMs:0, preparePendingRewards:false });
    }
    emitProgress(BATCH.pending > 0 ? "slice" : (BATCH.lastError ? "error" : "complete"));
    return opened > 0;
  }

  function scheduleBatch(delayMs = BATCH_DELAY_MS) {
    if (BATCH.scheduled || BATCH.processing) return true;
    BATCH.scheduled = true;
    BATCH.timerId = window.setTimeout(() => processBatch(), Math.max(0, number(delayMs)));
    return true;
  }

  function enqueueOpenQuantity(item, requested = 1, options = {}) {
    const box = boxForItem(item);
    if (!window.player || !item || !box) return { ok:false, accepted:0, reason:"not-box" };
    if (BATCH.item && BATCH.pending > 0 && String(BATCH.item.id) !== String(item.id)) {
      return { ok:false, accepted:0, reason:"another-batch-active", activeItemName:BATCH.item.name };
    }
    const consumeCount = Math.max(1, integer(box.consumeCount, 1));
    const stack = inventoryStack(item.id);
    const requestedCount = Math.max(1, integer(requested, 1));
    const rawAvailable = Math.floor(Math.max(0, number(stack?.count)) / consumeCount);
    const available = Math.max(0, rawAvailable - Math.max(0, integer(BATCH.pending)));
    if (available <= 0) return { ok:false, accepted:0, available:0, reason:"missing-item" };
    const accepted = Math.min(requestedCount, available);
    BATCH.item = item;
    BATCH.pending += accepted;
    scheduleBatch(options.immediate === true ? 0 : BATCH_DELAY_MS);
    emitProgress("queued");
    return {
      ok:true,
      accepted,
      requested:requestedCount,
      available,
      pending:BATCH.pending,
      totalOpened:BATCH.totalOpened
    };
  }

  function cancelPendingForSave(options = {}) {
    if (BATCH.timerId) {
      window.clearTimeout?.(BATCH.timerId);
      BATCH.timerId = 0;
    }
    BATCH.scheduled = false;
    const canceled = Math.max(0, integer(BATCH.pending));
    // Pending entries have not consumed their boxes yet. Cancelling is therefore
    // lossless and keeps manual/pagehide saves non-blocking even for huge requests.
    BATCH.pending = 0;
    emitProgress(canceled > 0 ? "canceled-for-save" : "save-ready");
    return {
      opened:0,
      remaining:0,
      canceled,
      busy:Boolean(BATCH.processing),
      reason:String(options.reason || "save")
    };
  }

  function openBox(item) {
    return openBoxOnce(item, { silent:false }).ok;
  }

  const previousUseItem = window.useItem;
  window.useItem = function itemBoxUseItem(itemId, instance = null, options = {}) {
    const item = itemData(itemId);
    if (boxForItem(item)) return openBox(item);
    return previousUseItem?.(itemId, instance, options);
  };

  window.ItemBoxRuntime = Object.freeze({
    version:VERSION,
    config,
    boxForItem,
    weightedReward,
    rewardChanceBasisPoints,
    openBox,
    openBoxOnce,
    enqueueOpenQuantity,
    processBatch,
    flushPendingForSave:cancelPendingForSave,
    getPendingOpenCount:() => Math.max(0, integer(BATCH.pending)),
    getBatchState:() => ({
      itemId:Number(BATCH.item?.id || 0),
      itemName:String(BATCH.item?.name || ""),
      pending:Math.max(0, integer(BATCH.pending)),
      processing:Boolean(BATCH.processing),
      totalOpened:Math.max(0, integer(BATCH.totalOpened)),
      lastError:BATCH.lastError || ""
    })
  });
})();
