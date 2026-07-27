//=======================================
// 遊戲主程式 game.js
//=======================================

let monsters = [];
let maps = [];
let cities = [];
let npcs = [];
let shops = {};
let jobChangeRules = [];
let items = {};
let expTables = null;
let clientItemDisplayData = null;
let currentMap = null;

const RO_WEB_VERSION = "0.9.82GD";

function normalizeDataPath(path) {
  return String(path || "")
    .split("?")[0]
    .replace(/^\.\//, "")
    .replace(/^\//, "");
}

function getBundledJsonKey(path) {
  const normalized = normalizeDataPath(path);
  if (window.RO_WEB_DATA && Object.prototype.hasOwnProperty.call(window.RO_WEB_DATA, normalized)) {
    return normalized;
  }
  return normalized
    .split("/")
    .pop()
    .replace(/\.json$/i, "");
}

function cloneJsonData(data) {
  if (data === undefined || data === null) return data;
  return JSON.parse(JSON.stringify(data));
}

async function loadJson(path, fallback = null) {
  const key = getBundledJsonKey(path);
  if (window.RO_WEB_DATA && Object.prototype.hasOwnProperty.call(window.RO_WEB_DATA, key)) {
    return cloneJsonData(window.RO_WEB_DATA[key]);
  }

  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
    return await response.json();
  } catch (error) {
    console.warn(`資料載入失敗，使用 fallback：${path}`, error);
    return cloneJsonData(fallback);
  }
}

window.RO_WEB_BOOT_STATE = { status: "idle", errors: [], startedAt: 0, finishedAt: 0 };
function recordROWebRuntimeIssue(source, error) {
  const message = `${source}: ${String(error?.stack || error?.message || error || "unknown error")}`;
  if (!window.RO_WEB_BOOT_STATE.errors.includes(message)) window.RO_WEB_BOOT_STATE.errors.push(message);
  if (window.RO_WEB_BOOT_STATE.status === "ready") window.RO_WEB_BOOT_STATE.status = "ready_with_warnings";
}
window.addEventListener("error", event => {
  if (event?.error) recordROWebRuntimeIssue("window.error", event.error);
});
window.addEventListener("unhandledrejection", event => {
  recordROWebRuntimeIssue("unhandledrejection", event?.reason);
  console.error("Unhandled Promise rejection:", event?.reason);
});
window.addEventListener("pagehide", () => {
  if (typeof stopAutoBattle === "function") stopAutoBattle({ silent: true });
  if (typeof stopPlayerRecoveryLoop === "function") stopPlayerRecoveryLoop();
  if (typeof stopGroundRuntimeLoop === "function") stopGroundRuntimeLoop();
  if (typeof stopCombatResourceLoop === "function") stopCombatResourceLoop();
  if (typeof stopPositionEngine === "function") stopPositionEngine();
  if (typeof stopVirtualSummonUiRefresh === "function") stopVirtualSummonUiRefresh();
  if (typeof stopHomunculusAiLoop === "function") stopHomunculusAiLoop();
});
window.addEventListener("pageshow", event => {
  if (!event.persisted || !player) return;
  if (typeof initPositionEngine === "function") initPositionEngine();
  if (typeof startPlayerRecoveryLoop === "function") startPlayerRecoveryLoop();
  if (typeof startGroundRuntimeLoop === "function") startGroundRuntimeLoop();
  if (typeof startCombatResourceLoop === "function") startCombatResourceLoop();
  if (typeof startVirtualSummonUiRefresh === "function") startVirtualSummonUiRefresh();
  if (typeof startHomunculusAiLoop === "function") startHomunculusAiLoop();
});

window.addEventListener("load", () => {
  initGame().catch(error => {
    console.error("RO_WEB startup failed:", error);
    window.RO_WEB_BOOT_STATE.status = "failed";
    window.RO_WEB_BOOT_STATE.errors.push(String(error?.stack || error));
    window.RO_WEB_BOOT_STATE.finishedAt = Date.now();
    if (typeof addBattleLog === "function") addBattleLog(`遊戲啟動失敗：${error?.message || error}`);
  });
}, { once: true });

function validateStartupData() {
  const problems = [];
  if (!Array.isArray(monsters) || monsters.length === 0) problems.push("怪物資料為空");
  if (!Array.isArray(maps) || maps.length === 0) problems.push("地圖資料為空");
  if (!jobs || Object.keys(jobs).length === 0) problems.push("職業資料為空");
  if (!skillsData?.skillIndex || Object.keys(skillsData.skillIndex).length === 0) problems.push("技能本體資料為空");
  if (!skillsData?.runtimeProfiles || Object.keys(skillsData.runtimeProfiles).length === 0) problems.push("技能 Runtime 資料為空");
  if (!items || Object.keys(items).length === 0) problems.push("物品資料為空");
  if (!player) problems.push("玩家資料未載入");
  if (problems.length) throw new Error(`啟動資料驗證失敗：${problems.join("、")}`);
  return true;
}

async function initGame() {
  window.RO_WEB_BOOT_STATE.status = "loading";
  window.RO_WEB_BOOT_STATE.startedAt = Date.now();
  addBattleLog("遊戲啟動中...");

  await loadServerConfig();
  await loadJobData();
  await loadSkillData();
  if (typeof loadVirtualSummonData === "function") await loadVirtualSummonData();
  if (typeof loadJobConstitutionData === "function") await loadJobConstitutionData();
  if (typeof loadStatusData === "function") await loadStatusData();
  if (window.CombatFormulaRuntime?.load) await window.CombatFormulaRuntime.load();
  await loadMonsterData();
  await loadMapData();
  await loadTownData();
  await loadItemData();
  await loadClientItemDisplayData();
  await loadExpData();
  await loadPlayerData();
  if (typeof ensureInitialCharacterGenderSelection === "function") {
    await ensureInitialCharacterGenderSelection();
  }
  if (typeof loadHomunculusData === "function") await loadHomunculusData();
  validateStartupData();
  if (typeof migrateSkillStorageToOfficialIds === "function") migrateSkillStorageToOfficialIds();

  setInitialMap();
  if (typeof initPositionEngine === "function") initPositionEngine();
  if (typeof initROStudioPlayerAtlasRuntime === "function") await initROStudioPlayerAtlasRuntime();
  if (typeof initROStudioMonsterAtlasRuntime === "function") initROStudioMonsterAtlasRuntime();
  if (typeof initWorldMonsterFieldTestRuntime === "function") await initWorldMonsterFieldTestRuntime();
  if (player?.currentCity && typeof getCityData === "function" && typeof updateTownBackground === "function") {
    updateTownBackground(getCityData(player.currentCity));
  } else if (typeof updateBattleBackground === "function") {
    updateBattleBackground(currentMap);
  }

  if (typeof startPlayerRecoveryLoop === "function") startPlayerRecoveryLoop();

  const uiSteps = [
    ["player", () => updatePlayerUI()],
    ["inventory", () => updateInventoryUI()],
    ["equipment", () => typeof updateEquipmentUI === "function" && updateEquipmentUI()],
    ["huntingStats", () => updateHuntingStatsUI()],
    ["monster", () => updateMonsterUI()],
    ["map", () => updateMapUI()],
    ["town", () => typeof updateTownUI === "function" && updateTownUI()],
    ["job", () => updateJobUI()],
    ["skill", () => updateSkillUI()],
    ["quickSlots", () => typeof updateQuickSlotUI === "function" && updateQuickSlotUI()],
    ["autoCombat", () => typeof updateAutoCombatUI === "function" && updateAutoCombatUI()],
    ["virtualSummon", () => typeof updateVirtualSummonUI === "function" && updateVirtualSummonUI()],
    ["homunculus", () => typeof updateHomunculusUI === "function" && updateHomunculusUI()]
  ];
  for (const [name, step] of uiSteps) {
    try { step(); }
    catch (error) {
      console.error(`Startup UI step failed (${name}):`, error);
      window.RO_WEB_BOOT_STATE.errors.push(`${name}: ${String(error?.stack || error)}`);
    }
  }

  addBattleLog("玩家資料載入完成！");
  addBattleLog(`歡迎來到 RO_WEB Alpha ${RO_WEB_VERSION}！`);
  window.RO_WEB_BOOT_STATE.status = window.RO_WEB_BOOT_STATE.errors.length ? "ready_with_warnings" : "ready";
  window.RO_WEB_BOOT_STATE.finishedAt = Date.now();
  window.dispatchEvent(new CustomEvent("ro-web-ready", { detail: { ...window.RO_WEB_BOOT_STATE } }));
}

async function loadMonsterData() {
  monsters = await loadJson("./data/monsters.json", []);
  console.log("怪物資料載入完成：", monsters);
}

async function loadMapData() {
  maps = await loadJson("./data/maps.json", []);
  console.log("地圖資料載入完成：", maps);
}

async function loadTownData() {
  try {
    const [citiesData, npcsData, shopsData, jobChangeData] = await Promise.all([
      loadJson("./data/cities.json", []),
      loadJson("./data/npcs.json", []),
      loadJson("./data/shops.json", {}),
      loadJson("./data/job_change.json", [])
    ]);

    cities = citiesData;
    npcs = npcsData;
    shops = shopsData;
    jobChangeRules = jobChangeData;
    console.log("城鎮 / NPC / 商店資料載入完成：", { cities, npcs, shops, jobChangeRules });
  } catch (error) {
    console.warn("城鎮資料載入失敗，使用空資料。", error);
    cities = [];
    npcs = [];
    shops = {};
    jobChangeRules = [];
  }
}


function normalizeItemRecord(item, fallbackId = 0) {
  const normalized = { ...(item || {}) };
  const id = Number(normalized.Id ?? normalized.id ?? normalized.officialId ?? fallbackId);
  const buy = Number(normalized.Buy ?? normalized.buyPrice ?? 20);
  const officialSell = normalized.Sell;
  const sell = Number(officialSell ?? normalized.sellPrice ?? Math.floor(buy / 2));

  normalized.Id = id;
  normalized.id = id;
  normalized.officialId = id;
  normalized.Name = normalized.Name ?? normalized.name ?? String(id);
  normalized.name = normalized.Name;
  normalized.Buy = Number.isFinite(buy) ? buy : 20;
  normalized.buyPrice = normalized.Buy;
  normalized.sellPrice = Number.isFinite(sell) ? sell : Math.floor(normalized.Buy / 2);

  const aliases = {
    AegisName: "aegisName", Type: "dbType", SubType: "dbSubType",
    Attack: "atk", MagicAttack: "matk", Defense: "def", Range: "range",
    Slots: "slots", Jobs: "equipJobs", Locations: "locations",
    WeaponLevel: "weaponLevel", ArmorLevel: "armorLevel",
    EquipLevelMin: "equipLevelMin", Refineable: "refineable",
    Gradable: "gradable", View: "viewId", Script: "scriptRaw"
  };
  Object.entries(aliases).forEach(([canonical, alias]) => {
    const value = normalized[canonical] ?? normalized[alias];
    if (value !== undefined && value !== null) {
      normalized[canonical] = value;
      normalized[alias] = value;
    }
  });
  if (normalized.EquipLevelMin !== undefined) normalized.requiredLevel = normalized.EquipLevelMin;

  // 0.9.82DN：雙手判定一律資料驅動。RA Locations.Both_Hand 會正規化為 handed: 2，
  // Runtime 不按「弓／拳刃／槍」名稱硬寫，保留單手例外的可能性。
  const locations = normalized.Locations || normalized.locations || {};
  if (locations.Both_Hand === true || locations.BothHand === true) normalized.handed = 2;
  else if (normalized.handed === undefined && locations.Right_Hand === true) normalized.handed = 1;

  delete normalized.Weight;
  delete normalized.weight;
  delete normalized.Gender;
  delete normalized.gender;
  return normalized;
}

async function loadItemData() {
  // V0.9.80V Item DB V2 loader fix:
  // - database_manifest.json / allDataPaths is the authoritative split-file list.
  // - item_index.json may be either legacy id->path OR compact id->item records.
  // - file:// mode uses bundled RO_WEB_DATA first, so inventory icons/data still work when double-clicked.
  const index = await loadJson("./data/items/item_index.json", {});
  const manifest = await loadJson("./data/items/database_manifest.json", {});
  const merged = {};
  const pathSet = new Set();

  function addPath(path) {
    if (typeof path !== "string") return;
    const clean = path.replace(/^\.\//, "");
    if (!clean || !clean.endsWith(".json")) return;
    if (clean.endsWith("item_index.json") || clean.endsWith("database_manifest.json")) return;
    pathSet.add(clean);
  }

  // New manifest path list.
  (manifest.allDataPaths || []).forEach(addPath);

  // Legacy manifest support.
  Object.values(manifest.itemPaths || {}).forEach(addPath);
  Object.values(manifest.equipmentFilePaths || {}).forEach(addPath);

  // Legacy index support: id -> path.
  Object.values(index || {}).forEach(value => {
    if (typeof value === "string") addPath(value);
  });

  // Compact index support: id -> item summary. Use as fallback / quick lookup.
  Object.entries(index || {}).forEach(([id, item]) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const key = String(item.id || id);
    merged[key] = normalizeItemRecord(item, Number(id));
  });

  // file:// bundled mode can discover split files from RO_WEB_DATA keys.
  if (window.RO_WEB_DATA) {
    Object.keys(window.RO_WEB_DATA).forEach(key => {
      if ((key.startsWith("data/items/") || key.startsWith("data/equipment/")) && key.endsWith(".json")) {
        addPath(key);
      }
    });
  }

  const uniquePaths = Array.from(pathSet).sort();
  await Promise.all(uniquePaths.map(async path => {
    const data = await loadJson("./" + path, {});
    Object.entries(data || {}).forEach(([id, item]) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return;
      const key = String(item.id || id);
      // Full split JSON overrides compact index summary.
      merged[key] = normalizeItemRecord({ ...merged[key], ...item }, Number(id));
    });
  }));

  items = merged;
  window.ItemManager = {
    items,
    getItemById: getItemData,
    getItemName
  };
  console.log("物品資料載入完成（Item DB V2）：", { count: Object.keys(items).length, sources: uniquePaths.length, paths: uniquePaths });
}


async function loadClientItemDisplayData() {
  clientItemDisplayData = await loadJson("./data/client_item_display_data.json", {
    duplicateCardPrefixes: { "2": "兩倍", "3": "三倍", "4": "四倍" },
    cardPrefixNames: {}, cardPostfixIds: [], cardItemAliases: {}, cardIllustrationResources: {}, cardInfo: {}
  });
  window.RO_CLIENT_ITEM_DISPLAY = clientItemDisplayData;
  console.log("客戶端裝備名稱資料載入完成：", {
    prefixes: Object.keys(clientItemDisplayData?.cardPrefixNames || {}).length,
    cards: Object.keys(clientItemDisplayData?.cardInfo || {}).length
  });
}

async function loadExpData() {
  try {
    expTables = await loadJson("./data/exp_tables.json", null);
    console.log("EXP 表載入完成：", expTables);
  } catch (error) {
    console.warn("EXP 表載入失敗，使用簡易公式。", error);
    expTables = null;
  }
}

function getItemName(itemId) {
  if (!itemId) {
    return "無";
  }

  if (!items) {
    return itemId;
  }

  // 如果 items.json 是陣列格式
  if (Array.isArray(items)) {
    const item = items.find(item => String(item.id) === String(itemId));

    if (item) {
      return item.name;
    }
  }

  // 如果 items.json 是物件格式
  if (items[itemId]) {
    return items[itemId].name;
  }

  return itemId;
}

function setInitialMap() {
  if (!maps || maps.length === 0) {
    currentMap = null;
    return;
  }

  // 0.9.82FJ：重新開啟網頁時，城鎮存檔必須恢復為純城鎮場景。
  // lastFieldMap 只作為離開城鎮後的目的地，不可在啟動階段重新掛成 currentMap，
  // 否則世界怪物 Runtime 會在城鎮背景下建立野外怪物。
  const savedCity = player?.currentCity && typeof getCityData === "function"
    ? getCityData(player.currentCity)
    : null;
  if (savedCity) {
    currentMap = null;
    player.map = null;
    player.state = "Town";
    player.lastFieldMap = player.lastFieldMap || window.RO_WEB_DEFAULT_FIELD_MAP_ID || "prontera_3x3_region_camera";
    return;
  }
  if (player?.currentCity && !savedCity) player.currentCity = null;

  let savedFieldMapId = player?.map || player?.lastFieldMap || window.RO_WEB_DEFAULT_FIELD_MAP_ID || "prontera_3x3_region_camera";
  // v0.9.78b：舊 Camera/單格 MVP 存檔會強制導到單格3倍64px測試圖。
  const wasOldMapMvp = ["mjolnir_chunk_mvp", "mjolnir_camera_3x3", "mjolnir_mountains", "mjolnir_camera_scale3_single", "mjolnir_camera_zoom05_single512"].includes(savedFieldMapId);
  if (wasOldMapMvp) savedFieldMapId = "mjolnir_3x3_region_camera";
  currentMap = maps.find(map => map.id === savedFieldMapId) || maps.find(map => map.id === (window.RO_WEB_DEFAULT_FIELD_MAP_ID || "prontera_3x3_region_camera")) || maps[0];

  if (player && currentMap) {
    // 0.9.82EH：即使人在城鎮，也只保留仍存在的野外地圖；南門舊存檔已遷移。
    player.lastFieldMap = player.lastFieldMap || currentMap.id;
    if (!player.currentCity) player.map = currentMap.id;
    if (wasOldMapMvp && currentMap.spawnPoint) {
      player.position = player.position || {};
      player.position.x = Number(currentMap.spawnPoint.x || 0);
      player.position.y = Number(currentMap.spawnPoint.y || 0);
      player.position.targetX = player.position.x;
      player.position.targetY = player.position.y;
    }
  }
}
