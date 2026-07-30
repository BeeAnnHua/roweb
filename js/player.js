//=======================================
// 玩家資料系統 player.js
//=======================================

let player = null;
const SAVE_KEY = "ro_web_save_v0_9_19_ui_scroll_quickbar"; // 保留既有 key，讓所有舊玩家可原地升級。
const SAVE_MINUTE_BACKUP_KEY = `${SAVE_KEY}_minute_backup_v1`;
const SAVE_LEASE_KEY = `${SAVE_KEY}_writer_lease_v2`;
const SAVE_PERSIST_REQUEST_KEY = `${SAVE_KEY}_persist_requested_v2`;
const SAVE_MINUTE_BACKUP_INTERVAL_MS = 60 * 1000;
const SAVE_LEASE_HEARTBEAT_MS = 5 * 1000;
const SAVE_LEASE_STALE_MS = 20 * 1000;
const RO_WEB_SAVE_SCHEMA = "ro_web_player_save_v2";
const RO_WEB_SAVE_FORMAT_VERSION = 2;
const RO_WEB_SAVE_APP_VERSION = "0.9.82HN";
const RO_WEB_SAVE_DB_NAME = "ro_web_offline_save_v1";
const RO_WEB_SAVE_DB_VERSION = 1;
const RO_WEB_SAVE_DB_STORE = "player_saves";
const RO_WEB_SAVE_DB_PRIMARY_ID = "player-primary";
const RO_WEB_SAVE_DB_BACKUP_ID = "player-backup";
let RO_WEB_MINUTE_BACKUP_TIMER = null;
let RO_WEB_SAVE_LEASE_TIMER = null;
let RO_WEB_PENDING_SAVE_TIMER = null;
let RO_WEB_SAVE_SEQUENCE = 0;
let RO_WEB_SAVE_DIRTY = false;
let RO_WEB_SAVE_IN_PROGRESS = false;
let RO_WEB_SAVE_DB_PROMISE = null;
let RO_WEB_SAVE_DURABLE_CHAIN = Promise.resolve();
let RO_WEB_PENDING_DURABLE_SAVE = null;
let RO_WEB_DURABLE_SAVE_TIMER = null;
let RO_WEB_REMOTE_SAVE_ADAPTER = window.RO_WEB_REMOTE_SAVE_ADAPTER || null;

function createSaveSessionId() {
  try {
    const existing = sessionStorage.getItem(`${SAVE_KEY}_session_id_v2`);
    if (existing) return existing;
  } catch (_) {}
  const randomPart = (() => {
    try {
      if (window.crypto?.getRandomValues) {
        const values = new Uint32Array(3);
        window.crypto.getRandomValues(values);
        return Array.from(values, value => value.toString(36)).join("");
      }
    } catch (_) {}
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  })();
  const id = `tab_${Date.now().toString(36)}_${randomPart}`;
  try { sessionStorage.setItem(`${SAVE_KEY}_session_id_v2`, id); } catch (_) {}
  return id;
}

const RO_WEB_SAVE_SESSION_ID = createSaveSessionId();
const RO_WEB_SAVE_SESSION_STARTED_AT = Date.now();
const RO_WEB_SAVE_STATE = {
  schema: RO_WEB_SAVE_SCHEMA,
  appVersion: RO_WEB_SAVE_APP_VERSION,
  sessionId: RO_WEB_SAVE_SESSION_ID,
  sessionStartedAt: RO_WEB_SAVE_SESSION_STARTED_AT,
  saveVersion: 0,
  lastSuccessfulSaveAt: 0,
  lastDurableSaveAt: 0,
  lastLoadedAt: 0,
  loadedSource: "default",
  dirty: false,
  writer: false,
  conflict: false,
  lastError: ""
};
window.RO_WEB_SAVE_STATE = RO_WEB_SAVE_STATE;

function hashPlayerSaveText(text) {
  let hash = 0x811c9dc5;
  const value = String(text || "");
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (`00000000${(hash >>> 0).toString(16)}`).slice(-8);
}

function parsePlayerSaveCandidate(raw, source = "unknown") {
  if (raw === null || raw === undefined || raw === "") return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const wrapped = parsed.player && typeof parsed.player === "object" && !Array.isArray(parsed.player);
    const candidatePlayer = wrapped ? parsed.player : parsed;
    if (!candidatePlayer || typeof candidatePlayer !== "object" || Array.isArray(candidatePlayer)) return null;
    const playerText = JSON.stringify(candidatePlayer);
    const expectedChecksum = wrapped ? String(parsed.checksum || "") : "";
    const actualChecksum = hashPlayerSaveText(playerText);
    if (expectedChecksum && expectedChecksum !== actualChecksum) {
      throw new Error(`${source} checksum mismatch`);
    }
    return {
      source: String(source || "unknown"),
      player: candidatePlayer,
      playerText,
      checksum: expectedChecksum || actualChecksum,
      saveVersion: Math.max(0, Math.floor(Number(parsed.saveVersion || parsed.sequence || 0))),
      savedAt: Math.max(0, Math.floor(Number(parsed.savedAt || parsed.updatedAt || 0))),
      sessionId: wrapped ? String(parsed.sessionId || "") : "",
      reason: wrapped ? String(parsed.reason || "legacy") : "legacy-main",
      schema: wrapped ? String(parsed.schema || "legacy-wrapper") : "legacy-plain",
      rawText: typeof raw === "string" ? raw : JSON.stringify(parsed)
    };
  } catch (error) {
    console.warn(`存檔候選無效（${source}）：`, error);
    return null;
  }
}

function comparePlayerSaveCandidates(a, b) {
  if (!a) return -1;
  if (!b) return 1;
  if (Number(a.saveVersion || 0) !== Number(b.saveVersion || 0)) return Number(a.saveVersion || 0) - Number(b.saveVersion || 0);
  if (Number(a.savedAt || 0) !== Number(b.savedAt || 0)) return Number(a.savedAt || 0) - Number(b.savedAt || 0);
  const priority = { "remote": 5, "indexeddb-primary": 4, "main": 3, "indexeddb-backup": 2, "backup": 1 };
  return Number(priority[a.source] || 0) - Number(priority[b.source] || 0);
}

function chooseNewestPlayerSaveCandidate(candidates) {
  return (Array.isArray(candidates) ? candidates : [])
    .filter(Boolean)
    .sort((a, b) => comparePlayerSaveCandidates(b, a))[0] || null;
}

function readLocalPlayerSaveCandidates() {
  const candidates = [];
  try {
    candidates.push(parsePlayerSaveCandidate(localStorage.getItem(SAVE_KEY), "main"));
    candidates.push(parsePlayerSaveCandidate(localStorage.getItem(SAVE_MINUTE_BACKUP_KEY), "backup"));
  } catch (error) {
    console.warn("無法讀取瀏覽器主存檔／備份：", error);
  }
  return candidates.filter(Boolean);
}

function getNewestLocalPlayerSaveCandidate() {
  return chooseNewestPlayerSaveCandidate(readLocalPlayerSaveCandidates());
}

function openPlayerSaveDatabase() {
  if (RO_WEB_SAVE_DB_PROMISE) return RO_WEB_SAVE_DB_PROMISE;
  if (!window.indexedDB?.open) return Promise.resolve(null);
  RO_WEB_SAVE_DB_PROMISE = new Promise(resolve => {
    let request;
    try { request = window.indexedDB.open(RO_WEB_SAVE_DB_NAME, RO_WEB_SAVE_DB_VERSION); }
    catch (error) { console.warn("無法開啟 IndexedDB 存檔：", error); resolve(null); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RO_WEB_SAVE_DB_STORE)) db.createObjectStore(RO_WEB_SAVE_DB_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { console.warn("IndexedDB 存檔資料庫開啟失敗：", request.error); resolve(null); };
    request.onblocked = () => console.warn("IndexedDB 存檔資料庫被其他分頁阻擋。");
  });
  return RO_WEB_SAVE_DB_PROMISE;
}

async function readIndexedDbPlayerSaveCandidates() {
  const db = await openPlayerSaveDatabase();
  if (!db) return [];
  return new Promise(resolve => {
    let transaction;
    try { transaction = db.transaction(RO_WEB_SAVE_DB_STORE, "readonly"); }
    catch (error) { console.warn("讀取 IndexedDB 存檔失敗：", error); resolve([]); return; }
    const request = transaction.objectStore(RO_WEB_SAVE_DB_STORE).getAll();
    request.onsuccess = () => {
      const rows = Array.isArray(request.result) ? request.result : [];
      resolve(rows.map(row => parsePlayerSaveCandidate(row?.text, row?.id === RO_WEB_SAVE_DB_PRIMARY_ID ? "indexeddb-primary" : "indexeddb-backup")).filter(Boolean));
    };
    request.onerror = () => { console.warn("讀取 IndexedDB 存檔失敗：", request.error); resolve([]); };
  });
}

async function writeIndexedDbPlayerSaveEnvelope(text, envelope) {
  const db = await openPlayerSaveDatabase();
  if (!db) return false;
  return new Promise(resolve => {
    let transaction;
    try { transaction = db.transaction(RO_WEB_SAVE_DB_STORE, "readwrite"); }
    catch (error) { console.warn("寫入 IndexedDB 存檔失敗：", error); resolve(false); return; }
    const store = transaction.objectStore(RO_WEB_SAVE_DB_STORE);
    const oldRequest = store.get(RO_WEB_SAVE_DB_PRIMARY_ID);
    oldRequest.onsuccess = () => {
      const old = oldRequest.result;
      if (old?.text && old.text !== text) store.put({ ...old, id: RO_WEB_SAVE_DB_BACKUP_ID });
      store.put({
        id: RO_WEB_SAVE_DB_PRIMARY_ID,
        text,
        savedAt: Number(envelope.savedAt || Date.now()),
        saveVersion: Number(envelope.saveVersion || 0),
        sessionId: String(envelope.sessionId || "")
      });
    };
    transaction.oncomplete = () => { RO_WEB_SAVE_STATE.lastDurableSaveAt = Number(envelope.savedAt || Date.now()); resolve(true); };
    transaction.onerror = () => { console.warn("IndexedDB 存檔交易失敗：", transaction.error); resolve(false); };
    transaction.onabort = () => resolve(false);
  });
}

async function readRemotePlayerSaveCandidates() {
  const adapter = RO_WEB_REMOTE_SAVE_ADAPTER;
  if (!adapter) return [];
  try {
    const result = typeof adapter.loadCandidates === "function"
      ? await adapter.loadCandidates({ saveKey: SAVE_KEY, playerId: player?.name || "" })
      : (typeof adapter.load === "function" ? await adapter.load({ saveKey: SAVE_KEY, playerId: player?.name || "" }) : null);
    const rows = Array.isArray(result) ? result : (result ? [result] : []);
    return rows.map(row => parsePlayerSaveCandidate(row?.text ?? row, "remote")).filter(Boolean);
  } catch (error) {
    console.warn("後端存檔讀取失敗，繼續使用離線存檔：", error);
    return [];
  }
}

function flushDurablePlayerSave() {
  if (RO_WEB_DURABLE_SAVE_TIMER) {
    clearTimeout(RO_WEB_DURABLE_SAVE_TIMER);
    RO_WEB_DURABLE_SAVE_TIMER = null;
  }
  const pending = RO_WEB_PENDING_DURABLE_SAVE;
  RO_WEB_PENDING_DURABLE_SAVE = null;
  if (!pending) return RO_WEB_SAVE_DURABLE_CHAIN;
  RO_WEB_SAVE_DURABLE_CHAIN = RO_WEB_SAVE_DURABLE_CHAIN
    .catch(() => false)
    .then(async () => {
      const { text, envelope } = pending;
      const idbOk = await writeIndexedDbPlayerSaveEnvelope(text, envelope);
      const adapter = RO_WEB_REMOTE_SAVE_ADAPTER;
      if (adapter) {
        try {
          if (typeof adapter.saveEnvelope === "function") await adapter.saveEnvelope(envelope, { text, saveKey: SAVE_KEY });
          else if (typeof adapter.save === "function") await adapter.save(envelope, { text, saveKey: SAVE_KEY });
        } catch (error) {
          console.warn("後端存檔同步失敗；本機耐久存檔仍保留：", error);
        }
      }
      return idbOk;
    })
    .finally(() => {
      if (RO_WEB_PENDING_DURABLE_SAVE && !RO_WEB_DURABLE_SAVE_TIMER) {
        RO_WEB_DURABLE_SAVE_TIMER = setTimeout(flushDurablePlayerSave, 0);
      }
    });
  return RO_WEB_SAVE_DURABLE_CHAIN;
}

function queueDurablePlayerSave(text, envelope, delayMs = 700) {
  // 長時間掛機可能在短時間內產生多次 saveGame；耐久鏡像只保留最新快照，
  // 避免 IndexedDB／未來後端同步形成無限排隊。
  RO_WEB_PENDING_DURABLE_SAVE = { text, envelope };
  if (RO_WEB_DURABLE_SAVE_TIMER) clearTimeout(RO_WEB_DURABLE_SAVE_TIMER);
  RO_WEB_DURABLE_SAVE_TIMER = setTimeout(flushDurablePlayerSave, Math.max(0, Number(delayMs || 0)));
  return true;
}

async function clearIndexedDbPlayerSaves() {
  const db = await openPlayerSaveDatabase();
  if (!db) return true;
  return new Promise(resolve => {
    try {
      const transaction = db.transaction(RO_WEB_SAVE_DB_STORE, "readwrite");
      transaction.objectStore(RO_WEB_SAVE_DB_STORE).clear();
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch (_) { resolve(false); }
  });
}

function readSaveWriterLease() {
  try {
    const value = JSON.parse(localStorage.getItem(SAVE_LEASE_KEY) || "null");
    return value && typeof value === "object" ? value : null;
  } catch (_) { return null; }
}

function claimSaveWriterLease(force = false) {
  if (window.RO_WEB_RESETTING_SAVE) return false;
  const now = Date.now();
  const current = readSaveWriterLease();
  const stale = !current || now - Number(current.heartbeatAt || 0) > SAVE_LEASE_STALE_MS;
  if (!force && current && current.sessionId !== RO_WEB_SAVE_SESSION_ID && !stale) {
    RO_WEB_SAVE_STATE.writer = false;
    RO_WEB_SAVE_STATE.conflict = true;
    return false;
  }
  const lease = { sessionId: RO_WEB_SAVE_SESSION_ID, startedAt: RO_WEB_SAVE_SESSION_STARTED_AT, heartbeatAt: now, appVersion: RO_WEB_SAVE_APP_VERSION };
  try {
    localStorage.setItem(SAVE_LEASE_KEY, JSON.stringify(lease));
    const verified = readSaveWriterLease();
    const owned = verified?.sessionId === RO_WEB_SAVE_SESSION_ID;
    RO_WEB_SAVE_STATE.writer = owned;
    RO_WEB_SAVE_STATE.conflict = !owned;
    return owned;
  } catch (error) {
    console.warn("無法建立存檔分頁鎖：", error);
    RO_WEB_SAVE_STATE.writer = true; // localStorage 已不可用時仍讓 saveGame 回報真正寫入錯誤。
    return true;
  }
}

function isCurrentSaveWriter() {
  const lease = readSaveWriterLease();
  if (!lease || lease.sessionId === RO_WEB_SAVE_SESSION_ID) return claimSaveWriterLease(false);
  if (Date.now() - Number(lease.heartbeatAt || 0) > SAVE_LEASE_STALE_MS) return claimSaveWriterLease(true);
  RO_WEB_SAVE_STATE.writer = false;
  RO_WEB_SAVE_STATE.conflict = true;
  return false;
}

function heartbeatSaveWriterLease() {
  if (!isCurrentSaveWriter()) return false;
  return claimSaveWriterLease(true);
}

function startSaveWriterLeaseHeartbeat() {
  if (RO_WEB_SAVE_LEASE_TIMER || typeof window.setInterval !== "function") return false;
  claimSaveWriterLease(true); // 最新開啟／重新整理的分頁接管寫入權。
  RO_WEB_SAVE_LEASE_TIMER = window.setInterval(heartbeatSaveWriterLease, SAVE_LEASE_HEARTBEAT_MS);
  return true;
}

function stopSaveWriterLeaseHeartbeat() {
  if (!RO_WEB_SAVE_LEASE_TIMER) return false;
  window.clearInterval(RO_WEB_SAVE_LEASE_TIMER);
  RO_WEB_SAVE_LEASE_TIMER = null;
  return true;
}

async function requestPersistentStorageOnce() {
  if (!navigator?.storage?.persist) return false;
  try {
    if (localStorage.getItem(SAVE_PERSIST_REQUEST_KEY) === "1") return Boolean(await navigator.storage.persisted?.());
    localStorage.setItem(SAVE_PERSIST_REQUEST_KEY, "1");
    const granted = await navigator.storage.persist();
    RO_WEB_SAVE_STATE.persistentStorage = Boolean(granted);
    return Boolean(granted);
  } catch (_) { return false; }
}

function registerRemoteSaveAdapter(adapter) {
  if (adapter && typeof adapter === "object") {
    RO_WEB_REMOTE_SAVE_ADAPTER = adapter;
    window.RO_WEB_REMOTE_SAVE_ADAPTER = adapter;
    return true;
  }
  RO_WEB_REMOTE_SAVE_ADAPTER = null;
  window.RO_WEB_REMOTE_SAVE_ADAPTER = null;
  return false;
}

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
// 角色性別存檔遷移
// 0.9.82GC：新角色必須先選擇性別；舊存檔則保留／推斷原本外觀。
//=======================================
function normalizeCharacterGenderValue(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["male", "m", "男", "man", "boy"].includes(raw)) return "male";
  if (["female", "f", "女", "woman", "girl"].includes(raw)) return "female";
  return null;
}
window.normalizeCharacterGenderValue = normalizeCharacterGenderValue;

function inferLegacyCharacterGender(data = null) {
  if (!data || typeof data !== "object") return null;
  for (const key of ["gender", "sex", "bodyGender"]) {
    const direct = normalizeCharacterGenderValue(data[key]);
    if (direct) return direct;
  }
  const atlas = String(data.characterAtlas || data.appearanceAtlas || "").trim().toLowerCase();
  if (/(?:^|[_\/-])female$/.test(atlas) || /(?:^|[_\/-])女$/.test(atlas)) return "female";
  if (/(?:^|[_\/-])male$/.test(atlas) || /(?:^|[_\/-])男$/.test(atlas)) return "male";
  return null;
}
window.inferLegacyCharacterGender = inferLegacyCharacterGender;


//=======================================
// 玩家 ID（0.9.82GF）
// 僅作為顯示名稱與全服公告名稱；離線版不進行跨玩家唯一性驗證。
//=======================================
function sanitizePlayerId(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getPlayerIdCodePointLength(value) {
  return Array.from(String(value || "")).length;
}

function validatePlayerId(value) {
  const normalized = sanitizePlayerId(value);
  const length = getPlayerIdCodePointLength(normalized);
  if (!normalized) return { ok:false, value:"", error:"請輸入玩家 ID。" };
  if (length > 12) return { ok:false, value:normalized, error:"玩家 ID 最多 12 個字。" };
  return { ok:true, value:normalized, error:"" };
}

function getPlayerAnnouncementName() {
  const name = sanitizePlayerId(window.player?.name);
  return name || "冒險者";
}

function openPlayerIdEditor() {
  const modal = document.getElementById("playerIdModal");
  const input = document.getElementById("playerIdInput");
  const message = document.getElementById("playerIdMessage");
  if (!modal || !input) return false;
  input.value = sanitizePlayerId(player?.name);
  if (message) { message.textContent = ""; message.classList.remove("is-error"); }
  modal.hidden = false;
  document.body?.classList.add("player-id-modal-open");
  window.setTimeout(() => { input.focus(); input.select(); }, 0);
  return true;
}

function closePlayerIdEditor() {
  const modal = document.getElementById("playerIdModal");
  if (modal) modal.hidden = true;
  document.body?.classList.remove("player-id-modal-open");
  return true;
}

function confirmPlayerIdChange() {
  if (!player) return false;
  const input = document.getElementById("playerIdInput");
  const message = document.getElementById("playerIdMessage");
  const result = validatePlayerId(input?.value);
  if (!result.ok) {
    if (message) { message.textContent = result.error; message.classList.add("is-error"); }
    input?.focus();
    return false;
  }
  const previous = sanitizePlayerId(player.name);
  player.name = result.value;
  player.playerIdVersion = 1;
  updatePlayerUI();
  saveGame();
  if (typeof addBattleLog === "function") {
    addBattleLog(previous ? `玩家 ID 已由 ${previous} 更改為 ${result.value}。` : `玩家 ID 已設定為 ${result.value}。`);
  }
  closePlayerIdEditor();
  return true;
}

window.sanitizePlayerId = sanitizePlayerId;
window.validatePlayerId = validatePlayerId;
window.getPlayerAnnouncementName = getPlayerAnnouncementName;
window.openPlayerIdEditor = openPlayerIdEditor;
window.closePlayerIdEditor = closePlayerIdEditor;
window.confirmPlayerIdChange = confirmPlayerIdChange;


//=======================================
// 載入玩家資料
// 先讀取預設角色資料，再用 localStorage 存檔覆蓋
//=======================================
async function loadPlayerData() {
  player = await loadJson("./data/player_default.json", {});
  if (!player || typeof player !== "object" || Array.isArray(player)) {
    throw new Error("player_default.json 無法載入或格式錯誤");
  }

  // 最新開啟的分頁先取得寫入權；舊分頁之後只能繼續顯示，不能反蓋新進度。
  claimSaveWriterLease(true);

  const localCandidates = readLocalPlayerSaveCandidates();
  const [indexedDbCandidates, remoteCandidates] = await Promise.all([
    readIndexedDbPlayerSaveCandidates(),
    readRemotePlayerSaveCandidates()
  ]);
  const loadedCandidate = chooseNewestPlayerSaveCandidate([
    ...localCandidates,
    ...indexedDbCandidates,
    ...remoteCandidates
  ]);
  const loadedSavedPlayer = loadedCandidate?.player || null;

  if (loadedSavedPlayer) {
    player = { ...player, ...loadedSavedPlayer };
    RO_WEB_SAVE_SEQUENCE = Math.max(0, Number(loadedCandidate.saveVersion || 0));
    RO_WEB_SAVE_STATE.saveVersion = RO_WEB_SAVE_SEQUENCE;
    RO_WEB_SAVE_STATE.lastLoadedAt = Date.now();
    RO_WEB_SAVE_STATE.loadedSource = loadedCandidate.source;
    const sourceLabel = {
      main: "主存檔",
      backup: "安全備份",
      "indexeddb-primary": "瀏覽器耐久存檔",
      "indexeddb-backup": "瀏覽器耐久備份",
      remote: "後端存檔"
    }[loadedCandidate.source] || "存檔";
    addBattleLog(`讀取${sourceLabel}成功。`);
  } else {
    RO_WEB_SAVE_STATE.loadedSource = "default";
    if (localCandidates.length || indexedDbCandidates.length || remoteCandidates.length) addBattleLog("所有存檔驗證失敗，使用預設角色資料。");
  }

  // 舊存檔沒有 genderChosen 時，依既有性別欄位或 Atlas 推斷；完全無法判斷時
  // 採舊版預設男性，避免更新後強迫既有玩家重新選擇。全新角色則保持未選擇狀態。
  if (loadedSavedPlayer) {
    player.gender = inferLegacyCharacterGender(loadedSavedPlayer) || "male";
    player.genderChosen = true;
  } else {
    player.gender = normalizeCharacterGenderValue(player.gender);
    player.genderChosen = false;
    player.characterAtlas = null;
  }
  window.RO_WEB_PLAYER_SAVE_FOUND = Boolean(loadedSavedPlayer);

  // 暫存技能配點不應該跟著存檔保存；避免關閉技能窗/重新整理後看起來像已配點。
  if (player && player.pendingSkillAdds) delete player.pendingSkillAdds;

  normalizePlayerData();
  if (typeof syncEquipmentGrantedSkills === "function") syncEquipmentGrantedSkills();
  fixEquippedItemsInInventoryOnce();
  normalizeEquipmentHandConflicts({ silent: true });
  recalculatePlayerStats();

  // 若最新資料來自備份／IndexedDB／後端，啟動後主檔會立刻被修復成同一份最新內容。
  if (loadedCandidate && loadedCandidate.source !== "main") RO_WEB_SAVE_DIRTY = true;
  requestPersistentStorageOnce();
  console.log("玩家資料載入完成：", player, { saveSource: RO_WEB_SAVE_STATE.loadedSource, saveVersion: RO_WEB_SAVE_SEQUENCE });
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

  const normalizedGender = normalizeCharacterGenderValue(player.gender);
  player.gender = normalizedGender || null;
  player.genderChosen = Boolean(player.genderChosen && normalizedGender);

  const legacyPlayerName = sanitizePlayerId(player.name);
  // GC 以前 player.name 固定等於「初心者」，不是玩家自訂 ID。
  player.name = !player.playerIdVersion && ["初心者", "冒險者"].includes(legacyPlayerName) ? "" : legacyPlayerName;
  player.playerIdVersion = 1;

  player.jobKey = String(player.jobKey || getJobKeyFromName(player.job) || "novice");
  let currentJobData = typeof getJobData === "function" ? getJobData(player.jobKey) : null;
  if (!currentJobData && typeof getJobData === "function" && getJobData("novice")) {
    console.warn(`存檔職業 ${player.jobKey} 不存在，已回復為 novice。`);
    player.jobKey = "novice";
    currentJobData = getJobData("novice");
  }
  // 0.9.82GC：角色性別只控制動畫外觀，不再改寫吟遊詩人／舞孃等職業。
  // 既有職業、轉生來源、技能與所有養成資料都必須原樣保留。
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
    // 0.9.82GP：載入存檔只整理／清除過期 Buff；週期治療交給遊戲啟動後的正常 Tick。
    normalizeActiveBuffs({ processPeriodic: false });
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
// 儲存遊戲（0.9.82HN：驗證式雙存檔＋IndexedDB 耐久鏡像＋後端預留）
//=======================================
function buildPlayerSaveSnapshot() {
  if (!player || typeof player !== "object") return null;
  if (player.currentCity) {
    player.map = null;
    player.state = "Town";
  } else if (typeof currentMap !== "undefined" && currentMap) {
    player.map = currentMap.id;
  }
  const playerToSave = { ...player };
  delete playerToSave.pendingSkillAdds;
  return playerToSave;
}

function normalizeSaveReason(reasonOrOptions) {
  if (typeof reasonOrOptions === "string") return reasonOrOptions || "manual";
  if (reasonOrOptions && typeof reasonOrOptions === "object") return String(reasonOrOptions.reason || "manual");
  return "manual";
}

function createPlayerSaveEnvelope(snapshot, reason = "manual") {
  const playerText = JSON.stringify(snapshot);
  const newest = getNewestLocalPlayerSaveCandidate();
  const nextVersion = Math.max(
    Number(RO_WEB_SAVE_SEQUENCE || 0),
    Number(newest?.saveVersion || 0)
  ) + 1;
  const envelope = {
    schema: RO_WEB_SAVE_SCHEMA,
    formatVersion: RO_WEB_SAVE_FORMAT_VERSION,
    appVersion: RO_WEB_SAVE_APP_VERSION,
    saveVersion: nextVersion,
    savedAt: Date.now(),
    sessionId: RO_WEB_SAVE_SESSION_ID,
    reason: String(reason || "manual"),
    checksum: hashPlayerSaveText(playerText),
    player: JSON.parse(playerText)
  };
  return { envelope, text: JSON.stringify(envelope) };
}

function reportSaveFailure(message, error = null) {
  RO_WEB_SAVE_STATE.lastError = String(error?.message || error || message || "unknown save error");
  if (error) console.error(message, error);
  if (!window.RO_WEB_SAVE_ERROR_REPORTED && typeof addBattleLog === "function") {
    addBattleLog(message);
    window.RO_WEB_SAVE_ERROR_REPORTED = true;
  }
}

function verifyStoredEnvelope(key, expectedEnvelope) {
  const candidate = parsePlayerSaveCandidate(localStorage.getItem(key), key === SAVE_KEY ? "main" : "backup");
  return Boolean(candidate
    && Number(candidate.saveVersion) === Number(expectedEnvelope.saveVersion)
    && Number(candidate.savedAt) === Number(expectedEnvelope.savedAt)
    && candidate.checksum === expectedEnvelope.checksum);
}

function markGameSaveDirty(reason = "change") {
  if (window.RO_WEB_RESETTING_SAVE) return false;
  RO_WEB_SAVE_DIRTY = true;
  RO_WEB_SAVE_STATE.dirty = true;
  RO_WEB_SAVE_STATE.dirtyReason = String(reason || "change");
  RO_WEB_SAVE_STATE.dirtyAt = Date.now();
  return true;
}

function saveGame(reasonOrOptions = "manual") {
  if (window.RO_WEB_RESETTING_SAVE || RO_WEB_SAVE_IN_PROGRESS) return false;
  if (!isCurrentSaveWriter()) {
    if (!window.RO_WEB_SAVE_CONFLICT_REPORTED && typeof addBattleLog === "function") {
      addBattleLog("偵測到另一個較新的遊戲分頁；本分頁已停止寫入存檔，避免覆蓋新進度。");
      window.RO_WEB_SAVE_CONFLICT_REPORTED = true;
    }
    return false;
  }
  const snapshot = buildPlayerSaveSnapshot();
  if (!snapshot) return false;
  const reason = normalizeSaveReason(reasonOrOptions);
  RO_WEB_SAVE_IN_PROGRESS = true;
  try {
    const { envelope, text } = createPlayerSaveEnvelope(snapshot, reason);
    localStorage.setItem(SAVE_KEY, text);
    if (!verifyStoredEnvelope(SAVE_KEY, envelope)) throw new Error("主存檔寫入後驗證失敗");

    let backupOk = true;
    try {
      localStorage.setItem(SAVE_MINUTE_BACKUP_KEY, text);
      backupOk = verifyStoredEnvelope(SAVE_MINUTE_BACKUP_KEY, envelope);
      if (!backupOk) throw new Error("安全備份寫入後驗證失敗");
    } catch (backupError) {
      backupOk = false;
      console.error("安全備份寫入失敗；主存檔仍已驗證成功：", backupError);
      if (!window.RO_WEB_BACKUP_ERROR_REPORTED && typeof addBattleLog === "function") {
        addBattleLog("主存檔已保存，但安全備份寫入失敗；請檢查瀏覽器儲存空間。");
        window.RO_WEB_BACKUP_ERROR_REPORTED = true;
      }
    }

    RO_WEB_SAVE_SEQUENCE = Number(envelope.saveVersion || RO_WEB_SAVE_SEQUENCE);
    RO_WEB_SAVE_DIRTY = false;
    RO_WEB_SAVE_STATE.saveVersion = RO_WEB_SAVE_SEQUENCE;
    RO_WEB_SAVE_STATE.lastSuccessfulSaveAt = Number(envelope.savedAt || Date.now());
    RO_WEB_SAVE_STATE.lastReason = reason;
    RO_WEB_SAVE_STATE.lastBackupOk = backupOk;
    RO_WEB_SAVE_STATE.dirty = false;
    RO_WEB_SAVE_STATE.lastError = "";
    window.RO_WEB_SAVE_ERROR_REPORTED = false;
    if (backupOk) window.RO_WEB_BACKUP_ERROR_REPORTED = false;
    window.RO_WEB_SAVE_CONFLICT_REPORTED = false;
    queueDurablePlayerSave(text, envelope);
    try { window.dispatchEvent(new CustomEvent("ro-web-save-success", { detail: { ...RO_WEB_SAVE_STATE } })); } catch (_) {}
    return true;
  } catch (error) {
    reportSaveFailure("儲存失敗：瀏覽器儲存空間不可用、已滿，或資料驗證未通過。", error);
    return false;
  } finally {
    RO_WEB_SAVE_IN_PROGRESS = false;
  }
}

function writeMinutePlayerBackup(reason = "interval") {
  return saveGame({ reason: `backup:${String(reason || "interval")}` });
}

function startMinutePlayerBackup() {
  if (RO_WEB_MINUTE_BACKUP_TIMER || typeof window.setInterval !== "function") return false;
  startSaveWriterLeaseHeartbeat();
  saveGame({ reason: RO_WEB_SAVE_DIRTY ? "startup-repair" : "startup" });
  RO_WEB_MINUTE_BACKUP_TIMER = window.setInterval(() => {
    saveGame({ reason: "interval-60s" });
  }, SAVE_MINUTE_BACKUP_INTERVAL_MS);
  return true;
}

function stopMinutePlayerBackup() {
  if (!RO_WEB_MINUTE_BACKUP_TIMER) return false;
  window.clearInterval(RO_WEB_MINUTE_BACKUP_TIMER);
  RO_WEB_MINUTE_BACKUP_TIMER = null;
  stopSaveWriterLeaseHeartbeat();
  return true;
}
window.writeMinutePlayerBackup = writeMinutePlayerBackup;
window.startMinutePlayerBackup = startMinutePlayerBackup;
window.stopMinutePlayerBackup = stopMinutePlayerBackup;

function requestGameSave(delayMs = 300, reason = "dirty-change") {
  if (window.RO_WEB_RESETTING_SAVE) return false;
  markGameSaveDirty(reason);
  if (RO_WEB_PENDING_SAVE_TIMER) clearTimeout(RO_WEB_PENDING_SAVE_TIMER);
  RO_WEB_PENDING_SAVE_TIMER = setTimeout(() => {
    RO_WEB_PENDING_SAVE_TIMER = null;
    saveGame({ reason: RO_WEB_SAVE_STATE.dirtyReason || reason });
  }, Math.max(0, Number(delayMs || 0)));
  return true;
}

function flushPendingGameSave(reason = "pagehide") {
  if (RO_WEB_PENDING_SAVE_TIMER) {
    clearTimeout(RO_WEB_PENDING_SAVE_TIMER);
    RO_WEB_PENDING_SAVE_TIMER = null;
  }
  const saved = saveGame({ reason: String(reason || "pagehide") });
  // localStorage 主檔／備份已同步完成；IndexedDB／未來後端在離頁前立即開始最新鏡像。
  flushDurablePlayerSave();
  return saved;
}

window.requestGameSave = requestGameSave;
window.flushPendingGameSave = flushPendingGameSave;
window.markGameSaveDirty = markGameSaveDirty;
window.saveGame = saveGame;

window.ROWebSaveManager = Object.freeze({
  version: RO_WEB_SAVE_APP_VERSION,
  schema: RO_WEB_SAVE_SCHEMA,
  getState: () => ({ ...RO_WEB_SAVE_STATE }),
  parseCandidate: parsePlayerSaveCandidate,
  chooseNewest: chooseNewestPlayerSaveCandidate,
  readLocalCandidates: readLocalPlayerSaveCandidates,
  readDurableCandidates: readIndexedDbPlayerSaveCandidates,
  claimWriter: claimSaveWriterLease,
  isWriter: isCurrentSaveWriter,
  markDirty: markGameSaveDirty,
  requestSave: requestGameSave,
  saveNow: saveGame,
  flush: flushPendingGameSave,
  clearDurable: clearIndexedDbPlayerSaves,
  flushDurable: flushDurablePlayerSave,
  registerRemoteAdapter: registerRemoteSaveAdapter
});

if (typeof window.addEventListener === "function") {
  window.addEventListener("pagehide", () => flushPendingGameSave("pagehide"));
  window.addEventListener("beforeunload", () => flushPendingGameSave("beforeunload"));
  window.addEventListener("freeze", () => flushPendingGameSave("freeze"));
  window.addEventListener("pageshow", () => {
    if (!isCurrentSaveWriter()) return;
    heartbeatSaveWriterLease();
    if (RO_WEB_SAVE_DIRTY) requestGameSave(0, "pageshow-dirty");
  });
  window.addEventListener("storage", event => {
    if (event.key === SAVE_LEASE_KEY) {
      const lease = readSaveWriterLease();
      const conflict = Boolean(lease && lease.sessionId !== RO_WEB_SAVE_SESSION_ID && Date.now() - Number(lease.heartbeatAt || 0) <= SAVE_LEASE_STALE_MS);
      RO_WEB_SAVE_STATE.conflict = conflict;
      RO_WEB_SAVE_STATE.writer = !conflict;
    }
  });
}
if (typeof document?.addEventListener === "function") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingGameSave("visibility-hidden");
    else if (isCurrentSaveWriter()) heartbeatSaveWriterLease();
  });
}

//=======================================
// 刪除存檔（0.9.82GH：角色資料與帳號倉庫分離）
//=======================================
let RO_WEB_PENDING_RESET_MODE = null;
const RO_WEB_ACCOUNT_STORAGE_KEY = "ro_web_account_storage_v1";
window.RO_WEB_ACCOUNT_STORAGE_KEY = RO_WEB_ACCOUNT_STORAGE_KEY;

function openResetGameSaveDialog() {
  const modal = document.getElementById("saveResetModal");
  if (!modal) return false;
  RO_WEB_PENDING_RESET_MODE = null;
  showResetGameSaveChoices();
  modal.hidden = false;
  document.body?.classList.add("save-reset-modal-open");
  return true;
}

function closeResetGameSaveDialog() {
  const modal = document.getElementById("saveResetModal");
  if (modal) modal.hidden = true;
  document.body?.classList.remove("save-reset-modal-open");
  RO_WEB_PENDING_RESET_MODE = null;
  return true;
}

function showResetGameSaveChoices() {
  RO_WEB_PENDING_RESET_MODE = null;
  const choices = document.getElementById("saveResetChoicePanel");
  const confirmPanel = document.getElementById("saveResetConfirmPanel");
  const phrase = document.getElementById("saveResetPhraseInput");
  const message = document.getElementById("saveResetMessage");
  if (choices) choices.hidden = false;
  if (confirmPanel) confirmPanel.hidden = true;
  if (phrase) phrase.value = "";
  if (message) message.textContent = "";
  return true;
}

function beginResetGameSave(mode) {
  const normalized = mode === "all" ? "all" : "character";
  RO_WEB_PENDING_RESET_MODE = normalized;
  const choices = document.getElementById("saveResetChoicePanel");
  const confirmPanel = document.getElementById("saveResetConfirmPanel");
  const text = document.getElementById("saveResetConfirmText");
  const phraseLabel = document.getElementById("saveResetPhraseLabel");
  const phrase = document.getElementById("saveResetPhraseInput");
  const message = document.getElementById("saveResetMessage");
  if (choices) choices.hidden = true;
  if (confirmPanel) confirmPanel.hidden = false;
  if (message) message.textContent = "";
  if (phrase) phrase.value = "";
  if (normalized === "all") {
    if (text) text.innerHTML = '<strong class="danger">永久刪除全部資料</strong><p>角色、背包、裝備、技能、帳號倉庫、倉庫內精煉裝備與所有本機設定都會消失，且無法復原。</p>';
    if (phraseLabel) phraseLabel.hidden = false;
    window.setTimeout(() => phrase?.focus(), 0);
  } else {
    if (text) text.innerHTML = '<strong>建立全新角色</strong><p>目前角色的等級、職業、背包、裝備、技能與進度會刪除；帳號共用倉庫及介面設定會完整保留。</p><p class="save-reset-warning">角色身上的物品不會自動搬入倉庫。</p>';
    if (phraseLabel) phraseLabel.hidden = true;
  }
  updateResetGameSaveConfirmState();
  return true;
}

function updateResetGameSaveConfirmState() {
  const button = document.getElementById("saveResetConfirmButton");
  const phrase = document.getElementById("saveResetPhraseInput");
  if (!button) return false;
  const all = RO_WEB_PENDING_RESET_MODE === "all";
  button.disabled = all && String(phrase?.value || "").trim() !== "全部刪除";
  button.classList.toggle("is-delete-all", all);
  button.textContent = all ? "永久刪除全部資料" : "確認刪除角色";
  return !button.disabled;
}

function resetGameSave() {
  return openResetGameSaveDialog();
}

function clearCurrentCharacterSaveOnly() {
  const keysToRemove = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || key === RO_WEB_ACCOUNT_STORAGE_KEY) continue;
      if (key === SAVE_KEY || /^ro_web_(?:save|player|character)(?:_|$)/i.test(key)) keysToRemove.push(key);
    }
    if (!keysToRemove.includes(SAVE_KEY)) keysToRemove.push(SAVE_KEY);
    keysToRemove.forEach(key => localStorage.removeItem(key));
    return true;
  } catch (error) {
    console.warn("清除角色存檔失敗：", error);
    try { localStorage.removeItem(SAVE_KEY); return true; } catch (_) { return false; }
  }
}

function performResetGameSave(mode) {
  const deleteAll = mode === "all";
  window.RO_WEB_RESETTING_SAVE = true;
  if (RO_WEB_PENDING_SAVE_TIMER) {
    clearTimeout(RO_WEB_PENDING_SAVE_TIMER);
    RO_WEB_PENDING_SAVE_TIMER = null;
  }

  try {
    if (typeof clearBattleTimersAndMonster === "function") clearBattleTimersAndMonster({ clearMonster: true });
  } catch (error) {
    console.warn("停止戰鬥計時器失敗：", error);
  }

  try {
    if (deleteAll) localStorage.clear();
    else clearCurrentCharacterSaveOnly();
  } catch (error) {
    console.warn("清除 localStorage 失敗：", error);
  }

  try { sessionStorage.clear(); } catch (error) { console.warn("清除 sessionStorage 失敗：", error); }

  const reloadClean = () => {
    const base = location.origin && location.origin !== "null" ? location.origin + location.pathname : location.pathname;
    location.replace(base + `?v=0.9.82GI-reset-${deleteAll ? "all" : "character"}-` + Date.now());
  };

  const durableClearPromise = typeof clearIndexedDbPlayerSaves === "function"
    ? clearIndexedDbPlayerSaves().catch(() => false)
    : Promise.resolve(true);

  if (!deleteAll) {
    durableClearPromise.finally(reloadClean);
    return true;
  }

  try {
    const cachePromise = window.caches?.keys
      ? caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
      : Promise.resolve();
    Promise.allSettled([cachePromise, durableClearPromise]).finally(reloadClean);
    return true;
  } catch (error) {
    console.warn("清除 Cache Storage 失敗：", error);
  }
  durableClearPromise.finally(reloadClean);
  return true;
}

function confirmResetGameSave() {
  const message = document.getElementById("saveResetMessage");
  if (!RO_WEB_PENDING_RESET_MODE) {
    if (message) message.textContent = "請先選擇刪除方式。";
    return false;
  }
  if (RO_WEB_PENDING_RESET_MODE === "all") {
    const phrase = String(document.getElementById("saveResetPhraseInput")?.value || "").trim();
    if (phrase !== "全部刪除") {
      if (message) message.textContent = "請正確輸入「全部刪除」。";
      updateResetGameSaveConfirmState();
      return false;
    }
  }
  return performResetGameSave(RO_WEB_PENDING_RESET_MODE);
}

Object.assign(window, {
  resetGameSave,
  openResetGameSaveDialog,
  closeResetGameSaveDialog,
  showResetGameSaveChoices,
  beginResetGameSave,
  updateResetGameSaveConfirmState,
  confirmResetGameSave,
  clearCurrentCharacterSaveOnly
});

//=======================================
// 更新玩家資訊畫面
//=======================================
let roStatusUiRenderSignature = "";
let roJobUiRenderSignature = "";
let roSkillUiRenderSignature = "";
let roPlayerBuildMutationDepth = 0;
let roPlayerBuildMutationResumeAuto = false;

function invalidatePlayerUiRenderCaches(scope = "all") {
  const token = String(scope || "all");
  if (token === "all" || token === "status") roStatusUiRenderSignature = "";
  if (token === "all" || token === "job") roJobUiRenderSignature = "";
  if (token === "all" || token === "skill") roSkillUiRenderSignature = "";
}

// 配點／重置會同時改變 Derived Stats、技能候選與自動掛機設定。
// 以同步交易包住整次變更，避免 Auto Battle 在半套資料上執行後卡在舊狀態。
function withPlayerBuildMutation(reason, callback) {
  const outermost = roPlayerBuildMutationDepth === 0;
  const mutationReason = String(reason || "change");
  const preserveAutoController = mutationReason === "status_allocate" || mutationReason === "trait_allocate";
  if (outermost) {
    roPlayerBuildMutationResumeAuto = typeof isAutoBattleRunning === "function" && isAutoBattleRunning();
    window.RO_WEB_PLAYER_BUILD_MUTATION = true;
  }
  roPlayerBuildMutationDepth += 1;
  try {
    return typeof callback === "function" ? callback() : undefined;
  } finally {
    roPlayerBuildMutationDepth = Math.max(0, roPlayerBuildMutationDepth - 1);
    if (roPlayerBuildMutationDepth === 0) {
      window.RO_WEB_PLAYER_BUILD_MUTATION = false;
      invalidatePlayerUiRenderCaches("all");
      if (roPlayerBuildMutationResumeAuto) {
        // 一般／特性素質配點只會改變即時衍生能力，不應重置掛機控制器、
        // 攻擊輪替或目前鎖定目標。技能配點、重置與外觀變更仍沿用完整重置。
        if (!preserveAutoController && typeof resetAutoBattleController === "function") {
          resetAutoBattleController({ running:true, keepTarget:true, reason:`player_build_${mutationReason}` });
        }
        if (!preserveAutoController && player) {
          player.state = (typeof currentMonster !== "undefined" && currentMonster) ? "Attacking" : "Searching";
        }
        if (typeof scheduleAutoBattleTick === "function") scheduleAutoBattleTick(16);
      }
      roPlayerBuildMutationResumeAuto = false;
    }
  }
}
window.invalidatePlayerUiRenderCaches = invalidatePlayerUiRenderCaches;
window.withPlayerBuildMutation = withPlayerBuildMutation;

function isPlayerUiWindowVisible(id) {
  const win = document.getElementById(id);
  return Boolean(win && !win.classList.contains("hidden-window"));
}

function buildCompactActiveBuffSignature() {
  return Object.entries(player?.activeBuffs || {}).sort(([a], [b]) => String(a).localeCompare(String(b))).map(([id, buff]) => [
    id,
    Number(buff?.level || 0),
    Number(buff?.stacks || buff?.stack || 0),
    Number(buff?.expiresAt || buff?.endAt || 0),
    buff?.effects || null,
    buff?.bonuses || null,
    buff?.combatModifiers || null,
    buff?.timingModifiers || null
  ]);
}

function buildEquippedInstanceSignature() {
  return Object.entries(player?.equipmentInstances || {}).sort(([a], [b]) => String(a).localeCompare(String(b))).map(([slot, instance]) => [
    slot,
    String(instance?.instanceId || ""),
    String(instance?.id || ""),
    Number(instance?.refine || instance?.refineLevel || 0),
    (instance?.cards || instance?.cardIds || []).map(card => typeof card === "object" ? String(card.id || card.cardId || "") : String(card || ""))
  ]);
}

function buildStatusUiRenderSignature() {
  return JSON.stringify([
    player?.jobKey,
    Number(player?.baseLevel || 0), Number(player?.jobLevel || 0),
    player?.stats || {}, player?.traits || {},
    Number(player?.usedStatusPoints || 0), Number(player?.usedTraitPoints || 0),
    Number(player?.atk || 0), Number(player?.matk || 0), Number(player?.def || 0), Number(player?.mdef || 0),
    Number(player?.hit || 0), Number(player?.flee || 0), Number(player?.cri || 0), Number(player?.aspd || 0),
    Number(player?.pAtk || 0), Number(player?.sMatk || 0), Number(player?.res || 0), Number(player?.mres || 0),
    Number(player?.maxHp || 0), Number(player?.maxSp || 0), Number(player?.walkSpeed || 0),
    player?.equipment || {}, buildEquippedInstanceSignature(), buildCompactActiveBuffSignature(),
    player?.runtimeStatusModifiers || null, player?.runtimeCombatModifiers || null, player?.runtimeTimingModifiers || null,
    Boolean(player?.statusTraitsExpanded), Boolean(player?.statusAdvancedExpanded), String(player?.statusAdvancedTab || "")
  ]);
}

function buildJobUiRenderSignature() {
  return JSON.stringify([
    player?.jobKey, player?.job, Number(player?.baseLevel || 0), Number(player?.jobLevel || 0),
    Number(player?.skillPoints || 0), player?.completedAdventurerTraining || []
  ]);
}

function buildSkillUiRenderSignature() {
  return JSON.stringify([
    player?.jobKey, Number(player?.skillPoints || 0), player?.skills || {}, player?.extraSkills || {},
    player?.copiedSkills || {}, player?.plagiarizedSkills || {}
  ]);
}

function updatePlayerUI() {
  if (!player) return;

  const currentJobName = (typeof getJobData === "function" ? getJobData(player.jobKey)?.name : null) || player.job || "冒險者";
  const playerId = sanitizePlayerId(player.name);
  const characterCardName = playerId ? `${currentJobName} ${playerId}` : currentJobName;
  player.job = currentJobName;
  setOptionalText("playerName", characterCardName);
  const playerNameElement = document.getElementById("playerName");
  if (playerNameElement) playerNameElement.title = characterCardName;
  setOptionalText("playerJob", currentJobName);
  setOptionalText("mobilePlayerJob", currentJobName);
  setOptionalText("mobilePlayerId", playerId || "未設定");
  const mobilePlayerIdElement = document.getElementById("mobilePlayerId");
  if (mobilePlayerIdElement) mobilePlayerIdElement.title = playerId || "尚未設定玩家 ID";

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
  if (isPlayerUiWindowVisible("status-window")) {
    const signature = buildStatusUiRenderSignature();
    if (signature !== roStatusUiRenderSignature) {
      roStatusUiRenderSignature = signature;
      if (typeof requestStatusUIUpdate === "function") requestStatusUIUpdate();
      else if (typeof updateStatusUI === "function") updateStatusUI();
    }
  }

  setOptionalText("baseExp", formatExpText("base"));
  setOptionalText("jobExp", formatExpText("job"));

  setOptionalText("zeny", formatResourceNumber(player.zeny));
  setOptionalText("blueGem", formatResourceNumber(player.blueGem));
  setOptionalText("redGem", formatResourceNumber(player.redGem));
  if (typeof refreshCurrencyAccessibleLabels === "function") refreshCurrencyAccessibleLabels();

  const battlePlayerName = document.getElementById("battlePlayerName");
  const battlePlayerLevel = document.getElementById("battlePlayerLevel");
  if (battlePlayerName) battlePlayerName.textContent = playerId || currentJobName;
  if (battlePlayerLevel) battlePlayerLevel.textContent = player.baseLevel;
  if (typeof updateCharacterGenderUI === "function") updateCharacterGenderUI();

  if (isPlayerUiWindowVisible("job-window") && typeof updateJobUI === "function") {
    const signature = buildJobUiRenderSignature();
    if (signature !== roJobUiRenderSignature) {
      roJobUiRenderSignature = signature;
      updateJobUI();
    }
  }
  if (isPlayerUiWindowVisible("skill-window") && typeof updateSkillUI === "function") {
    const signature = buildSkillUiRenderSignature();
    if (signature !== roSkillUiRenderSignature) {
      roSkillUiRenderSignature = signature;
      updateSkillUI();
    }
  }
  if (typeof updateQuickSlotUI === "function") updateQuickSlotUI({ skipIfUnchanged: true });
}


function setOptionalText(elementId, value) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const next = String(value ?? "");
  if (el.textContent !== next) el.textContent = next;
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
  const nextFill = `${getRatioPercent(current, max).toFixed(2)}%`;
  if (line.style.getPropertyValue("--fill") !== nextFill) line.style.setProperty("--fill", nextFill);
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
  const equipmentAndCards = window.CardRuntime?.getMergedSource ? window.CardRuntime.getMergedSource() : {};
  const recoveryRate = Math.max(0, Number(activeBuffs.hpRecoveryRate || 0) + Number(passive.hpRecoveryRate || 0) + Number(equipmentAndCards.hpRecoveryRate || 0));
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
  const equipmentAndCards = window.CardRuntime?.getMergedSource ? window.CardRuntime.getMergedSource() : {};
  const recoveryRate = Math.max(0, Number(activeBuffs.spRecoveryRate || 0) + Number(passive.spRecoveryRate || 0) + Number(equipmentAndCards.spRecoveryRate || 0));
  const recoveryFlat = Math.max(0, Number(activeBuffs.spRecoveryFlat || 0) + Number(passive.spRecoveryFlat || 0) + Number(equipmentAndCards.spRecoveryFlat || 0));
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
  const equipmentAndCards = window.CardRuntime?.getMergedSource ? window.CardRuntime.getMergedSource() : {};
  const hpRegenDisabled = Number(recoveryEffects.disableHpRegen || 0) > 0 || Number(equipmentAndCards.noHpRegen || 0) > 0;
  const spRegenDisabled = Number(recoveryEffects.disableSpRegen || 0) > 0 || Number(equipmentAndCards.noSpRegen || 0) > 0;

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
    if (!window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG) emitRewardAwareLog(`獲得道具：${item.name} x ${count}`, "item");
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
const INVENTORY_VISIBLE_SLOT_COUNT = 30;
const INVENTORY_DECOMPOSE_LIMIT = 100; // 預設值；玩家可在確認視窗自行調整。
const INVENTORY_DECOMPOSE_MAX_INPUT = 999999999;
let inventoryDecomposeActive = false;
let inventoryDecomposeCooldownUntil = 0;
let pendingInventoryDecomposeRequest = null;
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

  initInventoryDecomposeDialog();

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

function cloneInventoryForDecompose(source) {
  try {
    if (typeof structuredClone === "function") return structuredClone(source);
  } catch (error) {}
  return JSON.parse(JSON.stringify(source || []));
}

function getInventoryDecomposeEquippedIds() {
  return new Set(
    Object.values(player?.equipmentInstances || {})
      .filter(Boolean)
      .map(instance => String(instance.instanceId || ""))
      .filter(Boolean)
  );
}

function isInventoryItemDecomposeEligible(item, equippedIds = null) {
  if (!item || Number(item.count || 0) <= 0 || item.locked) return false;
  const itemData = getItemData(item.id);
  if (!itemData) return false;
  // 0.9.82GU：轉蛋等手動確認型特殊道具不可進入分解流程，避免再次出現背景數量異常。
  if (itemData.manualUseOnly === true || String(itemData.subCategory || "") === "mvp_gacha" || itemData.noDecompose === true) return false;
  const ids = equippedIds || getInventoryDecomposeEquippedIds();
  if (ids.has(String(item.instanceId || ""))) return false;
  return true;
}

function resolveInventoryDecomposeTarget(target) {
  if (!target || !Array.isArray(player?.inventory)) return null;
  if (target.itemRef && player.inventory.includes(target.itemRef)) return target.itemRef;
  if (target.instanceId) {
    const match = player.inventory.find(row => String(row.instanceId || "") === String(target.instanceId));
    if (match) return match;
  }
  if (target.itemId !== undefined && target.itemId !== null) {
    const match = player.inventory.find(row => String(row.id) === String(target.itemId) && (!target.instanceId || String(row.instanceId || "") === String(target.instanceId)));
    if (match) return match;
  }
  return null;
}

function getInventoryDecomposeCandidates(request = {}) {
  if (!Array.isArray(player?.inventory)) return [];
  const equippedIds = getInventoryDecomposeEquippedIds();
  if (request.mode === "item" || request.target) {
    const target = resolveInventoryDecomposeTarget(request.target || request);
    return target && isInventoryItemDecomposeEligible(target, equippedIds) ? [target] : [];
  }
  const filter = String(request.filter || activeInventoryFilter || "consume");
  return player.inventory.filter(item => {
    const itemData = getItemData(item.id);
    return getInventoryFilterForItem(itemData) === filter && isInventoryItemDecomposeEligible(item, equippedIds);
  });
}

function getInventoryDecomposeAvailableCount(request = {}) {
  return getInventoryDecomposeCandidates(request).reduce((sum, item) => sum + Math.max(0, Math.floor(Number(item.count || 0))), 0);
}

function normalizeInventoryDecomposeAmount(value, availableCount, fallback = INVENTORY_DECOMPOSE_LIMIT) {
  const available = Math.max(0, Math.floor(Number(availableCount || 0)));
  if (!available) return 0;
  let amount = Math.floor(Number(value));
  if (!Number.isFinite(amount) || amount <= 0) amount = Math.max(1, Math.floor(Number(fallback || 1)));
  return Math.max(1, Math.min(amount, available, INVENTORY_DECOMPOSE_MAX_INPUT));
}

function getInventoryDecomposeSellBonusRate() {
  const passiveTotals = typeof getPassiveSkillBonusTotals === "function" ? getPassiveSkillBonusTotals() : {};
  return Math.max(0, Number(passiveTotals.shopSellBonusRate || 0));
}

function getInventoryDecomposeUnitPrice(itemData, sellBonusRate = getInventoryDecomposeSellBonusRate()) {
  return Math.max(1, Math.floor(Number(itemData?.sellPrice || 0) * (100 + sellBonusRate) / 100));
}

function estimateInventoryDecompose(request = {}, requestedAmount = INVENTORY_DECOMPOSE_LIMIT) {
  const candidates = getInventoryDecomposeCandidates(request);
  const availableCount = candidates.reduce((sum, item) => sum + Math.max(0, Math.floor(Number(item.count || 0))), 0);
  const amount = normalizeInventoryDecomposeAmount(requestedAmount, availableCount);
  const sellBonusRate = getInventoryDecomposeSellBonusRate();
  let remaining = amount;
  let zenyGain = 0;
  let affectedStacks = 0;
  for (const item of candidates) {
    if (remaining <= 0) break;
    const count = Math.max(0, Math.floor(Number(item.count || 0)));
    const units = Math.min(count, remaining);
    if (!units) continue;
    affectedStacks += 1;
    zenyGain += getInventoryDecomposeUnitPrice(getItemData(item.id), sellBonusRate) * units;
    remaining -= units;
  }
  return { candidates, availableCount, amount, zenyGain, affectedStacks };
}

// 0.9.82GU：分解使用「單次陣列重建＋單次存檔」。即使輸入數十萬件，
// 運算量仍只與背包堆疊數量有關，不會逐件建立迴圈或逐件存檔。
function executeInventoryDecompose(request = {}, requestedAmount = INVENTORY_DECOMPOSE_LIMIT) {
  const now = Date.now();
  if (!player?.inventory) return { ok:false, reason:"背包尚未載入。" };
  if (inventoryDecomposeActive || now < inventoryDecomposeCooldownUntil) return { ok:false, reason:"分解處理中，請稍候。" };

  const preview = estimateInventoryDecompose(request, requestedAmount);
  if (!preview.availableCount || !preview.amount) return { ok:false, reason:"沒有可分解的未鎖定物品。" };

  inventoryDecomposeActive = true;
  inventoryDecomposeCooldownUntil = now + 650;
  const inventorySnapshot = cloneInventoryForDecompose(player.inventory);
  const zenySnapshot = Number(player.zeny || 0);

  try {
    let remaining = preview.amount;
    let removedCount = 0;
    let zenyGain = 0;
    const removeUnitsByObject = new Map();
    const sellBonusRate = getInventoryDecomposeSellBonusRate();
    const breakdown = [];

    for (const item of preview.candidates) {
      if (remaining <= 0) break;
      const itemData = getItemData(item.id);
      const count = Math.max(0, Math.floor(Number(item.count || 0)));
      const removeUnits = Math.min(count, remaining);
      if (removeUnits <= 0) continue;
      removeUnitsByObject.set(item, removeUnits);
      removedCount += removeUnits;
      remaining -= removeUnits;
      const unitPrice = getInventoryDecomposeUnitPrice(itemData, sellBonusRate);
      zenyGain += unitPrice * removeUnits;
      breakdown.push({ id:item.id, name:itemData?.name || String(item.id), removed:removeUnits, before:count, after:count-removeUnits, unitPrice });
    }

    if (!removedCount) return { ok:false, reason:"沒有可分解的未鎖定物品。" };

    const nextInventory = [];
    for (const item of player.inventory) {
      const removeUnits = Number(removeUnitsByObject.get(item) || 0);
      if (removeUnits <= 0) {
        nextInventory.push(item);
        continue;
      }
      const oldCount = Math.max(0, Math.floor(Number(item.count || 0)));
      const newCount = oldCount - removeUnits;
      // 只扣除確認數量；例如 3000 個、輸入 100，結果固定保留 2900 個。
      if (newCount > 0) nextInventory.push({ ...item, count:newCount });
    }

    player.inventory = nextInventory;
    player.zeny = zenySnapshot + zenyGain;
    if (RO_WEB_PENDING_SAVE_TIMER) {
      clearTimeout(RO_WEB_PENDING_SAVE_TIMER);
      RO_WEB_PENDING_SAVE_TIMER = null;
    }
    const saved = saveGame();
    if (!saved) throw new Error("decompose_save_failed");

    activeInventoryPage = 0;
    updatePlayerUI();
    updateInventoryUI();
    return {
      ok:true,
      removedCount,
      zenyGain,
      remainingEligible:Math.max(0, preview.availableCount - removedCount),
      breakdown
    };
  } catch (error) {
    console.error("物品分解失敗，已回復分解前資料：", error);
    player.inventory = inventorySnapshot;
    player.zeny = zenySnapshot;
    try { saveGame(); } catch (rollbackSaveError) { console.error("分解回復存檔失敗：", rollbackSaveError); }
    updatePlayerUI();
    updateInventoryUI();
    return { ok:false, reason:"分解失敗，已自動回復分解前的背包資料。", error };
  } finally {
    setTimeout(() => { inventoryDecomposeActive = false; }, Math.max(0, inventoryDecomposeCooldownUntil - Date.now()));
  }
}

function closeInventoryDecomposeDialog() {
  pendingInventoryDecomposeRequest = null;
  document.getElementById("inventory-decompose-modal")?.classList.add("hidden-window");
}

function refreshInventoryDecomposeDialogPreview() {
  if (!pendingInventoryDecomposeRequest) return;
  const input = document.getElementById("inventory-decompose-amount");
  const previewText = document.getElementById("inventory-decompose-preview");
  const confirmBtn = document.getElementById("inventory-decompose-confirm");
  const preview = estimateInventoryDecompose(pendingInventoryDecomposeRequest, input?.value);
  if (input) {
    input.max = String(Math.max(1, preview.availableCount));
    const normalized = normalizeInventoryDecomposeAmount(input.value, preview.availableCount);
    if (String(normalized) !== String(input.value)) input.value = String(normalized || 1);
  }
  if (previewText) {
    previewText.textContent = preview.availableCount
      ? `本次將分解 ${preview.amount.toLocaleString()} 件，預計獲得 ${preview.zenyGain.toLocaleString()} Zeny；分解後仍保留 ${Math.max(0, preview.availableCount - preview.amount).toLocaleString()} 件可分解物品。`
      : "目前沒有可分解的未鎖定物品。";
  }
  if (confirmBtn) confirmBtn.disabled = !preview.availableCount || !preview.amount || inventoryDecomposeActive;
}

function openInventoryDecomposeDialog(request = {}) {
  const normalizedRequest = {
    mode:request.mode === "item" || request.target ? "item" : "bulk",
    filter:String(request.filter || activeInventoryFilter || "consume"),
    target:request.target || null,
    itemName:String(request.itemName || ""),
    source:String(request.source || "inventory")
  };
  const preview = estimateInventoryDecompose(normalizedRequest, request.defaultAmount || INVENTORY_DECOMPOSE_LIMIT);
  if (!preview.availableCount) {
    addBattleLog(normalizedRequest.mode === "item" ? "此物品目前無法分解；可能已鎖定、正在穿戴或屬於受保護道具。" : "目前分類沒有可分解的未鎖定物品。");
    return false;
  }

  pendingInventoryDecomposeRequest = normalizedRequest;
  const modal = document.getElementById("inventory-decompose-modal");
  const title = document.getElementById("inventory-decompose-title");
  const summary = document.getElementById("inventory-decompose-summary");
  const input = document.getElementById("inventory-decompose-amount");
  const note = document.getElementById("inventory-decompose-note");
  if (!modal || !title || !summary || !input) return false;

  title.textContent = normalizedRequest.mode === "item" ? "確認分解物品" : "確認批次分解";
  summary.textContent = normalizedRequest.mode === "item"
    ? `${normalizedRequest.itemName || "此物品"}：目前持有 ${preview.availableCount.toLocaleString()} 件。`
    : `目前分類共有 ${preview.availableCount.toLocaleString()} 件可分解的未鎖定物品。`;
  const defaultAmount = normalizedRequest.mode === "item" && preview.availableCount === 1
    ? 1
    : normalizeInventoryDecomposeAmount(request.defaultAmount || INVENTORY_DECOMPOSE_LIMIT, preview.availableCount);
  input.min = "1";
  input.max = String(preview.availableCount);
  input.value = String(defaultAmount);
  input.disabled = preview.availableCount === 1;
  if (note) note.textContent = preview.availableCount > 1
    ? "只會扣除你輸入的數量，不會整組誤刪。例如持有 3,000 個並輸入 100，分解後會保留 2,900 個。"
    : "裝備一次只會分解 1 件。鎖定或穿戴中的裝備不可分解。";
  modal.classList.remove("hidden-window");
  refreshInventoryDecomposeDialogPreview();
  setTimeout(() => { if (!input.disabled) { input.focus(); input.select(); } }, 0);
  return true;
}

function confirmInventoryDecomposeDialog() {
  if (!pendingInventoryDecomposeRequest) return;
  const input = document.getElementById("inventory-decompose-amount");
  const confirmBtn = document.getElementById("inventory-decompose-confirm");
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = "分解中…"; }
  const result = executeInventoryDecompose(pendingInventoryDecomposeRequest, input?.value);
  if (result.ok) {
    addBattleLog(`分解 ${result.removedCount.toLocaleString()} 件物品，獲得 ${result.zenyGain.toLocaleString()} Zeny。${result.remainingEligible > 0 ? ` 尚有 ${result.remainingEligible.toLocaleString()} 件可分解物品。` : ""}`);
    closeInventoryDecomposeDialog();
    if (typeof window.closeItemDetailModal === "function") window.closeItemDetailModal();
  } else {
    addBattleLog(result.reason || "分解失敗，請重新操作。");
    refreshInventoryDecomposeDialogPreview();
  }
  if (confirmBtn) { confirmBtn.textContent = "確認分解"; confirmBtn.disabled = false; }
}

function initInventoryDecomposeDialog() {
  const modal = document.getElementById("inventory-decompose-modal");
  const input = document.getElementById("inventory-decompose-amount");
  const confirmBtn = document.getElementById("inventory-decompose-confirm");
  const cancelBtn = document.getElementById("inventory-decompose-cancel");
  const closeBtn = document.getElementById("inventory-decompose-close");
  if (modal?.dataset.bound === "true") return;
  if (modal) {
    modal.dataset.bound = "true";
    modal.addEventListener("click", event => { if (event.target === modal) closeInventoryDecomposeDialog(); });
  }
  input?.addEventListener("input", refreshInventoryDecomposeDialogPreview);
  input?.addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); confirmInventoryDecomposeDialog(); }
    if (event.key === "Escape") { event.preventDefault(); closeInventoryDecomposeDialog(); }
  });
  confirmBtn?.addEventListener("click", confirmInventoryDecomposeDialog);
  cancelBtn?.addEventListener("click", closeInventoryDecomposeDialog);
  closeBtn?.addEventListener("click", closeInventoryDecomposeDialog);
}

// 背包下方「分解」：先顯示數量確認，不再按一下就立即扣除。
function decomposeUnlockedInventoryItems() {
  return openInventoryDecomposeDialog({ mode:"bulk", filter:activeInventoryFilter, defaultAmount:INVENTORY_DECOMPOSE_LIMIT });
}

Object.assign(window, {
  openInventoryDecomposeDialog,
  closeInventoryDecomposeDialog,
  estimateInventoryDecompose,
  executeInventoryDecompose,
  getInventoryDecomposeAvailableCount,
  isInventoryItemDecomposeEligible
});

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
    useButton.onclick = function (event) {
      useItem(itemId, null, {
        source: "item-info",
        userInitiated: event?.isTrusted === true
      });
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
    // 0.9.82GT：MVP 轉蛋屬於「手動確認型消耗品」。背包格單擊只顯示資料，
    // 不直接開啟，避免掛機期間 UI 重建、手機 ghost click 或誤觸造成數量下降。
    if (itemData.manualUseOnly === true || String(itemData.subCategory || "") === "mvp_gacha") return;
    useItem(item.id, null, { source: "inventory-slot", userInitiated: true });
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
  // 30 格以內維持固定 5×6 外觀；超過 30 格時繼續往下生成，
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
      slot.title = slot.dataset.tooltip;
      slot.setAttribute("aria-label", `${typeof buildCompactItemName === "function" ? buildCompactItemName(item, itemData) : itemData.name} x ${item.count}`);
      if (itemData.type === "consume") {
        const mobileUi = (typeof isMobileViewport === "function" && isMobileViewport()) || Boolean(window.matchMedia?.("(pointer: coarse)")?.matches);
        slot.draggable = !mobileUi;
        slot.title = `${slot.dataset.tooltip}\n點擊查看與設定快捷欄`;
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
  const removedSlotItemIsWeapon = itemData && (String(itemData.type || "").toLowerCase() === "equipment") &&
    (String(itemData.slot || "").toLowerCase() === "weapon" || String(itemData.category || "").toLowerCase() === "weapon" || String(itemData.dbType || "").toLowerCase() === "weapon");
  if ((slot === "weapon" || (slot === "shield" && removedSlotItemIsWeapon)) && typeof clearPhysicalElementEndow === "function") {
    clearPhysicalElementEndow(options.silent ? "weapon_change" : "weapon_unequip", { silent: options.silent === true });
  }
  if (slot === "armor" && typeof clearArmorElementEndow === "function") {
    clearArmorElementEndow(options.silent ? "armor_change" : "armor_unequip", { silent: options.silent === true });
  }
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

  // 臨時屬性附著於當下裝備；更換主手／刺客副手清武器屬性，更換鎧甲清鎧甲屬性。
  if ((slot === "weapon" || (slot === "shield" && isWeaponEquipmentItem(itemData))) && typeof clearPhysicalElementEndow === "function") {
    clearPhysicalElementEndow("weapon_change");
  }
  if (slot === "armor" && typeof clearArmorElementEndow === "function") {
    clearArmorElementEndow("armor_change");
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
// 武器／鎧甲臨時屬性槽（0.9.82GJ）
// 物品與技能同優先：最後施加者覆蓋前一個。
// 技能本身強制傷害屬性由傷害管線處理，優先於本槽但不會刪除本槽。
//=======================================
const ITEM_PHYSICAL_ELEMENT_ENDOW_BUFF_ID = "item_physical_element_endow";
const ITEM_ARMOR_ELEMENT_ENDOW_BUFF_ID = "item_armor_element_endow";

function getPhysicalElementEndowLabel(element) {
  const labels = { Fire: "火", Water: "水", Earth: "地", Wind: "風", Holy: "聖", Dark: "暗", Ghost: "念", Poison: "毒", Undead: "不死", Neutral: "無" };
  return labels[String(element || "")] || String(element || "無");
}

function isRuntimeBuffActive(buff, now = Date.now()) {
  const expiresAt = Number(buff?.expiresAt || 0);
  return !expiresAt || expiresAt > now;
}

function getLatestElementEndow(effectKey) {
  if (!player) return null;
  player.activeBuffs = getPlainPlayerObject(player.activeBuffs);
  const now = Date.now();
  const rows = Object.entries(player.activeBuffs || {})
    .filter(([, buff]) => isRuntimeBuffActive(buff, now) && buff?.effects?.[effectKey] !== undefined && buff?.effects?.[effectKey] !== null && buff?.effects?.[effectKey] !== "")
    .map(([id, buff], order) => ({
      id,
      buff,
      element: String(buff.effects[effectKey]),
      activatedAt: Number(buff.activatedAt || buff.startedAt || 0),
      order
    }))
    .sort((a, b) => (a.activatedAt - b.activatedAt) || (a.order - b.order));
  return rows.length ? rows[rows.length - 1] : null;
}
window.getLatestElementEndow = getLatestElementEndow;

function clearElementEndowSlot(effectKey, slotName, reason = "replace", options = {}) {
  if (!player) return false;
  player.activeBuffs = getPlainPlayerObject(player.activeBuffs);
  let changed = false;
  for (const [id, buff] of Object.entries(player.activeBuffs || {})) {
    if (!buff?.effects || buff.effects[effectKey] === undefined || buff.effects[effectKey] === null) continue;
    changed = true;
    delete buff.effects[effectKey];
    const isDedicatedItemBuff = String(buff.elementEndowSlot || "") === slotName ||
      (slotName === "weapon" && String(id) === ITEM_PHYSICAL_ELEMENT_ENDOW_BUFF_ID) ||
      (slotName === "armor" && String(id) === ITEM_ARMOR_ELEMENT_ENDOW_BUFF_ID);
    if (isDedicatedItemBuff || Object.keys(buff.effects || {}).length === 0) delete player.activeBuffs[id];
  }
  if (slotName === "weapon") {
    const legacyElement = String(player.attackElement || "");
    if (["Fire","Water","Earth","Wind"].includes(legacyElement)) {
      player.attackElement = null;
      changed = true;
    }
  }
  if (changed && !options.silent && typeof addBattleLog === "function") {
    const label = slotName === "armor" ? "鎧甲附加屬性" : "武器附加屬性";
    const action = reason === "unequip" ? "卸下裝備" : reason === "equipment_change" ? "更換裝備" : "新的屬性效果";
    addBattleLog(`${action}，原本的${label}已解除。`);
  }
  return changed;
}

function clearPhysicalElementEndow(reason = "weapon_change", options = {}) {
  const mapped = reason === "weapon_unequip" ? "unequip" : reason === "weapon_change" ? "equipment_change" : reason;
  return clearElementEndowSlot("attackElementOverride", "weapon", mapped, options);
}
window.clearPhysicalElementEndow = clearPhysicalElementEndow;
window.clearWeaponElementEndow = clearPhysicalElementEndow;

function clearArmorElementEndow(reason = "armor_change", options = {}) {
  const mapped = reason === "armor_unequip" ? "unequip" : reason === "armor_change" ? "equipment_change" : reason;
  return clearElementEndowSlot("armorElement", "armor", mapped, options);
}
window.clearArmorElementEndow = clearArmorElementEndow;

function getActiveWeaponElementEndow() {
  return getLatestElementEndow("attackElementOverride");
}
window.getActiveWeaponElementEndow = getActiveWeaponElementEndow;

// 舊 API 保留給既有模組；只回傳技能來源，不再代表技能有較高優先權。
function getActiveSkillWeaponElementEndow() {
  const latest = getActiveWeaponElementEndow();
  return latest && String(latest.id) !== ITEM_PHYSICAL_ELEMENT_ENDOW_BUFF_ID ? latest : null;
}
window.getActiveSkillWeaponElementEndow = getActiveSkillWeaponElementEndow;

function resolvePhysicalWeaponElement(fallbackElement = "Neutral") {
  const latest = getActiveWeaponElementEndow();
  return latest?.element || fallbackElement || "Neutral";
}
window.resolvePhysicalWeaponElement = resolvePhysicalWeaponElement;

// 0.9.82GJ：施放普通技能不再解除臨時武器屬性。此 API 僅為舊呼叫相容。
function cancelConverterForSkillUse() { return false; }
window.cancelConverterForSkillUse = cancelConverterForSkillUse;

function cancelConverterForSkillWeaponEndow(skillName = "屬性附加技能", options = {}) {
  const previous = getActiveWeaponElementEndow();
  const changed = clearElementEndowSlot("attackElementOverride", "weapon", "replace", { silent:true });
  if (changed && !options.silent && typeof addBattleLog === "function") {
    addBattleLog(`${skillName}覆蓋了原本的武器附加屬性。`, "skill");
  }
  return previous || changed;
}
window.cancelConverterForSkillWeaponEndow = cancelConverterForSkillWeaponEndow;

function cancelPreviousArmorElementEndow(skillName = "鎧甲屬性附加技能", options = {}) {
  const previous = getLatestElementEndow("armorElement");
  const changed = clearElementEndowSlot("armorElement", "armor", "replace", { silent:true });
  if (changed && !options.silent && typeof addBattleLog === "function") {
    addBattleLog(`${skillName}覆蓋了原本的鎧甲附加屬性。`, "skill");
  }
  return previous || changed;
}
window.cancelPreviousArmorElementEndow = cancelPreviousArmorElementEndow;

function applyPhysicalElementEndowFromItem(itemData) {
  const effect = itemData?.useEffect || {};
  if (String(effect.type || "") !== "physical_element_endow") return false;
  const element = String(effect.element || "").trim();
  const durationMs = Math.max(1000, Number(effect.durationMs || 1200000));
  if (!element) return false;

  const previous = getActiveWeaponElementEndow();
  clearElementEndowSlot("attackElementOverride", "weapon", "replace", { silent:true });
  player.activeBuffs = getPlainPlayerObject(player.activeBuffs);
  const now = Date.now();
  const buffId = String(effect.buffId || ITEM_PHYSICAL_ELEMENT_ENDOW_BUFF_ID);
  player.activeBuffs[buffId] = {
    id: buffId,
    name: itemData.name,
    sourceItemId: itemData.id,
    elementEndowSlot: "weapon",
    activatedAt: now,
    startedAt: now,
    expiresAt: now + durationMs,
    effects: { attackElementOverride: element }
  };

  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const prefix = previous ? `覆蓋原本的${getPhysicalElementEndowLabel(previous.element)}屬性，` : "";
  addBattleLog(`使用了 ${itemData.name}，${prefix}${minutes} 分鐘內武器附加為${getPhysicalElementEndowLabel(element)}屬性；主手與副手同步生效。`);
  return true;
}
window.applyPhysicalElementEndowFromItem = applyPhysicalElementEndowFromItem;

function applyArmorElementEndowFromItem(itemData) {
  const effect = itemData?.useEffect || {};
  if (!["armor_element_endow", "armor_element_override"].includes(String(effect.type || ""))) return false;
  const element = String(effect.element || "").trim();
  const durationMs = Math.max(1000, Number(effect.durationMs || 1200000));
  if (!element) return false;

  const previous = getLatestElementEndow("armorElement");
  clearElementEndowSlot("armorElement", "armor", "replace", { silent:true });
  player.activeBuffs = getPlainPlayerObject(player.activeBuffs);
  const now = Date.now();
  const buffId = String(effect.buffId || ITEM_ARMOR_ELEMENT_ENDOW_BUFF_ID);
  player.activeBuffs[buffId] = {
    id: buffId,
    name: itemData.name,
    sourceItemId: itemData.id,
    elementEndowSlot: "armor",
    activatedAt: now,
    startedAt: now,
    expiresAt: now + durationMs,
    effects: { armorElement: element }
  };
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const prefix = previous ? `覆蓋原本的${getPhysicalElementEndowLabel(previous.element)}屬性，` : "";
  addBattleLog(`使用了 ${itemData.name}，${prefix}${minutes} 分鐘內鎧甲附加為${getPhysicalElementEndowLabel(element)}屬性。`);
  return true;
}
window.applyArmorElementEndowFromItem = applyArmorElementEndowFromItem;

// 0.9.82FM：手動使用與自動補品共用等級限制及重複使用冷卻。
function getConsumableItemRequiredLevel(itemData) {
  return Math.max(0, Number(itemData?.requiredLevel ?? itemData?.equipLevelMin ?? itemData?.EquipLevelMin ?? itemData?.levelRequired ?? 0));
}
function getConsumableItemReuseDelayMs(itemData) {
  return Math.max(0, Number(itemData?.reuseDelayMs ?? itemData?.delayMs ?? itemData?.Delay?.Duration ?? itemData?.delay?.duration ?? 0));
}
function getConsumableItemReuseKey(itemData) {
  return String(itemData?.reuseGroup || itemData?.delayGroup || itemData?.officialId || itemData?.id || "unknown");
}
function canUseConsumableItem(itemData, options = {}) {
  if (!itemData || !player) return { ok:false, reason:"invalid" };
  const requiredLevel = getConsumableItemRequiredLevel(itemData);
  const baseLevel = Math.max(1, Number(player.baseLevel || player.level || 1));
  if (baseLevel < requiredLevel) {
    if (!options.silent && typeof addBattleLog === "function") addBattleLog(`${itemData.name} 需要 Base Lv.${requiredLevel} 才能使用。`);
    return { ok:false, reason:"level", requiredLevel };
  }
  const key = getConsumableItemReuseKey(itemData);
  const until = Number(player.itemReuseUntil?.[key] || 0);
  if (until > Date.now()) {
    const remainingMs = Math.max(1, until - Date.now());
    if (!options.silent && typeof addBattleLog === "function") addBattleLog(`${itemData.name} 冷卻中，剩餘 ${(remainingMs / 1000).toFixed(1)} 秒。`);
    return { ok:false, reason:"cooldown", remainingMs };
  }
  return { ok:true, requiredLevel, reuseDelayMs:getConsumableItemReuseDelayMs(itemData), key };
}
function markConsumableItemUsed(itemData) {
  if (!player || !itemData) return false;
  const delayMs = getConsumableItemReuseDelayMs(itemData);
  if (delayMs <= 0) return true;
  player.itemReuseUntil = player.itemReuseUntil && typeof player.itemReuseUntil === "object" ? player.itemReuseUntil : {};
  player.itemReuseUntil[getConsumableItemReuseKey(itemData)] = Date.now() + delayMs;
  return true;
}
window.getConsumableItemRequiredLevel = getConsumableItemRequiredLevel;
window.getConsumableItemReuseDelayMs = getConsumableItemReuseDelayMs;
window.canUseConsumableItem = canUseConsumableItem;
window.markConsumableItemUsed = markConsumableItemUsed;

//=======================================
// 使用消耗品
//=======================================
function consumeItem(itemData) {
  if (!itemData) {
    return;
  }

  // 0.9.82GT：手動確認型消耗品不可落入通用 consumeItem 扣除流程。
  // MVP 轉蛋只允許由 MvpGachaRuntime 的授權入口扣除，避免任何掛機／舊 UI
  // 或未來的自動補品邏輯把它當成普通消耗品而一顆一顆扣掉。
  if (itemData.manualUseOnly === true || String(itemData.subCategory || "") === "mvp_gacha") {
    if (typeof addBattleLog === "function") addBattleLog(`${itemData.name} 請從物品資料中的「使用」按鈕開啟。`);
    return;
  }

  // 確認背包裡真的有這個道具
  const inventoryItem = findInventoryItemById(itemData.id);

  if (!inventoryItem || inventoryItem.count <= 0) {
    addBattleLog("背包裡沒有 " + itemData.name + "。");
    return;
  }
  const usability = canUseConsumableItem(itemData);
  if (!usability.ok) return;

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

  // 物品屬性附加與技能屬性附加共用同一優先層：最後施加者覆蓋前一個。
  const endowType = String(itemData?.useEffect?.type || "");
  const isPhysicalEndowItem = endowType === "physical_element_endow";
  const isArmorEndowItem = endowType === "armor_element_endow" || endowType === "armor_element_override";
  const appliedPhysicalEndow = isPhysicalEndowItem ? applyPhysicalElementEndowFromItem(itemData) : false;
  const appliedArmorEndow = isArmorEndowItem ? applyArmorElementEndowFromItem(itemData) : false;
  if ((isPhysicalEndowItem && !appliedPhysicalEndow) || (isArmorEndowItem && !appliedArmorEndow)) return;

  // 0.9.82HQ：官方消耗品 Script 先交由安全 Runtime。支援的效果完整套用；
  // 尚未實作的寵物／製作／Item Group 等機制只提示，不可再默默扣除道具。
  const runtimeUse = window.ConsumableRuntime?.apply?.(itemData, inventoryItem);
  if (runtimeUse?.handled) return runtimeUse.applied === true;

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
    const recovery = typeof calculateItemRecoveryAmount === "function" ? calculateItemRecoveryAmount(recoveryProfile.hp, "hp", itemData) : Number(recoveryProfile.hp || 0);
    const before = Number(player.hp || 0);
    player.hp = Math.min(Number(player.maxHp || before), before + recovery);
    const actual = Math.max(0, player.hp - before);
    addBattleLog("使用了 " + itemData.name + "，HP 恢復 " + actual + "。");
    itemEffectLogged = true;
  }

  // 補 SP，不超過最大 SP；與 HP 回復使用同一套 Runtime 加成。
  if (Number(recoveryProfile.sp || 0) > 0) {
    const recovery = typeof calculateItemRecoveryAmount === "function" ? calculateItemRecoveryAmount(recoveryProfile.sp, "sp", itemData) : Number(recoveryProfile.sp || 0);
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

  if (!itemEffectLogged && !appliedPhysicalEndow && !appliedArmorEndow) {
    addBattleLog(`${itemData.name} 的官方使用效果尚未接入，目前不會消耗此道具。`);
    return false;
  }

  // 背包扣掉 1 個，並開始該道具的 RA 重複使用冷卻。
  markConsumableItemUsed(itemData);
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
    if (itemData.manualUseOnly === true || String(itemData.subCategory || "") === "mvp_gacha") return;

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

  const recovery = typeof calculateItemRecoveryAmount === "function" ? calculateItemRecoveryAmount(itemData.hp, "hp", itemData) : Number(itemData.hp || 0);
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

  const recovery = typeof calculateItemRecoveryAmount === "function" ? calculateItemRecoveryAmount(itemData.sp, "sp", itemData) : Number(itemData.sp || 0);
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
