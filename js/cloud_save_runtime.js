// ============================================================
// 彼岸花仙境 / RO_WEB
// Supabase Cloud Save Runtime V0.9.84C
// - Auth Session -> RO Account -> 12 Character Slots
// - Local browser save migration -> ro_characters.save_data
// - Remote adapter for player.js durable save pipeline
// ============================================================
(function () {
  "use strict";

  const VERSION = "0.9.86O";
  const SUPABASE_URL = "https://ecbnsobcjxnrwqlefjci.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_LrQiZeOESpuGnt-hL6m0VQ_zXqn8ehS";
  const SELECTED_ACCOUNT_KEY = "roweb_cloud_selected_account_v1";
  const LOGIN_HINT_KEY = "roweb_cloud_login_aliases_v1";
  const LOCAL_CHARACTER_SAVE_PREFIX = "ro_web_character_save_v1_";
  const PRE_CLOUD_RESCUE_VAULT_KEY = "ro_web_precloud_rescue_vault_v1";

  const sdk = window.supabase;
  const slots = window.CharacterSlotsRuntime;
  let client = null;
  let currentSession = null;
  let currentAccount = null;
  let currentCharacters = [];
  let pendingMigration = false;
  let lastPreCloudSelectorSnapshot = null;
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
    if (/RO_LEGACY_RESTORE_CROSS_CLOUD_ACCOUNT_BLOCKED/i.test(raw)) return "這份備份屬於另一個雲端帳號，已禁止跨帳號復原。";
    if (/RO_LEGACY_RESTORE_FAILED|RO_LEGACY_RESTORE_EMPTY/i.test(raw)) return "舊版角色復原失敗，本機原始資料仍保留。";
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

  // ============================================================
  // V0.9.86L Pre-Cloud Selector Snapshot + Control-Key Trace
  // - Preserve the small character index BEFORE an empty Supabase list can replace it.
  // - Never copy full saves into the vault; it stores identity/slot/summary + save-key refs only.
  // - writer lease/session/persist keys are trace anchors only, never character candidates.
  // ============================================================
  function legacyControlStorageInfo(key = "") {
    const text = String(key || "");
    const escapedPrefix = LOCAL_CHARACTER_SAVE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`^${escapedPrefix}(.+?)_(writer_lease_v\\d+|persist_requested_v\\d+|session_id_v\\d+)$`, "i"));
    if (!match) return null;
    const characterId = String(match[1] || "").trim();
    return {
      characterId: characterId && characterId.toLowerCase() !== "pending" ? characterId : "",
      kind:String(match[2] || "control").toLowerCase()
    };
  }

  function looksLikeLegacyControlNoise(value = "") {
    return /(?:^|[_:\-/])(?:pending_)?(?:writer_lease|persist_requested|session_id)(?:_v\d+)?(?:$|[_:\-/])/i.test(String(value || ""));
  }

  function compactPreCloudCharacter(slot, index = 0) {
    if (!slot || typeof slot !== "object") return null;
    const summary = slot.summary && typeof slot.summary === "object"
      ? slot.summary
      : (slot.seed && typeof slot.seed === "object" ? slot.seed : {});
    const characterId = String(slot.characterId || slot.character_id || "").trim();
    if (!characterId || looksLikeLegacyControlNoise(characterId)) return null;
    const slotIndex = Math.max(0, Math.min(11, Number.isFinite(Number(slot.slotIndex)) ? Number(slot.slotIndex) : index));
    let hasMain = false;
    let hasBackup = false;
    try {
      hasMain = Boolean(localStorage.getItem(`${LOCAL_CHARACTER_SAVE_PREFIX}${characterId}`));
      hasBackup = Boolean(localStorage.getItem(`${LOCAL_CHARACTER_SAVE_PREFIX}${characterId}_minute_backup_v1`));
    } catch (_) {}
    return {
      characterId,
      slotIndex,
      initialized:slot.initialized !== false,
      revision:Math.max(0, Number(slot.revision || 0)),
      createdAt:Math.max(0, Number(slot.createdAt || 0)),
      updatedAt:Math.max(0, Number(slot.updatedAt || summary.updatedAt || 0)),
      summary:{
        name:String(summary.name || "").trim(),
        gender:String(summary.gender || "").trim(),
        jobKey:String(summary.jobKey || "").trim(),
        jobName:String(summary.jobName || summary.job || "").trim(),
        baseLevel:Math.max(0, Number(summary.baseLevel || 0)),
        jobLevel:Math.max(0, Number(summary.jobLevel || 0)),
        currentCity:String(summary.currentCity || "").trim(),
        map:String(summary.map || "").trim(),
        lastPlayedAt:Math.max(0, Number(summary.lastPlayedAt || 0)),
        updatedAt:Math.max(0, Number(summary.updatedAt || slot.updatedAt || 0))
      },
      saveRefs:{
        main:`${LOCAL_CHARACTER_SAVE_PREFIX}${characterId}`,
        backup:`${LOCAL_CHARACTER_SAVE_PREFIX}${characterId}_minute_backup_v1`,
        indexedPrimary:`character:${characterId}:primary`,
        indexedBackup:`character:${characterId}:backup`,
        hasMain,
        hasBackup
      }
    };
  }

  function readPreCloudRescueVault() {
    let value = readJson(PRE_CLOUD_RESCUE_VAULT_KEY, null);
    if (value) return value;
    try {
      value = JSON.parse(sessionStorage.getItem(PRE_CLOUD_RESCUE_VAULT_KEY) || "null");
    } catch (_) { value = null; }
    return value && typeof value === "object" ? value : null;
  }

  function writePreCloudRescueVault(value) {
    if (writeJson(PRE_CLOUD_RESCUE_VAULT_KEY, value)) return true;
    try { sessionStorage.setItem(PRE_CLOUD_RESCUE_VAULT_KEY, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  }

  function capturePreCloudSelectorSnapshot(targetAccount = null, reason = "before-cloud-fetch") {
    const sourceAccount = slots?.getAccount?.();
    const targetAccountId = String(targetAccount?.account_id || "");
    const sourceAccountId = String(sourceAccount?.accountId || "");
    // Same-browser account switching must never preserve another cloud account's selector
    // under the newly selected Player ID. Local acct_* data or the same cloud UUID is safe.
    if (sourceAccount?.cloud?.enabled === true && targetAccountId && sourceAccountId && sourceAccountId !== targetAccountId) return null;
    const sourceCharacters = Array.isArray(sourceAccount?.characters) ? sourceAccount.characters : [];
    const characters = sourceCharacters.map((slot,index) => compactPreCloudCharacter(slot,index)).filter(Boolean);
    if (!characters.length) return null;
    const snapshot = {
      schema:"ro_web_precloud_selector_snapshot_v1",
      version:1,
      capturedAt:Date.now(),
      reason:String(reason || "before-cloud-fetch"),
      targetAccountId,
      targetPlayerId:Number(targetAccount?.player_id || 0),
      targetAccountName:String(targetAccount?.account_name || ""),
      sourceAccountId,
      sourceCloudEnabled:sourceAccount?.cloud?.enabled === true,
      sourceCloudPlayerId:Number(sourceAccount?.cloud?.playerId || 0),
      characters
    };
    lastPreCloudSelectorSnapshot = snapshot;

    const current = readPreCloudRescueVault();
    const vault = current && typeof current === "object" ? current : {};
    const snapshots = Array.isArray(vault.snapshots) ? vault.snapshots.slice() : [];
    const fingerprint = `${snapshot.targetAccountId}|${snapshot.sourceAccountId}|${characters.map(row => `${row.slotIndex}:${row.characterId}`).join(",")}`;
    const next = snapshots.filter(row => String(row?.fingerprint || "") !== fingerprint);
    next.unshift({ ...snapshot, fingerprint });
    const payload = {
      schema:"ro_web_precloud_rescue_vault_v1",
      version:1,
      updatedAt:Date.now(),
      snapshots:next.slice(0, 10)
    };
    writePreCloudRescueVault(payload);
    return snapshot;
  }

  // V0.9.86K Legacy Browser Rescue + Shadow Trace
  // - Deep scan the current Origin before an empty cloud list replaces UI state.
  // - Never auto-attach identity-less / acct_* legacy saves to a Player ID.
  // - Candidates are shown for explicit confirmation, then restored through a
  //   server-side RPC that verifies the authenticated target account.
  // ============================================================
  function looksLikeLegacyPlayer(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (value.player && typeof value.player === "object") return false;
    const name = String(value.name || "").trim();
    const baseLevel = Number(value.baseLevel || 0);
    const jobLevel = Number(value.jobLevel || 0);
    const job = String(value.job || value.jobName || value.job_name || "").trim().toLowerCase();
    const hasProgress = baseLevel > 0 || jobLevel > 0;
    const hasPlayerShape = "job" in value || "jobKey" in value || "jobId" in value || "inventory" in value || "equipment" in value || "zeny" in value || "currentCity" in value || "currentMap" in value;
    if (name) return Boolean(hasProgress || hasPlayerShape);

    // V0.9.86N: very early RO_WEB saves could contain a fully progressed character
    // before the character-name field existed.  Do not require a name when the save
    // is structurally rich enough to distinguish it from summaries / writer leases.
    const completeness = legacyPlayerCompletenessScore(value);
    const novice = new Set(["", "初學者", "初心者", "novice"]);
    const established = baseLevel > 1 || jobLevel > 1 || !novice.has(job);
    return Boolean(established && hasPlayerShape && completeness >= 4);
  }

  function normalizeLegacyEnvelope(value, source = "legacy") {
    let raw = value;
    if (typeof raw === "string") {
      try { raw = JSON.parse(raw); } catch (_) { return null; }
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    if (raw.player && typeof raw.player === "object" && !Array.isArray(raw.player)) return clone(raw);
    if (!looksLikeLegacyPlayer(raw)) return null;
    return {
      schema:"ro_web_player_save_v2",
      formatVersion:2,
      saveVersion:Math.max(0, Number(raw.saveVersion || raw.revision || 0)),
      savedAt:Math.max(0, Number(raw.savedAt || raw.updatedAt || raw.lastPlayedAt || Date.now())),
      reason:`legacy-browser-rescue:${String(source || "legacy")}`,
      player:clone(raw)
    };
  }

  let lastLegacyShadowRecords = [];
  let lastLegacyIdTraceRecords = [];

  function collectLegacyAccountHints(value, hints, source = "profile", hintRows = []) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const accountValue = value?.account && typeof value.account === "object" ? value.account : value;
    const hintedAccountId = String(accountValue?.accountId || accountValue?.account_id || "").trim();
    const hintedCloudBound = accountValue?.cloud?.enabled === true || String(accountValue?.cloud?.provider || "").toLowerCase() === "supabase";
    if (hintedCloudBound && isUuidText(hintedAccountId) && hintedAccountId !== String(currentAccount?.account_id || "")) return;
    const characters = Array.isArray(accountValue?.characters) ? accountValue.characters : [];
    characters.forEach((row, index) => {
      if (!row || typeof row !== "object") return;
      const summary = row.summary && typeof row.summary === "object"
        ? row.summary
        : (row.seed && typeof row.seed === "object" ? row.seed : row);
      const id = String(row.characterId || row.character_id || summary?.characterId || summary?.character_id || "").trim();
      const rawSlot = row.slotIndex ?? row.slot_index ?? summary?.slotIndex ?? summary?.slot_index ?? index;
      const slotIndex = Math.max(0, Math.min(11, Number.isFinite(Number(rawSlot)) ? Number(rawSlot) : index));
      const hint = {
        characterId:id,
        slotIndex,
        name:String(summary?.name || row?.name || "").trim(),
        job:String(summary?.job || summary?.jobName || summary?.job_name || row?.job || "").trim(),
        baseLevel:Math.max(0, Number(summary?.baseLevel ?? summary?.base_level ?? row?.baseLevel ?? row?.base_level ?? 0)),
        jobLevel:Math.max(0, Number(summary?.jobLevel ?? summary?.job_level ?? row?.jobLevel ?? row?.job_level ?? 0)),
        savedAt:Math.max(0, Number(row?.updatedAt ?? row?.updated_at ?? summary?.updatedAt ?? summary?.updated_at ?? 0)),
        source:String(source || "profile")
      };
      if (id) hints.set(id, hint);
      if (id || hint.name || hint.baseLevel > 0 || hint.jobLevel > 0 || hint.job) hintRows.push(hint);
    });
  }

  function legacyShadowKey(row) {
    const id = String(row?.characterId || "").trim();
    if (id) return `id:${id}`;
    return `slot:${Number(row?.slotIndex || 0)}|${String(row?.name || "").trim().toLowerCase()}|${String(row?.job || "").trim().toLowerCase()}`;
  }

  function extractLegacyShadowRecord(value, source = "legacy", preferredSlot = null, hintedCharacterId = "") {
    if (looksLikeLegacyControlNoise(source) || looksLikeLegacyControlNoise(hintedCharacterId)) return null;
    let raw = value;
    if (typeof raw === "string") {
      try { raw = JSON.parse(raw); } catch (_) { return null; }
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const summary = raw.summary && typeof raw.summary === "object"
      ? raw.summary
      : (raw.seed && typeof raw.seed === "object" ? raw.seed : (raw.player && typeof raw.player === "object" ? raw.player : raw));
    const characterId = String(raw.characterId || raw.character_id || summary?.characterId || summary?.character_id || hintedCharacterId || "").trim();
    const name = String(summary?.name || raw?.name || "").trim();
    const job = String(summary?.job || summary?.jobName || summary?.job_name || raw?.job || "").trim();
    const baseLevel = Math.max(0, Number(summary?.baseLevel ?? summary?.base_level ?? raw?.baseLevel ?? raw?.base_level ?? 0));
    const jobLevel = Math.max(0, Number(summary?.jobLevel ?? summary?.job_level ?? raw?.jobLevel ?? raw?.job_level ?? 0));
    const slotIndex = legacyCandidateSlotHint(raw, preferredSlot ?? 0);
    if (looksLikeLegacyControlNoise(characterId)) return null;
    const hasIdentity = Boolean(characterId || name);
    const hasStructuredSummary = Boolean(raw.summary || raw.seed || raw.player);
    const hasCharacterShape = Boolean(characterId || job || baseLevel > 0 || jobLevel > 0 || hasStructuredSummary);
    if (!hasIdentity || !hasCharacterShape) return null;
    const playerForScore = raw.player && typeof raw.player === "object" ? raw.player : summary;
    return {
      characterId,
      slotIndex:Math.max(0, Math.min(11, Number(slotIndex ?? preferredSlot ?? 0))),
      name,
      job,
      baseLevel,
      jobLevel,
      savedAt:Math.max(0, Number(raw?.savedAt ?? raw?.updatedAt ?? raw?.updated_at ?? summary?.updatedAt ?? summary?.updated_at ?? 0)),
      completeness:legacyPlayerCompletenessScore(playerForScore),
      source:String(source || "legacy"),
      traceSources:[]
    };
  }

  function mergeLegacyShadow(map, record) {
    if (!record) return;
    const key = legacyShadowKey(record);
    const previous = map.get(key);
    if (!previous) { map.set(key, record); return; }
    const traces = new Set([...(previous.traceSources || []), ...(record.traceSources || []), previous.source, record.source].filter(Boolean));
    const prefer = (Number(record.completeness || 0) > Number(previous.completeness || 0))
      || (Number(record.savedAt || 0) > Number(previous.savedAt || 0));
    map.set(key, { ...(prefer ? previous : record), ...(prefer ? record : previous), traceSources:[...traces] });
  }

  function legacyIdentityKey(envelope, hintedCharacterId = "") {
    const player = envelope?.player || {};
    const explicitCharacterId = String(envelope?.characterId || player?.characterId || hintedCharacterId || "").trim();
    if (explicitCharacterId) return `id:${explicitCharacterId}`;
    const name = String(player?.name || "").trim().toLowerCase();
    const createdAt = Number(player?.createdAt || envelope?.createdAt || 0);
    const gender = String(player?.gender || "").toLowerCase();
    if (name) return `legacy:${name}|${createdAt || "na"}|${gender || "na"}`;
    const job = String(player?.job || player?.jobKey || "unknown").trim().toLowerCase();
    const baseLevel = Math.max(0, Number(player?.baseLevel || 0));
    const jobLevel = Math.max(0, Number(player?.jobLevel || 0));
    return `legacy-unnamed:${createdAt || "na"}|${job}|${baseLevel}|${jobLevel}|${hashPlayerStable(player)}`;
  }

  function compareLegacyCandidates(a, b) {
    const baseCompare = compareRecoveryEnvelope(a, b);
    if (baseCompare) return baseCompare;
    const aBase = Math.max(1, Number(a?.player?.baseLevel || 1));
    const bBase = Math.max(1, Number(b?.player?.baseLevel || 1));
    if (aBase !== bBase) return aBase - bBase;
    return Math.max(1, Number(a?.player?.jobLevel || 1)) - Math.max(1, Number(b?.player?.jobLevel || 1));
  }

  function collapseUnnamedLegacySnapshots(candidates = []) {
    // V0.9.86N: early pre-name-system characters can have many primary/backup/history
    // snapshots with different Character IDs. Showing every snapshot can crowd real named
    // characters out of the rescue list. For unnamed characters, one slot can represent
    // only one current character, so keep only the newest usable snapshot per SLOT.
    const named = [];
    const unnamedBySlot = new Map();
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      const name = String(candidate?.player?.name || '').trim();
      if (name) { named.push(candidate); continue; }
      const slot = Math.max(0, Math.min(11, Number(candidate?.preferredSlot || 0)));
      const key = `slot:${slot}`;
      const previous = unnamedBySlot.get(key);
      if (!previous) { unnamedBySlot.set(key, candidate); continue; }
      const currentSavedAt = Math.max(0, Number(candidate?.savedAt || 0));
      const previousSavedAt = Math.max(0, Number(previous?.savedAt || 0));
      if (currentSavedAt > previousSavedAt) { unnamedBySlot.set(key, candidate); continue; }
      if (currentSavedAt === previousSavedAt && compareLegacyCandidates(candidate, previous) > 0) {
        unnamedBySlot.set(key, candidate);
      }
    }
    return [...named, ...unnamedBySlot.values()];
  }

  function sourceAccountAllowedForLegacyRescue(envelope) {
    const player = envelope?.player || {};
    const sourceAccountId = String(envelope?.accountId || player?.accountId || "").trim();
    if (!sourceAccountId) return true;
    if (sourceAccountId === String(currentAccount?.account_id || "")) return true;
    // A different UUID is another cloud account: never offer it as a legacy candidate.
    if (isUuidText(sourceAccountId)) return false;
    // Old local accounts use acct_*; other non-UUID legacy identifiers are also allowed
    // only through the explicit confirmation dialog below.
    return true;
  }

  async function readIndexedDbRowsForLegacyRescue() {
    if (!window.indexedDB?.open) return [];
    const names = new Set(["ro_web_offline_save_v1"]);
    if (typeof indexedDB.databases === "function") {
      try {
        const databases = await indexedDB.databases();
        for (const info of Array.isArray(databases) ? databases : []) {
          const name = String(info?.name || "");
          if (name && /(ro[_-]?web|roweb|player|save|offline)/i.test(name)) names.add(name);
        }
      } catch (_) {}
    }

    const output = [];
    for (const dbName of names) {
      const rows = await new Promise(resolve => {
        let request;
        try { request = indexedDB.open(dbName); }
        catch (_) { resolve([]); return; }
        request.onerror = () => resolve([]);
        request.onblocked = () => resolve([]);
        request.onsuccess = async () => {
          const db = request.result;
          const storeNames = Array.from(db.objectStoreNames || []);
          if (!storeNames.length) { db.close(); resolve([]); return; }
          const collected = [];
          let pending = storeNames.length;
          const done = () => { pending -= 1; if (pending <= 0) { try { db.close(); } catch (_) {} resolve(collected); } };
          for (const storeName of storeNames) {
            let tx;
            try { tx = db.transaction(storeName, "readonly"); }
            catch (_) { done(); continue; }
            let getAll;
            try { getAll = tx.objectStore(storeName).getAll(); }
            catch (_) { done(); continue; }
            getAll.onsuccess = () => {
              const values = Array.isArray(getAll.result) ? getAll.result.slice(0, 500) : [];
              for (const row of values) collected.push({ dbName, storeName, row });
              done();
            };
            getAll.onerror = done;
            tx.onabort = done;
          }
        };
      });
      output.push(...rows);
    }
    return output;
  }

  function legacyPlayerCompletenessScore(player) {
    if (!player || typeof player !== "object" || Array.isArray(player)) return 0;
    let score = 0;
    if (Array.isArray(player.inventory) || (player.inventory && typeof player.inventory === "object")) score += 2;
    if (player.equipment && typeof player.equipment === "object") score += 2;
    if (player.stats && typeof player.stats === "object") score += 1;
    if (player.skills && typeof player.skills === "object") score += 1;
    if (player.quickSlots || player.quickbar || player.hotkeys) score += 1;
    if ("zeny" in player || "baseExp" in player || "jobExp" in player) score += 1;
    if (player.currentMap || player.currentCity || player.position) score += 1;
    return score;
  }

  function legacyCandidateSlotHint(value, fallback = null) {
    if (!value || typeof value !== "object") return fallback;
    const raw = value.slotIndex ?? value.slot_index ?? value.characterSlot ?? value.character_slot ?? value.slot ?? fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    // Old profiles sometimes stored SLOT as 1..12 while runtime uses 0..11.
    if (n >= 1 && n <= 12 && !("slotIndex" in value) && !("slot_index" in value)) return n - 1;
    return Math.max(0, Math.min(11, n));
  }

  function walkLegacyNestedValues(root, visitor, options = {}) {
    if (!root || typeof visitor !== "function") return;
    const maxDepth = Math.max(1, Number(options.maxDepth || 7));
    const maxNodes = Math.max(100, Number(options.maxNodes || 12000));
    const maxArray = Math.max(20, Number(options.maxArray || 400));
    const seen = new WeakSet();
    let nodes = 0;
    const walk = (value, path, depth, inheritedSlot = null) => {
      if (++nodes > maxNodes || depth > maxDepth || value == null) return;
      if (typeof value === "string") {
        const text = value.trim();
        if (text.length >= 2 && text.length <= 25_000_000 && (text[0] === "{" || text[0] === "[")) {
          try { walk(JSON.parse(text), `${path}:json`, depth + 1, inheritedSlot); } catch (_) {}
        }
        return;
      }
      if (typeof value !== "object") return;
      if (seen.has(value)) return;
      seen.add(value);
      const ownSlot = legacyCandidateSlotHint(value, inheritedSlot);
      try { visitor(value, path, ownSlot); } catch (_) {}
      if (Array.isArray(value)) {
        const limit = Math.min(value.length, maxArray);
        for (let i = 0; i < limit; i += 1) walk(value[i], `${path}[${i}]`, depth + 1, ownSlot);
        return;
      }
      const entries = Object.entries(value);
      for (const [key, child] of entries) {
        if (child == null) continue;
        if (/^(checksum|sprite|image|imageData|canvas|blob|binary|png|webp)$/i.test(String(key))) continue;
        walk(child, `${path}.${String(key)}`, depth + 1, ownSlot);
      }
    };
    walk(root, String(options.rootPath || "root"), 0, options.preferredSlot ?? null);
  }

  async function findLegacyBrowserCandidates(cloudRows = []) {
    lastLegacyShadowRecords = [];
    lastLegacyIdTraceRecords = [];
    if (!currentAccount?.account_id) return [];
    const remoteIds = new Set((Array.isArray(cloudRows) ? cloudRows : []).map(row => String(row?.character_id || "")));
    const remoteNames = new Set((Array.isArray(cloudRows) ? cloudRows : []).map(row => String(row?.name || row?.save_data?.player?.name || "").trim().toLowerCase()).filter(Boolean));
    const hints = new Map();
    const hintRows = [];
    const parsedLocal = [];
    const rawTraceSources = [];
    const shadowMap = new Map();
    const idTraceAnchors = new Map();

    const addIdTraceAnchor = (characterId, source, kind = "control", seenAt = 0) => {
      const id = String(characterId || "").trim();
      if (!id || looksLikeLegacyControlNoise(id) || id.toLowerCase() === "pending") return;
      const previous = idTraceAnchors.get(id) || { characterId:id, sources:new Set(), kinds:new Set(), seenAt:0 };
      if (source) previous.sources.add(String(source));
      if (kind) previous.kinds.add(String(kind));
      previous.seenAt = Math.max(Number(previous.seenAt || 0), Number(seenAt || 0));
      idTraceAnchors.set(id, previous);
    };

    if (lastPreCloudSelectorSnapshot?.characters?.length) {
      collectLegacyAccountHints({ characters:lastPreCloudSelectorSnapshot.characters }, hints, `precloud-memory:${lastPreCloudSelectorSnapshot.reason || "snapshot"}`, hintRows);
    }
    const preCloudVault = readPreCloudRescueVault();
    for (const snapshot of Array.isArray(preCloudVault?.snapshots) ? preCloudVault.snapshots : []) {
      const targetId = String(snapshot?.targetAccountId || "");
      const sourceId = String(snapshot?.sourceAccountId || "");
      if (targetId && targetId !== String(currentAccount?.account_id || "")) continue;
      if (snapshot?.sourceCloudEnabled === true && sourceId && targetId && sourceId !== targetId) continue;
      collectLegacyAccountHints({ characters:Array.isArray(snapshot?.characters) ? snapshot.characters : [] }, hints, `precloud-vault:${Number(snapshot?.capturedAt || 0) || "unknown"}`, hintRows);
    }

    const scanWebStorage = (storage, storageName) => {
      if (!storage) return;
      try {
        for (let index = 0; index < storage.length; index += 1) {
          const key = String(storage.key(index) || "");
          let text = "";
          try { text = storage.getItem(key) || ""; } catch (_) { continue; }
          if (!text || text.length > 25_000_000) continue;
          const traceSource = `${storageName}:${key}`;
          rawTraceSources.push({ source:traceSource, text });
          const control = legacyControlStorageInfo(key);
          if (control) {
            let seenAt = 0;
            try {
              const controlValue = JSON.parse(text);
              seenAt = Math.max(0, Number(controlValue?.heartbeatAt || controlValue?.startedAt || 0));
            } catch (_) {}
            addIdTraceAnchor(control.characterId, traceSource, control.kind, seenAt);
            // Control rows are not player/account data. Keep only the extracted Character ID
            // as a trace anchor so `_writer_lease_v2` can never become a fake SLOT candidate.
            continue;
          }
          let value = null;
          try { value = JSON.parse(text); } catch (_) { continue; }
          parsedLocal.push({ key, value, storageName, text });
          collectLegacyAccountHints(value, hints, traceSource, hintRows);
        }
      } catch (error) {
        console.warn(`V0.9.86L ${storageName} Legacy 掃描失敗：`, error);
      }
    };
    scanWebStorage(window.localStorage, "localStorage");
    scanWebStorage(window.sessionStorage, "sessionStorage");

    const best = new Map();
    const accept = (rawValue, source, hintedCharacterId = "", preferredSlot = null) => {
      const envelope = normalizeLegacyEnvelope(rawValue, source);
      if (!envelope || !sourceAccountAllowedForLegacyRescue(envelope)) return false;
      const check = inspectEnvelope(envelope, "", "", { allowLegacyJsonbReorder:true });
      if (!check.valid || !check.established || check.defaultLike) return false;
      const player = check.player || envelope.player;
      const name = String(player?.name || "").trim();
      const completeness = legacyPlayerCompletenessScore(player);
      const unnamedLegacy = !name;
      // V0.9.86N: allow a nameless pre-name-system character only when the save is
      // established AND structurally complete.  This keeps writer/session noise out.
      if (unnamedLegacy && completeness < 4) return false;
      if (name && remoteNames.has(name.toLowerCase())) return false;
      const explicitCharacterId = String(envelope?.characterId || player?.characterId || hintedCharacterId || "").trim();
      if (explicitCharacterId && remoteIds.has(explicitCharacterId)) return false;
      const hint = hints.get(explicitCharacterId) || null;
      const candidate = {
        key:legacyIdentityKey(envelope, hintedCharacterId),
        source:String(source || "legacy"),
        sourceAccountId:String(envelope?.accountId || player?.accountId || ""),
        sourceCharacterId:explicitCharacterId,
        envelope,
        player,
        version:check.version,
        savedAt:check.savedAt || Number(player?.updatedAt || player?.lastPlayedAt || 0),
        preferredSlot:Math.max(0, Math.min(11, Number(preferredSlot ?? hint?.slotIndex ?? envelope?.slotIndex ?? player?.slotIndex ?? 0))),
        completeness,
        unnamedLegacy
      };
      const previous = best.get(candidate.key);
      if (!previous || compareLegacyCandidates(candidate, previous) > 0) best.set(candidate.key, candidate);
      return true;
    };

    for (const { key, value, storageName = "localStorage" } of parsedLocal) {
      let hintedCharacterId = "";
      let preferredSlot = null;
      if (key.startsWith(LOCAL_CHARACTER_SAVE_PREFIX)) {
        hintedCharacterId = key.slice(LOCAL_CHARACTER_SAVE_PREFIX.length).replace(/_minute_backup_v1$/, "");
        if (looksLikeLegacyControlNoise(hintedCharacterId)) hintedCharacterId = "";
        if (hintedCharacterId) addIdTraceAnchor(hintedCharacterId, `${storageName}:${key}`, key.endsWith("_minute_backup_v1") ? "backup" : "main-save", 0);
        preferredSlot = hints.get(hintedCharacterId)?.slotIndex ?? null;
      }
      const rootSource = `${storageName}:${key}`;
      const rootShadow = extractLegacyShadowRecord(value, rootSource, preferredSlot, hintedCharacterId);
      if (rootShadow && rootShadow.completeness < 2) mergeLegacyShadow(shadowMap, rootShadow);
      accept(value, rootSource, hintedCharacterId, preferredSlot);
      if (value?.text) accept(value.text, `${rootSource}:text`, hintedCharacterId, preferredSlot);
      if (value?.save_data) accept(value.save_data, `${rootSource}:save_data`, hintedCharacterId, preferredSlot);
      if (value?.saveData) accept(value.saveData, `${rootSource}:saveData`, hintedCharacterId, preferredSlot);

      // V0.9.86L (carried from K): old account/profile formats often buried full player saves inside
      // arrays or migration/backup objects. Walk nested JSON, but only promote nested
      // raw-player objects when they look like a real full save (not a slot summary).
      walkLegacyNestedValues(value, (nested, path, nestedSlot) => {
        if (nested === value) return;
        const nestedSource = `${rootSource}${path.replace(/^root/, "")}`;
        const shadow = extractLegacyShadowRecord(nested, nestedSource, nestedSlot ?? preferredSlot, hintedCharacterId);
        if (shadow && shadow.completeness < 2) mergeLegacyShadow(shadowMap, shadow);
        if (nested?.player && typeof nested.player === "object") {
          accept(nested, nestedSource, hintedCharacterId, nestedSlot ?? preferredSlot);
          return;
        }
        if (looksLikeLegacyPlayer(nested) && legacyPlayerCompletenessScore(nested) >= 2) {
          accept(nested, nestedSource, hintedCharacterId, nestedSlot ?? preferredSlot);
        }
      }, { rootPath:"root", preferredSlot, maxDepth:8, maxNodes:16000, maxArray:600 });
    }

    const indexedRows = await readIndexedDbRowsForLegacyRescue();
    for (const item of indexedRows) {
      const row = item?.row;
      const rowId = String(row?.id || row?.key || "");
      const match = rowId.match(/^character:([^:]+):(primary|backup)$/i);
      const hintedCharacterId = String(match?.[1] || "");
      if (hintedCharacterId) addIdTraceAnchor(hintedCharacterId, `IndexedDB:${item.dbName}/${item.storeName}/${rowId}`, `indexed-${String(match?.[2] || "row").toLowerCase()}`, Number(row?.savedAt || 0));
      const preferredSlot = hints.get(hintedCharacterId)?.slotIndex ?? null;
      const source = `IndexedDB:${item.dbName}/${item.storeName}/${rowId || "row"}`;
      try { rawTraceSources.push({ source, text:typeof row === "string" ? row : JSON.stringify(row) }); } catch (_) {}
      const rootShadow = extractLegacyShadowRecord(row, source, preferredSlot, hintedCharacterId);
      if (rootShadow && rootShadow.completeness < 2) mergeLegacyShadow(shadowMap, rootShadow);
      if (typeof row === "string") accept(row, source, hintedCharacterId, preferredSlot);
      if (row?.text) accept(row.text, source, hintedCharacterId, preferredSlot);
      if (row?.value) accept(row.value, `${source}:value`, hintedCharacterId, preferredSlot);
      if (row?.data) accept(row.data, `${source}:data`, hintedCharacterId, preferredSlot);
      if (row?.save_data) accept(row.save_data, `${source}:save_data`, hintedCharacterId, preferredSlot);
      if (row?.saveData) accept(row.saveData, `${source}:saveData`, hintedCharacterId, preferredSlot);
      if (row?.player || looksLikeLegacyPlayer(row)) accept(row, source, hintedCharacterId, preferredSlot);
      walkLegacyNestedValues(row, (nested, path, nestedSlot) => {
        if (nested === row) return;
        const nestedSource = `${source}${path.replace(/^root/, "")}`;
        const shadow = extractLegacyShadowRecord(nested, nestedSource, nestedSlot ?? preferredSlot, hintedCharacterId);
        if (shadow && shadow.completeness < 2) mergeLegacyShadow(shadowMap, shadow);
        if (nested?.player && typeof nested.player === "object") {
          accept(nested, nestedSource, hintedCharacterId, nestedSlot ?? preferredSlot);
          return;
        }
        if (looksLikeLegacyPlayer(nested) && legacyPlayerCompletenessScore(nested) >= 2) {
          accept(nested, nestedSource, hintedCharacterId, nestedSlot ?? preferredSlot);
        }
      }, { rootPath:"root", preferredSlot, maxDepth:8, maxNodes:16000, maxArray:600 });
    }

    const fullCandidates = collapseUnnamedLegacySnapshots([...best.values()])
      .sort((a,b) => (Number(a.preferredSlot) - Number(b.preferredSlot)) || (Number(b.savedAt) - Number(a.savedAt)))
      .slice(0, 12);

    // V0.9.86L Shadow Trace: profile/slot summaries can survive even after their
    // full character save is no longer referenced. Keep those as read-only clues.
    for (const hint of hintRows) mergeLegacyShadow(shadowMap, { ...hint, completeness:0, traceSources:[hint.source] });
    const fullIds = new Set(fullCandidates.map(row => String(row.sourceCharacterId || row.envelope?.characterId || row.player?.characterId || "").trim()).filter(Boolean));
    const fullSlotNames = new Set(fullCandidates.map(row => `${Number(row.preferredSlot || 0)}|${String(row.player?.name || "").trim().toLowerCase()}`));
    const remoteSlotNames = new Set((Array.isArray(cloudRows) ? cloudRows : []).map(row => `${Math.max(0, Number(row?.slot_index || 1) - 1)}|${String(row?.name || row?.save_data?.player?.name || "").trim().toLowerCase()}`));

    const shadows = [];
    for (const record of shadowMap.values()) {
      const id = String(record.characterId || "").trim();
      const slotName = `${Number(record.slotIndex || 0)}|${String(record.name || "").trim().toLowerCase()}`;
      if ((id && (fullIds.has(id) || remoteIds.has(id))) || fullSlotNames.has(slotName) || remoteSlotNames.has(slotName)) continue;
      const needles = [];
      if (id) needles.push(id);
      if (record.name && String(record.name).trim().length >= 2) needles.push(String(record.name).trim());
      const traces = new Set([record.source, ...(record.traceSources || [])].filter(Boolean));
      for (const item of rawTraceSources) {
        const text = String(item?.text || "");
        if (!text) continue;
        if (needles.some(needle => text.includes(needle))) traces.add(String(item.source || ""));
        if (traces.size >= 8) break;
      }
      shadows.push({ ...record, traceSources:[...traces].filter(Boolean).slice(0, 8) });
    }
    lastLegacyShadowRecords = shadows
      .sort((a,b) => (Number(a.slotIndex) - Number(b.slotIndex)) || (Number(b.savedAt) - Number(a.savedAt)))
      .slice(0, 12);

    const shadowIds = new Set(lastLegacyShadowRecords.map(row => String(row?.characterId || "").trim()).filter(Boolean));
    const idTraces = [];
    for (const anchor of idTraceAnchors.values()) {
      const id = String(anchor.characterId || "").trim();
      if (!id || fullIds.has(id) || remoteIds.has(id) || shadowIds.has(id)) continue;
      const traces = new Set([...(anchor.sources || [])].filter(Boolean));
      for (const item of rawTraceSources) {
        const sourceText = String(item?.source || "");
        const text = String(item?.text || "");
        if (sourceText.includes(id) || text.includes(id)) traces.add(sourceText);
        if (traces.size >= 8) break;
      }
      idTraces.push({
        characterId:id,
        kinds:[...(anchor.kinds || [])].filter(Boolean),
        seenAt:Number(anchor.seenAt || 0),
        traceSources:[...traces].filter(Boolean).slice(0, 8)
      });
    }
    lastLegacyIdTraceRecords = idTraces
      .sort((a,b) => Number(b.seenAt || 0) - Number(a.seenAt || 0))
      .slice(0, 12);
    return fullCandidates;
  }

  function ensureLegacyRescueModal() {
    let overlay = document.getElementById("cloudLegacyRescueOverlay");
    if (overlay) return overlay;
    const style = document.createElement("style");
    style.textContent = `
      .cloud-legacy-rescue-overlay{position:fixed;inset:0;z-index:2147483150;display:grid;place-items:center;padding:16px;background:rgba(3,2,1,.82);backdrop-filter:blur(6px)}.cloud-legacy-rescue-overlay[hidden]{display:none!important}
      .cloud-legacy-rescue-dialog{width:min(760px,calc(100vw - 28px));max-height:min(720px,calc(100vh - 28px));overflow:auto;padding:24px;border:1px solid rgba(222,173,67,.82);border-radius:17px;background:linear-gradient(180deg,rgba(31,21,11,.985),rgba(12,8,5,.99));box-shadow:0 30px 100px #000e;color:#eadab7}
      .cloud-legacy-rescue-dialog h2{margin:0;color:#ffe49c;font-size:23px}.cloud-legacy-rescue-dialog>p{line-height:1.75;color:#d0bea0}.cloud-legacy-rescue-target{padding:10px 12px;border:1px solid rgba(212,164,60,.35);border-radius:9px;background:#0b0805;color:#ffe6a1;font-weight:900}
      .cloud-legacy-rescue-list{display:grid;gap:9px;margin:14px 0}.cloud-legacy-shadow-section{margin:16px 0 8px;padding:12px;border:1px dashed rgba(255,178,64,.55);border-radius:11px;background:rgba(61,28,5,.25)}.cloud-legacy-shadow-section h3{margin:0 0 8px;color:#ffc96b;font-size:16px}.cloud-legacy-shadow-note{margin:0 0 10px;color:#cdb690;line-height:1.55}.cloud-legacy-shadow-list{display:grid;gap:8px}.cloud-legacy-shadow-item{padding:10px 11px;border:1px solid rgba(255,164,55,.28);border-radius:9px;background:rgba(10,7,4,.55)}.cloud-legacy-shadow-item b{color:#ffd28a}.cloud-legacy-shadow-item small{display:block;margin-top:4px;color:#a99779;overflow-wrap:anywhere}.cloud-legacy-rescue-item{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start;padding:12px;border:1px solid rgba(177,131,46,.38);border-radius:10px;background:rgba(0,0,0,.25)}.cloud-legacy-rescue-item>input[type="checkbox"]{margin-top:5px;accent-color:#d8a638}.cloud-legacy-rescue-item b{color:#ffe3a0}.cloud-legacy-rescue-item small{display:block;margin-top:4px;color:#9f8e70;overflow-wrap:anywhere}.cloud-legacy-rescue-unnamed{margin-top:8px;padding:8px 9px;border:1px solid rgba(229,175,72,.34);border-radius:8px;background:rgba(91,55,8,.2);color:#f0d69a}.cloud-legacy-rescue-name-input{display:block;width:100%;box-sizing:border-box;margin-top:7px;padding:9px 10px;border:1px solid rgba(215,163,57,.55);border-radius:7px;background:#080603;color:#ffe9b0;outline:none}.cloud-legacy-rescue-name-input:focus{border-color:#f0bb49;box-shadow:0 0 0 2px rgba(240,187,73,.12)}.cloud-legacy-rescue-confirm{display:flex;gap:9px;align-items:flex-start;margin:12px 0;padding:11px;border:1px solid rgba(210,164,67,.28);border-radius:9px;background:#100b06}.cloud-legacy-rescue-confirm input{margin-top:4px;accent-color:#d8a638}
      .cloud-legacy-rescue-status{min-height:24px;white-space:pre-line;color:#d8c79f}.cloud-legacy-rescue-status.ok{color:#9ce4ad}.cloud-legacy-rescue-status.err{color:#ffb0a0}.cloud-legacy-rescue-actions{display:grid;grid-template-columns:1.2fr .8fr;gap:10px;margin-top:13px}.cloud-legacy-rescue-actions button{min-height:44px;border:1px solid #a97722;border-radius:8px;background:linear-gradient(#5b3d13,#2a1907);color:#ffe7a6;font-weight:900;cursor:pointer}.cloud-legacy-rescue-actions button:disabled{opacity:.45;cursor:default}@media(max-width:600px){.cloud-legacy-rescue-actions{grid-template-columns:1fr}.cloud-legacy-rescue-dialog{padding:18px}}`;
    document.head.appendChild(style);
    overlay = document.createElement("section");
    overlay.id = "cloudLegacyRescueOverlay";
    overlay.className = "cloud-legacy-rescue-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="cloud-legacy-rescue-dialog" role="dialog" aria-modal="true" aria-labelledby="cloudLegacyRescueTitle">
        <h2 id="cloudLegacyRescueTitle">發現舊版本機角色候選</h2>
        <p>雲端角色清單缺少這些角色，但目前瀏覽器仍找到有進度的舊存檔。這些資料不會自動綁定帳號，請確認角色確實屬於目前 Player ID 後再復原。</p>
        <div class="cloud-legacy-rescue-target"></div>
        <div class="cloud-legacy-rescue-list"></div>
        <section class="cloud-legacy-shadow-section" hidden>
          <h3>⚠ 不完整舊角色線索（僅追蹤，不會復原）</h3>
          <p class="cloud-legacy-shadow-note">這些資料像角色索引／摘要，但目前還沒找到足夠完整的 player save。請先保留畫面，後續可依 Character ID 與來源反向追查。</p>
          <div class="cloud-legacy-shadow-list"></div>
        </section>
        <label class="cloud-legacy-rescue-confirm"><input type="checkbox"><span></span></label>
        <div class="cloud-legacy-rescue-status"></div>
        <div class="cloud-legacy-rescue-actions"><button type="button" class="cloud-legacy-rescue-primary">確認復原所選角色</button><button type="button" class="cloud-legacy-rescue-secondary">稍後處理</button></div>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  async function mirrorRecoveredLegacySave(row) {
    if (!row?.character_id || !row?.save_data || !slots) return false;
    const text = JSON.stringify(row.save_data);
    try { localStorage.setItem(slots.getCharacterSaveKey(row.character_id), text); } catch (_) {}
    if (window.indexedDB?.open) {
      try {
        await new Promise(resolve => {
          const request = indexedDB.open("ro_web_offline_save_v1", 1);
          request.onerror = () => resolve(false);
          request.onsuccess = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains("player_saves")) { db.close(); resolve(false); return; }
            const tx = db.transaction("player_saves", "readwrite");
            tx.objectStore("player_saves").put({ id:`character:${row.character_id}:primary`, text, savedAt:Number(row.save_data?.savedAt || Date.now()), saveVersion:Number(row.save_data?.saveVersion || 0) });
            tx.oncomplete = () => { db.close(); resolve(true); };
            tx.onerror = () => { db.close(); resolve(false); };
            tx.onabort = () => { db.close(); resolve(false); };
          };
        });
      } catch (_) {}
    }
    return true;
  }

  async function restoreLegacyBrowserCandidate(candidate, targetSlotZero) {
    const { data, error } = await client.rpc("ro_restore_legacy_character_from_browser", {
      p_account_id:String(currentAccount.account_id),
      p_confirm_player_id:Number(currentAccount.player_id || 0),
      p_slot_index:Number(targetSlotZero) + 1,
      p_save_data:candidate.envelope
    });
    if (error) throw error;
    if (!data || typeof data !== "object") throw new Error("RO_LEGACY_RESTORE_EMPTY");
    await mirrorRecoveredLegacySave(data);
    return data;
  }

  async function offerLegacyBrowserRescueIfNeeded(options = {}) {
    if (!currentAccount?.account_id || options.cloudWasEmpty !== true) return false;
    const candidates = await findLegacyBrowserCandidates(currentCharacters);
    const shadows = Array.isArray(lastLegacyShadowRecords) ? lastLegacyShadowRecords : [];
    const idTraces = Array.isArray(lastLegacyIdTraceRecords) ? lastLegacyIdTraceRecords : [];
    if (!candidates.length && !shadows.length && !idTraces.length) return false;
    const occupied = new Set((currentCharacters || []).map(row => Math.max(0, Number(row?.slot_index || 1) - 1)));
    const freeCount = Math.max(0, Math.min(12, Number(currentAccount.slot_limit || 12)) - occupied.size);
    if (!freeCount) return false;

    window.ROWebLoadingScreen?.hide?.({ immediate:true });
    const overlay = ensureLegacyRescueModal();
    const target = overlay.querySelector(".cloud-legacy-rescue-target");
    const list = overlay.querySelector(".cloud-legacy-rescue-list");
    const shadowSection = overlay.querySelector(".cloud-legacy-shadow-section");
    const shadowList = overlay.querySelector(".cloud-legacy-shadow-list");
    const confirmLabel = overlay.querySelector(".cloud-legacy-rescue-confirm");
    const confirm = confirmLabel.querySelector("input");
    const confirmText = overlay.querySelector(".cloud-legacy-rescue-confirm span");
    const status = overlay.querySelector(".cloud-legacy-rescue-status");
    const primary = overlay.querySelector(".cloud-legacy-rescue-primary");
    const secondary = overlay.querySelector(".cloud-legacy-rescue-secondary");
    target.textContent = `復原目標：${currentAccount.account_name}｜Player ID ${currentAccount.player_id}｜雲端目前 ${currentCharacters.length} / ${currentAccount.slot_limit || 12}`;
    confirmText.textContent = `我確認勾選的角色確實屬於 Player ID ${currentAccount.player_id}，同意建立新的雲端角色 UUID。`;
    list.textContent = "";
    candidates.forEach((candidate, index) => {
      const label = document.createElement("label");
      label.className = "cloud-legacy-rescue-item";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = index < freeCount;
      input.dataset.index = String(index);
      const box = document.createElement("div");
      const base = Math.max(1, Number(candidate.player?.baseLevel || 1));
      const jobLevel = Math.max(1, Number(candidate.player?.jobLevel || 1));
      const rawName = String(candidate.player?.name || "").trim();
      const name = rawName || "【未命名角色】";
      const job = String(candidate.player?.job || "初學者");
      const saved = Number(candidate.savedAt || 0) ? new Date(Number(candidate.savedAt)).toLocaleString() : "時間未知";
      const title = document.createElement("b");
      const meta = document.createElement("small");
      const source = document.createElement("small");
      title.textContent = `${name}｜${job}｜Base ${base} / Job ${jobLevel}`;
      meta.textContent = `建議 SLOT ${Number(candidate.preferredSlot || 0) + 1}｜${saved}｜完整度 ${Number(candidate.completeness || 0)}`;
      source.textContent = String(candidate.source || "legacy");
      box.append(title, meta, source);
      if (!rawName) {
        const unnamedNote = document.createElement("div");
        unnamedNote.className = "cloud-legacy-rescue-unnamed";
        unnamedNote.textContent = "偵測到舊版未命名角色。復原前請先替這隻角色輸入名稱；原始瀏覽器存檔不會被刪除。";
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.maxLength = 12;
        nameInput.autocomplete = "off";
        nameInput.placeholder = "輸入角色名稱（最多 12 個字）";
        nameInput.className = "cloud-legacy-rescue-name-input";
        nameInput.dataset.rescueNameIndex = String(index);
        nameInput.addEventListener("click", event => event.stopPropagation());
        unnamedNote.appendChild(nameInput);
        box.appendChild(unnamedNote);
      }
      label.append(input, box);
      list.appendChild(label);
    });
    shadowList.textContent = "";
    shadowSection.hidden = !shadows.length;
    shadows.forEach(shadow => {
      const card = document.createElement("div");
      card.className = "cloud-legacy-shadow-item";
      const title = document.createElement("b");
      const identity = document.createElement("small");
      const trace = document.createElement("small");
      const name = String(shadow.name || "名稱未知");
      const job = String(shadow.job || "職業未知");
      const base = Number(shadow.baseLevel || 0);
      const jobLevel = Number(shadow.jobLevel || 0);
      title.textContent = `SLOT ${Number(shadow.slotIndex || 0) + 1}｜${name}｜${job}${base > 0 ? `｜Base ${base}${jobLevel > 0 ? ` / Job ${jobLevel}` : ""}` : ""}`;
      identity.textContent = `Character ID：${String(shadow.characterId || "未找到")}｜完整度 ${Number(shadow.completeness || 0)}（未達安全復原門檻）`;
      trace.textContent = `追蹤來源：${(shadow.traceSources || [shadow.source]).filter(Boolean).slice(0, 5).join(" ｜ ") || "未知"}`;
      card.append(title, identity, trace);
      shadowList.appendChild(card);
    });
    idTraces.forEach(traceRow => {
      const card = document.createElement("div");
      card.className = "cloud-legacy-shadow-item";
      const title = document.createElement("b");
      const identity = document.createElement("small");
      const trace = document.createElement("small");
      title.textContent = `角色 ID 殘留線索｜${String(traceRow.characterId || "未知")}`;
      const seen = Number(traceRow.seenAt || 0) ? new Date(Number(traceRow.seenAt)).toLocaleString() : "時間未知";
      identity.textContent = `僅從 writer lease / session / save key 取得 ID，不是角色存檔｜最後線索 ${seen}`;
      trace.textContent = `反查來源：${(traceRow.traceSources || []).filter(Boolean).slice(0, 5).join(" ｜ ") || "只有控制鍵"}`;
      card.append(title, identity, trace);
      shadowList.appendChild(card);
    });
    shadowSection.hidden = !(shadows.length || idTraces.length);
    confirmLabel.hidden = candidates.length === 0;
    confirm.checked = false;
    status.textContent = (shadows.length || idTraces.length)
      ? `找到 ${candidates.length} 個完整候選，另有 ${shadows.length} 個不完整角色摘要、${idTraces.length} 個角色 ID 殘留線索。控制鍵只用來追 ID，不會被當成角色復原。`
      : (candidates.length > freeCount ? `找到 ${candidates.length} 個候選，但目前只剩 ${freeCount} 個空角色格；請只勾選要復原的角色。` : `找到 ${candidates.length} 個有進度的舊版角色候選。`);
    status.className = "cloud-legacy-rescue-status";
    primary.disabled = true;
    primary.hidden = candidates.length === 0;
    secondary.disabled = false;
    confirm.onchange = () => { primary.disabled = !confirm.checked || candidates.length === 0; };
    overlay.hidden = false;
    const restoredKeys = new Set();

    return new Promise(resolve => {
      const finish = value => {
        overlay.hidden = true;
        confirm.onchange = null;
        primary.onclick = null;
        secondary.onclick = null;
        window.ROWebLoadingScreen?.show?.({ progress:13, label:"正在重新同步角色列表…" });
        resolve(value);
      };
      secondary.onclick = () => finish(false);
      primary.onclick = async () => {
        const selectedIndexes = Array.from(list.querySelectorAll('input[type="checkbox"]:checked')).map(input => Number(input.dataset.index)).filter(Number.isFinite);
        const selected = [];
        for (const index of selectedIndexes) {
          const candidate = candidates[index];
          if (!candidate || restoredKeys.has(candidate.key)) continue;
          const rawName = String(candidate.player?.name || "").trim();
          if (rawName) { selected.push(candidate); continue; }
          const nameInput = list.querySelector(`input[data-rescue-name-index="${index}"]`);
          const validation = slots?.validateCharacterName?.(nameInput?.value || "") || { ok:Boolean(String(nameInput?.value || "").trim()), value:String(nameInput?.value || "").trim(), error:"請輸入角色名稱。" };
          if (!validation.ok) {
            status.textContent = `未命名角色需要先取名：${validation.error || "請輸入角色名稱。"}`;
            status.className = "cloud-legacy-rescue-status err";
            try { nameInput?.focus?.(); } catch (_) {}
            return;
          }
          const prepared = { ...candidate, envelope:clone(candidate.envelope), player:clone(candidate.player), rescueName:String(validation.value || "").trim(), unnamedLegacy:true };
          prepared.player.name = prepared.rescueName;
          prepared.envelope.player = clone(prepared.player);
          selected.push(prepared);
        }
        if (!selected.length) { status.textContent = "請至少勾選一個要復原的角色。"; status.className = "cloud-legacy-rescue-status err"; return; }
        primary.disabled = true; secondary.disabled = true; confirm.disabled = true;
        let restored = 0;
        try {
          const liveRows = await fetchCharacters(currentAccount.account_id);
          const liveOccupied = new Set(liveRows.map(row => Math.max(0, Number(row.slot_index || 1) - 1)));
          for (const candidate of selected) {
            const targetSlot = firstFreeSlot(liveOccupied, Number(candidate.preferredSlot || 0), Number(currentAccount.slot_limit || 12));
            if (targetSlot < 0) break;
            status.textContent = `正在復原 ${candidate.player?.name || "角色"}… (${restored + 1}/${selected.length})`;
            const row = await restoreLegacyBrowserCandidate(candidate, targetSlot);
            liveOccupied.add(targetSlot);
            restoredKeys.add(candidate.key);
            restored += 1;
            currentCharacters.push(row);
          }
          currentCharacters = await fetchCharacters(currentAccount.account_id);
          status.textContent = `已成功復原 ${restored} 個角色，正在重新載入雲端角色列表。`;
          status.className = "cloud-legacy-rescue-status ok";
          await new Promise(r => setTimeout(r, 650));
          finish(restored > 0);
        } catch (error) {
          console.error("V0.9.86N Legacy 角色復原失敗：", error);
          status.textContent = `復原失敗：${friendlyError(error)}\n原始瀏覽器存檔沒有刪除，可以修正後再次嘗試。`;
          status.className = "cloud-legacy-rescue-status err";
          primary.disabled = false; secondary.disabled = false; confirm.disabled = false;
        }
      };
    });
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
    // V0.9.86L: freeze the selector's local character index BEFORE the first cloud fetch.
    // If Supabase returns 0 rows, this small snapshot preserves the fleeting SLOT/name/ID
    // clues that would otherwise disappear when bindCloudAccount() replaces the selector.
    capturePreCloudSelectorSnapshot(currentAccount, "before-first-cloud-fetch");
    currentCharacters = await fetchCharacters(currentAccount.account_id);
    const cloudWasEmptyAtEntry = currentCharacters.length === 0;
    // V0.9.85N：若玩家曾誤刪雲端角色，但原裝置仍握有具完整身份的高等本機備份，
    // 在覆寫本機角色清單之前先提供受控復原。新裝置／Lv1 暫存不會觸發此流程。
    await recoverDeletedCloudCharactersIfNeeded();
    // V0.9.86I: strict account-bound recovery runs first. If old acct_* / identity-less
    // saves still exist, deep-scan them BEFORE bindCloudAccount() can replace the local
    // selector profile with an empty cloud list. Nothing is auto-attached: the player
    // must explicitly confirm the current Player ID in the rescue dialog.
    await offerLegacyBrowserRescueIfNeeded({ cloudWasEmpty:cloudWasEmptyAtEntry });
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
