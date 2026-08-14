//=======================================
// RO_WEB V0.9.88B1 — 傭兵平滑移動／角色 Atlas 動畫 Runtime
// 只讀取同帳號其他角色的「戰鬥快照」；不讀背包、不寫回分身角色、不給傭兵任何獎勵。
//=======================================
(() => {
  const VERSION = "0.9.88B1";
  const MAX_MERCENARIES = 3;
  const RESPAWN_MS = 30_000;
  const FOLLOW_TICK_MS = 180;
  const COMBAT_TICK_MS = 250;
  const UI_TICK_MS = 500;
  const SNAPSHOT_SCHEMA = "ro_web_mercenary_snapshot_v1";
  const PARTY_SCHEMA = "ro_web_mercenary_party_v1";
  const FORMATION_OFFSETS = [
    { x: -66, y: 54 },
    { x:  66, y: 54 },
    { x:   0, y: 86 }
  ];
  const GUARD_SEARCH_RADIUS = 300;
  const MAX_CHASE_RADIUS = 450;
  const SUPPORT_COUNTER_RADIUS = 190;
  const HARD_LEASH_RADIUS = 650;
  const OWNER_JUMP_RESYNC_DISTANCE = 180;
  const RESYNC_DELAY_MS = 1000;
  const FOLLOW_STOP_DISTANCE = 10;

  const state = {
    initialized: false,
    members: [],
    manifest: null,
    lastCombatTickAt: 0,
    timers: { follow: null, combat: null, ui: null },
    defeatGuard: new WeakSet(),
    ownerTracker: { initialized:false, mapKey:"", x:0, y:0 },
    visualRaf: null,
    lastScaleSyncAt: 0
  };

  const clone = value => {
    try { return structuredClone(value); } catch (_) {}
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  };
  const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));

  function getAccountContext() {
    const cloudAccount = window.ROWebCloudRuntime?.getAccount?.() || {};
    const slotContext = window.CharacterSlotsRuntime?.getActiveContext?.() || {};
    return {
      accountId: String(cloudAccount.account_id || slotContext.accountId || ""),
      playerId: String(cloudAccount.player_id || ""),
      activeCharacterId: String(slotContext.characterId || window.player?.characterId || "")
    };
  }

  function partyStorageKey(accountId = getAccountContext().accountId) {
    return `ro_web_mercenary_party_v1_${String(accountId || "local")}`;
  }
  function snapshotStorageKey(accountId = getAccountContext().accountId) {
    return `ro_web_mercenary_snapshots_v1_${String(accountId || "local")}`;
  }

  function loadSnapshotCache() {
    try {
      const raw = localStorage.getItem(snapshotStorageKey());
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && parsed.schema === SNAPSHOT_SCHEMA && parsed.snapshots && typeof parsed.snapshots === "object"
        ? parsed.snapshots : {};
    } catch (_) { return {}; }
  }

  function saveSnapshotCache(cache) {
    try {
      localStorage.setItem(snapshotStorageKey(), JSON.stringify({
        schema: SNAPSHOT_SCHEMA,
        version: VERSION,
        updatedAt: Date.now(),
        snapshots: cache || {}
      }));
      return true;
    } catch (_) { return false; }
  }

  function normalizeMode(value) {
    return String(value || "").toLowerCase() === "support" ? "support" : "attack";
  }

  function inferDefaultMode(snapshot = {}) {
    const text = `${snapshot.jobKey || ""} ${snapshot.jobName || ""}`.toLowerCase();
    const supportHints = [
      "acolyte","priest","high_priest","arch_bishop","cardinal",
      "服事","祭司","神官","大主教","樞機主教"
    ];
    return supportHints.some(hint => text.includes(hint)) ? "support" : "attack";
  }

  function loadPartyState() {
    try {
      const raw = localStorage.getItem(partyStorageKey());
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || parsed.schema !== PARTY_SCHEMA || !Array.isArray(parsed.characterIds)) {
        return { characterIds:[], settings:{} };
      }
      const characterIds = parsed.characterIds.map(String).filter(Boolean).slice(0, MAX_MERCENARIES);
      const settings = parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {};
      return { characterIds, settings };
    } catch (_) { return { characterIds:[], settings:{} }; }
  }

  function loadPartySelection() { return loadPartyState().characterIds; }
  function loadPartySettings() { return loadPartyState().settings; }

  function savePartySelection(ids, settings = {}) {
    try {
      const characterIds = [...new Set((ids || []).map(String).filter(Boolean))].slice(0, MAX_MERCENARIES);
      const safeSettings = {};
      for (const id of characterIds) {
        const source = settings?.[id] || {};
        safeSettings[id] = {
          mode: normalizeMode(source.mode),
          counterAttack: source.counterAttack !== false
        };
      }
      localStorage.setItem(partyStorageKey(), JSON.stringify({
        schema: PARTY_SCHEMA,
        version: VERSION,
        updatedAt: Date.now(),
        characterIds,
        settings: safeSettings
      }));
      return true;
    } catch (_) { return false; }
  }

  function normalizeGender(value) {
    const raw = String(value || "").trim().toLowerCase();
    return ["female", "f", "女", "woman", "girl"].includes(raw) ? "female" : "male";
  }

  function extractSnapshotFromCloudRow(row) {
    if (!row || !row.character_id) return null;
    const envelope = row.save_data && typeof row.save_data === "object" ? row.save_data : null;
    const p = envelope?.player && typeof envelope.player === "object" ? envelope.player : null;
    if (!p) return null;

    const jobKey = String(p.jobKey || p.jobId || row.job_id || p.job || "novice").trim() || "novice";
    const jobName = String(p.job || p.jobName || row.job_name || jobKey || "未知職業");
    const maxHp = Math.max(1, Math.floor(n(p.maxHp ?? p.baseMaxHp, 100)));
    const maxSp = Math.max(0, Math.floor(n(p.maxSp ?? p.baseMaxSp, 30)));
    const stats = p.stats && typeof p.stats === "object" ? {
      str: Math.max(1, Math.floor(n(p.stats.str, 1))),
      agi: Math.max(1, Math.floor(n(p.stats.agi, 1))),
      vit: Math.max(1, Math.floor(n(p.stats.vit, 1))),
      int: Math.max(1, Math.floor(n(p.stats.int, 1))),
      dex: Math.max(1, Math.floor(n(p.stats.dex, 1))),
      luk: Math.max(1, Math.floor(n(p.stats.luk, 1)))
    } : { str:1, agi:1, vit:1, int:1, dex:1, luk:1 };

    return {
      schema: SNAPSHOT_SCHEMA,
      version: VERSION,
      capturedAt: Date.now(),
      revision: Math.max(0, Math.floor(n(row.revision ?? envelope.revision, 0))),
      characterId: String(row.character_id),
      slotIndex: Math.max(0, Math.floor(n(row.slot_index, 0))),
      name: String(p.name || row.name || `角色 ${row.slot_index || "?"}`),
      jobKey,
      jobName,
      gender: normalizeGender(p.gender || p.sex || p.bodyGender),
      baseLevel: Math.max(1, Math.floor(n(p.baseLevel ?? row.base_level, 1))),
      jobLevel: Math.max(1, Math.floor(n(p.jobLevel ?? row.job_level, 1))),
      stats,
      maxHp,
      maxSp,
      atk: Math.max(1, Math.floor(n(p.atk ?? p.baseAtk, 5))),
      matk: Math.max(0, Math.floor(n(p.matk, stats.int + stats.dex / 5))),
      def: Math.max(0, Math.floor(n(p.def ?? p.baseDef, 1))),
      mdef: Math.max(0, Math.floor(n(p.mdef, 0))),
      aspd: clamp(n(p.aspd, 160), 100, 193),
      weaponType: String(p.weaponType || p.weaponCategory || "fist"),
      learnedSkills: p.learnedSkills && typeof p.learnedSkills === "object" ? clone(p.learnedSkills) : {},
      // 只保留顯示／戰鬥所需摘要；刻意不帶 inventory / equipment instance / currency。
      appearanceGroup: String(p.appearanceGroup || ""),
      source: "cloud-memory"
    };
  }

  function getAvailableSnapshots() {
    const { activeCharacterId } = getAccountContext();
    const cache = loadSnapshotCache();
    const rows = window.ROWebCloudRuntime?.getCharacters?.() || [];
    for (const row of rows) {
      const snapshot = extractSnapshotFromCloudRow(row);
      if (snapshot?.characterId) cache[snapshot.characterId] = snapshot;
    }
    if (rows.length) saveSnapshotCache(cache);
    return Object.values(cache)
      .filter(item => item && String(item.characterId) && String(item.characterId) !== activeCharacterId)
      .sort((a,b) => n(a.slotIndex, 999) - n(b.slotIndex, 999));
  }

  function getManifest() {
    return state.manifest || window.RO_STUDIO_PLAYER_ATLAS?.manifest || null;
  }

  async function ensureManifest() {
    if (getManifest()?.characters) {
      state.manifest = getManifest();
      return state.manifest;
    }
    try {
      if (typeof window.loadJson === "function") {
        state.manifest = await window.loadJson("./data/character_atlas_manifest.json", null);
      } else {
        const response = await fetch("./data/character_atlas_manifest.json", { cache:"force-cache" });
        if (response.ok) state.manifest = await response.json();
      }
    } catch (_) {}
    return state.manifest;
  }

  function resolveIdleImage(snapshot) {
    const manifest = getManifest();
    const gender = normalizeGender(snapshot?.gender);
    let appearance = String(snapshot?.appearanceGroup || "").trim();
    if (!appearance && typeof window.getROStudioAppearanceGroup === "function") {
      try { appearance = String(window.getROStudioAppearanceGroup(snapshot?.jobKey || "novice") || ""); } catch (_) {}
    }
    if (!appearance) appearance = String(snapshot?.jobKey || "novice");
    const candidates = [
      `${appearance}_${gender}`,
      `${snapshot?.jobKey || "novice"}_${gender}`,
      `novice_${gender}`,
      manifest?.default_character || "novice_male"
    ];
    for (const key of candidates) {
      const entry = manifest?.characters?.[key];
      if (entry?.idle_image) return entry.idle_image;
    }
    return `assets/characters/novice/${gender}/idle.png`;
  }


  // ===== V0.9.88B1：傭兵共用角色 Atlas / 動畫 =====
  const MERC_ASSET_CACHE_LIMIT = 12;
  const MERC_ASSET_CACHE = new Map();
  const MERC_MOTION_MAP_CACHE = new Map();
  const MERC_FRAME_MS = { idle:220, walk:140, attack:90, hurt:120, dead:160, cast:95 };

  function resolveCharacterKey(snapshot) {
    const manifest = getManifest();
    const gender = normalizeGender(snapshot?.gender);
    let appearance = String(snapshot?.appearanceGroup || "").trim();
    if (!appearance && typeof window.getROStudioAppearanceGroup === "function") {
      try { appearance = String(window.getROStudioAppearanceGroup(snapshot?.jobKey || "novice") || ""); } catch (_) {}
    }
    if (!appearance) appearance = String(snapshot?.jobKey || "novice");
    const candidates = [
      `${appearance}_${gender}`,
      `${snapshot?.jobKey || "novice"}_${gender}`,
      `novice_${gender}`,
      manifest?.default_character || "novice_male"
    ];
    return candidates.find(key => manifest?.characters?.[key]) || "novice_male";
  }

  async function loadMercMotionMap(snapshot) {
    const manifest = getManifest();
    const characterKey = resolveCharacterKey(snapshot);
    const character = manifest?.characters?.[characterKey];
    const path = String(character?.motion_map || character?.motions_json || "").replace(/^\.\//, "");
    if (!path) return null;
    if (MERC_MOTION_MAP_CACHE.has(path)) return MERC_MOTION_MAP_CACHE.get(path);
    const promise = (async () => {
      try {
        if (typeof window.loadJson === "function") return await window.loadJson(`./${path}`, null);
        const response = await fetch(`./${path}`, { cache:"force-cache" });
        return response.ok ? await response.json() : null;
      } catch (_) { return null; }
    })();
    MERC_MOTION_MAP_CACHE.set(path,promise);
    return promise;
  }

  function resolveMercMotionPath(motionMap, snapshot, motionId) {
    const variants = motionMap?.variants || {};
    const variant = variants.on_foot || variants.default || Object.values(variants)[0] || null;
    if (!variant) return null;
    const motion = String(motionId || "idle").toLowerCase();
    if (motion === "attack") {
      const attack = variant.attack;
      if (typeof attack === "string") return attack;
      if (!attack || typeof attack !== "object") return null;
      const raw = String(snapshot?.weaponType || "fist").trim();
      const aliases = motionMap?.weaponAliases || {};
      const candidates = [raw, aliases[raw], raw.toLowerCase(), aliases[raw.toLowerCase()], "fist"]
        .filter(Boolean).map(String);
      for (const key of candidates) {
        if (attack[key]) return attack[key];
        const found = Object.keys(attack).find(k => String(k).toLowerCase() === key.toLowerCase());
        if (found && attack[found]) return attack[found];
      }
      return Object.values(attack).find(Boolean) || null;
    }
    if (motion === "hurt") return variant.hurt || variant.dead || variant.idle || null;
    if (motion === "dead") return variant.dead || variant.hurt || variant.idle || null;
    return variant[motion] || variant.idle || null;
  }

  function pruneMercAssetCache() {
    if (MERC_ASSET_CACHE.size <= MERC_ASSET_CACHE_LIMIT) return;
    const rows = [...MERC_ASSET_CACHE.entries()].sort((a,b)=>n(a[1]?.lastUsed,0)-n(b[1]?.lastUsed,0));
    while (MERC_ASSET_CACHE.size > MERC_ASSET_CACHE_LIMIT && rows.length) {
      const [key] = rows.shift();
      MERC_ASSET_CACHE.delete(key);
    }
  }

  async function loadMercAtlasAsset(jsonPath) {
    const path = String(jsonPath || "").replace(/^\.\//, "");
    if (!path) return null;
    const cached = MERC_ASSET_CACHE.get(path);
    if (cached) { cached.lastUsed = Date.now(); return cached.promise; }
    const entry = { lastUsed:Date.now(), promise:null };
    entry.promise = (async () => {
      try {
        let data = null;
        if (typeof window.loadJson === "function") data = await window.loadJson(`./${path}`, null);
        else {
          const response = await fetch(`./${path}`, { cache:"force-cache" });
          if (response.ok) data = await response.json();
        }
        if (!data?.image) return null;
        const base = path.split("/").slice(0,-1).join("/");
        const imagePath = `${base}/${data.image}`;
        const image = await new Promise((resolve,reject) => {
          const img = new Image();
          img.decoding = "async";
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`Mercenary atlas image failed: ${imagePath}`));
          img.src = `./${imagePath}`;
        });
        return { data, image, jsonPath:path, imagePath };
      } catch (error) {
        console.warn("Mercenary atlas load failed", path, error);
        return null;
      }
    })();
    MERC_ASSET_CACHE.set(path,entry);
    pruneMercAssetCache();
    return entry.promise;
  }

  async function ensureMercMotionAsset(member, motionId) {
    if (!member) return null;
    member.visual ||= { assets:{}, pending:{}, motion:"idle", frameIndex:0, frameAt:0, directionId:0, lastMotion:"" };
    const visual = member.visual;
    if (visual.assets[motionId]) return visual.assets[motionId];
    if (visual.pending[motionId]) return visual.pending[motionId];
    visual.pending[motionId] = (async () => {
      const motionMap = await loadMercMotionMap(member.snapshot);
      const path = resolveMercMotionPath(motionMap,member.snapshot,motionId);
      const loaded = path ? await loadMercAtlasAsset(path) : null;
      if (loaded) visual.assets[motionId] = loaded;
      delete visual.pending[motionId];
      return loaded;
    })();
    return visual.pending[motionId];
  }

  function syncMercenarySpriteSize(member) {
    const host = member?.dom;
    if (!host?.isConnected) return;
    const playerHost = document.getElementById("player-sprite");
    const playerCanvas = document.getElementById("playerAtlasCanvas");
    const rect = playerHost?.getBoundingClientRect?.();
    const width = Math.max(48, Math.round(rect?.width || playerHost?.offsetWidth || 220));
    const height = Math.max(64, Math.round(rect?.height || playerHost?.offsetHeight || 250));
    host.style.setProperty("width",`${width}px`,"important");
    host.style.setProperty("height",`${height}px`,"important");
    host.style.setProperty("--merc-player-width",`${width}px`);
    host.style.setProperty("--merc-player-height",`${height}px`);
    const canvas = host.querySelector(".mercenary-world-canvas");
    if (canvas) {
      const pixelW = Math.max(128, Number(playerCanvas?.width || 256));
      const pixelH = Math.max(128, Number(playerCanvas?.height || 256));
      if (canvas.width !== pixelW) canvas.width = pixelW;
      if (canvas.height !== pixelH) canvas.height = pixelH;
    }
  }

  function setMercenaryDirection(member, dx, dy) {
    if (!member || Math.hypot(n(dx,0),n(dy,0)) < 0.5) return;
    try {
      member.visual ||= {};
      member.visual.directionId = typeof window.vectorToRODirectionId === "function"
        ? window.vectorToRODirectionId(dx,dy)
        : 0;
    } catch (_) {}
  }

  function setMercenaryMotion(member, motionId, durationMs = 0) {
    if (!member) return;
    member.visual ||= { assets:{}, pending:{}, motion:"idle", frameIndex:0, frameAt:0, directionId:0, lastMotion:"" };
    const nextMotion = String(motionId || "idle");
    if (durationMs > 0) {
      member.visual.overrideMotion = nextMotion;
      member.visual.overrideUntil = performance.now() + durationMs;
    } else {
      if (member.visual.motion === nextMotion) return;
      member.visual.motion = nextMotion;
    }
    ensureMercMotionAsset(member,nextMotion);
  }

  function renderMercenaryAtlasFrame(member, timestamp) {
    const host = member?.dom;
    if (!host?.isConnected) return;
    const visual = member.visual ||= { assets:{}, pending:{}, motion:"idle", frameIndex:0, frameAt:0, directionId:0, lastMotion:"" };
    const nowPerf = Number(timestamp || performance.now());
    let motion = visual.motion || "idle";
    if (visual.overrideMotion && nowPerf < n(visual.overrideUntil,0)) motion = visual.overrideMotion;
    else if (visual.overrideMotion) { visual.overrideMotion = null; visual.overrideUntil = 0; }
    if (member.dead && Date.now() <= n(member.deathVisualUntil,0)) motion = "dead";
    if (member.dead && Date.now() > n(member.deathVisualUntil,0)) return;

    const loaded = visual.assets[motion];
    if (!loaded) {
      ensureMercMotionAsset(member,motion).then(() => { visual.frameIndex = 0; visual.frameAt = 0; });
      return;
    }
    const canvas = host.querySelector(".mercenary-world-canvas");
    const img = host.querySelector(".mercenary-world-image");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (visual.lastMotion !== motion) {
      visual.lastMotion = motion;
      visual.frameIndex = 0;
      visual.frameAt = nowPerf;
    }
    const frameMs = MERC_FRAME_MS[motion] || 120;
    if (!visual.frameAt) visual.frameAt = nowPerf;
    if (nowPerf - visual.frameAt >= frameMs) {
      const steps = Math.max(1,Math.floor((nowPerf-visual.frameAt)/frameMs));
      visual.frameIndex += steps;
      visual.frameAt += steps*frameMs;
    }
    try {
      const asset = loaded.data;
      const frame = typeof window.getROStudioPackedFrame === "function"
        ? window.getROStudioPackedFrame(asset,motion,visual.frameIndex,n(visual.directionId,0))
        : null;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.imageSmoothingEnabled = false;
      if (frame && typeof window.renderROStudioPackedFrame === "function") {
        window.renderROStudioPackedFrame(ctx,canvas,asset,loaded.image,frame);
        canvas.hidden = false;
        if (img) img.hidden = true;
      } else {
        const cellW = Math.max(1,n(asset?.cell?.width,256));
        const cellH = Math.max(1,n(asset?.cell?.height,256));
        ctx.drawImage(loaded.image,0,0,cellW,cellH,0,0,canvas.width,canvas.height);
        canvas.hidden = false;
        if (img) img.hidden = true;
      }
    } catch (_) {
      canvas.hidden = true;
      if (img) img.hidden = false;
    }
  }

  function releaseMemberVisual(member) {
    if (!member?.visual) return;
    member.visual.assets = {};
    member.visual.pending = {};
    member.visual.overrideMotion = null;
    member.visual.overrideUntil = 0;
  }

  function tickMercenaryVisuals(timestamp) {
    if (!state.initialized) { state.visualRaf = null; return; }
    const now = Date.now();
    if (!state.lastScaleSyncAt || now - state.lastScaleSyncAt > 900) {
      state.lastScaleSyncAt = now;
      state.members.forEach(syncMercenarySpriteSize);
    }
    for (const member of state.members) {
      if (member.dead && now > n(member.deathVisualUntil,0)) {
        clearWorldSprite(member);
        continue;
      }
      const movingRecently = now - n(member.lastMoveAt,0) < FOLLOW_TICK_MS + 90;
      if (!member.dead && !member.visual?.overrideMotion) setMercenaryMotion(member,movingRecently ? "walk" : "idle");
      renderMercenaryAtlasFrame(member,timestamp);
    }
    state.visualRaf = requestAnimationFrame(tickMercenaryVisuals);
  }

  function ensureVisualLoop() {
    if (state.visualRaf || typeof requestAnimationFrame !== "function") return;
    state.visualRaf = requestAnimationFrame(tickMercenaryVisuals);
  }

  function buildMember(snapshot, index, settings = {}) {
    const maxHp = Math.max(1, n(snapshot.maxHp, 100));
    const maxSp = Math.max(0, n(snapshot.maxSp, 30));
    return {
      type: "mercenary",
      id: `mercenary_${snapshot.characterId}`,
      characterId: String(snapshot.characterId),
      snapshot: clone(snapshot),
      name: String(snapshot.name || "傭兵"),
      jobKey: String(snapshot.jobKey || "novice"),
      jobName: String(snapshot.jobName || snapshot.jobKey || "未知職業"),
      baseLevel: Math.max(1, n(snapshot.baseLevel, 1)),
      maxHp,
      maxSp,
      hp: maxHp,
      sp: maxSp,
      atk: Math.max(1, n(snapshot.atk, 5)),
      matk: Math.max(0, n(snapshot.matk, 0)),
      def: Math.max(0, n(snapshot.def, 0)),
      mdef: Math.max(0, n(snapshot.mdef, 0)),
      aspd: clamp(n(snapshot.aspd, 160), 100, 193),
      position: { x:n(window.player?.position?.x, 0), y:n(window.player?.position?.y, 0) },
      formationIndex: index,
      mode: normalizeMode(settings.mode || inferDefaultMode(snapshot)),
      counterAttack: settings.counterAttack !== false,
      aiState: "FOLLOW",
      aiTarget: null,
      retaliationTarget: null,
      resyncUntil: 0,
      dead: false,
      deadUntil: 0,
      lastActionAt: 0,
      lastCombatAt: 0,
      lastRegenAt: Date.now(),
      lastMoveAt: 0,
      deathVisualUntil: 0,
      visual: { assets:{}, pending:{}, motion:"idle", frameIndex:0, frameAt:0, directionId:0, lastMotion:"", overrideMotion:null, overrideUntil:0 },
      dom: null
    };
  }

  function clearWorldSprite(member, options = {}) {
    try { member?.dom?.remove?.(); } catch (_) {}
    if (member) {
      member.dom = null;
      if (options.releaseAssets) releaseMemberVisual(member);
    }
  }

  function ensureWorldSprite(member) {
    if (!member || window.player?.currentCity) return null;
    if (member.dead && Date.now() > n(member.deathVisualUntil,0)) return null;
    if (member.dom?.isConnected) return member.dom;
    const field = document.getElementById("battle-field");
    if (!field) return null;
    const host = document.createElement("div");
    host.className = "mercenary-world-sprite";
    host.dataset.characterId = member.characterId;
    host.innerHTML = `
      <div class="mercenary-world-name">${esc(member.name)}</div>
      <img class="mercenary-world-image" src="${esc(resolveIdleImage(member.snapshot))}" alt="${esc(member.name)}">
      <canvas class="mercenary-world-canvas" aria-label="${esc(member.name)} animation" hidden></canvas>
      <div class="mercenary-world-hp"><span></span></div>`;
    field.appendChild(host);
    member.dom = host;
    syncMercenarySpriteSize(member);
    ensureMercMotionAsset(member,"idle");
    ensureMercMotionAsset(member,"walk");
    ensureVisualLoop();
    updateWorldSprite(member);
    return host;
  }

  function updateWorldSprite(member) {
    const host = member?.dom;
    if (!host?.isConnected) return;
    host.classList.toggle("is-dead", !!member.dead);
    host.dataset.aiState = String(member.aiState || "FOLLOW");
    host.dataset.mode = String(member.mode || "attack");
    const hpFill = host.querySelector(".mercenary-world-hp span");
    if (hpFill) hpFill.style.width = `${clamp(member.hp / Math.max(1, member.maxHp) * 100, 0, 100)}%`;
    if (!member.dead && !window.player?.currentCity && typeof window.placeSpriteByFootPosition === "function") {
      window.placeSpriteByFootPosition(host, member.position, "player");
    }
  }

  function removeAllWorldSprites(options = {}) {
    state.members.forEach(member => clearWorldSprite(member,options));
  }

  function getFormationTarget(member) {
    const origin = window.player?.position || { x:0, y:0 };
    const offset = FORMATION_OFFSETS[member?.formationIndex || 0] || FORMATION_OFFSETS[0];
    return { x:n(origin.x,0)+offset.x, y:n(origin.y,0)+offset.y };
  }

  function getOwnerPosition() {
    return { x:n(window.player?.position?.x,0), y:n(window.player?.position?.y,0) };
  }

  function getOwnerMapKey() {
    const city = String(window.player?.currentCity || "");
    const mapId = String(window.player?.map || (typeof currentMap !== "undefined" ? currentMap?.id : "") || "");
    return city ? `city:${city}` : `map:${mapId}`;
  }

  function distanceBetween(a, b) {
    return Math.hypot(n(a?.x,0)-n(b?.x,0), n(a?.y,0)-n(b?.y,0));
  }

  function isValidEnemy(target) {
    return !!target && n(target.currentHp ?? target.hp,0) > 0 && !target._deathHandled;
  }

  function distanceEnemyFromOwner(target) {
    return distanceBetween(target?.position || target, getOwnerPosition());
  }

  function clearMemberTarget(member) {
    if (!member) return;
    member.aiTarget = null;
    member.retaliationTarget = null;
  }

  function beginOwnerResync(reason = "teleport") {
    const now = Date.now();
    for (const member of state.members) {
      clearMemberTarget(member);
      member.aiState = "RESYNC";
      member.resyncUntil = now + RESYNC_DELAY_MS;
      clearWorldSprite(member);
    }
    return reason;
  }

  function notifyOwnerTeleported(reason = "teleport") {
    beginOwnerResync(reason);
    if (window.player?.position) {
      Object.assign(state.ownerTracker,{
        initialized:true,
        mapKey:getOwnerMapKey(),
        x:n(window.player.position.x,0),
        y:n(window.player.position.y,0)
      });
    }
    return true;
  }

  function detectOwnerDiscontinuity() {
    if (!window.player?.position) return false;
    const tracker = state.ownerTracker;
    const mapKey = getOwnerMapKey();
    const x = n(window.player.position.x,0), y = n(window.player.position.y,0);
    if (!tracker.initialized) {
      Object.assign(tracker,{ initialized:true, mapKey, x, y });
      return false;
    }
    const mapChanged = tracker.mapKey !== mapKey;
    const jumped = Math.hypot(x-tracker.x, y-tracker.y) > OWNER_JUMP_RESYNC_DISTANCE;
    Object.assign(tracker,{ mapKey, x, y });
    if (mapChanged || jumped) {
      beginOwnerResync(mapChanged ? "map_change" : "position_jump");
      return true;
    }
    return false;
  }

  function getEnemyCandidatesNearOwner(radius = GUARD_SEARCH_RADIUS) {
    const owner = window.player?.position;
    if (!owner || window.player?.currentCity) return [];
    let rows = [];
    try {
      if (typeof window.queryWorldMonsterEntitiesNear === "function") {
        rows = window.queryWorldMonsterEntitiesNear(owner, radius, { includeDead:false, activeOnly:true }) || [];
      } else if (typeof window.collectLiveCombatEnemies === "function") {
        rows = window.collectLiveCombatEnemies({ includeDead:false, activeOnly:true }) || [];
      }
    } catch (_) { rows = []; }
    return rows.filter(target => isValidEnemy(target) && distanceEnemyFromOwner(target) <= radius);
  }

  function getSharedTarget() {
    try {
      const target = typeof currentMonster !== "undefined" ? currentMonster : window.currentMonster;
      if (isValidEnemy(target) && distanceEnemyFromOwner(target) <= MAX_CHASE_RADIUS) return target;
    } catch (_) {}
    return null;
  }

  function getThreatTarget(radius = GUARD_SEARCH_RADIUS) {
    const rows = getEnemyCandidatesNearOwner(radius);
    return rows
      .filter(target => target.provoked || ["RUSH","CHASE","ANGRY","ATTACK"].includes(String(target.aiState || "").toUpperCase()))
      .sort((a,b) => distanceEnemyFromOwner(a)-distanceEnemyFromOwner(b))[0] || null;
  }

  function acquireMemberTarget(member) {
    if (!member || member.dead || member.resyncUntil > Date.now()) return null;
    const leash = member.mode === "support" ? SUPPORT_COUNTER_RADIUS : MAX_CHASE_RADIUS;
    if (isValidEnemy(member.retaliationTarget) && distanceEnemyFromOwner(member.retaliationTarget) <= leash) {
      member.aiTarget = member.retaliationTarget;
      return member.aiTarget;
    }
    if (isValidEnemy(member.aiTarget) && distanceEnemyFromOwner(member.aiTarget) <= leash) return member.aiTarget;
    clearMemberTarget(member);

    if (member.mode === "support") {
      if (!member.counterAttack) return null;
      member.aiTarget = getThreatTarget(SUPPORT_COUNTER_RADIUS);
      return member.aiTarget;
    }

    member.aiTarget = getSharedTarget() || getThreatTarget(GUARD_SEARCH_RADIUS);
    if (!member.aiTarget) {
      member.aiTarget = getEnemyCandidatesNearOwner(GUARD_SEARCH_RADIUS)
        .sort((a,b) => distanceEnemyFromOwner(a)-distanceEnemyFromOwner(b))[0] || null;
    }
    return member.aiTarget;
  }

  function getMemberAttackRange(member) {
    const job = `${member?.jobKey || ""} ${member?.jobName || ""}`.toLowerCase();
    const weapon = String(member?.snapshot?.weaponType || "").toLowerCase();
    if (/bow|gun|rifle|pistol|launcher|instrument|whip/.test(weapon) || /hunter|sniper|ranger|windhawk|gunslinger|rebel|night_watch|弓|獵人|遊俠|風鷹|槍手|叛亂|夜巡/.test(job)) return 190;
    if (/mage|wizard|sage|sorcerer|warlock|arch_mage|elemental_master|summoner|spirit_handler|法師|巫師|賢者|妖術|咒術|元素|召喚|靈導/.test(job)) return 170;
    return 52;
  }

  function moveMemberToward(member, target, stopDistance = FOLLOW_STOP_DISTANCE) {
    if (!member || !target) return 0;
    const dx = n(target.x,0)-n(member.position?.x,0);
    const dy = n(target.y,0)-n(member.position?.y,0);
    const distance = Math.hypot(dx,dy);
    if (!Number.isFinite(distance) || distance <= stopDistance) return distance;
    const dt = FOLLOW_TICK_MS / 1000;
    const playerSpeed = n(window.player?.position?.moveSpeed,115);
    const speed = Math.max(180, playerSpeed * 1.65);
    const step = Math.min(Math.max(0,distance-stopDistance), speed*dt);
    if (step <= 0) return distance;
    setMercenaryDirection(member,dx,dy);
    member.lastMoveAt = Date.now();
    const next = {
      x:n(member.position.x,0)+dx/Math.max(1,distance)*step,
      y:n(member.position.y,0)+dy/Math.max(1,distance)*step
    };
    try {
      if (typeof clampPositionToBounds === "function") {
        const safe = clampPositionToBounds(next,"player");
        member.position.x = n(safe.x,next.x); member.position.y = n(safe.y,next.y);
      } else { member.position.x=next.x; member.position.y=next.y; }
    } catch (_) { member.position.x=next.x; member.position.y=next.y; }
    return distance;
  }

  function updateFollow() {
    if (!window.player || !state.members.length) return;
    detectOwnerDiscontinuity();
    const now = Date.now();
    if (window.player.currentCity) {
      removeAllWorldSprites();
      return;
    }
    const owner = getOwnerPosition();
    for (const member of state.members) {
      if (member.dead) { clearWorldSprite(member); continue; }
      if (now < n(member.resyncUntil,0)) { clearWorldSprite(member); continue; }
      if (member.aiState === "RESYNC") {
        member.resyncUntil = 0;
        member.position = { ...getFormationTarget(member) };
        member.aiState = "FOLLOW";
        clearMemberTarget(member);
      }

      const ownerDistance = distanceBetween(member.position,owner);
      if (!Number.isFinite(ownerDistance) || ownerDistance > HARD_LEASH_RADIUS) {
        member.position = { ...getFormationTarget(member) };
        clearMemberTarget(member);
        member.aiState = "FOLLOW";
      }

      let target = isValidEnemy(member.aiTarget) ? member.aiTarget : null;
      const chaseRadius = member.mode === "support" ? SUPPORT_COUNTER_RADIUS : MAX_CHASE_RADIUS;
      if (target && distanceEnemyFromOwner(target) > chaseRadius) {
        clearMemberTarget(member); target = null;
      }

      if (target) {
        const attackRange = getMemberAttackRange(member);
        moveMemberToward(member,target.position || target,attackRange);
        member.aiState = member.mode === "support" ? "COUNTER" : "ENGAGE";
      } else {
        const formation = getFormationTarget(member);
        const distance = distanceBetween(member.position,formation);
        if (distance > FOLLOW_STOP_DISTANCE) {
          moveMemberToward(member,formation,FOLLOW_STOP_DISTANCE);
          member.aiState = "RETURN";
        } else member.aiState = member.mode === "support" ? "SUPPORT" : "FOLLOW";
      }
      ensureWorldSprite(member);
      updateWorldSprite(member);
    }
  }

  function getAttackInterval(member) {
    // 傭兵普通攻擊仍刻意限速；正式職業技能 AI 後續接管。
    return Math.round(clamp(1800 - (n(member.aspd,160)-150)*20, 700, 1800));
  }

  function resolveBasicAttackDamage(member, target) {
    const rolled = Math.max(1, Math.floor(member.atk * (0.90 + Math.random()*0.20)));
    try {
      if (window.RARenewalDamagePipeline?.finalModifiers) {
        return Math.max(1, Math.floor(window.RARenewalDamagePipeline.finalModifiers(rolled, target, {
          damageType:"physical", element:"Neutral", attackRangeType:getMemberAttackRange(member)>70?"long":"short", applyWeaponSize:false, applyDefense:true
        })));
      }
    } catch (_) {}
    return rolled;
  }

  function animateAttack(member, target = null) {
    const host = ensureWorldSprite(member);
    if (!host) return;
    if (target?.position) setMercenaryDirection(member,n(target.position.x,0)-n(member.position.x,0),n(target.position.y,0)-n(member.position.y,0));
    setMercenaryMotion(member,"attack",Math.min(650,Math.max(320,getAttackInterval(member)*0.55)));
  }

  function handleTargetDefeated(target) {
    if (!target || state.defeatGuard.has(target)) return;
    state.defeatGuard.add(target);
    for (const member of state.members) {
      if (member.aiTarget === target || member.retaliationTarget === target) clearMemberTarget(member);
    }
    setTimeout(() => {
      try {
        if (n(target.currentHp,0) <= 0 && typeof window.defeatMonster === "function") window.defeatMonster(target);
      } catch (_) {}
    }, 0);
  }

  function attackWithMember(member, target, now) {
    if (!member || member.dead || !isValidEnemy(target) || now < n(member.resyncUntil,0)) return false;
    const interval = getAttackInterval(member);
    if (now - n(member.lastActionAt,0) < interval) return false;
    const mx = n(member.position?.x,0), my = n(member.position?.y,0);
    const tx = n(target.position?.x,n(window.player?.position?.x,0));
    const ty = n(target.position?.y,n(window.player?.position?.y,0));
    const attackRange = getMemberAttackRange(member);
    if (Math.hypot(tx-mx,ty-my) > attackRange + 14) return false;
    if (distanceEnemyFromOwner(target) > (member.mode === "support" ? SUPPORT_COUNTER_RADIUS : MAX_CHASE_RADIUS)) return false;
    const damage = resolveBasicAttackDamage(member,target);
    target.currentHp = Math.max(0,n(target.currentHp,0)-damage);
    member.lastActionAt = now;
    member.lastCombatAt = now;
    animateAttack(member,target);
    try {
      if (typeof window.markWorldMonsterAttacked === "function" && target._worldTestEntity) window.markWorldMonsterAttacked(target,{ reason:"damage", propagateAssist:false });
      if (typeof window.playMonsterHitAnimation === "function") window.playMonsterHitAnimation(target);
      if (typeof window.showDamageNumber === "function") window.showDamageNumber(damage,{ source:"mercenary" });
      if (typeof window.updateMonsterUI === "function" && target === getSharedTarget()) window.updateMonsterUI();
    } catch (_) {}
    if (n(target.currentHp,0) <= 0) handleTargetDefeated(target);
    return true;
  }

  function reviveIfReady(member, now) {
    if (!member?.dead || now < n(member.deadUntil,0)) return false;
    member.dead = false;
    member.deadUntil = 0;
    member.deathVisualUntil = 0;
    member.hp = Math.max(1, Math.floor(member.maxHp * 0.50));
    member.sp = Math.floor(member.maxSp * 0.30);
    member.position = { ...getFormationTarget(member) };
    member.aiState = "FOLLOW";
    member.resyncUntil = 0;
    clearMemberTarget(member);
    ensureWorldSprite(member);
    if (typeof window.addBattleLog === "function") window.addBattleLog(`${member.name} 已重新加入隊伍。`, "mercenary");
    return true;
  }

  function applyPassiveRegen(member, now) {
    if (!member || member.dead) return;
    const elapsed = Math.max(0, Math.min(2, (now - n(member.lastRegenAt, now)) / 1000));
    member.lastRegenAt = now;
    if (!elapsed) return;
    // V0.9.88B：不區分戰鬥／脫戰，HP/SP 都以每秒 Max 1% 自然恢復。
    const hpRatePerSec = 0.01;
    const spRatePerSec = 0.01;
    if (member.hp < member.maxHp) member.hp = Math.min(member.maxHp, member.hp + member.maxHp * hpRatePerSec * elapsed);
    if (member.maxSp > 0 && member.sp < member.maxSp) member.sp = Math.min(member.maxSp, member.sp + member.maxSp * spRatePerSec * elapsed);
  }

  function runCombatTick() {
    const now = Date.now();
    for (const member of state.members) {
      reviveIfReady(member,now);
      applyPassiveRegen(member,now);
      if (member.dead || now < n(member.resyncUntil,0) || window.player?.currentCity) continue;
      const target = acquireMemberTarget(member);
      if (target) attackWithMember(member,target,now);
    }
  }

  function applyDamage(characterId, amount, options = {}) {
    const member = state.members.find(item => item.characterId === String(characterId));
    if (!member || member.dead) return { ok:false, reason:"NOT_ACTIVE" };
    const before = member.hp;
    member.hp = Math.max(0, member.hp - Math.max(0,n(amount,0)));
    member.lastCombatAt = Date.now();
    if (member.hp > 0) setMercenaryMotion(member,"hurt",360);
    if (options.attacker && member.counterAttack && isValidEnemy(options.attacker)) {
      member.retaliationTarget = options.attacker;
      member.aiTarget = options.attacker;
    }
    if (member.hp <= 0) {
      const now = Date.now();
      member.dead = true;
      member.deadUntil = now + RESPAWN_MS;
      member.deathVisualUntil = now + 1100;
      member.lastMoveAt = 0;
      clearMemberTarget(member);
      ensureWorldSprite(member);
      setMercenaryMotion(member,"dead",1100);
      if (!options.silent && typeof window.addBattleLog === "function") window.addBattleLog(`${member.name} 已倒下，30 秒後自動復歸。`, "mercenary");
    }
    renderPartyHud();
    return { ok:true, before, after:member.hp, dead:member.dead, deadUntil:member.deadUntil };
  }

  function heal(characterId, amount) {
    const member = state.members.find(item => item.characterId === String(characterId));
    if (!member || member.dead) return { ok:false, reason:member?.dead ? "DEAD" : "NOT_ACTIVE" };
    const before = member.hp;
    member.hp = Math.min(member.maxHp, member.hp + Math.max(0,n(amount,0)));
    renderPartyHud();
    return { ok:true, before, after:member.hp, healed:member.hp-before };
  }

  function spendSp(characterId, amount) {
    const member = state.members.find(item => item.characterId === String(characterId));
    const cost = Math.max(0,n(amount,0));
    if (!member || member.dead) return false;
    if (member.sp < cost) return false;
    member.sp -= cost;
    return true;
  }

  function resurrect(characterId, options = {}) {
    const member = state.members.find(item => item.characterId === String(characterId));
    if (!member || !member.dead) return false;
    member.dead = false;
    member.deadUntil = 0;
    member.deathVisualUntil = 0;
    member.hp = Math.max(1, Math.floor(member.maxHp * clamp(n(options.hpRate,0.30),0.01,1)));
    member.sp = Math.floor(member.maxSp * clamp(n(options.spRate,0.20),0,1));
    member.position = { ...getFormationTarget(member) };
    ensureWorldSprite(member);
    renderPartyHud();
    return true;
  }

  function getPartyMembers() {
    const owner = window.player ? [{
      type:"player",
      characterId:String(window.player.characterId || getAccountContext().activeCharacterId || "player"),
      name:String(window.player.name || "冒險者"),
      jobKey:String(window.player.jobKey || window.player.job || "novice"),
      jobName:String(window.player.job || window.player.jobKey || "初心者"),
      hp:n(window.player.hp,0), maxHp:Math.max(1,n(window.player.maxHp,1)),
      sp:n(window.player.sp,0), maxSp:Math.max(0,n(window.player.maxSp,0)),
      dead:n(window.player.hp,0)<=0,
      owner:true,
      ref:window.player
    }] : [];
    return owner.concat(state.members.map(member => ({ ...member, owner:false, ref:member })));
  }

  function renderPartyHud() {
    const host = document.getElementById("mercenary-party-hud");
    if (!host) return;
    host.hidden = state.members.length === 0;
    if (host.hidden) { host.innerHTML = ""; return; }
    const members = getPartyMembers();
    host.innerHTML = `<div class="mercenary-party-title">隊伍 <small>${members.length}/4</small></div>` + members.map(item => {
      const hpPct = clamp(n(item.hp,0)/Math.max(1,n(item.maxHp,1))*100,0,100);
      const spPct = n(item.maxSp,0)>0 ? clamp(n(item.sp,0)/n(item.maxSp,1)*100,0,100) : 0;
      let stateText = item.owner ? "主角色" : item.dead ? `復歸 ${Math.max(0,Math.ceil((n(item.deadUntil,0)-Date.now())/1000))}s` : `${item.mode === "support" ? "輔助" : "攻擊"}｜${item.aiState || "FOLLOW"}`;
      return `<div class="mercenary-party-member${item.dead ? " is-dead" : ""}">
        <div class="mercenary-party-name"><b>${esc(item.name)}</b><span>${esc(item.jobName)}</span><em>${stateText}</em></div>
        <div class="mercenary-party-bar hp"><span style="width:${hpPct}%"></span><small>${Math.floor(n(item.hp,0))}/${Math.floor(n(item.maxHp,0))}</small></div>
        <div class="mercenary-party-bar sp"><span style="width:${spPct}%"></span><small>${Math.floor(n(item.sp,0))}/${Math.floor(n(item.maxSp,0))}</small></div>
      </div>`;
    }).join("");
  }

  function renderPanel(message = "") {
    const panel = document.getElementById("mercenary-panel");
    if (!panel) return;
    const available = getAvailableSnapshots();
    const selected = state.members.length ? state.members.map(item=>item.characterId) : loadPartySelection();
    const savedSettings = loadPartySettings();
    const runtimeSettings = Object.fromEntries(state.members.map(item=>[item.characterId,{ mode:item.mode, counterAttack:item.counterAttack }]));
    const optionHtml = `<option value="">— 不使用 —</option>` + available.map(item =>
      `<option value="${esc(item.characterId)}">${esc(item.name)}｜${esc(item.jobName)}｜Base ${Math.floor(n(item.baseLevel,1))}</option>`
    ).join("");
    panel.innerHTML = `
      <div class="mercenary-intro">
        <b>分身傭兵 V1</b>
        <span>每名傭兵可獨立選「攻擊／輔助」。攻擊會在隊長附近主動找怪；輔助只守在隊長附近，勾選反擊時才處理威脅目標。</span>
      </div>
      <div class="mercenary-select-list">
        ${[0,1,2].map(index => `<div class="mercenary-slot-row" data-slot="${index}">
          <span>傭兵 ${index+1}</span>
          <select class="mercenary-character-select" id="mercenarySelect${index+1}">${optionHtml}</select>
          <select class="mercenary-mode-select" id="mercenaryMode${index+1}" aria-label="傭兵 ${index+1} 模式"><option value="attack">攻擊</option><option value="support">輔助</option></select>
          <label class="mercenary-counter-toggle"><input id="mercenaryCounter${index+1}" type="checkbox" checked>反擊</label>
        </div>`).join("")}
      </div>
      <div class="mercenary-actions">
        <button id="mercenaryApplyButton" type="button">套用隊伍</button>
        <button id="mercenaryDisbandButton" type="button">全部解散</button>
        <button id="mercenaryRefreshButton" type="button">重新整理角色</button>
      </div>
      <div class="mercenary-note">B1：傭兵使用玩家同尺寸 RO Atlas 動畫；移動以線性過渡平滑顯示。攻擊模式搜尋約 300px、最遠追擊約 450px；瞬移／跨圖後約 1 秒在隊長新位置重新出現。</div>
      <div id="mercenaryMessage" class="mercenary-message">${esc(message)}</div>`;

    [0,1,2].forEach(index => {
      const characterSelect = panel.querySelector(`#mercenarySelect${index+1}`);
      const modeSelect = panel.querySelector(`#mercenaryMode${index+1}`);
      const counter = panel.querySelector(`#mercenaryCounter${index+1}`);
      const id = selected[index] || "";
      if (characterSelect) characterSelect.value = id;
      const snapshot = available.find(item=>String(item.characterId)===String(id));
      const settings = runtimeSettings[id] || savedSettings[id] || { mode:inferDefaultMode(snapshot), counterAttack:true };
      if (modeSelect) modeSelect.value = normalizeMode(settings.mode || inferDefaultMode(snapshot));
      if (counter) counter.checked = settings.counterAttack !== false;
      characterSelect?.addEventListener("change", () => {
        const chosen = available.find(item=>String(item.characterId)===String(characterSelect.value));
        if (modeSelect && chosen) modeSelect.value = inferDefaultMode(chosen);
        if (counter) counter.checked = true;
      });
    });
    panel.querySelector("#mercenaryApplyButton")?.addEventListener("click", applyPanelSelection);
    panel.querySelector("#mercenaryDisbandButton")?.addEventListener("click", () => disbandAll({ persist:true, message:true }));
    panel.querySelector("#mercenaryRefreshButton")?.addEventListener("click", () => renderPanel("已重新讀取目前帳號角色快照。"));
  }

  function applyPanelSelection() {
    const rows = [1,2,3].map(index => ({
      id:String(document.getElementById(`mercenarySelect${index}`)?.value || ""),
      mode:normalizeMode(document.getElementById(`mercenaryMode${index}`)?.value || "attack"),
      counterAttack:document.getElementById(`mercenaryCounter${index}`)?.checked !== false
    })).filter(row=>row.id);
    const ids = rows.map(row=>row.id);
    if (new Set(ids).size !== ids.length) {
      renderPanel("同一個角色不能重複放入兩個傭兵欄位。");
      return false;
    }
    const available = new Map(getAvailableSnapshots().map(item => [String(item.characterId),item]));
    const snapshots = ids.map(id => available.get(id)).filter(Boolean);
    if (snapshots.length !== ids.length) {
      renderPanel("其中一個角色缺少可用的完整戰鬥快照，請先讓該角色成功雲端存檔後再試。" );
      return false;
    }
    const settings = Object.fromEntries(rows.map(row=>[row.id,{ mode:row.mode, counterAttack:row.counterAttack }]));
    setParty(snapshots,{ persist:true, settings });
    renderPanel(`已套用 ${snapshots.length} 名傭兵。`);
    return true;
  }

  function setParty(snapshots, options = {}) {
    removeAllWorldSprites({ releaseAssets:true });
    const settings = options.settings || loadPartySettings();
    state.members = (snapshots || []).slice(0,MAX_MERCENARIES).map((snapshot,index)=>buildMember(snapshot,index,settings?.[String(snapshot.characterId)] || {}));
    state.ownerTracker.initialized = false;
    const persistedSettings = Object.fromEntries(state.members.map(item=>[item.characterId,{ mode:item.mode, counterAttack:item.counterAttack }]));
    if (options.persist !== false) savePartySelection(state.members.map(item => item.characterId),persistedSettings);
    updateFollow();
    renderPartyHud();
    if (options.message !== false && typeof window.addBattleLog === "function" && state.members.length) {
      window.addBattleLog(`傭兵隊伍已建立：${state.members.map(item=>item.name).join("、")}。`, "mercenary");
    }
    return getPartyMembers();
  }

  function restoreSavedParty() {
    const saved = loadPartyState();
    const ids = saved.characterIds;
    if (!ids.length) { renderPartyHud(); return false; }
    const available = new Map(getAvailableSnapshots().map(item => [String(item.characterId), item]));
    const snapshots = ids.map(id => available.get(String(id))).filter(Boolean);
    if (!snapshots.length) return false;
    setParty(snapshots,{ persist:false, message:false, settings:saved.settings });
    return true;
  }

  function disbandAll(options = {}) {
    removeAllWorldSprites({ releaseAssets:true });
    state.members = [];
    if (options.persist !== false) savePartySelection([],{});
    renderPartyHud();
    if (options.message && typeof window.addBattleLog === "function") window.addBattleLog("傭兵隊伍已解散。", "mercenary");
    renderPanel(options.message ? "已解散全部傭兵。" : "");
    return true;
  }

  function installPartyHud() {
    if (document.getElementById("mercenary-party-hud")) return;
    const field = document.getElementById("battle-field");
    if (!field) return;
    const host = document.createElement("aside");
    host.id = "mercenary-party-hud";
    host.className = "mercenary-party-hud";
    host.hidden = true;
    field.appendChild(host);
  }

  async function init() {
    if (state.initialized) return true;
    state.initialized = true;
    installPartyHud();
    await ensureManifest();
    renderPanel();
    state.timers.follow = setInterval(updateFollow,FOLLOW_TICK_MS);
    state.timers.combat = setInterval(runCombatTick,COMBAT_TICK_MS);
    ensureVisualLoop();
    state.timers.ui = setInterval(() => {
      // V0.9.88B：只刷新隊伍 HUD，絕對不要在 500ms Tick 重建 <select>。
      // A 版在尚未套用任何傭兵時每 500ms renderPanel()，會把瀏覽器原生下拉選單直接銷毀，造成「一點就關閉」。
      renderPartyHud();
    },UI_TICK_MS);

    // 每次真正「打開」傭兵視窗時才刷新角色名單；視窗內互動期間不重建 DOM。
    document.querySelectorAll('.ui-toggle[data-target="mercenary-window"]').forEach(button => {
      if (button.dataset.mercenaryRefreshBound === "1") return;
      button.dataset.mercenaryRefreshBound = "1";
      button.addEventListener("click", () => {
        setTimeout(() => {
          const win = document.getElementById("mercenary-window");
          if (win && !win.classList.contains("hidden-window")) renderPanel();
        }, 0);
      });
    });

    // Cloud Runtime / Player 初始化較晚，延遲恢復上次選擇；若玩家已打開視窗操作，禁止重建選單。
    const refreshWhenNotInteracting = () => {
      const win = document.getElementById("mercenary-window");
      const panel = document.getElementById("mercenary-panel");
      const interacting = !!panel?.matches?.(":focus-within");
      if ((!win || win.classList.contains("hidden-window")) && !interacting) renderPanel();
    };
    setTimeout(() => { refreshWhenNotInteracting(); restoreSavedParty(); }, 1600);
    setTimeout(() => {
      if (!state.members.length && loadPartySelection().length) {
        refreshWhenNotInteracting();
        restoreSavedParty();
      }
    }, 4200);
    return true;
  }

  function destroy() {
    Object.values(state.timers).forEach(timer => { if (timer) clearInterval(timer); });
    state.timers = { follow:null, combat:null, ui:null };
    removeAllWorldSprites({ releaseAssets:true });
    state.members = [];
    if (state.visualRaf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(state.visualRaf);
    state.visualRaf = null;
    state.initialized = false;
  }

  window.ROWebMercenaryRuntime = Object.freeze({
    version: VERSION,
    maxMercenaries: MAX_MERCENARIES,
    respawnMs: RESPAWN_MS,
    init,
    destroy,
    refresh: renderPanel,
    getAvailableSnapshots: () => clone(getAvailableSnapshots()),
    getPartyMembers: () => clone(getPartyMembers().map(({ref,dom,aiTarget,retaliationTarget,...rest})=>rest)),
    getRuntimeMembers: () => state.members,
    setPartyByCharacterIds(ids = []) {
      const available = new Map(getAvailableSnapshots().map(item => [String(item.characterId),item]));
      const snapshots = [...new Set(ids.map(String).filter(Boolean))].slice(0,MAX_MERCENARIES).map(id=>available.get(id)).filter(Boolean);
      return setParty(snapshots,{persist:true,settings:loadPartySettings()});
    },
    setMemberMode(characterId, mode, counterAttack = null) {
      const member = state.members.find(item=>item.characterId===String(characterId));
      if (!member) return false;
      member.mode = normalizeMode(mode);
      if (counterAttack !== null) member.counterAttack = counterAttack !== false;
      clearMemberTarget(member);
      const settings = Object.fromEntries(state.members.map(item=>[item.characterId,{mode:item.mode,counterAttack:item.counterAttack}]));
      savePartySelection(state.members.map(item=>item.characterId),settings);
      renderPartyHud();
      return true;
    },
    notifyOwnerTeleported,
    notifyAttacked(characterId, attacker) {
      const member = state.members.find(item=>item.characterId===String(characterId));
      if (!member || member.dead || !member.counterAttack || !isValidEnemy(attacker)) return false;
      member.retaliationTarget = attacker; member.aiTarget = attacker; member.lastCombatAt = Date.now();
      return true;
    },
    disbandAll,
    applyDamage,
    heal,
    spendSp,
    resurrect,
    getAliveAllies() { return getPartyMembers().filter(item => !item.dead); },
    getDeadAllies() { return getPartyMembers().filter(item => item.dead); },
    getLowestHpAlly() {
      return getPartyMembers().filter(item=>!item.dead).sort((a,b)=>(a.hp/a.maxHp)-(b.hp/b.maxHp))[0] || null;
    }
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once:true });
  else init();
})();
