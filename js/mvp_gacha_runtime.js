//============================================================
// RO_WEB 0.9.82HX — MVP 轉蛋每件特殊獎絕對機率＋全域稀有公告橋接
// - 同 ID MVP 只有在指定地圖死亡才以原始 1% 判定轉蛋，並套用全域掉落總閥。
// - 轉蛋內部稀有機率為單一 10000 基點母池的絕對機率；全域掉落倍率只影響轉蛋本體掉落。
// - 1% 紅色、0.1% 紫色、0.01% 金色上方橫幅。
//============================================================
(() => {
  "use strict";

  const VERSION = "0.9.82HX";
  const BUNDLE_KEY = "data/mvp_gacha.json";
  const DEFAULT_GACHA_ITEM_ID = 14848;
  const CASH_FOOD_SOURCE = "mvp_gacha_cash_food";
  const BANNER_STYLE_ID = "ro-mvp-gacha-banner-style";
  const BANNER_HOST_ID = "ro-mvp-gacha-banner-host";
  const MANUAL_GACHA_SOURCES = new Set(["item-info", "quick-slot", "quick-slot-key", "inventory-slot"]);
  const GACHA_GUARD_INTERVAL_MS = 500;

  function bundled(key, fallback = null) {
    return window.RO_WEB_DATA && Object.prototype.hasOwnProperty.call(window.RO_WEB_DATA, key)
      ? window.RO_WEB_DATA[key]
      : fallback;
  }

  function config() {
    return bundled(BUNDLE_KEY, null);
  }

  function activeMap() {
    try {
      if (typeof currentMap !== "undefined" && currentMap) return currentMap;
    } catch (_) {}
    return window.currentMap || null;
  }

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function integer(value, fallback = 0) {
    return Math.floor(number(value, fallback));
  }

  function randomBasisPoint() {
    return Math.floor(Math.random() * 10000) + 1;
  }

  function itemData(id) {
    return window.getItemData?.(id) || { id:Number(id), name:`Item ${id}` };
  }

  function findInventoryStack(id) {
    if (typeof window.findInventoryItemById === "function") return window.findInventoryItemById(id);
    return (window.player?.inventory || []).find(row => String(row?.id) === String(id) && !row?.instanceId) || null;
  }

  function removeOneStackItem(id) {
    const stack = findInventoryStack(id);
    if (!stack || number(stack.count) <= 0) return false;
    if (String(id) === String(gachaItemId())) authorizeGachaInventorySpend(1);
    stack.count = number(stack.count) - 1;
    if (stack.count <= 0) {
      window.player.inventory = (window.player.inventory || []).filter(row => row !== stack);
    }
    return true;
  }

  // 0.9.82GT：掛機期間的轉蛋數量防護。
  // 只有本 Runtime 的開啟流程可以授權減少；任何其他程式路徑造成的減少會自動復原。
  const GACHA_INVENTORY_GUARD = {
    expectedCount:null,
    lastWarningAt:0,
    restoredTotal:0,
    timer:0
  };

  function gachaItemId() {
    return Number(config()?.gachaItemId || DEFAULT_GACHA_ITEM_ID);
  }

  function getGachaInventoryCount() {
    const id = gachaItemId();
    return (window.player?.inventory || []).reduce((sum, row) => {
      if (String(row?.id) !== String(id) || row?.instanceId) return sum;
      return sum + Math.max(0, integer(row?.count));
    }, 0);
  }

  function isGachaInventoryGuardActive() {
    return Boolean(window.player && typeof window.isAutoBattleRunning === "function" && window.isAutoBattleRunning());
  }

  function ensureGachaGuardExpectedCount() {
    if (!Number.isFinite(GACHA_INVENTORY_GUARD.expectedCount)) {
      GACHA_INVENTORY_GUARD.expectedCount = getGachaInventoryCount();
    }
    return GACHA_INVENTORY_GUARD.expectedCount;
  }

  function authorizeGachaInventorySpend(quantity = 1) {
    ensureGachaGuardExpectedCount();
    GACHA_INVENTORY_GUARD.expectedCount = Math.max(0, GACHA_INVENTORY_GUARD.expectedCount - Math.max(0, integer(quantity)));
  }

  function noteAuthorizedGachaInventoryAddition(quantity = 1) {
    ensureGachaGuardExpectedCount();
    GACHA_INVENTORY_GUARD.expectedCount += Math.max(0, integer(quantity));
  }

  function restoreGachaInventory(quantity) {
    const amount = Math.max(0, integer(quantity));
    if (!amount || !window.player) return 0;
    const id = gachaItemId();
    const stack = findInventoryStack(id);
    const data = itemData(id);
    if (stack) stack.count = Math.max(0, integer(stack.count)) + amount;
    else {
      window.player.inventory = Array.isArray(window.player.inventory) ? window.player.inventory : [];
      window.player.inventory.push({ id, name:data.name, count:amount, locked:false });
    }
    GACHA_INVENTORY_GUARD.restoredTotal += amount;
    const now = Date.now();
    if (now - GACHA_INVENTORY_GUARD.lastWarningAt >= 30000) {
      GACHA_INVENTORY_GUARD.lastWarningAt = now;
      log(`偵測到掛機流程異常扣除 ${data.name} ×${amount}，已自動復原。`, "error");
    }
    window.RO_WEB_INVENTORY_DIRTY = true;
    window.updateQuickSlotUI?.({ skipIfUnchanged:true });
    const inventoryWindow = document.getElementById?.("inventory-window");
    if (inventoryWindow && !inventoryWindow.classList.contains("hidden-window") && inventoryWindow.offsetParent !== null) {
      window.updateInventoryUI?.();
    }
    window.requestGameSave?.(0);
    return amount;
  }

  function auditGachaInventoryGuard() {
    const current = getGachaInventoryCount();
    if (!isGachaInventoryGuardActive()) {
      GACHA_INVENTORY_GUARD.expectedCount = current;
      return { active:false, current, expected:current, restored:0 };
    }
    const expected = ensureGachaGuardExpectedCount();
    let restored = 0;
    if (current < expected) restored = restoreGachaInventory(expected - current);
    else if (current > expected) GACHA_INVENTORY_GUARD.expectedCount = current; // 合法掉落或其他增加一律接受。
    return {
      active:true,
      current:getGachaInventoryCount(),
      expected:GACHA_INVENTORY_GUARD.expectedCount,
      restored
    };
  }

  function startGachaInventoryGuard() {
    if (GACHA_INVENTORY_GUARD.timer || typeof window.setInterval !== "function") return;
    GACHA_INVENTORY_GUARD.expectedCount = getGachaInventoryCount();
    GACHA_INVENTORY_GUARD.timer = window.setInterval(auditGachaInventoryGuard, GACHA_GUARD_INTERVAL_MS);
  }

  function isAuthorizedManualGachaRequest(options = {}) {
    if (options?.testAuthorized === true) return true;
    const source = String(options?.source || "");
    return MANUAL_GACHA_SOURCES.has(source) && options?.userInitiated === true;
  }

  function weightedPick(rows) {
    const list = (Array.isArray(rows) ? rows : []).filter(row => number(row?.weight) > 0);
    const total = list.reduce((sum, row) => sum + number(row.weight), 0);
    if (!list.length || total <= 0) return null;
    let cursor = Math.random() * total;
    for (const row of list) {
      cursor -= number(row.weight);
      if (cursor < 0) return row;
    }
    return list[list.length - 1];
  }

  function ensureBannerUi() {
    if (typeof document === "undefined") return null;
    if (!document.getElementById(BANNER_STYLE_ID)) {
      const style = document.createElement("style");
      style.id = BANNER_STYLE_ID;
      style.textContent = `
#${BANNER_HOST_ID}{position:fixed;top:max(48px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:30000;width:min(920px,calc(100vw - 24px));pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:8px}
.ro-mvp-gacha-banner{box-sizing:border-box;width:100%;padding:11px 18px;border:2px solid rgba(255,255,255,.72);border-radius:10px;color:#fff;text-align:center;font-weight:800;letter-spacing:.03em;text-shadow:0 2px 3px rgba(0,0,0,.9);box-shadow:0 5px 20px rgba(0,0,0,.45);opacity:0;transform:translateY(-18px) scale(.98);animation:roMvpGachaBanner 4.8s ease forwards}
.ro-mvp-gacha-banner.red{background:linear-gradient(90deg,rgba(132,0,0,.96),rgba(226,38,38,.96),rgba(132,0,0,.96))}
.ro-mvp-gacha-banner.purple{background:linear-gradient(90deg,rgba(65,15,105,.97),rgba(151,63,214,.97),rgba(65,15,105,.97))}
.ro-mvp-gacha-banner.gold{color:#2d1b00;background:linear-gradient(90deg,#b77700,#ffe47b,#d39500);text-shadow:0 1px 1px rgba(255,255,255,.65);border-color:#fff2a6}
@keyframes roMvpGachaBanner{0%{opacity:0;transform:translateY(-18px) scale(.98)}10%,82%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-12px) scale(.99)}}
@media(max-width:640px){.ro-mvp-gacha-banner{padding:9px 12px;font-size:14px;border-radius:8px}}
      `;
      document.head.appendChild(style);
    }
    let host = document.getElementById(BANNER_HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = BANNER_HOST_ID;
      host.setAttribute("aria-live", "polite");
      document.body.appendChild(host);
    }
    return host;
  }

  function showRareBanner(tier, text) {
    if (window.RareItemAnnouncementRuntime?.showRareBanner) {
      return window.RareItemAnnouncementRuntime.showRareBanner(tier, text);
    }
    const host = ensureBannerUi();
    if (!host) return false;
    const banner = document.createElement("div");
    banner.className = `ro-mvp-gacha-banner ${["red","purple","gold"].includes(tier) ? tier : "red"}`;
    banner.textContent = text;
    while (host.children.length >= 3) host.firstElementChild?.remove();
    host.appendChild(banner);
    window.setTimeout(() => banner.remove(), 5000);
    return true;
  }

  function log(text, type = "item") {
    if (typeof window.addBattleLog === "function") window.addBattleLog(text, type);
  }

  function rewardItem(row) {
    if (!row) return null;
    const data = itemData(row.itemId);
    const qty = Math.max(1, integer(row.quantity, 1));
    if (typeof window.addItem !== "function") return null;
    window.addItem({ id:Number(row.itemId), name:data.name }, qty);
    return { item:data, quantity:qty };
  }

  function rareTierForChance(chanceBasisPoints) {
    const chance = Math.max(0, number(chanceBasisPoints));
    if (!(chance > 0) || chance > 100) return null;
    if (chance <= 1) return "gold";
    if (chance <= 10) return "purple";
    return "red";
  }

  function weightedItemChance(rows, selected, parentChanceBasisPoints) {
    if (window.RareItemAnnouncementRuntime?.weightedItemChanceBasisPoints) {
      return window.RareItemAnnouncementRuntime.weightedItemChanceBasisPoints(rows, selected, parentChanceBasisPoints);
    }
    const list = Array.isArray(rows) ? rows : [];
    const total = list.reduce((sum, entry) => sum + Math.max(0, number(entry?.weight)), 0);
    if (!(total > 0) || !selected) return 0;
    const id = String(selected.itemId);
    const weight = list.reduce((sum, entry) => String(entry?.itemId) === id ? sum + Math.max(0, number(entry?.weight)) : sum, 0);
    return Math.max(0, Math.min(10000, number(parentChanceBasisPoints) * weight / total));
  }

  function rollReward() {
    const cfg = config();
    if (!cfg) return null;
    const roll = randomBasisPoint();
    let cumulative = 0;
    for (const category of cfg.rareCategories || []) {
      const rewards = Array.isArray(category?.rewards) ? category.rewards : [];
      const directChanceMode = String(category?.chanceMode || "") === "per_reward_absolute";
      const directRows = directChanceMode
        ? rewards.filter(row => Math.max(0, integer(row?.chanceBasisPoints)) > 0)
        : [];
      if (directRows.length) {
        for (const row of directRows) {
          const chanceBasisPoints = Math.max(0, integer(row.chanceBasisPoints));
          cumulative += chanceBasisPoints;
          if (roll <= cumulative) {
            return { category, row, roll, rare:true, chanceBasisPoints };
          }
        }
        continue;
      }
      const categoryChance = Math.max(0, integer(category.chanceBasisPoints));
      cumulative += categoryChance;
      if (roll <= cumulative) {
        const row = weightedPick(rewards);
        return {
          category, row, roll, rare:true,
          chanceBasisPoints:weightedItemChance(rewards, row, categoryChance)
        };
      }
    }
    const row = weightedPick(cfg.ordinaryRewards);
    return {
      category:null, row, roll, rare:false,
      chanceBasisPoints:weightedItemChance(cfg.ordinaryRewards, row, cfg.ordinaryFillBasisPoints)
    };
  }

  const GACHA_BATCH = {
    pending:0,
    scheduled:false,
    processing:false,
    timerId:0,
    item:null,
    lastMissingLogAt:0,
    openedSinceCheckpoint:0,
    totalOpened:0
  };
  const GACHA_BATCH_DELAY_MS = 55;
  const GACHA_BATCH_SLICE_LIMIT = 32;

  function formatGachaBatchSummary(item, opened, summary) {
    const rows = [...summary.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "zh-Hant"));
    const visible = rows.slice(0, 8).map(row => `${row.name} ×${row.quantity}`);
    if (rows.length > visible.length) visible.push(`另 ${rows.length - visible.length} 種`);
    const prefix = opened > 1 ? `連續開啟 ${item.name} ×${opened}` : `開啟 ${item.name}`;
    return `${prefix}，獲得：${visible.join("、")}。`;
  }

  function flushGachaBatchUi(item, opened, summary, rareAnnouncements, options = {}) {
    if (opened <= 0) return;
    const inventoryWindow = document.getElementById?.("inventory-window");
    const inventoryVisible = inventoryWindow && !inventoryWindow.classList.contains("hidden-window") && inventoryWindow.offsetParent !== null;
    if (inventoryVisible) window.updateInventoryUI?.();
    else window.RO_WEB_INVENTORY_DIRTY = true;
    window.updateQuickSlotUI?.({ skipIfUnchanged:true });
    const entries = [{ text:formatGachaBatchSummary(item, opened, summary), type:"item" }];
    rareAnnouncements.forEach(row => entries.push({ text:`🎉 轉蛋大獎：${row.name}${row.quantity > 1 ? ` ×${row.quantity}` : ""}`, type:"rare-item" }));
    if (typeof window.addBattleLogBatch === "function") window.addBattleLogBatch(entries);
    else entries.forEach(entry => log(entry.text, entry.type));
    if (!options.skipSave && !window.RO_WEB_SAVE_PREPARING_REWARDS) {
      if (typeof window.requestGameSave === "function") window.requestGameSave(1200, "mvp-gacha-batch");
      else window.setTimeout(() => window.saveGame?.({ reason:"mvp-gacha-batch", preparePendingRewards:false }), 0);
    }
    // addItem 在 Reward Batch 中只負責標記 dirty；本 Runtime 已完成必要刷新與延遲存檔。
    window.RO_WEB_REWARD_PLAYER_UI_DIRTY = false;
    window.RO_WEB_REWARD_JOB_UI_DIRTY = false;
    window.RO_WEB_REWARD_INVENTORY_UI_DIRTY = false;
    window.RO_WEB_REWARD_SAVE_DIRTY = false;
    if (Array.isArray(window.RO_WEB_REWARD_BATCH_LOGS)) window.RO_WEB_REWARD_BATCH_LOGS.length = 0;
  }

  function processGachaBatch(options = {}) {
    GACHA_BATCH.scheduled = false;
    GACHA_BATCH.timerId = 0;
    if (GACHA_BATCH.processing || GACHA_BATCH.pending <= 0 || !window.player) return false;
    GACHA_BATCH.processing = true;
    const item = GACHA_BATCH.item || itemData(config()?.gachaItemId || DEFAULT_GACHA_ITEM_ID);
    const summary = new Map();
    const rareAnnouncements = [];
    const rareAcquisitions = [];
    let opened = 0;
    window.RO_WEB_REWARD_BATCH_ACTIVE = true;
    window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG = true;
    try {
      const limit = options.drainAll === true ? GACHA_BATCH.pending : Math.min(GACHA_BATCH_SLICE_LIMIT, GACHA_BATCH.pending);
      for (let index = 0; index < limit; index += 1) {
        const stack = findInventoryStack(item.id);
        if (!stack || number(stack.count) <= 0) {
          GACHA_BATCH.pending = 0;
          break;
        }
        const result = rollReward();
        const awarded = rewardItem(result?.row);
        if (!awarded) {
          GACHA_BATCH.pending = 0;
          log(`${item.name} 的獎池資料異常，未完成的開啟次數已取消。`, "error");
          break;
        }
        if (!removeOneStackItem(item.id)) break;
        window.markConsumableItemUsed?.(item);
        GACHA_BATCH.pending -= 1;
        opened += 1;
        const key = String(awarded.item.id);
        const aggregate = summary.get(key) || { id:awarded.item.id, name:awarded.item.name, quantity:0 };
        aggregate.quantity += awarded.quantity;
        summary.set(key, aggregate);
        const actualChance = Math.max(0, number(result?.chanceBasisPoints));
        const tier = window.RareItemAnnouncementRuntime?.tierForChanceBasisPoints?.(actualChance) || rareTierForChance(actualChance);
        if (tier) {
          const row = {
            itemId:awarded.item.id,
            itemName:awarded.item.name,
            quantity:awarded.quantity,
            chanceBasisPoints:actualChance,
            source:"mvp_gacha",
            sourceLabel:item.name || "MVP 幸運轉蛋",
            tier
          };
          rareAcquisitions.push(row);
          rareAnnouncements.push({ name:awarded.item.name, quantity:awarded.quantity, chanceBasisPoints:actualChance });
        }
      }
    } catch (error) {
      console.error("連續轉蛋批次處理失敗：", error);
      log("轉蛋處理發生錯誤，未完成的開啟次數已取消。", "error");
      GACHA_BATCH.pending = 0;
    } finally {
      window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG = false;
      window.RO_WEB_REWARD_BATCH_ACTIVE = false;
      GACHA_BATCH.processing = false;
      if (rareAcquisitions.length && window.RareItemAnnouncementRuntime?.announceBatch) {
        window.RareItemAnnouncementRuntime.announceBatch(rareAcquisitions);
      } else if (rareAcquisitions.length) {
        rareAcquisitions.forEach(row => showRareBanner(row.tier || "red", `★ 玩家 ${window.player?.name || "冒險者"} 取得 ${row.itemName} ★`));
      }
      flushGachaBatchUi(item, opened, summary, rareAnnouncements, options);
    }
    GACHA_BATCH.openedSinceCheckpoint += opened;
    GACHA_BATCH.totalOpened += opened;
    if (!options.skipCheckpoint && GACHA_BATCH.openedSinceCheckpoint >= 256) {
      GACHA_BATCH.openedSinceCheckpoint = 0;
      window.saveGame?.({ reason:"mvp-gacha-checkpoint", durableDelayMs:0, preparePendingRewards:false });
    }
    if (GACHA_BATCH.pending > 0 && options.skipSchedule !== true) scheduleGachaBatch(16);
    if (GACHA_BATCH.pending <= 0 && opened > 0 && !options.skipSave && !window.RO_WEB_SAVE_PREPARING_REWARDS) {
      window.saveGame?.({ reason:"mvp-gacha-final", durableDelayMs:0, preparePendingRewards:false });
    }
    return opened > 0;
  }

  function scheduleGachaBatch(delayMs = GACHA_BATCH_DELAY_MS) {
    if (GACHA_BATCH.scheduled || GACHA_BATCH.processing) return true;
    GACHA_BATCH.scheduled = true;
    GACHA_BATCH.timerId = window.setTimeout(() => processGachaBatch(), Math.max(0, Number(delayMs || 0)));
    return true;
  }

  function flushPendingGachaForSave(options = {}) {
    if (GACHA_BATCH.processing) {
      return { opened:0, remaining:GACHA_BATCH.pending, busy:true, reason:String(options.reason || "save") };
    }
    if (GACHA_BATCH.timerId) {
      window.clearTimeout?.(GACHA_BATCH.timerId);
      GACHA_BATCH.timerId = 0;
    }
    GACHA_BATCH.scheduled = false;
    const before = Math.max(0, GACHA_BATCH.pending);
    if (before > 0) {
      processGachaBatch({ drainAll:true, skipSchedule:true, skipSave:true, skipCheckpoint:true });
    }
    return {
      opened: Math.max(0, before - Math.max(0, GACHA_BATCH.pending)),
      remaining: Math.max(0, GACHA_BATCH.pending),
      totalOpened:GACHA_BATCH.totalOpened,
      reason:String(options.reason || "save")
    };
  }

  function openGacha(item = itemData(config()?.gachaItemId || DEFAULT_GACHA_ITEM_ID), options = {}) {
    if (!window.player || !item) return false;
    if (!isAuthorizedManualGachaRequest(options)) {
      const now = Date.now();
      if (now - GACHA_BATCH.lastMissingLogAt > 1200) log(`${item.name} 已阻擋非玩家操作的自動開啟。`, "error");
      GACHA_BATCH.lastMissingLogAt = now;
      return false;
    }
    const stack = findInventoryStack(item.id);
    const available = number(stack?.count) - GACHA_BATCH.pending;
    if (!stack || available <= 0) {
      const now = Date.now();
      if (now - GACHA_BATCH.lastMissingLogAt > 800) log(`背包裡沒有 ${item.name}。`);
      GACHA_BATCH.lastMissingLogAt = now;
      return false;
    }
    const usability = typeof window.canUseConsumableItem === "function"
      ? window.canUseConsumableItem(item, { silent:true })
      : { ok:true };
    if (!usability.ok) return false;
    GACHA_BATCH.item = item;
    GACHA_BATCH.pending += 1;
    scheduleGachaBatch();
    return true;
  }

  function cashFoodEffectInstance(item) {
    const raw = item?.cashFoodEffect;
    if (!raw || typeof raw !== "object") return null;
    const mainEffects = {};
    const extraEffects = {};
    const randomKeyMap = {
      hitRandom:"hitFlat",
      criRandom:"criFlat",
      atkRandom:"atkFlat",
      hpRecoveryRandom:"hpRecoveryRate",
      fleeRandom:"fleeFlat",
      matkRandom:"matkFlat"
    };
    for (const [key, value] of Object.entries(raw)) {
      if (["durationMs","extraDurationMs"].includes(key) || key.endsWith("Random")) continue;
      if (typeof value === "number" && Number.isFinite(value)) mainEffects[key] = value;
    }
    for (const [key, range] of Object.entries(raw)) {
      if (!key.endsWith("Random") || !Array.isArray(range) || range.length < 2) continue;
      const targetKey = randomKeyMap[key] || `${key.slice(0, -6)}Flat`;
      const lo = integer(Math.min(number(range[0]), number(range[1])));
      const hi = integer(Math.max(number(range[0]), number(range[1])));
      extraEffects[targetKey] = lo + Math.floor(Math.random() * Math.max(1, hi - lo + 1));
    }
    return {
      durationMs:Math.max(1000, integer(raw.durationMs, 1800000)),
      extraDurationMs:Math.max(1000, integer(raw.extraDurationMs, raw.durationMs || 600000)),
      mainEffects,
      extraEffects
    };
  }

  function overlappingCashFoodKeys(effects) {
    const allStats = number(effects?.allStatsFlat) !== 0;
    const statKeys = ["strFlat","agiFlat","vitFlat","intFlat","dexFlat","lukFlat"];
    const keys = new Set(Object.keys(effects || {}).filter(key => typeof effects[key] === "number"));
    if (allStats) statKeys.forEach(key => keys.add(key));
    return { allStats, statKeys, keys };
  }

  function applyCashFood(item) {
    if (!window.player) return false;
    const profile = cashFoodEffectInstance(item);
    if (!profile) return false;
    const usability = window.canUseConsumableItem?.(item) || { ok:true };
    if (!usability.ok) return false;
    const stack = findInventoryStack(item.id);
    if (!stack || number(stack.count) <= 0) { log(`背包裡沒有 ${item.name}。`); return false; }

    player.activeBuffs = player.activeBuffs && typeof player.activeBuffs === "object" ? player.activeBuffs : {};
    const incomingProfiles = [profile.mainEffects, profile.extraEffects].filter(effects => Object.keys(effects).length);
    for (const [id, buff] of Object.entries(player.activeBuffs)) {
      if (buff?.sourceType !== CASH_FOOD_SOURCE) continue;
      const existing = overlappingCashFoodKeys(buff.effects || {});
      const overlap = incomingProfiles.some(effects => {
        const incoming = overlappingCashFoodKeys(effects);
        return incoming.allStats || existing.allStats || [...incoming.keys].some(key => existing.keys.has(key));
      });
      if (overlap) delete player.activeBuffs[id];
    }

    const now = Date.now();
    const addBuff = (suffix, effects, durationMs) => {
      if (!effects || !Object.keys(effects).length) return;
      const buffId = `${CASH_FOOD_SOURCE}:${item.id}:${suffix}:${now}`;
      player.activeBuffs[buffId] = {
        id:buffId,
        name:item.name,
        sourceType:CASH_FOOD_SOURCE,
        sourceItemId:Number(item.id),
        startedAt:now,
        expiresAt:now + durationMs,
        effects
      };
    };
    addBuff("main", profile.mainEffects, profile.durationMs);
    addBuff("extra", profile.extraEffects, profile.extraDurationMs);
    removeOneStackItem(item.id);
    window.markConsumableItemUsed?.(item);
    window.invalidateCardRuntime?.();
    window.recalculatePlayerStats?.();
    const minutes = Math.max(1, Math.round(profile.durationMs / 60000));
    const extraText = Object.keys(profile.extraEffects).length
      ? `；額外效果持續 ${Math.max(1, Math.round(profile.extraDurationMs / 60000))} 分鐘`
      : "";
    log(`使用了 ${item.name}，主要效果持續 ${minutes} 分鐘${extraText}。`);
    window.updatePlayerUI?.();
    window.updateInventoryUI?.();
    window.saveGame?.();
    return true;
  }

  function applyPercentHeal(item) {
    const profile = item?.percentHeal;
    if (!profile || typeof profile !== "object" || !window.player) return false;
    const usability = window.canUseConsumableItem?.(item) || { ok:true };
    if (!usability.ok) return false;
    const stack = findInventoryStack(item.id);
    if (!stack || number(stack.count) <= 0) { log(`背包裡沒有 ${item.name}。`); return false; }
    const hpBefore = number(player.hp);
    const spBefore = number(player.sp);
    const hpGain = Math.max(0, Math.floor(number(player.maxHp, hpBefore) * Math.max(0, number(profile.hp)) / 100));
    const spGain = Math.max(0, Math.floor(number(player.maxSp, spBefore) * Math.max(0, number(profile.sp)) / 100));
    player.hp = Math.min(number(player.maxHp, hpBefore), hpBefore + hpGain);
    player.sp = Math.min(number(player.maxSp, spBefore), spBefore + spGain);
    removeOneStackItem(item.id);
    window.markConsumableItemUsed?.(item);
    log(`使用了 ${item.name}，HP 恢復 ${Math.max(0, player.hp-hpBefore)}，SP 恢復 ${Math.max(0, player.sp-spBefore)}。`);
    window.updatePlayerUI?.();
    window.updateInventoryUI?.();
    window.saveGame?.();
    return true;
  }

  function rollMapExclusiveDrop(monster) {
    const cfg = config();
    if (!cfg || !monster || !window.player) return false;
    const state = monster.lootRuntime = monster.lootRuntime || {};
    if (state.mapExclusiveMvpGachaRolled) return false;
    state.mapExclusiveMvpGachaRolled = true;
    if (String(activeMap()?.id || "") !== String(cfg.mapId || "")) return false;
    if (!(monster.isMvp === true || String(monster.category || monster._category || "").toLowerCase() === "mvp")) return false;
    const rawChance = Math.max(0, integer(cfg.mapExclusiveDropChanceBasisPoints));
    const finalChance = typeof window.getFinalDropChanceBasisPoints === "function"
      ? window.getFinalDropChanceBasisPoints(rawChance, "mapExclusive")
      : Math.min(10000, typeof window.applyRate === "function" ? window.applyRate(rawChance, "drop") : rawChance);
    if (randomBasisPoint() > finalChance) return false;
    const gacha = itemData(cfg.gachaItemId || DEFAULT_GACHA_ITEM_ID);
    noteAuthorizedGachaInventoryAddition(1);
    window.addItem?.({ id:Number(gacha.id), name:gacha.name }, 1);
    window.recordItemDrop?.(gacha.id, 1);
    window.RareItemAnnouncementRuntime?.announceAcquisition?.({
      itemId:gacha.id, itemName:gacha.name, quantity:1, chanceBasisPoints:finalChance,
      source:"map_exclusive_drop", sourceLabel:`${monster.name || "MVP"} 地圖限定掉落`
    });
    log(`葛坡尼亞限定掉落：${gacha.name} ×1`, "rare-item");
    return true;
  }

  const previousUseItem = window.useItem;
  window.useItem = function mvpGachaUseItem(itemId, instance = null, options = {}) {
    const item = itemData(itemId);
    const cfg = config();
    if (String(item?.id) === String(cfg?.gachaItemId || DEFAULT_GACHA_ITEM_ID)) return openGacha(item, options);
    if (item?.cashFoodEffect) return applyCashFood(item);
    if (item?.percentHeal) return applyPercentHeal(item);
    return previousUseItem?.(itemId, instance, options);
  };

  startGachaInventoryGuard();

  window.MvpGachaRuntime = Object.freeze({
    version:VERSION,
    config,
    rollReward,
    openGacha,
    processGachaBatch,
    flushPendingForSave:flushPendingGachaForSave,
    getPendingOpenCount:() => GACHA_BATCH.pending,
    rollMapExclusiveDrop,
    applyCashFood,
    applyPercentHeal,
    showRareBanner,
    auditInventoryGuard:auditGachaInventoryGuard,
    getInventoryGuardState:() => ({
      expectedCount:GACHA_INVENTORY_GUARD.expectedCount,
      actualCount:getGachaInventoryCount(),
      restoredTotal:GACHA_INVENTORY_GUARD.restoredTotal,
      active:isGachaInventoryGuardActive()
    })
  });
})();
