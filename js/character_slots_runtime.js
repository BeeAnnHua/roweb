//=======================================
// 十二角色欄位／帳號資料 Runtime V0.9.85I
// - 本機先行，保留雲端帳號／角色 API 契約
// - 舊單角色存檔自動遷移至第 1 格
//=======================================
(function () {
  "use strict";

  const VERSION = "0.9.86N";
  const ACCOUNT_KEY = "ro_web_account_profile_v1";
  const LEGACY_SAVE_KEY = "ro_web_save_v0_9_19_ui_scroll_quickbar";
  const SLOT_SAVE_PREFIX = "ro_web_character_save_v1_";
  const SESSION_ENTRY_KEY = "ro_web_character_entry_v1";
  const FORCE_SELECTOR_KEY = "ro_web_force_character_selector_v1";
  const DEFAULT_SLOT_LIMIT = 12;
  const MAX_SLOT_LIMIT = 12;
  const ACCOUNT_SCHEMA = "ro_web_account_profile_v1";
  const CHARACTER_SCHEMA = "ro_web_character_slot_v1";
  const LOCAL_MIGRATION_BACKUP_KEY = "ro_web_account_profile_local_backup_v1";
  const NEW_CLOUD_CHARACTER_BOOTSTRAP_KEY = "ro_web_new_cloud_character_bootstrap_v1";

  let account = null;
  let selectionResolver = null;
  let createTargetSlot = -1;
  let bootstrapCharacterId = "";
  let cloudAdapter = window.RO_WEB_CHARACTER_CLOUD_ADAPTER || null;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function now() { return Date.now(); }

  function randomId(prefix) {
    let random = "";
    try {
      if (window.crypto?.getRandomValues) {
        const values = new Uint32Array(3);
        window.crypto.getRandomValues(values);
        random = Array.from(values, value => value.toString(36)).join("");
      }
    } catch (_) {}
    if (!random) random = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return `${prefix}_${now().toString(36)}_${random}`;
  }

  function readJson(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return clone(fallback);
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : clone(fallback);
    } catch (error) {
      console.warn(`讀取 ${key} 失敗：`, error);
      return clone(fallback);
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`寫入 ${key} 失敗：`, error);
      return false;
    }
  }

  function sanitizeName(value) {
    return String(value ?? "")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[<>]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function validateCharacterName(value) {
    const name = sanitizeName(value);
    const length = Array.from(name).length;
    if (!name) return { ok:false, value:"", error:"請輸入角色名稱。" };
    if (length > 12) return { ok:false, value:name, error:"角色名稱最多 12 個字。" };
    return { ok:true, value:name, error:"" };
  }

  function normalizeGender(value) {
    const raw = String(value || "").toLowerCase();
    return raw === "female" ? "female" : "male";
  }

  function getCharacterSaveKey(characterId) {
    return `${SLOT_SAVE_PREFIX}${String(characterId || "pending")}`;
  }

  function getCharacterBackupKey(characterId) {
    return `${getCharacterSaveKey(characterId)}_minute_backup_v1`;
  }

  function getCharacterIndexedDbId(characterId, kind = "primary") {
    return `character:${String(characterId || "pending")}:${kind === "backup" ? "backup" : "primary"}`;
  }

  function parseSavePlayer(raw) {
    if (!raw) return null;
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      const player = parsed?.player && typeof parsed.player === "object" ? parsed.player : parsed;
      if (!player || typeof player !== "object" || Array.isArray(player)) return null;
      return { player, envelope:parsed?.player ? parsed : null };
    } catch (_) { return null; }
  }

  function summarizePlayer(player, envelope = null, fallback = {}) {
    const source = player && typeof player === "object" ? player : {};
    const updatedAt = Number(envelope?.savedAt || source.updatedAt || fallback.updatedAt || now());
    return {
      name: sanitizeName(source.name || fallback.name || "冒險者") || "冒險者",
      gender: normalizeGender(source.gender || fallback.gender),
      jobKey: String(source.jobKey || fallback.jobKey || "novice"),
      jobName: String(source.job || fallback.jobName || "初學者"),
      baseLevel: Math.max(1, Math.floor(Number(source.baseLevel || fallback.baseLevel || 1))),
      jobLevel: Math.max(1, Math.floor(Number(source.jobLevel || fallback.jobLevel || 1))),
      currentCity: String(source.currentCity || fallback.currentCity || "prontera"),
      map: String(source.map || fallback.map || ""),
      characterAtlas: String(source.characterAtlas || fallback.characterAtlas || ""),
      portraitSrc: String(source.portraitSrc || fallback.portraitSrc || ""),
      lastPlayedAt: updatedAt,
      updatedAt
    };
  }

  function makeEmptyAccount() {
    const createdAt = now();
    return {
      schema: ACCOUNT_SCHEMA,
      version: 1,
      appVersion: VERSION,
      accountId: randomId("acct"),
      slotLimit: DEFAULT_SLOT_LIMIT,
      activeCharacterId: "",
      createdAt,
      updatedAt: createdAt,
      cloud: { enabled:false, provider:"local", lastSyncAt:0, status:"local-only" },
      characters: [],
      legacyMigration: null
    };
  }

  function normalizeCharacterSlot(raw, index) {
    if (!raw || typeof raw !== "object") return null;
    const characterId = String(raw.characterId || "").trim();
    if (!characterId) return null;
    const createdAt = Number(raw.createdAt || now());
    return {
      schema: CHARACTER_SCHEMA,
      characterId,
      slotIndex: Math.max(0, Math.floor(Number(raw.slotIndex ?? index ?? 0))),
      createdAt,
      updatedAt: Number(raw.updatedAt || createdAt),
      revision: Math.max(0, Math.floor(Number(raw.revision || 0))),
      initialized: raw.initialized === true,
      seed: raw.seed && typeof raw.seed === "object" ? {
        name: sanitizeName(raw.seed.name || ""),
        gender: normalizeGender(raw.seed.gender),
        createdAt:Number(raw.seed.createdAt || createdAt)
      } : null,
      summary: summarizePlayer(null, null, raw.summary || raw.seed || {})
    };
  }

  function normalizeAccount(raw) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : makeEmptyAccount();
    const normalized = {
      ...makeEmptyAccount(),
      ...source,
      schema: ACCOUNT_SCHEMA,
      version: 1,
      appVersion: VERSION,
      accountId: String(source.accountId || randomId("acct")),
      slotLimit: Math.min(MAX_SLOT_LIMIT, Math.max(DEFAULT_SLOT_LIMIT, Math.floor(Number(source.slotLimit || DEFAULT_SLOT_LIMIT)))),
      characters: []
    };
    const occupied = new Set();
    for (const row of Array.isArray(source.characters) ? source.characters : []) {
      const slot = normalizeCharacterSlot(row, normalized.characters.length);
      if (!slot || occupied.has(slot.slotIndex) || slot.slotIndex >= normalized.slotLimit) continue;
      occupied.add(slot.slotIndex);
      normalized.characters.push(slot);
    }
    normalized.characters.sort((a,b) => a.slotIndex - b.slotIndex);
    if (!normalized.characters.some(row => row.characterId === normalized.activeCharacterId)) {
      normalized.activeCharacterId = normalized.characters[0]?.characterId || "";
    }
    normalized.updatedAt = Number(source.updatedAt || now());
    normalized.cloud = source.cloud && typeof source.cloud === "object"
      ? { enabled:false, provider:"local", lastSyncAt:0, status:"local-only", ...source.cloud }
      : { enabled:false, provider:"local", lastSyncAt:0, status:"local-only" };
    return normalized;
  }

  function saveAccount() {
    if (!account) return false;
    account.updatedAt = now();
    account.appVersion = VERSION;
    return writeJson(ACCOUNT_KEY, account);
  }

  function findCharacter(characterId) {
    return account?.characters?.find(row => row.characterId === String(characterId || "")) || null;
  }

  function activeCharacter() {
    return findCharacter(account?.activeCharacterId);
  }

  function migrateLegacySaveIfNeeded() {
    // V0.9.86I: once this browser profile is already bound to Supabase, do not recreate
    // the old single-character legacy save on every reload. That old behavior caused a
    // misleading 1/12 flash before the empty cloud list replaced the selector. Legacy
    // data is now discovered by the dedicated rescue scanner in cloud_save_runtime.js.
    if (!account || account.cloud?.enabled === true || account.characters.length || account.legacyMigration?.completedAt) return false;
    let main = null;
    let backup = null;
    try {
      main = localStorage.getItem(LEGACY_SAVE_KEY);
      backup = localStorage.getItem(`${LEGACY_SAVE_KEY}_minute_backup_v1`);
    } catch (_) {}
    const parsedMain = parseSavePlayer(main);
    const parsedBackup = parseSavePlayer(backup);
    const chosen = parsedMain || parsedBackup;
    if (!chosen) return false;

    const characterId = randomId("char");
    const slot = normalizeCharacterSlot({
      characterId,
      slotIndex:0,
      initialized:true,
      createdAt:Number(chosen.player.createdAt || chosen.envelope?.savedAt || now()),
      updatedAt:Number(chosen.envelope?.savedAt || now()),
      revision:Number(chosen.envelope?.saveVersion || 0),
      summary:summarizePlayer(chosen.player, chosen.envelope)
    }, 0);
    account.characters.push(slot);
    account.activeCharacterId = characterId;
    account.legacyMigration = {
      completedAt:now(),
      sourceKey:LEGACY_SAVE_KEY,
      targetCharacterId:characterId,
      retainedLegacyCopy:true
    };
    try {
      if (main) localStorage.setItem(getCharacterSaveKey(characterId), main);
      if (backup) localStorage.setItem(getCharacterBackupKey(characterId), backup);
    } catch (error) {
      console.warn("舊角色存檔遷移寫入失敗：", error);
      return false;
    }
    saveAccount();
    return true;
  }

  async function migrateLegacyIndexedDbIfNeeded() {
    // Same guard as localStorage legacy migration: cloud-bound profiles are read-only
    // rescue sources, never silently re-migrated into a temporary local SLOT.
    if (!account || account.cloud?.enabled === true || account.characters.length || account.legacyMigration?.completedAt || !window.indexedDB?.open) return false;
    return new Promise(resolve => {
      let request;
      try { request = indexedDB.open("ro_web_offline_save_v1", 1); }
      catch (_) { resolve(false); return; }
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("player_saves")) { db.close(); resolve(false); return; }
        const tx = db.transaction("player_saves", "readonly");
        const store = tx.objectStore("player_saves");
        const primaryRequest = store.get("player-primary");
        const backupRequest = store.get("player-backup");
        tx.oncomplete = () => {
          const primary = primaryRequest.result;
          const backup = backupRequest.result;
          const chosenRow = primary?.text ? primary : (backup?.text ? backup : null);
          const parsed = parseSavePlayer(chosenRow?.text);
          if (!parsed) { db.close(); resolve(false); return; }
          const characterId = randomId("char");
          const savedAt = Number(parsed.envelope?.savedAt || chosenRow?.savedAt || now());
          const slot = normalizeCharacterSlot({
            characterId,
            slotIndex:0,
            initialized:true,
            createdAt:Number(parsed.player.createdAt || savedAt),
            updatedAt:savedAt,
            revision:Number(parsed.envelope?.saveVersion || chosenRow?.saveVersion || 0),
            summary:summarizePlayer(parsed.player, parsed.envelope)
          }, 0);
          const writeTx = db.transaction("player_saves", "readwrite");
          const writeStore = writeTx.objectStore("player_saves");
          if (primary?.text) writeStore.put({ ...primary, id:getCharacterIndexedDbId(characterId, "primary") });
          if (backup?.text) writeStore.put({ ...backup, id:getCharacterIndexedDbId(characterId, "backup") });
          writeTx.oncomplete = () => {
            account.characters.push(slot);
            account.activeCharacterId = characterId;
            account.legacyMigration = {
              completedAt:now(),
              sourceKey:"indexeddb:player-primary",
              targetCharacterId:characterId,
              retainedLegacyCopy:true
            };
            saveAccount();
            // player.js 已在本次頁面以 pending save key 載入；保持 bootstrapCharacterId 不變，
            // 玩家進入遷移角色時必須 reload，讓每角色 localStorage／IndexedDB key 重新綁定。
            db.close();
            resolve(true);
          };
          writeTx.onerror = () => { db.close(); resolve(false); };
          writeTx.onabort = () => { db.close(); resolve(false); };
        };
        tx.onerror = () => { db.close(); resolve(false); };
      };
      request.onerror = () => resolve(false);
    });
  }

  function refreshSummariesFromLocalStorage() {
    if (!account) return false;
    let changed = false;
    for (const slot of account.characters) {
      let raw = null;
      try {
        raw = localStorage.getItem(getCharacterSaveKey(slot.characterId))
          || localStorage.getItem(getCharacterBackupKey(slot.characterId));
      } catch (_) {}
      const parsed = parseSavePlayer(raw);
      if (!parsed) continue;
      const nextSummary = summarizePlayer(parsed.player, parsed.envelope, slot.summary);
      const nextRevision = Math.max(slot.revision, Number(parsed.envelope?.saveVersion || 0));
      if (JSON.stringify(nextSummary) !== JSON.stringify(slot.summary) || nextRevision !== slot.revision || !slot.initialized) {
        slot.summary = nextSummary;
        slot.revision = nextRevision;
        slot.initialized = true;
        slot.updatedAt = nextSummary.updatedAt;
        slot.seed = null;
        changed = true;
      }
    }
    if (changed) saveAccount();
    return changed;
  }

  function loadAccount() {
    account = normalizeAccount(readJson(ACCOUNT_KEY, null));
    migrateLegacySaveIfNeeded();
    refreshSummariesFromLocalStorage();
    saveAccount();
    bootstrapCharacterId = String(account.activeCharacterId || "");
    return account;
  }

  function getActiveContext() {
    const slot = activeCharacter();
    return {
      accountId:String(account?.accountId || ""),
      characterId:String(slot?.characterId || ""),
      slotIndex:Number(slot?.slotIndex ?? -1),
      slotLimit:Number(account?.slotLimit || DEFAULT_SLOT_LIMIT),
      revision:Number(slot?.revision || 0),
      createdAt:Number(slot?.createdAt || 0),
      updatedAt:Number(slot?.updatedAt || 0),
      saveKey:getCharacterSaveKey(slot?.characterId || "pending"),
      backupKey:getCharacterBackupKey(slot?.characterId || "pending"),
      indexedDbPrimaryId:getCharacterIndexedDbId(slot?.characterId || "pending", "primary"),
      indexedDbBackupId:getCharacterIndexedDbId(slot?.characterId || "pending", "backup")
    };
  }

  function getActiveSaveKey() { return getActiveContext().saveKey; }
  function getActiveBackupKey() { return getActiveContext().backupKey; }
  function getActiveIndexedDbId(kind) {
    return kind === "backup" ? getActiveContext().indexedDbBackupId : getActiveContext().indexedDbPrimaryId;
  }

  function applyActiveSeed(player) {
    const slot = activeCharacter();
    if (!player || !slot) return player;
    const seed = slot.seed || slot.summary || {};
    if (!slot.initialized) {
      player.name = sanitizeName(seed.name || player.name || "冒險者") || "冒險者";
      player.gender = normalizeGender(seed.gender || player.gender);
      player.genderChosen = true;
      player.characterAtlas = null;
    }
    return normalizePlayerIdentity(player);
  }

  function normalizePlayerIdentity(player) {
    const slot = activeCharacter();
    if (!player || !slot) return player;
    player.accountId = String(account.accountId);
    player.characterId = String(slot.characterId);
    player.slotIndex = Number(slot.slotIndex);
    player.revision = Math.max(Number(player.revision || 0), Number(slot.revision || 0));
    player.createdAt = Number(player.createdAt || slot.createdAt || now());
    player.updatedAt = Number(player.updatedAt || slot.updatedAt || now());
    return player;
  }

  function updateActiveCharacterSummary(player, envelope = null) {
    const slot = activeCharacter();
    if (!slot || !player) return false;
    slot.summary = summarizePlayer(player, envelope, slot.summary);
    const portraitNode = document.getElementById("playerPortrait");
    const currentPortrait = normalizePortraitSrc(portraitNode?.getAttribute("src"));
    if (currentPortrait) slot.summary.portraitSrc = currentPortrait;
    slot.revision = Math.max(slot.revision, Number(envelope?.saveVersion || player.revision || 0));
    slot.updatedAt = Number(envelope?.savedAt || now());
    slot.initialized = true;
    slot.seed = null;
    account.activeCharacterId = slot.characterId;
    saveAccount();
    renderCharacterSlots();
    return true;
  }

  function setStatusMessage(message, error = false) {
    const node = document.getElementById("characterSelectMessage");
    if (!node) return;
    node.textContent = String(message || "");
    node.classList.toggle("is-error", Boolean(error));
  }

  function formatTime(timestamp) {
    const value = Number(timestamp || 0);
    if (!value) return "尚未進入";
    try {
      return new Intl.DateTimeFormat("zh-TW", { month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false }).format(new Date(value));
    } catch (_) { return new Date(value).toLocaleString(); }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizePortraitSrc(value) {
    const raw = String(value || "").trim().split("?")[0].replace(/^\.\//, "");
    return /^assets\/characters\/[a-z0-9_/-]+\.png$/i.test(raw) ? raw : "";
  }

  function portraitForSlot(slot) {
    const summary = slot?.summary || {};
    const gender = normalizeGender(summary.gender || slot?.seed?.gender);
    const savedPortrait = normalizePortraitSrc(summary.portraitSrc);
    if (savedPortrait) return `${savedPortrait}?v=${VERSION}`;

    const atlas = String(summary.characterAtlas || "").trim().toLowerCase();
    const suffix = `_${gender}`;
    const atlasFolder = atlas.endsWith(suffix) ? atlas.slice(0, -suffix.length) : "";
    const jobFolder = String(summary.jobKey || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    const folder = atlasFolder || jobFolder || "novice";
    return `assets/characters/${folder}/${gender}/idle.png?v=${VERSION}`;
  }

  function fallbackPortraitForSlot(slot) {
    const gender = normalizeGender(slot?.summary?.gender || slot?.seed?.gender);
    return `assets/characters/novice/${gender}/idle.png?v=${VERSION}`;
  }

  function cloudStatusLabel() {
    if (!account?.cloud?.enabled) return { text:"本機存檔", state:"local", title:"目前使用本機存檔" };
    const sync = window.RO_WEB_CLOUD_SYNC_STATE || {};
    const state = String(sync.status || "ready");
    if (state === "syncing") return { text:"同步中…", state, title:"正在同步角色進度到雲端" };
    if (state === "synced") return { text:"雲端同步完成", state, title:"最新角色進度已同步到雲端" };
    if (state === "pending") return { text:"雲端待同步", state, title:"本機存檔已保留；雲端同步尚未完成" };
    if (state === "conflict") return { text:"同步衝突", state, title:"偵測到較新的雲端進度，已阻止舊資料覆寫" };
    if (state === "error") return { text:"雲端連線異常", state, title:"目前無法連線到雲端存檔服務" };
    if (state === "connecting") return { text:"連線中…", state, title:"正在連線雲端存檔服務" };
    return { text:"雲端同步", state:"ready", title:"角色進度已啟用雲端同步" };
  }

  function updateCloudStatusIndicator() {
    const cloudNode = document.getElementById("characterCloudStatus");
    if (!cloudNode) return false;
    const info = cloudStatusLabel();
    cloudNode.textContent = info.text;
    cloudNode.dataset.syncState = info.state;
    cloudNode.title = info.title;
    return true;
  }

  function formatLocation(summary = {}) {
    const locationNames = {
      prontera:"普隆德拉", geffen:"吉芬", payon:"斐揚", alberta:"艾爾貝塔",
      morocc:"夢羅克", izlude:"依斯魯得島", aldebaran:"艾爾帕蘭", yuno:"朱諾",
      lighthalzen:"里希塔樂鎮", rachel:"拉赫", veins:"菲音斯", einbroch:"艾音布羅克",
      einbech:"艾音貝赫", comodo:"克魔島", umbala:"汶巴拉", niflheim:"尼芙菲姆"
    };
    const map = String(summary.map || "").trim();
    const city = String(summary.currentCity || "").trim();
    return locationNames[city] || locationNames[map] || city || map || "未知地區";
  }

  function renderCharacterSlots() {
    const grid = document.getElementById("characterSlotGrid");
    if (!grid || !account) return false;
    grid.textContent = "";
    const byIndex = new Map(account.characters.map(slot => [slot.slotIndex, slot]));
    for (let index = 0; index < account.slotLimit; index += 1) {
      const slot = byIndex.get(index) || null;
      const card = document.createElement("article");
      card.className = `character-slot-card${slot ? " is-occupied" : " is-empty"}`;
      card.dataset.slotIndex = String(index);
      if (slot?.characterId === account.activeCharacterId) card.classList.add("is-active");

      if (!slot) {
        card.innerHTML = `
          <button type="button" class="character-slot-create" aria-label="建立第 ${index + 1} 格角色">
            <span class="character-slot-plus" aria-hidden="true">＋</span>
            <strong>建立新角色</strong>
            <small>角色欄位 ${index + 1}</small>
          </button>`;
        card.querySelector("button")?.addEventListener("click", () => openCreateDialog(index));
        grid.appendChild(card);
        continue;
      }

      const summary = slot.summary || {};
      const safeName = escapeHtml(sanitizeName(summary.name || slot.seed?.name || "冒險者"));
      const safeJob = escapeHtml(String(summary.jobName || "初學者"));
      const safeLocation = escapeHtml(formatLocation(summary));
      const portraitSrc = portraitForSlot(slot);
      const fallbackPortrait = fallbackPortraitForSlot(slot);
      card.innerHTML = `
        <div class="character-slot-number">SLOT ${index + 1}</div>
        <div class="character-slot-portrait">
          <span class="character-slot-portrait-aura" aria-hidden="true"></span>
          <img src="${portraitSrc}" alt="${safeName}" loading="eager" decoding="async">
        </div>
        <div class="character-slot-info">
          <h3>${safeName}</h3>
          <p>${safeJob}</p>
          <div class="character-slot-levels"><span>Base ${Number(summary.baseLevel || 1)}</span><span>Job ${Number(summary.jobLevel || 1)}</span></div>
          <small class="character-slot-location">所在地：${safeLocation}</small>
          <small>最後遊玩：${formatTime(summary.lastPlayedAt || slot.updatedAt)}</small>
        </div>
        <div class="character-slot-actions">
          <button type="button" class="character-slot-enter">進入遊戲</button>
          <button type="button" class="character-slot-move">移動位置</button>
          <button type="button" class="character-slot-delete">刪除</button>
        </div>`;
      const portraitImage = card.querySelector(".character-slot-portrait img");
      portraitImage?.addEventListener("error", () => {
        if (portraitImage.dataset.fallbackApplied === "1") return;
        portraitImage.dataset.fallbackApplied = "1";
        portraitImage.src = fallbackPortrait;
      });
      card.addEventListener("click", event => {
        if (event.target.closest("button")) return;
        account.activeCharacterId = slot.characterId;
        saveAccount();
        renderCharacterSlots();
      });
      card.querySelector(".character-slot-enter")?.addEventListener("click", () => enterCharacter(slot.characterId));
      card.querySelector(".character-slot-move")?.addEventListener("click", () => openMoveCharacterDialog(slot.characterId));
      card.querySelector(".character-slot-delete")?.addEventListener("click", () => requestDeleteCharacter(slot.characterId));
      grid.appendChild(card);
    }

    const count = account.characters.length;
    const countNode = document.getElementById("characterSlotCount");
    if (countNode) countNode.textContent = `${count} / ${account.slotLimit}`;
    updateCloudStatusIndicator();
    const identityNode = document.getElementById("characterAccountIdentity");
    if (identityNode) {
      const label = String(account.cloud?.accountName || "").trim();
      const playerId = Number(account.cloud?.playerId || 0);
      identityNode.textContent = label ? `${label}${playerId ? ` · ${playerId}` : ""}` : "本機角色";
    }
    const importButton = document.getElementById("characterImportLocalButton");
    if (importButton) importButton.hidden = !Boolean(window.ROWebCloudRuntime?.hasPendingLocalMigration?.());
    return true;
  }

  function showSelector() {
    window.ROWebLoadingScreen?.hide?.({ immediate:true });
    const overlay = document.getElementById("characterSelectOverlay");
    const root = document.getElementById("game-root");
    if (overlay) overlay.hidden = false;
    if (root) root.setAttribute("aria-hidden", "true");
    document.body?.classList.add("character-select-open");
    refreshSummariesFromLocalStorage();
    renderCharacterSlots();
    setStatusMessage("請選擇角色，或建立新的冒險者。", false);
  }

  function hideSelector() {
    const overlay = document.getElementById("characterSelectOverlay");
    const root = document.getElementById("game-root");
    if (overlay) overlay.hidden = true;
    if (root) root.removeAttribute("aria-hidden");
    document.body?.classList.remove("character-select-open");
  }

  function hasValidEntryToken() {
    const active = activeCharacter();
    if (!active) return false;
    try {
      const token = JSON.parse(sessionStorage.getItem(SESSION_ENTRY_KEY) || "null");
      const forced = sessionStorage.getItem(FORCE_SELECTOR_KEY) === "1";
      // V0.9.85O: character entry is a one-shot hand-off used only for the reload
      // immediately after the player presses "進入遊戲". Consume it here so a later
      // refresh/reopen can never auto-enter the last character. Legacy persistent
      // tokens are rejected as well.
      try { sessionStorage.removeItem(SESSION_ENTRY_KEY); } catch (_) {}
      const expiresAt = Number(token?.expiresAt || 0);
      return !forced
        && token?.oneShot === true
        && expiresAt > now()
        && token?.characterId === active.characterId
        && token?.accountId === account.accountId;
    } catch (_) {
      try { sessionStorage.removeItem(SESSION_ENTRY_KEY); } catch (_) {}
      return false;
    }
  }

  function setEntryToken(characterId) {
    try {
      const issuedAt = now();
      sessionStorage.setItem(SESSION_ENTRY_KEY, JSON.stringify({
        accountId:account.accountId,
        characterId,
        enteredAt:issuedAt,
        expiresAt:issuedAt + 120000,
        oneShot:true
      }));
      sessionStorage.removeItem(FORCE_SELECTOR_KEY);
    } catch (_) {}
  }

  async function ensureActiveCharacterSelection() {
    if (!account.characters.length) await migrateLegacyIndexedDbIfNeeded();
    refreshSummariesFromLocalStorage();
    if (hasValidEntryToken() && activeCharacter()) {
      hideSelector();
      return getActiveContext();
    }
    showSelector();
    return new Promise(resolve => { selectionResolver = resolve; });
  }

  function enterCharacter(characterId) {
    const slot = findCharacter(characterId);
    if (!slot) { setStatusMessage("找不到指定角色。", true); return false; }
    window.ROWebLoadingScreen?.show?.({ reset:true, progress:8, label:`正在載入「${sanitizeName(slot.summary?.name || slot.seed?.name || "角色") }」…` });
    account.activeCharacterId = slot.characterId;
    saveAccount();
    setEntryToken(slot.characterId);
    if (String(bootstrapCharacterId || "") !== String(slot.characterId)) {
      location.reload();
      return true;
    }
    hideSelector();
    if (selectionResolver) {
      const resolve = selectionResolver;
      selectionResolver = null;
      resolve(getActiveContext());
    }
    return true;
  }

  function openCreateDialog(slotIndex) {
    createTargetSlot = Number(slotIndex);
    const modal = document.getElementById("characterCreateModal");
    const input = document.getElementById("characterCreateName");
    const message = document.getElementById("characterCreateMessage");
    if (!modal || !input) return false;
    input.value = "";
    if (message) message.textContent = "";
    document.querySelectorAll("[data-create-gender]").forEach(button => {
      const selected = button.dataset.createGender === "male";
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    modal.hidden = false;
    document.body?.classList.add("character-create-open");
    window.setTimeout(() => input.focus(), 0);
    return true;
  }

  function closeCreateDialog() {
    const modal = document.getElementById("characterCreateModal");
    if (modal) modal.hidden = true;
    document.body?.classList.remove("character-create-open");
    createTargetSlot = -1;
    return true;
  }

  function selectCreateGender(gender) {
    const value = normalizeGender(gender);
    document.querySelectorAll("[data-create-gender]").forEach(button => {
      const selected = button.dataset.createGender === value;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    return value;
  }

  function selectedCreateGender() {
    return document.querySelector("[data-create-gender].is-selected")?.dataset?.createGender || "male";
  }

  async function confirmCreateCharacter() {
    const message = document.getElementById("characterCreateMessage");
    const result = validateCharacterName(document.getElementById("characterCreateName")?.value);
    if (!result.ok) {
      if (message) message.textContent = result.error;
      return false;
    }
    const duplicateName = account.characters.some(slot => sanitizeName(slot.summary?.name || slot.seed?.name).toLocaleLowerCase("zh-TW") === result.value.toLocaleLowerCase("zh-TW"));
    if (duplicateName) {
      if (message) message.textContent = "同一帳號內已經有相同名稱的角色。";
      return false;
    }
    const slotIndex = Math.max(0, Math.floor(Number(createTargetSlot)));
    if (slotIndex >= account.slotLimit || account.characters.some(slot => slot.slotIndex === slotIndex)) {
      if (message) message.textContent = "這個角色欄位已被使用。";
      return false;
    }

    const createdAt = now();
    const seed = { name:result.value, gender:normalizeGender(selectedCreateGender()), createdAt };
    let characterId = randomId("char");
    let cloudRow = null;

    if (cloudAdapter && typeof cloudAdapter.createCharacter === "function") {
      try {
        if (message) message.textContent = "正在建立雲端角色...";
        cloudRow = await cloudAdapter.createCharacter({
          slotIndex,
          name: result.value,
          gender: seed.gender,
          createdAt
        });
        if (!cloudRow?.character_id) throw new Error("雲端沒有回傳角色 ID。");
        characterId = String(cloudRow.character_id);
      } catch (error) {
        console.error("雲端角色建立失敗：", error);
        if (message) message.textContent = `建立角色失敗：${error?.message || error}`;
        return false;
      }
    }

    const slot = normalizeCharacterSlot({
      characterId,
      slotIndex,
      createdAt,
      updatedAt:createdAt,
      initialized:false,
      revision:Number(cloudRow?.revision || 0),
      seed,
      summary:{ ...seed, jobKey:"novice", jobName:"初學者", baseLevel:1, jobLevel:1, currentCity:"prontera", lastPlayedAt:0 }
    }, slotIndex);
    account.characters.push(slot);
    account.characters.sort((a,b) => a.slotIndex - b.slotIndex);
    account.activeCharacterId = characterId;
    saveAccount();
    setEntryToken(characterId);
    if (cloudRow?.character_id) {
      try { sessionStorage.setItem(NEW_CLOUD_CHARACTER_BOOTSTRAP_KEY, String(characterId)); } catch (_) {}
    }
    closeCreateDialog();
    location.reload();
    return true;
  }

  async function deleteIndexedDbRows(characterId) {
    if (!window.indexedDB?.open) return false;
    return new Promise(resolve => {
      let request;
      try { request = indexedDB.open("ro_web_offline_save_v1", 1); }
      catch (_) { resolve(false); return; }
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("player_saves")) { db.close(); resolve(true); return; }
        const tx = db.transaction("player_saves", "readwrite");
        const store = tx.objectStore("player_saves");
        store.delete(getCharacterIndexedDbId(characterId, "primary"));
        store.delete(getCharacterIndexedDbId(characterId, "backup"));
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = () => { db.close(); resolve(false); };
        tx.onabort = () => { db.close(); resolve(false); };
      };
      request.onerror = () => resolve(false);
    });
  }

  async function deleteCharacter(characterId, options = {}) {
    const slot = findCharacter(characterId);
    if (!slot) return false;
    if (cloudAdapter && typeof cloudAdapter.deleteCharacter === "function") {
      try {
        await cloudAdapter.deleteCharacter({
          accountId:String(account.accountId), characterId:String(slot.characterId),
          slotIndex:Number(slot.slotIndex), revision:Number(slot.revision || 0)
        });
      } catch (error) {
        console.warn("雲端角色刪除失敗；本機角色仍依玩家要求刪除：", error);
      }
    }
    try {
      localStorage.removeItem(getCharacterSaveKey(characterId));
      localStorage.removeItem(getCharacterBackupKey(characterId));
      localStorage.removeItem(`${getCharacterSaveKey(characterId)}_writer_lease_v2`);
      localStorage.removeItem(`${getCharacterSaveKey(characterId)}_persist_requested_v2`);
    } catch (_) {}
    await deleteIndexedDbRows(characterId);
    account.characters = account.characters.filter(row => row.characterId !== characterId);
    if (account.activeCharacterId === characterId) account.activeCharacterId = account.characters[0]?.characterId || "";
    saveAccount();
    try { sessionStorage.removeItem(SESSION_ENTRY_KEY); } catch (_) {}
    if (options.reload !== false) {
      try { sessionStorage.setItem(FORCE_SELECTOR_KEY, "1"); } catch (_) {}
      location.reload();
    } else {
      renderCharacterSlots();
    }
    return true;
  }

  function requestDeleteCharacter(characterId) {
    const slot = findCharacter(characterId);
    if (!slot) return false;
    const name = sanitizeName(slot.summary?.name || slot.seed?.name || "此角色");
    if (!window.confirm(`確定刪除「${name}」嗎？\n角色背包、裝備、技能與進度將永久消失；帳號共用倉庫不受影響。`)) return false;
    deleteCharacter(characterId);
    return true;
  }

  function clearActiveCharacterSave(options = {}) {
    const slot = activeCharacter();
    if (!slot) return Promise.resolve(false);
    return deleteCharacter(slot.characterId, options);
  }

  async function returnToCharacterSelection() {
    window.ROWebLoadingScreen?.show?.({ reset:true, progress:8, label:"正在返回角色選擇…" });
    try {
      if (typeof window.saveGameAndWait === "function") await window.saveGameAndWait({ reason:"return-character-select", forceWriter:true });
      else if (typeof window.saveGame === "function") window.saveGame({ reason:"return-character-select", forceWriter:true });
    } catch (_) {}
    try {
      sessionStorage.removeItem(SESSION_ENTRY_KEY);
      sessionStorage.setItem(FORCE_SELECTOR_KEY, "1");
    } catch (_) {}
    location.reload();
    return true;
  }


  function readLocalMigrationBackup() {
    return readJson(LOCAL_MIGRATION_BACKUP_KEY, null);
  }

  function writeLocalMigrationBackup(value) {
    return writeJson(LOCAL_MIGRATION_BACKUP_KEY, value);
  }

  function isLegacyLocalAccountForMigration(value) {
    if (!value || typeof value !== "object") return false;
    if (value.cloud?.enabled === true || String(value.cloud?.provider || "").toLowerCase() === "supabase") return false;
    if (!Array.isArray(value.characters) || !value.characters.length) return false;
    // 本機舊帳號的 accountId 由 randomId("acct") 產生；Supabase account_id 是 UUID。
    // 只允許真正的舊本機資料進入一次性遷移流程，禁止把另一個雲端帳號誤當成來源。
    const id = String(value.accountId || "");
    return !id || id.startsWith("acct_");
  }

  function stashLocalAccountForMigration(targetAccountId = "") {
    if (!isLegacyLocalAccountForMigration(account)) return false;
    const existing = readLocalMigrationBackup();
    if (existing?.account?.characters?.length) return false;
    return writeLocalMigrationBackup({
      schema:"ro_web_local_migration_backup_v2",
      createdAt:now(),
      account:clone(account),
      targetAccountId:String(targetAccountId || ""),
      migratedToAccountId:"",
      migratedAt:0,
      consumed:false,
      mapping:[]
    });
  }

  function getLocalMigrationCandidate(options = {}) {
    const backup = readLocalMigrationBackup();
    if (!backup?.account?.characters?.length) return null;
    if (!isLegacyLocalAccountForMigration(backup.account)) return null;
    const completed = backup.consumed === true || Number(backup.migratedAt || 0) > 0 || Boolean(String(backup.migratedToAccountId || ""));
    if (completed && options.includeCompleted !== true) return null;
    return clone(backup);
  }

  function markLocalMigrationComplete(accountId, mapping = []) {
    const backup = readLocalMigrationBackup();
    if (!backup) return false;
    backup.migratedToAccountId = String(accountId || "");
    backup.migratedAt = now();
    backup.consumed = true;
    backup.mapping = Array.isArray(mapping) ? clone(mapping) : [];
    return writeLocalMigrationBackup(backup);
  }

  function normalizeCloudCharacterRow(row, index = 0) {
    if (!row || typeof row !== "object") return null;
    const characterId = String(row.character_id || "").trim();
    if (!characterId) return null;
    const saveData = row.save_data && typeof row.save_data === "object" ? row.save_data : {};
    const savedPlayer = saveData.player && typeof saveData.player === "object" ? saveData.player : null;
    const createdAt = Number(new Date(row.created_at || 0).getTime() || now());
    const updatedAt = Number(new Date(row.updated_at || 0).getTime() || createdAt);
    const hasSave = Boolean(savedPlayer && Object.keys(savedPlayer).length);
    const gender = normalizeGender(savedPlayer?.gender || saveData?.seed?.gender || "male");
    const name = sanitizeName(row.name || savedPlayer?.name || "冒險者") || "冒險者";
    return normalizeCharacterSlot({
      characterId,
      slotIndex:Math.max(0, Number(row.slot_index || index + 1) - 1),
      createdAt,
      updatedAt,
      revision:Number(row.revision || saveData.saveVersion || 0),
      initialized:hasSave,
      seed:hasSave ? null : { name, gender, createdAt },
      summary:{
        name,
        gender,
        jobKey:String(savedPlayer?.jobKey || "novice"),
        jobName:String(row.job_name || savedPlayer?.job || "初學者"),
        baseLevel:Number(row.base_level || savedPlayer?.baseLevel || 1),
        jobLevel:Number(row.job_level || savedPlayer?.jobLevel || 1),
        currentCity:String(savedPlayer?.currentCity || "prontera"),
        map:String(row.map_name || savedPlayer?.map || ""),
        characterAtlas:String(savedPlayer?.characterAtlas || ""),
        portraitSrc:String(savedPlayer?.portraitSrc || ""),
        lastPlayedAt:Number(saveData.savedAt || updatedAt),
        updatedAt
      }
    }, index);
  }

  function bindCloudAccount(cloudAccount, cloudCharacters = []) {
    if (!cloudAccount?.account_id) return false;
    if (!account?.cloud?.enabled && account?.characters?.length) stashLocalAccountForMigration(cloudAccount.account_id);

    const createdAt = Number(new Date(cloudAccount.created_at || 0).getTime() || now());
    const next = {
      schema:ACCOUNT_SCHEMA,
      version:1,
      appVersion:VERSION,
      accountId:String(cloudAccount.account_id),
      slotLimit:Math.min(MAX_SLOT_LIMIT, Math.max(DEFAULT_SLOT_LIMIT, Number(cloudAccount.slot_limit || DEFAULT_SLOT_LIMIT))),
      activeCharacterId:"",
      createdAt,
      updatedAt:Number(new Date(cloudAccount.updated_at || 0).getTime() || now()),
      cloud:{
        enabled:true,
        provider:"supabase",
        lastSyncAt:now(),
        status:"synced",
        playerId:Number(cloudAccount.player_id || 0),
        accountName:String(cloudAccount.account_name || ""),
        userId:String(cloudAccount.user_id || "")
      },
      characters:(Array.isArray(cloudCharacters) ? cloudCharacters : [])
        .map((row,index) => normalizeCloudCharacterRow(row,index))
        .filter(Boolean)
        .sort((a,b) => a.slotIndex - b.slotIndex),
      legacyMigration:null
    };

    const previousActive = String(account?.activeCharacterId || "");
    next.activeCharacterId = next.characters.some(row => row.characterId === previousActive)
      ? previousActive
      : (next.characters[0]?.characterId || "");

    account = normalizeAccount(next);
    account.cloud = { ...next.cloud };
    saveAccount();
    bootstrapCharacterId = String(account.activeCharacterId || "");
    renderCharacterSlots();
    return true;
  }

  async function moveCharacterToSlot(characterId, targetSlotIndex) {
    const slot = findCharacter(characterId);
    if (!slot) return false;
    const targetIndex = Math.max(0, Math.min(account.slotLimit - 1, Math.floor(Number(targetSlotIndex))));
    if (targetIndex === slot.slotIndex) return true;

    const target = account.characters.find(row => row.slotIndex === targetIndex) || null;

    if (cloudAdapter && typeof cloudAdapter.moveCharacterToSlot === "function") {
      try {
        await cloudAdapter.moveCharacterToSlot(String(slot.characterId), targetIndex);
      } catch (error) {
        console.error("雲端角色移位失敗：", error);
        setStatusMessage(`角色位置調整失敗：${error?.message || error}`, true);
        return false;
      }
    }

    const oldIndex = slot.slotIndex;
    slot.slotIndex = targetIndex;
    if (target) target.slotIndex = oldIndex;
    account.characters.sort((a,b) => a.slotIndex - b.slotIndex);
    saveAccount();
    renderCharacterSlots();
    setStatusMessage(target ? `已交換 SLOT ${oldIndex + 1} 與 SLOT ${targetIndex + 1}。` : `已移動到 SLOT ${targetIndex + 1}。`, false);
    return true;
  }

  function ensureMoveDialog() {
    let modal = document.getElementById("characterMoveModal");
    if (modal) return modal;
    modal = document.createElement("section");
    modal.id = "characterMoveModal";
    modal.className = "character-move-overlay";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="character-move-dialog" role="dialog" aria-modal="true" aria-labelledby="characterMoveTitle">
        <header>
          <div><h2 id="characterMoveTitle">調整角色位置</h2><p>選擇要移動到的角色格；已有角色時會直接交換位置。</p></div>
          <button type="button" class="character-move-close" aria-label="關閉">×</button>
        </header>
        <div id="characterMoveGrid" class="character-move-grid"></div>
        <p id="characterMoveMessage" class="character-move-message"></p>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", event => { if (event.target === modal) closeMoveCharacterDialog(); });
    modal.querySelector(".character-move-close")?.addEventListener("click", closeMoveCharacterDialog);
    return modal;
  }

  let moveCharacterId = "";

  function openMoveCharacterDialog(characterId) {
    const slot = findCharacter(characterId);
    if (!slot) return false;
    moveCharacterId = String(characterId);
    const modal = ensureMoveDialog();
    const grid = modal.querySelector("#characterMoveGrid");
    if (!grid) return false;
    grid.textContent = "";
    const byIndex = new Map(account.characters.map(row => [row.slotIndex, row]));
    for (let index = 0; index < account.slotLimit; index += 1) {
      const occupant = byIndex.get(index) || null;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "character-move-slot";
      if (index === slot.slotIndex) button.classList.add("is-current");
      if (occupant && occupant.characterId !== slot.characterId) button.classList.add("is-occupied");
      const name = occupant ? sanitizeName(occupant.summary?.name || occupant.seed?.name || "冒險者") : "空角色格";
      button.innerHTML = `<b>SLOT ${index + 1}</b><span>${escapeHtml(name)}</span>${index === slot.slotIndex ? "<small>目前位置</small>" : (occupant ? "<small>交換</small>" : "<small>移動</small>")}`;
      button.disabled = index === slot.slotIndex;
      button.addEventListener("click", async () => {
        const ok = await moveCharacterToSlot(moveCharacterId, index);
        if (ok) closeMoveCharacterDialog();
      });
      grid.appendChild(button);
    }
    modal.hidden = false;
    document.body?.classList.add("character-move-open");
    return true;
  }

  function closeMoveCharacterDialog() {
    const modal = document.getElementById("characterMoveModal");
    if (modal) modal.hidden = true;
    document.body?.classList.remove("character-move-open");
    moveCharacterId = "";
    return true;
  }

  function registerCloudAdapter(adapter) {
    cloudAdapter = adapter && typeof adapter === "object" ? adapter : null;
    window.RO_WEB_CHARACTER_CLOUD_ADAPTER = cloudAdapter;
    // 共用同一個 adapter 契約接到 player.js 的角色存檔層：
    // loadCandidates/load + saveEnvelope/save；後台接上後不必改角色選擇 UI。
    window.RO_WEB_REMOTE_SAVE_ADAPTER = cloudAdapter;
    window.ROWebSaveManager?.registerRemoteAdapter?.(cloudAdapter);

    // 重要：只「註冊」雲端 adapter 時，不可把尚未綁定帳號的本機角色
    // 標成 cloud.enabled=true。否則 bindCloudAccount() 會誤以為它本來就
    // 是雲端帳號，跳過第一次的本機角色備份/轉移偵測。
    // 真正的 cloud.enabled 狀態只由 bindCloudAccount() 在取得 Supabase
    // account_id 後設定。
    if (!cloudAdapter && account?.cloud?.enabled !== true) {
      account.cloud = { ...account.cloud, enabled:false, provider:"local", status:"local-only" };
      saveAccount();
    }
    return Boolean(cloudAdapter);
  }

  async function syncAccountToCloud() {
    if (!cloudAdapter || typeof cloudAdapter.saveAccount !== "function") return false;
    await cloudAdapter.saveAccount(clone(account));
    account.cloud.lastSyncAt = now();
    account.cloud.status = "synced";
    saveAccount();
    return true;
  }

  function setSlotLimit(value) {
    const next = Math.min(MAX_SLOT_LIMIT, Math.max(DEFAULT_SLOT_LIMIT, Math.floor(Number(value || DEFAULT_SLOT_LIMIT))));
    const highestOccupied = Math.max(-1, ...account.characters.map(slot => slot.slotIndex));
    if (next <= highestOccupied) return false;
    account.slotLimit = next;
    saveAccount();
    renderCharacterSlots();
    return true;
  }

  if (typeof window.addEventListener === "function") {
    window.addEventListener("ro-web-cloud-sync-state", () => updateCloudStatusIndicator());
  }

  loadAccount();

  const api = {
    version:VERSION,
    schema:ACCOUNT_SCHEMA,
    accountKey:ACCOUNT_KEY,
    legacySaveKey:LEGACY_SAVE_KEY,
    getAccount:() => clone(account),
    getActiveCharacter:() => clone(activeCharacter()),
    getActiveContext,
    getActiveSaveKey,
    getActiveBackupKey,
    getActiveIndexedDbId,
    getCharacterSaveKey,
    getCharacterBackupKey,
    getCharacterIndexedDbId,
    ensureActiveCharacterSelection,
    migrateLegacyIndexedDbIfNeeded,
    renderCharacterSlots,
    updateCloudStatusIndicator,
    enterCharacter,
    openCreateDialog,
    closeCreateDialog,
    selectCreateGender,
    confirmCreateCharacter,
    requestDeleteCharacter,
    deleteCharacter,
    clearActiveCharacterSave,
    returnToCharacterSelection,
    applyActiveSeed,
    normalizePlayerIdentity,
    updateActiveCharacterSummary,
    validateCharacterName,
    setSlotLimit,
    bindCloudAccount,
    getLocalMigrationCandidate,
    markLocalMigrationComplete,
    moveCharacterToSlot,
    openMoveCharacterDialog,
    closeMoveCharacterDialog,
    registerCloudAdapter,
    syncAccountToCloud,
    getCloudAdapter:() => cloudAdapter,
    getRemoteContext:() => ({ ...getActiveContext(), account:clone(account) })
  };

  window.CharacterSlotsRuntime = Object.freeze(api);
  window.ROWebAccountService = window.CharacterSlotsRuntime;
  Object.assign(window, {
    openCharacterCreateDialog:openCreateDialog,
    closeCharacterCreateDialog:closeCreateDialog,
    selectCharacterCreateGender:selectCreateGender,
    confirmCharacterCreate:confirmCreateCharacter,
    openMoveCharacterDialog,
    closeMoveCharacterDialog,
    returnToCharacterSelection
  });
})();
