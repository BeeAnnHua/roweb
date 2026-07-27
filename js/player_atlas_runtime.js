//=======================================
// RO_WEB Packed Player Atlas Runtime V3.1
// 0.9.82EY：長讀條技能改為預備幀等待，結算時才播放最後攻擊／施法幀。
//=======================================

const RO_STUDIO_PLAYER_ATLAS = {
  manifestPath: "./data/character_atlas_manifest.json",
  manifest: null,
  characterKey: "novice_male",
  characterEntry: null,
  motionMap: null,
  variantKey: "on_foot",
  mountSignature: "",
  loadingCharacter: false,
  weaponType: "fist",
  resolvedWeaponKey: "fist",
  pendingWeaponType: null,
  weaponLoadSerial: 0,
  assets: {},
  images: {},
  ready: false,
  canvas: null,
  ctx: null,
  lastTime: 0,
  frameIndex: 0,
  frameTimer: 0,
  fpsMs: {
    idle: 220,
    walk: 140,
    attack: 90,
    hurt: 120,
    dead: 160,
    cast: 95
  },
  directionId: 0,
  overrideMotion: null,
  overrideUntil: 0,
  overrideHoldLast: false,
  overrideHoldSegmentLast: false,
  overrideLockUntil: 0,
  overrideFrameMs: 0,
  overrideFrameStart: 0,
  overrideFrameEnd: null,
  queuedMotion: null,
  lastAutoMotion: "idle"
};
window.RO_STUDIO_PLAYER_ATLAS = RO_STUDIO_PLAYER_ATLAS;

const RO_STUDIO_DIRECTION_NAMES = [
  "front", "front_left", "left", "back_left",
  "back", "back_right", "right", "front_right"
];

function normalizeROStudioGender(rawGender) {
  const raw = String(rawGender || "").trim().toLowerCase();
  if (["female", "f", "女", "woman", "girl"].includes(raw)) return "female";
  return "male";
}

function getROStudioCurrentJobKey() {
  return String(player?.jobKey || player?.job || "novice").trim() || "novice";
}

function getROStudioAppearanceGroup(jobKey = getROStudioCurrentJobKey()) {
  const key = String(jobKey || "novice").trim() || "novice";
  const jobData = typeof getJobData === "function"
    ? getJobData(key)
    : (typeof jobs === "object" ? jobs?.[key] : null);
  return String(jobData?.appearanceGroup || key || "novice").trim() || "novice";
}
window.getROStudioAppearanceGroup = getROStudioAppearanceGroup;

function getROStudioCurrentAppearanceGroup() {
  const group = getROStudioAppearanceGroup();
  if (player) player.appearanceGroup = group;
  return group;
}

function getROStudioCurrentGender() {
  return normalizeROStudioGender(player?.gender || player?.sex || player?.bodyGender || "male");
}

function buildROStudioCharacterKey(jobKey = getROStudioCurrentJobKey(), gender = getROStudioCurrentGender()) {
  return `${String(jobKey || "novice").trim()}_${normalizeROStudioGender(gender)}`;
}

function getROStudioFallbackManifest() {
  const build = gender => ({
    display_name: `初學者（${gender === "female" ? "女" : "男"}）`,
    job: "novice",
    asset_job: "novice",
    appearance_group: "novice",
    gender,
    base_path: `assets/characters/novice/${gender}`,
    idle_image: `assets/characters/novice/${gender}/idle.png`,
    motion_map: `assets/characters/novice/${gender}/motions.json`,
    motions_json: `assets/characters/novice/${gender}/motions.json`,
    has_mounted_variant: false,
    weapon_type_default: "fist"
  });
  return {
    schema: "ro_web_character_manifest",
    schema_version: "3.1",
    exporter: "RO_WEB 0.9.82EH fallback",
    default_job: "novice",
    default_gender: "male",
    default_character: "novice_male",
    asset_root: "assets/characters",
    characters: {
      novice_male: build("male"),
      novice_female: build("female")
    }
  };
}

async function initROStudioPlayerAtlasRuntime() {
  const state = RO_STUDIO_PLAYER_ATLAS;
  setupROStudioPlayerCanvas();

  try {
    state.manifest = await loadJson(state.manifestPath, getROStudioFallbackManifest());
    if (!state.manifest?.characters) throw new Error("character_atlas_manifest.json missing or invalid");

    const characterKey = resolveROStudioCharacterKey();
    const loaded = await setROStudioPlayerCharacter(characterKey, { initial: true, force: true });
    if (!loaded) throw new Error(`Initial character failed: ${characterKey}`);

    activateROStudioPlayerCanvas();
    state.ready = true;
    requestAnimationFrame(tickROStudioPlayerAtlasRuntime);
    console.log("RO_WEB Packed Player Atlas Runtime V3.1 ready", state);
    if (typeof addBattleLog === "function") {
      addBattleLog("人物動畫載入完成（六大家族＋初學者精簡部署版）。");
    }
  } catch (error) {
    console.warn("RO Studio Player Atlas Runtime init failed", error);
    restoreLegacyPlayerImage();
    if (typeof addBattleLog === "function") addBattleLog("人物動畫載入失敗，改用目前職業 idle 圖。");
  }
}

function resolveROStudioCharacterKey() {
  const state = RO_STUDIO_PLAYER_ATLAS;
  const gender = getROStudioCurrentGender();
  const currentJobKey = getROStudioCurrentJobKey();
  const desired = buildROStudioCharacterKey(getROStudioCurrentAppearanceGroup(), gender);
  if (state.manifest?.characters?.[desired]) return desired;

  // 吟遊詩人／舞孃系列目前各自只有一套官方性別動畫。角色切換性別時，
  // 只借用同階對應職業的外觀 Atlas，絕不改變玩家實際職業或技能資料。
  const currentJob = typeof getJobData === "function" ? getJobData(currentJobKey) : null;
  const counterpartKey = String(currentJob?.genderCounterpartJob || "").trim();
  if (counterpartKey) {
    const counterpartAppearance = getROStudioAppearanceGroup(counterpartKey);
    const counterpartAtlas = buildROStudioCharacterKey(counterpartAppearance, gender);
    if (state.manifest?.characters?.[counterpartAtlas]) return counterpartAtlas;
  }

  const sameGenderNovice = `novice_${gender}`;
  if (state.manifest?.characters?.[sameGenderNovice]) return sameGenderNovice;
  return state.manifest?.default_character || "novice_male";
}

function resolveROStudioWeaponTypeFromEquipment(fallback = "fist") {
  try {
    if (typeof normalizeWeaponTypeName === "function" && typeof getEquippedWeaponData === "function") {
      const weapon = getEquippedWeaponData();
      const mainType = normalizeWeaponTypeName(
        weapon?.weaponType || weapon?.dbSubType || weapon?.subCategory || weapon?.category,
        weapon
      ) || fallback || "fist";
      const offhand = player?.equipment?.shield && typeof getItemData === "function"
        ? getItemData(player.equipment.shield)
        : null;
      const offhandIsWeapon = typeof isWeaponEquipmentItem === "function"
        ? isWeaponEquipmentItem(offhand)
        : offhand?.slot === "weapon";

      if (offhandIsWeapon && typeof isAssassinOffhandJob === "function" && isAssassinOffhandJob()) {
        const offType = normalizeWeaponTypeName(
          offhand?.weaponType || offhand?.dbSubType || offhand?.subCategory || offhand?.category,
          offhand
        );
        if (mainType === "dagger" && offType === "dagger") return "dualDagger";
        if (mainType === "sword" && offType === "sword") return "dualSword";
        if (mainType === "sword" && offType === "dagger") return "swordDagger";
        if (mainType === "dagger" && offType === "sword") return "daggerSword";
      }
      return mainType || fallback || "fist";
    }
  } catch (error) {
    console.warn("resolveROStudioWeaponTypeFromEquipment failed", error);
  }
  return fallback || player?.weaponType || "fist";
}

function normalizeROStudioMotionMap(character, rawMap) {
  if (rawMap?.variants && typeof rawMap.variants === "object") return rawMap;

  // 舊 Manifest 相容：若仍提供固定 motions，就包成 on_foot variant。
  if (character?.motions) {
    return {
      schema: "ro_web_character_motion_map_legacy_bridge",
      schema_version: "3.1",
      job: character.job || character.asset_job || "novice",
      gender: character.gender || "male",
      idle_image: character.idle_image,
      variants: { on_foot: character.motions },
      weaponAliases: {},
      rules: {
        profileAndTownAlwaysOnFootIdle: true,
        fieldVariantByMountState: false,
        hurtSharesDeadAtlas: true,
        anchor: { x: 128, y: 140 }
      }
    };
  }
  return null;
}

async function loadROStudioCharacterMotionMap(character) {
  const path = character?.motion_map || character?.motions_json;
  const raw = path ? await loadJson("./" + String(path).replace(/^\.\//, ""), null) : null;
  return normalizeROStudioMotionMap(character, raw);
}

function getROStudioRequestedVariantKey(motionMap = RO_STUDIO_PLAYER_ATLAS.motionMap) {
  const variants = motionMap?.variants || {};
  const mounted = Boolean(player?.mountState?.mounted);
  if (mounted && variants.mounted) return "mounted";
  if (variants.on_foot) return "on_foot";
  if (variants.default) return "default";
  return Object.keys(variants)[0] || "on_foot";
}

function getROStudioMountSignature(motionMap = RO_STUDIO_PLAYER_ATLAS.motionMap) {
  const requestedVariant = getROStudioRequestedVariantKey(motionMap);
  const mounted = Boolean(player?.mountState?.mounted);
  const type = mounted ? String(player?.mountState?.type || player?.mountState?.assetKey || "mounted") : "none";
  return `${RO_STUDIO_PLAYER_ATLAS.characterKey}|${requestedVariant}|${mounted ? 1 : 0}|${type}`;
}

function getROStudioVariantMotions(motionMap = RO_STUDIO_PLAYER_ATLAS.motionMap, variantKey = null) {
  const key = variantKey || getROStudioRequestedVariantKey(motionMap);
  return motionMap?.variants?.[key] || motionMap?.variants?.on_foot || motionMap?.variants?.default || null;
}

function normalizeROStudioWeaponLookupKey(rawType) {
  return String(rawType || "fist").trim().replace(/[\s_-]+/g, "").toLowerCase();
}

function resolveROStudioAttackSelection(
  rawType,
  motionMap = RO_STUDIO_PLAYER_ATLAS.motionMap,
  variant = null,
  fallbackKey = null
) {
  const motionVariant = variant || getROStudioVariantMotions(motionMap);
  const attack = motionVariant?.attack || {};
  const aliases = motionMap?.weaponAliases || {};
  const raw = String(rawType || "fist").trim() || "fist";
  const compact = normalizeROStudioWeaponLookupKey(raw);
  const candidates = [];
  const push = value => {
    const key = String(value || "").trim();
    if (key && !candidates.includes(key)) candidates.push(key);
  };

  push(raw);
  push(aliases[raw]);
  for (const [aliasKey, target] of Object.entries(aliases)) {
    if (normalizeROStudioWeaponLookupKey(aliasKey) === compact) push(target);
  }

  const hardAliases = {
    onehandsword: "sword",
    twohandsword: "sword",
    "1hsword": "sword",
    "2hsword": "sword",
    sword: "sword",
    onehandspear: "spear",
    twohandspear: "spear",
    "1hspear": "spear",
    "2hspear": "spear",
    spear: "spear",
    onehandaxe: "axe",
    twohandaxe: "axe",
    "1haxe": "axe",
    "2haxe": "axe",
    axe: "axe",
    onehandstaff: "staff",
    twohandstaff: "staff",
    "1hstaff": "staff",
    "2hstaff": "staff",
    staff: "staff",
    mace: "mace",
    hammer: "mace",
    dagger: "dagger",
    bow: "bow",
    book: "book",
    katar: "katar",
    knuckle: "knuckle",
    instrument: "instrument",
    whip: "whip",
    dualsword: "dual_sword",
    dualdagger: "dual_dagger"
  };
  push(hardAliases[compact]);

  // 刺客混合雙持沒有專用素材：顯示優先雙短劍，再回退雙劍。
  if (["sworddagger", "daggersword"].includes(compact)) {
    push("dual_dagger");
    push("dual_sword");
    push("dagger");
    push("sword");
  }
  if (compact === "dualdagger") {
    push("dual_dagger");
    push("dagger");
  }
  if (compact === "dualsword") {
    push("dual_sword");
    push("sword");
  }

  push(fallbackKey);
  push("fist");
  Object.keys(attack).forEach(push);

  for (const key of candidates) {
    if (attack[key]) return { requested: raw, key, path: attack[key] };
  }
  return { requested: raw, key: null, path: null };
}

async function loadROStudioAtlasImage(path) {
  return new Promise((resolve, reject) => {
    const image = document.createElement("img");
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Atlas image load failed: ${path}`));
    image.src = path;
  });
}

async function loadROStudioAtlasAsset(jsonPath) {
  if (!jsonPath) return null;
  const data = await loadJson("./" + String(jsonPath).replace(/^\.\//, ""), null);
  if (!data) throw new Error(`Atlas JSON load failed: ${jsonPath}`);

  const basePath = String(jsonPath).split("/").slice(0, -1).join("/");
  const imagePath = `${basePath}/${data.image}`;
  const image = await loadROStudioAtlasImage(imagePath);
  return { data, image, jsonPath, imagePath };
}

async function loadROStudioAtlasMotion(motionId, jsonPath, targetAssets = null, targetImages = null) {
  if (!jsonPath) return null;
  const loaded = await loadROStudioAtlasAsset(jsonPath);
  const assets = targetAssets || RO_STUDIO_PLAYER_ATLAS.assets;
  const images = targetImages || RO_STUDIO_PLAYER_ATLAS.images;
  assets[motionId] = loaded.data;
  images[motionId] = loaded.image;
  return loaded;
}

async function loadROStudioCharacterAssets(characterKey) {
  const state = RO_STUDIO_PLAYER_ATLAS;
  // 角色／坐騎變體切換時，舊武器圖片載入完成後不得回頭覆蓋新角色。
  state.weaponLoadSerial = Number(state.weaponLoadSerial || 0) + 1;
  state.pendingWeaponType = null;
  const character = state.manifest?.characters?.[characterKey]
    || getROStudioFallbackManifest().characters?.novice_male;
  if (!character) throw new Error(`Character atlas not found: ${characterKey}`);

  const motionMap = await loadROStudioCharacterMotionMap(character);
  if (!motionMap) throw new Error(`Character motion map not found: ${characterKey}`);
  const variantKey = getROStudioRequestedVariantKey(motionMap);
  const variant = getROStudioVariantMotions(motionMap, variantKey);
  if (!variant) throw new Error(`Character variant not found: ${characterKey}/${variantKey}`);

  const requestedWeapon = resolveROStudioWeaponTypeFromEquipment(character.weapon_type_default || "fist");
  const attackSelection = resolveROStudioAttackSelection(
    requestedWeapon,
    motionMap,
    variant,
    character.weapon_type_default || "fist"
  );
  if (!attackSelection.path) throw new Error(`Attack atlas not found: ${characterKey}/${requestedWeapon}`);

  const nextAssets = {};
  const nextImages = {};
  const loadCache = new Map();
  const assignMotion = async (motionId, path) => {
    if (!path) throw new Error(`Motion path missing: ${characterKey}/${variantKey}/${motionId}`);
    let promise = loadCache.get(path);
    if (!promise) {
      promise = loadROStudioAtlasAsset(path);
      loadCache.set(path, promise);
    }
    const loaded = await promise;
    nextAssets[motionId] = loaded.data;
    nextImages[motionId] = loaded.image;
  };
  await Promise.all([
    assignMotion("idle", variant.idle),
    assignMotion("walk", variant.walk),
    assignMotion("hurt", variant.hurt || variant.dead),
    assignMotion("dead", variant.dead || variant.hurt),
    assignMotion("cast", variant.cast),
    assignMotion("attack", attackSelection.path)
  ]);

  state.characterEntry = character;
  state.motionMap = motionMap;
  state.variantKey = variantKey;
  state.weaponType = requestedWeapon;
  state.resolvedWeaponKey = attackSelection.key || "fist";
  state.assets = nextAssets;
  state.images = nextImages;
  state.mountSignature = `${characterKey}|${variantKey}|${Boolean(player?.mountState?.mounted) ? 1 : 0}|${player?.mountState?.type || "none"}`;
  return character;
}

async function setROStudioPlayerCharacter(characterKey = resolveROStudioCharacterKey(), options = {}) {
  const state = RO_STUDIO_PLAYER_ATLAS;
  if (state.loadingCharacter) return false;
  if (!options.force && state.characterKey === characterKey && state.assets?.idle) return true;

  state.loadingCharacter = true;
  try {
    const previousMotion = state.overrideMotion;
    const character = await loadROStudioCharacterAssets(characterKey);
    state.characterKey = characterKey;
    state.mountSignature = getROStudioMountSignature(state.motionMap);
    if (player) player.characterAtlas = characterKey;
    setROStudioIdleImagesForCurrentCharacter(character);
    state.frameIndex = 0;
    state.frameTimer = 0;
    state.lastAutoMotion = options.preserveMotion && previousMotion ? previousMotion : "idle";
    if (!options.initial) activateROStudioPlayerCanvas();
    return true;
  } catch (error) {
    console.warn("setROStudioPlayerCharacter failed", characterKey, error);
    return false;
  } finally {
    state.loadingCharacter = false;
  }
}
window.setROStudioPlayerCharacter = setROStudioPlayerCharacter;

function syncROStudioCharacterFromPlayer() {
  const state = RO_STUDIO_PLAYER_ATLAS;
  const desired = resolveROStudioCharacterKey();
  if (desired !== state.characterKey && !state.loadingCharacter) {
    setROStudioPlayerCharacter(desired, { force: true }).catch(error => {
      console.warn("Character appearance sync failed", desired, error);
    });
    return;
  }
  syncROStudioVariantFromPlayer();
}
window.syncROStudioCharacterFromPlayer = syncROStudioCharacterFromPlayer;

function syncROStudioVariantFromPlayer(options = {}) {
  const state = RO_STUDIO_PLAYER_ATLAS;
  if (!state.motionMap || state.loadingCharacter) return false;
  const desiredSignature = getROStudioMountSignature(state.motionMap);
  if (!options.force && desiredSignature === state.mountSignature) return true;

  setROStudioPlayerCharacter(state.characterKey, {
    force: true,
    preserveMotion: true
  }).catch(error => console.warn("Character mount variant sync failed", error));
  return true;
}
window.syncROStudioVariantFromPlayer = syncROStudioVariantFromPlayer;
window.onROWebMountStateChanged = function onROWebMountStateChanged() {
  syncROStudioVariantFromPlayer({ force: true });
};

function getROStudioCharacterManifestEntry() {
  const state = RO_STUDIO_PLAYER_ATLAS;
  return state.manifest?.characters?.[state.characterKey]
    || getROStudioFallbackManifest().characters?.novice_male;
}

function getROStudioCharacterIdleImage(character = null) {
  const entry = character || getROStudioCharacterManifestEntry();
  return entry?.idle_image || "assets/characters/novice/male/idle.png";
}
window.getROStudioCharacterIdleImage = getROStudioCharacterIdleImage;

function setROStudioIdleImagesForCurrentCharacter(character = null) {
  // 左上角人物欄與城鎮人物永遠使用未坐騎 idle.png。
  const idleSrc = `${getROStudioCharacterIdleImage(character)}?v=0.9.82GD`;
  const portrait = document.getElementById("playerPortrait");
  if (portrait && portrait.getAttribute("src") !== idleSrc) {
    portrait.src = idleSrc;
    portrait.removeAttribute("srcset");
  }

  const field = document.getElementById("battle-field");
  const inTown = Boolean(
    field?.classList?.contains("city-mode")
    && !(field?.classList?.contains("world-camera-mode") || field?.dataset?.worldCamera === "true")
  );
  const playerImage = document.getElementById("playerImage");
  if (playerImage && inTown && playerImage.getAttribute("src") !== idleSrc) {
    playerImage.src = idleSrc;
    playerImage.removeAttribute("srcset");
    playerImage.dataset.roPortraitLock = "town";
  }
}
window.setROStudioIdleImagesForCurrentCharacter = setROStudioIdleImagesForCurrentCharacter;

function activateROStudioPlayerCanvas() {
  const img = document.getElementById("playerImage");
  const canvas = RO_STUDIO_PLAYER_ATLAS.canvas;
  const playerSprite = document.getElementById("player-sprite");
  const field = document.getElementById("battle-field");
  if (!img || !canvas) return;

  const isWorld = Boolean(
    field?.classList?.contains("world-camera-mode") || field?.dataset?.worldCamera === "true"
  );
  const inTown = Boolean(field?.classList?.contains("city-mode") && !isWorld);
  if (inTown) {
    if (playerSprite) playerSprite.dataset.atlasActive = "false";
    if (field) field.dataset.atlasActive = "false";
    canvas.style.setProperty("display", "none", "important");
    canvas.style.setProperty("visibility", "hidden", "important");
    canvas.style.setProperty("opacity", "0", "important");
    img.style.setProperty("visibility", "visible", "important");
    img.style.setProperty("opacity", "1", "important");
    setROStudioIdleImagesForCurrentCharacter();
    return;
  }

  if (playerSprite) playerSprite.dataset.atlasActive = "true";
  if (field) field.dataset.atlasActive = "true";
  canvas.style.setProperty("display", "block", "important");
  canvas.style.setProperty("visibility", "visible", "important");
  canvas.style.setProperty("opacity", "1", "important");
  canvas.style.setProperty("z-index", "3", "important");
  img.style.setProperty("visibility", "hidden", "important");
  img.style.setProperty("opacity", "0", "important");
}

function recoverROStudioAtlasAfterTownExit() {
  const field = document.getElementById("battle-field");
  const playerSprite = document.getElementById("player-sprite");
  const img = document.getElementById("playerImage");
  const canvas = RO_STUDIO_PLAYER_ATLAS.canvas || document.getElementById("playerAtlasCanvas");

  if (player && player.currentCity) player.currentCity = null;
  if (field) {
    field.classList.remove("city-mode");
    field.dataset.atlasActive = "true";
  }
  if (playerSprite) playerSprite.dataset.atlasActive = "true";
  if (img) {
    img.style.setProperty("visibility", "hidden", "important");
    img.style.setProperty("opacity", "0", "important");
    img.removeAttribute("data-ro-portrait-lock");
  }
  if (canvas) {
    canvas.style.setProperty("display", "block", "important");
    canvas.style.setProperty("visibility", "visible", "important");
    canvas.style.setProperty("opacity", "1", "important");
  }
  resizeROStudioPlayerCanvas();
  activateROStudioPlayerCanvas();
}
window.recoverROStudioAtlasAfterTownExit = recoverROStudioAtlasAfterTownExit;

function restoreLegacyPlayerImage() {
  const img = document.getElementById("playerImage");
  const canvas = document.getElementById("playerAtlasCanvas");
  if (canvas) canvas.style.display = "none";
  if (img) {
    img.src = `${getROStudioCharacterIdleImage()}?v=0.9.82EM`;
    img.style.visibility = "visible";
    img.style.opacity = "1";
  }
}

function setupROStudioPlayerCanvas() {
  const state = RO_STUDIO_PLAYER_ATLAS;
  const playerSprite = document.getElementById("player-sprite");
  const img = document.getElementById("playerImage");
  if (!playerSprite || !img) return;

  let canvas = document.getElementById("playerAtlasCanvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "playerAtlasCanvas";
    canvas.setAttribute("aria-label", "player atlas animation");
    img.insertAdjacentElement("afterend", canvas);
  }

  canvas.style.position = "absolute";
  canvas.style.left = img.style.left || "0px";
  canvas.style.top = img.style.top || "0px";
  canvas.style.width = img.style.width || "100%";
  canvas.style.height = img.style.height || "100%";
  canvas.style.maxWidth = img.style.maxWidth || canvas.style.width;
  canvas.style.maxHeight = img.style.maxHeight || canvas.style.height;
  canvas.style.pointerEvents = "none";
  canvas.style.filter = "drop-shadow(0 8px 8px rgba(0,0,0,.6))";
  canvas.style.transformOrigin = "50% 84%";
  canvas.style.zIndex = "3";
  canvas.style.imageRendering = "pixelated";

  img.dataset.legacySrc = img.getAttribute("src") || "";
  canvas.style.display = "none";

  state.canvas = canvas;
  state.ctx = canvas.getContext("2d");
  resizeROStudioPlayerCanvas();
}

function resizeROStudioPlayerCanvas() {
  const state = RO_STUDIO_PLAYER_ATLAS;
  const canvas = state.canvas;
  const img = document.getElementById("playerImage");
  if (!canvas || !img) return;

  const rect = img.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width || img.clientWidth || 220));
  const cssH = Math.max(1, Math.round(rect.height || img.clientHeight || 220));
  const isMobileLike = Boolean(
    window.matchMedia && window.matchMedia("(max-width: 900px), (pointer: coarse)").matches
  );
  const dpr = isMobileLike ? 1 : Math.max(1, Math.min(2, Number(window.devicePixelRatio || 1)));
  const pixelW = Math.max(1, Math.round(cssW * dpr));
  const pixelH = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== pixelW || canvas.height !== pixelH) {
    canvas.width = pixelW;
    canvas.height = pixelH;
  }
  canvas.dataset.cssWidth = String(cssW);
  canvas.dataset.cssHeight = String(cssH);
  canvas.style.left = img.style.left || "0px";
  canvas.style.top = img.style.top || "0px";
  canvas.style.width = img.style.width || `${cssW}px`;
  canvas.style.height = img.style.height || `${cssH}px`;
  canvas.style.maxWidth = img.style.maxWidth || canvas.style.width;
  canvas.style.maxHeight = img.style.maxHeight || canvas.style.height;
}

// 一份 JSON 可同時包含 hurt 與 dead；依目前要求的 motionId 選擇定義。
function getROStudioMotionDefinition(asset, motionId) {
  const requested = String(motionId || "").trim().toLowerCase();
  const motions = Array.isArray(asset?.motions) ? asset.motions : [];
  const direct = motions.find(row => String(row?.id || "").trim().toLowerCase() === requested);
  if (direct) return direct;

  const alias = asset?.motion_aliases?.[requested];
  if (alias) {
    const sourceId = String(alias.source_motion || alias.source || requested).trim().toLowerCase();
    const source = motions.find(row => String(row?.id || "").trim().toLowerCase() === sourceId) || motions[0];
    if (source) {
      return {
        ...source,
        id: requested || source.id,
        frame_start: Number(alias.frame_start ?? source.frame_start ?? 0),
        frame_count: Number(alias.frame_count ?? source.frame_count ?? 1),
        virtual: true,
        source_motion: sourceId
      };
    }
  }
  return motions[0] || null;
}
window.getROStudioMotionDefinition = getROStudioMotionDefinition;

function getROStudioFrameSet(asset, motionId) {
  const requested = String(motionId || "").trim().toLowerCase();
  if (asset?.frame_sets?.[requested]) return asset.frame_sets[requested];
  const alias = asset?.motion_aliases?.[requested];
  const sourceId = String(alias?.source_motion || alias?.source || "").trim().toLowerCase();
  if (sourceId && asset?.frame_sets?.[sourceId]) return asset.frame_sets[sourceId];
  const firstKey = Object.keys(asset?.frame_sets || {})[0];
  return firstKey ? asset.frame_sets[firstKey] : null;
}
window.getROStudioFrameSet = getROStudioFrameSet;

function getROStudioMotionFrameCount(asset, motionId) {
  const frameSet = getROStudioFrameSet(asset, motionId);
  if (frameSet) return Math.max(1, Number(frameSet.frameCount || 1));
  const motion = getROStudioMotionDefinition(asset, motionId);
  return Math.max(1, Number(motion?.frame_count || 1));
}

// 長讀條技能只在讀條結束時播放收尾幀。8～9 幀 Attack 保留最後 3 幀，
// 5～7 幀 Cast／Attack 保留最後 2 幀；更短素材至少保留最後 1 幀。
function getROStudioActionReleaseFrameCount(motionId, totalFrames) {
  const count = Math.max(1, Number(totalFrames || 1));
  if (count >= 8) return 3;
  if (count >= 5) return 2;
  return 1;
}
window.getROStudioActionReleaseFrameCount = getROStudioActionReleaseFrameCount;

function getROStudioMotionFrameWindow(asset, motionId, segment = null) {
  const totalFrames = getROStudioMotionFrameCount(asset, motionId);
  const normalized = String(segment || '').trim().toLowerCase();
  if (!['prepare', 'release'].includes(normalized) || totalFrames <= 1) {
    return { start: 0, end: totalFrames - 1, count: totalFrames, totalFrames, segment: 'full' };
  }
  const releaseCount = Math.min(totalFrames, getROStudioActionReleaseFrameCount(motionId, totalFrames));
  const releaseStart = Math.max(0, totalFrames - releaseCount);
  if (normalized === 'prepare' && releaseStart > 0) {
    return { start: 0, end: releaseStart - 1, count: releaseStart, totalFrames, segment: 'prepare' };
  }
  return {
    start: releaseStart,
    end: totalFrames - 1,
    count: Math.max(1, totalFrames - releaseStart),
    totalFrames,
    segment: 'release'
  };
}
window.getROStudioMotionFrameWindow = getROStudioMotionFrameWindow;

function getROStudioDirectionName(asset, directionId) {
  const names = Array.isArray(asset?.direction_engine_names) && asset.direction_engine_names.length
    ? asset.direction_engine_names
    : RO_STUDIO_DIRECTION_NAMES;
  const index = Math.max(0, Math.min(7, Number(directionId || 0)));
  return names[index] || RO_STUDIO_DIRECTION_NAMES[index] || "front";
}

function getROStudioPackedFrame(asset, motionId, frameIndex, directionId) {
  const frameSet = getROStudioFrameSet(asset, motionId);
  if (!frameSet?.directions) return null;

  const directionName = getROStudioDirectionName(asset, directionId);
  let frames = frameSet.directions[directionName];
  if (!Array.isArray(frames) || !frames.length) {
    const alias = frameSet.directionAliases?.[directionName];
    frames = alias?.sourceDirection ? frameSet.directions[alias.sourceDirection] : null;
  }
  if (!Array.isArray(frames) || !frames.length) {
    frames = Object.values(frameSet.directions).find(value => Array.isArray(value) && value.length) || null;
  }
  if (!frames?.length) return null;
  const index = Math.max(0, Number(frameIndex || 0)) % frames.length;
  return frames[index] || frames[0] || null;
}
window.getROStudioPackedFrame = getROStudioPackedFrame;

async function setROStudioPlayerWeaponType(rawType = "fist") {
  const state = RO_STUDIO_PLAYER_ATLAS;
  const requestedType = String(rawType || "fist").trim() || "fist";
  const variant = getROStudioVariantMotions(state.motionMap, state.variantKey);
  const selected = resolveROStudioAttackSelection(
    requestedType,
    state.motionMap,
    variant,
    state.characterEntry?.weapon_type_default || "fist"
  );
  if (!selected.path) return false;

  const requestSerial = Number(state.weaponLoadSerial || 0) + 1;
  state.weaponLoadSerial = requestSerial;
  state.pendingWeaponType = requestedType;
  const requestCharacterKey = state.characterKey;
  const requestVariantKey = state.variantKey;

  try {
    const loaded = await loadROStudioAtlasAsset(selected.path);
    // 裝備快速切換、卸裝、轉職或上下坐騎時，較舊的非同步請求可能比較晚完成。
    // 只有最後一次請求可以寫回 Attack Atlas，避免槍／劍／空手在畫面上交替跳回。
    if (
      requestSerial !== Number(state.weaponLoadSerial || 0)
      || requestCharacterKey !== state.characterKey
      || requestVariantKey !== state.variantKey
    ) {
      return false;
    }
    state.assets.attack = loaded.data;
    state.images.attack = loaded.image;
    state.weaponType = requestedType;
    state.resolvedWeaponKey = selected.key || "fist";
    state.pendingWeaponType = null;
    if (player) player.weaponType = state.weaponType;
    state.frameIndex = 0;
    state.frameTimer = 0;
    return true;
  } catch (error) {
    if (requestSerial === Number(state.weaponLoadSerial || 0)) {
      state.pendingWeaponType = null;
    }
    console.warn("Attack motion load failed", requestedType, error);
    return false;
  }
}
window.setROStudioPlayerWeaponType = setROStudioPlayerWeaponType;

function syncROStudioWeaponTypeFromEquipment() {
  const state = RO_STUDIO_PLAYER_ATLAS;
  const type = resolveROStudioWeaponTypeFromEquipment("fist");
  if (player) player.weaponType = type;
  const current = normalizeROStudioWeaponLookupKey(state.weaponType || "fist");
  const pending = normalizeROStudioWeaponLookupKey(state.pendingWeaponType || "");
  const desired = normalizeROStudioWeaponLookupKey(type || "fist");
  if (desired && desired !== current && desired !== pending) {
    setROStudioPlayerWeaponType(type).catch(error => {
      console.warn("setROStudioPlayerWeaponType failed", type, error);
    });
  }
}
window.syncROStudioWeaponTypeFromEquipment = syncROStudioWeaponTypeFromEquipment;

function getROStudioPlayerAnchorRatio() {
  const state = RO_STUDIO_PLAYER_ATLAS;
  const asset = state.assets?.idle || state.assets?.walk || state.assets?.attack;
  const cellW = Number(asset?.cell?.width || 256);
  const cellH = Number(asset?.cell?.height || 256);
  const anchorX = Number(asset?.anchor?.x ?? 128);
  const anchorY = Number(asset?.anchor?.y ?? 140);
  return {
    x: Math.max(0, Math.min(1, anchorX / Math.max(1, cellW))),
    y: Math.max(0, Math.min(1, anchorY / Math.max(1, cellH))),
    rawX: anchorX,
    rawY: anchorY
  };
}
window.getROStudioPlayerAnchorRatio = getROStudioPlayerAnchorRatio;

function tickROStudioPlayerAtlasRuntime(timestamp) {
  const state = RO_STUDIO_PLAYER_ATLAS;
  if (!state.ready) return;

  syncROStudioCharacterFromPlayer();
  const dt = Math.min(100, Math.max(0, timestamp - (state.lastTime || timestamp)));
  state.lastTime = timestamp;

  resizeROStudioPlayerCanvas();
  updateROStudioPlayerDirection();

  const motionId = getROStudioCurrentPlayerMotion(timestamp);
  const asset = state.assets[motionId] || state.assets.idle;
  const totalFrameCount = motionId === "idle" ? 1 : getROStudioMotionFrameCount(asset, motionId);
  const hasOverrideWindow = state.overrideMotion === motionId;
  const frameStart = hasOverrideWindow
    ? Math.max(0, Math.min(totalFrameCount - 1, Number(state.overrideFrameStart || 0)))
    : 0;
  const rawFrameEnd = hasOverrideWindow && state.overrideFrameEnd !== null
    ? Number(state.overrideFrameEnd)
    : totalFrameCount - 1;
  const frameEnd = Math.max(frameStart, Math.min(totalFrameCount - 1, rawFrameEnd));
  const frameCount = Math.max(1, frameEnd - frameStart + 1);

  if (state.lastAutoMotion !== motionId) {
    state.lastAutoMotion = motionId;
    state.frameIndex = 0;
    state.frameTimer = 0;
  }

  state.frameTimer += dt;
  const frameMs = Number((hasOverrideWindow && state.overrideFrameMs > 0) ? state.overrideFrameMs : (state.fpsMs[motionId] || 120));
  while (state.frameTimer >= frameMs) {
    state.frameTimer -= frameMs;
    if (
      motionId === "dead"
      || (state.overrideHoldLast && hasOverrideWindow)
      || (state.overrideHoldSegmentLast && hasOverrideWindow)
    ) {
      state.frameIndex = Math.min(frameCount - 1, state.frameIndex + 1);
    } else {
      state.frameIndex = (state.frameIndex + 1) % frameCount;
    }
  }

  if (motionId === "idle") state.frameIndex = 0;
  renderROStudioPlayerAtlasFrame(motionId, frameStart + state.frameIndex, state.directionId);
  requestAnimationFrame(tickROStudioPlayerAtlasRuntime);
}

function isROStudioPlayerActuallyMoving() {
  const pos = player?.position;
  if (!pos) return false;
  const stateName = String(player?.state || "").toLowerCase();
  if (stateName.includes("move") || stateName.includes("approach")) return true;
  if (pos.targetX === null || pos.targetY === null || pos.targetX === undefined || pos.targetY === undefined) return false;
  return Math.hypot(Number(pos.targetX || 0) - Number(pos.x || 0), Number(pos.targetY || 0) - Number(pos.y || 0)) > 2;
}

function clearROStudioPlayerAttackMotionForMovement() {
  const state = RO_STUDIO_PLAYER_ATLAS;
  if (state.overrideMotion !== "attack") return false;
  state.overrideMotion = null;
  state.overrideUntil = 0;
  state.overrideLockUntil = 0;
  state.overrideHoldLast = false;
  state.overrideHoldSegmentLast = false;
  state.overrideFrameMs = 0;
  state.overrideFrameStart = 0;
  state.overrideFrameEnd = null;
  state.queuedMotion = null;
  state.frameIndex = 0;
  state.frameTimer = 0;
  state.lastAutoMotion = null;
  return true;
}
window.clearROStudioPlayerAttackMotionForMovement = clearROStudioPlayerAttackMotionForMovement;

function getROStudioCurrentPlayerMotion(now) {
  const state = RO_STUDIO_PLAYER_ATLAS;
  const moving = isROStudioPlayerActuallyMoving();
  if (moving && state.overrideMotion === "attack") clearROStudioPlayerAttackMotionForMovement();
  if (state.overrideMotion && now <= state.overrideUntil) return state.overrideMotion;

  if (state.overrideMotion && now > state.overrideUntil) {
    if (state.overrideHoldLast) return state.overrideMotion;
    state.overrideMotion = null;
    state.overrideHoldLast = false;
    state.overrideHoldSegmentLast = false;
    state.overrideLockUntil = 0;
    state.overrideFrameMs = 0;
    state.overrideFrameStart = 0;
    state.overrideFrameEnd = null;
    if (state.queuedMotion) {
      const queued = state.queuedMotion;
      state.queuedMotion = null;
      playROStudioPlayerMotion(queued.motionId, queued.options || {});
      return queued.motionId;
    }
  }

  const pState = String(player?.state || "").toLowerCase();
  if (moving || pState.includes("move") || pState.includes("approach")) return "walk";
  return "idle";
}

function playROStudioPlayerMotion(motionId, options = {}) {
  const state = RO_STUDIO_PLAYER_ATLAS;
  if (!state.ready || !state.assets[motionId]) return false;

  const now = performance.now();
  const frameWindow = getROStudioMotionFrameWindow(state.assets[motionId], motionId, options.frameSegment);
  const nativeFrameMs = Math.max(16, Number(state.fpsMs[motionId] || 120));
  const defaultDuration = frameWindow.count * nativeFrameMs;
  const duration = Math.max(16, Number(options.duration || defaultDuration));
  if (state.overrideMotion === "attack" && now < state.overrideLockUntil && motionId !== "dead" && motionId !== "attack") {
    if (motionId === "hurt" || motionId === "cast") state.queuedMotion = { motionId, options };
    return true;
  }

  state.overrideMotion = motionId;
  state.overrideUntil = now + duration;
  state.overrideLockUntil = motionId === "attack" ? now + duration : 0;
  state.overrideHoldLast = Boolean(options.holdLast);
  state.overrideHoldSegmentLast = Boolean(options.holdSegmentLast);
  state.overrideFrameStart = frameWindow.start;
  state.overrideFrameEnd = frameWindow.end;
  state.overrideFrameMs = options.compressFrames === true && frameWindow.count > 0
    ? Math.max(16, duration / frameWindow.count)
    : 0;
  state.frameIndex = 0;
  state.frameTimer = 0;
  state.lastAutoMotion = motionId;
  return true;
}
window.playROStudioPlayerMotion = playROStudioPlayerMotion;


function clearROStudioPlayerMotionOverride() {
  const state = RO_STUDIO_PLAYER_ATLAS;
  state.overrideMotion = null;
  state.overrideUntil = 0;
  state.overrideLockUntil = 0;
  state.overrideHoldLast = false;
  state.overrideHoldSegmentLast = false;
  state.overrideFrameMs = 0;
  state.overrideFrameStart = 0;
  state.overrideFrameEnd = null;
  state.queuedMotion = null;
  state.frameIndex = 0;
  state.frameTimer = 0;
  state.lastAutoMotion = null;
  return true;
}
window.clearROStudioPlayerMotionOverride = clearROStudioPlayerMotionOverride;

function getROStudioMotionDuration(motionId) {
  const state = RO_STUDIO_PLAYER_ATLAS;
  const asset = state.assets[motionId];
  const frameCount = getROStudioMotionFrameCount(asset, motionId);
  return frameCount * Number(state.fpsMs[motionId] || 120);
}
window.getROStudioMotionDuration = getROStudioMotionDuration;

function configureROStudioPixelContext(ctx) {
  ctx.imageSmoothingEnabled = false;
  ctx.webkitImageSmoothingEnabled = false;
  ctx.mozImageSmoothingEnabled = false;
  ctx.msImageSmoothingEnabled = false;
}

function renderROStudioPackedFrame(ctx, canvas, asset, image, frame) {
  const region = frame?.region;
  if (!region) return false;

  const sx = Number(region.x || 0);
  const sy = Number(region.y || 0);
  const sw = Math.max(0, Number(region.w || 0));
  const sh = Math.max(0, Number(region.h || 0));
  if (sw <= 0 || sh <= 0) return true;

  const cellW = Math.max(1, Number(asset?.cell?.width || 256));
  const cellH = Math.max(1, Number(asset?.cell?.height || 256));
  const scaleX = canvas.width / cellW;
  const scaleY = canvas.height / cellH;
  const dx = Number(frame.targetOffsetX ?? frame.offsetX ?? 0);
  const dy = Number(frame.targetOffsetY ?? frame.offsetY ?? 0);
  const dw = sw * scaleX;
  const dh = sh * scaleY;
  const targetX = dx * scaleX;
  const targetY = dy * scaleY;

  if (frame.flipX) {
    ctx.save();
    ctx.translate(targetX + dw, targetY);
    ctx.scale(-1, 1);
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(image, sx, sy, sw, sh, targetX, targetY, dw, dh);
  }
  return true;
}
window.renderROStudioPackedFrame = renderROStudioPackedFrame;

function renderROStudioPlayerAtlasFrame(motionId, frameIndex, directionId) {
  const state = RO_STUDIO_PLAYER_ATLAS;
  const canvas = state.canvas;
  const ctx = state.ctx;
  const asset = state.assets[motionId] || state.assets.idle;
  const image = state.images[motionId] || state.images.idle;
  const motion = getROStudioMotionDefinition(asset, motionId);
  if (!canvas || !ctx || !asset || !image || !motion) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  configureROStudioPixelContext(ctx);

  if (asset?.atlas?.packed || asset?.schema === "ro_web_packed_character_atlas") {
    const frame = getROStudioPackedFrame(asset, motionId, frameIndex, directionId);
    renderROStudioPackedFrame(ctx, canvas, asset, image, frame);
    return;
  }

  // 舊固定格 Atlas 相容路徑。
  const cellW = Number(asset.cell?.width || 256);
  const cellH = Number(asset.cell?.height || 256);
  const columns = Number(asset.atlas?.columns || 8);
  const dir = Math.max(0, Math.min(columns - 1, Number(directionId || 0)));
  const row = Number(motion.row_start || 0)
    + Number(motion.frame_start || 0)
    + Math.max(0, Number(frameIndex || 0));
  const sx = dir * cellW;
  const sy = row * cellH;
  ctx.drawImage(image, sx, sy, cellW, cellH, 0, 0, canvas.width, canvas.height);
}
window.renderROStudioPlayerAtlasFrame = renderROStudioPlayerAtlasFrame;

function updateROStudioPlayerDirection() {
  const state = RO_STUDIO_PLAYER_ATLAS;
  let dx = 0;
  let dy = 0;

  if (player?.position) {
    const pState = String(player.state || "").toLowerCase();
    if (currentMonster?.position && (pState.includes("attack") || pState.includes("approach"))) {
      dx = Number(currentMonster.position.x || 0) - Number(player.position.x || 0);
      dy = Number(currentMonster.position.y || 0) - Number(player.position.y || 0);
    } else if (
      player.position.targetX !== null && player.position.targetX !== undefined
      && player.position.targetY !== null && player.position.targetY !== undefined
    ) {
      dx = Number(player.position.targetX) - Number(player.position.x || 0);
      dy = Number(player.position.targetY) - Number(player.position.y || 0);
    }
  }

  if (Math.hypot(dx, dy) < 0.5) return;
  state.directionId = vectorToRODirectionId(dx, dy);
}

function vectorToRODirectionId(dx, dy) {
  // 保留 RO_WEB 已驗證的畫面座標映射：人物來源圖的左右欄與世界座標左右相反。
  // packed JSON 仍沿用相同 direction id，因此鏡像/借用由每幀 flipX 精確還原。
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  if (angle >= 67.5 && angle < 112.5) return 0;
  if (angle >= 112.5 && angle < 157.5) return 7;
  if (angle >= 157.5 || angle < -157.5) return 6;
  if (angle >= -157.5 && angle < -112.5) return 5;
  if (angle >= -112.5 && angle < -67.5) return 4;
  if (angle >= -67.5 && angle < -22.5) return 3;
  if (angle >= -22.5 && angle < 22.5) return 2;
  return 1;
}
window.vectorToRODirectionId = vectorToRODirectionId;
