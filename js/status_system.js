//=======================================
// StatusSystem v0.9.82GN
// 一般素質 + rAthena Renewal 四轉特性素質 + 全域 +10 配點模式 + 響應式進階戰鬥資訊
//=======================================
let statPointData = { points: {} };
let traitPointData = { points: {}, raPoints: {}, multiplier: 2, startLevel: 201, allocationStartLevel: 200, maxLevel: 275, jobChangeBonus: 7, perTraitAllocationCap: 110 };
let jobStatBonuses = {};
let jobBasePoints = {};
let renewalJobAspd = { jobs: {} };
const INITIAL_STATUS_POINTS = 25;

// 0.9.82FY：素質視窗效能排程。
// 戰鬥中的 HP／SP／EXP 更新不可反覆重建整個進階屬性 DOM；
// 視窗關閉時完全停更，使用者滾動進階內容時延後重繪，避免滾輪卡頓。
const STATUS_UI_REFRESH_MIN_MS = 120;
const STATUS_UI_AUTOBATTLE_REFRESH_MIN_MS = 2500;
const STATUS_ADVANCED_SCROLL_IDLE_MS = 650;
const STATUS_CONTROL_INTERACTION_GUARD_MS = 420;
let statusUiRefreshTimer = null;
let statusUiLastRenderAt = 0;
let statusAdvancedInteractionUntil = 0;
let statusControlInteractionUntil = 0;
let statusAllocationCommitFrame = 0;
let statusAllocationSaveTimer = 0;
const pendingStatusAllocationLogs = new Map();

function isStatusWindowVisible() {
  const win = document.getElementById("status-window");
  return Boolean(win && !win.classList.contains("hidden-window"));
}

function cancelScheduledStatusUIUpdate() {
  if (statusUiRefreshTimer !== null) {
    clearTimeout(statusUiRefreshTimer);
    statusUiRefreshTimer = null;
  }
}

function markStatusAdvancedInteraction() {
  const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  statusAdvancedInteractionUntil = Math.max(statusAdvancedInteractionUntil, now + STATUS_ADVANCED_SCROLL_IDLE_MS);
  if (statusUiRefreshTimer !== null) {
    cancelScheduledStatusUIUpdate();
    requestStatusUIUpdate();
  }
}

function markStatusControlInteraction(durationMs = STATUS_CONTROL_INTERACTION_GUARD_MS) {
  const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  statusControlInteractionUntil = Math.max(statusControlInteractionUntil, now + Math.max(120, Number(durationMs || 0)));
  cancelScheduledStatusUIUpdate();
}

function ensureStatusControlInteractionBinding() {
  const win = document.getElementById("status-window");
  if (!win || win.dataset.statusControlGuardBound === "1") return;
  win.dataset.statusControlGuardBound = "1";
  const pointerEvents=["pointerdown","pointerup","mousedown","mouseup","touchstart","touchend","click"];
  pointerEvents.forEach(type=>win.addEventListener(type,event=>{
    const control=event.target?.closest?.("button,input,select,textarea,.status-css-row,.status-trait-stat-row");
    if(!control)return;
    markStatusControlInteraction(520);
    event.stopPropagation();
  },{capture:false,passive:type.startsWith("touch")}));
  win.addEventListener("keydown",event=>{if(event.target?.closest?.("button,input,select,textarea")){markStatusControlInteraction(520);event.stopPropagation();}},false);
}

function queueStatusAllocationCommit(logKey,label,value,amount){
  if(logKey){const prior=pendingStatusAllocationLogs.get(logKey);pendingStatusAllocationLogs.set(logKey,{label,value,amount:Number(amount||0)+Number(prior?.amount||0)});}
  if(!statusAllocationCommitFrame){
    const schedule=window.requestAnimationFrame||((fn)=>setTimeout(fn,16));
    statusAllocationCommitFrame=schedule(()=>{
      statusAllocationCommitFrame=0;
      window.invalidatePlayerUiRenderCaches?.("status");
      if(typeof updatePlayerUI==="function")updatePlayerUI();
      // 下一個動畫幀立即刷新數字與剩餘點數，不等待互動保護計時器。
      if(typeof updateStatusUI==="function"&&isStatusWindowVisible())updateStatusUI({force:true,allocationCommit:true});
      for(const row of pendingStatusAllocationLogs.values())if(typeof addBattleLog==="function")addBattleLog(`${row.label} +${row.amount}，目前 ${row.value}。`);
      pendingStatusAllocationLogs.clear();
    });
  }
  clearTimeout(statusAllocationSaveTimer);
  statusAllocationSaveTimer=setTimeout(()=>{statusAllocationSaveTimer=0;if(typeof requestGameSave==="function")requestGameSave(0);else if(typeof saveGame==="function")saveGame();},100);
}

function requestStatusUIUpdate(options = {}) {
  if (!player || !isStatusWindowVisible()) {
    cancelScheduledStatusUIUpdate();
    return false;
  }
  if (options.force === true) {
    cancelScheduledStatusUIUpdate();
    updateStatusUI({ force: true });
    return true;
  }

  // 0.9.82ID：掛機中素質欄只保留開窗時的完整快照。
  // HP／SP／EXP 仍由主 HUD 即時更新；避免每次戰鬥結算都重建整個素質與進階面板，
  // 造成自動戰鬥 timer 長時間飢餓、只轉向而無法攻擊。
  if (typeof isAutoBattleRunning === "function" && isAutoBattleRunning()) return true;

  const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  const combatRefreshMinMs = (typeof isAutoBattleRunning === "function" && isAutoBattleRunning())
    ? STATUS_UI_AUTOBATTLE_REFRESH_MIN_MS
    : STATUS_UI_REFRESH_MIN_MS;
  const renderAfter = Math.max(
    statusUiLastRenderAt + combatRefreshMinMs,
    player.statusAdvancedExpanded ? statusAdvancedInteractionUntil : 0,
    statusControlInteractionUntil
  );
  const delay = Math.max(0, Math.ceil(renderAfter - now));
  if (statusUiRefreshTimer !== null) return true;
  statusUiRefreshTimer = setTimeout(() => {
    statusUiRefreshTimer = null;
    if (!isStatusWindowVisible()) return;
    const current = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    if (player?.statusAdvancedExpanded && current < statusAdvancedInteractionUntil) {
      requestStatusUIUpdate();
      return;
    }
    updateStatusUI({ scheduled: true });
  }, delay);
  return true;
}

function handleStatusWindowVisibilityChange(isOpen) {
  if (!isOpen) {
    cancelScheduledStatusUIUpdate();
    return false;
  }
  ensureStatusControlInteractionBinding();
  const rendered = requestStatusUIUpdate({ force: true, reason: "status_window_open" });
  if (typeof wakeAutoBattleScheduler === "function") wakeAutoBattleScheduler("status_window_open");
  return rendered;
}

async function loadStatusData() {
  try {
    const [statData, traitData, bonusData, baseData, aspdData] = await Promise.all([
      loadJson("./data/statpoints.json", { points: { "1": 48, "200": 4099 } }),
      loadJson("./data/trait_statpoints.json", { points: {}, raPoints: {}, multiplier: 2, startLevel: 201, allocationStartLevel: 200, maxLevel: 275, jobChangeBonus: 7, perTraitAllocationCap: 110 }),
      loadJson("./data/job_stat_bonuses.json", {}),
      loadJson("./data/job_basepoints.json", {}),
      loadJson("./data/combat_runtime/renewal_job_aspd.json", { jobs: {} })
    ]);
    statPointData = statData;
    traitPointData = traitData || traitPointData;
    jobStatBonuses = bonusData;
    jobBasePoints = baseData;
    renewalJobAspd = aspdData || { jobs: {} };
    if (player && typeof normalizeStatusData === "function") normalizeStatusData();
    console.log("素質資料載入完成：", { statPointData, traitPointData, jobStatBonuses, jobBasePoints, renewalJobAspd });
  } catch (error) {
    console.warn("素質資料載入失敗，使用 fallback。", error);
    statPointData = { points: { "1": 48, "200": 4099 } };
    traitPointData = { points: {}, raPoints: {}, multiplier: 2, startLevel: 201, allocationStartLevel: 200, maxLevel: 275, jobChangeBonus: 7, perTraitAllocationCap: 110 };
    jobStatBonuses = {};
    jobBasePoints = {};
    renewalJobAspd = { jobs: {} };
  }
}

const STATUS_KEYS = ["str", "agi", "vit", "int", "dex", "luk"];
const STATUS_LABELS = {
  str: "STR",
  agi: "AGI",
  vit: "VIT",
  int: "INT",
  dex: "DEX",
  luk: "LUK"
};
const STATUS_DESCRIPTIONS = {
  str: "增加近戰 ATK。",
  agi: "增加 FLEE 迴避與 ASPD 攻擊速度。",
  vit: "增加 Max HP、DEF 與 HP 回復。",
  int: "增加 MATK、Max SP、MDEF 與 SP 回復。",
  dex: "增加 HIT 命中、少量 ATK，之後也會影響詠唱。",
  luk: "增加 CRI，並少量影響 ATK、MATK、HIT、FLEE。"
};

const TRAIT_KEYS = ["pow", "sta", "wis", "spl", "con", "crt"];
const TRAIT_LABELS = { pow: "POW", sta: "STA", wis: "WIS", spl: "SPL", con: "CON", crt: "CRT" };
const TRAIT_NAMES = { pow: "威力", sta: "耐力", wis: "智慧", spl: "法術", con: "集中", crt: "創造" };
const TRAIT_DESCRIPTIONS = {
  pow: "POW 威力：每 1 點 Status ATK +5；每 3 點 P.ATK +1%。",
  sta: "STA 耐力：RES = STA + floor(STA ÷ 3) × 5，降低物理傷害。",
  wis: "WIS 智慧：MRES = WIS + floor(WIS ÷ 3) × 5，降低魔法傷害。",
  spl: "SPL 法術：每 1 點 MATK +5；每 3 點 S.MATK +1%。",
  con: "CON 集中：每 1 點 HIT/FLEE +2；每 5 點 P.ATK/S.MATK +1%。",
  crt: "CRT 創造：每 1 點 H.Plus +1%；每 3 點 C.RATE +1。"
};
const TRAIT_ALLOCATION_CAP = 110;

function normalizeStatusData() {
  if (!player) return;
  player.stats = { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1, ...(player.stats || {}) };

  // `traits` is the canonical save field. `traitStats` remains an alias so older
  // skills and saves continue to work without duplicating formula paths.
  const savedTraits = player.traits && typeof player.traits === "object"
    ? player.traits
    : (player.traitStats && typeof player.traitStats === "object" ? player.traitStats : {});
  player.traits = { pow: 0, sta: 0, wis: 0, spl: 0, con: 0, crt: 0, ...savedTraits };
  TRAIT_KEYS.forEach(key => {
    player.traits[key] = Math.max(0, Math.min(TRAIT_ALLOCATION_CAP, Math.floor(Number(player.traits[key] || 0))));
  });
  // Old/developer saves may contain reserved trait values that were never paid for.
  // Keep the save legal by trimming only player allocation (Job/equipment bonuses are separate).
  const earnedTraitBudget = getTotalTraitPointsForLevel(player.baseLevel);
  let allocatedTraitTotal = TRAIT_KEYS.reduce((sum, key) => sum + Number(player.traits[key] || 0), 0);
  let illegalExcess = Math.max(0, allocatedTraitTotal - earnedTraitBudget);
  for (const key of [...TRAIT_KEYS].reverse()) {
    if (illegalExcess <= 0) break;
    const remove = Math.min(illegalExcess, Number(player.traits[key] || 0));
    player.traits[key] -= remove;
    illegalExcess -= remove;
  }
  player.traitStats = player.traits;
  player.usedTraitPoints = TRAIT_KEYS.reduce((sum, key) => sum + Number(player.traits[key] || 0), 0);
  player.statusTraitsExpanded = Boolean(player.statusTraitsExpanded);
  player.statusAllocationStep = Number(player.statusAllocationStep) === 10 ? 10 : 1;
  player.statusAdvancedExpanded = Boolean(player.statusAdvancedExpanded);
  player.statusAdvancedTab = ["damage", "casting", "defense"].includes(String(player.statusAdvancedTab)) ? String(player.statusAdvancedTab) : "damage";

  STATUS_KEYS.forEach(key => {
    player.stats[key] = Math.max(1, Math.floor(Number(player.stats[key] || 1)));
  });
  player.usedStatusPoints = Math.max(0, Math.floor(Number(player.usedStatusPoints || 0)));
  // Lv1 初始可分配素質點固定給 25 點。
  // rAthena statpoints Lv1 total=48，所以 offset 要保留 48-25=23。
  // 轉生後採憲法固定重置：不繼承舊剩餘點，固定從 125 點開始，再隨 Base Lv 成長。
  if (player.rebirthStatusPointPolicy === "fixed_reset_not_carry") {
    const fixedPoints = Number(player.rebirthFixedStatusPoints || 125);
    player.statusPointBaseOffset = getTotalStatusPointsForLevel(1) - fixedPoints;
  } else {
    player.statusPointBaseOffset = getInitialStatusPointBaseOffset();
  }
  syncStatusPointCache();
  syncTraitPointCache();
}

function getTotalStatusPointsForLevel(level) {
  const points = statPointData?.points || {};
  // Renewal 普通素質點在 Base Lv.200 固定 4099，201 之後不再增加。
  const lv = Math.min(200, Math.max(1, Math.floor(Number(level || 1))));
  if (Number.isFinite(Number(points[lv]))) return Number(points[lv]);
  if (Number.isFinite(Number(points[String(lv)]))) return Number(points[String(lv)]);

  // fallback：Lv1 48，之後約每級 +3~12，避免資料載入失敗就卡住。
  let total = Number(points["1"] || 48);
  for (let i = 2; i <= lv; i += 1) total += Math.max(3, Math.floor((i + 7) / 5));
  return total;
}

function getInitialStatusPointBaseOffset() {
  return Math.max(0, getTotalStatusPointsForLevel(1) - INITIAL_STATUS_POINTS);
}

function getAvailableStatusPoints() {
  if (!player) return 0;
  const total = getTotalStatusPointsForLevel(player.baseLevel);
  const baseOffset = Number(player.statusPointBaseOffset ?? getTotalStatusPointsForLevel(1));
  return Math.max(0, total - baseOffset - Number(player.usedStatusPoints || 0));
}

function syncStatusPointCache() {
  if (!player) return;
  player.statusPoints = getAvailableStatusPoints();
}

function getTraitLevelPointsForLevel(level) {
  const lv = Math.max(1, Math.min(Number(traitPointData?.maxLevel || 275), Math.floor(Number(level || 1))));
  if (lv < Number(traitPointData?.startLevel || 201)) return 0;
  const points = traitPointData?.points || {};
  if (Number.isFinite(Number(points[lv]))) return Number(points[lv]);
  if (Number.isFinite(Number(points[String(lv)]))) return Number(points[String(lv)]);

  // Exact RO_WEB fallback: RA ordinary level +3 / every fifth level +7, then ×2.
  let total = 0;
  for (let current = 201; current <= lv; current += 1) total += current % 5 === 0 ? 14 : 6;
  return total;
}

function getTraitJobChangeBonus(jobKey = player?.jobKey, level = player?.baseLevel) {
  const allocationStartLevel = Number(traitPointData?.allocationStartLevel || 200);
  if (Number(level || 1) < allocationStartLevel || !isTraitAllocationJob(jobKey)) return 0;
  return Math.max(0, Math.floor(Number(traitPointData?.jobChangeBonus ?? 7)));
}

function getTotalTraitPointsForLevel(level, jobKey = player?.jobKey) {
  return getTraitLevelPointsForLevel(level) + getTraitJobChangeBonus(jobKey, level);
}

function getTraitPointsGainedAtLevel(level) {
  const lv = Math.floor(Number(level || 1));
  // 升級取得量只比較 statpoint.yml 的等級表；四轉轉職贈送 7 點另行計算。
  return Math.max(0, getTraitLevelPointsForLevel(lv) - getTraitLevelPointsForLevel(lv - 1));
}

function getAvailableTraitPoints() {
  if (!player) return 0;
  const used = TRAIT_KEYS.reduce((sum, key) => sum + Math.max(0, Number(player.traits?.[key] || 0)), 0);
  return Math.max(0, getTotalTraitPointsForLevel(player.baseLevel) - used);
}

function syncTraitPointCache() {
  if (!player) return;
  player.usedTraitPoints = TRAIT_KEYS.reduce((sum, key) => sum + Math.max(0, Number(player.traits?.[key] || 0)), 0);
  player.availableTraitPoints = getAvailableTraitPoints();
  player.traitPoints = player.availableTraitPoints;
}

function isTraitAllocationJob(jobKey = player?.jobKey) {
  const key = String(jobKey || "");
  const job = typeof getJobData === "function" ? getJobData(key) : null;
  return key === "hyper_novice" || Number(job?.tier || 0) === 4 || String(job?.routeGroup || "") === "fourth";
}

function getTraitAllocationLockReason() {
  if (!isTraitAllocationJob()) return "轉為四轉職業後才可分配特性素質。";
  if (getAvailableTraitPoints() <= 0) return "目前沒有剩餘特性點數。";
  return "";
}

function getJobBonusEntry(jobKey = player?.jobKey) {
  return jobStatBonuses?.[jobKey] || jobStatBonuses?.novice || { bonusStats: [] };
}

function getJobStatBonus(jobKey = player?.jobKey, jobLevel = player?.jobLevel) {
  const result = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0, pow: 0, sta: 0, wis: 0, spl: 0, con: 0, crt: 0 };
  const entry = getJobBonusEntry(jobKey);
  const lv = Number(jobLevel || 1);
  (entry.bonusStats || []).forEach(row => {
    if (Number(row.level || 0) > lv) return;
    [...STATUS_KEYS, ...TRAIT_KEYS].forEach(key => { result[key] += Number(row[key] || 0); });
  });
  return result;
}

function getPlayerTotalBasicStats() {
  normalizeStatusData();
  const jobBonus = getJobStatBonus();
  const total = {};
  const equipment = getEquipmentBonusTotals();
  const training = typeof getTrainingBonusTotals === "function" ? getTrainingBonusTotals() : {};
  const passive = typeof getPassiveSkillBonusTotals === "function" ? getPassiveSkillBonusTotals() : {};
  const activeBuffs = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
  STATUS_KEYS.forEach(key => {
    const flat = Number(player.stats[key] || 1) + Number(jobBonus[key] || 0)
      + Number(equipment[key + "Flat"] || 0) + Number(equipment.allStatsFlat || 0)
      + Number(training[key + "Flat"] || 0) + Number(passive[key + "Flat"] || 0) + Number(activeBuffs[key + "Flat"] || 0);
    const rate = Number(equipment[key + "Rate"] || 0) + Number(equipment.allStatsRate || 0)
      + Number(training[key + "Rate"] || 0) + Number(passive[key + "Rate"] || 0) + Number(activeBuffs[key + "Rate"] || 0)
      + Number(training.allStatsRate || 0) + Number(passive.allStatsRate || 0) + Number(activeBuffs.allStatsRate || 0);
    total[key] = Math.max(1, Math.floor(flat * (100 + rate) / 100));
  });
  TRAIT_KEYS.forEach(key => {
    total[key] = Math.max(0, Math.floor(Number(player.traits?.[key] || 0) + Number(jobBonus[key] || 0)
      + Number(equipment[key + "Flat"] || 0) + Number(training[key + "Flat"] || 0)
      + Number(passive[key + "Flat"] || 0) + Number(activeBuffs[key + "Flat"] || 0)));
  });
  return total;
}

function getJobBaseValue(type, level, jobKey = player?.jobKey) {
  const table = jobBasePoints?.[jobKey]?.[type] || jobBasePoints?.novice?.[type] || {};
  const lv = Math.max(1, Math.floor(Number(level || 1)));
  if (Number.isFinite(Number(table[lv]))) return Number(table[lv]);
  if (Number.isFinite(Number(table[String(lv)]))) return Number(table[String(lv)]);
  return type === "baseHp" ? (40 + (lv - 1) * 5) : (11 + Math.floor((lv - 1) * 0.7));
}

function getStatusModifierWrappers(source) {
  return source ? [
    source,
    source.effects,
    source.bonuses,
    source.statusModifiers,
    source.runtimeStatusModifiers,
    source.combatModifiers,
    source.runtimeCombatModifiers,
    source.timingModifiers,
    source.runtimeTimingModifiers
  ].filter(value => value && typeof value === "object" && !Array.isArray(value)) : [];
}

function getEquippedStatusSources() {
  if (window.EffectRuntime?.getSources) return window.EffectRuntime.getSources(player, { includeBaseItems:true, includeScripts:true, includePassive:false, includeActive:false });
  if (!player?.equipment || typeof getItemData !== "function") return [];
  const result = [];
  const mainId = player.equipment.weapon;
  const mainItem = mainId ? getItemData(mainId) : null;
  Object.entries(player.equipment).forEach(([slot, itemId]) => {
    if (!itemId) return;
    if ((slot === "shield" || slot === "leftWeapon") && itemId === mainId && mainItem && (mainItem.twoHanded || mainItem.hands === 2 || mainItem.weaponHands === 2)) return;
    const item = getItemData(itemId);
    if (item) result.push(item);
  });
  if (window.CardRuntime?.getSources) result.push(...window.CardRuntime.getSources());
  return result;
}

function sumStatusSourceNumber(source, key, aliases = []) {
  let total = 0;
  getStatusModifierWrappers(source).forEach(wrapper => {
    [key, ...aliases].forEach(name => {
      const raw = wrapper[name];
      if (Number.isFinite(Number(raw))) total += Number(raw);
      else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const nested = raw.current ?? raw.all ?? raw.All ?? raw.ALL;
        if (Number.isFinite(Number(nested))) total += Number(nested);
      }
    });
  });
  return total;
}

const EQUIPMENT_STATUS_BONUS_KEYS = [
  "allStatsFlat","allStatsRate","strFlat","agiFlat","vitFlat","intFlat","dexFlat","lukFlat",
  "strRate","agiRate","vitRate","intRate","dexRate","lukRate",
  "powFlat","staFlat","wisFlat","splFlat","conFlat","crtFlat",
  "atkRate","atkFlat","matkRate","matkFlat","defRate","defFlat","hardDefRate","hardDefFlat","softDefRate","softDefFlat","def2Rate","def2Flat",
  "mdefRate","mdefFlat","hardMdefRate","hardMdefFlat","softMdefRate","softMdefFlat","mdef2Rate","mdef2Flat",
  "hitRate","hitFlat","fleeRate","fleeFlat","criRate","criFlat","perfectDodgeFlat","perfectDodge",
  "aspdRate","aspdFlat","aspdSkillFlat","raAspdSkillFlat","attackDelayRate","aspdDelayRate","mountedAspdPenaltyRate",
  "walkSpeedFlat","walkSpeedRate","moveSpeedRate","maxHpRate","maxHpFlat","maxSpRate","maxSpFlat",
  "resFlat","resRate","mresFlat","mresRate","pAtk","pAtkRate","sMatk","sMatkRate","hPlus","hPlusRate","crateFlat","crateRate",
  "shieldDefRate"
];

function getEquipmentBonusTotals() {
  const totals = {};
  getEquippedStatusSources().forEach(source => {
    EQUIPMENT_STATUS_BONUS_KEYS.forEach(key => { totals[key] = Number(totals[key] || 0) + sumStatusSourceNumber(source, key); });
    STATUS_KEYS.forEach(key => {
      totals[key + "Flat"] = Number(totals[key + "Flat"] || 0) + sumStatusSourceNumber(source, key, [key.toUpperCase()]);
    });
    ["pow","sta","wis","spl","con","crt"].forEach(key => {
      totals[key + "Flat"] = Number(totals[key + "Flat"] || 0) + sumStatusSourceNumber(source, key, [key.toUpperCase()]);
    });
  });
  return totals;
}

function getEquipmentStatTotals() {
  const totals = {
    atk: 0, def: 0, matk: 0, mdef: 0, hit: 0, flee: 0, cri: 0, aspd: 0, maxHp: 0, maxSp: 0,
    walkSpeedFlat: 0, walkSpeedRate: 0
  };
  getEquippedStatusSources().forEach(source => {
    Object.keys(totals).forEach(key => { totals[key] += sumStatusSourceNumber(source, key); });
  });
  return totals;
}

function collectPercentAndFlatBonuses() {
  const equipmentBonuses = getEquipmentBonusTotals();
  const trainingBonuses = typeof getTrainingBonusTotals === "function" ? getTrainingBonusTotals() : {};
  const passiveBonuses = typeof getPassiveSkillBonusTotals === "function" ? getPassiveSkillBonusTotals() : {};
  const buffBonuses = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
  const bonuses = {};
  [equipmentBonuses, trainingBonuses, passiveBonuses, buffBonuses].forEach(source => {
    Object.keys(source || {}).forEach(key => {
      const value = Number(source[key]);
      if (Number.isFinite(value)) bonuses[key] = Number(bonuses[key] || 0) + value;
    });
  });
  return bonuses;
}

function getRenewalAspdWeaponKey(item) {
  if (!item) return "Fist";
  const type = String(item.dbSubType || item.SubType || item.subType || item.weaponType || item.subCategory || "").toLowerCase();
  const two = item.twoHanded === true || Number(item.hands || item.weaponHands || 1) >= 2 || /2h|two.?hand/.test(type);
  if (/dagger|short.?sword/.test(type)) return "Dagger";
  if (/sword/.test(type)) return two ? "2hSword" : "1hSword";
  if (/spear|lance/.test(type)) return two ? "2hSpear" : "1hSpear";
  if (/axe/.test(type)) return two ? "2hAxe" : "1hAxe";
  if (/mace|hammer|club/.test(type)) return two ? "2hMace" : "Mace";
  if (/staff|rod|wand/.test(type)) return two ? "2hStaff" : "Staff";
  if (/bow/.test(type)) return "Bow";
  if (/knuckle|fist/.test(type)) return "Knuckle";
  if (/instrument|musical/.test(type)) return "Musical";
  if (/whip/.test(type)) return "Whip";
  if (/book/.test(type)) return "Book";
  if (/katar/.test(type)) return "Katar";
  if (/revolver/.test(type)) return "Revolver";
  if (/rifle/.test(type)) return "Rifle";
  if (/gatling/.test(type)) return "Gatling";
  if (/shotgun/.test(type)) return "Shotgun";
  if (/grenade/.test(type)) return "Grenade";
  if (/huuma|shuriken/.test(type)) return "Huuma";
  return "Fist";
}

function calculateRenewalBaseAspd(stats, bonuses = {}) {
  const job = typeof getCurrentJobData === "function" ? getCurrentJobData() : null;
  const raJob = String(job?.raJob || "Novice");
  const table = renewalJobAspd?.jobs?.[raJob] || renewalJobAspd?.jobs?.Novice || { Fist: 40, Shield: 10 };
  const main = player?.equipment?.weapon && typeof getItemData === "function" ? getItemData(player.equipment.weapon) : null;
  const offId = player?.equipment?.leftWeapon || player?.equipment?.shield;
  const off = offId && typeof getItemData === "function" ? getItemData(offId) : null;
  const offIsWeapon = !!(off && (off.slot === "weapon" || off.category === "weapon" || off.dbType === "Weapon" || off.Type === "Weapon"));
  const mainKey = getRenewalAspdWeaponKey(main);
  let penalty = Number(table[mainKey] ?? table.Fist ?? 40);
  if (off && !offIsWeapon) penalty += Number(table.Shield || 0);
  else if (offIsWeapon && offId !== player?.equipment?.weapon) penalty += Number(table[getRenewalAspdWeaponKey(off)] || 0) / 4;
  const ranged = ["Bow","Musical","Whip","Revolver","Rifle","Gatling","Shotgun","Grenade"].includes(mainKey);
  const dex = Number(stats.dex || 0), agi = Number(stats.agi || 0);
  const temp = Math.sqrt(dex * dex / (ranged ? 7 : 5) + agi * agi * 0.5) * 0.25 + 196;
  const skillAspd = Number(bonuses.raAspdSkillFlat || bonuses.aspdSkillFlat || 0);
  return Math.floor(temp + skillAspd * agi / 200) - Math.min(penalty, 200);
}

function calculateDerivedPlayerStats() {
  if (!player) return null;
  normalizeStatusData();

  const s = getPlayerTotalBasicStats();
  const baseLevel = Math.max(1, Number(player.baseLevel || 1));
  const equip = getEquipmentStatTotals();
  const bonuses = collectPercentAndFlatBonuses();

  const equippedWeapon = player?.equipment?.weapon && typeof getItemData === "function" ? getItemData(player.equipment.weapon) : null;
  const equippedWeaponType = String(equippedWeapon?.dbSubType || equippedWeapon?.SubType || equippedWeapon?.subType || equippedWeapon?.weaponType || equippedWeapon?.subCategory || "").toLowerCase();
  const rangedBaseAtk = /bow|instrument|whip|gun|revolver|rifle|shotgun|gatling|grenade/.test(equippedWeaponType);
  const primaryAtkStat = rangedBaseAtk ? s.dex : s.str;
  const secondaryAtkStat = rangedBaseAtk ? s.str : s.dex;
  let atk = Math.floor(baseLevel / 4) + primaryAtkStat + Math.floor(secondaryAtkStat / 5) + Math.floor(s.luk / 3) + 5 * Number(s.pow || 0) + equip.atk;
  let matk = s.int + Math.floor(s.int / 2) + Math.floor(s.dex / 5) + Math.floor(s.luk / 3) + Math.floor(baseLevel / 4) + 5 * Number(s.spl || 0) + equip.matk;
  // Renewal keeps equipment Hard DEF/MDEF separate from stat-derived Soft DEF/MDEF.
  // They use different reduction formulas and different pierce modifiers.
  let hardDef = Math.max(0, Number(equip.def || 0));
  let softDef = Math.floor((baseLevel + s.vit) / 2) + Math.floor(s.agi / 5);
  let hardMdef = Math.max(0, Number(equip.mdef || 0));
  let softMdef = s.int + Math.floor(baseLevel / 4) + Math.floor((s.dex + s.vit) / 5);
  let hit = 175 + baseLevel + s.dex + Math.floor(s.luk / 3) + 2 * Number(s.con || 0) + equip.hit;
  let flee = 100 + baseLevel + s.agi + Math.floor(s.luk / 5) + 2 * Number(s.con || 0) + equip.flee;
  // Renewal CRI is stored by RA in per-mille: 10 + BaseLv/10 + LUK*3.
  // RO_WEB exposes percentage directly, therefore divide the RA value by 10.
  let cri = 1 + baseLevel / 100 + Number(s.luk || 0) * 0.3 + equip.cri;
  let aspd = calculateRenewalBaseAspd(s, bonuses) + equip.aspd;

  // Movement Engine v0.1：RA WalkSpeed 數值越小越快。
  // 支援裝備/卡片/技能/Buff 使用 walkSpeedFlat / walkSpeedRate 調整：
  // walkSpeedFlat = -25 代表變快，+25 代表變慢；walkSpeedRate = -20 代表速度值降低 20%。
  let walkSpeed = typeof RA_WALK_SPEED !== "undefined" ? RA_WALK_SPEED.DEFAULT : 150;
  walkSpeed += Number(equip.walkSpeedFlat || 0);

  atk = Math.floor(atk * (100 + Number(bonuses.atkRate || 0)) / 100) + Number(bonuses.atkFlat || 0);
  hardDef = Math.floor(hardDef * (100 + Number(bonuses.defRate || 0) + Number(bonuses.hardDefRate || 0) + Number(bonuses.shieldDefRate || 0)) / 100)
    + Number(bonuses.defFlat || 0) + Number(bonuses.hardDefFlat || 0);
  softDef = Math.floor(softDef * (100 + Number(bonuses.softDefRate || bonuses.def2Rate || 0)) / 100)
    + Number(bonuses.softDefFlat || bonuses.def2Flat || 0);
  matk = Math.floor(matk * (100 + Number(bonuses.matkRate || 0)) / 100) + Number(bonuses.matkFlat || 0);
  hardMdef = Math.floor(hardMdef * (100 + Number(bonuses.mdefRate || 0) + Number(bonuses.hardMdefRate || 0)) / 100)
    + Number(bonuses.mdefFlat || 0) + Number(bonuses.hardMdefFlat || 0);
  softMdef = Math.floor(softMdef * (100 + Number(bonuses.softMdefRate || bonuses.mdef2Rate || 0)) / 100)
    + Number(bonuses.softMdefFlat || bonuses.mdef2Flat || 0);
  hit = Math.floor(hit * (100 + Number(bonuses.hitRate || 0)) / 100) + Number(bonuses.hitFlat || 0);
  flee = Math.floor(flee * (100 + Number(bonuses.fleeRate || 0)) / 100) + Number(bonuses.fleeFlat || 0);
  cri = cri * (100 + Number(bonuses.criRate || 0)) / 100 + Number(bonuses.criFlat || 0);
  // Renewal CRATE: trait CRT / 3 plus explicit equipment/card/buff CRATE.
  const crate = Math.max(0, Math.floor((Math.floor(Number(s.crt || 0) / 3) + Number(bonuses.crateFlat || 0)) * (100 + Number(bonuses.crateRate || 0)) / 100));
  // Renewal ASPD order: optional attack-motion rate, then the ASPD-rate2 gap formula, then flat displayed ASPD.
  const delayRate = Number(bonuses.attackDelayRate || bonuses.aspdDelayRate || 0);
  if (delayRate !== 0) {
    const motion = Math.max(1, (2000 - aspd * 10) * (100 + delayRate) / 100);
    aspd = (2000 - motion) / 10;
  }
  let runtimeAspdRate = Number(bonuses.aspdRate || 0);
  if (typeof isPlayerMounted === "function" && isPlayerMounted()) runtimeAspdRate += Number(bonuses.mountedAspdPenaltyRate || 0);
  if (runtimeAspdRate !== 0) aspd += Math.max(195 - aspd, 2) * runtimeAspdRate / 100;
  aspd = Math.min(193, Math.floor(aspd + Number(bonuses.aspdFlat || 0)));
  walkSpeed += Number(bonuses.walkSpeedFlat || 0);
  walkSpeed = Math.floor(walkSpeed * (100 + Number(equip.walkSpeedRate || 0) + Number(bonuses.walkSpeedRate || 0)) / 100);
  // moveSpeedRate 使用玩家直覺百分比：+20 代表畫面實際移動速度 ×1.20。
  const moveSpeedRate = Math.max(-99, Number(bonuses.moveSpeedRate || 0));
  if (moveSpeedRate !== 0) walkSpeed = Math.floor(walkSpeed * 100 / (100 + moveSpeedRate));
  walkSpeed = typeof clampRaWalkSpeed === "function" ? clampRaWalkSpeed(walkSpeed) : Math.max(20, Math.min(1000, walkSpeed));

  const baseHp = getJobBaseValue("baseHp", baseLevel);
  const baseSp = getJobBaseValue("baseSp", baseLevel);
  const currentJob = typeof getCurrentJobData === "function" ? getCurrentJobData() : null;
  // rAthena status_calc_maxhp_pc/status_calc_maxsp_pc: transcendent lineage
  // (JOBL_UPPER) and primary fourth jobs receive a 1.25 class multiplier after
  // VIT/INT scaling and before fixed / percentage HP-SP bonuses.
  const routeGroup = String(currentJob?.routeGroup || "");
  const isUpperLineage = ["high_novice", "high_first", "trans_second", "third"].includes(routeGroup);
  const isPrimaryFourth = Number(currentJob?.tier || 0) === 4 && String(currentJob?.classFamily || "normal") === "normal";
  const hpSpClassMultiplier = isUpperLineage || isPrimaryFourth ? 1.25 : 1;
  // rAthena adds equipment-script VIT/INT once more as a fixed +1 HP/SP per point.
  const equipmentParamBonuses = getEquipmentBonusTotals();
  let maxHp = baseHp * (1 + s.vit / 100) * hpSpClassMultiplier
    + Number(equipmentParamBonuses.vitFlat || 0) + equip.maxHp + Number(bonuses.maxHpFlat || 0);
  let maxSp = baseSp * (1 + s.int / 100) * hpSpClassMultiplier
    + Number(equipmentParamBonuses.intFlat || 0) + equip.maxSp + Number(bonuses.maxSpFlat || 0);
  maxHp = Math.floor(maxHp * (100 + Number(bonuses.maxHpRate || 0)) / 100);
  maxSp = Math.floor(maxSp * (100 + Number(bonuses.maxSpRate || 0)) / 100);


  return {
    stats: s,
    jobBonus: getJobStatBonus(),
    atk: Math.max(1, atk),
    matk: Math.max(0, matk),
    // `def`/`mdef` remain display totals for compatibility; resolvers consume the split fields.
    def: Math.max(0, hardDef + softDef),
    mdef: Math.max(0, hardMdef + softMdef),
    hardDef: Math.max(0, hardDef),
    softDef: Math.max(0, softDef),
    hardMdef: Math.max(0, hardMdef),
    softMdef: Math.max(0, softMdef),
    hit: Math.max(0, hit),
    flee: Math.max(0, flee),
    cri: Math.max(0, cri),
    crate,
    perfectDodge: Math.max(0, 1 + Number(s.luk || 0) / 10 + Number(bonuses.perfectDodgeFlat || bonuses.perfectDodge || 0)),
    res: Math.max(0, Math.floor((Number(s.sta || 0) + Math.floor(Number(s.sta || 0) / 3) * 5 + Number(bonuses.resFlat || 0)) * (100 + Number(bonuses.resRate || 0)) / 100)),
    mres: Math.max(0, Math.floor((Number(s.wis || 0) + Math.floor(Number(s.wis || 0) / 3) * 5 + Number(bonuses.mresFlat || 0)) * (100 + Number(bonuses.mresRate || 0)) / 100)),
    pAtk: Math.max(0, Math.floor((Math.floor(Number(s.pow || 0) / 3) + Math.floor(Number(s.con || 0) / 5) + Number(bonuses.pAtk || 0)) * (100 + Number(bonuses.pAtkRate || 0)) / 100)),
    sMatk: Math.max(0, Math.floor((Math.floor(Number(s.spl || 0) / 3) + Math.floor(Number(s.con || 0) / 5) + Number(bonuses.sMatk || 0)) * (100 + Number(bonuses.sMatkRate || 0)) / 100)),
    hPlus: Math.max(0, Math.floor((Number(s.crt || 0) + Number(bonuses.hPlus || 0)) * (100 + Number(bonuses.hPlusRate || 0)) / 100)),
    aspd,
    walkSpeed,
    maxHp: Math.max(1, maxHp),
    maxSp: Math.max(0, maxSp)
  };
}

function getStatusAllocationStep() {
  return Number(player?.statusAllocationStep) === 10 ? 10 : 1;
}

function toggleStatusAllocationStep() {
  if (!player) return;
  player.statusAllocationStep = getStatusAllocationStep() === 10 ? 1 : 10;
  updateStatusUI();
  saveGame();
}

function allocateStatusPoints(statKey, requestedAmount = 1) {
  if (!player || !STATUS_KEYS.includes(statKey)) return 0;
  const run = () => {
    normalizeStatusData();
    const available = getAvailableStatusPoints();
    if (available <= 0) {
      addBattleLog("素質點不足。Base Lv 提升後會獲得更多素質點。");
      updateStatusUI();
      return 0;
    }

    const requested = Math.max(1, Math.floor(Number(requestedAmount || 1)));
    const amount = Math.min(requested, available);
    markStatusControlInteraction(260);
    player.stats[statKey] += amount;
    player.usedStatusPoints += amount;
    syncStatusPointCache();
    window.invalidateCardRuntime?.();
    recalculatePlayerStats();
    queueStatusAllocationCommit(`status:${statKey}`,STATUS_LABELS[statKey],player.stats[statKey],amount);
    return amount;
  };
  return typeof withPlayerBuildMutation === "function" ? withPlayerBuildMutation("status_allocate", run) : run();
}

function allocateStatusPoint(statKey) {
  return allocateStatusPoints(statKey, 1) > 0;
}

function allocateTraitPoints(traitKey, requestedAmount = 1) {
  if (!player || !TRAIT_KEYS.includes(traitKey)) return 0;
  const run = () => {
    normalizeStatusData();
    const lockReason = getTraitAllocationLockReason();
    if (lockReason) {
      if (typeof addBattleLog === "function") addBattleLog(lockReason);
      updateStatusUI();
      return 0;
    }
    const allocated = Math.max(0, Number(player.traits[traitKey] || 0));
    const capRoom = Math.max(0, TRAIT_ALLOCATION_CAP - allocated);
    const available = Math.max(0, getAvailableTraitPoints());
    const requested = Math.max(1, Math.floor(Number(requestedAmount || 1)));
    const amount = Math.min(requested, capRoom, available);
    if (amount <= 0) {
      if (capRoom <= 0 && typeof addBattleLog === "function") addBattleLog(`${TRAIT_LABELS[traitKey]} 玩家配點已達上限 ${TRAIT_ALLOCATION_CAP}。`);
      else if (typeof addBattleLog === "function") addBattleLog("特性點數不足。");
      updateStatusUI();
      return 0;
    }

    markStatusControlInteraction(260);
    player.traits[traitKey] += amount;
    player.traitStats = player.traits;
    syncTraitPointCache();
    window.invalidateCardRuntime?.();
    recalculatePlayerStats();
    queueStatusAllocationCommit(`trait:${traitKey}`,`${TRAIT_LABELS[traitKey]} ${TRAIT_NAMES[traitKey]}`,player.traits[traitKey],amount);
    return amount;
  };
  return typeof withPlayerBuildMutation === "function" ? withPlayerBuildMutation("trait_allocate", run) : run();
}

function allocateTraitPoint(traitKey) {
  return allocateTraitPoints(traitKey, 1) > 0;
}

function resetAllPlayerStats(options = {}) {
  if (!player) return false;
  normalizeStatusData();
  const usedStatus = Math.max(
    Number(player.usedStatusPoints || 0),
    STATUS_KEYS.reduce((sum, key) => sum + Math.max(0, Number(player.stats[key] || 1) - 1), 0)
  );
  const usedTrait = Math.max(
    Number(player.usedTraitPoints || 0),
    TRAIT_KEYS.reduce((sum, key) => sum + Math.max(0, Number(player.traits[key] || 0)), 0)
  );
  if (usedStatus <= 0 && usedTrait <= 0) {
    if (typeof addBattleLog === "function") addBattleLog("目前沒有已分配的素質點數。");
    return false;
  }
  const requireConfirm = options.confirm !== false;
  const message = `確定免費重置全部素質嗎？
一般素質返還：${usedStatus} 點
特性素質返還：${usedTrait} 點
裝備、卡片、Job Bonus 與永久效果不會被清除。`;
  if (requireConfirm) {
    const ask=window.ROGoldUI?.confirm;
    if(typeof ask==="function")ask(message,{title:"素質重置確認",confirmText:"確認重置",cancelText:"取消",danger:true}).then(ok=>{if(ok)resetAllPlayerStats({...options,confirm:false});});
    else if (typeof addBattleLog === "function") addBattleLog("黑金確認視窗尚未載入，請稍後再試。");
    return false;
  }
  const run = () => {
    STATUS_KEYS.forEach(key => { player.stats[key] = 1; });
    TRAIT_KEYS.forEach(key => { player.traits[key] = 0; });
    player.traitStats = player.traits;
    player.usedStatusPoints = 0;
    player.usedTraitPoints = 0;
    syncStatusPointCache();
    syncTraitPointCache();
    window.invalidateCardRuntime?.();
    recalculatePlayerStats();
    updatePlayerUI();
    updateStatusUI();
    if (typeof updateAutoCombatUI === "function") updateAutoCombatUI();
    saveGame();
    if (typeof addBattleLog === "function") addBattleLog(`已免費重置全部素質，返還一般 ${usedStatus} 點、特性 ${usedTrait} 點。`);
    return true;
  };
  return typeof withPlayerBuildMutation === "function" ? withPlayerBuildMutation("status_reset", run) : run();
}

function resetTraitStats(options = {}) {
  if (!player) return false;
  normalizeStatusData();
  const used = Number(player.usedTraitPoints || 0);
  if (used <= 0) {
    if (typeof addBattleLog === "function") addBattleLog("目前沒有已分配的特性點數。");
    return false;
  }
  const requireConfirm = options.confirm !== false;
  if (requireConfirm) {
    const ask=window.ROGoldUI?.confirm;
    if(typeof ask==="function")ask(`測試階段免費重置 ${used} 點特性素質，確定嗎？`,{title:"特性素質重置",confirmText:"確認重置",cancelText:"取消",danger:true}).then(ok=>{if(ok)resetTraitStats({...options,confirm:false});});
    else if (typeof addBattleLog === "function") addBattleLog("黑金確認視窗尚未載入，請稍後再試。");
    return false;
  }
  TRAIT_KEYS.forEach(key => { player.traits[key] = 0; });
  player.traitStats = player.traits;
  syncTraitPointCache();
  recalculatePlayerStats();
  updatePlayerUI();
  updateStatusUI();
  saveGame();
  if (typeof addBattleLog === "function") addBattleLog(`已免費重置特性素質，返還 ${used} 點。`);
  return true;
}

function toggleTraitStatusPanel() {
  if (!player) return;
  player.statusTraitsExpanded = !Boolean(player.statusTraitsExpanded);
  updateStatusUI();
  saveGame();
}

function getTraitDisplayBreakdown(traitKey, derived = null) {
  const jobBonus = derived?.jobBonus || getJobStatBonus();
  const equipment = typeof getEquipmentBonusTotals === "function" ? getEquipmentBonusTotals() : {};
  const training = typeof getTrainingBonusTotals === "function" ? getTrainingBonusTotals() : {};
  const passive = typeof getPassiveSkillBonusTotals === "function" ? getPassiveSkillBonusTotals() : {};
  const activeBuffs = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
  const allocated = Number(player?.traits?.[traitKey] || 0);
  const job = Number(jobBonus?.[traitKey] || 0);
  const equipmentAndCards = Number(equipment?.[traitKey + "Flat"] || 0);
  const trainingBonus = Number(training?.[traitKey + "Flat"] || 0);
  const passiveBonus = Number(passive?.[traitKey + "Flat"] || 0);
  const buffBonus = Number(activeBuffs?.[traitKey + "Flat"] || 0);
  const total = Number(derived?.stats?.[traitKey] ?? getPlayerTotalBasicStats()?.[traitKey] ?? allocated + job + equipmentAndCards + trainingBonus + passiveBonus + buffBonus);
  const known = allocated + job + equipmentAndCards + trainingBonus + passiveBonus + buffBonus;
  const other = total - known;
  return {
    allocated, job, equipmentAndCards, training:trainingBonus, passive:passiveBonus, buff:buffBonus,
    other, bonus:total - allocated, total
  };
}

function getTraitBreakdownTooltip(traitKey, breakdown) {
  const lines = [
    `${TRAIT_LABELS[traitKey]} ${TRAIT_NAMES[traitKey]} 最終值：${breakdown.total}`,
    `玩家配點：${breakdown.allocated}`,
    `四轉 Job 加成：${breakdown.job}`,
    `裝備／卡片：${breakdown.equipmentAndCards}`,
    `訓練／永久系統：${breakdown.training}`,
    `被動技能：${breakdown.passive}`,
    `目前 Buff：${breakdown.buff}`
  ];
  if (breakdown.other !== 0) lines.push(`其他 Runtime 修正：${breakdown.other}`);
  lines.push(`玩家自行配點上限：${TRAIT_ALLOCATION_CAP}`);
  return lines.join("\n");
}


const ADVANCED_RACES = [
  ["Formless", "無形"], ["Undead", "不死"], ["Brute", "動物"], ["Plant", "植物"],
  ["Insect", "昆蟲"], ["Fish", "魚貝"], ["Demon", "惡魔"], ["DemiHuman", "人形"],
  ["Angel", "天使"], ["Dragon", "龍族"], ["Player", "玩家"]
];
const ADVANCED_SIZES = [["Small", "小型"], ["Medium", "中型"], ["Large", "大型"]];
const ADVANCED_CLASSES = [["Boss", "Boss／MVP"], ["NonBoss", "一般怪物"]];
const ADVANCED_ELEMENTS = [
  ["Neutral", "無"], ["Water", "水"], ["Earth", "地"], ["Fire", "火"], ["Wind", "風"],
  ["Poison", "毒"], ["Holy", "聖"], ["Dark", "暗"], ["Ghost", "念"], ["Undead", "不死"]
];

function getStatusAdvancedSources() {
  const sources = [{ label: "角色本體", source: player }];
  if (typeof getEquippedStatusSources === "function") {
    const counts = {};
    getEquippedStatusSources().forEach((source, index) => {
      const base = String(source?.displayName || source?.name || source?.Name || source?.aegisName || `裝備／卡片 ${index + 1}`);
      counts[base] = Number(counts[base] || 0) + 1;
      sources.push({ label: counts[base] > 1 ? `${base} ×${counts[base]}` : base, source });
    });
  }
  if (typeof getTrainingBonusTotals === "function") sources.push({ label: "永久成長／訓練", source: getTrainingBonusTotals() || {} });
  if (typeof getPassiveSkillBonusTotals === "function") sources.push({ label: "被動技能", source: getPassiveSkillBonusTotals() || {} });
  if (typeof getPassiveCombatModifierTotals === "function") sources.push({ label: "被動戰鬥修正", source: getPassiveCombatModifierTotals() || {} });
  if (typeof getActiveBuffBonusTotals === "function") sources.push({ label: "目前 Buff", source: getActiveBuffBonusTotals() || {} });
  if (player?.runtimeTimingModifiers || player?.timingModifiers) sources.push({ label: "系統時序修正", source: player.runtimeTimingModifiers || player.timingModifiers });
  return sources;
}

function getStatusKeyedSourceNumber(source, group, key) {
  let total = 0;
  getStatusModifierWrappers(source).forEach(wrapper => {
    const map = wrapper?.[group];
    if (!map || typeof map !== "object" || Array.isArray(map)) return;
    total += window.ModifierKeyRuntime?.valueFromMap
      ? window.ModifierKeyRuntime.valueFromMap(map, group, key)
      : Number(map[key] ?? map[String(key).toLowerCase()] ?? map.all ?? map.All ?? 0) || 0;
  });
  return total;
}

function mergeAdvancedBreakdowns(...breakdowns) {
  const merged = new Map();
  breakdowns.flat().forEach(row => {
    if (!row || !Number.isFinite(Number(row.value)) || Number(row.value) === 0) return;
    merged.set(row.label, Number(merged.get(row.label) || 0) + Number(row.value));
  });
  return [...merged.entries()].map(([label, value]) => ({ label, value }));
}

function getAdvancedScalarBreakdown(key, aliases = []) {
  return getStatusAdvancedSources().map(({ label, source }) => ({
    label,
    value: sumStatusSourceNumber(source, key, aliases)
  })).filter(row => Number(row.value) !== 0);
}

function getAdvancedKeyedBreakdown(group, key) {
  return getStatusAdvancedSources().map(({ label, source }) => ({
    label,
    value: getStatusKeyedSourceNumber(source, group, key)
  })).filter(row => Number(row.value) !== 0);
}

function sumAdvancedBreakdown(rows) {
  return rows.reduce((sum, row) => sum + Number(row.value || 0), 0);
}

function formatAdvancedPercent(value, digits = 1) {
  const n = Number(value || 0);
  const rounded = Math.abs(n - Math.round(n)) < 0.001 ? String(Math.round(n)) : n.toFixed(digits);
  return `${n > 0 ? "+" : ""}${rounded}%`;
}

function formatAdvancedNumber(value, suffix = "") {
  const n = Number(value || 0);
  const rounded = Math.abs(n - Math.round(n)) < 0.001 ? String(Math.round(n)) : n.toFixed(1);
  return `${n > 0 ? "+" : ""}${rounded}${suffix}`;
}

function createAdvancedDetailRow(labelText, valueText, breakdown = [], note = "", sourceFormatter = formatAdvancedPercent) {
  const details = document.createElement("details");
  details.className = "status-advanced-detail-row";
  const summary = document.createElement("summary");
  const label = document.createElement("span");
  label.textContent = labelText;
  const value = document.createElement("b");
  value.textContent = String(valueText);
  summary.appendChild(label);
  summary.appendChild(value);
  details.appendChild(summary);
  const sourceBox = document.createElement("div");
  sourceBox.className = "status-advanced-source-list";
  if (note) {
    const noteLine = document.createElement("p");
    noteLine.textContent = note;
    sourceBox.appendChild(noteLine);
  }
  if (breakdown.length) {
    breakdown.forEach(row => {
      const sourceRow = document.createElement("div");
      const sourceLabel = document.createElement("span");
      sourceLabel.textContent = String(row.label);
      const sourceValue = document.createElement("b");
      sourceValue.textContent = sourceFormatter(row.value);
      sourceRow.appendChild(sourceLabel);
      sourceRow.appendChild(sourceValue);
      sourceBox.appendChild(sourceRow);
    });
  } else {
    const empty = document.createElement("p");
    empty.textContent = "目前沒有額外來源。";
    sourceBox.appendChild(empty);
  }
  details.appendChild(sourceBox);
  return details;
}

function createAdvancedDualDetailRow(labelText, physicalRows = [], magicRows = [], note = "") {
  const details = document.createElement("details");
  details.className = "status-advanced-detail-row";
  const summary = document.createElement("summary");
  const label = document.createElement("span");
  label.textContent = labelText;
  const value = document.createElement("b");
  value.textContent = `物 ${formatAdvancedPercent(sumAdvancedBreakdown(physicalRows))}　魔 ${formatAdvancedPercent(sumAdvancedBreakdown(magicRows))}`;
  summary.appendChild(label);
  summary.appendChild(value);
  details.appendChild(summary);

  const sourceBox = document.createElement("div");
  sourceBox.className = "status-advanced-source-list";
  if (note) {
    const noteLine = document.createElement("p");
    noteLine.textContent = note;
    sourceBox.appendChild(noteLine);
  }
  const byLabel = new Map();
  physicalRows.forEach(row => {
    const key = String(row.label);
    const current = byLabel.get(key) || { physical: 0, magic: 0 };
    current.physical += Number(row.value || 0);
    byLabel.set(key, current);
  });
  magicRows.forEach(row => {
    const key = String(row.label);
    const current = byLabel.get(key) || { physical: 0, magic: 0 };
    current.magic += Number(row.value || 0);
    byLabel.set(key, current);
  });
  if (byLabel.size) {
    byLabel.forEach((rates, sourceName) => {
      const sourceRow = document.createElement("div");
      const sourceLabel = document.createElement("span");
      sourceLabel.textContent = sourceName;
      const sourceValue = document.createElement("b");
      sourceValue.textContent = `物 ${formatAdvancedPercent(rates.physical)}　魔 ${formatAdvancedPercent(rates.magic)}`;
      sourceRow.appendChild(sourceLabel);
      sourceRow.appendChild(sourceValue);
      sourceBox.appendChild(sourceRow);
    });
  } else {
    const empty = document.createElement("p");
    empty.textContent = "目前沒有額外來源。";
    sourceBox.appendChild(empty);
  }
  details.appendChild(sourceBox);
  return details;
}

function createAdvancedMultiDetailRow(labelText, columns = [], note = "") {
  const details = document.createElement("details");
  details.className = "status-advanced-detail-row status-advanced-multi-row";
  const summary = document.createElement("summary");
  const label = document.createElement("span");
  label.textContent = labelText;
  const value = document.createElement("b");
  value.textContent = columns.map(column => `${column.label} ${formatAdvancedPercent(sumAdvancedBreakdown(column.rows || []))}`).join("　");
  summary.appendChild(label);
  summary.appendChild(value);
  details.appendChild(summary);

  const sourceBox = document.createElement("div");
  sourceBox.className = "status-advanced-source-list";
  if (note) {
    const noteLine = document.createElement("p");
    noteLine.textContent = note;
    sourceBox.appendChild(noteLine);
  }
  const byLabel = new Map();
  columns.forEach(column => {
    (column.rows || []).forEach(row => {
      const sourceName = String(row.label);
      const current = byLabel.get(sourceName) || {};
      current[column.label] = Number(current[column.label] || 0) + Number(row.value || 0);
      byLabel.set(sourceName, current);
    });
  });
  if (byLabel.size) {
    byLabel.forEach((rates, sourceName) => {
      const sourceRow = document.createElement("div");
      const sourceLabel = document.createElement("span");
      sourceLabel.textContent = sourceName;
      const sourceValue = document.createElement("b");
      sourceValue.textContent = columns.map(column => `${column.label} ${formatAdvancedPercent(rates[column.label] || 0)}`).join("　");
      sourceRow.appendChild(sourceLabel);
      sourceRow.appendChild(sourceValue);
      sourceBox.appendChild(sourceRow);
    });
  } else {
    const empty = document.createElement("p");
    empty.textContent = "目前沒有額外來源。";
    sourceBox.appendChild(empty);
  }
  details.appendChild(sourceBox);
  return details;
}

function createAdvancedSection(title, rows, open = false) {
  const section = document.createElement("details");
  section.className = "status-advanced-section";
  section.open = open;
  const summary = document.createElement("summary");
  summary.textContent = title;
  section.appendChild(summary);
  const body = document.createElement("div");
  body.className = "status-advanced-section-body";
  rows.forEach(row => body.appendChild(row));
  section.appendChild(body);
  return section;
}

function getAdvancedTimingSummary(derived) {
  const fallback = { item: {}, status: {}, skill: {} };
  const timing = typeof collectRuntimeTimingModifiers === "function"
    ? (collectRuntimeTimingModifiers({ id: 0, officialId: 0 }, 1) || fallback)
    : fallback;
  const groups = [timing.item || {}, timing.status || {}, timing.skill || {}];
  const sum = key => groups.reduce((n, group) => n + Number(group[key] || 0), 0);
  const max = key => Math.max(0, ...groups.map(group => Number(group[key] || 0)));
  const multipliers = groups.flatMap(group => Array.isArray(group.variableMultipliers) ? group.variableMultipliers : []);
  const variableRate = Math.max(-1000, Math.min(100, sum("variableRate")));
  const fixedRate = Math.max(-1000, Math.min(100, max("fixedRate") + sum("fixedPenaltyRate")));
  const stats = derived?.stats || {};
  const statTotal = Math.max(0, Number(stats.dex || 0) * 2 + Number(stats.int || 0));
  const statFactor = Math.max(0, 1 - Math.sqrt(statTotal / 530));
  let multiplierFactor = 1;
  multipliers.forEach(rate => { multiplierFactor *= Math.max(0, 1 - Number(rate || 0) / 100); });
  const combinedVariableFactor = Math.max(0, statFactor * multiplierFactor * (1 - variableRate / 100));
  return {
    statReduction: (1 - statFactor) * 100,
    variableRate,
    combinedVariableReduction: (1 - combinedVariableFactor) * 100,
    variableFlatMs: sum("variableMs") - sum("variableAddMs"),
    fixedRate,
    fixedFlatMs: sum("fixedMs") - sum("fixedAddMs"),
    afterRate: sum("afterRate"),
    afterFlatMs: sum("afterMs") - sum("afterAddMs"),
    cooldownRate: sum("cooldownRate"),
    cooldownFlatMs: sum("cooldownMs") - sum("cooldownAddMs"),
    walkRate: sum("walkRate"),
    walkFlatMs: sum("walkMs") - sum("walkAddMs")
  };
}

function buildAdvancedDamageTab(container, derived) {
  const scalar = (key, aliases = []) => getAdvancedScalarBreakdown(key, aliases);
  const commonAll = scalar("damageRate", ["allDamageRate"]);
  const physical = mergeAdvancedBreakdowns(commonAll, scalar("physicalDamageRate"));
  const magic = mergeAdvancedBreakdowns(commonAll, scalar("magicDamageRate"));
  const crit = scalar("critAtkRate", ["criticalAtkRate", "criticalDamageRate"]);
  const critRate = sumAdvancedBreakdown(crit);
  const crate = Number(derived?.crate || 0);
  const normalCritMultiplier = ((140 + crate) / 100) * (1 + critRate / 100);
  const skillCritMultiplier = ((140 + crate) / 100) * (1 + critRate / 200);
  const sizePenaltyRows = getAdvancedScalarBreakdown("ignoreWeaponSizePenalty", ["weaponSizePerfect", "perfectSizeDamage"]);
  const sizePenaltyIgnored = sumAdvancedBreakdown(sizePenaltyRows) > 0;
  const coreRows = [
    createAdvancedDetailRow("目前 CRI", `${Number(derived?.cri || 0)}`, [], "CRI 決定暴擊發生機率；對特定種族的額外 CRI 另列於下方。"),
    createAdvancedDetailRow("目前 C.RATE", `${Number(derived?.crate || 0)}`, [], "C.RATE 只提高暴擊傷害倍率，不增加暴擊機率。"),
    createAdvancedDetailRow("P.ATK", `${Number(derived?.pAtk || 0)}`, [], "POW／CON 與裝備、卡片、技能、Buff 的最終 P.ATK。"),
    createAdvancedDetailRow("S.MATK", `${Number(derived?.sMatk || 0)}`, [], "SPL／CON 與裝備、卡片、技能、Buff 的最終 S.MATK。"),
    createAdvancedDetailRow("物理傷害", formatAdvancedPercent(sumAdvancedBreakdown(physical)), physical),
    createAdvancedDetailRow("魔法傷害", formatAdvancedPercent(sumAdvancedBreakdown(magic)), magic),
    createAdvancedDetailRow("近距離傷害", formatAdvancedPercent(sumAdvancedBreakdown(scalar("shortDamageRate"))), scalar("shortDamageRate")),
    createAdvancedDetailRow("遠距離傷害", formatAdvancedPercent(sumAdvancedBreakdown(scalar("longDamageRate"))), scalar("longDamageRate")),
    createAdvancedDetailRow("額外暴擊傷害", formatAdvancedPercent(critRate), crit, "普通攻擊完整套用；可暴擊技能依 Renewal 規則只套用一半。"),
    createAdvancedDetailRow("普通攻擊暴擊倍率", `${normalCritMultiplier.toFixed(2)}×`, [], `基礎 1.40×＋C.RATE ${crate}，再套用額外暴擊傷害。`),
    createAdvancedDetailRow("技能暴擊倍率", `${skillCritMultiplier.toFixed(2)}×`, [], `可暴擊技能對額外暴擊傷害只取一半；C.RATE 仍完整套用。`),
    createAdvancedDetailRow("DEF 無視", formatAdvancedPercent(sumAdvancedBreakdown(scalar("ignoreDefRate", ["defPiercePercent"]))), scalar("ignoreDefRate", ["defPiercePercent"])),
    createAdvancedDetailRow("MDEF 無視", formatAdvancedPercent(sumAdvancedBreakdown(scalar("ignoreMdefRate", ["mdefPiercePercent"]))), scalar("ignoreMdefRate", ["mdefPiercePercent"])),
    createAdvancedDetailRow("RES 穿透", formatAdvancedPercent(sumAdvancedBreakdown(scalar("ignoreResRate", ["resPiercePercent"]))), scalar("ignoreResRate", ["resPiercePercent"])),
    createAdvancedDetailRow("MRES 穿透", formatAdvancedPercent(sumAdvancedBreakdown(scalar("ignoreMresRate", ["mresPiercePercent"]))), scalar("ignoreMresRate", ["mresPiercePercent"])),
    createAdvancedDetailRow("技能治療加成", formatAdvancedPercent(Number(derived?.hPlus || 0) + sumAdvancedBreakdown(scalar("healPowerRate"))), scalar("healPowerRate"), `H.Plus ${Number(derived?.hPlus || 0)}% 另計入最終技能治療；此處來源明細列出其他治療加成。`),
    createAdvancedDetailRow("武器體型懲罰", sizePenaltyIgnored ? "已移除" : "依武器補正", sizePenaltyRows, "對應 ROItemSearch 的『刪除武器尺寸懲罰』效果；移除後物理攻擊不再套用武器對大／中／小型的負面補正。", value => Number(value || 0) > 0 ? "啟用" : "未啟用")
  ];
  container.appendChild(createAdvancedSection("核心增傷與穿透", coreRows, true));

  const weaponType = typeof getEquippedWeaponTypeRuntime === "function" ? getEquippedWeaponTypeRuntime() : "fist";
  const sizeRows = ADVANCED_SIZES.map(([key, label]) => {
    const physicalRows = getAdvancedKeyedBreakdown("sizeDamage", key);
    const magicRows = getAdvancedKeyedBreakdown("magicSizeDamage", key);
    return createAdvancedDualDetailRow(`對${label}體型`, physicalRows, magicRows);
  });
  if (window.CombatFormulaRuntime?.getWeaponSizeMultiplier) {
    ADVANCED_SIZES.forEach(([key, label]) => {
      const rate = Number(window.CombatFormulaRuntime.getWeaponSizeMultiplier(weaponType, key) || 100);
      sizeRows.push(createAdvancedDetailRow(`武器對${label}體型修正`, `${rate}%`, [], `目前武器類型：${weaponType}。這是武器本身的體型補正，與上方體型增傷分開乘算。`));
    });
  }
  container.appendChild(createAdvancedSection("體型傷害", sizeRows, true));

  const raceRows = ADVANCED_RACES.map(([key, label]) => {
    const common = getAdvancedKeyedBreakdown("raceDamage", key);
    const physicalRows = mergeAdvancedBreakdowns(common, getAdvancedKeyedBreakdown("physicalRaceDamage", key));
    const magicRows = mergeAdvancedBreakdowns(common, getAdvancedKeyedBreakdown("magicRaceDamage", key));
    return createAdvancedDualDetailRow(`對${label}種族`, physicalRows, magicRows);
  });
  container.appendChild(createAdvancedSection("種族傷害", raceRows, false));

  const raceCriticalRows = ADVANCED_RACES.map(([key, label]) => {
    const values = mergeAdvancedBreakdowns(
      getAdvancedKeyedBreakdown("criticalChanceByRace", key),
      getAdvancedKeyedBreakdown("criticalRateByRace", key)
    );
    return createAdvancedDetailRow(`對${label}種族 CRI`, formatAdvancedNumber(sumAdvancedBreakdown(values)), values, "此值只增加對指定種族的暴擊發生率，不影響 C.RATE 與暴擊傷害。", value => formatAdvancedNumber(value));
  });
  container.appendChild(createAdvancedSection("種族別暴擊率", raceCriticalRows, false));

  const racePierceRows = ADVANCED_RACES.map(([key, label]) => createAdvancedMultiDetailRow(`對${label}種族`, [
    { label:"DEF", rows:getAdvancedKeyedBreakdown("ignoreDefByRace", key) },
    { label:"MDEF", rows:getAdvancedKeyedBreakdown("ignoreMdefByRace", key) },
    { label:"RES", rows:getAdvancedKeyedBreakdown("ignoreResByRace", key) },
    { label:"MRES", rows:getAdvancedKeyedBreakdown("ignoreMresByRace", key) }
  ], "DEF／MDEF 上限 100%；共通 RES／MRES 穿透在 Renewal 共用解析器中上限 50%。"));
  container.appendChild(createAdvancedSection("種族別防禦穿透", racePierceRows, false));

  const elementRows = ADVANCED_ELEMENTS.map(([key, label]) => {
    const common = getAdvancedKeyedBreakdown("elementDamage", key);
    const physicalRows = mergeAdvancedBreakdowns(common, getAdvancedKeyedBreakdown("physicalElementDamage", key));
    const magicRows = mergeAdvancedBreakdowns(common, getAdvancedKeyedBreakdown("magicElementDamage", key));
    return createAdvancedDualDetailRow(`對${label}屬性`, physicalRows, magicRows);
  });
  container.appendChild(createAdvancedSection("對屬性敵人傷害", elementRows, false));

  const elementPierceRows = ADVANCED_ELEMENTS.map(([key, label]) => createAdvancedMultiDetailRow(`對${label}屬性敵人`, [
    { label:"DEF", rows:getAdvancedKeyedBreakdown("ignoreDefByElement", key) },
    { label:"MDEF", rows:getAdvancedKeyedBreakdown("ignoreMdefByElement", key) }
  ]));
  container.appendChild(createAdvancedSection("屬性別防禦穿透", elementPierceRows, false));

  const attackElementRows = ADVANCED_ELEMENTS.map(([key, label]) => {
    const common = getAdvancedKeyedBreakdown("attackElementDamage", key);
    const physicalRows = mergeAdvancedBreakdowns(common, getAdvancedKeyedBreakdown("physicalAttackElementDamage", key));
    const magicRows = mergeAdvancedBreakdowns(common, getAdvancedKeyedBreakdown("magicAttackElementDamage", key));
    return createAdvancedDualDetailRow(`${label}屬性攻擊傷害`, physicalRows, magicRows, "依本次攻擊使用的元素判定，與目標防禦屬性增傷是不同分類。");
  });
  container.appendChild(createAdvancedSection("自身攻擊屬性增傷", attackElementRows, false));

  const classRows = ADVANCED_CLASSES.map(([key, label]) => {
    const common = getAdvancedKeyedBreakdown("classDamage", key);
    const physicalRows = mergeAdvancedBreakdowns(common, getAdvancedKeyedBreakdown("physicalClassDamage", key), scalar(key === "Boss" ? "bossDamageRate" : "nonBossDamageRate"));
    const magicRows = mergeAdvancedBreakdowns(common, getAdvancedKeyedBreakdown("magicClassDamage", key), scalar(key === "Boss" ? "bossDamageRate" : "nonBossDamageRate"));
    return createAdvancedDualDetailRow(`對${label}`, physicalRows, magicRows);
  });
  container.appendChild(createAdvancedSection("階級傷害", classRows, false));

  const classPierceRows = ADVANCED_CLASSES.map(([key, label]) => createAdvancedMultiDetailRow(`對${label}`, [
    { label:"DEF", rows:getAdvancedKeyedBreakdown("ignoreDefByClass", key) },
    { label:"MDEF", rows:getAdvancedKeyedBreakdown("ignoreMdefByClass", key) }
  ]));
  container.appendChild(createAdvancedSection("階級別防禦穿透", classPierceRows, false));
}

function buildAdvancedCastingTab(container, derived) {
  const timing = getAdvancedTimingSummary(derived);
  const rows = [
    createAdvancedDetailRow("變動詠唱－素質減免", formatAdvancedPercent(timing.statReduction), [], "由最終 DEX×2＋INT 計算；不同技能可用旗標忽略 DEX。"),
    createAdvancedDetailRow("變動詠唱－裝備／技能", formatAdvancedPercent(timing.variableRate), getAdvancedScalarBreakdown("variableCastReductionRate", ["variableCastRateReduction", "varCastReductionRate", "varcastrate"])),
    createAdvancedDetailRow("變動詠唱－綜合估算", formatAdvancedPercent(timing.combinedVariableReduction), [], "依素質、乘算減免與加算減免合併估算；特定技能旗標與固定毫秒效果會使實際值不同。"),
    createAdvancedDetailRow("變動詠唱固定縮短", `${Math.round(timing.variableFlatMs)} ms`, [], "正值代表縮短；實際不可低於 0。"),
    createAdvancedDetailRow("固定詠唱減免", formatAdvancedPercent(timing.fixedRate), getAdvancedScalarBreakdown("fixedCastReductionRate", ["fixedCastRateReduction", "fixcastrate"]), "Renewal 固詠百分比通常取最強來源，負面效果另外相加。"),
    createAdvancedDetailRow("固定詠唱固定縮短", `${Math.round(timing.fixedFlatMs)} ms`, [], "特定技能仍依自身旗標決定是否套用。"),
    createAdvancedDetailRow("技能後延遲減免", formatAdvancedPercent(timing.afterRate), getAdvancedScalarBreakdown("afterCastDelayReductionRate", ["afterCastActDelayReductionRate", "delayrate"])),
    createAdvancedDetailRow("技能後延遲固定縮短", `${Math.round(timing.afterFlatMs)} ms`),
    createAdvancedDetailRow("獨立冷卻減免", formatAdvancedPercent(timing.cooldownRate), getAdvancedScalarBreakdown("cooldownReductionRate", ["skillCooldownReductionRate"])),
    createAdvancedDetailRow("獨立冷卻固定縮短", `${Math.round(timing.cooldownFlatMs)} ms`),
    createAdvancedDetailRow("行走延遲減免", formatAdvancedPercent(timing.walkRate), getAdvancedScalarBreakdown("walkDelayReductionRate", ["afterCastWalkDelayReductionRate"])),
    createAdvancedDetailRow("行走延遲固定縮短", `${Math.round(timing.walkFlatMs)} ms`),
    createAdvancedDetailRow("目前 ASPD", `${Number(derived?.aspd || 0)}`, [], "實際可重複攻擊／攻擊技能仍受 Renewal 動作鎖與 RO_WEB 秒7（140ms）安全上限限制。"),
    createAdvancedDetailRow("目前移動速度", `${Number(derived?.walkSpeed || 0)}`, [], "RA WalkSpeed 數值越小越快。")
  ];
  container.appendChild(createAdvancedSection("詠唱、延遲與速度", rows, true));
}

function buildAdvancedDefenseTab(container, derived) {
  const scalar = (key, aliases = []) => getAdvancedScalarBreakdown(key, aliases);
  const rows = [
    createAdvancedDetailRow("Max HP", `${Number(derived?.maxHp || player?.maxHp || 0)}`, [], "已包含角色、裝備、卡片、被動與 Buff。"),
    createAdvancedDetailRow("Max SP", `${Number(derived?.maxSp || player?.maxSp || 0)}`, [], "已包含角色、裝備、卡片、被動與 Buff。"),
    createAdvancedDetailRow("Hard DEF", `${Number(derived?.hardDef || 0)}`),
    createAdvancedDetailRow("Soft DEF", `${Number(derived?.softDef || 0)}`),
    createAdvancedDetailRow("Hard MDEF", `${Number(derived?.hardMdef || 0)}`),
    createAdvancedDetailRow("Soft MDEF", `${Number(derived?.softMdef || 0)}`),
    createAdvancedDetailRow("RES", `${Number(derived?.res || 0)}`),
    createAdvancedDetailRow("MRES", `${Number(derived?.mres || 0)}`),
    createAdvancedDetailRow("全傷害減免", formatAdvancedPercent(sumAdvancedBreakdown(scalar("damageReductionRate", ["allDamageReduction"]))), scalar("damageReductionRate", ["allDamageReduction"])),
    createAdvancedDetailRow("物理傷害減免", formatAdvancedPercent(sumAdvancedBreakdown(scalar("physicalDamageReductionRate", ["weaponDamageReductionRate", "physicalDefRate"]))), scalar("physicalDamageReductionRate", ["weaponDamageReductionRate", "physicalDefRate"])),
    createAdvancedDetailRow("魔法傷害減免", formatAdvancedPercent(sumAdvancedBreakdown(scalar("magicDamageReductionRate", ["magicDefRate"]))), scalar("magicDamageReductionRate", ["magicDefRate"])),
    createAdvancedDetailRow("近距離減傷", formatAdvancedPercent(sumAdvancedBreakdown(scalar("shortDamageReduction"))), scalar("shortDamageReduction")),
    createAdvancedDetailRow("遠距離減傷", formatAdvancedPercent(sumAdvancedBreakdown(scalar("longDamageReduction"))), scalar("longDamageReduction")),
    createAdvancedDetailRow("暴擊傷害減免", formatAdvancedPercent(sumAdvancedBreakdown(scalar("criticalDefenseRate", ["critDefRate", "criticalDamageReductionRate"]))), scalar("criticalDefenseRate", ["critDefRate", "criticalDamageReductionRate"])),
    createAdvancedDetailRow("受到治療加成", formatAdvancedPercent(sumAdvancedBreakdown(scalar("healingReceivedRate"))), scalar("healingReceivedRate"))
  ];
  container.appendChild(createAdvancedSection("基礎生存與減傷", rows, true));

  const sizeRows = ADVANCED_SIZES.map(([key, label]) => {
    const common = getAdvancedKeyedBreakdown("sizeResist", key);
    const physical = mergeAdvancedBreakdowns(common, getAdvancedKeyedBreakdown("physicalSizeResist", key));
    const magic = mergeAdvancedBreakdowns(common, getAdvancedKeyedBreakdown("magicSizeResist", key));
    return createAdvancedDualDetailRow(`來自${label}體型`, physical, magic);
  });
  container.appendChild(createAdvancedSection("體型耐性", sizeRows, false));

  const raceRows = ADVANCED_RACES.map(([key, label]) => {
    const values = getAdvancedKeyedBreakdown("raceResist", key);
    return createAdvancedDetailRow(`來自${label}種族`, formatAdvancedPercent(sumAdvancedBreakdown(values)), values);
  });
  container.appendChild(createAdvancedSection("種族耐性", raceRows, false));

  const classRows = ADVANCED_CLASSES.map(([key, label]) => {
    const values = mergeAdvancedBreakdowns(
      getAdvancedKeyedBreakdown("classResist", key),
      getAdvancedScalarBreakdown(key === "Boss" ? "bossDamageReduction" : "nonBossDamageReduction")
    );
    return createAdvancedDetailRow(`來自${label}`, formatAdvancedPercent(sumAdvancedBreakdown(values)), values);
  });
  container.appendChild(createAdvancedSection("階級耐性", classRows, false));

  const enemyElementRows = ADVANCED_ELEMENTS.map(([key, label]) => createAdvancedDualDetailRow(`來自${label}屬性敵人`,
    getAdvancedKeyedBreakdown("physicalEnemyElementResist", key),
    getAdvancedKeyedBreakdown("magicEnemyElementResist", key),
    "依攻擊者本身的防禦屬性判定；不同於下方依實際攻擊元素判定的屬性攻擊耐性。"
  ));
  container.appendChild(createAdvancedSection("敵人屬性別傷害減免", enemyElementRows, false));

  const elementRows = ADVANCED_ELEMENTS.map(([key, label]) => {
    const values = getAdvancedKeyedBreakdown("elementResist", key);
    return createAdvancedDetailRow(`${label}屬性攻擊耐性`, formatAdvancedPercent(sumAdvancedBreakdown(values)), values, "依本次攻擊使用的元素判定。ROItemSearch 中的全屬性攻擊耐性歸入此分類。 ");
  });
  container.appendChild(createAdvancedSection("攻擊屬性耐性", elementRows, false));
}

function isStatusAdvancedInlineMode() {
  const viewportNarrow = Number(window?.innerWidth || 9999) <= 900;
  const mediaMatch = typeof window?.matchMedia === "function"
    ? window.matchMedia("(max-width: 900px), (pointer: coarse)").matches
    : false;
  return Boolean(viewportNarrow || mediaMatch);
}

let statusAdvancedResponsiveBound = false;
function ensureStatusAdvancedResponsiveBinding() {
  if (statusAdvancedResponsiveBound || typeof window?.addEventListener !== "function") return;
  statusAdvancedResponsiveBound = true;
  window.addEventListener("resize", () => {
    if (player?.statusAdvancedExpanded) updateStatusUI();
  }, { passive: true });
}

function captureStatusAdvancedViewState() {
  const panel = document.getElementById("status-advanced-panel");
  if (!panel) return null;
  const content = panel.querySelector(".status-advanced-content");
  return {
    scrollTop: Number(content?.scrollTop || 0),
    openDetails: [...panel.querySelectorAll("details")].map(node => Boolean(node.open))
  };
}

function restoreStatusAdvancedViewState(panel, state) {
  if (!panel || !state) return;
  [...panel.querySelectorAll("details")].forEach((node, index) => {
    node.open = Boolean(state.openDetails?.[index]);
  });
  const content = panel.querySelector(".status-advanced-content");
  if (content) content.scrollTop = Math.max(0, Number(state.scrollTop || 0));
}

function bindStatusAdvancedInteraction(panel) {
  const content = panel?.querySelector?.(".status-advanced-content");
  if (!content || content.dataset.performanceBound === "1") return;
  content.dataset.performanceBound = "1";
  content.addEventListener("scroll", markStatusAdvancedInteraction, { passive: true });
  content.addEventListener("wheel", markStatusAdvancedInteraction, { passive: true });
  content.addEventListener("touchmove", markStatusAdvancedInteraction, { passive: true });
}

function renderStatusAdvancedPanel(derived, viewState = null) {
  const statusWindow = document.getElementById("status-window");
  const statusPanel = document.getElementById("status-panel");
  if (!statusWindow || !statusPanel) return;
  statusWindow.querySelector("#status-advanced-panel")?.remove();
  if (!player?.statusAdvancedExpanded) return;

  const inlineMode = isStatusAdvancedInlineMode();
  const advanced = document.createElement("aside");
  advanced.id = "status-advanced-panel";
  advanced.className = `status-advanced-panel${inlineMode ? " status-advanced-inline" : ""}`;

  const header = document.createElement("div");
  header.className = "status-advanced-header";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "status-advanced-back";
  close.textContent = "◀";
  close.title = inlineMode ? "返回能力值與特性素質" : "收合進階戰鬥資訊";
  close.setAttribute("aria-label", close.title);
  close.onclick = event => { event.stopPropagation(); toggleStatusAdvancedPanel(); };
  const title = document.createElement("b");
  title.textContent = "進階戰鬥資訊";
  header.appendChild(close);
  header.appendChild(title);
  advanced.appendChild(header);

  const tabs = document.createElement("div");
  tabs.className = "status-advanced-tabs";
  [["damage", "傷害"], ["casting", "詠唱／延遲"], ["defense", "生存／耐性"]].forEach(([key, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.classList.toggle("active", player.statusAdvancedTab === key);
    button.onclick = event => { event.stopPropagation(); setStatusAdvancedTab(key); };
    tabs.appendChild(button);
  });
  advanced.appendChild(tabs);

  const content = document.createElement("div");
  content.className = "status-advanced-content";
  if (player.statusAdvancedTab === "casting") buildAdvancedCastingTab(content, derived);
  else if (player.statusAdvancedTab === "defense") buildAdvancedDefenseTab(content, derived);
  else buildAdvancedDamageTab(content, derived);
  advanced.appendChild(content);

  if (inlineMode) {
    statusPanel.appendChild(advanced);
    bindStatusAdvancedInteraction(advanced);
    restoreStatusAdvancedViewState(advanced, viewState);
    return;
  }

  statusWindow.appendChild(advanced);
  bindStatusAdvancedInteraction(advanced);
  restoreStatusAdvancedViewState(advanced, viewState);
  requestAnimationFrame(() => {
    const rect = statusWindow.getBoundingClientRect();
    const width = advanced.getBoundingClientRect().width;
    advanced.classList.toggle("open-left", rect.right + 8 + width > window.innerWidth - 8 && rect.left - width - 8 >= 0);
  });
}

function toggleStatusAdvancedPanel() {
  if (!player) return;
  player.statusAdvancedExpanded = !Boolean(player.statusAdvancedExpanded);
  updateStatusUI();
  saveGame();
}

function setStatusAdvancedTab(tab) {
  if (!player || !["damage", "casting", "defense"].includes(String(tab))) return;
  player.statusAdvancedTab = String(tab);
  updateStatusUI();
  saveGame();
}

function appendStatusBattleRow(container, rowData, className = "status-css-battle-row") {
  const row = document.createElement("div");
  row.className = className;
  row.dataset.tooltip = rowData.tip || "";
  const label = document.createElement("span");
  label.textContent = rowData.label;
  const value = document.createElement("b");
  value.textContent = String(rowData.value);
  row.appendChild(label);
  row.appendChild(value);
  container.appendChild(row);
}

function updateStatusUI(options = {}) {
  ensureStatusControlInteractionBinding();
  const panel = document.getElementById("status-panel");
  if (!panel || !player) return false;
  statusUiLastRenderAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  normalizeStatusData();
  const derived = calculateDerivedPlayerStats();
  const jobBonus = derived?.jobBonus || getJobStatBonus();
  const remaining = getAvailableStatusPoints();
  const traitRemaining = getAvailableTraitPoints();
  const traitUnlocked = isTraitAllocationJob() && getTotalTraitPointsForLevel(player.baseLevel) > 0;

  ensureStatusAdvancedResponsiveBinding();
  const advancedViewState = captureStatusAdvancedViewState();
  panel.innerHTML = "";
  document.getElementById("status-window")?.querySelector("#status-advanced-panel")?.remove();
  const advancedInline = Boolean(player.statusAdvancedExpanded && isStatusAdvancedInlineMode());
  panel.classList.toggle("traits-expanded", Boolean(player.statusTraitsExpanded));
  panel.classList.toggle("advanced-expanded", Boolean(player.statusAdvancedExpanded));
  panel.classList.toggle("advanced-inline-mode", advancedInline);
  if (advancedInline) {
    renderStatusAdvancedPanel(derived, advancedViewState);
    return;
  }

  const left = document.createElement("div");
  left.className = "status-css-left";
  const leftTitle = document.createElement("div");
  leftTitle.className = "status-css-title status-title-with-control";
  const leftTitleText = document.createElement("span");
  leftTitleText.textContent = "能力值";
  const stepToggle = document.createElement("button");
  stepToggle.type = "button";
  stepToggle.className = "status-allocation-step-button";
  stepToggle.classList.toggle("active", getStatusAllocationStep() === 10);
  stepToggle.textContent = "+10";
  stepToggle.title = getStatusAllocationStep() === 10 ? "目前為一次 +10 配點；按下恢復 +1" : "開啟一次 +10 配點模式（一般能力值與特性素質共用）";
  stepToggle.setAttribute("aria-pressed", String(getStatusAllocationStep() === 10));
  stepToggle.onclick = event => { event.stopPropagation(); toggleStatusAllocationStep(); };
  leftTitle.appendChild(leftTitleText);
  leftTitle.appendChild(stepToggle);
  left.appendChild(leftTitle);

  STATUS_KEYS.forEach(key => {
    const base = Number(player.stats[key] || 1);
    const total = Number(derived?.stats?.[key] ?? base);
    const bonus = Math.trunc(total - base);
    const label = STATUS_LABELS[key];
    const tooltip = `${label}：${STATUS_DESCRIPTIONS[key]}`;
    const row = document.createElement("div");
    row.className = "status-css-row";
    const name = document.createElement("button");
    name.type = "button";
    name.className = "status-css-label";
    name.textContent = label;
    name.dataset.tooltip = tooltip;
    name.setAttribute("aria-label", tooltip);
    const value = document.createElement("div");
    value.className = "status-css-value";
    value.textContent = bonus > 0 ? `${base}+${bonus}` : bonus < 0 ? `${base}${bonus}` : `${base}`;
    value.dataset.tooltip = tooltip;
    const plus = document.createElement("button");
    plus.className = "status-css-plus";
    plus.type = "button";
    plus.textContent = "+";
    const allocationStep = getStatusAllocationStep();
    plus.title = `${label} 最多一次 +${allocationStep}；點數不足時自動使用剩餘點數`;
    plus.disabled = remaining <= 0;
    plus.onclick = event => { event.preventDefault(); event.stopPropagation(); allocateStatusPoints(key, allocationStep); };
    row.appendChild(name);
    row.appendChild(value);
    row.appendChild(plus);
    left.appendChild(row);
  });

  const right = document.createElement("div");
  right.className = "status-css-right";
  const rightTitle = document.createElement("div");
  rightTitle.className = "status-css-title status-title-with-control status-title-advanced-control";
  const rightTitleText = document.createElement("span");
  rightTitleText.textContent = "戰鬥能力";
  const advancedToggle = document.createElement("button");
  advancedToggle.type = "button";
  advancedToggle.className = "status-advanced-toggle";
  advancedToggle.textContent = player.statusAdvancedExpanded ? "◀" : "▶";
  advancedToggle.title = player.statusAdvancedExpanded ? "收合進階戰鬥資訊" : "展開傷害、種族、體型、詠唱與耐性總覽";
  advancedToggle.setAttribute("aria-expanded", String(Boolean(player.statusAdvancedExpanded)));
  advancedToggle.onclick = event => { event.stopPropagation(); toggleStatusAdvancedPanel(); };
  rightTitle.appendChild(rightTitleText);
  rightTitle.appendChild(advancedToggle);
  right.appendChild(rightTitle);
  [
    { label: "攻擊力", value: derived.atk, tip: "攻擊力：包含 POW 每點 Status ATK +5。" },
    { label: "防禦力", value: derived.def, tip: "防禦力：Renewal Hard DEF + Soft DEF 顯示合計。" },
    { label: "魔法攻擊", value: derived.matk, tip: "魔法攻擊：包含 SPL 每點 MATK +5。" },
    { label: "魔法防禦", value: derived.mdef, tip: "魔法防禦：Renewal Hard MDEF + Soft MDEF 顯示合計。" },
    { label: "命中率", value: derived.hit, tip: "命中率：CON 每點額外 HIT +2。" },
    { label: "迴避率", value: derived.flee, tip: "迴避率：CON 每點額外 FLEE +2。" },
    { label: "暴擊率", value: derived.cri, tip: "暴擊率：影響暴擊發生機率。" },
    { label: "攻擊速度", value: derived.aspd, tip: "攻擊速度：影響攻擊間隔。" },
    { label: "移動速度", value: derived.walkSpeed, tip: "移動速度：採用 RA WalkSpeed，數值越小越快。" },
    { label: "剩餘點數", value: remaining, tip: "一般素質點在 Base Lv.200 固定，不再增加。" }
  ].forEach(row => appendStatusBattleRow(right, row));

  panel.appendChild(left);
  panel.appendChild(right);

  const resetActions = document.createElement("div");
  resetActions.className = "status-reset-actions";
  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "status-free-reset-button";
  resetButton.textContent = "免費重置素質";
  resetButton.title = "重置一般與四轉特性配點；裝備、卡片與 Job Bonus 保留";
  resetButton.onclick = event => { event.stopPropagation(); resetAllPlayerStats(); };
  resetActions.appendChild(resetButton);
  panel.appendChild(resetActions);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "status-trait-toggle";
  toggle.setAttribute("aria-expanded", String(Boolean(player.statusTraitsExpanded)));
  toggle.innerHTML = `<span>${player.statusTraitsExpanded ? "▲" : "▼"}</span><b>特性素質</b><em>剩餘 ${traitRemaining}</em>`;
  toggle.title = player.statusTraitsExpanded ? "向上收合特性素質" : "向下展開特性素質";
  toggle.onclick = event => { event.stopPropagation(); toggleTraitStatusPanel(); };
  panel.appendChild(toggle);

  if (!player.statusTraitsExpanded) { renderStatusAdvancedPanel(derived, advancedViewState); return; }

  const traitPanel = document.createElement("div");
  traitPanel.className = "status-trait-panel";
  const traitHeader = document.createElement("div");
  traitHeader.className = "status-trait-header";
  traitHeader.innerHTML = `<b>特性素質</b><span>T.Status Point：<strong>${traitRemaining}</strong> / ${getTotalTraitPointsForLevel(player.baseLevel)}</span>`;
  traitPanel.appendChild(traitHeader);

  const traitLeft = document.createElement("div");
  traitLeft.className = "status-trait-left";
  TRAIT_KEYS.forEach(key => {
    const breakdown = getTraitDisplayBreakdown(key, derived);
    const tooltip = TRAIT_DESCRIPTIONS[key];
    const row = document.createElement("div");
    row.className = "status-trait-stat-row";
    row.dataset.tooltip = tooltip;
    const name = document.createElement("button");
    name.type = "button";
    name.className = "status-trait-label";
    name.textContent = TRAIT_LABELS[key];
    name.setAttribute("aria-label", `${TRAIT_LABELS[key]} ${TRAIT_NAMES[key]}：${tooltip}`);
    const value = document.createElement("div");
    value.className = "status-trait-value";
    value.textContent = breakdown.bonus ? `${breakdown.allocated}+${breakdown.bonus}` : String(breakdown.allocated);
    const breakdownTooltip = getTraitBreakdownTooltip(key, breakdown);
    value.title = breakdownTooltip;
    value.dataset.tooltip = breakdownTooltip;
    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "status-trait-plus";
    plus.textContent = "+";
    const capReached = breakdown.allocated >= TRAIT_ALLOCATION_CAP;
    const lockReason = getTraitAllocationLockReason();
    const allocationStep = getStatusAllocationStep();
    plus.disabled = !traitUnlocked || traitRemaining <= 0 || capReached;
    plus.title = capReached ? `玩家配點已達 ${TRAIT_ALLOCATION_CAP}` : (lockReason || `${TRAIT_LABELS[key]} 最多一次 +${allocationStep}；不足時自動加到可用上限`);
    plus.onclick = event => { event.preventDefault(); event.stopPropagation(); allocateTraitPoints(key, allocationStep); };
    const note = document.createElement("small");
    note.textContent = TRAIT_NAMES[key];
    row.appendChild(name);
    row.appendChild(value);
    row.appendChild(plus);
    row.appendChild(note);
    traitLeft.appendChild(row);
  });

  const traitRight = document.createElement("div");
  traitRight.className = "status-trait-right";
  [
    { label: "P.ATK", value: derived.pAtk, tip: "物理傷害百分比：floor(POW/3) + floor(CON/5)，再套用額外加成。" },
    { label: "S.MATK", value: derived.sMatk, tip: "魔法傷害百分比：floor(SPL/3) + floor(CON/5)，再套用額外加成。" },
    { label: "RES", value: derived.res, tip: "RES = STA + floor(STA/3)×5；物理減傷 = RES/(RES+400)×80%。" },
    { label: "MRES", value: derived.mres, tip: "MRES = WIS + floor(WIS/3)×5；魔法減傷 = MRES/(MRES+400)×80%。" },
    { label: "H.Plus", value: derived.hPlus, tip: "只提高技能治療、技能持續治療與投擲藥水治療；不影響自然回復、物品直接恢復、吸血與固定恢復。" },
    { label: "C.RATE", value: derived.crate, tip: "只提高暴擊傷害倍率：1.40 + C.RATE×0.01；暴擊發生機率仍由 CRI 決定。" },
    { label: "物理減傷", value: `${((derived.res / (derived.res + 400 || 1)) * 80).toFixed(1)}%`, tip: "RES 層減傷，先於 DEF 層處理。" },
    { label: "魔法減傷", value: `${((derived.mres / (derived.mres + 400 || 1)) * 80).toFixed(1)}%`, tip: "MRES 層減傷，先於 MDEF 層處理。" }
  ].forEach(row => appendStatusBattleRow(traitRight, row, "status-trait-derived-row"));


  traitPanel.appendChild(traitLeft);
  traitPanel.appendChild(traitRight);
  panel.appendChild(traitPanel);
  renderStatusAdvancedPanel(derived, advancedViewState);
}

window.isStatusWindowVisible = isStatusWindowVisible;
window.requestStatusUIUpdate = requestStatusUIUpdate;
window.cancelScheduledStatusUIUpdate = cancelScheduledStatusUIUpdate;
window.handleStatusWindowVisibilityChange = handleStatusWindowVisibilityChange;
window.getTraitLevelPointsForLevel = getTraitLevelPointsForLevel;
window.getTraitJobChangeBonus = getTraitJobChangeBonus;
window.getTotalTraitPointsForLevel = getTotalTraitPointsForLevel;
window.getTraitPointsGainedAtLevel = getTraitPointsGainedAtLevel;
window.getAvailableTraitPoints = getAvailableTraitPoints;
window.syncTraitPointCache = syncTraitPointCache;
window.isTraitAllocationJob = isTraitAllocationJob;
window.getStatusAllocationStep = getStatusAllocationStep;
window.toggleStatusAllocationStep = toggleStatusAllocationStep;
window.allocateStatusPoints = allocateStatusPoints;
window.allocateTraitPoints = allocateTraitPoints;
window.allocateTraitPoint = allocateTraitPoint;
window.resetTraitStats = resetTraitStats;
window.resetAllPlayerStats = resetAllPlayerStats;
window.toggleTraitStatusPanel = toggleTraitStatusPanel;
window.isStatusAdvancedInlineMode = isStatusAdvancedInlineMode;
window.toggleStatusAdvancedPanel = toggleStatusAdvancedPanel;
window.setStatusAdvancedTab = setStatusAdvancedTab;
window.createAdvancedMultiDetailRow = createAdvancedMultiDetailRow;
window.formatAdvancedNumber = formatAdvancedNumber;

