//============================================================
// RO_WEB 0.9.82GA — 葛坡尼亞 MVP 地圖限定轉蛋 Runtime（全域掉落總閥）
// - 同 ID MVP 只有在指定地圖死亡才以原始 1% 判定轉蛋，並套用全域掉落總閥。
// - 轉蛋內部稀有機率為單一 10000 基點母池的絕對機率；全域掉落倍率只影響轉蛋本體掉落。
// - 1% 紅色、0.1% 紫色、0.01% 金色上方橫幅。
//============================================================
(() => {
  "use strict";

  const VERSION = "0.9.82GA";
  const BUNDLE_KEY = "data/mvp_gacha.json";
  const DEFAULT_GACHA_ITEM_ID = 14848;
  const CASH_FOOD_SOURCE = "mvp_gacha_cash_food";
  const BANNER_STYLE_ID = "ro-mvp-gacha-banner-style";
  const BANNER_HOST_ID = "ro-mvp-gacha-banner-host";

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
    stack.count = number(stack.count) - 1;
    if (stack.count <= 0) {
      window.player.inventory = (window.player.inventory || []).filter(row => row !== stack);
    }
    return true;
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
    const host = ensureBannerUi();
    if (!host) return;
    const banner = document.createElement("div");
    banner.className = `ro-mvp-gacha-banner ${["red","purple","gold"].includes(tier) ? tier : "red"}`;
    banner.textContent = text;
    host.appendChild(banner);
    window.setTimeout(() => banner.remove(), 5000);
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

  function rollReward() {
    const cfg = config();
    if (!cfg) return null;
    const roll = randomBasisPoint();
    let cumulative = 0;
    for (const category of cfg.rareCategories || []) {
      cumulative += Math.max(0, integer(category.chanceBasisPoints));
      if (roll <= cumulative) {
        const row = weightedPick(category.rewards);
        return { category, row, roll, rare:true };
      }
    }
    return { category:null, row:weightedPick(cfg.ordinaryRewards), roll, rare:false };
  }

  function openGacha(item = itemData(config()?.gachaItemId || DEFAULT_GACHA_ITEM_ID)) {
    if (!window.player || !item) return false;
    const stack = findInventoryStack(item.id);
    if (!stack || number(stack.count) <= 0) {
      log(`背包裡沒有 ${item.name}。`);
      return false;
    }
    const usability = typeof window.canUseConsumableItem === "function"
      ? window.canUseConsumableItem(item)
      : { ok:true };
    if (!usability.ok) return false;

    const result = rollReward();
    const awarded = rewardItem(result?.row);
    if (!awarded) {
      log(`${item.name} 的獎池資料異常，轉蛋沒有被消耗。`);
      return false;
    }
    if (!removeOneStackItem(item.id)) return false;
    window.markConsumableItemUsed?.(item);

    const quantityText = awarded.quantity > 1 ? ` ×${awarded.quantity}` : "";
    if (result.rare) {
      const playerName = String(window.player?.name || "冒險者");
      const label = String(result.category?.bannerLabel || "稀有大獎");
      showRareBanner(result.category?.tier, `★ ${playerName} 從 MVP幸運轉蛋獲得 ${awarded.item.name}${quantityText}｜${label} ★`);
      log(`🎉 轉蛋大獎：${awarded.item.name}${quantityText}`, "rare-item");
    } else {
      log(`開啟 ${item.name}，獲得 ${awarded.item.name}${quantityText}。`, "item");
    }
    window.updateInventoryUI?.();
    window.updatePlayerUI?.();
    window.saveGame?.();
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
    window.addItem?.({ id:Number(gacha.id), name:gacha.name }, 1);
    window.recordItemDrop?.(gacha.id, 1);
    log(`葛坡尼亞限定掉落：${gacha.name} ×1`, "rare-item");
    return true;
  }

  const previousUseItem = window.useItem;
  window.useItem = function mvpGachaUseItem(itemId, instance = null) {
    const item = itemData(itemId);
    const cfg = config();
    if (String(item?.id) === String(cfg?.gachaItemId || DEFAULT_GACHA_ITEM_ID)) return openGacha(item);
    if (item?.cashFoodEffect) return applyCashFood(item);
    if (item?.percentHeal) return applyPercentHeal(item);
    return previousUseItem?.(itemId, instance);
  };

  window.MvpGachaRuntime = Object.freeze({
    version:VERSION,
    config,
    rollReward,
    openGacha,
    rollMapExclusiveDrop,
    applyCashFood,
    applyPercentHeal,
    showRareBanner
  });
})();
