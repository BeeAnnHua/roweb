//=======================================
// AutoBattleController v1.7（0.9.82GE）
// 精簡設定介面 / 自動異常解除 / 低血量逃生 / 自動肯貝特 / 當前地圖怪物篩選
//=======================================

const AUTO_ELEMENT_CONVERTER_ITEM_IDS = Object.freeze({
  Fire: 12114,
  Water: 12115,
  Earth: 12116,
  Wind: 12117
});
const AUTO_ELEMENT_CONVERTER_LABELS = Object.freeze({
  Fire: "火",
  Water: "水",
  Earth: "地",
  Wind: "風"
});

const AUTO_MONSTER_FILTER_MODES = Object.freeze({
  ALL: "all",
  INCLUDE: "include",
  EXCLUDE: "exclude"
});
const AUTO_MONSTER_CATEGORY_LABELS = Object.freeze({
  normal: "普通",
  plant: "植物",
  rare: "稀有",
  boss: "Boss",
  mvp: "MVP"
});


function createDefaultAutoCombat() {
  const makeAttackSlot = (index = 0) => ({
    enabled: index === 0,
    skillId: null,
    spPercent: 50,
    level: 1,
    minMonsters: 1,
    fallbackNormal: true
  });
  return {
    hpPotion: { enabled: true, hpPercent: 50, itemId: null },
    spPotion: { enabled: false, spPercent: 30, itemId: null },
    detox: { enabled: false },
    elementEndow: { enabled: false, element: "" },
    cashFood: { enabled: false, itemIds: [] },
    monsterFilter: { version: "0.9.82FM", byMap: {} },
    heal: { enabled: false, skillId: null, hpPercent: 60, spPercent: 20, level: 1 },
    normalAttack: { enabled: true },
    attacks: Array.from({ length: 4 }, (_, index) => makeAttackSlot(index)),
    buffs: {},
    teleport: {
      enabled: false,
      noTargetSeconds: 1,
      avoidBoss: false,
      avoidMvp: false,
      lowHpEnabled: false,
      lowHpPercent: 30,
      returnHome: { enabled: false, hpPercent: 10, cityId: "prontera" }
    }
  };
}


function getAutoBattleCurrentMapId() {
  const value = (typeof currentMap !== "undefined" && currentMap?.id)
    || player?.map
    || player?.lastFieldMap
    || "unknown";
  return String(value || "unknown");
}

function normalizeAutoMonsterId(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return String(Math.trunc(numeric));
  const text = String(value || "").trim();
  return text && text !== "0" ? text : "";
}

function normalizeAutoMonsterFilterMode(value) {
  const mode = String(value || "").toLowerCase();
  return Object.values(AUTO_MONSTER_FILTER_MODES).includes(mode) ? mode : AUTO_MONSTER_FILTER_MODES.ALL;
}

function normalizeAutoMonsterFilterEntry(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const ids = Array.isArray(source.selectedIds)
    ? source.selectedIds
    : (Array.isArray(source.selected) ? source.selected : []);
  return {
    mode: normalizeAutoMonsterFilterMode(source.mode),
    selectedIds: [...new Set(ids.map(normalizeAutoMonsterId).filter(Boolean))]
  };
}

function getAutoBattleMapMonsterFilter(mapId = getAutoBattleCurrentMapId(), options = {}) {
  if (!player) return { mode: AUTO_MONSTER_FILTER_MODES.ALL, selectedIds: [] };
  if (!player.autoCombat || typeof player.autoCombat !== "object") player.autoCombat = createDefaultAutoCombat();
  if (!player.autoCombat.monsterFilter || typeof player.autoCombat.monsterFilter !== "object") {
    player.autoCombat.monsterFilter = { version: "0.9.82FM", byMap: {} };
  }
  if (!player.autoCombat.monsterFilter.byMap || typeof player.autoCombat.monsterFilter.byMap !== "object") {
    player.autoCombat.monsterFilter.byMap = {};
  }
  const key = String(mapId || "unknown");
  const existing = player.autoCombat.monsterFilter.byMap[key];
  if (!existing && options.create !== false) {
    player.autoCombat.monsterFilter.byMap[key] = { mode: AUTO_MONSTER_FILTER_MODES.ALL, selectedIds: [] };
  } else if (existing) {
    const normalized = normalizeAutoMonsterFilterEntry(existing);
    existing.mode = normalized.mode;
    existing.selectedIds = normalized.selectedIds;
  }
  return player.autoCombat.monsterFilter.byMap[key]
    || { mode: AUTO_MONSTER_FILTER_MODES.ALL, selectedIds: [] };
}

function getAutoBattleMonsterId(monster) {
  return normalizeAutoMonsterId(monster?.id ?? monster?.monsterId ?? monster?.mobId ?? monster?.officialId);
}

function getAutoBattleMonsterCategory(monster, fallback = "normal") {
  if (monster?.isMvp === true || monster?.isMVP === true || monster?.mvp === true) return "mvp";
  if (monster?.isBoss === true || monster?.boss === true || String(monster?.class || monster?.Class || "").toLowerCase() === "boss") return "boss";
  const raw = String(monster?._category || fallback || monster?.category || "normal").toLowerCase();
  return AUTO_MONSTER_CATEGORY_LABELS[raw] ? raw : "normal";
}

function findAutoBattleMonsterSource(monsterId) {
  const id = Number(monsterId || 0);
  try {
    if (typeof findWorldMonsterSource === "function") {
      const found = findWorldMonsterSource(id);
      if (found) return found;
    }
  } catch (_) {}
  try {
    const source = typeof monsters !== "undefined" && Array.isArray(monsters) ? monsters : [];
    return source.find(monster => Number(monster?.id) === id) || null;
  } catch (_) {
    return null;
  }
}

function getAutoBattleMonsterCatalog() {
  const rows = new Map();
  let order = 0;
  const add = (rawId, details = {}) => {
    const id = normalizeAutoMonsterId(rawId);
    if (!id) return null;
    const existing = rows.get(id) || {
      id,
      name: "",
      category: "normal",
      aliveCount: 0,
      activeCount: 0,
      order: order++
    };
    const source = details.source || findAutoBattleMonsterSource(id);
    existing.name = details.name || existing.name || source?.name || source?.displayName || `怪物 ${id}`;
    existing.category = getAutoBattleMonsterCategory(details.monster || source, details.category || existing.category);
    existing.aliveCount += Math.max(0, Number(details.aliveCount || 0));
    existing.activeCount += Math.max(0, Number(details.activeCount || 0));
    rows.set(id, existing);
    return existing;
  };

  let profile = null;
  try {
    profile = typeof getWorldMonsterProfile === "function" ? getWorldMonsterProfile(typeof currentMap !== "undefined" ? currentMap : null) : null;
  } catch (_) {}
  (Array.isArray(profile?.pool) ? profile.pool : []).forEach(entry => {
    add(entry?.monsterId, { category: entry?.category || "normal" });
  });

  try {
    const mapMonsterIds = typeof currentMap !== "undefined" && Array.isArray(currentMap?.monsters) ? currentMap.monsters : [];
    mapMonsterIds.forEach(id => add(id));
  } catch (_) {}

  let live = [];
  try {
    if (typeof getWorldMonsterTestEntities === "function") {
      live = getWorldMonsterTestEntities({ activeOnly: false, includeDead: false }) || [];
    } else if (typeof collectLiveCombatEnemies === "function") {
      live = collectLiveCombatEnemies({ activeOnly: false }) || [];
    }
  } catch (_) {}
  const activeSet = new Set();
  try {
    const active = typeof collectLiveCombatEnemies === "function" ? (collectLiveCombatEnemies({ activeOnly: true }) || []) : [];
    active.forEach(monster => activeSet.add(monster));
  } catch (_) {}
  [...new Set(live)].forEach(monster => {
    if (!monster || Number(monster.currentHp ?? monster.hp ?? 0) <= 0 || monster._deathHandled) return;
    add(getAutoBattleMonsterId(monster), {
      monster,
      name: monster.name || monster.displayName,
      category: getAutoBattleMonsterCategory(monster),
      aliveCount: 1,
      activeCount: activeSet.has(monster) ? 1 : 0
    });
  });

  return [...rows.values()].sort((a, b) => a.order - b.order || String(a.name).localeCompare(String(b.name), "zh-Hant"));
}

function isAutoBattleMonsterAllowed(monster, mapId = getAutoBattleCurrentMapId()) {
  if (!monster) return false;
  const filter = getAutoBattleMapMonsterFilter(mapId, { create: false });
  const mode = normalizeAutoMonsterFilterMode(filter?.mode);
  if (mode === AUTO_MONSTER_FILTER_MODES.ALL) return true;
  const id = getAutoBattleMonsterId(monster);
  const selected = new Set((filter?.selectedIds || []).map(normalizeAutoMonsterId).filter(Boolean));
  if (mode === AUTO_MONSTER_FILTER_MODES.INCLUDE) return Boolean(id) && selected.has(id);
  if (mode === AUTO_MONSTER_FILTER_MODES.EXCLUDE) return !id || !selected.has(id);
  return true;
}

function canAutoBattleSearchForConfiguredTargets(mapId = getAutoBattleCurrentMapId()) {
  const filter = getAutoBattleMapMonsterFilter(mapId, { create: false });
  return normalizeAutoMonsterFilterMode(filter?.mode) !== AUTO_MONSTER_FILTER_MODES.INCLUDE
    || (filter?.selectedIds || []).length > 0;
}

if (typeof window !== "undefined") {
  window.getAutoBattleCurrentMapId = getAutoBattleCurrentMapId;
  window.getAutoBattleMapMonsterFilter = getAutoBattleMapMonsterFilter;
  window.getAutoBattleMonsterCatalog = getAutoBattleMonsterCatalog;
  window.isAutoBattleMonsterAllowed = isAutoBattleMonsterAllowed;
  window.canAutoBattleSearchForConfiguredTargets = canAutoBattleSearchForConfiguredTargets;
}

function normalizeAutoCombatSettings() {
  if (!player) return;
  const defaults = createDefaultAutoCombat();
  const source = player.autoCombat || {};
  const legacyAttack = source.attack && typeof source.attack === "object" ? source.attack : null;

  player.autoCombat = {
    ...defaults,
    ...source
  };
  player.autoCombat.hpPotion = { ...defaults.hpPotion, ...(source.hpPotion || {}) };
  player.autoCombat.spPotion = { ...defaults.spPotion, ...(source.spPotion || {}) };
  player.autoCombat.detox = { ...defaults.detox, ...(source.detox || {}) };
  const sourceElementEndow = source.elementEndow && typeof source.elementEndow === "object"
    ? source.elementEndow
    : { enabled: Boolean(source.elementEndow), element: typeof source.elementEndow === "string" ? source.elementEndow : "" };
  player.autoCombat.elementEndow = { ...defaults.elementEndow, ...sourceElementEndow };
  player.autoCombat.elementEndow.enabled = player.autoCombat.elementEndow.enabled === true;
  player.autoCombat.elementEndow.element = AUTO_ELEMENT_CONVERTER_ITEM_IDS[player.autoCombat.elementEndow.element]
    ? String(player.autoCombat.elementEndow.element)
    : "";
  const sourceCashFood = source.cashFood && typeof source.cashFood === "object" ? source.cashFood : {};
  const rawCashFoodIds = Array.isArray(sourceCashFood.itemIds) ? sourceCashFood.itemIds : [];
  player.autoCombat.cashFood = {
    enabled: sourceCashFood.enabled === true,
    itemIds: [...new Set(rawCashFoodIds.map(normalizeItemId).filter(id => id !== null && id !== undefined && id !== ""))]
  };

  const sourceMonsterFilter = source.monsterFilter && typeof source.monsterFilter === "object" ? source.monsterFilter : {};
  const rawFilterByMap = sourceMonsterFilter.byMap && typeof sourceMonsterFilter.byMap === "object"
    ? sourceMonsterFilter.byMap
    : {};
  const normalizedFilterByMap = {};
  Object.entries(rawFilterByMap).forEach(([mapId, value]) => {
    normalizedFilterByMap[String(mapId)] = normalizeAutoMonsterFilterEntry(value);
  });
  // Early FL preview saves used one flat filter. Migrate it to the current field map once.
  if ((sourceMonsterFilter.mode || sourceMonsterFilter.selectedIds || sourceMonsterFilter.selected) && !Object.keys(normalizedFilterByMap).length) {
    normalizedFilterByMap[getAutoBattleCurrentMapId()] = normalizeAutoMonsterFilterEntry(sourceMonsterFilter);
  }
  player.autoCombat.monsterFilter = {
    version: "0.9.82FM",
    byMap: normalizedFilterByMap
  };
  getAutoBattleMapMonsterFilter(getAutoBattleCurrentMapId(), { create: true });

  player.autoCombat.heal = { ...defaults.heal, ...(source.heal || {}) };
  player.autoCombat.normalAttack = { ...defaults.normalAttack, ...(source.normalAttack || {}) };

  const sourceAttacks = Array.isArray(source.attacks) ? source.attacks.slice(0, 4) : [];
  if (!sourceAttacks.length && legacyAttack) sourceAttacks.push(legacyAttack);
  player.autoCombat.attacks = defaults.attacks.map((fallback, index) => ({
    ...fallback,
    ...(sourceAttacks[index] || {})
  }));
  player.autoCombat.attacks.forEach(slot => {
    slot.enabled = slot.enabled !== false;
    slot.skillId = slot.skillId ? String(slot.skillId) : null;
    slot.spPercent = Math.max(0, Math.min(100, Number(slot.spPercent ?? 50)));
    slot.level = Math.max(1, Number(slot.level || 1));
    slot.minMonsters = Math.max(1, Math.min(99, Number(slot.minMonsters || 1)));
    slot.fallbackNormal = slot.fallbackNormal !== false;
  });

  // Keep the old field as a live alias for older save / scheduler code.
  player.autoCombat.attack = player.autoCombat.attacks[0];

  const rawBuffs = source.buffs && typeof source.buffs === "object" ? source.buffs : {};
  player.autoCombat.buffs = {};
  Object.entries(rawBuffs).forEach(([key, value]) => {
    if (value && typeof value === "object") {
      player.autoCombat.buffs[key] = {
        enabled: value.enabled !== false,
        spPercent: Math.max(0, Math.min(100, Number(value.spPercent || 0)))
      };
    } else {
      player.autoCombat.buffs[key] = {
        enabled: Boolean(value),
        spPercent: 0
      };
    }
  });

  const sourceTeleport = source.teleport || {};
  player.autoCombat.teleport = {
    ...defaults.teleport,
    ...sourceTeleport,
    noTargetSeconds: 1,
    lowHpEnabled: sourceTeleport.lowHpEnabled === true,
    lowHpPercent: Math.max(1, Math.min(99, Number(sourceTeleport.lowHpPercent ?? defaults.teleport.lowHpPercent))),
    returnHome: {
      ...defaults.teleport.returnHome,
      ...(sourceTeleport.returnHome || {}),
      enabled: sourceTeleport.returnHome?.enabled === true,
      hpPercent: Math.max(1, Math.min(99, Number(sourceTeleport.returnHome?.hpPercent ?? defaults.teleport.returnHome.hpPercent))),
      cityId: String(sourceTeleport.returnHome?.cityId || defaults.teleport.returnHome.cityId)
    }
  };

  // 兼容 v0.5 autoPotion：只在舊存檔尚未建立新版欄位時遷移一次。
  if (player.autoPotion) {
    if (!source.hpPotion) {
      player.autoCombat.hpPotion.enabled = player.autoPotion.hpEnabled ?? player.autoCombat.hpPotion.enabled;
      player.autoCombat.hpPotion.hpPercent = player.autoPotion.hpPercent ?? player.autoCombat.hpPotion.hpPercent;
      player.autoCombat.hpPotion.itemId = normalizeItemId(player.autoPotion.hpItemId) || player.autoCombat.hpPotion.itemId;
    }
    if (!source.spPotion) {
      player.autoCombat.spPotion.enabled = player.autoPotion.spEnabled ?? player.autoCombat.spPotion.enabled;
      player.autoCombat.spPotion.spPercent = player.autoPotion.spPercent ?? player.autoCombat.spPotion.spPercent;
      player.autoCombat.spPotion.itemId = normalizeItemId(player.autoPotion.spItemId) || player.autoCombat.spPotion.itemId;
    }
  }
}

function getPercent(current, max) {
  if (!max || max <= 0) return 0;
  return Math.floor(Number(current || 0) * 100 / Number(max));
}


function splitAutoRecoveryArguments(raw = "") {
  const args = [];
  let current = "";
  let depth = 0;
  for (const char of String(raw)) {
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim() || args.length) args.push(current.trim());
  return args;
}

function evaluateAutoRecoveryExpression(expression, options = {}) {
  const raw = String(expression || "").trim();
  if (!raw) return 0;
  const randomMatch = raw.match(/^rand\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/i);
  if (randomMatch) {
    const min = Number(randomMatch[1]);
    const max = Number(randomMatch[2]);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
    if (options.roll) return Math.round(Math.min(min, max) + Math.random() * Math.abs(max - min));
    return Math.round((min + max) / 2);
  }
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

function getItemRecoveryProfile(item, options = {}) {
  if (!item) return { hp: 0, sp: 0 };
  // 0.9.82GT：轉蛋與其他手動確認型道具永遠不進入自動補品候選。
  if (item.manualUseOnly === true || String(item.subCategory || "") === "mvp_gacha") return { hp: 0, sp: 0 };
  let hp = Math.max(0, Number(item.hp ?? item.HP ?? item.recoveryHp ?? item.recoverHp ?? 0));
  let sp = Math.max(0, Number(item.sp ?? item.SP ?? item.recoverySp ?? item.recoverSp ?? 0));

  if (hp <= 0 || sp <= 0) {
    const script = String(item.scriptRaw || item.Script || item.script || "");
    const marker = script.toLowerCase().indexOf("itemheal");
    if (marker >= 0) {
      const start = marker + "itemheal".length;
      const end = script.indexOf(";", start);
      const args = splitAutoRecoveryArguments(script.slice(start, end >= 0 ? end : undefined));
      if (hp <= 0) hp = evaluateAutoRecoveryExpression(args[0], options);
      if (sp <= 0) sp = evaluateAutoRecoveryExpression(args[1], options);
    }
  }
  return { hp: Math.max(0, Math.round(hp)), sp: Math.max(0, Math.round(sp)) };
}

function getItemRecoveryValue(item, kind, options = {}) {
  const profile = getItemRecoveryProfile(item, options);
  return kind === "sp" ? profile.sp : profile.hp;
}


const AUTO_STATUS_LABELS = Object.freeze({
  poison: "中毒", deadlypoison: "致命毒", slowpoison: "緩毒", magicpoison: "魔力中毒",
  silence: "沉默", blind: "黑暗", confusion: "混亂", curse: "詛咒", hallucination: "幻覺",
  stun: "暈眩", freeze: "冰凍", freezing: "冷凍", stone: "石化", sleep: "睡眠", deepsleep: "深度睡眠",
  bleeding: "出血", burning: "燃燒", fear: "恐懼", paralysis: "麻痺", mandragora: "精神衝擊",
  crystalize: "結晶", crystallize: "結晶", pyrexia: "高熱", deathhurt: "重傷", ash: "灰燼"
});

const AUTO_STATUS_ALIASES = Object.freeze({
  hallu: "hallucination", hallucination: "hallucination",
  stonecurse: "stone", petrification: "stone", petrify: "stone",
  deepsleepstatus: "deepsleep",
  darkness: "blind", dark: "blind", confuse: "confusion",
  crystallization: "crystallize", crystalization: "crystalize"
});

function normalizeAutoStatusKey(value) {
  let key = String(value || "").trim().replace(/^SC_/i, "").toLowerCase().replace(/[ _-]/g, "");
  return AUTO_STATUS_ALIASES[key] || key;
}

function getPlayerActiveStatusKeys() {
  if (!player?.runtimeState) return [];
  if (window.StatusManager?.clearExpired) window.StatusManager.clearExpired(player);
  const statuses = player.runtimeState.statuses || {};
  const now = Date.now();
  return [...new Set(Object.entries(statuses)
    .filter(([, state]) => !state?.expiresAt || Number(state.expiresAt) > now)
    .map(([key]) => normalizeAutoStatusKey(key))
    .filter(Boolean))];
}

function getItemStatusCureProfile(item) {
  if (!item) return { statuses: [], clearAll: false };
  if (item.manualUseOnly === true || String(item.subCategory || "") === "mvp_gacha") return { statuses: [], clearAll: false };
  const statuses = new Set();
  const script = String(item.scriptRaw || item.Script || item.script || "");
  for (const match of script.matchAll(/\bsc_end\s+SC_([A-Za-z0-9_]+)/gi)) {
    const key = normalizeAutoStatusKey(match[1]);
    if (key) statuses.add(key);
  }

  // itemInfo-only fallback. Script sc_end remains the primary and future-proof source.
  const id = Number(item.officialId ?? item.id ?? item.Id ?? 0);
  const fallbackById = {
    506: ["poison", "silence", "blind", "confusion", "hallucination"],
    511: ["poison", "deadlypoison", "slowpoison", "magicpoison"],
    525: ["poison", "silence", "blind", "confusion", "curse", "hallucination"],
    526: ["poison", "silence", "blind", "confusion", "curse"]
  };
  (fallbackById[id] || []).forEach(status => statuses.add(status));

  const text = [item.name, item.Name, ...(Array.isArray(item.description) ? item.description : [item.description])]
    .filter(Boolean).join(" ").replace(/\^[0-9a-f]{6}/gi, "");
  const descriptionRules = [
    [/致命毒/g, "deadlypoison"], [/緩毒/g, "slowpoison"], [/中毒|毒性|解毒/g, "poison"],
    [/沉默/g, "silence"], [/暗黑|黑暗/g, "blind"], [/混亂/g, "confusion"], [/詛咒/g, "curse"],
    [/幻覺/g, "hallucination"], [/暈眩/g, "stun"], [/冰凍/g, "freeze"], [/冷凍/g, "freezing"],
    [/石化/g, "stone"], [/睡眠/g, "sleep"], [/出血/g, "bleeding"], [/燃燒/g, "burning"],
    [/恐懼/g, "fear"], [/麻痺/g, "paralysis"]
  ];
  descriptionRules.forEach(([pattern, key]) => { if (pattern.test(text)) statuses.add(key); });
  const clearAll = statuses.size === 0 && /恢復所有狀態|所有異常狀態|解除所有異常/.test(text);
  return { statuses: [...statuses], clearAll };
}

function isAutoStatusCureItem(item) {
  const profile = getItemStatusCureProfile(item);
  return profile.clearAll || profile.statuses.length > 0;
}

function getMatchedStatusCureKeys(profile, activeKeys = getPlayerActiveStatusKeys()) {
  const active = [...new Set((activeKeys || []).map(normalizeAutoStatusKey).filter(Boolean))];
  if (profile?.clearAll) return active;
  const cureSet = new Set((profile?.statuses || []).map(normalizeAutoStatusKey));
  return active.filter(key => cureSet.has(key));
}

function clearPlayerStatuses(statusKeys) {
  if (!player?.runtimeState) return [];
  const wanted = new Set((statusKeys || []).map(normalizeAutoStatusKey).filter(Boolean));
  if (!wanted.size) return [];
  const statuses = player.runtimeState.statuses || {};
  const removed = [];
  Object.keys(statuses).forEach(rawKey => {
    const key = normalizeAutoStatusKey(rawKey);
    if (!wanted.has(key)) return;
    delete statuses[rawKey];
    removed.push(key);
  });
  wanted.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(player.runtimeState, key)) {
      delete player.runtimeState[key];
      if (!removed.includes(key)) removed.push(key);
    }
  });
  return [...new Set(removed)];
}

function getAutoStatusLabelList(statusKeys) {
  return (statusKeys || []).map(key => AUTO_STATUS_LABELS[normalizeAutoStatusKey(key)] || String(key)).join("、");
}

function getAutoStatusCureItemCost(item) {
  const value = Number(item?.buyPrice ?? item?.Buy ?? (Number(item?.sellPrice ?? item?.Sell ?? 0) * 2));
  return Number.isFinite(value) && value > 0 ? value : 999999;
}

function findAutoStatusCureItem(activeKeys = getPlayerActiveStatusKeys()) {
  if (!player?.inventory || !activeKeys.length) return null;
  return player.inventory
    .map(inv => {
      const item = getItemData(inv.id);
      const profile = getItemStatusCureProfile(item);
      const matched = getMatchedStatusCureKeys(profile, activeKeys);
      const recovery = getItemRecoveryProfile(item);
      return { inv, item, profile, matched, recovery };
    })
    .filter(row => row.item && Number(row.inv.count || 0) > 0 && row.matched.length > 0)
    .sort((a, b) => {
      if (a.matched.length !== b.matched.length) return b.matched.length - a.matched.length;
      const costDiff = getAutoStatusCureItemCost(a.item) - getAutoStatusCureItemCost(b.item);
      if (costDiff) return costDiff;
      const aBreadth = a.profile.clearAll ? 999 : a.profile.statuses.length;
      const bBreadth = b.profile.clearAll ? 999 : b.profile.statuses.length;
      if (aBreadth !== bBreadth) return aBreadth - bBreadth;
      const recoveryDiff = Number(a.recovery.hp || 0) + Number(a.recovery.sp || 0) - Number(b.recovery.hp || 0) - Number(b.recovery.sp || 0);
      if (recoveryDiff) return recoveryDiff;
      return Number(a.item.id || 0) - Number(b.item.id || 0);
    })[0] || null;
}

function applyAutoStatusCureItemRecovery(item) {
  const profile = getItemRecoveryProfile(item, { roll: true });
  let hp = 0;
  let sp = 0;
  if (Number(profile.hp || 0) > 0) {
    const amount = typeof calculateItemRecoveryAmount === "function" ? calculateItemRecoveryAmount(profile.hp, "hp", item) : Number(profile.hp || 0);
    const before = Number(player.hp || 0);
    player.hp = Math.min(Number(player.maxHp || before), before + amount);
    hp = Math.max(0, player.hp - before);
  }
  if (Number(profile.sp || 0) > 0) {
    const amount = typeof calculateItemRecoveryAmount === "function" ? calculateItemRecoveryAmount(profile.sp, "sp", item) : Number(profile.sp || 0);
    const before = Number(player.sp || 0);
    player.sp = Math.min(Number(player.maxSp || before), before + amount);
    sp = Math.max(0, player.sp - before);
  }
  return { hp, sp };
}

function useAutoStatusCureItem(activeKeys = getPlayerActiveStatusKeys()) {
  const row = findAutoStatusCureItem(activeKeys);
  if (!row) return false;
  const removed = clearPlayerStatuses(row.matched);
  if (!removed.length) return false;
  const recovery = applyAutoStatusCureItemRecovery(row.item);
  row.inv.count = Number(row.inv.count || 0) - 1;
  if (row.inv.count <= 0) player.inventory = player.inventory.filter(item => String(item.id) !== String(row.inv.id));
  if (typeof addBattleLog === "function") {
    const recoveryText = [recovery.hp > 0 ? `HP +${recovery.hp}` : "", recovery.sp > 0 ? `SP +${recovery.sp}` : ""].filter(Boolean).join("、");
    addBattleLog(`自動使用 ${row.item.name}，解除${getAutoStatusLabelList(removed)}${recoveryText ? `；${recoveryText}` : ""}。`);
  }
  if (typeof updatePlayerUI === "function") updatePlayerUI();
  if (typeof updateInventoryUI === "function") updateInventoryUI();
  if (typeof saveGame === "function") saveGame();
  return true;
}

function resolveAutoStatusLevelValue(value, level, fallback = 0) {
  if (Array.isArray(value)) return Number(value[Math.max(0, Number(level || 1) - 1)] ?? value[value.length - 1] ?? fallback);
  if (value && typeof value === "object") return Number(value[level] ?? value[String(level)] ?? value.default ?? fallback);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getSkillStatusCureProfile(skill, level = 1) {
  const profile = typeof getSkillRuntimeProfile === "function" ? (getSkillRuntimeProfile(skill) || {}) : (skill?.runtimeProfile || {});
  const statuses = new Set();
  [profile.clearStatuses, profile.clearStatusesOnlyWhenPresent, profile.effects?.clearStatuses].forEach(list => {
    (Array.isArray(list) ? list : []).forEach(status => statuses.add(normalizeAutoStatusKey(status)));
  });
  const effectKeys = Object.keys(profile.effects || {}).filter(key => key !== "clearStatuses");
  const chance = Math.max(0, Math.min(100, resolveAutoStatusLevelValue(profile.clearStatusesChancePercent, level, 100)));
  return {
    statuses: [...statuses].filter(Boolean),
    clearAll: profile.clearAllStatuses === true || profile.effects?.clearAllStatuses === true,
    chance,
    pureCure: profile.skipBuffWhenStatusPresent === true || (Number(profile.duration || 0) <= 1500 && effectKeys.length === 0 && !profile.formula),
    profile
  };
}

function getLearnedAutoStatusCureSkills(activeKeys = getPlayerActiveStatusKeys()) {
  const learned = [];
  for (const type of ["buff", "heal"]) {
    const rows = typeof getLearnedSkillsByType === "function" ? (getLearnedSkillsByType(type) || []) : [];
    rows.forEach(skill => learned.push(skill));
  }
  const seen = new Set();
  return learned
    .filter(skill => {
      const key = String(skill?.officialId ?? skill?.id ?? "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(skill => {
      const learnedLevel = Math.max(1, Number(typeof getSkillLevel === "function" ? getSkillLevel(skill.id) || 0 : 0));
      const cure = getSkillStatusCureProfile(skill, learnedLevel);
      return { skill, learnedLevel, cure, matched: getMatchedStatusCureKeys(cure, activeKeys) };
    })
    .filter(row => row.matched.length > 0)
    .sort((a, b) => {
      if (a.cure.pureCure !== b.cure.pureCure) return a.cure.pureCure ? -1 : 1;
      if (a.matched.length !== b.matched.length) return b.matched.length - a.matched.length;
      if (a.cure.chance !== b.cure.chance) return b.cure.chance - a.cure.chance;
      return Number(a.skill.id || 0) - Number(b.skill.id || 0);
    });
}

function tryAutoStatusCureSkill(activeKeys = getPlayerActiveStatusKeys()) {
  if (typeof isRuntimeSkillCasting === "function" && isRuntimeSkillCasting()) return false;
  for (const row of getLearnedAutoStatusCureSkills(activeKeys)) {
    const type = typeof getRuntimeSkillUiType === "function" ? getRuntimeSkillUiType(row.skill) : (row.cure.profile.handler || row.skill.skillType || "buff");
    const allowedType = type === "heal" ? "heal" : "buff";
    const check = typeof canCastSkill === "function" ? canCastSkill(row.skill, row.learnedLevel, [allowedType]) : { ok: true, level: row.learnedLevel };
    if (!check?.ok) continue;
    const level = Math.max(1, Number(check.level || row.learnedLevel || 1));
    const cast = () => {
      if (allowedType === "heal" && typeof castHealSkill === "function") return castHealSkill(row.skill, level);
      if (typeof castBuffSkill === "function") return castBuffSkill(row.skill, level, { silent: false });
      return false;
    };
    const timing = typeof getRuntimeAdjustedCastTime === "function" ? getRuntimeAdjustedCastTime(row.skill, level) : { totalMs: 0 };
    if (Number(timing?.totalMs || 0) > 0 && typeof beginRuntimeSkillCast === "function") {
      if (beginRuntimeSkillCast(row.skill, level, cast)) return true;
      continue;
    }
    if (cast()) return true;
  }
  return false;
}

function tryAutoStatusCure() {
  const cfg = player?.autoCombat?.detox;
  if (!cfg?.enabled) return false;
  if (typeof isRuntimeSkillCasting === "function" && isRuntimeSkillCasting()) return false;
  const activeKeys = getPlayerActiveStatusKeys();
  if (!activeKeys.length) return false;
  if (tryAutoStatusCureSkill(activeKeys)) return true;
  return useAutoStatusCureItem(activeKeys);
}

// Backward-compatible names kept for older tests/save helpers.
const isAutoDetoxItem = isAutoStatusCureItem;
const hasPlayerPoisonStatus = () => getPlayerActiveStatusKeys().some(key => ["poison", "deadlypoison", "slowpoison", "magicpoison"].includes(key));
const tryAutoDetox = tryAutoStatusCure;

function findBestRecoveryItem(kind) {
  if (!player?.inventory) return null;
  const key = kind === "sp" ? "sp" : "hp";
  const missing = key === "hp" ? (player.maxHp - player.hp) : (player.maxSp - player.sp);

  const candidates = player.inventory
    .map(inv => {
      const item = getItemData(inv.id);
      return { inv, item, value: getItemRecoveryValue(item, key) };
    })
    .filter(row => row.item && !isAutoStatusCureItem(row.item) && Number(row.value || 0) > 0 && Number(row.inv.count || 0) > 0
      && (typeof canUseConsumableItem !== "function" || canUseConsumableItem(row.item, { silent:true }).ok))
    .sort((a, b) => {
      const av = Number(a.value || 0);
      const bv = Number(b.value || 0);
      const aWaste = Math.max(0, av - missing);
      const bWaste = Math.max(0, bv - missing);
      if (aWaste !== bWaste) return aWaste - bWaste;
      return av - bv;
    });

  return candidates[0] || null;
}


function useRecoveryItem(kind, preferredItemId = null) {
  const key = kind === "sp" ? "sp" : "hp";
  let inventoryItem = null;
  let itemData = null;

  if (preferredItemId) {
    inventoryItem = findInventoryItemById(preferredItemId);
    itemData = inventoryItem ? getItemData(inventoryItem.id) : null;
    if (!itemData || isAutoStatusCureItem(itemData) || getItemRecoveryValue(itemData, key) <= 0
      || (typeof canUseConsumableItem === "function" && !canUseConsumableItem(itemData, { silent:true }).ok)) {
      inventoryItem = null;
      itemData = null;
    }
  }

  if (!inventoryItem || !itemData) {
    const best = findBestRecoveryItem(kind);
    if (!best) return false;
    inventoryItem = best.inv;
    itemData = best.item;
  }

  const usability = typeof canUseConsumableItem === "function" ? canUseConsumableItem(itemData, { silent:true }) : { ok:true };
  if (!usability.ok) return false;
  const baseRecovery = getItemRecoveryValue(itemData, key, { roll: true });
  if (baseRecovery <= 0) return false;
  const recovery = typeof calculateItemRecoveryAmount === "function"
    ? calculateItemRecoveryAmount(baseRecovery, key, itemData)
    : baseRecovery;
  const before = key === "hp" ? Number(player.hp || 0) : Number(player.sp || 0);
  if (key === "hp") {
    player.hp = Math.min(Number(player.maxHp || before), before + recovery);
  } else {
    player.sp = Math.min(Number(player.maxSp || before), before + recovery);
  }
  const after = key === "hp" ? Number(player.hp || 0) : Number(player.sp || 0);
  const actualRecovery = Math.max(0, after - before);

  inventoryItem.count -= 1;
  if (typeof markConsumableItemUsed === "function") markConsumableItemUsed(itemData);
  if (inventoryItem.count <= 0) {
    player.inventory = player.inventory.filter(item => String(item.id) !== String(inventoryItem.id));
  }

  addBattleLog(`自動使用 ${itemData.name}，${key.toUpperCase()} 恢復 ${actualRecovery}。`);
  updatePlayerUI();
  updateInventoryUI();
  saveGame();
  return true;
}


function syncAutoCombatSettingsFromUI(options = {}) {
  if (!player) return false;
  normalizeAutoCombatSettings();

  const hpEnabled = document.getElementById("autoCombatHpPotionEnabled");
  const hpPercent = document.getElementById("autoCombatHpPotionPercent");
  const hpItem = document.getElementById("autoCombatHpPotionSelect");
  const spEnabled = document.getElementById("autoCombatSpPotionEnabled");
  const spPercent = document.getElementById("autoCombatSpPotionPercent");
  const spItem = document.getElementById("autoCombatSpPotionSelect");
  const detoxEnabled = document.getElementById("autoCombatDetoxEnabled");
  const elementEndowEnabled = document.getElementById("autoCombatElementEndowEnabled");
  const elementEndowSelect = document.getElementById("autoCombatElementEndowSelect");
  const cashFoodEnabled = document.getElementById("autoCombatCashFoodEnabled");
  const monsterFilterMode = document.getElementById("autoCombatMonsterFilterMode");
  const monsterFilterList = document.getElementById("autoCombatMonsterFilterList");
  const healEnabled = document.getElementById("autoCombatHealEnabled");
  const healSkill = document.getElementById("autoCombatHealSkill");
  const healLevel = document.getElementById("autoCombatHealLevel");
  const healHpPercent = document.getElementById("autoCombatHealHpPercent");
  const healSpPercent = document.getElementById("autoCombatHealSpPercent");
  const normalAttackEnabled = document.getElementById("autoCombatNormalAttackEnabled");
  const teleportEnabled = document.getElementById("autoCombatTeleportEnabled");
  const avoidBoss = document.getElementById("autoCombatAvoidBoss");
  const avoidMvp = document.getElementById("autoCombatAvoidMvp");
  const lowHpFlyEnabled = document.getElementById("autoCombatLowHpFlyEnabled");
  const lowHpFlyPercent = document.getElementById("autoCombatLowHpFlyPercent");
  const butterflyEnabled = document.getElementById("autoCombatButterflyEnabled");
  const butterflyPercent = document.getElementById("autoCombatButterflyPercent");
  const returnCity = document.getElementById("autoCombatReturnCity");

  if (hpEnabled) player.autoCombat.hpPotion.enabled = hpEnabled.checked;
  if (hpPercent) player.autoCombat.hpPotion.hpPercent = Number(hpPercent.value) || 50;
  if (hpItem) player.autoCombat.hpPotion.itemId = normalizeItemId(hpItem.value) || null;

  if (spEnabled) player.autoCombat.spPotion.enabled = spEnabled.checked;
  if (spPercent) player.autoCombat.spPotion.spPercent = Number(spPercent.value) || 30;
  if (spItem) player.autoCombat.spPotion.itemId = normalizeItemId(spItem.value) || null;
  if (detoxEnabled) player.autoCombat.detox.enabled = detoxEnabled.checked;
  if (elementEndowEnabled) player.autoCombat.elementEndow.enabled = elementEndowEnabled.checked;
  if (elementEndowSelect) {
    player.autoCombat.elementEndow.element = AUTO_ELEMENT_CONVERTER_ITEM_IDS[elementEndowSelect.value]
      ? elementEndowSelect.value
      : "";
  }
  if (cashFoodEnabled) player.autoCombat.cashFood.enabled = cashFoodEnabled.checked;

  const currentFilterMapId = getAutoBattleCurrentMapId();
  const listHasRenderedMap = Boolean(
    monsterFilterList?.dataset.renderSignature
    && monsterFilterList?.dataset.mapId
    && String(monsterFilterList.dataset.mapId) === String(currentFilterMapId)
  );
  // The controller synchronizes ordinary settings on every combat tick. Do not
  // let the still-unrendered HTML defaults erase a saved per-map monster list.
  if (listHasRenderedMap) {
    const monsterFilter = getAutoBattleMapMonsterFilter(currentFilterMapId, { create: true });
    if (monsterFilterMode) monsterFilter.mode = normalizeAutoMonsterFilterMode(monsterFilterMode.value);
    monsterFilter.selectedIds = [...monsterFilterList.querySelectorAll("[data-auto-monster-filter-id]")]
      .filter(input => input.checked)
      .map(input => normalizeAutoMonsterId(input.dataset.autoMonsterFilterId))
      .filter(Boolean);
    player.autoCombat.monsterFilter.byMap[currentFilterMapId] = normalizeAutoMonsterFilterEntry(monsterFilter);
  }

  if (healEnabled) player.autoCombat.heal.enabled = healEnabled.checked;
  if (healSkill) player.autoCombat.heal.skillId = healSkill.value || null;
  if (healLevel) player.autoCombat.heal.level = Number(healLevel.value) || 1;
  if (healHpPercent) player.autoCombat.heal.hpPercent = Number(healHpPercent.value) || 60;
  if (healSpPercent) player.autoCombat.heal.spPercent = Number(healSpPercent.value) || 20;

  if (normalAttackEnabled) player.autoCombat.normalAttack.enabled = normalAttackEnabled.checked;
  if (teleportEnabled) player.autoCombat.teleport.enabled = teleportEnabled.checked;
  if (avoidBoss) player.autoCombat.teleport.avoidBoss = avoidBoss.checked;
  if (avoidMvp) player.autoCombat.teleport.avoidMvp = avoidMvp.checked;
  if (lowHpFlyEnabled) player.autoCombat.teleport.lowHpEnabled = lowHpFlyEnabled.checked;
  if (lowHpFlyPercent) player.autoCombat.teleport.lowHpPercent = Math.max(1, Math.min(99, Number(lowHpFlyPercent.value) || 30));
  if (butterflyEnabled) player.autoCombat.teleport.returnHome.enabled = butterflyEnabled.checked;
  if (butterflyPercent) player.autoCombat.teleport.returnHome.hpPercent = Math.max(1, Math.min(99, Number(butterflyPercent.value) || 10));
  if (returnCity) player.autoCombat.teleport.returnHome.cityId = returnCity.value || "prontera";
  player.autoCombat.teleport.noTargetSeconds = 1;

  player.autoCombat.attacks.forEach((slot, index) => {
    const enabled = document.getElementById(`autoCombatAttackEnabled${index + 1}`);
    const skill = document.getElementById(`autoCombatAttackSkill${index + 1}`);
    const level = document.getElementById(`autoCombatAttackLevel${index + 1}`);
    const sp = document.getElementById(`autoCombatAttackSpPercent${index + 1}`);
    const minimum = document.getElementById(`autoCombatAttackMinMonsters${index + 1}`);
    if (enabled) slot.enabled = enabled.checked;
    if (skill) slot.skillId = skill.value || null;
    if (level) slot.level = Math.max(1, Number(level.value) || 1);
    if (sp) slot.spPercent = Math.max(0, Math.min(100, Number(sp.value) || 0));
    if (minimum) slot.minMonsters = Math.max(1, Math.min(99, Number(minimum.value) || 1));
  });
  player.autoCombat.attack = player.autoCombat.attacks[0];

  document.querySelectorAll("[data-auto-buff-enabled]").forEach(input => {
    const key = input.dataset.autoBuffEnabled;
    const threshold = [...document.querySelectorAll("[data-auto-buff-sp]")].find(node => node.dataset.autoBuffSp === key);
    player.autoCombat.buffs[key] = {
      enabled: input.checked,
      spPercent: Math.max(0, Math.min(100, Number(threshold?.value || 0)))
    };
  });

  const autoRunning = typeof isAutoBattleRunning === "function" && isAutoBattleRunning();
  if (autoRunning && typeof currentMonster !== "undefined" && currentMonster && !isAutoBattleMonsterAllowed(currentMonster)) {
    if (typeof clearAutoBattleTarget === "function") clearAutoBattleTarget({ reason: "monster_filter_changed" });
    else currentMonster = null;
    if (typeof scheduleAutoBattleTick === "function") scheduleAutoBattleTick(8);
  }

  if (options.save) saveGame();
  return true;
}

function updatePotionSelectOptions(select, kind, selectedId) {
  if (!select) return;
  const resource = kind === "sp" ? "SP" : "HP";
  select.innerHTML = `<option value="">自動選擇背包中的 ${resource} 補品</option>`;

  const options = (player?.inventory || [])
    .map(inv => {
      const item = getItemData(inv.id);
      return { inv, item, value: getItemRecoveryValue(item, kind) };
    })
    .filter(row => row.item && !isAutoStatusCureItem(row.item) && row.value > 0 && Number(row.inv.count || 0) > 0)
    .sort((a, b) => a.value - b.value || String(a.item.name || "").localeCompare(String(b.item.name || ""), "zh-Hant"));

  options.forEach(row => {
    const option = document.createElement("option");
    option.value = row.item.id;
    option.textContent = `${row.item.name} x${row.inv.count}（${resource}+${row.value}）`;
    select.appendChild(option);
  });

  if (selectedId) select.value = selectedId;
}

function fillSkillLevelSelect(select, skill, selectedLevel) {
  if (!select) return;
  select.innerHTML = "";
  if (!skill) {
    select.innerHTML = '<option value="1">Lv 1</option>';
    return;
  }
  const learned = Math.max(1, getSkillLevel(skill.id));
  for (let lv = 1; lv <= learned; lv++) {
    const option = document.createElement("option");
    option.value = String(lv);
    option.textContent = `Lv ${lv}`;
    select.appendChild(option);
  }
  select.value = String(Math.min(Number(selectedLevel || learned), learned));
}


function updateAutoCombatReturnCityOptions(select, selectedId) {
  if (!select) return;
  const rows = Array.isArray(window.cities) ? window.cities : (typeof cities !== "undefined" && Array.isArray(cities) ? cities : []);
  select.innerHTML = "";
  const source = rows.length ? rows : [{ id: "prontera", name: "普隆德拉" }];
  source.forEach(city => {
    const option = document.createElement("option");
    option.value = String(city.id);
    option.textContent = city.displayName || city.name || city.id;
    select.appendChild(option);
  });
  const desired = String(selectedId || "prontera");
  if ([...select.options].some(option => option.value === desired)) select.value = desired;
  else if ([...select.options].some(option => option.value === "prontera")) select.value = "prontera";
}

function getAutoMonsterFilterModeDescription(mode, selectedCount) {
  if (mode === AUTO_MONSTER_FILTER_MODES.INCLUDE) {
    return selectedCount > 0 ? `只攻擊已勾選的 ${selectedCount} 種怪物。` : "尚未勾選目標；自動戰鬥會等待，不會亂打或重複飛走。";
  }
  if (mode === AUTO_MONSTER_FILTER_MODES.EXCLUDE) {
    return selectedCount > 0 ? `不攻擊已勾選的 ${selectedCount} 種怪物，其餘照常攻擊。` : "排除名單目前為空，等同攻擊全部怪物。";
  }
  return "攻擊目前地圖中的全部怪物。";
}

function updateAutoCombatMonsterFilterSummary(catalog = getAutoBattleMonsterCatalog()) {
  const mapId = getAutoBattleCurrentMapId();
  const filter = getAutoBattleMapMonsterFilter(mapId, { create: true });
  const selected = new Set((filter.selectedIds || []).map(normalizeAutoMonsterId));
  const summary = document.getElementById("autoCombatMonsterFilterSummary");
  const status = document.getElementById("autoCombatMonsterFilterStatus");
  const mapName = (typeof currentMap !== "undefined" && (currentMap?.displayName || currentMap?.name)) || mapId;
  const aliveTotal = catalog.reduce((sum, row) => sum + Number(row.aliveCount || 0), 0);
  if (summary) summary.textContent = `當前地圖：${mapName}｜偵測 ${catalog.length} 種｜目前生成 ${aliveTotal} 隻`;
  if (status) status.textContent = getAutoMonsterFilterModeDescription(normalizeAutoMonsterFilterMode(filter.mode), selected.size);
  const mode = document.getElementById("autoCombatMonsterFilterMode");
  if (mode) mode.value = normalizeAutoMonsterFilterMode(filter.mode);
}

function updateAutoCombatMonsterFilterUI(options = {}) {
  if (!player || typeof document === "undefined") return;
  normalizeAutoCombatSettings();
  const list = document.getElementById("autoCombatMonsterFilterList");
  if (!list) return;
  const mapId = getAutoBattleCurrentMapId();
  const filter = getAutoBattleMapMonsterFilter(mapId, { create: true });
  const selected = new Set((filter.selectedIds || []).map(normalizeAutoMonsterId));
  const catalog = getAutoBattleMonsterCatalog();
  const signature = JSON.stringify({
    mapId,
    mode: normalizeAutoMonsterFilterMode(filter.mode),
    selected: [...selected].sort(),
    species: catalog.map(row => [row.id, row.name, row.category])
  });
  const scrollTop = Number(list.scrollTop || 0);
  list.dataset.mapId = mapId;

  if (options.force === true || list.dataset.renderSignature !== signature) {
    list.innerHTML = "";
    if (!catalog.length) {
      const empty = document.createElement("div");
      empty.className = "auto-monster-filter-empty";
      empty.textContent = player.currentCity ? "目前位於城鎮，請前往練功地圖後重新偵測。" : "目前地圖尚未偵測到怪物資料。";
      list.appendChild(empty);
    } else {
      catalog.forEach(row => {
        const label = document.createElement("label");
        label.className = "auto-monster-filter-row";
        label.dataset.monsterFilterRowId = row.id;

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selected.has(row.id);
        checkbox.dataset.autoMonsterFilterId = row.id;
        checkbox.addEventListener("change", () => {
          syncAutoCombatSettingsFromUI({ save: false });
          updateAutoCombatMonsterFilterSummary(getAutoBattleMonsterCatalog());
        });

        const text = document.createElement("span");
        text.className = "auto-monster-filter-name";
        text.textContent = row.name;

        const meta = document.createElement("small");
        meta.className = "auto-monster-filter-meta";
        meta.dataset.monsterFilterCountId = row.id;
        const category = AUTO_MONSTER_CATEGORY_LABELS[row.category] || AUTO_MONSTER_CATEGORY_LABELS.normal;
        meta.textContent = `${category}｜ID ${row.id}｜目前 ${row.aliveCount} 隻`;

        label.appendChild(checkbox);
        label.appendChild(text);
        label.appendChild(meta);
        list.appendChild(label);
      });
    }
    list.dataset.renderSignature = signature;
    list.scrollTop = scrollTop;
  } else {
    catalog.forEach(row => {
      const meta = list.querySelector(`[data-monster-filter-count-id="${row.id}"]`);
      if (!meta) return;
      const category = AUTO_MONSTER_CATEGORY_LABELS[row.category] || AUTO_MONSTER_CATEGORY_LABELS.normal;
      meta.textContent = `${category}｜ID ${row.id}｜目前 ${row.aliveCount} 隻`;
    });
  }
  updateAutoCombatMonsterFilterSummary(catalog);
}

function setAutoCombatMonsterFilterSelection(checked) {
  const list = document.getElementById("autoCombatMonsterFilterList");
  if (!list) return false;
  list.querySelectorAll("[data-auto-monster-filter-id]").forEach(input => { input.checked = checked === true; });
  syncAutoCombatSettingsFromUI({ save: false });
  updateAutoCombatMonsterFilterUI({ force: true });
  return true;
}

function refreshAutoCombatMonsterFilterUI() {
  updateAutoCombatMonsterFilterUI({ force: true });
  return true;
}

if (typeof window !== "undefined") {
  window.updateAutoCombatMonsterFilterUI = updateAutoCombatMonsterFilterUI;
  window.setAutoCombatMonsterFilterSelection = setAutoCombatMonsterFilterSelection;
  window.refreshAutoCombatMonsterFilterUI = refreshAutoCombatMonsterFilterUI;
}


function getAutoCashFoodInventoryRows() {
  const rows = [];
  const seen = new Set();
  for (const inv of player?.inventory || []) {
    const id = normalizeItemId(inv?.id);
    if (seen.has(String(id)) || Number(inv?.count || 0) <= 0) continue;
    const item = typeof getItemData === "function" ? getItemData(id) : null;
    if (!item?.cashFoodEffect || typeof item.cashFoodEffect !== "object") continue;
    seen.add(String(id));
    rows.push({ id, item, count:Number(inv.count || 0) });
  }
  return rows.sort((left, right) => String(left.item.name || "").localeCompare(String(right.item.name || ""), "zh-Hant"));
}

function getAutoCashFoodInventoryCount(itemId) {
  return (player?.inventory || [])
    .filter(row => String(row?.id) === String(itemId))
    .reduce((sum, row) => sum + Math.max(0, Number(row?.count || 0)), 0);
}

function renderAutoCashFoodUI() {
  const select = document.getElementById("autoCombatCashFoodSelect");
  const list = document.getElementById("autoCombatCashFoodList");
  if (!select && !list) return;
  normalizeAutoCombatSettings();
  const selectedIds = player.autoCombat.cashFood.itemIds || [];
  const inventoryRows = getAutoCashFoodInventoryRows();

  if (select) {
    const previous = String(select.value || "");
    select.innerHTML = '<option value="">請選擇背包中的商城料理</option>';
    inventoryRows.forEach(row => {
      const option = document.createElement("option");
      option.value = String(row.id);
      option.textContent = `${row.item.name} ×${row.count}${selectedIds.some(id => String(id) === String(row.id)) ? "（已加入）" : ""}`;
      select.appendChild(option);
    });
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
  }

  if (list) {
    list.innerHTML = "";
    if (!selectedIds.length) {
      list.innerHTML = '<div class="auto-empty">尚未加入料理</div>';
    } else {
      selectedIds.forEach((id, index) => {
        const item = typeof getItemData === "function" ? getItemData(id) : null;
        const row = document.createElement("div");
        row.className = "auto-cash-food-row";
        const body = document.createElement("div");
        const name = document.createElement("div");
        name.className = "auto-cash-food-row-name";
        name.textContent = `${index + 1}. ${item?.name || `Item ${id}`}`;
        name.title = name.textContent;
        const meta = document.createElement("div");
        meta.className = "auto-cash-food-row-meta";
        meta.textContent = `背包數量：${getAutoCashFoodInventoryCount(id)}`;
        body.appendChild(name);
        body.appendChild(meta);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "auto-cash-food-remove";
        remove.textContent = "移除";
        remove.addEventListener("click", () => removeAutoCashFoodSelection(id));
        row.appendChild(body);
        row.appendChild(remove);
        list.appendChild(row);
      });
    }
  }
}

function addAutoCashFoodSelection() {
  if (!player) return false;
  normalizeAutoCombatSettings();
  const select = document.getElementById("autoCombatCashFoodSelect");
  const id = normalizeItemId(select?.value);
  const item = typeof getItemData === "function" ? getItemData(id) : null;
  if (!id || !item?.cashFoodEffect) {
    if (typeof addBattleLog === "function") addBattleLog("請先從背包選擇一項商城料理。");
    return false;
  }
  if (!player.autoCombat.cashFood.itemIds.some(value => String(value) === String(id))) {
    player.autoCombat.cashFood.itemIds.push(id);
  }
  player.autoCombat.cashFood.enabled = true;
  const enabled = document.getElementById("autoCombatCashFoodEnabled");
  if (enabled) enabled.checked = true;
  renderAutoCashFoodUI();
  saveGame();
  return true;
}

function removeAutoCashFoodSelection(itemId) {
  if (!player) return false;
  normalizeAutoCombatSettings();
  player.autoCombat.cashFood.itemIds = player.autoCombat.cashFood.itemIds.filter(id => String(id) !== String(itemId));
  renderAutoCashFoodUI();
  saveGame();
  return true;
}

function getAutoCashFoodEffectKeys(item) {
  const raw = item?.cashFoodEffect;
  if (!raw || typeof raw !== "object") return new Set();
  const randomKeyMap = {
    hitRandom:"hitFlat", criRandom:"criFlat", atkRandom:"atkFlat",
    hpRecoveryRandom:"hpRecoveryRate", fleeRandom:"fleeFlat", matkRandom:"matkFlat"
  };
  const keys = new Set();
  Object.entries(raw).forEach(([key, value]) => {
    if (["durationMs", "extraDurationMs"].includes(key)) return;
    if (key.endsWith("Random")) {
      keys.add(randomKeyMap[key] || `${key.slice(0, -6)}Flat`);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      keys.add(key);
    }
  });
  if (keys.has("allStatsFlat")) {
    ["strFlat","agiFlat","vitFlat","intFlat","dexFlat","lukFlat"].forEach(key => keys.add(key));
  }
  return keys;
}

function getActiveAutoCashFoodBuffs() {
  if (typeof normalizeActiveBuffs === "function") normalizeActiveBuffs();
  const now = Date.now();
  return Object.values(player?.activeBuffs || {}).filter(buff =>
    buff?.sourceType === "mvp_gacha_cash_food" && Number(buff?.expiresAt || 0) > now
  );
}

function activeCashFoodOverlapsItem(item, activeBuffs) {
  const incoming = getAutoCashFoodEffectKeys(item);
  if (!incoming.size) return true;
  for (const buff of activeBuffs) {
    if (String(buff?.sourceItemId) === String(item?.id)) return true;
    const existing = new Set(Object.keys(buff?.effects || {}).filter(key => typeof buff.effects[key] === "number"));
    if (existing.has("allStatsFlat")) {
      ["strFlat","agiFlat","vitFlat","intFlat","dexFlat","lukFlat"].forEach(key => existing.add(key));
    }
    if (incoming.has("allStatsFlat") || existing.has("allStatsFlat")) {
      const statKeys = ["strFlat","agiFlat","vitFlat","intFlat","dexFlat","lukFlat"];
      if (statKeys.some(key => incoming.has(key) || existing.has(key))) return true;
    }
    if ([...incoming].some(key => existing.has(key))) return true;
  }
  return false;
}

function tryAutoCashFood() {
  const cfg = player?.autoCombat?.cashFood;
  if (!cfg?.enabled || !Array.isArray(cfg.itemIds) || !cfg.itemIds.length) return false;
  const activeBuffs = getActiveAutoCashFoodBuffs();
  for (const id of cfg.itemIds) {
    const item = typeof getItemData === "function" ? getItemData(id) : null;
    if (!item?.cashFoodEffect) continue;
    if (getAutoCashFoodInventoryCount(id) <= 0) continue;
    if (activeCashFoodOverlapsItem(item, activeBuffs)) continue;
    if (window.MvpGachaRuntime?.applyCashFood?.(item)) return true;
  }
  return false;
}

if (typeof window !== "undefined") {
  window.getAutoCashFoodInventoryRows = getAutoCashFoodInventoryRows;
  window.renderAutoCashFoodUI = renderAutoCashFoodUI;
  window.addAutoCashFoodSelection = addAutoCashFoodSelection;
  window.removeAutoCashFoodSelection = removeAutoCashFoodSelection;
  window.tryAutoCashFood = tryAutoCashFood;
}

function enhanceAutoCombatNumberInputs() {
  const panel = document.getElementById("auto-combat-panel");
  if (!panel) return;
  panel.querySelectorAll('input[type="number"]').forEach(input => {
    input.dataset.roNumberOwner = "auto-combat";
    input.classList.add("ro-gold-field");
    if (input.closest(".auto-number-control")) return;
    const wrapper = document.createElement("span");
    wrapper.className = "auto-number-control";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    const stepper = document.createElement("span");
    stepper.className = "auto-number-stepper";
    [["▲", 1, "增加"], ["▼", -1, "減少"]].forEach(([text, direction, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.tabIndex = -1;
      button.setAttribute("aria-label", label);
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        direction > 0 ? input.stepUp() : input.stepDown();
        const min = input.min === "" ? -Infinity : Number(input.min);
        const max = input.max === "" ? Infinity : Number(input.max);
        input.value = String(Math.max(min, Math.min(max, Number(input.value || 0))));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      stepper.appendChild(button);
    });
    wrapper.appendChild(stepper);
  });
}

function updateAutoCombatUI() {
  if (!player) return;
  normalizeAutoCombatSettings();

  const cfg = player.autoCombat;
  const hpEnabled = document.getElementById("autoCombatHpPotionEnabled");
  const hpPercent = document.getElementById("autoCombatHpPotionPercent");
  const hpItem = document.getElementById("autoCombatHpPotionSelect");
  const spEnabled = document.getElementById("autoCombatSpPotionEnabled");
  const spPercent = document.getElementById("autoCombatSpPotionPercent");
  const spItem = document.getElementById("autoCombatSpPotionSelect");
  const detoxEnabled = document.getElementById("autoCombatDetoxEnabled");
  const elementEndowEnabled = document.getElementById("autoCombatElementEndowEnabled");
  const elementEndowSelect = document.getElementById("autoCombatElementEndowSelect");
  const cashFoodEnabled = document.getElementById("autoCombatCashFoodEnabled");
  const monsterFilterMode = document.getElementById("autoCombatMonsterFilterMode");
  const teleportEnabled = document.getElementById("autoCombatTeleportEnabled");
  const avoidBoss = document.getElementById("autoCombatAvoidBoss");
  const avoidMvp = document.getElementById("autoCombatAvoidMvp");
  const lowHpFlyEnabled = document.getElementById("autoCombatLowHpFlyEnabled");
  const lowHpFlyPercent = document.getElementById("autoCombatLowHpFlyPercent");
  const butterflyEnabled = document.getElementById("autoCombatButterflyEnabled");
  const butterflyPercent = document.getElementById("autoCombatButterflyPercent");
  const returnCity = document.getElementById("autoCombatReturnCity");
  const normalAttackEnabled = document.getElementById("autoCombatNormalAttackEnabled");

  if (hpEnabled) hpEnabled.checked = !!cfg.hpPotion.enabled;
  if (hpPercent) hpPercent.value = cfg.hpPotion.hpPercent;
  if (spEnabled) spEnabled.checked = !!cfg.spPotion.enabled;
  if (spPercent) spPercent.value = cfg.spPotion.spPercent;
  if (detoxEnabled) detoxEnabled.checked = !!cfg.detox.enabled;
  if (elementEndowEnabled) elementEndowEnabled.checked = !!cfg.elementEndow.enabled;
  if (elementEndowSelect) {
    elementEndowSelect.value = cfg.elementEndow.element || "";
    elementEndowSelect.disabled = !cfg.elementEndow.enabled;
  }
  if (cashFoodEnabled) cashFoodEnabled.checked = cfg.cashFood.enabled === true;
  renderAutoCashFoodUI();
  const currentMonsterFilter = getAutoBattleMapMonsterFilter(getAutoBattleCurrentMapId(), { create: true });
  if (monsterFilterMode) monsterFilterMode.value = normalizeAutoMonsterFilterMode(currentMonsterFilter.mode);
  updateAutoCombatMonsterFilterUI();
  if (teleportEnabled) teleportEnabled.checked = !!cfg.teleport.enabled;
  if (avoidBoss) avoidBoss.checked = !!cfg.teleport.avoidBoss;
  if (avoidMvp) avoidMvp.checked = !!cfg.teleport.avoidMvp;
  if (lowHpFlyEnabled) lowHpFlyEnabled.checked = !!cfg.teleport.lowHpEnabled;
  if (lowHpFlyPercent) lowHpFlyPercent.value = cfg.teleport.lowHpPercent;
  if (butterflyEnabled) butterflyEnabled.checked = !!cfg.teleport.returnHome.enabled;
  if (butterflyPercent) butterflyPercent.value = cfg.teleport.returnHome.hpPercent;
  updateAutoCombatReturnCityOptions(returnCity, cfg.teleport.returnHome.cityId);
  if (normalAttackEnabled) normalAttackEnabled.checked = cfg.normalAttack.enabled !== false;
  updatePotionSelectOptions(hpItem, "hp", cfg.hpPotion.itemId);
  updatePotionSelectOptions(spItem, "sp", cfg.spPotion.itemId);

  const healSkills = getLearnedSkillsByType("heal");
  const attackSkills = getLearnedSkillsByType("attack");
  const buffSkills = getLearnedSkillsByType("buff");

  if (cfg.heal.skillId && !healSkills.some(skill => String(typeof getSkillStorageKey === "function" ? getSkillStorageKey(skill) : skill.id) === String(cfg.heal.skillId))) cfg.heal.skillId = null;

  const healEnabled = document.getElementById("autoCombatHealEnabled");
  const healSkill = document.getElementById("autoCombatHealSkill");
  const healLevel = document.getElementById("autoCombatHealLevel");
  const healHpPercent = document.getElementById("autoCombatHealHpPercent");
  const healSpPercent = document.getElementById("autoCombatHealSpPercent");

  if (healEnabled) healEnabled.checked = !!cfg.heal.enabled;
  if (healHpPercent) healHpPercent.value = cfg.heal.hpPercent;
  if (healSpPercent) healSpPercent.value = cfg.heal.spPercent;
  if (healSkill) {
    healSkill.innerHTML = healSkills.length ? "" : '<option value="">尚未學會治癒技能</option>';
    healSkills.forEach(skill => {
      const option = document.createElement("option");
      option.value = typeof getSkillStorageKey === "function" ? getSkillStorageKey(skill) : String(skill.id);
      option.textContent = skill.name;
      healSkill.appendChild(option);
    });
    if (cfg.heal.skillId) healSkill.value = cfg.heal.skillId;
  }
  const selectedHeal = getSkillDataById(healSkill?.value || cfg.heal.skillId);
  fillSkillLevelSelect(healLevel, selectedHeal, cfg.heal.level);

  cfg.attacks.forEach((slot, index) => {
    const number = index + 1;
    const enabled = document.getElementById(`autoCombatAttackEnabled${number}`);
    const skillSelect = document.getElementById(`autoCombatAttackSkill${number}`);
    const levelSelect = document.getElementById(`autoCombatAttackLevel${number}`);
    const spInput = document.getElementById(`autoCombatAttackSpPercent${number}`);
    const minimumInput = document.getElementById(`autoCombatAttackMinMonsters${number}`);
    const valid = slot.skillId && attackSkills.some(skill => String(typeof getSkillStorageKey === "function" ? getSkillStorageKey(skill) : skill.id) === String(slot.skillId));
    if (slot.skillId && !valid) slot.skillId = null;

    if (enabled) enabled.checked = slot.enabled !== false;
    if (spInput) spInput.value = slot.spPercent;
    if (minimumInput) minimumInput.value = slot.minMonsters;
    if (skillSelect) {
      skillSelect.innerHTML = '<option value="">不使用此技能欄</option>';
      attackSkills.forEach(skill => {
        const option = document.createElement("option");
        option.value = typeof getSkillStorageKey === "function" ? getSkillStorageKey(skill) : String(skill.id);
        option.textContent = skill.name;
        skillSelect.appendChild(option);
      });
      if (slot.skillId) skillSelect.value = slot.skillId;
    }
    const selectedSkill = getSkillDataById(skillSelect?.value || slot.skillId);
    fillSkillLevelSelect(levelSelect, selectedSkill, slot.level);
  });
  cfg.attack = cfg.attacks[0];

  const buffBox = document.getElementById("autoCombatBuffList");
  if (buffBox) {
    buffBox.innerHTML = "";
    if (!buffSkills.length) {
      buffBox.innerHTML = '<div class="auto-empty">尚未學會 Buff 技能</div>';
    } else {
      buffSkills.forEach(skill => {
        const key = typeof getSkillStorageKey === "function" ? getSkillStorageKey(skill) : String(skill.id);
        if (!cfg.buffs[key]) {
          cfg.buffs[key] = {
            enabled: !!skill.ai?.defaultMaintain,
            spPercent: 0
          };
        }
        const setting = cfg.buffs[key];

        const row = document.createElement("div");
        row.className = "auto-buff-row";

        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.autoBuffEnabled = key;
        checkbox.checked = setting.enabled !== false;
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(` ${skill.name} Lv${getSkillLevel(skill.id)}`));

        const threshold = document.createElement("div");
        threshold.className = "auto-buff-threshold";
        threshold.appendChild(document.createTextNode("SP 高於 "));
        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.max = "100";
        input.value = String(setting.spPercent || 0);
        input.dataset.autoBuffSp = key;
        threshold.appendChild(input);
        threshold.appendChild(document.createTextNode(" %"));

        row.appendChild(label);
        row.appendChild(threshold);
        buffBox.appendChild(row);
      });
    }
  }
  enhanceAutoCombatNumberInputs();
}

function saveAutoCombatSettings() {
  const scroll = document.getElementById("autoCombatSettingsScroll");
  const previousScrollTop = Number(scroll?.scrollTop || 0);
  syncAutoCombatSettingsFromUI({ save: true });
  updateAutoCombatUI();
  if (scroll) {
    const restore = () => { scroll.scrollTop = Math.min(previousScrollTop, Math.max(0, scroll.scrollHeight - scroll.clientHeight)); };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(restore);
    else restore();
  }
  addBattleLog("自動戰鬥設定已更新。");
}

function performAutoFlyWingEscape(reason = "low_hp") {
  const now = Date.now();
  if (now - Number(AUTO_BATTLE_CONTROLLER.lastLowHpTeleportAt || 0) < 1000) return false;
  AUTO_BATTLE_CONTROLLER.lastLowHpTeleportAt = now;
  setAutoBattleControllerState(AUTO_BATTLE_STATES.TELEPORTING, { action: "fly_wing", reason });
  const used = typeof useFlyWing === "function" ? useFlyWing({ silent: false }) : false;
  if (!used) return false;
  clearAutoBattleTarget({ reason });
  AUTO_BATTLE_CONTROLLER.lastTeleportAt = Date.now();
  if (typeof maintainWorldMonsterPopulation === "function") maintainWorldMonsterPopulation(Date.now(), { initial: false });
  if (typeof acquireAutoBattleTarget === "function") acquireAutoBattleTarget({ reason: `${reason}_reacquire` });
  if (typeof scheduleAutoBattleTick === "function" && typeof isAutoBattleRunning === "function" && isAutoBattleRunning()) scheduleAutoBattleTick(8);
  return true;
}

function tryAutoEmergencyEscape() {
  if (!player || player.currentCity) return null;
  normalizeAutoCombatSettings();
  const hpPercent = getPercent(player.hp, player.maxHp);
  const teleport = player.autoCombat.teleport || {};
  const returnHome = teleport.returnHome || {};

  if (returnHome.enabled === true && hpPercent <= Number(returnHome.hpPercent || 10)) {
    const now = Date.now();
    if (now - Number(AUTO_BATTLE_CONTROLLER.lastButterflyAt || 0) >= 3000) {
      AUTO_BATTLE_CONTROLLER.lastButterflyAt = now;
      setAutoBattleControllerState(AUTO_BATTLE_STATES.TELEPORTING, { action: "butterfly_wing", reason: "critical_hp" });
      if (typeof useButterflyWing === "function" && useButterflyWing({ cityId: returnHome.cityId || "prontera", silent: false })) return "butterfly";
    }
  }
  if (teleport.lowHpEnabled === true && hpPercent <= Number(teleport.lowHpPercent || 30)) {
    if (performAutoFlyWingEscape("low_hp")) return "fly";
  }
  return null;
}

function autoUsePotion() {
  syncAutoCombatSettingsFromUI({ save: false });
  normalizeAutoCombatSettings();
  const cfg = player.autoCombat;
  let used = false;

  if (cfg.hpPotion.enabled && getPercent(player.hp, player.maxHp) <= Number(cfg.hpPotion.hpPercent || 50)) {
    used = useRecoveryItem("hp", cfg.hpPotion.itemId) || used;
  }

  if (cfg.spPotion.enabled && getPercent(player.sp, player.maxSp) <= Number(cfg.spPotion.spPercent || 30)) {
    used = useRecoveryItem("sp", cfg.spPotion.itemId) || used;
  }
  return used;
}

function tryAutoElementEndow() {
  const cfg = player?.autoCombat?.elementEndow;
  if (!cfg?.enabled) return false;
  // 肯貝特是武器附魔；空手時不消耗，卸下主武器也會解除現有效果。
  if (!player?.equipment?.weapon) {
    if (player?.activeBuffs?.item_physical_element_endow && typeof clearPhysicalElementEndow === "function") {
      clearPhysicalElementEndow("weapon_unequip", { silent:true });
    }
    return false;
  }

  // 灑水、塗毒、賢者屬性附加與其他技能武器附加都高於肯貝特；
  // 技能效果存在期間不重複嘗試、不消耗肯貝特，也不阻塞掛機攻擊。
  if (typeof getActiveSkillWeaponElementEndow === "function" && getActiveSkillWeaponElementEndow()) return false;

  const element = String(cfg.element || "");
  const itemId = AUTO_ELEMENT_CONVERTER_ITEM_IDS[element];
  if (!itemId) return false;

  const active = player?.activeBuffs?.item_physical_element_endow;
  const activeElement = String(active?.effects?.attackElementOverride || "");
  const remainingMs = Number(active?.expiresAt || 0) - Date.now();
  // Do not waste another converter while the selected element is still active.
  if (activeElement === element && remainingMs > 0) return false;

  const inventoryItem = (player?.inventory || []).find(item => String(item.id) === String(itemId) && Number(item.count || 0) > 0);
  if (!inventoryItem) {
    const now = Date.now();
    if (now - Number(AUTO_BATTLE_CONTROLLER.lastElementWarningAt || 0) >= 30000) {
      AUTO_BATTLE_CONTROLLER.lastElementWarningAt = now;
      addBattleLog(`自動肯貝特：背包沒有${AUTO_ELEMENT_CONVERTER_LABELS[element] || element}肯貝特。`);
    }
    return false;
  }

  const itemData = getItemData(itemId);
  if (!itemData || typeof consumeItem !== "function") return false;
  const before = Number(inventoryItem.count || 0);
  consumeItem(itemData);
  const afterItem = (player?.inventory || []).find(item => String(item.id) === String(itemId));
  return Number(afterItem?.count || 0) < before;
}

function shouldCastBySp(minPercent) {
  return getPercent(player.sp, player.maxSp) >= Number(minPercent || 0);
}


const AUTO_RESOURCE_RETRY_MS = 15000;
function normalizeAutoResourceRetryState() {
  if(!player)return {};
  player.autoCombat=player.autoCombat||{};
  const raw=player.autoCombat.resourceRetryUntil;
  player.autoCombat.resourceRetryUntil=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{};
  const now=Date.now();
  Object.keys(player.autoCombat.resourceRetryUntil).forEach(key=>{if(Number(player.autoCombat.resourceRetryUntil[key]||0)<=now)delete player.autoCombat.resourceRetryUntil[key];});
  return player.autoCombat.resourceRetryUntil;
}
function getAutoResourceRetryKey(skill){return String(skill?.officialId??skill?.id??skill?.key??0);}
function isAutoSkillResourceSuppressed(skill){return Date.now()<Number(normalizeAutoResourceRetryState()[getAutoResourceRetryKey(skill)]||0);}
function suppressAutoSkillForResource(skill,block,options={}){
  if(!player||!skill||!block)return 0;
  const state=normalizeAutoResourceRetryState(),key=getAutoResourceRetryKey(skill),now=Date.now(),previous=Number(state[key]||0);
  const until=now+Math.max(1000,Number(block.retryMs||AUTO_RESOURCE_RETRY_MS));
  state[key]=Math.max(previous,until);
  if(previous<=now&&options.silent!==true&&typeof addBattleLog==="function")addBattleLog(`${skill.name}：${block.label||"戰鬥資源"}不足，15 秒內改用普通攻擊，之後再嘗試。`);
  return state[key];
}
function handleAutoSkillResourceBlock(skill,check,options={}){
  if(!check?.resourceBlock)return false;
  suppressAutoSkillForResource(skill,check.resourceBlock,options);
  return true;
}

function tryAutoHeal() {
  const cfg = player.autoCombat?.heal;
  if (!cfg?.enabled || !cfg.skillId) return false;
  if (getPercent(player.hp, player.maxHp) > Number(cfg.hpPercent || 60)) return false;
  if (!shouldCastBySp(cfg.spPercent || 20)) return false;

  const skill = getSkillDataById(cfg.skillId);
  if (!skill || (typeof getRuntimeSkillUiType === "function" ? getRuntimeSkillUiType(skill) !== "heal" : skill.skillType !== "heal") || isAutoSkillResourceSuppressed(skill)) return false;
  const level = Number(cfg.level || getSkillLevel(skill.id) || 1);
  const precheck=typeof canCastSkill==="function"?canCastSkill(skill,level):{ok:true};
  if(!precheck.ok){handleAutoSkillResourceBlock(skill,precheck);return false;}
  const timing = typeof getRuntimeAdjustedCastTime === "function" ? getRuntimeAdjustedCastTime(skill, level) : { totalMs: 0 };
  if (Number(timing?.totalMs || 0) > 0 && typeof beginRuntimeSkillCast === "function") {
    return beginRuntimeSkillCast(skill, level, () => castHealSkill(skill, level));
  }
  return castHealSkill(skill, level);
}


function tryAutoBuffs() {
  const cfg = player.autoCombat?.buffs || {};
  normalizeActiveBuffs();

  for (const skill of getLearnedSkillsByType("buff")) {
    const profile = typeof getSkillRuntimeProfile === "function" ? (getSkillRuntimeProfile(skill) || {}) : {};
    if (profile.performanceAction) continue;
    const key = typeof getSkillStorageKey === "function" ? getSkillStorageKey(skill) : String(skill.officialId ?? skill.id);
    const rawSetting = cfg[key] ?? cfg[skill.id];
    const setting = rawSetting && typeof rawSetting === "object"
      ? rawSetting
      : { enabled: Boolean(rawSetting), spPercent: 0 };
    if (!setting.enabled) continue;
    if (isAutoSkillResourceSuppressed(skill)) continue;
    if (!shouldCastBySp(setting.spPercent || 0)) continue;

    const current = player.activeBuffs?.[key] || player.activeBuffs?.[skill.id];
    const remaining = current ? Number(current.expiresAt || 0) - Date.now() : 0;
    if (remaining > 3000) continue;
    const level = Number(getSkillLevel(skill.id) || 1);
    const precheck=typeof canCastSkill==="function"?canCastSkill(skill,level):{ok:true};
    if(!precheck.ok){handleAutoSkillResourceBlock(skill,precheck);continue;}
    const timing = typeof getRuntimeAdjustedCastTime === "function" ? getRuntimeAdjustedCastTime(skill, level) : { totalMs: 0 };
    if (Number(timing?.totalMs || 0) > 0 && typeof beginRuntimeSkillCast === "function") {
      return beginRuntimeSkillCast(skill, level, () => castBuffSkill(skill, level, { silent: false }));
    }
    if (castBuffSkill(skill, level, { silent: false })) return true;
  }

  return false;
}

const AUTO_BATTLE_STATES = Object.freeze({
  IDLE: "IDLE",
  SEARCHING: "SEARCHING",
  APPROACHING: "APPROACHING",
  COMBAT: "COMBAT",
  UTILITY: "UTILITY",
  TARGET_DEFEATED: "TARGET_DEFEATED",
  TELEPORTING: "TELEPORTING"
});

const AUTO_BATTLE_CONTROLLER = {
  state: AUTO_BATTLE_STATES.IDLE,
  target: null,
  forcedTarget: null,
  targetLockedAt: 0,
  noTargetSince: 0,
  lastTargetChangeAt: 0,
  lastThreatScanAt: 0,
  threatScanIntervalMs: 100,
  lastAction: null,
  lastReason: null,
  lastTeleportAt: 0,
  lastAvoidTeleportAt: 0,
  lastLowHpTeleportAt: 0,
  lastButterflyAt: 0,
  lastElementWarningAt: 0,
  ignoredTarget: null,
  ignoredTargetUntil: 0,
  reacquireSuppressedUntil: 0,
  teleportGeneration: 0,
  manualOverrideUntil: 0,
  attackRotationCursor: 0
};

function resetAutoBattleController(options = {}) {
  AUTO_BATTLE_CONTROLLER.state = options.running ? AUTO_BATTLE_STATES.SEARCHING : AUTO_BATTLE_STATES.IDLE;
  AUTO_BATTLE_CONTROLLER.target = options.keepTarget && isAutoBattleTargetValid(currentMonster) ? currentMonster : null;
  AUTO_BATTLE_CONTROLLER.forcedTarget = null;
  AUTO_BATTLE_CONTROLLER.targetLockedAt = AUTO_BATTLE_CONTROLLER.target ? Date.now() : 0;
  AUTO_BATTLE_CONTROLLER.noTargetSince = 0;
  AUTO_BATTLE_CONTROLLER.lastTargetChangeAt = 0;
  AUTO_BATTLE_CONTROLLER.lastThreatScanAt = 0;
  AUTO_BATTLE_CONTROLLER.lastAction = null;
  AUTO_BATTLE_CONTROLLER.lastReason = options.reason || null;
  AUTO_BATTLE_CONTROLLER.lastAvoidTeleportAt = 0;
  AUTO_BATTLE_CONTROLLER.lastLowHpTeleportAt = 0;
  AUTO_BATTLE_CONTROLLER.lastButterflyAt = 0;
  AUTO_BATTLE_CONTROLLER.lastElementWarningAt = 0;
  AUTO_BATTLE_CONTROLLER.ignoredTarget = null;
  AUTO_BATTLE_CONTROLLER.ignoredTargetUntil = 0;
  AUTO_BATTLE_CONTROLLER.reacquireSuppressedUntil = 0;
  AUTO_BATTLE_CONTROLLER.manualOverrideUntil = 0;
  AUTO_BATTLE_CONTROLLER.attackRotationCursor = 0;
  // teleportGeneration intentionally survives ordinary start/stop resets.
  // It identifies the monster instance invalidated by the latest teleport.
  AUTO_BATTLE_CONTROLLER.teleportGeneration = Math.max(0, Number(AUTO_BATTLE_CONTROLLER.teleportGeneration || 0));
  if (typeof resetAutoNoTargetTimer === "function") resetAutoNoTargetTimer();
  return AUTO_BATTLE_CONTROLLER;
}

function setAutoBattleControllerState(state, details = {}) {
  const next = Object.values(AUTO_BATTLE_STATES).includes(state) ? state : AUTO_BATTLE_STATES.IDLE;
  AUTO_BATTLE_CONTROLLER.state = next;
  AUTO_BATTLE_CONTROLLER.lastAction = details.action || AUTO_BATTLE_CONTROLLER.lastAction;
  AUTO_BATTLE_CONTROLLER.lastReason = details.reason || null;
  if (player && details.syncPlayerState !== false) {
    if (next === AUTO_BATTLE_STATES.SEARCHING) player.state = "Searching";
    else if (next === AUTO_BATTLE_STATES.APPROACHING) player.state = "Approaching";
    else if (next === AUTO_BATTLE_STATES.COMBAT) player.state = "Attacking";
  }
  return next;
}

function isAutoBattleTargetValid(monster) {
  if (!monster || monster._deathHandled || monster._defeatResolutionQueued) return false;
  const now = Date.now();
  if (now < Number(monster._autoBattleIgnoreUntil || 0)) return false;
  if (AUTO_BATTLE_CONTROLLER.ignoredTarget === monster && now < Number(AUTO_BATTLE_CONTROLLER.ignoredTargetUntil || 0)) return false;
  // The monster locked before the latest teleport may still exist in the streamed
  // entity array.  Reject that exact instance until the player explicitly clicks it.
  if (Number(monster._autoBattleBlockedTeleportGeneration || -1) === Number(AUTO_BATTLE_CONTROLLER.teleportGeneration || 0)) return false;
  if (Number(monster.currentHp ?? monster.hp ?? 0) <= 0) return false;
  if (player?.currentCity) return false;
  if (!isAutoBattleMonsterAllowed(monster)) return false;
  return true;
}

function getAutoBattleTargetDistance(monster) {
  if (!monster) return Number.POSITIVE_INFINITY;
  if (typeof getCurrentDistanceToMonster === "function") {
    const value = Number(getCurrentDistanceToMonster(monster));
    if (Number.isFinite(value)) return value;
  }
  const playerPos = player?.position || { x: 0, y: 0 };
  const monsterPos = monster.position || { x: monster.worldX || 0, y: monster.worldY || 0 };
  return Math.hypot(Number(monsterPos.x || 0) - Number(playerPos.x || 0), Number(monsterPos.y || 0) - Number(playerPos.y || 0));
}

function isMonsterActivelyAttackingPlayer(monster) {
  if (!isAutoBattleTargetValid(monster)) return false;
  return String(monster.aiState || "").toUpperCase() === "ATTACK";
}

function isMonsterThreateningPlayer(monster) {
  if (!isAutoBattleTargetValid(monster)) return false;
  const state = String(monster.aiState || "").toUpperCase();
  if (["ATTACK", "CHASE", "RUSH", "ANGRY"].includes(state)) return true;
  if (monster.provoked === true || monster._aggroReason) return true;
  return false;
}

function collectAutoBattleTargets() {
  const candidates = typeof collectLiveCombatEnemies === "function"
    ? collectLiveCombatEnemies({ activeOnly: true })
    : (typeof getLivingWorldMonsterTestEntities === "function" ? getLivingWorldMonsterTestEntities({ activeOnly: true }) : []);
  return [...new Set((candidates || []).filter(isAutoBattleTargetValid))];
}

function applyAutoBattleTarget(monster, options = {}) {
  if (!isAutoBattleTargetValid(monster)) return null;
  const changed = currentMonster !== monster;
  if (monster._worldTestEntity && typeof selectWorldMonsterTestTarget === "function") {
    selectWorldMonsterTestTarget(monster, { announce: false, attacking: true });
  } else {
    currentMonster = monster;
    if (player) player.state = "Attacking";
    if (typeof updateMonsterUI === "function") updateMonsterUI();
  }
  AUTO_BATTLE_CONTROLLER.target = monster;
  AUTO_BATTLE_CONTROLLER.targetLockedAt = changed ? Date.now() : Number(AUTO_BATTLE_CONTROLLER.targetLockedAt || Date.now());
  AUTO_BATTLE_CONTROLLER.lastTargetChangeAt = changed ? Date.now() : AUTO_BATTLE_CONTROLLER.lastTargetChangeAt;
  AUTO_BATTLE_CONTROLLER.noTargetSince = 0;
  if (typeof resetAutoNoTargetTimer === "function") resetAutoNoTargetTimer();
  if (options.forced) AUTO_BATTLE_CONTROLLER.forcedTarget = monster;
  if (changed && options.announce && typeof addBattleLog === "function") addBattleLog(`鎖定目標：${monster.name || "怪物"}。`);
  return monster;
}

function forceAutoBattleTarget(monster, options = {}) {
  if (!monster || Number(monster.currentHp ?? monster.hp ?? 0) <= 0 || monster._deathHandled) return false;
  if (options.manual === true) {
    // A deliberate click is authoritative and may re-select a monster that was
    // automatically invalidated by teleport.
    monster._autoBattleBlockedTeleportGeneration = -1;
    monster._autoBattleIgnoreUntil = 0;
    AUTO_BATTLE_CONTROLLER.ignoredTarget = AUTO_BATTLE_CONTROLLER.ignoredTarget === monster ? null : AUTO_BATTLE_CONTROLLER.ignoredTarget;
    if (!AUTO_BATTLE_CONTROLLER.ignoredTarget) AUTO_BATTLE_CONTROLLER.ignoredTargetUntil = 0;
    AUTO_BATTLE_CONTROLLER.manualOverrideUntil = Date.now() + Math.max(1500, Number(options.priorityMs || 12000));
  }
  if (!isAutoBattleTargetValid(monster)) return false;
  AUTO_BATTLE_CONTROLLER.forcedTarget = monster;
  applyAutoBattleTarget(monster, { forced: true, announce: options.announce === true });
  setAutoBattleControllerState(AUTO_BATTLE_STATES.COMBAT, { reason: options.manual === true ? "manual_force_target" : "forced_target" });
  return true;
}

function clearAutoBattleTarget(options = {}) {
  const previous = currentMonster || AUTO_BATTLE_CONTROLLER.target;
  if (options.onlyIf && previous !== options.onlyIf) return false;
  if (options.keepForced !== true) AUTO_BATTLE_CONTROLLER.forcedTarget = null;
  AUTO_BATTLE_CONTROLLER.target = null;
  AUTO_BATTLE_CONTROLLER.targetLockedAt = 0;
  AUTO_BATTLE_CONTROLLER.lastTargetChangeAt = Date.now();
  AUTO_BATTLE_CONTROLLER.noTargetSince = Date.now();
  if (Number(options.suppressMs || 0) > 0) {
    AUTO_BATTLE_CONTROLLER.reacquireSuppressedUntil = Math.max(
      Number(AUTO_BATTLE_CONTROLLER.reacquireSuppressedUntil || 0),
      Date.now() + Number(options.suppressMs || 0)
    );
  }
  if (options.clearCurrent !== false) currentMonster = null;
  if (typeof document !== "undefined") {
    document.querySelectorAll?.(".world-monster-entity.is-selected").forEach(el => el.classList.remove("is-selected"));
  }
  if (typeof updateMonsterUI === "function" && options.updateUi !== false) updateMonsterUI();
  setAutoBattleControllerState(AUTO_BATTLE_STATES.SEARCHING, { reason: options.reason || "target_cleared" });
  return true;
}

// 0.9.82FM：瞬移完成後清除舊鎖定，避免角色走回原位置追打上一隻怪物。
function onAutoBattleTeleportCompleted(previousTarget = currentMonster, details = {}) {
  const oldTarget = previousTarget || currentMonster || AUTO_BATTLE_CONTROLLER.target || null;
  const now = Date.now();
  AUTO_BATTLE_CONTROLLER.teleportGeneration = Number(AUTO_BATTLE_CONTROLLER.teleportGeneration || 0) + 1;
  if (oldTarget) {
    AUTO_BATTLE_CONTROLLER.ignoredTarget = oldTarget;
    AUTO_BATTLE_CONTROLLER.ignoredTargetUntil = now + Math.max(5000, Number(details.ignoreMs || 15000));
    oldTarget._autoBattleIgnoreUntil = AUTO_BATTLE_CONTROLLER.ignoredTargetUntil;
    oldTarget._autoBattleBlockedTeleportGeneration = AUTO_BATTLE_CONTROLLER.teleportGeneration;
  }
  AUTO_BATTLE_CONTROLLER.target = null;
  AUTO_BATTLE_CONTROLLER.forcedTarget = null;
  AUTO_BATTLE_CONTROLLER.targetLockedAt = 0;
  AUTO_BATTLE_CONTROLLER.noTargetSince = now;
  AUTO_BATTLE_CONTROLLER.lastTeleportAt = now;
  AUTO_BATTLE_CONTROLLER.manualOverrideUntil = 0;
  AUTO_BATTLE_CONTROLLER.reacquireSuppressedUntil = now + Math.max(280, Number(details.suppressMs || 420));
  currentMonster = null;
  if (typeof stopManualMonsterAttack === "function") stopManualMonsterAttack({ clearTarget: false, silent: true });
  if (typeof clearRuntimeSkillCast === "function") clearRuntimeSkillCast("teleport");
  if (player?.position) {
    player.position.targetX = null;
    player.position.targetY = null;
  }
  if (typeof document !== "undefined") document.querySelectorAll?.(".world-monster-entity.is-selected").forEach(el => el.classList.remove("is-selected"));
  if (typeof updateMonsterUI === "function") updateMonsterUI();
  setAutoBattleControllerState(AUTO_BATTLE_STATES.TELEPORTING, { action:details.source || "teleport", reason:"teleport_target_reset" });
  if (typeof resetAutoNoTargetTimer === "function") resetAutoNoTargetTimer();
  return true;
}
window.onAutoBattleTeleportCompleted = onAutoBattleTeleportCompleted;

function acquireAutoBattleTarget(options = {}) {
  const now = Date.now();
  if (now < Number(AUTO_BATTLE_CONTROLLER.reacquireSuppressedUntil || 0)) return null;
  if (AUTO_BATTLE_CONTROLLER.ignoredTarget && now >= Number(AUTO_BATTLE_CONTROLLER.ignoredTargetUntil || 0)) {
    AUTO_BATTLE_CONTROLLER.ignoredTarget = null;
    AUTO_BATTLE_CONTROLLER.ignoredTargetUntil = 0;
  }
  if (currentMonster && !isAutoBattleTargetValid(currentMonster)) currentMonster = null;
  if (isAutoBattleTargetValid(AUTO_BATTLE_CONTROLLER.forcedTarget)) {
    return applyAutoBattleTarget(AUTO_BATTLE_CONTROLLER.forcedTarget, { forced: true });
  }
  AUTO_BATTLE_CONTROLLER.forcedTarget = null;

  const current = isAutoBattleTargetValid(currentMonster)
    ? currentMonster
    : (isAutoBattleTargetValid(AUTO_BATTLE_CONTROLLER.target) ? AUTO_BATTLE_CONTROLLER.target : null);
  const scanInterval = Math.max(40, Number(AUTO_BATTLE_CONTROLLER.threatScanIntervalMs || 100));
  if (current && now - Number(AUTO_BATTLE_CONTROLLER.lastThreatScanAt || 0) < scanInterval) {
    return applyAutoBattleTarget(current);
  }
  const candidates = collectAutoBattleTargets();
  AUTO_BATTLE_CONTROLLER.lastThreatScanAt = now;

  // FO target authority: manual target > still-valid current lock > attacker >
  // another threat > nearest.  A valid current target must never be replaced just
  // because another monster became slightly closer or started attacking.
  if (current) return applyAutoBattleTarget(current);
  const activeAttackers = candidates.filter(isMonsterActivelyAttackingPlayer).sort((a, b) => getAutoBattleTargetDistance(a) - getAutoBattleTargetDistance(b));
  if (activeAttackers.length) return applyAutoBattleTarget(activeAttackers[0]);
  const threats = candidates.filter(isMonsterThreateningPlayer).sort((a, b) => getAutoBattleTargetDistance(a) - getAutoBattleTargetDistance(b));
  if (threats.length) return applyAutoBattleTarget(threats[0]);

  const nearest = candidates.sort((a, b) => getAutoBattleTargetDistance(a) - getAutoBattleTargetDistance(b))[0] || null;
  if (nearest) return applyAutoBattleTarget(nearest, { announce: options.announce === true });

  AUTO_BATTLE_CONTROLLER.target = null;
  if (!AUTO_BATTLE_CONTROLLER.noTargetSince) AUTO_BATTLE_CONTROLLER.noTargetSince = Date.now();
  setAutoBattleControllerState(AUTO_BATTLE_STATES.SEARCHING, { reason: options.reason || "no_target" });
  return null;
}

function noteAutoBattleTargetDefeated(monster) {
  if (AUTO_BATTLE_CONTROLLER.forcedTarget === monster) AUTO_BATTLE_CONTROLLER.forcedTarget = null;
  if (AUTO_BATTLE_CONTROLLER.target === monster) AUTO_BATTLE_CONTROLLER.target = null;
  AUTO_BATTLE_CONTROLLER.noTargetSince = Date.now();
  setAutoBattleControllerState(AUTO_BATTLE_STATES.TARGET_DEFEATED, { reason: "target_defeated" });
  return true;
}

function runAutoCombatUtilityTick() {
  if (!player) return { action: "none" };
  syncAutoCombatSettingsFromUI({ save: false });
  normalizeAutoCombatSettings();

  const emergencyEscape = tryAutoEmergencyEscape();
  if (emergencyEscape) {
    if (emergencyEscape === "fly") autoUsePotion();
    setAutoBattleControllerState(AUTO_BATTLE_STATES.UTILITY, { action: emergencyEscape, reason: "low_hp_escape" });
    return { action: "utility", utility: emergencyEscape };
  }

  autoUsePotion();
  if (tryAutoStatusCure()) {
    setAutoBattleControllerState(AUTO_BATTLE_STATES.UTILITY, { action: "status_cure", reason: "auto_status_cure" });
    return { action: "utility", utility: "status_cure" };
  }
  if (tryAutoElementEndow()) {
    setAutoBattleControllerState(AUTO_BATTLE_STATES.UTILITY, { action: "element_endow", reason: "auto_element_converter" });
    return { action: "utility", utility: "element_endow" };
  }
  if (tryAutoCashFood()) {
    setAutoBattleControllerState(AUTO_BATTLE_STATES.UTILITY, { action: "cash_food", reason: "auto_cash_food" });
    return { action: "utility", utility: "cash_food" };
  }
  if (typeof isRuntimeSkillCasting === "function" && isRuntimeSkillCasting()) {
    setAutoBattleControllerState(AUTO_BATTLE_STATES.UTILITY, { action: "casting", reason: "runtime_cast" });
    return { action: "utility", casting: true };
  }

  const active = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
  if (Number(active.blocksNormalAttack || 0) > 0) {
    setAutoBattleControllerState(AUTO_BATTLE_STATES.UTILITY, { action: "status_wait", reason: "blocks_normal_attack" });
  }
  if (typeof isPlayerActiveSkillLocked === "function" && isPlayerActiveSkillLocked()) {
    return { action: "none", activeSkillLocked: true };
  }
  if (tryAutoHeal()) {
    setAutoBattleControllerState(AUTO_BATTLE_STATES.UTILITY, { action: "heal", reason: "auto_heal" });
    return { action: "utility", utility: "heal" };
  }
  if (tryAutoBuffs()) {
    setAutoBattleControllerState(AUTO_BATTLE_STATES.UTILITY, { action: "buff", reason: "auto_buff" });
    return { action: "utility", utility: "buff" };
  }
  return { action: "none" };
}


function resolveAutoBattleLevelValue(value, level, fallback = 0) {
  if (Array.isArray(value)) return Number(value[Math.max(0, Number(level || 1) - 1)] ?? value[value.length - 1] ?? fallback);
  if (value && typeof value === "object") return Number(value[level] ?? value[String(level)] ?? value.default ?? fallback);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getAutoBattleSkillTargetCount(skill, level, primaryTarget = currentMonster) {
  if (!skill || !isAutoBattleTargetValid(primaryTarget)) return 0;
  const profile = typeof getSkillRuntimeProfile === "function" ? (getSkillRuntimeProfile(skill) || {}) : {};

  if (typeof resolveRuntimeSkillTargets === "function") {
    try {
      const targets = resolveRuntimeSkillTargets(profile, primaryTarget, level, skill) || [];
      return [...new Set(targets.filter(isAutoBattleTargetValid))].length;
    } catch (_) {}
  }

  const targeting = typeof getRuntimeEffectiveTargeting === "function"
    ? (getRuntimeEffectiveTargeting(skill, profile, level) || {})
    : (profile.targeting || profile.area || {});
  const radiusCells = Math.max(0, resolveAutoBattleLevelValue(
    targeting.radius ?? targeting.rangeCells ?? profile.splashRange ?? skill.splashArea,
    level,
    0
  ));
  if (radiusCells <= 0) return 1;

  const origin = String(targeting.origin || "").toLowerCase() === "self" ? player : primaryTarget;
  const candidates = collectAutoBattleTargets();
  if (window.AreaShapeResolver?.inRange) {
    return candidates.filter(monster => window.AreaShapeResolver.inRange(
      origin,
      monster,
      targeting.shape || "circle",
      radiusCells,
      {
        widthCells: Number(targeting.widthCells || 1),
        halfAngleRadians: Number(targeting.halfAngleRadians || Math.PI / 4),
        directionTarget: primaryTarget
      }
    )).length;
  }

  const cell = Math.max(1, Number(window.RO_WEB_CELL_SIZE || 36));
  const ox = Number(origin?.position?.x ?? origin?.worldX ?? origin?.x ?? 0);
  const oy = Number(origin?.position?.y ?? origin?.worldY ?? origin?.y ?? 0);
  const radiusPx = radiusCells * cell;
  return candidates.filter(monster => {
    const mx = Number(monster?.position?.x ?? monster?.worldX ?? monster?.x ?? 0);
    const my = Number(monster?.position?.y ?? monster?.worldY ?? monster?.y ?? 0);
    return Math.hypot(mx - ox, my - oy) <= radiusPx;
  }).length;
}

function getAutoBattleMonsterClass(monster) {
  const category = String(monster?._category || monster?.category || "").toLowerCase();
  if (category === "mvp" || monster?.isMvp === true || monster?.isMVP === true || monster?.mvp === true) return "mvp";
  if (category === "boss" || monster?.isBoss === true || monster?.boss === true || String(monster?.class || monster?.Class || "").toLowerCase() === "boss") return "boss";
  return "normal";
}

function maybeAutoEscapeFromTarget(monster) {
  if (!player || !isAutoBattleTargetValid(monster)) return false;
  normalizeAutoCombatSettings();
  const monsterClass = getAutoBattleMonsterClass(monster);
  const teleport = player.autoCombat.teleport || {};
  const shouldEscape = monsterClass === "mvp" ? teleport.avoidMvp === true : monsterClass === "boss" && teleport.avoidBoss === true;
  if (!shouldEscape) return false;

  const now = Date.now();
  if (now - Number(AUTO_BATTLE_CONTROLLER.lastAvoidTeleportAt || 0) < 1000) return false;
  AUTO_BATTLE_CONTROLLER.lastAvoidTeleportAt = now;
  setAutoBattleControllerState(AUTO_BATTLE_STATES.TELEPORTING, {
    action: "avoid_boss",
    reason: monsterClass === "mvp" ? "avoid_mvp" : "avoid_boss"
  });

  const used = typeof useFlyWing === "function" ? useFlyWing({ silent: false }) : false;
  if (!used) return false;

  clearAutoBattleTarget({ reason: monsterClass === "mvp" ? "escaped_mvp" : "escaped_boss" });
  AUTO_BATTLE_CONTROLLER.lastTeleportAt = Date.now();
  if (typeof maintainWorldMonsterPopulation === "function") maintainWorldMonsterPopulation(Date.now(), { initial: false });
  if (typeof acquireAutoBattleTarget === "function") acquireAutoBattleTarget({ reason: "boss_escape_reacquire" });
  if (typeof scheduleAutoBattleTick === "function" && typeof isAutoBattleRunning === "function" && isAutoBattleRunning()) {
    scheduleAutoBattleTick(8);
  }
  return true;
}


const AUTO_SKILL_PREREQUISITE_BY_STATUS = Object.freeze({
  servantsign: Object.freeze({ skillId: 5203, handler: "debuff", label: "死侍武器-標記" })
});

function normalizeAutoPrerequisiteStatusKey(status) {
  return String(status || "").toLowerCase().replace(/[ _-]/g, "");
}

function autoTargetHasRuntimeStatus(target, status) {
  if (!target || !status) return false;
  if (window.StatusManager?.has) return Boolean(window.StatusManager.has(target, status));
  if (typeof targetHasRuntimeStatus === "function") return Boolean(targetHasRuntimeStatus(target, status));
  const key = normalizeAutoPrerequisiteStatusKey(status);
  return Boolean(target?.runtimeState?.statuses?.[key] || target?.runtimeState?.[status] || target?.runtimeState?.[key]);
}

function resolveAutoSkillPrerequisite(skill, level, target = currentMonster) {
  if (!skill || !target) return null;
  const profile = typeof getSkillRuntimeProfile === "function" ? (getSkillRuntimeProfile(skill) || {}) : {};
  const requiredStatus = String(profile.requiresTargetStatus || "");
  if (!requiredStatus || autoTargetHasRuntimeStatus(target, requiredStatus)) return null;

  const fallback = AUTO_SKILL_PREREQUISITE_BY_STATUS[normalizeAutoPrerequisiteStatusKey(requiredStatus)] || null;
  const prerequisiteSkillId = Number(profile.autoPrerequisiteSkillId || fallback?.skillId || 0);
  if (!prerequisiteSkillId) return { required: true, available: false, reason: "no_resolver", requiredStatus };

  const prerequisiteSkill = typeof getSkillDataById === "function" ? getSkillDataById(prerequisiteSkillId) : null;
  const learnedLevel = prerequisiteSkill && typeof getSkillLevel === "function" ? Number(getSkillLevel(prerequisiteSkill.id) || 0) : 0;
  if (!prerequisiteSkill || learnedLevel <= 0 || isAutoSkillResourceSuppressed(prerequisiteSkill)) {
    return { required: true, available: false, reason: "not_learned", requiredStatus, skill: prerequisiteSkill };
  }

  const prerequisiteProfile = typeof getSkillRuntimeProfile === "function" ? (getSkillRuntimeProfile(prerequisiteSkill) || {}) : {};
  const prerequisiteCheck = typeof canCastSkill === "function" ? canCastSkill(prerequisiteSkill, learnedLevel) : { ok: true, level: learnedLevel };
  if (!prerequisiteCheck.ok) {
    if (prerequisiteCheck.resourceBlock) handleAutoSkillResourceBlock(prerequisiteSkill, prerequisiteCheck, { silent: true });
    return { required: true, available: false, reason: prerequisiteCheck.reason || "blocked", requiredStatus, skill: prerequisiteSkill, check: prerequisiteCheck };
  }

  // Auto-combo should not spend the final servant on Sign and leave the follow-up with zero useful hits.
  const parentResource = profile.resourceCost;
  const prerequisiteResource = prerequisiteProfile.resourceCost;
  if (parentResource?.type && parentResource.type === prerequisiteResource?.type && window.CombatResourceManager?.get) {
    const current = Math.max(0, Number(window.CombatResourceManager.get(parentResource.type) || 0));
    const prerequisiteCost = Math.max(0, Number(typeof getLevelValue === "function" ? getLevelValue(prerequisiteResource.amount, prerequisiteCheck.level, 1) : prerequisiteResource.amount || 1));
    const reserve = Math.max(0, Number(profile.autoPrerequisiteMinimumRemainingResource ?? parentResource.minimum ?? 0));
    if (current < prerequisiteCost + reserve) {
      return { required: true, available: false, reason: "combined_resource", requiredStatus, skill: prerequisiteSkill, current, requiredResource: prerequisiteCost + reserve };
    }
  }

  return {
    required: true,
    available: true,
    requiredStatus,
    skill: prerequisiteSkill,
    level: Number(prerequisiteCheck.level || learnedLevel),
    handler: prerequisiteProfile.handler || fallback?.handler || "debuff"
  };
}

function castAutoSkillPrerequisite(action) {
  const skill = action?.skill;
  const level = Number(action?.level || 1);
  if (!skill) return false;
  const handler = String(action?.handler || (typeof getSkillRuntimeProfile === "function" ? getSkillRuntimeProfile(skill)?.handler : "") || "");
  if (handler === "debuff" && typeof castDebuffSkill === "function") return Boolean(castDebuffSkill(skill, level));
  if (handler === "ground_debuff" && typeof castGroundDebuffSkill === "function") return Boolean(castGroundDebuffSkill(skill, level));
  if (handler === "timed_status" && typeof castTimedStatusSkill === "function") return Boolean(castTimedStatusSkill(skill, level));
  if (handler === "buff" && typeof castBuffSkill === "function") return Boolean(castBuffSkill(skill, level, { source: "auto_battle_prerequisite" }));
  return false;
}

function hasAutoSkillMinimumUsefulResource(profile, level = 1) {
  const cfg = profile?.resourceCost;
  if (!cfg?.type || !window.CombatResourceManager?.get) return true;
  const resourceDrivenHits = profile.damageHitCount === "consumed_resource" || profile.visualHitCount === "consumed_resource";
  if (!resourceDrivenHits) return true;
  const current = Math.max(0, Number(window.CombatResourceManager.get(cfg.type) || 0));
  const configuredMinimum = Math.max(0, Number(typeof getLevelValue === "function" ? getLevelValue(cfg.minimum, level, 0) : cfg.minimum || 0));
  return current >= Math.max(1, configuredMinimum);
}

function getAutoAttackSkill(monster = currentMonster) {
  normalizeAutoCombatSettings();
  const slots = player.autoCombat?.attacks || [];
  let earliestCooldown = null;
  const slotCount = Math.max(1, slots.length);
  const startIndex = ((Number(AUTO_BATTLE_CONTROLLER.attackRotationCursor || 0) % slotCount) + slotCount) % slotCount;

  for (let offset = 0; offset < slots.length; offset += 1) {
    const index = (startIndex + offset) % slots.length;
    const cfg = slots[index];
    if (!cfg?.enabled || !cfg.skillId) continue;
    if (!shouldCastBySp(cfg.spPercent || 0)) continue;

    const skill = getSkillDataById(cfg.skillId);
    if (!skill || (typeof getRuntimeSkillUiType === "function" ? getRuntimeSkillUiType(skill) !== "attack" : skill.skillType !== "attack")) continue;
    if (isAutoSkillResourceSuppressed(skill)) continue;

    const level = Number(cfg.level || getSkillLevel(skill.id) || 1);
    const runtimeProfile = typeof getSkillRuntimeProfile === "function" ? (getSkillRuntimeProfile(skill) || {}) : {};
    if (!hasAutoSkillMinimumUsefulResource(runtimeProfile, level)) continue;
    const targetCount = getAutoBattleSkillTargetCount(skill, level, monster);
    const minMonsters = Math.max(1, Number(cfg.minMonsters || 1));
    if (targetCount < minMonsters) continue;

    const check = canCastSkill(skill, level);
    if (check.ok) {
      const prerequisite = resolveAutoSkillPrerequisite(skill, check.level, monster);
      if (prerequisite?.required) {
        if (!prerequisite.available) continue;
        return {
          skill: prerequisite.skill,
          level: prerequisite.level,
          handler: prerequisite.handler,
          blocked: false,
          prerequisite: true,
          prerequisiteForSkill: skill,
          prerequisiteForLevel: check.level,
          prerequisiteStatus: prerequisite.requiredStatus,
          fallbackNormal: player.autoCombat.normalAttack?.enabled !== false && cfg.fallbackNormal !== false,
          slotIndex: index,
          targetCount,
          minMonsters
        };
      }
      return {
        skill,
        level: check.level,
        blocked: false,
        fallbackNormal: player.autoCombat.normalAttack?.enabled !== false && cfg.fallbackNormal !== false,
        slotIndex: index,
        targetCount,
        minMonsters
      };
    }

    if (handleAutoSkillResourceBlock(skill, check)) continue;
    if (!check.delayBlock) continue;
    const blockedChoice = {
      skill,
      level,
      blocked: true,
      delayBlock: check.delayBlock,
      fallbackNormal: player.autoCombat.normalAttack?.enabled !== false && cfg.fallbackNormal !== false,
      slotIndex: index,
      targetCount,
      minMonsters
    };

    // Independent cooldown on a higher-priority slot may fall through to
    // the next configured skill. Global / after-cast / action locks may not.
    if (check.delayBlock.type === "cooldown") {
      if (!earliestCooldown || Number(check.delayBlock.remainingMs || Infinity) < Number(earliestCooldown.delayBlock?.remainingMs || Infinity)) {
        earliestCooldown = blockedChoice;
      }
      continue;
    }
    return blockedChoice;
  }

  return earliestCooldown;
}

function commitAutoAttackSkillRotation(slotIndex) {
  const slots = player?.autoCombat?.attacks || [];
  if (!slots.length) { AUTO_BATTLE_CONTROLLER.attackRotationCursor = 0; return 0; }
  const index = Math.max(0, Number(slotIndex || 0));
  AUTO_BATTLE_CONTROLLER.attackRotationCursor = (index + 1) % slots.length;
  return AUTO_BATTLE_CONTROLLER.attackRotationCursor;
}


function getAutoCombatAttackAction(monster) {
  if (!player || !isAutoBattleTargetValid(monster)) return { action: "search" };
  const active = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
  if (Number(active.blocksNormalAttack || 0) > 0) return { action: "utility", blockedByStatus: true };

  normalizeAutoCombatSettings();
  const normalEnabled = player.autoCombat.normalAttack?.enabled !== false;
  const attack = getAutoAttackSkill(monster);

  if (attack?.blocked) {
    const independentCooldown = attack.delayBlock?.type === "cooldown";
    if (normalEnabled && attack.fallbackNormal && independentCooldown) {
      return { action: "normal", fallbackFromSkill: true, skill: attack.skill, level: attack.level, delayBlock: attack.delayBlock };
    }
    return { action: "utility", waitForSkill: true, skill: attack.skill, level: attack.level, delayBlock: attack.delayBlock };
  }
  if (attack?.prerequisite) return { action: "prerequisiteSkill", ...attack };
  if (attack) return { action: "attackSkill", ...attack };
  if (normalEnabled) return { action: "normal" };
  return { action: "utility", waitForConfiguredAction: true };
}

function runAutoCombatTick(monster, options = {}) {
  if (!player) return { action: "normal" };
  if (options.skipUtility !== true) {
    const utility = runAutoCombatUtilityTick();
    if (utility.action === "utility") return utility;
  }
  return getAutoCombatAttackAction(monster);
}

window.AUTO_BATTLE_STATES = AUTO_BATTLE_STATES;
window.AUTO_BATTLE_CONTROLLER = AUTO_BATTLE_CONTROLLER;
window.resetAutoBattleController = resetAutoBattleController;
window.setAutoBattleControllerState = setAutoBattleControllerState;
window.isAutoBattleTargetValid = isAutoBattleTargetValid;
window.isMonsterActivelyAttackingPlayer = isMonsterActivelyAttackingPlayer;
window.isMonsterThreateningPlayer = isMonsterThreateningPlayer;
window.collectAutoBattleTargets = collectAutoBattleTargets;
window.applyAutoBattleTarget = applyAutoBattleTarget;
window.forceAutoBattleTarget = forceAutoBattleTarget;
window.clearAutoBattleTarget = clearAutoBattleTarget;
window.acquireAutoBattleTarget = acquireAutoBattleTarget;
window.noteAutoBattleTargetDefeated = noteAutoBattleTargetDefeated;
window.runAutoCombatUtilityTick = runAutoCombatUtilityTick;
window.getItemRecoveryProfile = getItemRecoveryProfile;
window.getItemRecoveryValue = getItemRecoveryValue;
window.normalizeAutoStatusKey = normalizeAutoStatusKey;
window.getPlayerActiveStatusKeys = getPlayerActiveStatusKeys;
window.getItemStatusCureProfile = getItemStatusCureProfile;
window.getMatchedStatusCureKeys = getMatchedStatusCureKeys;
window.isAutoStatusCureItem = isAutoStatusCureItem;
window.isAutoDetoxItem = isAutoDetoxItem;
window.clearPlayerStatuses = clearPlayerStatuses;
window.getAutoStatusLabelList = getAutoStatusLabelList;
window.findAutoStatusCureItem = findAutoStatusCureItem;
window.getSkillStatusCureProfile = getSkillStatusCureProfile;
window.tryAutoStatusCure = tryAutoStatusCure;
window.tryAutoElementEndow = tryAutoElementEndow;
window.AUTO_ELEMENT_CONVERTER_ITEM_IDS = AUTO_ELEMENT_CONVERTER_ITEM_IDS;
window.hasPlayerPoisonStatus = hasPlayerPoisonStatus;
window.tryAutoDetox = tryAutoDetox;
window.tryAutoEmergencyEscape = tryAutoEmergencyEscape;
window.enhanceAutoCombatNumberInputs = enhanceAutoCombatNumberInputs;
window.getAutoBattleSkillTargetCount = getAutoBattleSkillTargetCount;
window.getAutoBattleMonsterClass = getAutoBattleMonsterClass;
window.maybeAutoEscapeFromTarget = maybeAutoEscapeFromTarget;
window.getAutoAttackSkill = getAutoAttackSkill;
window.resolveAutoSkillPrerequisite = resolveAutoSkillPrerequisite;
window.castAutoSkillPrerequisite = castAutoSkillPrerequisite;
window.hasAutoSkillMinimumUsefulResource = hasAutoSkillMinimumUsefulResource;
window.commitAutoAttackSkillRotation = commitAutoAttackSkillRotation;
window.getAutoCombatAttackAction = getAutoCombatAttackAction;
window.getAutoBattleControllerSnapshot = () => ({ ...AUTO_BATTLE_CONTROLLER });


Object.assign(window,{isAutoSkillResourceSuppressed,suppressAutoSkillForResource,handleAutoSkillResourceBlock});
