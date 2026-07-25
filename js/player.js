//=======================================
// 玩家資料系統 player.js
//=======================================

let player = null;
const SAVE_KEY = "ro_web_save_v0_9_19_ui_scroll_quickbar"; // v0.9.12 UI 定位微調版存檔，避免舊版面板位置/背包狀態殘留

// 0.9.82EH：加入 rAthena Renewal 四轉特性素質；南門測試地圖維持退役。
const RO_WEB_DEFAULT_FIELD_MAP_ID = "prontera_3x3_region_camera";
const RO_WEB_REMOVED_FIELD_MAP_IDS = new Set(["prontera_south"]);
window.RO_WEB_DEFAULT_FIELD_MAP_ID = RO_WEB_DEFAULT_FIELD_MAP_ID;
window.RO_WEB_REMOVED_FIELD_MAP_IDS = RO_WEB_REMOVED_FIELD_MAP_IDS;

function migrateRemovedFieldMapReferences() {
  if (!player || typeof player !== "object") return false;
  let changed = false;
  if (RO_WEB_REMOVED_FIELD_MAP_IDS.has(String(player.map || ""))) {
    player.map = RO_WEB_DEFAULT_FIELD_MAP_ID;
    player.currentCity = null;
    changed = true;
  }
  if (RO_WEB_REMOVED_FIELD_MAP_IDS.has(String(player.lastFieldMap || "")) || !player.lastFieldMap) {
    player.lastFieldMap = RO_WEB_DEFAULT_FIELD_MAP_ID;
    changed = true;
  }
  for (const key of ["discoveredMaps", "mapExploration"]) {
    const bucket = player[key];
    if (!bucket || typeof bucket !== "object") continue;
    for (const removedId of RO_WEB_REMOVED_FIELD_MAP_IDS) {
      if (Object.prototype.hasOwnProperty.call(bucket, removedId)) {
        delete bucket[removedId];
        changed = true;
      }
    }
  }
  if (changed) {
    player.position = player.position || {};
    player.position.x = 2304;
    player.position.y = 2304;
    player.position.targetX = null;
    player.position.targetY = null;
  }
  return changed;
}
window.migrateRemovedFieldMapReferences = migrateRemovedFieldMapReferences;


//=======================================
// 舊版字串 ID → 官方數字 ID 對照
// v0.2 起，RO_WEB 的 itemId 全部使用官方 RO 編號。
//=======================================
const LEGACY_ITEM_ID_MAP = {
  red_potion: 501,
  orange_potion: 502,
  green_herb: 511,
  jellopy: 909,
  fluff: 914,
  knife: 1101,
  cotton_shirt: 2101,
  clip: 2607,
  poring_card: 4001,
  poring_egg: 9001
};

function normalizeItemId(itemId) {
  if (itemId === null || itemId === undefined || itemId === "") return itemId;
  if (LEGACY_ITEM_ID_MAP[itemId]) return LEGACY_ITEM_ID_MAP[itemId];

  const numeric = Number(itemId);
  if (Number.isInteger(numeric) && String(itemId).trim() !== "") return numeric;

  return itemId;
}

//=======================================
// 裝備欄預設格式
//=======================================
const DEFAULT_EQUIPMENT = {
  weapon: null,       // 武器
  shield: null,       // 盾牌 / 副手

  headTop: null,      // 頭上
  headMid: null,      // 頭中
  headLow: null,      // 頭下

  armor: null,        // 鎧甲 / 身體
  garment: null,      // 披風
  shoes: null,        // 鞋子

  accessory1: null,   // 飾品 1
  accessory2: null    // 飾品 2
};

//=======================================
// 載入玩家資料
// 先讀取預設角色資料，再用 localStorage 存檔覆蓋
//=======================================
async function loadPlayerData() {
  player = await loadJson("./data/player_default.json", {});
  if (!player || typeof player !== "object" || Array.isArray(player)) {
    throw new Error("player_default.json 無法載入或格式錯誤");
  }

  let savedData = null;
  try {
    savedData = localStorage.getItem(SAVE_KEY);
  } catch (error) {
    console.warn("無法讀取 localStorage，將使用預設角色資料：", error);
  }

  if (savedData) {
    try {
      const savedPlayer = JSON.parse(savedData);
      player = { ...player, ...savedPlayer };
      addBattleLog("讀取存檔成功。");
    } catch (error) {
      console.error("讀取存檔失敗：", error);
      addBattleLog("讀取存檔失敗，使用預設角色資料。");
    }
  }

  // 暫存技能配點不應該跟著存檔保存；避免關閉技能窗/重新整理後看起來像已配點。
  if (player && player.pendingSkillAdds) {
    delete player.pendingSkillAdds;
  }

  // 補齊玩家資料，避免舊存檔缺欄位造成錯誤
  normalizePlayerData();
  if (typeof syncEquipmentGrantedSkills === "function") syncEquipmentGrantedSkills();

  // 開發期修復：舊資料如果「已裝備的物品」還留在背包，第一次載入時自動扣掉一次
  fixEquippedItemsInInventoryOnce();

  // 0.9.82DN：在舊版背包重複修復完成後，再整理雙手武器與盾牌／副手衝突，
  // 避免退回背包的盾牌被重複計數。
  normalizeEquipmentHandConflicts({ silent: true });

  // 載入後重新計算能力值，確保裝備 ATK / DEF 有吃到
  recalculatePlayerStats();

  console.log("玩家資料載入完成：", player);
}

//=======================================
// 補齊玩家資料欄位
//=======================================
function getFinitePlayerNumber(value, fallback = 0, minimum = -Infinity) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(minimum, numeric) : Math.max(minimum, Number(fallback) || 0);
}

function getPlainPlayerObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : { ...fallback };
}

function normalizePlayerData() {
  if (!player || typeof player !== "object" || Array.isArray(player)) return;

  const rawInventory = Array.isArray(player.inventory) ? player.inventory : [];
  player.inventory = rawInventory.map(item => ({
    ...item,
    id: normalizeItemId(item.id),
    count: Number(item.count || 0),
    locked: Boolean(item.locked)
  })).filter(item => item.count > 0);

  player.equipment = {
    ...DEFAULT_EQUIPMENT,
    ...getPlainPlayerObject(player.equipment)
  };

  Object.keys(player.equipment).forEach(slot => {
    player.equipment[slot] = normalizeItemId(player.equipment[slot]);
  });

  player.pet = player.pet || null;

  player.jobKey = String(player.jobKey || getJobKeyFromName(player.job) || "novice");
  let currentJobData = typeof getJobData === "function" ? getJobData(player.jobKey) : null;
  if (!currentJobData && typeof getJobData === "function" && getJobData("novice")) {
    console.warn(`存檔職業 ${player.jobKey} 不存在，已回復為 novice。`);
    player.jobKey = "novice";
    currentJobData = getJobData("novice");
  }
  // 0.9.82DM：詩人／舞孃恢復官方性別限制；舊存檔若曾走混轉路線，自動換成同階同性別對應職業。
  const normalizeJobForGender = jobKey => {
    const data = typeof getJobData === "function" ? getJobData(jobKey) : null;
    const gender = normalizePlayerGenderForRules();
    const allowed = Array.isArray(data?.allowedGenders) ? data.allowedGenders.map(String) : [];
    if (!allowed.length || allowed.includes(gender)) return String(jobKey || "");
    const counterpart = String(data?.genderCounterpartJob || "");
    const counterpartData = counterpart && typeof getJobData === "function" ? getJobData(counterpart) : null;
    const counterpartAllowed = Array.isArray(counterpartData?.allowedGenders) ? counterpartData.allowedGenders.map(String) : [];
    return counterpartData && (!counterpartAllowed.length || counterpartAllowed.includes(gender)) ? counterpart : String(jobKey || "");
  };
  const normalizedCurrentJobKey = normalizeJobForGender(player.jobKey);
  if (normalizedCurrentJobKey && normalizedCurrentJobKey !== player.jobKey) {
    console.warn(`舊存檔職業 ${player.jobKey} 不符合角色性別，已轉換為 ${normalizedCurrentJobKey}。`);
    player.jobKey = normalizedCurrentJobKey;
    currentJobData = typeof getJobData === "function" ? getJobData(player.jobKey) : currentJobData;
  }
  if (player.rebirthOriginJobKey) player.rebirthOriginJobKey = normalizeJobForGender(player.rebirthOriginJobKey);
  if (currentJobData) {
    player.job = currentJobData.name;
  }
  player.baseLevel = Math.max(1, Math.floor(getFinitePlayerNumber(player.baseLevel, 1, 1)));
  player.jobLevel = Math.max(1, Math.floor(getFinitePlayerNumber(player.jobLevel, 1, 1)));
  player.skillPoints = Math.floor(getFinitePlayerNumber(player.skillPoints, 0, 0));
  const learned = getPlainPlayerObject(player.learnedSkills);
  player.learnedSkills = Object.fromEntries(Object.entries(learned)
    .map(([key, value]) => [String(key), Math.floor(getFinitePlayerNumber(value, 0, 0))])
    .filter(([, level]) => level > 0));
  player.completedAdventurerTraining = Array.isArray(player.completedAdventurerTraining) ? player.completedAdventurerTraining : [];
  if (typeof normalizeExtraSkillData === "function") normalizeExtraSkillData();

  // V0.9.70+ Position Combat Prototype：出生 / 舊存檔首載贈送蒼蠅翅膀 100 個，用於測試真正座標瞬移。
  if (!player.positionEngineStarterFlyWingGranted && typeof addInventoryItemCount === "function") {
    addInventoryItemCount(601, 100);
    player.positionEngineStarterFlyWingGranted = true;
  }

  if (typeof normalizePositionData === "function") normalizePositionData();

  // 自動補給設定，避免舊存檔沒有這個欄位造成錯誤
  // 同時相容早期的 player.autoBattle 設定名稱
  const legacyAutoBattle = getPlainPlayerObject(player.autoBattle);
  player.autoPotion = {
    hpEnabled: legacyAutoBattle.useHpPotion ?? false,
    hpPercent: legacyAutoBattle.hpPercent ?? 50,
    hpItemId: legacyAutoBattle.hpPotionId ?? null,

    spEnabled: legacyAutoBattle.useSpPotion ?? false,
    spPercent: legacyAutoBattle.spPercent ?? 50,
    spItemId: legacyAutoBattle.spPotionId ?? null,

    ...getPlainPlayerObject(player.autoPotion)
  };

  player.autoPotion.hpItemId = normalizeItemId(player.autoPotion.hpItemId);
  player.autoPotion.spItemId = normalizeItemId(player.autoPotion.spItemId);

  // v0.6 自動戰鬥設定：喝水 / 治癒 / 攻擊技能 / Buff
  if (typeof normalizeAutoCombatSettings === "function") {
    normalizeAutoCombatSettings();
  }

  player.activeBuffs = getPlainPlayerObject(player.activeBuffs);
  if (typeof normalizeActiveBuffs === "function") {
    normalizeActiveBuffs();
  }

  // 狩獵統計：v0.3 新增，舊存檔會自動補齊
  if (typeof normalizeHuntingStats === "function") {
    normalizeHuntingStats();
  }

  player.currentCity = player.currentCity || null;
  player.lastFieldMap = player.lastFieldMap || player.map || RO_WEB_DEFAULT_FIELD_MAP_ID;
  migrateRemovedFieldMapReferences();

  // v0.8 地圖探索資料：先記錄資料，圖鑑 UI 之後再接
  player.discoveredMaps = getPlainPlayerObject(player.discoveredMaps);
  player.monsterBook = getPlainPlayerObject(player.monsterBook);
  player.mapExploration = getPlainPlayerObject(player.mapExploration);
  player.uiWindowSizes = getPlainPlayerObject(player.uiWindowSizes);
  if (typeof normalizeMapExplorationData === "function") {
    normalizeMapExplorationData();
  }

  // v0.9.2 素質配點資料
  if (typeof normalizeStatusData === "function") {
    normalizeStatusData();
  }

  // v0.9.4 快捷欄：由職業、已學技能、背包道具動態產生。
  if (typeof normalizeQuickSlotData === "function") {
    normalizeQuickSlotData();
  }

  // EXP 系統：從 data/exp_tables.json 讀取官方升級需求表
  player.baseExp = getFinitePlayerNumber(player.baseExp, 0, 0);
  player.jobExp = getFinitePlayerNumber(player.jobExp, 0, 0);
  player.zeny = getFinitePlayerNumber(player.zeny, 0, 0);
  player.blueGem = getFinitePlayerNumber(player.blueGem, 0, 0);
  player.redGem = getFinitePlayerNumber(player.redGem, 0, 0);
  player.baseMaxHp = getFinitePlayerNumber(player.baseMaxHp ?? player.maxHp, 40, 1);
  player.baseMaxSp = getFinitePlayerNumber(player.baseMaxSp ?? player.maxSp, 11, 0);
  player.maxHp = getFinitePlayerNumber(player.maxHp, player.baseMaxHp, 1);
  player.maxSp = getFinitePlayerNumber(player.maxSp, player.baseMaxSp, 0);
  player.hp = Math.min(player.maxHp, getFinitePlayerNumber(player.hp, player.maxHp, 0));
  player.sp = Math.min(player.maxSp, getFinitePlayerNumber(player.sp, player.maxSp, 0));
  player.stats = getPlainPlayerObject(player.stats, { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 });
  for (const stat of ["str", "agi", "vit", "int", "dex", "luk"]) {
    player.stats[stat] = Math.floor(getFinitePlayerNumber(player.stats[stat], 1, 1));
  }
  player.baseExpToNext = getExpToNext("base", player.baseLevel);
  player.jobExpToNext = getExpToNext("job", player.jobLevel);

  // 如果舊資料沒有基礎值，就用目前能力當作基礎值
  player.baseAtk = getFinitePlayerNumber(player.baseAtk ?? player.atk, 5, 0);
  player.baseDef = getFinitePlayerNumber(player.baseDef ?? player.def, 1, 0);

  // Runtime modules use window.player as their shared combat source/target reference.
  window.player = player;
}

//=======================================
// 儲存遊戲
//=======================================
function saveGame() {
  if (window.RO_WEB_RESETTING_SAVE) return;
  if (!player) return;

  // 0.9.82FJ：城鎮與野外狀態互斥。城鎮存檔不可被仍在記憶中的
  // last field map 覆寫，否則重新開頁會在城鎮背景生成野外怪物。
  if (player.currentCity) {
    player.map = null;
    player.state = "Town";
  } else if (typeof currentMap !== "undefined" && currentMap) {
    player.map = currentMap.id;
  }

  // pendingSkillAdds 是技能窗內的暫存配點，只能在按「確認配點」後套用，不能寫入存檔。
  const playerToSave = { ...player };
  delete playerToSave.pendingSkillAdds;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(playerToSave));
    window.RO_WEB_SAVE_ERROR_REPORTED = false;
  } catch (error) {
    console.error("儲存遊戲失敗：", error);
    if (!window.RO_WEB_SAVE_ERROR_REPORTED && typeof addBattleLog === "function") {
      addBattleLog("儲存失敗：瀏覽器儲存空間不可用或已滿。");
      window.RO_WEB_SAVE_ERROR_REPORTED = true;
    }
  }
}

let RO_WEB_PENDING_SAVE_TIMER = null;
function requestGameSave(delayMs = 300) {
  if (window.RO_WEB_RESETTING_SAVE) return false;
  if (RO_WEB_PENDING_SAVE_TIMER) clearTimeout(RO_WEB_PENDING_SAVE_TIMER);
  RO_WEB_PENDING_SAVE_TIMER = setTimeout(() => {
    RO_WEB_PENDING_SAVE_TIMER = null;
    saveGame();
  }, Math.max(0, Number(delayMs || 0)));
  return true;
}
function flushPendingGameSave() {
  if (RO_WEB_PENDING_SAVE_TIMER) { clearTimeout(RO_WEB_PENDING_SAVE_TIMER); RO_WEB_PENDING_SAVE_TIMER = null; }
  saveGame();
}
window.requestGameSave = requestGameSave;
window.flushPendingGameSave = flushPendingGameSave;
if (typeof window.addEventListener === "function") {
  window.addEventListener("pagehide", flushPendingGameSave);
  window.addEventListener("beforeunload", flushPendingGameSave);
}

//=======================================
// 刪除存檔
//=======================================
function resetGameSave() {
  const ok = confirm("確定要清除 RO_WEB 存檔、UI 位置與暫存快取嗎？頁面會重新載入。");
  if (!ok) return;

  // V0.9.79D：清存檔期間禁止任何自動存檔 / 座標存檔把舊角色再寫回去。
  window.RO_WEB_RESETTING_SAVE = true;

  try {
    if (typeof clearBattleTimersAndMonster === "function") {
      clearBattleTimersAndMonster({ clearMonster: true });
    }
  } catch (error) {
    console.warn("停止戰鬥計時器失敗：", error);
  }

  try {
    // 之前只清 ro_web_*，但部分舊版或瀏覽器可能留下不同 key；
    // 測試版直接清空本網域 localStorage，避免 Lv.99 舊角色殘留。
    localStorage.clear();
  } catch (error) {
    console.warn("清除 localStorage 失敗：", error);
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key) keysToRemove.push(key);
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (fallbackError) {
      console.warn("localStorage fallback 清除失敗：", fallbackError);
    }
  }

  try { sessionStorage.clear(); } catch (error) { console.warn("清除 sessionStorage 失敗：", error); }

  const reloadClean = () => {
    const base = location.origin && location.origin !== "null"
      ? location.origin + location.pathname
      : location.pathname;
    location.replace(base + "?v=0.9.82FJ-reset-" + Date.now());
  };

  try {
    const cachePromise = window.caches?.keys
      ? caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
      : Promise.resolve();
    cachePromise.finally(reloadClean);
    return;
  } catch (error) {
    console.warn("清除 Cache Storage 失敗：", error);
  }

  reloadClean();
}

//=======================================
// 更新玩家資訊畫面
//=======================================
function updatePlayerUI() {
  if (!player) return;

  const currentJobName = (typeof getJobData === "function" ? getJobData(player.jobKey)?.name : null) || player.job || player.name || "冒險者";
  player.job = currentJobName;
  setOptionalText("playerName", currentJobName);
  setOptionalText("playerJob", currentJobName);

  setOptionalText("baseLevel", player.baseLevel);
  setOptionalText("jobLevel", player.jobLevel);

  setOptionalText("hp", `${Math.floor(player.hp)} / ${player.maxHp}`);
  setOptionalText("sp", `${Math.floor(player.sp)} / ${player.maxSp}`);
  updateStatusBarFill("hp", player.hp, player.maxHp);
  updateStatusBarFill("sp", player.sp, player.maxSp);
  updateStatusBarFill("baseExp", player.baseExp, player.baseExpToNext);
  updateStatusBarFill("jobExp", player.jobExp, player.jobExpToNext);

  setOptionalText("atk", player.atk);
  setOptionalText("def", player.def);

  if (typeof syncStatusPointCache === "function") syncStatusPointCache();
  if (typeof syncTraitPointCache === "function") syncTraitPointCache();
  setOptionalText("matk", player.matk);
  setOptionalText("hit", player.hit);
  setOptionalText("flee", player.flee);
  setOptionalText("cri", player.cri);
  setOptionalText("aspd", player.aspd);
  if (typeof updateStatusUI === "function") updateStatusUI();

  document.getElementById("baseExp").textContent = formatExpText("base");
  document.getElementById("jobExp").textContent = formatExpText("job");

  setOptionalText("zeny", formatResourceNumber(player.zeny));
  setOptionalText("blueGem", formatResourceNumber(player.blueGem));
  setOptionalText("redGem", formatResourceNumber(player.redGem));

  const battlePlayerName = document.getElementById("battlePlayerName");
  const battlePlayerLevel = document.getElementById("battlePlayerLevel");
  if (battlePlayerName) battlePlayerName.textContent = currentJobName;
  if (battlePlayerLevel) battlePlayerLevel.textContent = player.baseLevel;

  if (typeof updateJobUI === "function") updateJobUI();
  if (typeof updateSkillUI === "function") updateSkillUI();
  if (typeof updateQuickSlotUI === "function") updateQuickSlotUI();
}


function setOptionalText(elementId, value) {
  const el = document.getElementById(elementId);
  if (el) el.textContent = String(value ?? "");
}

function clampPercent(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

function getRatioPercent(current, max) {
  const maxValue = Number(max || 0);
  if (maxValue <= 0) return 0;
  return clampPercent((Number(current || 0) / maxValue) * 100);
}

function updateStatusBarFill(textElementId, current, max) {
  const textEl = document.getElementById(textElementId);
  const line = textEl ? textEl.closest(".status-line") : null;
  if (!line) return;
  line.style.setProperty("--fill", `${getRatioPercent(current, max)}%`);
}

function formatResourceNumber(value) {
  return Number(value || 0).toLocaleString("zh-TW");
}

function getPlayerBasicStat(statKey) {
  if (!player) return 1;
  if (typeof getPlayerTotalBasicStats === "function") {
    const totals = getPlayerTotalBasicStats();
    if (totals && totals[statKey] !== undefined) return Number(totals[statKey] || 1);
  }
  return Number(player.stats?.[statKey] || 1);
}

function getPlayerHpRecoveryAmount() {
  const vit = getPlayerBasicStat("vit");
  const base = Math.max(1, Math.floor(Number(player.maxHp || 1) / 200));
  const passive = typeof getPassiveSkillBonusTotals === "function" ? getPassiveSkillBonusTotals() : {};
  const recoveryLevel = Math.max(0, Number(passive.hpRecoverySkillLevel || 0));
  const skillRecovery = recoveryLevel > 0
    ? Math.floor(recoveryLevel * 5 + recoveryLevel * Number(player.maxHp || 1) / 500)
    : 0;
  const activeBuffs = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
  const recoveryRate = Math.max(0, Number(activeBuffs.hpRecoveryRate || 0) + Number(passive.hpRecoveryRate || 0));
  return Math.max(1, Math.floor((base + vit / 5 + skillRecovery) * (100 + recoveryRate) / 100));
}

function getPlayerSpRecoveryAmount() {
  const intStat = getPlayerBasicStat("int");
  const base = Math.max(1, Math.floor(Number(player.maxSp || 1) / 100));
  const passive = typeof getPassiveSkillBonusTotals === "function" ? getPassiveSkillBonusTotals() : {};
  const recoveryLevel = Math.max(0, Number(passive.spRecoverySkillLevel || 0));
  const skillRecovery = recoveryLevel > 0
    ? Math.floor(recoveryLevel * 3 + recoveryLevel * Number(player.maxSp || 1) / 500)
    : 0;
  const activeBuffs = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
  const recoveryRate = Math.max(0, Number(activeBuffs.spRecoveryRate || 0) + Number(passive.spRecoveryRate || 0));
  const recoveryFlat = Math.max(0, Number(activeBuffs.spRecoveryFlat || 0) + Number(passive.spRecoveryFlat || 0));
  return Math.max(1, Math.floor((base + intStat / 6 + skillRecovery + recoveryFlat) * (100 + recoveryRate) / 100));
}

let playerRecoveryTimer = null;
let playerRecoverySaveTick = 0;

function startPlayerRecoveryLoop() {
  if (playerRecoveryTimer) clearInterval(playerRecoveryTimer);
  playerRecoveryTimer = setInterval(runPlayerRecoveryTick, 5000);
}

function stopPlayerRecoveryLoop() {
  if (!playerRecoveryTimer) return;
  clearInterval(playerRecoveryTimer);
  playerRecoveryTimer = null;
}

function runPlayerRecoveryTick() {
  if (!player || player.hp <= 0) return;

  const now = Date.now();
  // 受到攻擊後短暫延遲自然回復，之後可接坐下 / 裝備 / BUFF。
  if (window.lastPlayerDamageAt && now - window.lastPlayerDamageAt < 5000) return;

  let changed = false;
  const recoveryEffects = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
  const hpRegenDisabled = Number(recoveryEffects.disableHpRegen || 0) > 0;
  const spRegenDisabled = Number(recoveryEffects.disableSpRegen || 0) > 0;

  if (!hpRegenDisabled && Number(player.hp || 0) < Number(player.maxHp || 0)) {
    player.hp = Math.min(Number(player.maxHp || 0), Number(player.hp || 0) + getPlayerHpRecoveryAmount());
    changed = true;
  }

  if (!spRegenDisabled && Number(player.sp || 0) < Number(player.maxSp || 0)) {
    player.sp = Math.min(Number(player.maxSp || 0), Number(player.sp || 0) + getPlayerSpRecoveryAmount());
    changed = true;
  }

  // Multi-performance rule: natural SP recovery resolves normally, then every active song pays its own 5-second upkeep.
  const performances = Object.entries(player.activeBuffs || {}).filter(([,buff]) => Number(buff?.sustainedSpCostPer5s || 0) > 0);
  if (performances.length) {
    performances.sort((a,b)=>Number(b[1]?.performanceActivationOrder||b[1]?.activatedAt||0)-Number(a[1]?.performanceActivationOrder||a[1]?.activatedAt||0));
    for (const [skillId,buff] of performances) {
      const cost=Math.max(0,Number(buff.sustainedSpCostPer5s||0));
      if (cost<=0) continue;
      if (Number(player.sp||0) >= cost) { player.sp-=cost; changed=true; continue; }
      if (typeof clearSustainedPerformanceAura === "function") clearSustainedPerformanceAura(buff);
      delete player.activeBuffs[skillId];
      if (typeof addBattleLog === "function") addBattleLog(`${buff.name || "歌曲"}：SP不足，演奏自動解除。`);
      changed=true;
      if (typeof recalculatePlayerStats === "function") recalculatePlayerStats();
    }
  }

  if (!changed) return;
  updatePlayerUI();
  playerRecoverySaveTick += 1;
  if (playerRecoverySaveTick >= 3) {
    playerRecoverySaveTick = 0;
    saveGame();
  }
}

//=======================================
// EXP 表 / 升級工具
//=======================================
function getJobKeyFromName(jobName) {
  const raw = String(jobName || "").trim();
  if (!raw) return "novice";
  const match = Object.entries(typeof jobs === "object" && jobs ? jobs : {}).find(([key, job]) =>
    String(key) === raw || String(job?.id || "") === raw || String(job?.name || "") === raw || String(job?.raJob || "") === raw
  );
  return match?.[0] || "novice";
}

function getCurrentExpTable() {
  const key = player?.jobKey || getJobKeyFromName(player?.job);
  return expTables?.jobs?.[key] || expTables?.jobs?.novice || null;
}

function getMaxLevel(type) {
  const jobData = typeof getCurrentJobData === "function" ? getCurrentJobData() : null;
  const table = getCurrentExpTable();

  if (type === "base") {
    return jobData?.baseMaxLevel || table?.maxBaseLevel || 99;
  }

  return jobData?.jobMaxLevel || table?.maxJobLevel || 50;
}

function getExpToNext(type, level) {
  const table = getCurrentExpTable();
  const maxLevel = getMaxLevel(type);

  if (level >= maxLevel) {
    return 0;
  }

  const list = type === "base" ? table?.base : table?.job;

  if (Array.isArray(list) && Number.isFinite(Number(list[level]))) {
    return Number(list[level]);
  }

  // 找不到官方表時才使用 fallback，避免遊戲整個卡死
  return type === "base"
    ? Math.floor(100 * Math.pow(1.2, Math.max(0, level - 1)))
    : Math.floor(50 * Math.pow(1.25, Math.max(0, level - 1)));
}

function formatExpText(type) {
  const level = type === "base" ? player.baseLevel : player.jobLevel;
  const current = type === "base" ? player.baseExp : player.jobExp;
  const maxLevel = getMaxLevel(type);
  const next = type === "base" ? player.baseExpToNext : player.jobExpToNext;

  if (level >= maxLevel) {
    return `${current} / MAX`;
  }

  return `${current} / ${next}`;
}

function applyBaseLevelUpBonus() {
  // Base Lv.200 前使用一般素質點；Base Lv.201 起改由 Renewal Trait Points 成長。
  if (typeof syncStatusPointCache === "function") syncStatusPointCache();
  if (typeof syncTraitPointCache === "function") syncTraitPointCache();
  recalculatePlayerStats();
  player.hp = player.maxHp;
  if (Number(player.baseLevel || 1) <= 200) {
    addBattleLog(`獲得可分配素質點，目前剩餘 ${typeof getAvailableStatusPoints === "function" ? getAvailableStatusPoints() : 0}。`);
  }
  const gainedTrait = typeof getTraitPointsGainedAtLevel === "function" ? getTraitPointsGainedAtLevel(player.baseLevel) : 0;
  if (gainedTrait > 0) {
    const remainingTrait = typeof getAvailableTraitPoints === "function" ? getAvailableTraitPoints() : 0;
    addBattleLog(`獲得特性點數 ${gainedTrait} 點，目前剩餘 ${remainingTrait}。`);
  }
}

function applyJobLevelUpBonus() {
  player.baseMaxSp += 3;
  player.skillPoints = Number(player.skillPoints || 0) + 1;

  recalculatePlayerStats();
  player.sp = player.maxSp;

  if (player.jobKey === "novice") {
    const training = (typeof getAdventurerTrainingList === "function" ? getAdventurerTrainingList() : [])
      .find(item => Number(item.jobLevel) === Number(player.jobLevel));

    if (training) {
      addBattleLog(`冒險者修練開啟：${training.name}（${training.effect}）`);
    }
  }
}

function emitRewardAwareLog(text, type = null) {
  if (window.RO_WEB_REWARD_BATCH_ACTIVE && typeof window.queueRewardBatchLog === "function") {
    window.queueRewardBatchLog(text, type);
  } else if (typeof addBattleLog === "function") addBattleLog(text, type);
}
function markRewardBatchDirty(kind = "player") {
  window.RO_WEB_REWARD_SAVE_DIRTY = true;
  if (kind === "inventory") window.RO_WEB_REWARD_INVENTORY_UI_DIRTY = true;
  else if (kind === "job") { window.RO_WEB_REWARD_PLAYER_UI_DIRTY = true; window.RO_WEB_REWARD_JOB_UI_DIRTY = true; }
  else window.RO_WEB_REWARD_PLAYER_UI_DIRTY = true;
}

//=======================================
// 增加 Base EXP
//=======================================
function addBaseExp(amount) {
  amount = Number(amount || 0);
  if (!amount || player.baseLevel >= getMaxLevel("base")) return;

  player.baseExp += amount;
  player.baseExpToNext = getExpToNext("base", player.baseLevel);

  while (player.baseExpToNext > 0 && player.baseExp >= player.baseExpToNext) {
    player.baseExp -= player.baseExpToNext;
    player.baseLevel += 1;

    applyBaseLevelUpBonus();
    emitRewardAwareLog(`Base Level 提升到 ${player.baseLevel}！`);

    if (player.baseLevel >= getMaxLevel("base")) {
      player.baseExp = 0;
      player.baseExpToNext = 0;
      emitRewardAwareLog("Base Level 已達目前上限。");
      break;
    }

    player.baseExpToNext = getExpToNext("base", player.baseLevel);
  }

  player.baseExpToNext = getExpToNext("base", player.baseLevel);
  if (window.RO_WEB_REWARD_BATCH_ACTIVE) { markRewardBatchDirty("player"); return; }
  recalculatePlayerStats();
  updatePlayerUI();
  saveGame();
}

//=======================================
// 增加 Job EXP
//=======================================
function addJobExp(amount) {
  amount = Number(amount || 0);
  if (!amount || player.jobLevel >= getMaxLevel("job")) return;

  player.jobExp += amount;
  player.jobExpToNext = getExpToNext("job", player.jobLevel);

  while (player.jobExpToNext > 0 && player.jobExp >= player.jobExpToNext) {
    player.jobExp -= player.jobExpToNext;
    player.jobLevel += 1;

    applyJobLevelUpBonus();
    emitRewardAwareLog(`Job Level 提升到 ${player.jobLevel}！`);

    if (player.jobLevel >= getMaxLevel("job")) {
      player.jobExp = 0;
      player.jobExpToNext = 0;
      emitRewardAwareLog("Job Level 已達目前上限。");
      break;
    }

    player.jobExpToNext = getExpToNext("job", player.jobLevel);
  }

  player.jobExpToNext = getExpToNext("job", player.jobLevel);
  if (window.RO_WEB_REWARD_BATCH_ACTIVE) { markRewardBatchDirty("job"); return; }
  recalculatePlayerStats();
  updatePlayerUI();
  if (typeof updateJobUI === "function") updateJobUI();
  if (typeof updateSkillUI === "function") updateSkillUI();
  saveGame();
}

//=======================================
// 增加 Zeny
//=======================================
function addZeny(amount) {
  player.zeny += amount;
  if (window.RO_WEB_REWARD_BATCH_ACTIVE) { markRewardBatchDirty("player"); return; }
  updatePlayerUI();
  saveGame();
}

function spendZeny(amount) {
  amount = Number(amount || 0);
  if (!player || amount <= 0) return false;

  if (Number(player.zeny || 0) < amount) {
    addBattleLog("Zeny 不足。需要 " + amount + " Zeny。");
    return false;
  }

  player.zeny -= amount;
  updatePlayerUI();
  saveGame();
  return true;
}

//=======================================
// 加入道具到背包
//=======================================
function addItem(item, count = 1) {
  item = {
    ...item,
    id: normalizeItemId(item.id)
  };
  count = Number(count || 1);

  if (!player.inventory) {
    player.inventory = [];
  }

  const existItem = findInventoryItemById(item.id);

  if (existItem) {
    existItem.count += count;
  } else {
    player.inventory.push({
      id: item.id,
      name: item.name,
      count: count,
      locked: false
    });
  }

  if (window.RO_WEB_REWARD_BATCH_ACTIVE) {
    emitRewardAwareLog(`獲得道具：${item.name} x ${count}`, "item");
    markRewardBatchDirty("inventory");
    return;
  }
  addBattleLog(`獲得道具：${item.name} x ${count}`);
  updateInventoryUI();
  saveGame();
}

let activeInventoryFilter = "consume";
let activeInventoryPage = 0;
let inventoryLockMode = false;
const INVENTORY_PAGE_SIZE = 40;
const INVENTORY_VISIBLE_SLOT_COUNT = 20;
// V0.9.78AI：背包格子完全交給 CSS Grid。
// 舊版固定座標表已退休；這個函式只負責清除可能殘留的 inline 座標。
function applyInventorySlotPosition(slot, index) {
  if (!slot) return;
  slot.removeAttribute("style");
}
let activeEquipmentView = "equipment";

function getInventoryFilterForItem(itemData) {
  if (!itemData) return "etc";
  if (itemData.type === "consume") return "consume";
  if (itemData.type === "equipment") return "equipment";
  return "etc";
}


function isKoreanTextLine(line) {
  return /[가-힣]/.test(String(line || ""));
}

function stripROColorCodesForCheck(line) {
  return String(line || "").replace(/\^[0-9A-Fa-f]{6}/g, "").trim();
}

function cleanItemDescriptionLines(itemData) {
  const raw = Array.isArray(itemData?.description)
    ? itemData.description
    : (itemData?.description ? [String(itemData.description)] : []);
  const itemName = String(itemData?.name || "").trim();
  const seen = new Set();

  return raw
    .map(line => String(line || "").trim())
    .filter(line => {
      const plain = stripROColorCodesForCheck(line);
      return plain && plain !== "_" && plain !== "＿";
    })
    .filter(line => !/尚未鑑定|未鑑定|放大鏡/.test(stripROColorCodesForCheck(line)))
    .filter(line => !/^重量\s*[:：]/.test(stripROColorCodesForCheck(line)))
    .filter(line => !isKoreanTextLine(line))
    .filter(line => stripROColorCodesForCheck(line) !== itemName)
    .filter(line => {
      const key = line.replace(/\s+/g, "").replace(/[，,。\.：:]/g, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildItemTooltip(item, itemData) {
  if (!itemData) return "找不到物品資料。";
  const lines = [itemData.name || getItemName(item.id), `類型：${getItemTypeText(itemData)}`];
  if (Number(itemData.hp || 0)) lines.push(`效果：恢復 HP ${itemData.hp}`);
  if (Number(itemData.sp || 0)) lines.push(`效果：恢復 SP ${itemData.sp}`);
  if (Number(itemData.atk || 0)) lines.push(`ATK +${itemData.atk}`);
  if (Number(itemData.def || 0)) lines.push(`DEF +${itemData.def}`);
  if (Number(itemData.matk || 0)) lines.push(`MATK +${itemData.matk}`);
  if (Number(itemData.mdef || 0)) lines.push(`MDEF +${itemData.mdef}`);
  if (itemData.slot) lines.push(`裝備位置：${getEquipmentSlotName(itemData.slot)}`);
  if (itemData.slots !== undefined) lines.push(`卡槽：${itemData.slots}`);
  lines.push(...cleanItemDescriptionLines(itemData));
  lines.push(`數量：${Number(item.count || 0)}`);
  if (itemData.type === "equipment") lines.push("雙點可穿上裝備。");
  else if (itemData.type === "consume") lines.push("點擊使用。");
  else lines.push("目前只能查看。");
  return lines.join("\n");
}

function normalizePlayerGenderForRules(value = player?.gender || player?.sex || player?.bodyGender || "male") {
  const raw = String(value || "").trim().toLowerCase();
  return ["female", "f", "女", "woman", "girl"].includes(raw) ? "female" : "male";
}

function isAssassinOffhandJob(jobKey = player?.jobKey) {
  return ["assassin", "assassin_cross", "guillotine_cross", "shadow_cross"].includes(String(jobKey || ""));
}

function isWeaponEquipmentItem(itemData) {
  return Boolean(itemData && (itemData.slot === "weapon" || itemData.category === "weapon" || itemData.dbType === "Weapon" || itemData.Type === "Weapon"));
}

function isTwoHandedWeaponItem(itemData) {
  if (!isWeaponEquipmentItem(itemData)) return false;
  const locations = itemData.Locations || itemData.locations || {};
  const subtype = String(itemData.dbSubType || itemData.SubType || itemData.weaponType || "").toLowerCase();
  return Number(itemData.handed || 0) >= 2 || locations.Both_Hand === true || locations.BothHand === true || /^2h/.test(subtype) || subtype.includes("twohand");
}

function getSimpleWeaponFamily(itemData) {
  const raw = String(itemData?.weaponType || itemData?.dbSubType || itemData?.SubType || itemData?.subCategory || "").toLowerCase();
  const name = String(itemData?.name || "");
  if (raw.includes("dagger") || name.includes("短劍") || name.includes("匕首")) return "dagger";
  if (raw.includes("sword") || name.includes("劍")) return "sword";
  return raw;
}

function isAssassinOffhandWeaponItem(itemData) {
  if (!isWeaponEquipmentItem(itemData) || isTwoHandedWeaponItem(itemData)) return false;
  return ["dagger", "sword"].includes(getSimpleWeaponFamily(itemData));
}

function getEquipmentSlotName(slot) {
  const slotNameMap = {
    headTop: "頭上", headMid: "頭中", headLow: "頭下", armor: "身體", garment: "披風",
    shoes: "鞋子", weapon: "武器", shield: isAssassinOffhandJob() ? "盾牌／副手" : "盾牌", accessory1: "飾品 1", accessory2: "飾品 2"
  };
  return slotNameMap[slot] || slot;
}

function initInventoryTabs() {
  document.querySelectorAll(".inventory-tab[data-filter]").forEach(button => {
    button.onclick = function () {
      if (typeof hideGameTooltip === "function") hideGameTooltip();
      activeInventoryFilter = button.dataset.filter || "consume";
      activeInventoryPage = 0;
      document.querySelectorAll(".inventory-tab").forEach(tab => tab.classList.toggle("is-active", tab === button));
      updateInventoryUI();
      const inventoryList = document.getElementById("inventory-list");
      if (inventoryList) inventoryList.scrollTop = 0;
    };
  });
}

function initInventoryControls() {
  const sortBtn = document.getElementById("inventorySortBtn");
  if (sortBtn) sortBtn.onclick = sortInventoryById;

  const decomposeBtn = document.getElementById("inventoryDecomposeBtn");
  if (decomposeBtn) decomposeBtn.onclick = decomposeUnlockedInventoryItems;

  const lockBtn = document.getElementById("inventoryLockBtn");
  if (lockBtn) lockBtn.onclick = toggleInventoryLockMode;

  const prevBtn = document.getElementById("inventoryPrevPage");
  if (prevBtn) prevBtn.onclick = () => changeInventoryPage(-1);

  const nextBtn = document.getElementById("inventoryNextPage");
  if (nextBtn) nextBtn.onclick = () => changeInventoryPage(1);
}

function getFilteredInventoryItems() {
  const source = Array.isArray(player?.inventory) ? player.inventory : [];
  return source.filter(item => {
    const itemData = getItemData(item.id);
    return getInventoryFilterForItem(itemData) === activeInventoryFilter;
  });
}

function getInventoryTotalPages(itemCount) {
  return Math.max(1, Math.ceil(Number(itemCount || 0) / INVENTORY_PAGE_SIZE));
}

function clampInventoryPage(totalPages) {
  activeInventoryPage = Math.max(0, Math.min(activeInventoryPage, Math.max(0, totalPages - 1)));
}

function updateInventoryPageControls(totalPages) {
  // V0.9.21d：背包改為每分類 100 格 + 右側捲動，不再顯示翻頁。
  const pageText = document.getElementById("inventoryPageText");
  const prevBtn = document.getElementById("inventoryPrevPage");
  const nextBtn = document.getElementById("inventoryNextPage");
  if (pageText) pageText.textContent = "";
  if (prevBtn) prevBtn.disabled = true;
  if (nextBtn) nextBtn.disabled = true;
  const lockBtn = document.getElementById("inventoryLockBtn");
  if (lockBtn) lockBtn.classList.toggle("is-active", inventoryLockMode);
}

function changeInventoryPage(delta) {
  const totalPages = getInventoryTotalPages(getFilteredInventoryItems().length);
  if (totalPages <= 1) {
    activeInventoryPage = 0;
  } else {
    activeInventoryPage = (activeInventoryPage + delta + totalPages) % totalPages;
  }
  updateInventoryUI();
}

function sortInventoryById() {
  if (!player?.inventory) return;
  player.inventory.sort((a, b) => Number(a.id) - Number(b.id));
  activeInventoryPage = 0;
  addBattleLog("背包已依物品編號整理。");
  updateInventoryUI();
  saveGame();
}

function toggleInventoryLockMode() {
  inventoryLockMode = !inventoryLockMode;
  addBattleLog(inventoryLockMode ? "鎖定模式：開啟。點擊物品右上角方框可鎖定。" : "鎖定模式：關閉。");
  updateInventoryUI();
}

function toggleInventoryItemLock(itemId) {
  const inventoryItem = findInventoryItemById(itemId);
  if (!inventoryItem) return;
  inventoryItem.locked = !inventoryItem.locked;
  const itemData = getItemData(itemId);
  addBattleLog(`${itemData?.name || itemId} 已${inventoryItem.locked ? "鎖定" : "解除鎖定"}。`);
  updateInventoryUI();
  saveGame();
}

function decomposeUnlockedInventoryItems() {
  if (!player?.inventory) return;

  const filteredItems = getFilteredInventoryItems();
  const totalPages = getInventoryTotalPages(filteredItems.length);
  clampInventoryPage(totalPages);
  const pageItems = filteredItems.slice(
    activeInventoryPage * INVENTORY_PAGE_SIZE,
    (activeInventoryPage + 1) * INVENTORY_PAGE_SIZE
  );

  const equippedIds = new Set(Object.values(player.equipmentInstances || {}).filter(Boolean).map(instance => String(instance.instanceId || '')));
  const decomposeKeys = new Set();
  let removedCount = 0;
  let zenyGain = 0;

  pageItems.forEach(item => {
    const itemData = getItemData(item.id);
    if (!itemData || item.locked) return;
    if (equippedIds.has(String(item.instanceId || ''))) return;

    const count = Number(item.count || 0);
    if (count <= 0) return;
    decomposeKeys.add(item.instanceId ? `instance:${item.instanceId}` : `item:${item.id}`);
    removedCount += count;
    const passiveTotals = typeof getPassiveSkillBonusTotals === "function" ? getPassiveSkillBonusTotals() : {};
    const sellBonusRate = Math.max(0, Number(passiveTotals.shopSellBonusRate || 0));
    const adjustedSellPrice = Math.max(1, Math.floor(Number(itemData.sellPrice || 0) * (100 + sellBonusRate) / 100));
    zenyGain += adjustedSellPrice * count;
  });

  if (!removedCount) {
    addBattleLog("目前分頁沒有可分解的未鎖定物品。");
    return;
  }

  player.inventory = player.inventory.filter(item => !decomposeKeys.has(item.instanceId ? `instance:${item.instanceId}` : `item:${item.id}`));
  player.zeny = Number(player.zeny || 0) + zenyGain;
  addBattleLog(`分解目前分頁 ${removedCount} 個未鎖定物品，獲得 ${zenyGain} Zeny。`);
  const newTotalPages = getInventoryTotalPages(getFilteredInventoryItems().length);
  clampInventoryPage(newTotalPages);
  updatePlayerUI();
  updateInventoryUI();
  saveGame();
}

function initEquipmentTabs() {
  document.querySelectorAll(".equipment-panel-tab[data-equipment-view]").forEach(button => {
    button.onclick = function () {
      if (typeof hideGameTooltip === "function") hideGameTooltip();
      activeEquipmentView = button.dataset.equipmentView || "equipment";
      document.querySelectorAll(".equipment-panel-tab").forEach(tab => tab.classList.toggle("is-active", tab === button));
      updateEquipmentUI();
    };
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { initInventoryTabs(); initInventoryControls(); initEquipmentTabs(); });
} else {
  initInventoryTabs(); initInventoryControls(); initEquipmentTabs();
}

//=======================================
// 顯示物品資料窗
//=======================================
function showItemInfo(itemId) {
  const itemData = getItemData(itemId);
  const itemInfoContent = document.getElementById("itemInfoContent");

  if (!itemInfoContent) {
    return;
  }

  if (!itemData) {
    itemInfoContent.innerHTML = "<p>找不到物品資料。</p>";
    return;
  }

  itemInfoContent.innerHTML = "";

  const title = document.createElement("h3");
  title.textContent = itemData.name;
  itemInfoContent.appendChild(title);

  if (itemData.icon) {
    const icon = document.createElement("img");
    icon.src = itemData.icon;
    icon.alt = itemData.name;
    icon.className = "item-info-icon";
    // 如果圖片不存在，就隱藏破圖圖示
    icon.onerror = function () {
      icon.style.display = "none";
    };
    itemInfoContent.appendChild(icon);
  }

  const typeText = document.createElement("p");
  typeText.textContent = "類型：" + getItemTypeText(itemData);
  itemInfoContent.appendChild(typeText);

  if (itemData.description && Array.isArray(itemData.description)) {
    cleanItemDescriptionLines(itemData).forEach(line => {
      const p = document.createElement("p");
      p.textContent = line;
      itemInfoContent.appendChild(p);
    });
  }

  const buttonArea = document.createElement("div");
  buttonArea.className = "item-info-buttons";

  if (itemData.type === "equipment") {
    const equipButton = document.createElement("button");
    equipButton.textContent = "裝備";
    equipButton.onclick = function () {
      useItem(itemId);
    };
    buttonArea.appendChild(equipButton);
  }

  if (itemData.type === "consume") {
    const useButton = document.createElement("button");
    useButton.textContent = "使用";
    useButton.onclick = function () {
      useItem(itemId);
    };
    buttonArea.appendChild(useButton);
  }

  itemInfoContent.appendChild(buttonArea);
}

//=======================================
// 關閉物品資料欄
//=======================================
function closeItemInfo() {
  const itemInfoContent = document.getElementById("itemInfoContent");

  if (!itemInfoContent) {
    return;
  }

  itemInfoContent.innerHTML = "<p>請選擇一個物品</p>";
}

//=======================================
// 取得物品類型中文名稱
//=======================================
function getItemTypeText(itemData) {
  if (!itemData) return "未知";

  const type = itemData.type;
  const category = itemData.category;
  const sub = itemData.subCategory;

  if (type === "equipment") {
    if (category === "weapon") {
      const normalizedSub = String(sub || "").replace(/^1h/i, "").replace(/^2h/i, "").toLowerCase();
      const weaponMap = { dagger: "武器 / 短劍", sword: "武器 / 劍", axe: "武器 / 斧", spear: "武器 / 矛槍", bow: "武器 / 弓", staff: "武器 / 杖", mace: "武器 / 槌", book: "武器 / 書", whip: "武器 / 鞭子", instrument: "武器 / 樂器", musical: "武器 / 樂器", gun: "武器 / 槍械", ninja: "武器 / 忍者武器", katar: "武器 / 拳刃", knuckle: "武器 / 拳套" };
      return weaponMap[normalizedSub] || "武器";
    }
    if (category === "armor") {
      const slot = itemData.slot;
      const armorMap = { body: "防具 / 鎧甲", armor: "防具 / 鎧甲", shield: "防具 / 盾牌", garment: "防具 / 披肩", shoes: "防具 / 鞋子", accessory: "防具 / 飾品", headgear: "頭飾", headTop: "頭飾 / 頭上", headMid: "頭飾 / 頭中", headLow: "頭飾 / 頭下" };
      if (sub === "headgear" || String(slot || "").startsWith("head") || String(sub || "").startsWith("head")) return "頭飾 / " + getEquipmentSlotName(slot || sub);
      return armorMap[sub] || armorMap[slot] || "防具";
    }
    if (category === "headgear") return "頭飾 / " + getEquipmentSlotName(itemData.slot || sub);
    if (category === "costume") return "時裝";
    if (category === "shadow") return "影子裝";
    return "裝備";
  }
  if (type === "consume") return "消耗品";
  if (type === "etc") return "掉落物 / 雜物";
  if (type === "card") return "卡片";
  if (type === "pet") return "寵物相關";
  if (type === "stone") return "附魔石";
  if (type === "quest") return "任務道具";
  if (type === "cash") return "商城物品";

  return category || type || "未知";
}


let lastInventoryEquipTap = { itemId: null, time: 0 };

function handleInventorySlotClick(item, itemData) {
  if (!item || !itemData) return;
  if (typeof hideGameTooltip === "function") hideGameTooltip();

  if (inventoryLockMode) {
    toggleInventoryItemLock(item.id);
    return;
  }

  if (itemData.type === "equipment") {
    const now = Date.now();
    const isSecondTap = String(lastInventoryEquipTap.itemId) === String(item.id) && (now - lastInventoryEquipTap.time) <= 380;
    lastInventoryEquipTap = { itemId: item.id, time: now };
    if (isSecondTap) {
      lastInventoryEquipTap = { itemId: null, time: 0 };
      useItem(item.id);
      return;
    }
    showItemInfo(item.id);
    return;
  }

  showItemInfo(item.id);
  if (itemData.type === "consume") {
    useItem(item.id);
  }
}

//=======================================
// 更新背包畫面
//=======================================
function updateInventoryUI() {
  if (!player) return;
  window.RO_WEB_INVENTORY_DIRTY = false;

  const inventoryList = document.getElementById("inventory-list");

  if (!inventoryList) {
    return;
  }

  inventoryList.innerHTML = "";
  inventoryList.classList.add("inventory-slot-grid");

  const filteredItems = getFilteredInventoryItems();
  // V0.9.78AW：背包改為同分類單一可捲動 Grid。
  // 40 格以內維持固定 5x8 外觀；超過 40 格時繼續往下生成，
  // 由 CSS 在格子區內顯示垂直滾輪，Header / Tabs / Footer 不跟著捲。
  const totalPages = 1;
  activeInventoryPage = 0;
  const pageItems = filteredItems;
  const slotCount = Math.max(INVENTORY_VISIBLE_SLOT_COUNT, pageItems.length);

  for (let index = 0; index < slotCount; index += 1) {
    const item = pageItems[index] || null;
    const itemData = item ? getItemData(item.id) : null;
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "inventory-slot" + (itemData ? " has-item" : " empty") + ((inventoryLockMode && item?.locked) ? " locked" : "");
    applyInventorySlotPosition(slot, index);

    if (itemData) {
      slot.dataset.tooltip = buildItemTooltip(item, itemData);
      slot.setAttribute("aria-label", `${typeof buildCompactItemName === "function" ? buildCompactItemName(item, itemData) : itemData.name} x ${item.count}`);
      if (itemData.type === "consume") {
        const mobileUi = (typeof isMobileViewport === "function" && isMobileViewport()) || Boolean(window.matchMedia?.("(pointer: coarse)")?.matches);
        slot.draggable = !mobileUi;
        slot.title = `${itemData.name}：點擊查看與設定快捷欄`;
        if (slot.draggable) slot.addEventListener("dragstart", event => {
          event.dataTransfer.setData("application/json", JSON.stringify({ type: "item", id: itemData.id }));
          event.dataTransfer.effectAllowed = "copy";
        });
      }

      const icon = document.createElement("img");
      icon.src = itemData.icon || `images/items/${itemData.officialId || itemData.id}.webp`;
      icon.alt = itemData.name || item.id;
      icon.onerror = function () { icon.style.display = "none"; };
      slot.appendChild(icon);

      if (Number(item.count || 0) > 1) {
        const count = document.createElement("span");
        count.className = "inventory-count";
        count.textContent = item.count;
        slot.appendChild(count);
      }

      if (inventoryLockMode) {
        const lockMark = document.createElement("span");
        lockMark.className = "inventory-lock-mark " + (item.locked ? "is-locked" : "is-unlocked");
        lockMark.textContent = item.locked ? "✓" : "";
        lockMark.title = item.locked ? "已鎖定" : "未鎖定";
        slot.appendChild(lockMark);
      }

      slot.onclick = function () {
        handleInventorySlotClick(item, itemData);
      };
      slot.ondblclick = function (event) {
        if (event) event.preventDefault();
      };
    } else {
      slot.setAttribute("aria-label", "空格");
    }

    inventoryList.appendChild(slot);
  }

  updateInventoryPageControls(totalPages);

  // 背包更新完後，順便刷新自動補給 / 自動戰鬥選單
  updateAutoPotionOptions();
  if (typeof updateAutoCombatUI === "function") updateAutoCombatUI();
  if (typeof updateQuickSlotUI === "function") updateQuickSlotUI();
}

//=======================================
// 更新裝備欄畫面
//=======================================
function updateEquipmentUI() {
  if (!player) {
    return;
  }

  player.equipment = {
    ...DEFAULT_EQUIPMENT,
    ...getPlainPlayerObject(player.equipment)
  };

  const grid = document.querySelector(".equipment-template-grid");
  const placeholder = document.getElementById("equipmentViewPlaceholder");
  const equipmentPanel = document.getElementById("equipment-panel");
  if (equipmentPanel) equipmentPanel.dataset.view = activeEquipmentView || "equipment";

  const isEquipmentView = activeEquipmentView === "equipment";
  if (grid) {
    grid.hidden = !isEquipmentView;
    grid.classList.toggle("is-hidden", !isEquipmentView);
  }
  if (placeholder) {
    placeholder.hidden = true;
    placeholder.textContent = "";
  }

  if (!isEquipmentView) {
    return;
  }

  setEquipmentSlot("headTop", "eq-headTop");
  setEquipmentSlot("headMid", "eq-headMid");
  setEquipmentSlot("headLow", "eq-headLow");
  setEquipmentSlot("armor", "eq-armor");
  setEquipmentSlot("garment", "eq-garment");
  setEquipmentSlot("shoes", "eq-shoes");
  setEquipmentSlot("weapon", "eq-weapon");
  setEquipmentSlot("shield", "eq-shield");
  setEquipmentSlot("accessory1", "eq-accessory1");
  setEquipmentSlot("accessory2", "eq-accessory2");
}

function buildEquipmentTooltip(slot, itemData) {
  const slotName = getEquipmentSlotName(slot);
  if (!itemData) return `${slotName}\n無`;

  const lines = [itemData.name || "未知道具", `部位：${slotName}`];
  if (Number(itemData.atk || 0)) lines.push(`ATK +${itemData.atk}`);
  if (Number(itemData.def || 0)) lines.push(`DEF +${itemData.def}`);
  if (Number(itemData.matk || 0)) lines.push(`MATK +${itemData.matk}`);
  if (Number(itemData.mdef || 0)) lines.push(`MDEF +${itemData.mdef}`);
  if (itemData.slots !== undefined) lines.push(`卡槽：${itemData.slots}`);
  lines.push(...cleanItemDescriptionLines(itemData));
  lines.push("點擊可卸下裝備。");
  return lines.join("\n");
}

function setEquipmentSlot(slot, elementId) {
  const element = document.getElementById(elementId);

  if (!element) return;

  element.innerHTML = "";
  element.classList.remove("has-item", "is-two-hand-mirror", "is-offhand-weapon");
  element.style.backgroundImage = "";
  element.dataset.slotName = getEquipmentSlotName(slot);

  let itemId = player.equipment[slot];
  let displaySlot = slot;
  let isTwoHandMirror = false;
  if (slot === "shield" && !itemId) {
    const mainWeapon = player.equipment.weapon ? getItemData(player.equipment.weapon) : null;
    if (isTwoHandedWeaponItem(mainWeapon)) {
      itemId = player.equipment.weapon;
      displaySlot = "weapon";
      isTwoHandMirror = true;
    }
  }

  const itemData = itemId ? getItemData(itemId) : null;
  if (isTwoHandMirror && itemData) {
    element.dataset.tooltip = `${getEquipmentSlotName(slot)}
${itemData.name}
雙手武器佔用此部位。
點擊可卸下武器。`;
  } else {
    element.dataset.tooltip = buildEquipmentTooltip(slot, itemData);
  }
  element.onclick = null;

  if (!itemData) {
    element.setAttribute("aria-label", `${getEquipmentSlotName(slot)}：無`);
    return;
  }

  element.classList.add("has-item");
  if (isTwoHandMirror) element.classList.add("is-two-hand-mirror");
  if (slot === "shield" && isWeaponEquipmentItem(itemData) && !isTwoHandMirror) element.classList.add("is-offhand-weapon");
  element.setAttribute("aria-label", `${getEquipmentSlotName(slot)}：${itemData.name}${isTwoHandMirror ? "（雙手武器）" : ""}`);
  const icon = itemData.icon || `images/items/${itemData.officialId || itemData.id}.webp`;
  const img = document.createElement("img");
  img.src = icon;
  img.alt = itemData.name;
  img.onerror = function () { img.style.display = "none"; };
  element.appendChild(img);

  element.onclick = function () {
    if (typeof hideGameTooltip === "function") hideGameTooltip();
    unequipItem(displaySlot);
  };
}

//=======================================
// 使用物品判定
//=======================================
function useItem(itemId) {
  const itemData = getItemData(itemId);

  if (!itemData) {
    addBattleLog("找不到物品資料：" + itemId);
    return;
  }

  if (itemData.type === "equipment") {
    equipItem(itemData);
    return;
  }

  if (itemData.type === "consume") {
    consumeItem(itemData);
    return;
  }

  addBattleLog(itemData.name + " 目前不能使用。");
}

//=======================================
// RA 裝備限制共用判定（Jobs / Classes / EquipLevelMin）
//=======================================
function getCurrentEquipJobProfile() {
  const map = window.RO_EQUIPMENT_JOB_MAP?.jobs || {};
  const currentJobId = String(player?.jobKey || (typeof getJobKeyFromName === "function" ? getJobKeyFromName(player?.job) : "") || "novice");
  return map[currentJobId] || { jobKey: currentJobId, classKey: "Normal" };
}

function isAllowedByRaMap(ruleMap, key) {
  if (!ruleMap || typeof ruleMap !== "object" || Object.keys(ruleMap).length === 0) return true;
  if (Object.prototype.hasOwnProperty.call(ruleMap, key)) return ruleMap[key] !== false;
  if (Object.prototype.hasOwnProperty.call(ruleMap, "All")) return ruleMap.All !== false;
  return false;
}

function canEquipItem(itemData) {
  const profile = getCurrentEquipJobProfile();
  const jobsRule = itemData.Jobs || itemData.equipJobs || null;
  const classesRule = itemData.Classes || itemData.equipClasses || null;
  const minLevel = Number(itemData.EquipLevelMin ?? itemData.equipLevelMin ?? itemData.requiredLevel ?? 0);

  if (!isAllowedByRaMap(jobsRule, profile.jobKey)) {
    return { ok: false, reason: "目前職業無法裝備此物品。" };
  }
  if (!isAllowedByRaMap(classesRule, profile.classKey)) {
    return { ok: false, reason: "目前職業階級無法裝備此物品。" };
  }
  if (Number(player?.baseLevel || 1) < minLevel) {
    return { ok: false, reason: `Base Lv ${minLevel} 以上才可裝備。` };
  }
  return { ok: true };
}

function getItemEquipmentSlotCandidates(itemData) {
  if (!itemData) return [];
  const locations = itemData.Locations && typeof itemData.Locations === "object" ? itemData.Locations : {};
  const out = [];
  const add = slot => { if (slot && !out.includes(slot)) out.push(slot); };

  // rAthena Locations is authoritative when present. This also fixes items whose
  // broad database category says accessory while the actual location is Head_Mid.
  if (locations.Head_Top) add("headTop");
  if (locations.Head_Mid) add("headMid");
  if (locations.Head_Low) add("headLow");
  if (locations.Armor) add("armor");
  if (locations.Garment) add("garment");
  if (locations.Shoes) add("shoes");
  if (locations.Right_Hand || locations.Both_Hand) add("weapon");
  if (locations.Left_Hand) add("shield");
  if (locations.Both_Accessory) { add("accessory1"); add("accessory2"); }

  const declared = String(itemData.slot || "").trim();
  if (!out.length) {
    if (declared === "accessory" || declared === "accessory1" || declared === "accessory2") {
      if (declared === "accessory2") { add("accessory2"); add("accessory1"); }
      else { add("accessory1"); add("accessory2"); }
    } else {
      add(declared || null);
    }
  }
  return out;
}
window.getItemEquipmentSlotCandidates = getItemEquipmentSlotCandidates;

function resolveEquipmentTargetSlot(itemData) {
  if (!itemData) return null;
  const candidates = getItemEquipmentSlotCandidates(itemData);
  if (!candidates.length) return null;

  if (candidates.includes("weapon")) {
    if (!isAssassinOffhandJob() || !isAssassinOffhandWeaponItem(itemData)) return "weapon";
    const mainWeapon = player?.equipment?.weapon ? getItemData(player.equipment.weapon) : null;
    if (mainWeapon && isAssassinOffhandWeaponItem(mainWeapon)) return "shield";
    return "weapon";
  }

  // Both_Accessory automatically uses the empty side first. If both are occupied,
  // replace the item's preferred side (normally accessory1) deterministically.
  if (candidates.includes("accessory1") || candidates.includes("accessory2")) {
    const accessoryCandidates = candidates.filter(slot => slot === "accessory1" || slot === "accessory2");
    const empty = accessoryCandidates.find(slot => !player?.equipment?.[slot]);
    return empty || accessoryCandidates[0] || "accessory1";
  }

  return candidates[0];
}

function isItemValidInEquipmentSlot(slot, itemData) {
  if (!itemData) return false;
  const equipCheck = canEquipItem(itemData);
  if (!equipCheck.ok) return false;
  const candidates = getItemEquipmentSlotCandidates(itemData);
  if (slot === "weapon") return candidates.includes("weapon");
  if (slot === "shield") {
    if (candidates.includes("shield")) return true;
    return isAssassinOffhandJob() && isAssassinOffhandWeaponItem(itemData);
  }
  return candidates.includes(slot);
}

function moveEquipmentSlotToInventory(slot, options = {}) {
  if (!player?.equipment) return null;
  const itemId = player.equipment[slot];
  if (!itemId) return null;
  const itemData = getItemData(itemId);
  player.equipment[slot] = null;
  if (itemData) {
    const inventoryItem = findInventoryItemById(itemId);
    if (inventoryItem) inventoryItem.count += 1;
    else player.inventory.push({ id: itemData.id, name: itemData.name, count: 1, locked: false });
    if (!options.silent) addBattleLog("卸下了 " + itemData.name);
  }
  return itemData;
}

function normalizeEquipmentHandConflicts(options = {}) {
  if (!player?.equipment) return [];
  const removed = [];
  const weapon = player.equipment.weapon ? getItemData(player.equipment.weapon) : null;
  const offhand = player.equipment.shield ? getItemData(player.equipment.shield) : null;
  if (weapon && isTwoHandedWeaponItem(weapon) && offhand) {
    const row = moveEquipmentSlotToInventory("shield", options);
    if (row) removed.push(row);
  }
  const currentOffhand = player.equipment.shield ? getItemData(player.equipment.shield) : null;
  if (currentOffhand && isWeaponEquipmentItem(currentOffhand)) {
    const main = player.equipment.weapon ? getItemData(player.equipment.weapon) : null;
    if (!isAssassinOffhandJob() || !isAssassinOffhandWeaponItem(currentOffhand) || !isAssassinOffhandWeaponItem(main)) {
      const row = moveEquipmentSlotToInventory("shield", options);
      if (row) removed.push(row);
    }
  }
  return removed;
}

function unequipInvalidEquipmentAfterJobChange() {
  if (!player?.equipment) return [];
  const removed = [];
  for (const slot of Object.keys(DEFAULT_EQUIPMENT)) {
    const itemId = player.equipment[slot];
    if (!itemId) continue;
    const itemData = getItemData(itemId);
    if (!itemData || !isItemValidInEquipmentSlot(slot, itemData)) {
      const row = moveEquipmentSlotToInventory(slot, { silent: true });
      if (row) removed.push(row);
    }
  }
  removed.push(...normalizeEquipmentHandConflicts({ silent: true }));
  if (removed.length) {
    const names = removed.map(item => item.name).filter(Boolean);
    addBattleLog(`轉職後自動卸下無法使用的裝備：${names.join("、")}。`);
  }
  if (typeof syncEquipmentGrantedSkills === "function") syncEquipmentGrantedSkills();
  if (typeof syncROStudioWeaponTypeFromEquipment === "function") syncROStudioWeaponTypeFromEquipment();
  return removed;
}
window.unequipInvalidEquipmentAfterJobChange = unequipInvalidEquipmentAfterJobChange;

//=======================================
// 裝備物品判定
//=======================================
function equipItem(itemData) {
  if (typeof hideGameTooltip === "function") hideGameTooltip();

  const equipCheck = canEquipItem(itemData);
  if (!equipCheck.ok) {
    addBattleLog(`${itemData.name}：${equipCheck.reason}`);
    return;
  }
  const slotCandidates = getItemEquipmentSlotCandidates(itemData);
  if (!slotCandidates.length) {
    addBattleLog(itemData.name + " 沒有設定裝備位置。");
    return;
  }

  if (!player.equipment) player.equipment = { ...DEFAULT_EQUIPMENT };
  const slot = resolveEquipmentTargetSlot(itemData);
  if (!slot) {
    addBattleLog(itemData.name + " 沒有可用的裝備位置。");
    return;
  }

  const inventoryItem = findInventoryItemById(itemData.id);
  if (!inventoryItem || inventoryItem.count <= 0) {
    addBattleLog("背包裡沒有 " + itemData.name + "。");
    return;
  }

  // 雙手武器與盾牌／副手互斥；刺客系副手只允許單手劍與短劍。
  const conflictSlots = [];
  if (slot === "weapon") {
    if (isTwoHandedWeaponItem(itemData) && player.equipment.shield) conflictSlots.push("shield");
    const offhand = player.equipment.shield ? getItemData(player.equipment.shield) : null;
    if (offhand && isWeaponEquipmentItem(offhand) && !isAssassinOffhandWeaponItem(itemData)) conflictSlots.push("shield");
  } else if (slot === "shield" && player.equipment.weapon) {
    const main = getItemData(player.equipment.weapon);
    if (isTwoHandedWeaponItem(main)) conflictSlots.push("weapon");
  }
  if (player.equipment[slot]) conflictSlots.push(slot);

  [...new Set(conflictSlots)].forEach(conflictSlot => moveEquipmentSlotToInventory(conflictSlot));

  inventoryItem.count -= 1;
  if (inventoryItem.count <= 0) {
    player.inventory = player.inventory.filter(item => String(item.id) !== String(itemData.id));
  }
  player.equipment[slot] = itemData.id;
  normalizeEquipmentHandConflicts();

  if (typeof syncEquipmentGrantedSkills === "function") syncEquipmentGrantedSkills();
  recalculatePlayerStats();
  if (["weapon", "shield"].includes(slot) && typeof syncROStudioWeaponTypeFromEquipment === "function") syncROStudioWeaponTypeFromEquipment();

  const handText = slot === "shield" && isWeaponEquipmentItem(itemData) ? "（副手）" : "";
  addBattleLog("裝備了 " + itemData.name + handText);

  updatePlayerUI();
  updateEquipmentUI();
  updateInventoryUI();
  saveGame();
}

//=======================================
// 把裝備退回背包
//=======================================
function addItemBackToInventory(itemId) {
  const itemData = getItemData(itemId);

  if (!itemData) {
    return;
  }

  const inventoryItem = findInventoryItemById(itemId);

  if (inventoryItem) {
    inventoryItem.count += 1;
  } else {
    player.inventory.push({
      id: itemData.id,
      name: itemData.name,
      count: 1,
      locked: false
    });
  }

  addBattleLog("卸下了 " + itemData.name);
}

//=======================================
// 開發期修復：避免舊存檔已裝備物品仍留在背包
//=======================================
function fixEquippedItemsInInventoryOnce() {
  if (!player || !player.inventory || !player.equipment) {
    return;
  }

  // 已經修過就不要再修，避免玩家之後撿到同名裝備卻被重新整理扣掉
  if (player.fixedEquippedInventoryV1) {
    return;
  }

  Object.values(player.equipment).forEach(itemId => {
    if (!itemId) return;

    const inventoryItem = findInventoryItemById(itemId);

    if (!inventoryItem) return;

    inventoryItem.count -= 1;

    if (inventoryItem.count <= 0) {
      player.inventory = player.inventory.filter(item => String(item.id) !== String(itemId));
    }
  });

  player.fixedEquippedInventoryV1 = true;
}

//=======================================
// 重新計算能力值
//=======================================
function recalculatePlayerStats() {
  if (!player) return;

  if (typeof calculateDerivedPlayerStats === "function") {
    const derived = calculateDerivedPlayerStats();
    if (derived) {
      player.atk = derived.atk;
      player.matk = derived.matk;
      player.def = derived.def;
      player.mdef = derived.mdef;
      player.hit = derived.hit;
      player.flee = derived.flee;
      player.cri = derived.cri;
      player.pAtk = Number(derived.pAtk || 0);
      player.sMatk = Number(derived.sMatk || 0);
      player.res = Number(derived.res || 0);
      player.mres = Number(derived.mres || 0);
      player.hPlus = Number(derived.hPlus || 0);
      player.crate = Number(derived.crate || 0);
      player.hardDef = Number(derived.hardDef || 0);
      player.softDef = Number(derived.softDef || 0);
      player.hardMdef = Number(derived.hardMdef || 0);
      player.softMdef = Number(derived.softMdef || 0);
      player.perfectDodge = Number(derived.perfectDodge || 0);
      player.aspd = derived.aspd;
      player.walkSpeed = derived.walkSpeed ?? (typeof RA_WALK_SPEED !== "undefined" ? RA_WALK_SPEED.DEFAULT : 150);
      if (player.position && typeof getPlayerMovePixelsPerSecond === "function") player.position.moveSpeed = getPlayerMovePixelsPerSecond();
      player.maxHp = derived.maxHp;
      player.maxSp = derived.maxSp;
      if (player.hp > player.maxHp) player.hp = player.maxHp;
      if (player.sp > player.maxSp) player.sp = player.maxSp;
      if (typeof syncStatusPointCache === "function") syncStatusPointCache();
      if (typeof syncTraitPointCache === "function") syncTraitPointCache();
      return;
    }
  }

  // fallback：如果素質系統載入失敗，保留舊版計算避免遊戲卡死。
  player.baseAtk = player.baseAtk ?? 5;
  player.baseDef = player.baseDef ?? 1;

  let atk = player.baseAtk;
  let def = player.baseDef;

  if (player.equipment) {
    Object.values(player.equipment).forEach(itemId => {
      if (!itemId) return;
      const itemData = getItemData(itemId);
      if (!itemData) return;
      atk += itemData.atk || 0;
      def += itemData.def || 0;
    });
  }

  player.maxHp = Math.max(1, Number(player.baseMaxHp || 100));
  player.maxSp = Math.max(0, Number(player.baseMaxSp || 30));
  if (player.hp > player.maxHp) player.hp = player.maxHp;
  if (player.sp > player.maxSp) player.sp = player.maxSp;
  player.atk = Math.max(1, atk);
  player.def = Math.max(0, def);
  player.walkSpeed = typeof RA_WALK_SPEED !== "undefined" ? RA_WALK_SPEED.DEFAULT : 150;
  if (player.position && typeof getPlayerMovePixelsPerSecond === "function") player.position.moveSpeed = getPlayerMovePixelsPerSecond();
}

//=======================================
// 卸除裝備判定
//=======================================
function unequipItem(slot) {
  if (typeof hideGameTooltip === "function") hideGameTooltip();
  if (!player || !player.equipment) return;
  if (!player.equipment[slot]) {
    addBattleLog("這個位置目前沒有裝備。");
    return;
  }

  const itemData = moveEquipmentSlotToInventory(slot);
  if (!itemData) {
    addBattleLog("找不到裝備資料。");
    return;
  }
  normalizeEquipmentHandConflicts();
  if (typeof syncEquipmentGrantedSkills === "function") syncEquipmentGrantedSkills();
  recalculatePlayerStats();
  if (["weapon", "shield"].includes(slot) && typeof syncROStudioWeaponTypeFromEquipment === "function") syncROStudioWeaponTypeFromEquipment();

  updatePlayerUI();
  updateEquipmentUI();
  updateInventoryUI();
  saveGame();
}

//=======================================
// 取得物品資料
//=======================================
function getItemData(itemId) {
  if (itemId === null || itemId === undefined || itemId === "") {
    return null;
  }

  if (typeof items === "undefined" || !items) {
    return null;
  }

  // items.json 如果是陣列，用 String 比對，避免 501 和 "501" 對不起來
  if (Array.isArray(items)) {
    return items.find(item => String(item.id) === String(itemId)) || null;
  }

  // items.json 如果是物件，先用 key 找
  if (items[itemId]) {
    return items[itemId];
  }

  // 再保險：物件格式也用 id 做一次 String 比對
  return Object.values(items).find(item => String(item.id) === String(itemId)) || null;
}

function getItemById(itemId) {
  return getItemData(itemId);
}

//=======================================
// 從背包找物品，避免數字 ID / 文字 ID 對不起來
//=======================================
function findInventoryItemById(itemId) {
  if (!player || !player.inventory) {
    return null;
  }

  return player.inventory.find(item => String(item.id) === String(itemId)) || null;
}

//=======================================
// 肯貝特／武器屬性附魔（0.9.82DN）
//=======================================
const ITEM_PHYSICAL_ELEMENT_ENDOW_BUFF_ID = "item_physical_element_endow";

function getPhysicalElementEndowLabel(element) {
  const labels = { Fire: "火", Water: "水", Earth: "地", Wind: "風", Holy: "聖", Dark: "暗", Ghost: "念", Poison: "毒", Neutral: "無" };
  return labels[String(element || "")] || String(element || "無");
}

function applyPhysicalElementEndowFromItem(itemData) {
  const effect = itemData?.useEffect || {};
  if (String(effect.type || "") !== "physical_element_endow") return false;

  const element = String(effect.element || "").trim();
  const durationMs = Math.max(1000, Number(effect.durationMs || 1200000));
  if (!element) return false;

  player.activeBuffs = getPlainPlayerObject(player.activeBuffs);
  const now = Date.now();
  const buffId = String(effect.buffId || ITEM_PHYSICAL_ELEMENT_ENDOW_BUFF_ID);
  player.activeBuffs[buffId] = {
    id: buffId,
    name: itemData.name,
    sourceItemId: itemData.id,
    startedAt: now,
    expiresAt: now + durationMs,
    effects: {
      attackElementOverride: element,
      physicalDamageOnly: 1,
      affectsAllPlayerPhysicalDamage: 1,
      affectsDualWieldBothHands: 1
    }
  };

  const minutes = Math.max(1, Math.round(durationMs / 60000));
  addBattleLog(`使用了 ${itemData.name}，${minutes} 分鐘內所有物理傷害轉為${getPhysicalElementEndowLabel(element)}屬性；主手與副手同步生效。`);
  return true;
}
window.applyPhysicalElementEndowFromItem = applyPhysicalElementEndowFromItem;

//=======================================
// 使用消耗品
//=======================================
function consumeItem(itemData) {
  if (!itemData) {
    return;
  }

  // 確認背包裡真的有這個道具
  const inventoryItem = findInventoryItemById(itemData.id);

  if (!inventoryItem || inventoryItem.count <= 0) {
    addBattleLog("背包裡沒有 " + itemData.name + "。");
    return;
  }

  // 蒼蠅翅膀：交給 Position Engine 做真正座標瞬移與扣道具。
  if (String(itemData.id) === "601" && typeof useFlyWing === "function") {
    useFlyWing();
    return;
  }

  // 蝴蝶翅膀：返回自動戰鬥設定中的儲存城鎮，預設普隆德拉。
  if (String(itemData.id) === "602" && typeof useButterflyWing === "function") {
    useButterflyWing({ cityId: player?.autoCombat?.teleport?.returnHome?.cityId || "prontera" });
    return;
  }

  // 肯貝特：使用資料中的 useEffect，不按物品 ID 硬寫。
  // 一張肯貝特同時作用主手與刺客副手，並覆蓋所有玩家物理傷害；魔法不受影響。
  const appliedPhysicalEndow = applyPhysicalElementEndowFromItem(itemData);

  // 物品腳本優先：支援 itemheal 與 sc_end。這讓蜂膠、萬能藥及未來新增的異常解除品
  // 不必再在 consumeItem() 內建立逐項白名單。
  const recoveryProfile = typeof window.getItemRecoveryProfile === "function"
    ? window.getItemRecoveryProfile(itemData, { roll: true })
    : { hp: Number(itemData.hp || 0), sp: Number(itemData.sp || 0) };
  const cureProfile = typeof window.getItemStatusCureProfile === "function"
    ? window.getItemStatusCureProfile(itemData)
    : { statuses: [], clearAll: false };
  const activeStatusKeys = typeof window.getPlayerActiveStatusKeys === "function" ? window.getPlayerActiveStatusKeys() : [];
  const matchedStatusKeys = typeof window.getMatchedStatusCureKeys === "function"
    ? window.getMatchedStatusCureKeys(cureProfile, activeStatusKeys)
    : [];
  const removedStatusKeys = typeof window.clearPlayerStatuses === "function"
    ? window.clearPlayerStatuses(matchedStatusKeys)
    : [];
  let itemEffectLogged = false;

  // 補 HP，不超過最大 HP；知識藥水等被動由 Skill Runtime 統一加成。
  if (Number(recoveryProfile.hp || 0) > 0) {
    const recovery = typeof calculateItemRecoveryAmount === "function" ? calculateItemRecoveryAmount(recoveryProfile.hp, "hp") : Number(recoveryProfile.hp || 0);
    const before = Number(player.hp || 0);
    player.hp = Math.min(Number(player.maxHp || before), before + recovery);
    const actual = Math.max(0, player.hp - before);
    addBattleLog("使用了 " + itemData.name + "，HP 恢復 " + actual + "。");
    itemEffectLogged = true;
  }

  // 補 SP，不超過最大 SP；與 HP 回復使用同一套 Runtime 加成。
  if (Number(recoveryProfile.sp || 0) > 0) {
    const recovery = typeof calculateItemRecoveryAmount === "function" ? calculateItemRecoveryAmount(recoveryProfile.sp, "sp") : Number(recoveryProfile.sp || 0);
    const before = Number(player.sp || 0);
    player.sp = Math.min(Number(player.maxSp || before), before + recovery);
    const actual = Math.max(0, player.sp - before);
    addBattleLog("SP 恢復 " + actual + "。");
    itemEffectLogged = true;
  }

  if (removedStatusKeys.length > 0) {
    const label = typeof window.getAutoStatusLabelList === "function"
      ? window.getAutoStatusLabelList(removedStatusKeys)
      : removedStatusKeys.join("、");
    addBattleLog("使用了 " + itemData.name + "，解除" + label + "。");
    itemEffectLogged = true;
  }

  if (!itemEffectLogged && !appliedPhysicalEndow) addBattleLog("使用了 " + itemData.name + "。");

  // 背包扣掉 1 個
  inventoryItem.count -= 1;

  if (inventoryItem.count <= 0) {
    player.inventory = player.inventory.filter(item => String(item.id) !== String(itemData.id));

    // 如果物品用完了，就關閉物品資料欄
    closeItemInfo();
  }

  updatePlayerUI();
  updateInventoryUI();
  saveGame();
}

//=======================================
// 自動補給設定選單
//=======================================
function updateAutoPotionOptions() {
  if (!player || !player.autoPotion) return;

  const hpSelect = document.getElementById("autoHpPotionSelect");
  const spSelect = document.getElementById("autoSpPotionSelect");

  // 如果 index.html 還沒有自動補給 UI，就先跳過，不影響其他功能
  if (!hpSelect || !spSelect) return;

  hpSelect.innerHTML = "";
  spSelect.innerHTML = "";

  const hpPotions = [];
  const spPotions = [];

  player.inventory.forEach(inventoryItem => {
    const itemData = getItemData(inventoryItem.id);

    if (!itemData) return;

    // 只要物品資料有 hp > 0，就視為可補 HP 的物品
    if (itemData.hp && itemData.hp > 0) {
      hpPotions.push({
        inventoryItem: inventoryItem,
        itemData: itemData
      });
    }

    // 只要物品資料有 sp > 0，就視為可補 SP 的物品
    if (itemData.sp && itemData.sp > 0) {
      spPotions.push({
        inventoryItem: inventoryItem,
        itemData: itemData
      });
    }
  });

  if (hpPotions.length === 0) {
    hpSelect.innerHTML = `<option value="">目前沒有可用 HP 藥水</option>`;
  } else {
    hpPotions.forEach(data => {
      const option = document.createElement("option");
      option.value = data.itemData.id;
      option.textContent = `${data.itemData.name} x${data.inventoryItem.count}`;
      hpSelect.appendChild(option);
    });
  }

  if (spPotions.length === 0) {
    spSelect.innerHTML = `<option value="">目前沒有可用 SP 藥水</option>`;
  } else {
    spPotions.forEach(data => {
      const option = document.createElement("option");
      option.value = data.itemData.id;
      option.textContent = `${data.itemData.name} x${data.inventoryItem.count}`;
      spSelect.appendChild(option);
    });
  }

  // 保留玩家原本選擇
  if (player.autoPotion.hpItemId) {
    hpSelect.value = player.autoPotion.hpItemId;
  }

  if (player.autoPotion.spItemId) {
    spSelect.value = player.autoPotion.spItemId;
  }

  // 同步 UI 上的 checkbox / 百分比輸入框
  const autoHpEnabled = document.getElementById("autoHpEnabled");
  const autoHpPercent = document.getElementById("autoHpPercent");
  const autoSpEnabled = document.getElementById("autoSpEnabled");
  const autoSpPercent = document.getElementById("autoSpPercent");

  if (autoHpEnabled) {
    autoHpEnabled.checked = player.autoPotion.hpEnabled;
  }

  if (autoHpPercent) {
    autoHpPercent.value = player.autoPotion.hpPercent;
  }

  if (autoSpEnabled) {
    autoSpEnabled.checked = player.autoPotion.spEnabled;
  }

  if (autoSpPercent) {
    autoSpPercent.value = player.autoPotion.spPercent;
  }

  if (typeof updateAutoCombatUI === "function") {
    updateAutoCombatUI();
  }
}

//=======================================
// 從畫面同步自動補給設定
//=======================================
function syncAutoPotionSettingsFromUI(options = {}) {
  if (!player || !player.autoPotion) return false;

  const autoHpEnabled = document.getElementById("autoHpEnabled");
  const autoHpPercent = document.getElementById("autoHpPercent");
  const autoHpPotionSelect = document.getElementById("autoHpPotionSelect");

  const autoSpEnabled = document.getElementById("autoSpEnabled");
  const autoSpPercent = document.getElementById("autoSpPercent");
  const autoSpPotionSelect = document.getElementById("autoSpPotionSelect");

  if (!autoHpEnabled || !autoHpPercent || !autoHpPotionSelect ||
    !autoSpEnabled || !autoSpPercent || !autoSpPotionSelect) {
    if (!options.silent) {
      addBattleLog("找不到自動補給設定欄位。請確認 index.html 是否已加入自動補給 UI。");
    }
    return false;
  }

  player.autoPotion.hpEnabled = autoHpEnabled.checked;
  player.autoPotion.hpPercent = Number(autoHpPercent.value) || 50;
  player.autoPotion.hpItemId = autoHpPotionSelect.value || null;

  player.autoPotion.spEnabled = autoSpEnabled.checked;
  player.autoPotion.spPercent = Number(autoSpPercent.value) || 50;
  player.autoPotion.spItemId = autoSpPotionSelect.value || null;

  if (options.save) {
    saveGame();
  }

  return true;
}

//=======================================
// 儲存自動補給設定
//=======================================
function saveAutoPotionSettings() {
  const ok = syncAutoPotionSettingsFromUI({
    silent: false,
    save: true
  });

  if (!ok) return;

  const hpName = player.autoPotion.hpItemId ? getItemName(player.autoPotion.hpItemId) : "未選擇";
  const spName = player.autoPotion.spItemId ? getItemName(player.autoPotion.spItemId) : "未選擇";

  addBattleLog(
    "自動補給設定已更新：HP " +
    (player.autoPotion.hpEnabled ? "開啟" : "關閉") +
    " / " +
    player.autoPotion.hpPercent +
    "% / " +
    hpName +
    "，SP " +
    (player.autoPotion.spEnabled ? "開啟" : "關閉") +
    " / " +
    player.autoPotion.spPercent +
    "% / " +
    spName
  );
}

//=======================================
// 自動使用 HP 藥水
//=======================================
function autoUseHpPotion() {
  if (!player || !player.autoPotion) return;

  const setting = player.autoPotion;

  if (!setting.hpEnabled) return;
  if (!setting.hpItemId) return;

  const hpPercent = (player.hp / player.maxHp) * 100;

  // HP 還高於設定百分比，不喝水
  if (hpPercent > setting.hpPercent) return;

  const inventoryItem = findInventoryItemById(setting.hpItemId);

  if (!inventoryItem || inventoryItem.count <= 0) {
    addBattleLog("HP 過低，但背包沒有設定的 HP 藥水。");
    return;
  }

  const itemData = getItemData(inventoryItem.id);

  if (!itemData || !itemData.hp || itemData.hp <= 0) {
    addBattleLog("設定的物品不是 HP 藥水，請重新選擇。");
    return;
  }

  const recovery = typeof calculateItemRecoveryAmount === "function" ? calculateItemRecoveryAmount(itemData.hp, "hp") : Number(itemData.hp || 0);
  const before = Number(player.hp || 0);
  player.hp = Math.min(Number(player.maxHp || before), before + recovery);
  const actualRecovery = Math.max(0, Number(player.hp || 0) - before);

  inventoryItem.count -= 1;

  if (inventoryItem.count <= 0) {
    player.inventory = player.inventory.filter(item => String(item.id) !== String(inventoryItem.id));
  }

  addBattleLog("自動使用 " + itemData.name + "，HP 恢復 " + actualRecovery + "。");

  updatePlayerUI();
  updateInventoryUI();
  saveGame();
}

//=======================================
// 自動使用 SP 藥水
//=======================================
function autoUseSpPotion() {
  if (!player || !player.autoPotion) return;

  const setting = player.autoPotion;

  if (!setting.spEnabled) return;
  if (!setting.spItemId) return;

  const spPercent = (player.sp / player.maxSp) * 100;

  // SP 還高於設定百分比，不喝水
  if (spPercent > setting.spPercent) return;

  const inventoryItem = findInventoryItemById(setting.spItemId);

  if (!inventoryItem || inventoryItem.count <= 0) {
    addBattleLog("SP 過低，但背包沒有設定的 SP 藥水。");
    return;
  }

  const itemData = getItemData(inventoryItem.id);

  if (!itemData || !itemData.sp || itemData.sp <= 0) {
    addBattleLog("設定的物品不是 SP 藥水，請重新選擇。");
    return;
  }

  const recovery = typeof calculateItemRecoveryAmount === "function" ? calculateItemRecoveryAmount(itemData.sp, "sp") : Number(itemData.sp || 0);
  const before = Number(player.sp || 0);
  player.sp = Math.min(Number(player.maxSp || before), before + recovery);
  const actualRecovery = Math.max(0, Number(player.sp || 0) - before);

  inventoryItem.count -= 1;

  if (inventoryItem.count <= 0) {
    player.inventory = player.inventory.filter(item => String(item.id) !== String(inventoryItem.id));
  }

  addBattleLog("自動使用 " + itemData.name + "，SP 恢復 " + actualRecovery + "。");

  updatePlayerUI();
  updateInventoryUI();
  saveGame();
}

//=======================================
// 自動補給總入口
//=======================================
function autoUsePotionLegacy() {
  // v0.6 起自動戰鬥改由 js/auto_battle.js 的 autoUsePotion() 管理。
  // 此函式只保留給舊版 UI 相容，避免與新 AutoBattleEngine 混用。
  syncAutoPotionSettingsFromUI({
    silent: true,
    save: false
  });

  autoUseHpPotion();
  autoUseSpPotion();
}
