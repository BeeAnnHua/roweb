// ============================================================
// 彼岸花仙境 / RO_WEB
// Supabase Cloud Save Runtime V0.9.84C
// - Auth Session -> RO Account -> 12 Character Slots
// - Local browser save migration -> ro_characters.save_data
// - Remote adapter for player.js durable save pipeline
// ============================================================
(function () {
  "use strict";

  const VERSION = "0.9.86H";
  const SUPABASE_URL = "https://ecbnsobcjxnrwqlefjci.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_LrQiZeOESpuGnt-hL6m0VQ_zXqn8ehS";
  const SELECTED_ACCOUNT_KEY = "roweb_cloud_selected_account_v1";
  const LOGIN_HINT_KEY = "roweb_cloud_login_aliases_v1";
  const LOCAL_CHARACTER_SAVE_PREFIX = "ro_web_character_save_v1_";

  const sdk = window.supabase;
  const slots = window.CharacterSlotsRuntime;
  let client = null;
  let currentSession = null;
  let currentAccount = null;
  let currentCharacters = [];
  let pendingMigration = false;
  const cloudSyncState = {
    status:"idle",
    lastSuccessAt:0,
    lastAttemptAt:0,
    lastSaveVersion:0,
    lastError:""
  };

  function emitCloudStatus(status, detail = {}) {
    cloudSyncState.status = String(status || "idle");
    cloudSyncState.lastAttemptAt = Number(detail.at || Date.now());
    if (status === "synced") {
      cloudSyncState.lastSuccessAt = cloudSyncState.lastAttemptAt;
      cloudSyncState.lastError = "";
    }
    if (Number.isFinite(Number(detail.saveVersion))) cloudSyncState.lastSaveVersion = Number(detail.saveVersion);
    if (detail.error) cloudSyncState.lastError = String(detail.error?.message || detail.error || "");
    window.RO_WEB_CLOUD_SYNC_STATE = { ...cloudSyncState };
    try { window.dispatchEvent(new CustomEvent("ro-web-cloud-sync-state", { detail:{ ...cloudSyncState, ...detail } })); } catch (_) {}
    return { ...cloudSyncState };
  }

  window.RO_WEB_CLOUD_SYNC_STATE = { ...cloudSyncState };

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function friendlyError(error) {
    const raw = String(error?.message || error || "未知錯誤");
    if (/JWT|session|not authenticated|auth session missing/i.test(raw)) return "登入狀態已失效，請重新登入。";
    if (/Failed to fetch|NetworkError|fetch/i.test(raw)) return "目前無法連線到雲端存檔服務，請檢查網路後再試。";
    if (/duplicate key.*account_slot|ro_characters_account_slot_unique/i.test(raw)) return "目標角色格已被使用。";
    if (/RO_CHARACTER_SLOT_LIMIT_EXCEEDED|RO_INVALID_TARGET_SLOT/i.test(raw)) return "角色格位置超出帳號上限。";
    if (/RO_ACCOUNT_NOT_FOUND/i.test(raw)) return "找不到目前的遊戲帳號。";
    if (/RO_CLOUD_CONFLICT/i.test(raw)) return "雲端已有較新的進度，已停止覆寫。請重新進入角色後再存檔。";
    if (/RO_CHARACTER_SAVE_PERMISSION_DENIED|RO_ACCOUNT_PERMISSION_DENIED/i.test(raw)) return "目前帳號沒有權限更新這個角色的雲端存檔。";
    if (/RO_CHARACTER_NOT_FOUND/i.test(raw)) return "找不到目前選中的雲端角色。";
    if (/RO_RESTORE_CHARACTER_ALREADY_EXISTS/i.test(raw)) return "這個角色已經存在雲端，不需要再次復原。";
    if (/RO_RESTORE_SLOT_OCCUPIED/i.test(raw)) return "原角色欄位已被其他角色使用，請先整理角色欄位後再復原。";
    if (/RO_RESTORE_IDENTITY_MISMATCH/i.test(raw)) return "本機備份身分與目前帳號不一致，已停止復原。";
    if (/RO_RESTORE_SAVE_NOT_ESTABLISHED/i.test(raw)) return "本機只有未建立完成的 Lv1 暫存，不能用來復原雲端角色。";
    return raw;
  }

  function readJson(key, fallback = null) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  }

  function selectedAccountId() {
    try {
      return String(localStorage.getItem(SELECTED_ACCOUNT_KEY)
        || sessionStorage.getItem(SELECTED_ACCOUNT_KEY)
        || "");
    } catch (_) {
      try { return String(sessionStorage.getItem(SELECTED_ACCOUNT_KEY) || ""); } catch (_) { return ""; }
    }
  }

  function rememberAccount(account) {
    if (!account?.account_id) return false;
    const selected = String(account.account_id);
    try { localStorage.setItem(SELECTED_ACCOUNT_KEY, selected); }
    catch (_) { try { sessionStorage.setItem(SELECTED_ACCOUNT_KEY, selected); } catch (_) {} }
    const email = String(currentSession?.user?.email || "").trim();
    const name = String(account.account_name || "").trim().toLowerCase();
    if (email && name) {
      const aliases = readJson(LOGIN_HINT_KEY, {});
      aliases[name] = email;
      writeJson(LOGIN_HINT_KEY, aliases);
    }
    return true;
  }

  function validateReturnPath(value) {
    const raw = String(value || "").trim();
    if (!raw || /^https?:/i.test(raw) || raw.startsWith("//")) return "index.html";
    return raw.replace(/^\.?\//, "") || "index.html";
  }

  function forceCharacterSelectorNext() {
    try {
      sessionStorage.removeItem("ro_web_character_entry_v1");
      sessionStorage.setItem("ro_web_force_character_selector_v1", "1");
    } catch (_) {}
    return true;
  }

  function ensureClient() {
    if (client) return client;
    if (!sdk?.createClient) return null;
    client = sdk.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.ROWebAuthStorage || window.localStorage
      }
    });
    window.ROWebSupabaseClient = client;
    return client;
  }

  async function getSession() {
    const api = ensureClient();
    if (!api) return null;
    const { data, error } = await api.auth.getSession();
    if (error) throw error;
    currentSession = data?.session || null;
    return currentSession;
  }

  async function fetchAccounts() {
    if (!currentSession?.user?.id) return [];
    const { data, error } = await client
      .from("ro_accounts")
      .select("account_id,user_id,player_id,account_name,account_role,account_status,is_test,slot_limit,shared_save,created_at,updated_at")
      .eq("user_id", currentSession.user.id)
      .order("player_id", { ascending: true });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function fetchCharacters(accountId) {
    const { data, error } = await client
      .from("ro_characters")
      .select("character_id,account_id,slot_index,name,job_id,job_name,base_level,job_level,map_name,save_data,revision,created_at,updated_at")
      .eq("account_id", String(accountId))
      .order("slot_index", { ascending: true });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  function hasMeaningfulSaveData(saveData) {
    return Boolean(saveData && typeof saveData === "object" && saveData.player && typeof saveData.player === "object" && Object.keys(saveData.player).length);
  }

  function envelopeVersion(saveData) {
    return Math.max(0, Number(saveData?.saveVersion || saveData?.sequence || 0));
  }

  function envelopeSavedAt(saveData) {
    return Math.max(0, Number(saveData?.savedAt || saveData?.updatedAt || 0));
  }

  function hashPlayerText(text) {
    let hash = 0x811c9dc5;
    const value = String(text || "");
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (`00000000${(hash >>> 0).toString(16)}`).slice(-8);
  }


  function stablePlayerJsonStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(item => stablePlayerJsonStringify(item)).join(",")}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${stablePlayerJsonStringify(value[key])}`).join(",")}}`;
  }

  function hashPlayerStable(value) {
    return hashPlayerText(stablePlayerJsonStringify(value));
  }

  function inspectEnvelope(saveData, accountId = "", characterId = "", options = {}) {
    const raw = saveData && typeof saveData === "object" && !Array.isArray(saveData) ? saveData : null;
    const player = raw?.player && typeof raw.player === "object" && !Array.isArray(raw.player) ? raw.player : null;
    if (!raw || !player) return { valid:false, reason:"missing-player", player:null, version:envelopeVersion(raw), savedAt:envelopeSavedAt(raw), defaultLike:true, established:false };
    const explicitAccountId = String(raw.accountId || player.accountId || "");
    const explicitCharacterId = String(raw.characterId || player.characterId || "");
    if (accountId && explicitAccountId && explicitAccountId !== String(accountId)) return { valid:false, reason:"account-mismatch", player, version:envelopeVersion(raw), savedAt:envelopeSavedAt(raw), defaultLike:false, established:false };
    if (characterId && explicitCharacterId && explicitCharacterId !== String(characterId)) return { valid:false, reason:"character-mismatch", player, version:envelopeVersion(raw), savedAt:envelopeSavedAt(raw), defaultLike:false, established:false };
    const checksum = String(raw.checksum || "");
    const checksumVersion = Math.max(0, Number(raw.checksumVersion || 0));
    if (checksum) {
      if (checksumVersion >= 2) {
        if (checksum !== hashPlayerStable(player)) return { valid:false, reason:"checksum-mismatch", player, version:envelopeVersion(raw), savedAt:envelopeSavedAt(raw), defaultLike:false, established:false };
      } else if (checksum !== hashPlayerText(JSON.stringify(player))) {
        // 只有從 Supabase jsonb 重新讀回的舊 checksum 才允許 key-order 相容。
        if (options.allowLegacyJsonbReorder !== true) return { valid:false, reason:"checksum-mismatch", player, version:envelopeVersion(raw), savedAt:envelopeSavedAt(raw), defaultLike:false, established:false };
      }
    }
    const base = Math.max(1, Number(player.baseLevel || 1));
    const jobLevel = Math.max(1, Number(player.jobLevel || 1));
    const job = String(player.job || "").trim().toLowerCase();
    const novice = new Set(["", "初學者", "初心者", "novice"]);
    const established = base > 1 || jobLevel > 1 || !novice.has(job);
    const defaultLike = base <= 1 && jobLevel <= 1 && novice.has(job);
    return { valid:true, reason:"ok", player, version:envelopeVersion(raw), savedAt:envelopeSavedAt(raw), defaultLike, established };
  }

  function isUuidText(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
  }

  function compareRecoveryEnvelope(a, b) {
    if (!a) return -1;
    if (!b) return 1;
    if (Number(a.version || 0) !== Number(b.version || 0)) return Number(a.version || 0) - Number(b.version || 0);
    return Number(a.savedAt || 0) - Number(b.savedAt || 0);
  }

  async function findRecoverableLocalCharacters(cloudRows = []) {
    if (!currentAccount?.account_id) return [];
    const accountId = String(currentAccount.account_id);
    const remoteIds = new Set((Array.isArray(cloudRows) ? cloudRows : []).map(row => String(row?.character_id || "")));
    const occupiedSlots = new Set((Array.isArray(cloudRows) ? cloudRows : []).map(row => Math.max(1, Number(row?.slot_index || 1))));
    const bestByCharacter = new Map();

    const acceptEnvelope = (envelope, source, hintedCharacterId = "") => {
      if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return false;
      const player = envelope?.player && typeof envelope.player === "object" && !Array.isArray(envelope.player) ? envelope.player : null;
      if (!player) return false;
      const envelopeAccountId = String(envelope.accountId || player.accountId || "");
      const envelopeCharacterId = String(envelope.characterId || player.characterId || hintedCharacterId || "");
      // Recovery is intentionally strict: the durable copy must explicitly identify BOTH
      // the selected cloud account and the original character UUID. Identity-less legacy
      // saves remain migration-only and can never be attached to an arbitrary Player ID.
      if (envelopeAccountId !== accountId || !isUuidText(envelopeCharacterId) || remoteIds.has(envelopeCharacterId)) return false;
      if (hintedCharacterId && isUuidText(hintedCharacterId) && envelopeCharacterId !== hintedCharacterId) return false;
      const check = inspectEnvelope(envelope, accountId, envelopeCharacterId);
      if (!check.valid || !check.established) return false;
      const slotIndexZero = Math.max(0, Math.floor(Number(envelope.slotIndex ?? player.slotIndex ?? 0)));
      const candidate = {
        characterId:envelopeCharacterId,
        accountId,
        envelope,
        player,
        version:check.version,
        savedAt:check.savedAt,
        preferredSlot:Math.min(11, slotIndexZero),
        source:String(source || "browser")
      };
      const previous = bestByCharacter.get(envelopeCharacterId);
      if (!previous || compareRecoveryEnvelope(candidate, previous) > 0) bestByCharacter.set(envelopeCharacterId, candidate);
      return true;
    };

    // 1) Fast browser mirror: localStorage main + minute backup.
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = String(localStorage.key(index) || "");
        if (!key.startsWith(LOCAL_CHARACTER_SAVE_PREFIX)) continue;
        const suffix = key.slice(LOCAL_CHARACTER_SAVE_PREFIX.length);
        const characterId = suffix.replace(/_minute_backup_v1$/, "");
        if (!isUuidText(characterId) || remoteIds.has(characterId)) continue;
        const rawText = localStorage.getItem(key);
        if (!rawText) continue;
        let envelope = null;
        try { envelope = JSON.parse(rawText); } catch (_) { continue; }
        acceptEnvelope(envelope, key.endsWith("_minute_backup_v1") ? "localStorage-backup" : "localStorage-main", characterId);
      }
    } catch (error) {
      console.warn("掃描 localStorage 角色救援備份失敗：", error);
    }

    // 2) Durable browser mirror: scan ALL IndexedDB player_saves rows. This includes
    // character:<uuid>:primary / backup and older player-primary / player-backup rows.
    // Older row IDs are accepted only when the save envelope itself carries an exact
    // accountId + characterId match, so switching RO accounts cannot steal a backup.
    if (window.indexedDB?.open) {
      try {
        const rows = await new Promise(resolve => {
          let request;
          try { request = indexedDB.open("ro_web_offline_save_v1", 1); }
          catch (_) { resolve([]); return; }
          request.onsuccess = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains("player_saves")) { db.close(); resolve([]); return; }
            let tx;
            try { tx = db.transaction("player_saves", "readonly"); }
            catch (_) { db.close(); resolve([]); return; }
            const getAll = tx.objectStore("player_saves").getAll();
            getAll.onsuccess = () => {
              const result = Array.isArray(getAll.result) ? getAll.result : [];
              db.close();
              resolve(result);
            };
            getAll.onerror = () => { db.close(); resolve([]); };
            tx.onabort = () => { try { db.close(); } catch (_) {} resolve([]); };
          };
          request.onerror = () => resolve([]);
          request.onblocked = () => resolve([]);
        });

        for (const row of rows) {
          if (!row?.text) continue;
          let envelope = null;
          try { envelope = JSON.parse(row.text); } catch (_) { continue; }
          const id = String(row.id || "");
          const match = id.match(/^character:([0-9a-f-]{36}):(primary|backup)$/i);
          const hintedCharacterId = match?.[1] || "";
          const kind = match?.[2] || (/backup/i.test(id) ? "backup" : "primary");
          acceptEnvelope(envelope, `IndexedDB-${kind}`, hintedCharacterId);
        }
      } catch (error) {
        console.warn("掃描 IndexedDB 角色救援備份失敗：", error);
      }
    }

    const freeSlotFor = preferredZero => {
      const preferredOne = Math.max(1, Math.min(Number(currentAccount.slot_limit || 12), Number(preferredZero || 0) + 1));
      if (!occupiedSlots.has(preferredOne)) return preferredOne;
      const limit = Math.max(1, Math.min(12, Number(currentAccount.slot_limit || 12)));
      for (let slot = 1; slot <= limit; slot += 1) if (!occupiedSlots.has(slot)) return slot;
      return 0;
    };

    return [...bestByCharacter.values()]
      .map(candidate => ({ ...candidate, targetSlot:freeSlotFor(candidate.preferredSlot) }))
      .filter(candidate => candidate.targetSlot > 0)
      .sort((a,b) => a.targetSlot - b.targetSlot);
  }

  function ensureLocalRecoveryModal() {
    let overlay = document.getElementById("cloudLocalRecoveryOverlay");
    if (overlay) return overlay;
    const style = document.createElement("style");
    style.textContent = `
      .cloud-local-recovery-overlay{position:fixed;inset:0;z-index:2147483100;display:grid;place-items:center;background:rgba(3,2,1,.76);backdrop-filter:blur(5px)}
      .cloud-local-recovery-overlay[hidden]{display:none!important}.cloud-local-recovery-dialog{width:min(560px,calc(100vw - 34px));padding:24px;border:1px solid rgba(219,170,67,.78);border-radius:17px;background:linear-gradient(180deg,rgba(30,20,10,.98),rgba(13,9,5,.98));box-shadow:0 28px 90px #000d;color:#e8d9b6;text-align:center}
      .cloud-local-recovery-emblem{width:58px;height:58px;margin:0 auto 12px;display:grid;place-items:center;border-radius:15px;background:linear-gradient(#fff0ad,#d9a62e);color:#402800;font-size:31px;font-weight:1000;box-shadow:0 8px 25px #0008}.cloud-local-recovery-dialog h2{margin:0 0 10px;color:#ffe39a;font-size:23px}.cloud-local-recovery-dialog p{margin:8px 0;line-height:1.8}.cloud-local-recovery-character{margin:15px 0;padding:13px;border:1px solid rgba(194,139,36,.45);border-radius:10px;background:#090704;color:#ffe8ae}.cloud-local-recovery-status{min-height:22px;margin-top:10px;color:#d8c79f}.cloud-local-recovery-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:15px}.cloud-local-recovery-actions button{min-height:43px;border:1px solid #a97722;border-radius:8px;background:linear-gradient(#5a3b12,#291907);color:#ffe6a1;font-weight:900;cursor:pointer}.cloud-local-recovery-actions button:disabled{opacity:.45;cursor:default}.cloud-local-recovery-dialog small{display:block;margin-top:12px;color:#9f8c68}`;
    document.head.appendChild(style);
    overlay = document.createElement("section");
    overlay.id = "cloudLocalRecoveryOverlay";
    overlay.className = "cloud-local-recovery-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="cloud-local-recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="cloudLocalRecoveryTitle">
        <div class="cloud-local-recovery-emblem">✿</div>
        <h2 id="cloudLocalRecoveryTitle">偵測到可復原的本機角色</h2>
        <p>雲端已找不到這個角色，但目前裝置仍保存一份完整且身分相符的角色備份。</p>
        <div class="cloud-local-recovery-character"></div>
        <div class="cloud-local-recovery-status"></div>
        <div class="cloud-local-recovery-actions">
          <button type="button" class="cloud-local-recovery-primary">復原至雲端</button>
          <button type="button" class="cloud-local-recovery-secondary">暫不復原</button>
        </div>
        <small>只會復原目前登入 Player ID 自己的角色；Lv1／身分不符的暫存不會被接受。</small>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function promptLocalRecovery(candidate) {
    // V0.9.85O: the RO loading overlay intentionally sits above almost every UI.
    // Local recovery is an interactive gate, so hide the loading screen while the
    // player chooses. Otherwise ensureReady() waits forever behind an invisible dialog.
    window.ROWebLoadingScreen?.hide?.({ immediate:true });
    const overlay = ensureLocalRecoveryModal();
    const character = overlay.querySelector(".cloud-local-recovery-character");
    const status = overlay.querySelector(".cloud-local-recovery-status");
    const primary = overlay.querySelector(".cloud-local-recovery-primary");
    const secondary = overlay.querySelector(".cloud-local-recovery-secondary");
    const base = Math.max(1, Number(candidate?.player?.baseLevel || 1));
    const jobLevel = Math.max(1, Number(candidate?.player?.jobLevel || 1));
    const name = String(candidate?.player?.name || "冒險者");
    const job = String(candidate?.player?.job || "初學者");
    character.textContent = `${name}｜${job}｜Base ${base} / Job ${jobLevel}｜復原至 SLOT ${candidate.targetSlot}`;
    status.textContent = "";
    primary.disabled = false;
    secondary.disabled = false;
    overlay.hidden = false;
    return new Promise(resolve => {
      const finish = value => {
        overlay.hidden = true;
        primary.onclick = null;
        secondary.onclick = null;
        window.ROWebLoadingScreen?.show?.({ progress:11, label:"正在完成帳號驗證…" });
        resolve(value);
      };
      primary.onclick = () => { primary.disabled = true; secondary.disabled = true; status.textContent = "正在驗證並復原雲端角色…"; resolve({ action:"restore", overlay, status, primary, secondary, finish }); };
      secondary.onclick = () => finish({ action:"skip" });
    });
  }

  async function restoreLocalCharacterToCloud(candidate) {
    const { data, error } = await client.rpc("ro_restore_character_from_local", {
      p_account_id: currentAccount.account_id,
      p_character_id: candidate.characterId,
      p_slot_index: Number(candidate.targetSlot),
      p_save_data: candidate.envelope
    });
    if (error) throw error;
    if (!data || typeof data !== "object") throw new Error("RO_RESTORE_CHARACTER_EMPTY");
    return data;
  }

  async function recoverDeletedCloudCharactersIfNeeded() {
    const recoverable = await findRecoverableLocalCharacters(currentCharacters);
    if (!recoverable.length) return false;
    let restored = 0;
    for (const candidate of recoverable) {
      const choice = await promptLocalRecovery(candidate);
      if (!choice || choice.action !== "restore") continue;
      try {
        const row = await restoreLocalCharacterToCloud(candidate);
        choice.status.textContent = "復原成功，正在重新同步角色列表…";
        restored += 1;
        const existingIndex = currentCharacters.findIndex(item => String(item.character_id) === String(row.character_id));
        if (existingIndex >= 0) currentCharacters[existingIndex] = { ...currentCharacters[existingIndex], ...row };
        else currentCharacters.push(row);
        await new Promise(resolve => setTimeout(resolve, 350));
        choice.finish({ action:"restored", row });
      } catch (error) {
        console.error("本機角色復原至雲端失敗：", error);
        choice.status.textContent = `復原失敗：${friendlyError(error)}`;
        choice.primary.disabled = false;
        choice.secondary.disabled = false;
        choice.primary.textContent = "重新嘗試";
        await new Promise(resolve => {
          choice.primary.onclick = () => { choice.finish({ action:"retry-page" }); resolve(); };
          choice.secondary.onclick = () => { choice.finish({ action:"skip" }); resolve(); };
        });
        break;
      }
    }
    if (restored > 0) currentCharacters = await fetchCharacters(currentAccount.account_id);
    return restored > 0;
  }

  function buildCharacterInsertFromLocal(slot, rawEnvelope, targetSlot) {
    let envelope = null;
    try { envelope = typeof rawEnvelope === "string" ? JSON.parse(rawEnvelope) : rawEnvelope; } catch (_) {}
    const savedPlayer = envelope?.player && typeof envelope.player === "object"
      ? envelope.player
      : (envelope && typeof envelope === "object" && !Array.isArray(envelope) ? envelope : null);
    const summary = slot?.summary || slot?.seed || {};
    let normalizedEnvelope = envelope && typeof envelope === "object" ? envelope : {};
    if (savedPlayer && !normalizedEnvelope.player) {
      normalizedEnvelope = {
        schema:"ro_web_player_save_v2",
        formatVersion:2,
        saveVersion:Math.max(0, Number(slot?.revision || savedPlayer?.revision || 0)),
        savedAt:Number(savedPlayer?.updatedAt || slot?.updatedAt || Date.now()),
        reason:"local-cloud-migration",
        player:savedPlayer
      };
    }
    return {
      account_id: String(currentAccount.account_id),
      slot_index: Number(targetSlot) + 1,
      name: String(savedPlayer?.name || summary.name || "冒險者").trim().slice(0, 24) || "冒險者",
      job_id: Number.isFinite(Number(savedPlayer?.jobId)) ? Number(savedPlayer.jobId) : null,
      job_name: String(savedPlayer?.job || summary.jobName || "初學者").slice(0, 80),
      base_level: Math.max(1, Number(savedPlayer?.baseLevel || summary.baseLevel || 1)),
      job_level: Math.max(1, Number(savedPlayer?.jobLevel || summary.jobLevel || 1)),
      map_name: String(savedPlayer?.map || summary.map || "").slice(0, 120) || null,
      save_data: normalizedEnvelope
    };
  }

  function localRawForSlot(slot) {
    if (!slot?.characterId || !slots) return null;
    try {
      return localStorage.getItem(slots.getCharacterSaveKey(slot.characterId))
        || localStorage.getItem(slots.getCharacterBackupKey(slot.characterId));
    } catch (_) { return null; }
  }

  function firstFreeSlot(occupied, preferred, limit = 12) {
    if (!occupied.has(preferred) && preferred >= 0 && preferred < limit) return preferred;
    for (let index = 0; index < limit; index += 1) if (!occupied.has(index)) return index;
    return -1;
  }

  async function migrateLocalCharacters() {
    // V0.9.85G：只允許「尚未消耗」的真正舊本機備份進行遷移。
    // 同一份備份一旦曾成功遷移到任何 Player ID，就不可再複製到第二個帳號。
    const backup = slots?.getLocalMigrationCandidate?.({ includeCompleted:false });
    if (!backup?.account?.characters?.length || !currentAccount?.account_id) {
      pendingMigration = false;
      return { migrated:0, skipped:0, mapping:[] };
    }

    let cloudRows = await fetchCharacters(currentAccount.account_id);
    const occupied = new Set(cloudRows.map(row => Math.max(0, Number(row.slot_index || 1) - 1)));
    const mapping = [];
    let migrated = 0;
    let skipped = 0;

    for (const localSlot of [...backup.account.characters].sort((a,b) => Number(a.slotIndex) - Number(b.slotIndex))) {
      const preferred = Math.max(0, Number(localSlot.slotIndex || 0));
      const target = firstFreeSlot(occupied, preferred, Number(currentAccount.slot_limit || 12));
      if (target < 0) { skipped += 1; continue; }

      const raw = localRawForSlot(localSlot);
      const payload = buildCharacterInsertFromLocal(localSlot, raw, target);
      const { data, error } = await client
        .from("ro_characters")
        .insert(payload)
        .select("character_id,account_id,slot_index,name,job_id,job_name,base_level,job_level,map_name,save_data,revision,created_at,updated_at")
        .single();
      if (error) throw error;

      occupied.add(target);
      migrated += 1;
      mapping.push({
        oldCharacterId:String(localSlot.characterId),
        newCharacterId:String(data.character_id),
        oldSlot:Number(localSlot.slotIndex),
        newSlot:target
      });

      // 保留舊 key 不刪除；另複製到新的 UUID key，讓本機也立即有一份安全備份。
      if (raw) {
        try {
          localStorage.setItem(slots.getCharacterSaveKey(data.character_id), raw);
          const oldBackupRaw = localStorage.getItem(slots.getCharacterBackupKey(localSlot.characterId));
          if (oldBackupRaw) localStorage.setItem(slots.getCharacterBackupKey(data.character_id), oldBackupRaw);
        } catch (_) {}
      }
    }

    cloudRows = await fetchCharacters(currentAccount.account_id);
    currentCharacters = cloudRows;
    slots?.bindCloudAccount?.(currentAccount, cloudRows);
    slots?.markLocalMigrationComplete?.(currentAccount.account_id, mapping);
    pendingMigration = false;
    return { migrated, skipped, mapping };
  }

  function buildMigrationModal() {
    let overlay = document.getElementById("cloudMigrationOverlay");
    if (overlay) return overlay;
    overlay = document.createElement("section");
    overlay.id = "cloudMigrationOverlay";
    overlay.className = "cloud-migration-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="cloud-migration-dialog" role="dialog" aria-modal="true" aria-labelledby="cloudMigrationTitle">
        <div class="cloud-migration-emblem">✿</div>
        <h2 id="cloudMigrationTitle">偵測到本機角色資料</h2>
        <p id="cloudMigrationText"></p>
        <div id="cloudMigrationStatus" class="cloud-migration-status"></div>
        <div class="cloud-migration-actions">
          <button type="button" class="cloud-migration-primary">轉移至雲端</button>
          <button type="button" class="cloud-migration-secondary">稍後再說</button>
        </div>
        <small>轉移完成後，本機原始存檔仍會保留作為安全備份。</small>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  async function offerLocalMigration(force = false) {
    const backup = slots?.getLocalMigrationCandidate?.({ includeCompleted:false });
    const localCount = Number(backup?.account?.characters?.length || 0);
    if (!localCount || !currentAccount?.account_id) {
      pendingMigration = false;
      return false;
    }

    const targetAccountId = String(backup?.targetAccountId || "");
    const currentAccountId = String(currentAccount.account_id || "");
    // V2 備份在第一次綁定雲端時就鎖定目標 account_id。
    // 舊 V1 備份沒有 targetAccountId，來源/目標已無法安全判斷，因此禁止自動匯入；
    // 這正是舊版切換帳號時發生重複角色的來源。
    if (!force && (!targetAccountId || targetAccountId !== currentAccountId)) {
      pendingMigration = false;
      return false;
    }
    if (force && targetAccountId && targetAccountId !== currentAccountId) {
      pendingMigration = false;
      return false;
    }

    // 自動遷移只適用於「第一次啟用雲端，而且雲端還沒有任何角色」的情況。
    // 已有角色時再自動匯入，最容易造成同角色重複。手動匯入仍只允許尚未消耗的舊備份。
    if (!force && Array.isArray(currentCharacters) && currentCharacters.length > 0) {
      pendingMigration = false;
      return false;
    }

    pendingMigration = true;
    const overlay = buildMigrationModal();
    const text = overlay.querySelector("#cloudMigrationText");
    const status = overlay.querySelector("#cloudMigrationStatus");
    const primary = overlay.querySelector(".cloud-migration-primary");
    const secondary = overlay.querySelector(".cloud-migration-secondary");
    if (text) {
      text.textContent = `這台裝置找到 ${localCount} 個本機角色。要將角色與完整進度轉移到「${currentAccount.account_name}」(Player ID ${currentAccount.player_id}) 嗎？`;
    }
    if (status) { status.textContent = ""; status.className = "cloud-migration-status"; }

    overlay.hidden = false;
    document.body?.classList.add("cloud-migration-open");

    return new Promise(resolve => {
      const finish = value => {
        overlay.hidden = true;
        document.body?.classList.remove("cloud-migration-open");
        primary.onclick = null;
        secondary.onclick = null;
        slots?.renderCharacterSlots?.();
        resolve(value);
      };
      secondary.onclick = () => finish(false);
      primary.onclick = async () => {
        primary.disabled = true;
        secondary.disabled = true;
        if (status) {
          status.textContent = "正在轉移本機角色與存檔，請不要關閉頁面...";
          status.className = "cloud-migration-status show";
        }
        try {
          const result = await migrateLocalCharacters();
          if (status) {
            status.textContent = result.skipped
              ? `已轉移 ${result.migrated} 個角色；${result.skipped} 個角色因角色格已滿而未轉移。`
              : `已完成 ${result.migrated} 個角色的雲端轉移。`;
            status.className = "cloud-migration-status show ok";
          }
          window.setTimeout(() => finish(true), 750);
        } catch (error) {
          console.error("本機角色轉移失敗：", error);
          if (status) {
            status.textContent = `轉移失敗：${friendlyError(error)}\n本機原始資料未刪除，可以稍後重試。`;
            status.className = "cloud-migration-status show err";
          }
          primary.disabled = false;
          secondary.disabled = false;
        }
      };
    });
  }


  function cloudStorageLocalKey(accountId) {
    return `ro_web_account_storage_v2_${String(accountId || "")}`;
  }

  function parseStoredJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function storageHasContent(value) {
    return Boolean(value && typeof value === "object" && Array.isArray(value.items) && value.items.length);
  }

  async function writeSharedSave(nextSharedSave) {
    if (!currentAccount?.account_id) return false;
    const { data, error } = await client
      .from("ro_accounts")
      .update({ shared_save: nextSharedSave })
      .eq("account_id", currentAccount.account_id)
      .select("shared_save,updated_at")
      .single();
    if (error) throw error;
    currentAccount.shared_save = data?.shared_save && typeof data.shared_save === "object" ? data.shared_save : nextSharedSave;
    return true;
  }

  async function syncSharedStorageFromCloudOrLocal() {
    if (!currentAccount?.account_id) return false;
    const shared = currentAccount.shared_save && typeof currentAccount.shared_save === "object" ? clone(currentAccount.shared_save) : {};
    let storage = shared.account_storage && typeof shared.account_storage === "object" ? shared.account_storage : null;
    const accountKey = cloudStorageLocalKey(currentAccount.account_id);
    const cached = parseStoredJson(accountKey);
    const legacy = parseStoredJson("ro_web_account_storage_v1");
    const localMigration = slots?.getLocalMigrationCandidate?.();

    if (!storage) {
      if (cached && typeof cached === "object") {
        storage = cached;
      } else if (localMigration?.account?.characters?.length && legacy && typeof legacy === "object") {
        storage = legacy;
      } else {
        storage = { version:1, capacity:200, items:[], updatedAt:Date.now() };
      }
      shared.account_storage = storage;
      await writeSharedSave(shared);
    }

    try { localStorage.setItem(accountKey, JSON.stringify(storage)); } catch (_) {}
    if (typeof window.replaceAccountStorage === "function") {
      window.replaceAccountStorage(storage, { persist:true });
    }
    return true;
  }

  async function saveSharedStorage(storage) {
    if (!currentAccount?.account_id || !storage || typeof storage !== "object") return false;
    emitCloudStatus("syncing", { kind:"shared-storage" });
    try {
      const shared = currentAccount.shared_save && typeof currentAccount.shared_save === "object" ? clone(currentAccount.shared_save) : {};
      shared.account_storage = clone(storage);
      await writeSharedSave(shared);
      try { localStorage.setItem(cloudStorageLocalKey(currentAccount.account_id), JSON.stringify(storage)); } catch (_) {}
      emitCloudStatus("synced", { kind:"shared-storage" });
      return true;
    } catch (error) {
      emitCloudStatus("pending", { kind:"shared-storage", error });
      throw error;
    }
  }

  async function chooseAccount() {
    const accounts = await fetchAccounts();
    if (!accounts.length) {
      location.replace("cloud_account.html?mode=accounts&return=index.html");
      return null;
    }

    const wantedId = selectedAccountId();
    let chosen = accounts.find(row => String(row.account_id) === wantedId) || null;
    if (!chosen && accounts.length === 1) chosen = accounts[0];
    if (!chosen) {
      location.replace("cloud_account.html?mode=accounts&return=index.html");
      return null;
    }
    if (String(chosen.account_status || "active") !== "active") {
      throw new Error(chosen.account_status === "banned" ? "此遊戲帳號已停權。" : "此遊戲帳號目前暫停使用。");
    }
    rememberAccount(chosen);
    return chosen;
  }

  async function bindCurrentAccount() {
    currentAccount = await chooseAccount();
    if (!currentAccount) return false;
    currentCharacters = await fetchCharacters(currentAccount.account_id);
    // V0.9.85N：若玩家曾誤刪雲端角色，但原裝置仍握有具完整身份的高等本機備份，
    // 在覆寫本機角色清單之前先提供受控復原。新裝置／Lv1 暫存不會觸發此流程。
    await recoverDeletedCloudCharactersIfNeeded();
    slots?.bindCloudAccount?.(currentAccount, currentCharacters);
    window.ROWebSaveManager?.rebindActiveCharacter?.({ reason:"supabase-account-bound" });
    await syncSharedStorageFromCloudOrLocal();
    return true;
  }

  async function ensureReady() {
    const api = ensureClient();
    if (!api || !slots) {
      console.error("Cloud Runtime 初始化失敗。");
      return false;
    }
    try {
      emitCloudStatus("connecting");
      const session = await getSession();
      if (!session?.user?.id) {
        location.replace("cloud_account.html?return=index.html");
        return false;
      }
      const ok = await bindCurrentAccount();
      if (!ok) return false;
      await offerLocalMigration(false);
      emitCloudStatus("ready");
      return true;
    } catch (error) {
      emitCloudStatus("error", { error });
      console.error("雲端帳號初始化失敗：", error);
      const message = encodeURIComponent(friendlyError(error));
      location.replace(`cloud_account.html?error=${message}&return=index.html`);
      return false;
    }
  }

  async function refreshCloudAccount() {
    if (!currentAccount?.account_id) return false;
    currentCharacters = await fetchCharacters(currentAccount.account_id);
    slots?.bindCloudAccount?.(currentAccount, currentCharacters);
    window.ROWebSaveManager?.rebindActiveCharacter?.({ reason:"supabase-account-refresh" });
    return true;
  }

  async function createCharacter(input = {}) {
    if (!currentAccount?.account_id) throw new Error("尚未選擇遊戲帳號。");
    const slotIndex = Math.max(0, Math.floor(Number(input.slotIndex || 0)));
    const gender = String(input.gender || "male") === "female" ? "female" : "male";
    const name = String(input.name || "冒險者").trim();
    const { data, error } = await client
      .from("ro_characters")
      .insert({
        account_id: currentAccount.account_id,
        slot_index: slotIndex + 1,
        name,
        job_name: "初學者",
        base_level: 1,
        job_level: 1,
        map_name: "prontera",
        save_data: { seed:{ name, gender, createdAt:Number(input.createdAt || Date.now()) } }
      })
      .select("character_id,account_id,slot_index,name,job_id,job_name,base_level,job_level,map_name,save_data,revision,created_at,updated_at")
      .single();
    if (error) throw error;
    currentCharacters.push(data);
    return data;
  }

  async function deleteCharacter(context = {}) {
    if (!currentAccount?.account_id || !context.characterId) return false;
    const { error } = await client
      .from("ro_characters")
      .delete()
      .eq("account_id", currentAccount.account_id)
      .eq("character_id", String(context.characterId));
    if (error) throw error;
    currentCharacters = currentCharacters.filter(row => String(row.character_id) !== String(context.characterId));
    return true;
  }

  async function moveCharacterToSlot(characterId, targetSlotIndex) {
    const { data, error } = await client.rpc("ro_move_character_to_slot", {
      p_character_id: String(characterId),
      p_target_slot: Math.max(0, Math.floor(Number(targetSlotIndex))) + 1
    });
    if (error) throw error;
    return data;
  }

  async function loadCandidates(context = {}) {
    if (!currentAccount?.account_id || !context.characterId) return [];
    const { data, error } = await client
      .from("ro_characters")
      .select("save_data,revision,updated_at")
      .eq("account_id", currentAccount.account_id)
      .eq("character_id", String(context.characterId))
      .maybeSingle();
    if (error) throw error;
    if (!data || !hasMeaningfulSaveData(data.save_data)) return [];
    return [data.save_data];
  }

  async function saveEnvelope(envelope, context = {}) {
    if (!currentAccount?.account_id || !context.characterId) throw new Error("RO_ACCOUNT_NOT_FOUND");
    const characterId = String(context.characterId);
    const accountId = String(currentAccount.account_id);
    const contextAccountId = String(context.accountId || "");
    const envelopeAccountId = String(envelope?.accountId || envelope?.player?.accountId || "");
    const envelopeCharacterId = String(envelope?.characterId || envelope?.player?.characterId || "");
    if (contextAccountId && contextAccountId !== accountId) throw new Error("RO_CROSS_ACCOUNT_SAVE_BLOCKED");
    if (envelopeAccountId && envelopeAccountId !== accountId) throw new Error("RO_CROSS_ACCOUNT_SAVE_BLOCKED");
    if (envelopeCharacterId && envelopeCharacterId !== characterId) throw new Error("RO_CROSS_CHARACTER_SAVE_BLOCKED");
    if (!currentCharacters.some(row => String(row.character_id) === characterId && String(row.account_id) === accountId)) {
      throw new Error("RO_CHARACTER_NOT_IN_CURRENT_ACCOUNT");
    }
    const localVersion = envelopeVersion(envelope);
    emitCloudStatus("syncing", { saveVersion:localVersion });
    try {
      const { data:remoteRow, error:readError } = await client
        .from("ro_characters")
        .select("save_data,revision,updated_at")
        .eq("account_id", currentAccount.account_id)
        .eq("character_id", characterId)
        .maybeSingle();
      if (readError) throw readError;

      const remoteSave = remoteRow?.save_data;
      const remoteVersion = envelopeVersion(remoteSave);
      const remoteAt = envelopeSavedAt(remoteSave);
      const localAt = envelopeSavedAt(envelope);
      const remoteCheck = inspectEnvelope(remoteSave, accountId, characterId, { allowLegacyJsonbReorder:true });
      const localCheck = inspectEnvelope(envelope, accountId, characterId);
      const remoteClaimsNewer = remoteVersion > localVersion || (remoteVersion === localVersion && remoteAt > localAt + 1500);
      // V0.9.85M：舊版 Lv1 fallback 曾可能留下「版本號很新、內容卻是預設 Lv1」或 checksum/身份損壞的雲端資料。
      // 這種資料不能只因 saveVersion 較大就永久阻止原裝置的正確高等角色修復。
      const safeRepair = Boolean(localCheck.valid && localCheck.established && (
        !remoteCheck.valid || remoteCheck.defaultLike
      ));
      if (remoteClaimsNewer && !safeRepair) {
        throw new Error("RO_CLOUD_CONFLICT_NEWER_REMOTE");
      }
      if (remoteClaimsNewer && safeRepair) {
        console.warn("V0.9.85M：偵測到疑似舊版 Lv1/損壞雲端快照，允許目前已驗證高等角色修復雲端。", {
          characterId, localVersion, remoteVersion, remoteReason:remoteCheck.reason, remoteDefaultLike:remoteCheck.defaultLike
        });
        emitCloudStatus("repairing", { saveVersion:localVersion, characterId, reason:"repair-suspicious-remote" });
      }

      // V0.9.85L：ro_characters 不再由瀏覽器直接 UPDATE。
      // 透過 SECURITY DEFINER RPC 驗證 auth.uid() 確實擁有目前 account_id，
      // 並且 character_id 確實隸屬該帳號後才允許寫入。
      // 這樣跨瀏覽器／跨裝置首次同步本機正確進度時，不需要開放整張角色表的 UPDATE 權限。
      const { data, error } = await client.rpc("ro_save_character", {
        p_account_id: currentAccount.account_id,
        p_character_id: characterId,
        p_save_data: envelope
      });
      if (error) throw error;
      if (!data || typeof data !== "object") throw new Error("RO_CHARACTER_SAVE_RPC_EMPTY");
      const index = currentCharacters.findIndex(row => String(row.character_id) === characterId);
      if (index >= 0 && data) currentCharacters[index] = { ...currentCharacters[index], ...data };
      emitCloudStatus("synced", { saveVersion:localVersion, characterId });
      return true;
    } catch (error) {
      const status = /RO_CLOUD_CONFLICT/i.test(String(error?.message || error)) ? "conflict" : "pending";
      emitCloudStatus(status, { saveVersion:localVersion, characterId, error });
      throw error;
    }
  }

  async function verifyEnvelope(envelope, context = {}) {
    if (!currentAccount?.account_id || !context.characterId || !envelope) return false;
    try {
      const { data, error } = await client
        .from("ro_characters")
        .select("save_data")
        .eq("account_id", currentAccount.account_id)
        .eq("character_id", String(context.characterId))
        .maybeSingle();
      if (error) throw error;
      const remote = data?.save_data;
      const ok = Boolean(remote
        && envelopeVersion(remote) === envelopeVersion(envelope)
        && envelopeSavedAt(remote) === envelopeSavedAt(envelope)
        && String(remote.checksum || "") === String(envelope.checksum || ""));
      if (ok) emitCloudStatus("synced", { saveVersion:envelopeVersion(envelope), verified:true });
      return ok;
    } catch (error) {
      emitCloudStatus("pending", { saveVersion:envelopeVersion(envelope), error });
      return false;
    }
  }

  async function saveAccount() {
    // shared_save 將保留給共用倉庫 / 帳號設定；本階段不覆寫它。
    return true;
  }

  async function signOut() {
    forceCharacterSelectorNext();
    try { await client?.auth?.signOut(); } catch (_) {}
    try { localStorage.removeItem(SELECTED_ACCOUNT_KEY); } catch (_) {}
    try { sessionStorage.removeItem(SELECTED_ACCOUNT_KEY); } catch (_) {}
    location.replace("cloud_account.html");
  }

  function openAccountCenter() {
    forceCharacterSelectorNext();
    location.href = "cloud_account.html?mode=accounts&return=index.html";
  }

  const adapter = {
    provider:"supabase",
    loadCandidates,
    saveEnvelope,
    saveAccount,
    createCharacter,
    deleteCharacter,
    moveCharacterToSlot,
    verifyEnvelope
  };

  if (slots?.registerCloudAdapter) slots.registerCloudAdapter(adapter);

  window.ROWebCloudRuntime = Object.freeze({
    version:VERSION,
    ensureReady,
    refreshCloudAccount,
    getClient:() => ensureClient(),
    getSession:() => clone(currentSession),
    getAccount:() => clone(currentAccount),
    getCharacters:() => clone(currentCharacters),
    hasPendingLocalMigration:() => Boolean(pendingMigration),
    offerLocalMigration,
    migrateLocalCharacters,
    saveSharedStorage,
    openAccountCenter,
    signOut,
    friendlyError,
    validateReturnPath,
    forceCharacterSelectorNext,
    getSyncState:() => ({ ...cloudSyncState }),
    verifyEnvelope
  });
})();
