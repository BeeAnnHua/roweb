//=======================================
// Position Combat Engine v0.2
// 目標：在不推翻現有平面戰鬥畫面的前提下，加入玩家/怪物座標、射程、追擊、手動移動與蒼蠅翅膀。
// 參考 RA mob_db 概念欄位：AttackRange / SkillRange / ChaseRange / WalkSpeed / Ai / Modes。
//=======================================

const POSITION_ENGINE_VERSION = "0.9.82EM";
// Exact rAthena Aegis AI bitmasks from src/map/mob.hpp.
const RA_MONSTER_AI_MASKS = Object.freeze({
  1:0x81,2:0x83,3:0x1089,4:0x3885,5:0x2085,6:0x0,7:0x108B,8:0x7085,9:0x3095,
  10:0x84,11:0x84,12:0x2085,13:0x308D,17:0x91,19:0x3095,20:0x3295,21:0x3695,
  24:0xA1,25:0x1,26:0xB695,27:0x8084
});
const RA_MONSTER_MODE_BITS = Object.freeze({
  CanMove:0x1,Looter:0x2,Aggressive:0x4,Assist:0x8,CastSensorIdle:0x10,NoRandomWalk:0x20,
  NoCast:0x40,CanAttack:0x80,CastSensorChase:0x200,ChangeChase:0x400,Angry:0x800,
  ChangeTargetMelee:0x1000,ChangeTargetChase:0x2000,TargetWeak:0x4000,RandomTarget:0x8000,
  IgnoreMelee:0x10000,IgnoreMagic:0x20000,IgnoreRanged:0x40000,Mvp:0x80000,
  IgnoreMisc:0x100000,KnockBackImmune:0x200000,TeleportBlock:0x400000,FixedItemDrop:0x1000000,
  Detector:0x2000000,StatusImmune:0x4000000,SkillImmune:0x8000000
});
const RA_MONSTER_MODE_RUNTIME_KEYS = Object.freeze({
  CanMove:"canMove",Looter:"looter",Aggressive:"aggressive",Assist:"assist",CastSensorIdle:"castSensorIdle",
  NoRandomWalk:"noRandomWalk",NoCast:"noCast",CanAttack:"canAttack",CastSensorChase:"castSensorChase",
  ChangeChase:"changeChase",Angry:"angry",ChangeTargetMelee:"changeTargetMelee",
  ChangeTargetChase:"changeTargetChase",TargetWeak:"targetWeak",RandomTarget:"randomTarget",
  IgnoreMelee:"ignoreMelee",IgnoreMagic:"ignoreMagic",IgnoreRanged:"ignoreRanged",Mvp:"mvpMode",
  IgnoreMisc:"ignoreMisc",KnockBackImmune:"knockbackImmune",TeleportBlock:"teleportBlock",
  FixedItemDrop:"fixedItemDrop",Detector:"detector",StatusImmune:"statusImmune",SkillImmune:"skillImmune"
});
function getMonsterModeBitmask(monster = currentMonster) {
  const stored = Number(monster?.modeBitmask);
  if (Number.isFinite(stored)) return stored;
  const ai = Number(monster?.ai ?? monster?.Ai ?? 6);
  let mask = Number(RA_MONSTER_AI_MASKS[ai] ?? 0);
  const explicit = Array.isArray(monster?.Modes) ? monster.Modes : [];
  explicit.forEach(name => { const bit=RA_MONSTER_MODE_BITS[String(name)]; if (bit) mask |= bit; });
  return mask;
}
function getMonsterAiBehavior(monster = currentMonster) {
  const mask = getMonsterModeBitmask(monster);
  const behavior = {};
  Object.entries(RA_MONSTER_MODE_BITS).forEach(([name,bit]) => {
    const key=RA_MONSTER_MODE_RUNTIME_KEYS[name];
    if (key) behavior[key]=Boolean(mask & bit);
  });
  Object.assign(behavior, monster?.behavior || {});
  behavior.randomWalk=Boolean(behavior.canMove && !behavior.noRandomWalk);
  behavior.immobile=!behavior.canMove;
  behavior.modeBitmask=mask;
  behavior.source=behavior.source || `rAthena Ai ${String(monster?.Ai ?? monster?.ai ?? 6).padStart(2,"0")} + Modes`;
  return behavior;
}
window.getMonsterModeBitmask = getMonsterModeBitmask;
window.getMonsterAiBehavior = getMonsterAiBehavior;

const FLY_WING_ITEM_ID = 601;
const BUTTERFLY_WING_ITEM_ID = 602;

//=======================================
// Movement Engine v0.1
// 參考 rAthena src/common/mmo.hpp：
// DEFAULT_WALK_SPEED = 150, MIN_WALK_SPEED = 20, MAX_WALK_SPEED = 1000。
// RA WalkSpeed 數值越小越快；RO_WEB 統一使用 walkSpeed 表示速度狀態，
// 再轉換成畫面上的 px/sec。
//=======================================
const RA_WALK_SPEED = {
  FASTEST: 20,
  DEFAULT: 150,
  SLOWEST: 1000
};

const ROWEB_MOVEMENT = {
  defaultPixelsPerSecond: 115,
  minPixelsPerSecond: 18,
  maxPixelsPerSecond: 420,
  playerBaseMultiplier: 1.5
};

function clampRaWalkSpeed(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return RA_WALK_SPEED.DEFAULT;
  return Math.max(RA_WALK_SPEED.FASTEST, Math.min(RA_WALK_SPEED.SLOWEST, Math.round(v)));
}

function raWalkSpeedToPixelsPerSecond(walkSpeed) {
  const ws = clampRaWalkSpeed(walkSpeed);
  const px = ROWEB_MOVEMENT.defaultPixelsPerSecond * (RA_WALK_SPEED.DEFAULT / ws);
  return Math.max(ROWEB_MOVEMENT.minPixelsPerSecond, Math.min(ROWEB_MOVEMENT.maxPixelsPerSecond, px));
}

function getPlayerEffectiveWalkSpeed() {
  // 不在這裡呼叫 recalculatePlayerStats，避免狀態計算與移動速度互相遞迴。
  return clampRaWalkSpeed(player?.walkSpeed ?? RA_WALK_SPEED.DEFAULT);
}

function getPlayerMovePixelsPerSecond() {
  // RO_WEB 0.9.82FI：玩家基礎移動速度提高 1.5 倍；所有技能、裝備與
  // Buff 仍先依 Renewal walkSpeed 計算，再乘上玩家專屬基礎倍率。
  const base = raWalkSpeedToPixelsPerSecond(getPlayerEffectiveWalkSpeed());
  return Math.max(
    ROWEB_MOVEMENT.minPixelsPerSecond,
    Math.min(ROWEB_MOVEMENT.maxPixelsPerSecond * ROWEB_MOVEMENT.playerBaseMultiplier, base * ROWEB_MOVEMENT.playerBaseMultiplier)
  );
}

function getMonsterEffectiveWalkSpeed(monster = currentMonster) {
  let walkSpeed = Number(monster?.WalkSpeed ?? monster?.walkSpeed ?? 400);
  const runtime = typeof getMonsterRuntimeBonuses === "function" ? getMonsterRuntimeBonuses(monster) : {};
  walkSpeed += Number(runtime.walkSpeedFlat || 0);
  walkSpeed = Math.floor(walkSpeed * (100 + Number(runtime.walkSpeedRate || 0)) / 100);
  return clampRaWalkSpeed(walkSpeed);
}

function getMonsterMovePixelsPerSecond(monster = currentMonster) {
  return raWalkSpeedToPixelsPerSecond(getMonsterEffectiveWalkSpeed(monster));
}

const POSITION_FIELD = {
  minX: 330,
  maxX: 930,
  minY: 135,
  maxY: 500,
  playerDefaultX: 470,
  playerDefaultY: 338,
  monsterDefaultX: 760,
  monsterDefaultY: 330,
  spriteAnchorOffsetX: 0,
  spriteAnchorOffsetY: 0
};

// V0.9.72b：手機直式版改採動態可行走區。
// 桌機仍保留原本 1280x720 的穩定手感；手機則依實際 battle-field 尺寸、
// 底部戰鬥紀錄/快捷欄與右側按鈕區計算邊界，避免角色跑出框外或躲到 UI 後面。
const POSITION_SAFE = {
  // V0.9.72d：PC / Mobile 共用動態可走區。
  // 目標：盡量使用整張戰鬥畫面，只避開左上人物欄與下方對話欄/快捷欄。
  left: 10,
  right: 10,
  topGap: 8,
  bottomGap: 14,
  playerW: 62,
  monsterW: 70
};

function getBattleFieldElement() {
  return document.getElementById("battle-field");
}

function isMobileBattleLayout() {
  const field = getBattleFieldElement();
  const width = field?.offsetWidth || window.innerWidth || 1280;
  return width <= 900 || window.matchMedia?.("(pointer: coarse)")?.matches;
}

function isPortraitBattleLayout() {
  const field = getBattleFieldElement();
  const width = field?.offsetWidth || window.innerWidth || 1280;
  const height = field?.offsetHeight || window.innerHeight || 720;
  return height > width;
}

function getFieldLogicalSize() {
  const field = getBattleFieldElement();
  return {
    width: Math.max(1, Number(field?.offsetWidth || 1280)),
    height: Math.max(1, Number(field?.offsetHeight || 720))
  };
}

function getViewportLogicalSize() {
  // 0.9.82FD：World Camera 與城鎮共用瀏覽器可視尺寸。
  // 無論桌機或手機，只要 battle-field 因視窗縮小，就以實際 rendered rect 作為 camera viewport；
  // 4608×4608 世界本體不縮小，只改變目前可見範圍與 camera offset。
  const map = currentMap || {};
  if (map.worldCamera) {
    const field = getBattleFieldElement();
    const rect = field?.getBoundingClientRect?.();
    if (rect?.width && rect?.height) {
      return {
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height))
      };
    }
    return {
      width: Math.max(1, Number(map.cameraWidth || 1280)),
      height: Math.max(1, Number(map.cameraHeight || 720))
    };
  }
  return getFieldLogicalSize();
}

function getCurrentMapWorldSize() {
  const viewport = getViewportLogicalSize();
  const map = currentMap || {};
  const width = Number(map.worldWidth || map.mapWidth || map.width || viewport.width);
  const height = Number(map.worldHeight || map.mapHeight || map.height || viewport.height);
  return {
    width: Math.max(viewport.width, Number.isFinite(width) ? width : viewport.width),
    height: Math.max(viewport.height, Number.isFinite(height) ? height : viewport.height)
  };
}

function isLargeFieldMap() {
  const viewport = getViewportLogicalSize();
  const world = getCurrentMapWorldSize();
  return world.width > viewport.width + 2 || world.height > viewport.height + 2;
}

function isWorldCameraEngineActive() {
  const field = getBattleFieldElement();
  return Boolean(
    currentMap?.worldCamera ||
    field?.dataset?.worldCamera === "true" ||
    field?.classList?.contains("world-camera-mode")
  );
}

function getMapCameraOffset(pos = player?.position) {
  const viewport = getViewportLogicalSize();
  const world = getCurrentMapWorldSize();
  if (!isLargeFieldMap()) return { x: 0, y: 0 };
  const x = clampPositionValue(Number(pos?.x ?? world.width * 0.5) - viewport.width * 0.5, 0, Math.max(0, world.width - viewport.width));
  const y = clampPositionValue(Number(pos?.y ?? world.height * 0.5) - viewport.height * 0.5, 0, Math.max(0, world.height - viewport.height));
  return { x, y };
}


function ensureWorldCameraLayer(field) {
  if (!field) return null;
  let layer = document.getElementById("world-camera-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "world-camera-layer";
    layer.className = "world-camera-layer";
    field.insertBefore(layer, field.firstChild);
  } else if (layer.parentElement !== field) {
    field.insertBefore(layer, field.firstChild);
  }
  return layer;
}

function removeWorldCameraLayer() {
  const layer = document.getElementById("world-camera-layer");
  if (layer) layer.remove();
}

function applyWorldCameraLayerTransform(field, world, camera) {
  const layer = ensureWorldCameraLayer(field);
  if (!layer) return null;
  const bgImage = field.dataset.worldBackgroundImage || field.style.backgroundImage || "none";
  layer.style.backgroundImage = bgImage;
  layer.style.width = `${Math.round(world.width)}px`;
  layer.style.height = `${Math.round(world.height)}px`;
  layer.style.backgroundSize = `${Math.round(world.width)}px ${Math.round(world.height)}px`;
  layer.style.backgroundPosition = "0 0";
  layer.style.backgroundRepeat = "no-repeat";
  const transform = `translate(${-Math.round(camera.x)}px, ${-Math.round(camera.y)}px)`;
  layer.style.transform = transform;
  field.style.backgroundImage = "none";
  field.dataset.appliedWorldCameraLayer = "world-camera-layer";
  field.dataset.appliedWorldCameraTransform = transform;
  return { layer, transform };
}

function applyLargeMapCamera() {
  const field = getBattleFieldElement();
  if (!field) return;

  // V0.9.78j：城鎮模式不套用大地圖 Camera。
  // 回村後若還用野外 camera offset / background-size，城鎮背景會被放成超大模糊圖。
  if (player?.currentCity || field.classList.contains("city-mode")) {
    field.classList.remove("large-map-mode", "world-camera-mode");
    field.dataset.worldCamera = "false";
    removeWorldCameraLayer();
    if (field.dataset.worldBackgroundImage && field.dataset.worldBackgroundImage !== "none") {
      field.style.backgroundImage = field.dataset.worldBackgroundImage;
    }
    field.style.backgroundSize = "cover";
    field.style.backgroundPosition = "center center";
    field.style.backgroundRepeat = "no-repeat";
    field.dataset.appliedWorldCameraLayer = "none";
    field.dataset.appliedWorldCameraTransform = "none";
    return;
  }

  if (!isLargeFieldMap()) {
    field.classList.remove("large-map-mode");
    removeWorldCameraLayer();
    if (field.dataset.worldBackgroundImage && field.dataset.worldBackgroundImage !== "none") {
      field.style.backgroundImage = field.dataset.worldBackgroundImage;
    }
    field.style.backgroundSize = "cover";
    field.style.backgroundPosition = "center";
    field.style.backgroundRepeat = "no-repeat";
    field.dataset.appliedWorldCameraLayer = "none";
    field.dataset.appliedWorldCameraTransform = "none";
    return;
  }
  const world = getCurrentMapWorldSize();
  const camera = getMapCameraOffset();

  // V0.9.78W：Camera Rendering 修正。
  // World 本體永遠保持原始 world.width/world.height（例如 4108×4108），
  // 手機只改 viewport，不縮 world；背景只用 background-position / translate 等價邏輯反向移動。
  field.classList.add("large-map-mode");
  field.style.setProperty("--world-width", `${Math.round(world.width)}px`);
  field.style.setProperty("--world-height", `${Math.round(world.height)}px`);
  field.style.backgroundSize = `${Math.round(world.width)}px ${Math.round(world.height)}px`;
  field.style.backgroundPosition = `${-Math.round(camera.x)}px ${-Math.round(camera.y)}px`;
  field.style.backgroundRepeat = "no-repeat";
  // V0.9.78W：真正顯示背景改用專用 layer transform。
  // 某些手機瀏覽器/舊 CSS 覆蓋會讓 battle-field background-position 看起來沒動；
  // layer transform 可明確移動 4608×4608 世界本體。
  applyWorldCameraLayerTransform(field, world, camera);
}


// V0.9.80K：城鎮模式固定展示座標。
// PC 沿用舊城鎮右側綁定位置；手機只放大城鎮人物，不影響世界地圖。
const RO_TOWN_PLAYER_FIXED = {
  // V0.9.80K：城鎮展示圖維持右側固定；PC 放大 1.5 倍並右移。
  pc: { left: 920, top: 205, spriteW: 330, spriteH: 375, imgW: 330, imgH: 330, imgTop: 24 },
  mobile: { leftPad: 20, top: 132, spriteW: 300, spriteH: 356, imgW: 300, imgH: 300, imgTop: 20 },
  debugX: 650,
  debugY: 350
};

function isROTownMobileView(field = null) {
  const fw = Number(field?.clientWidth || field?.offsetWidth || window.innerWidth || 1280);
  return fw < 900 || Boolean(window.matchMedia?.("(pointer: coarse)")?.matches);
}

function applyTownFixedPlayerPosition() {
  if (!player) return;
  player.position = player.position || {};
  player.position.x = RO_TOWN_PLAYER_FIXED.debugX;
  player.position.y = RO_TOWN_PLAYER_FIXED.debugY;
  player.position.targetX = null;
  player.position.targetY = null;
  player.state = "Town";
}

function renderCityPlayerSprite() {
  const field = getBattleFieldElement();
  const playerEl = document.getElementById("player-sprite");
  const playerImage = document.getElementById("playerImage");
  const monsterEl = document.getElementById("monster-sprite");
  if (!field || !playerEl) return;

  field.classList.add("city-mode");
  field.dataset.atlasActive = "false";
  if (playerEl) playerEl.dataset.atlasActive = "false";
  field.classList.remove("world-camera-mode", "large-map-mode");
  field.dataset.worldCamera = "false";
  removeWorldCameraLayer();
  field.style.backgroundSize = "cover";
  field.style.backgroundPosition = "center center";
  field.style.backgroundRepeat = "no-repeat";

  if (playerImage) {
    // V0.9.80I：城鎮用單張 idle 立繪，不吃動畫 frame / 不吃舊圖。
    playerImage.src = (typeof getROStudioCharacterIdleImage === "function" ? getROStudioCharacterIdleImage() + "?v=0.9.82EM" : "assets/characters/novice/male/idle.png?v=0.9.82EM");
    playerImage.removeAttribute("srcset");
    playerImage.dataset.roPortraitLock = "town";
  }

  applyTownFixedPlayerPosition();

  // 城鎮畫面改成：左側預留 NPC/商店區，玩家固定站在右側。
  // PC 沿用舊城鎮右側綁定位置；手機城鎮人物 x2。
  const fw = Number(field.clientWidth || field.offsetWidth || 1280);
  const mobile = isROTownMobileView(field);
  const cfg = mobile ? RO_TOWN_PLAYER_FIXED.mobile : RO_TOWN_PLAYER_FIXED.pc;
  const spriteW = cfg.spriteW;
  const spriteH = cfg.spriteH;
  const imgW = cfg.imgW;
  const imgH = cfg.imgH;
  const left = mobile ? Math.max(160, fw - spriteW - cfg.leftPad) : cfg.left;
  const top = cfg.top;

  playerEl.style.setProperty("left", `${Math.round(left)}px`, "important");
  playerEl.style.setProperty("top", `${Math.round(top)}px`, "important");
  playerEl.style.setProperty("width", `${spriteW}px`, "important");
  playerEl.style.setProperty("height", `${spriteH}px`, "important");
  playerEl.style.setProperty("z-index", "26", "important");

  if (playerImage) {
    playerImage.style.setProperty("left", "0px", "important");
    playerImage.style.setProperty("top", `${cfg.imgTop}px`, "important");
    playerImage.style.setProperty("width", `${imgW}px`, "important");
    playerImage.style.setProperty("height", `${imgH}px`, "important");
    playerImage.style.setProperty("max-width", `${imgW}px`, "important");
    playerImage.style.setProperty("max-height", `${imgH}px`, "important");
    playerImage.style.setProperty("visibility", "visible", "important");
    playerImage.style.setProperty("opacity", "1", "important");
  }

  const atlasCanvas = document.getElementById("playerAtlasCanvas");
  if (atlasCanvas) {
    atlasCanvas.style.setProperty("display", "none", "important");
    atlasCanvas.style.setProperty("visibility", "hidden", "important");
    atlasCanvas.style.setProperty("opacity", "0", "important");
  }

  if (monsterEl) monsterEl.style.display = "none";
}

function getUiTopInField(elementId) {
  const field = getBattleFieldElement();
  const el = document.getElementById(elementId);
  if (!field || !el) return null;
  const fr = field.getBoundingClientRect();
  const er = el.getBoundingClientRect();
  if (!Number.isFinite(er.top) || er.height <= 0) return null;
  return er.top - fr.top;
}

function getUiBottomInField(elementId) {
  const field = getBattleFieldElement();
  const el = document.getElementById(elementId);
  if (!field || !el) return null;
  const fr = field.getBoundingClientRect();
  const er = el.getBoundingClientRect();
  if (!Number.isFinite(er.bottom) || er.height <= 0) return null;
  return er.bottom - fr.top;
}

function getDynamicPositionBounds(kind = "player") {
  const { width, height } = getCurrentMapWorldSize();

  // V0.9.77：支援正常網頁遊戲大小的大地圖。
  // 角色/怪物座標改為世界座標；battle-field 只是一個 1280x720 viewport，
  // Camera 會跟隨玩家移動背景與精靈，不需要一次把 RO 等級超大地圖全部塞進畫面。
  const minX = 0;
  const maxX = Math.max(minX, width);
  const minY = 0;
  const maxY = Math.max(minY, height);

  return {
    minX,
    maxX,
    minY,
    maxY,
    playerDefaultX: clampPositionValue(width * 0.38, minX, maxX),
    playerDefaultY: clampPositionValue(height * 0.66, minY, maxY),
    monsterDefaultX: clampPositionValue(width * 0.68, minX, maxX),
    monsterDefaultY: clampPositionValue(height * 0.58, minY, maxY)
  };
}

function clampPositionToBounds(pos, kind = "player") {
  const bounds = getDynamicPositionBounds(kind);
  return {
    x: clampPositionValue(pos?.x, bounds.minX, bounds.maxX),
    y: clampPositionValue(pos?.y, bounds.minY, bounds.maxY)
  };
}

// V0.9.72b：正式採用 RO Cell 概念作為射程單位。
// 目前 1 Cell 先換算為 36px，之後可依畫面手感集中調整，不散落於戰鬥公式。
const POSITION_CELL_SIZE_PX = 36;
window.RO_WEB_CELL_SIZE = POSITION_CELL_SIZE_PX;

const DEFAULT_WEAPON_RANGE_CELLS = {
  fist: 1,
  dagger: 1,
  sword: 1,
  oneHandSword: 1,
  twoHandSword: 1,
  axe: 1,
  mace: 1,
  staff: 1,
  katar: 1,
  spear: 2,
  bow: 5
};

let weaponRangeConfigCache = null;

let positionEngineTimer = null;
let positionAutoSaveTimer = null;
let positionBeforeUnloadBound = false;
let lastSavedPositionSnapshot = "";
let autoNoTargetSince = null;
function resetAutoNoTargetTimer() { autoNoTargetSince = null; return true; }
function markAutoNoTargetNow() { autoNoTargetSince = Date.now(); return autoNoTargetSince; }
function getAutoNoTargetSince() { return Number(autoNoTargetSince || 0); }
window.resetAutoNoTargetTimer = resetAutoNoTargetTimer;
window.markAutoNoTargetNow = markAutoNoTargetNow;
window.getAutoNoTargetSince = getAutoNoTargetSince;
let lastMoveInputSignature = "";
let lastMoveInputAt = 0;
let lastPositionDebug = null;

const POSITION_DEBUG_OVERLAY_ENABLED = false; // V0.9.79D: 文字 overlay 預設關閉，避免遮住遊戲畫面
const POSITION_DEBUG_CROSS_ENABLED = false;   // V0.9.82EW: 正式版關閉人物腳底綠色座標十字
const POSITION_AUTO_SAVE_MS = 60 * 1000;

function clampPositionValue(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function randomPositionInBattleField(kind = "monster") {
  const bounds = getDynamicPositionBounds(kind);
  return {
    x: randomInt(Math.round(bounds.minX), Math.round(bounds.maxX)),
    y: randomInt(Math.round(bounds.minY), Math.round(bounds.maxY))
  };
}

function normalizePositionData() {
  if (!player) return;

  const bounds = getDynamicPositionBounds("player");
  const currentPos = clampPositionToBounds({
    x: player.position?.x ?? bounds.playerDefaultX,
    y: player.position?.y ?? bounds.playerDefaultY
  }, "player");
  const targetPos = (player.position?.targetX !== null && player.position?.targetX !== undefined && player.position?.targetY !== null && player.position?.targetY !== undefined)
    ? clampPositionToBounds({ x: player.position.targetX, y: player.position.targetY }, "player")
    : { x: null, y: null };

  player.position = {
    x: currentPos.x,
    y: currentPos.y,
    targetX: targetPos.x,
    targetY: targetPos.y,
    moveSpeed: getPlayerMovePixelsPerSecond()
  };

  if (!player.autoCombat) player.autoCombat = {};
  player.autoCombat.teleport = {
    enabled: player.autoCombat.teleport?.enabled ?? false,
    noTargetSeconds: 1,
    avoidBoss: player.autoCombat.teleport?.avoidBoss ?? false,
    avoidMvp: player.autoCombat.teleport?.avoidMvp ?? false,
    lowHpEnabled: player.autoCombat.teleport?.lowHpEnabled ?? false,
    lowHpPercent: Math.max(1, Math.min(99, Number(player.autoCombat.teleport?.lowHpPercent ?? 30))),
    returnHome: {
      enabled: player.autoCombat.teleport?.returnHome?.enabled ?? false,
      hpPercent: Math.max(1, Math.min(99, Number(player.autoCombat.teleport?.returnHome?.hpPercent ?? 10))),
      cityId: String(player.autoCombat.teleport?.returnHome?.cityId || "prontera")
    }
  };
}

function initPositionEngine() {
  normalizePositionData();
  bindBattleFieldMovement();
  renderPositionSprites();
  bindPositionAutoSave();

  if (!window.__roWebPositionResizeBound) {
    window.__roWebPositionResizeBound = true;
    const recalcPositionBounds = () => {
      normalizePositionData();
      if (currentMonster?.position) {
        const safeMonsterPos = clampPositionToBounds(currentMonster.position, "monster");
        currentMonster.position.x = safeMonsterPos.x;
        currentMonster.position.y = safeMonsterPos.y;
      }
      renderPositionSprites();
    };
    window.addEventListener("resize", recalcPositionBounds, { passive: true });
    window.addEventListener("orientationchange", () => setTimeout(recalcPositionBounds, 250), { passive: true });
    window.visualViewport?.addEventListener?.("resize", recalcPositionBounds, { passive: true });
    window.visualViewport?.addEventListener?.("scroll", recalcPositionBounds, { passive: true });
  }

  if (!positionEngineTimer) {
    positionEngineTimer = setInterval(() => {
      updatePositionMovement(0.05);
      if (currentMap?.monsterVisualTest && typeof updateWorldMonsterFieldTest === "function") updateWorldMonsterFieldTest(0.05);
      else updateMonsterMovement(0.05);
      renderPositionSprites();
    }, 50);
  }
}

function stopPositionEngine() {
  if (positionEngineTimer) { clearInterval(positionEngineTimer); positionEngineTimer = null; }
  if (positionAutoSaveTimer) { clearInterval(positionAutoSaveTimer); positionAutoSaveTimer = null; }
}
window.stopPositionEngine = stopPositionEngine;

function getPositionSaveSnapshot() {
  if (!player?.position) return "";
  return JSON.stringify({
    map: player.map || currentMap?.id || "",
    x: Math.round(Number(player.position.x || 0)),
    y: Math.round(Number(player.position.y || 0)),
    city: player.currentCity || null
  });
}

function savePositionIfChanged(options = {}) {
  if (!player || typeof saveGame !== "function") return;
  normalizePositionData();
  const snapshot = getPositionSaveSnapshot();
  if (!options.force && snapshot && snapshot === lastSavedPositionSnapshot) return;
  saveGame();
  lastSavedPositionSnapshot = snapshot;
}

function bindPositionAutoSave() {
  if (!positionAutoSaveTimer) {
    lastSavedPositionSnapshot = getPositionSaveSnapshot();
    positionAutoSaveTimer = setInterval(() => {
      savePositionIfChanged();
    }, POSITION_AUTO_SAVE_MS);
  }

  if (!positionBeforeUnloadBound) {
    positionBeforeUnloadBound = true;
    window.addEventListener("beforeunload", () => {
      savePositionIfChanged({ force: true });
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") savePositionIfChanged({ force: true });
    });
  }
}


function isPrimaryMoveInput(event) {
  if (!event) return false;
  if (event.type === "pointerdown") {
    // 只接受主要指標；避免 iPhone / Chrome 同時送 mouse-like pointer 造成兩筆 log。
    if (event.isPrimary === false) return false;
    if (event.button !== undefined && event.button !== 0) return false;
    return ["touch", "mouse", "pen", ""].includes(event.pointerType || "");
  }
  if (event.type === "touchstart") return true;
  if (event.type === "click") return true;
  return false;
}

function shouldAcceptMoveInput(event, pos) {
  const now = Date.now();
  const x = Math.round(Number(pos?.x || 0));
  const y = Math.round(Number(pos?.y || 0));
  const family = event?.pointerType || (event?.type?.startsWith?.("touch") ? "touch" : event?.type || "unknown");
  const signature = `${family}:${x}:${y}`;

  // 同一次手機點擊可能產生 pointerdown + touchstart/click，或因 capture/bubble 被重進。
  // 只要 650ms 內座標幾乎相同，就視為同一次移動命令。
  if (now - lastMoveInputAt < 650) {
    const prev = String(lastMoveInputSignature || "").split(":");
    const px = Number(prev[1]);
    const py = Number(prev[2]);
    if (Number.isFinite(px) && Number.isFinite(py) && Math.hypot(px - x, py - y) <= 8) {
      return false;
    }
  }

  lastMoveInputSignature = signature;
  lastMoveInputAt = now;
  return true;
}

function ensurePositionDebugOverlay() {
  if (!POSITION_DEBUG_OVERLAY_ENABLED) return null;
  const field = getBattleFieldElement();
  if (!field) return null;
  let el = document.getElementById("position-debug-overlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "position-debug-overlay";
    el.className = "position-debug-overlay";
    field.appendChild(el);
  }
  return el;
}

function updatePositionDebugOverlay(extra = {}) {
  if (!POSITION_DEBUG_OVERLAY_ENABLED) return;
  const el = ensurePositionDebugOverlay();
  const field = getBattleFieldElement();
  if (!el || !field) return;
  const rect = field.getBoundingClientRect();
  const p = player?.position || {};
  const playerEl = document.getElementById("player-sprite");
  const pr = playerEl?.getBoundingClientRect?.();
  const vv = getVisualViewportRectFallback();
  const logical = getFieldLogicalSize();
  const world = getCurrentMapWorldSize();
  const viewport = getViewportLogicalSize();
  const camera = getMapCameraOffset();
  const clientPoint = getLogicalPointClientPosition(p);
  lastPositionDebug = { ...lastPositionDebug, ...extra };
  el.textContent = [
    `Engine ${isWorldCameraEngineActive() ? "WORLD" : "FIELD"} | P ${Math.round(p.x || 0)},${Math.round(p.y || 0)} → T ${Math.round(p.targetX ?? -1)},${Math.round(p.targetY ?? -1)}`,
    `World ${Math.round(world.width)}×${Math.round(world.height)} | View ${Math.round(viewport.width)}×${Math.round(viewport.height)} | Cam ${Math.round(camera.x)},${Math.round(camera.y)}`,
    `Field L ${Math.round(logical.width)}x${Math.round(logical.height)} / R ${Math.round(rect.width)}x${Math.round(rect.height)}`,
    `Client ${Math.round(clientPoint?.x ?? -1)},${Math.round(clientPoint?.y ?? -1)} Sprite ${Math.round(pr?.left ?? -1)},${Math.round(pr?.top ?? -1)}`,
    `Layer ${field.dataset.appliedWorldCameraLayer || "none"} ${field.dataset.appliedWorldCameraTransform || "none"}`,
    lastPositionDebug?.tap ? `Tap ${lastPositionDebug.tap}` : ""
  ].filter(Boolean).join("\n");
}

function updatePositionDebugCross(pos = player?.position) {
  if (!POSITION_DEBUG_CROSS_ENABLED) return;
  const field = getBattleFieldElement();
  if (!field || !pos) return;
  let cross = document.getElementById("position-debug-cross");
  if (!cross) {
    cross = document.createElement("div");
    cross.id = "position-debug-cross";
    cross.className = "position-debug-cross";
    field.appendChild(cross);
  }
  const point = getLogicalPointClientPosition(pos);
  const fieldRect = field.getBoundingClientRect();
  if (!point) return;
  const x = Math.round(point.x - fieldRect.left);
  const y = Math.round(point.y - fieldRect.top);
  cross.style.left = `${x}px`;
  cross.style.top = `${y}px`;

  // V0.9.79F：十字旁顯示世界座標與 Reference Point，方便對照 RO Studio Anchor Preview。
  let label = cross.querySelector(".position-debug-cross-label");
  if (!label) {
    label = document.createElement("div");
    label.className = "position-debug-cross-label";
    cross.appendChild(label);
  }
  const wx = Math.round(Number(pos.x || 0));
  const wy = Math.round(Number(pos.y || 0));
  const anchor = typeof window.getROStudioPlayerAnchorRatio === "function" ? window.getROStudioPlayerAnchorRatio() : null;
  const anchorText = anchor ? ` / ref ${Math.round(anchor.rawX ?? 128)},${Math.round(anchor.rawY ?? 220)}` : "";
  label.textContent = `P ${wx},${wy}${anchorText}`;
}


// RO_WEB V0.9.78CF：座標小 UI 改掛在系統對話框右下，不再固定在左下角。
function updateMonsterPositionDebugCross(monster = currentMonster) {
  const field = getBattleFieldElement();
  let cross = document.getElementById("monster-position-debug-cross");
  if (!field || !monster?.position) { if (cross) cross.style.display="none"; return; }
  if (!cross) {
    cross=document.createElement("div");
    cross.id="monster-position-debug-cross";
    cross.className="monster-position-debug-cross";
    cross.innerHTML='<div class="monster-position-debug-label"></div>';
    field.appendChild(cross);
  }
  const point=getLogicalPointClientPosition(monster.position), rect=field.getBoundingClientRect();
  if (!point) return;
  cross.style.display="block";
  cross.style.left=`${Math.round(point.x-rect.left)}px`;
  cross.style.top=`${Math.round(point.y-rect.top)}px`;
  const label=cross.querySelector(".monster-position-debug-label");
  const a=typeof window.getROStudioMonsterAnchorRatio==="function"?window.getROStudioMonsterAnchorRatio():null;
  if (label) label.textContent=`M ${Math.round(monster.position.x)},${Math.round(monster.position.y)}${a?` / ref ${Math.round(a.rawX||0)},${Math.round(a.rawY||0)}`:""}`;
}
window.updateMonsterPositionDebugCross=updateMonsterPositionDebugCross;

function ensurePositionCoordinateUi() {
  const host = document.getElementById("battle-log") || document.body;
  let el = document.getElementById("position-coordinate-ui");
  if (!el) {
    el = document.createElement("div");
    el.id = "position-coordinate-ui";
    el.className = "position-coordinate-ui";
    el.innerHTML = `<span class="location-name">目前位置</span><span class="coord-label">座標</span><span class="coord-value">0, 0</span>`;
  }
  if (el.parentElement !== host) {
    host.appendChild(el);
  }
  return el;
}

function updatePositionCoordinateUi() {
  const el = ensurePositionCoordinateUi();
  if (!el || !player?.position) return;
  const p = player.position;
  const x = Math.round(Number(p.x || 0));
  const y = Math.round(Number(p.y || 0));
  const tx = (p.targetX !== null && p.targetX !== undefined) ? Math.round(Number(p.targetX)) : null;
  const ty = (p.targetY !== null && p.targetY !== undefined) ? Math.round(Number(p.targetY)) : null;
  const location = el.querySelector(".location-name");
  if (location) {
    const city = player?.currentCity && typeof getCityData === "function" ? getCityData(player.currentCity) : null;
    location.textContent = city?.displayName || city?.name || currentMap?.displayName || currentMap?.name || "未知地區";
  }
  const value = el.querySelector(".coord-value");
  if (value) {
    value.textContent = (tx !== null && ty !== null && (Math.abs(tx - x) > 2 || Math.abs(ty - y) > 2))
      ? `${x}, ${y} → ${tx}, ${ty}`
      : `${x}, ${y}`;
  }
}

function isPointerOnBlockedUi(target) {
  // V0.9.73：右側走不到的主因之一，是手機 UI 容器本身（top-bar / quick-buttons）
  // 佔住了右側可點擊區。全背景可走後，只阻擋真正可互動的按鈕、輸入框、彈窗、快捷格。
  // 金幣列、透明對話框、快捷按鈕容器空白處不再整片吃掉地圖點擊。
  return Boolean(target?.closest?.("button, input, select, textarea, .game-window, .fixed-panel, .quick-slot, .quick-slot-item, .dev-buttons"));
}

function getEventClientPoint(event) {
  const touch = event.touches?.[0] || event.changedTouches?.[0];
  const clientX = event.clientX ?? touch?.clientX;
  const clientY = event.clientY ?? touch?.clientY;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  return { clientX, clientY };
}

function getVisualViewportRectFallback() {
  const vv = window.visualViewport;
  if (vv && Number.isFinite(vv.width) && Number.isFinite(vv.height)) {
    return {
      left: Number(vv.offsetLeft || 0),
      top: Number(vv.offsetTop || 0),
      right: Number(vv.offsetLeft || 0) + Number(vv.width || 0),
      bottom: Number(vv.offsetTop || 0) + Number(vv.height || 0),
      width: Number(vv.width || 0),
      height: Number(vv.height || 0)
    };
  }
  return {
    left: 0,
    top: 0,
    right: window.innerWidth || document.documentElement.clientWidth || 1280,
    bottom: window.innerHeight || document.documentElement.clientHeight || 720,
    width: window.innerWidth || document.documentElement.clientWidth || 1280,
    height: window.innerHeight || document.documentElement.clientHeight || 720
  };
}

function getBattleFieldVisibleRect(field) {
  const rect = field.getBoundingClientRect();
  const vv = getVisualViewportRectFallback();

  // V0.9.73：iPhone Safari 底部網址列會讓 100vh / rect.height 大於實際可觸控高度。
  // 如果直接用完整 rect.height 換算，手指點到可視畫面最下方也只會換算到邏輯中下段，
  // 造成「下方走不到、越往下點偶爾反而往上」。因此手機觸控採用 battle-field 與
  // visualViewport 的交集作為實際可點擊矩形。
  const left = Math.max(rect.left, vv.left);
  const top = Math.max(rect.top, vv.top);
  const right = Math.min(rect.right, vv.right);
  const bottom = Math.min(rect.bottom, vv.bottom);
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);

  return { left, top, right, bottom, width, height };
}

function clampClientPointToRect(point, rect) {
  return {
    clientX: clampPositionValue(point.clientX, rect.left, rect.right),
    clientY: clampPositionValue(point.clientY, rect.top, rect.bottom)
  };
}

function getBattleFieldLocalPosition(event, field) {
  const point = getEventClientPoint(event);
  if (!point) return null;

  const fieldRect = field.getBoundingClientRect();
  const visibleRect = getBattleFieldVisibleRect(field);
  if (fieldRect.width <= 0 || fieldRect.height <= 0 || visibleRect.width <= 0 || visibleRect.height <= 0) return null;

  const viewport = getViewportLogicalSize();
  const camera = getMapCameraOffset();

  // V0.9.78W：World Camera Engine 只使用 battle-field 本身作為輸入平面。
  // 不再套用一般野外地圖的可視交集 Y 軸修正，避免手機直式時 target 像 sprite move 一樣偏掉。
  if (isWorldCameraEngineActive()) {
    const safeX = clampPositionValue(point.clientX, fieldRect.left, fieldRect.right);
    const safeY = clampPositionValue(point.clientY, fieldRect.top, fieldRect.bottom);
    const raw = {
      x: camera.x + ((safeX - fieldRect.left) / fieldRect.width) * viewport.width,
      y: camera.y + ((safeY - fieldRect.top) / fieldRect.height) * viewport.height
    };
    return clampPositionToBounds(raw, "player");
  }

  // 舊小地圖/城鎮移動暫時保留在非 world-camera 地圖，但 78U 主流程不再依賴它。
  const safeX = clampPositionValue(point.clientX, fieldRect.left, fieldRect.right);
  const safeY = clampPositionValue(point.clientY, visibleRect.top, visibleRect.bottom);
  const raw = {
    x: camera.x + ((safeX - fieldRect.left) / fieldRect.width) * viewport.width,
    y: camera.y + ((safeY - visibleRect.top) / visibleRect.height) * viewport.height
  };
  return clampPositionToBounds(raw, "player");
}

function bindBattleFieldMovement() {
  const field = document.getElementById("battle-field");
  if (!field || field.dataset.positionBound === "1") return;
  field.dataset.positionBound = "1";

  let lastTouchMoveRequestAt = 0;
  const handlePointerMoveRequest = (event, sourceField = field, options = {}) => {
    if (window.RO_WEB_UI_DRAG_ACTIVE) return;
    if (!isPrimaryMoveInput(event)) return;
    if (isPointerOnBlockedUi(event.target)) return;
    if (!player) return;
    if (player.currentCity && !isWorldCameraEngineActive()) return;

    const now = Date.now();
    if (event.type === "click" && now - lastTouchMoveRequestAt < 700) return;
    if (event.type === "touchstart" || event.pointerType === "touch") lastTouchMoveRequestAt = now;

    const pos = getBattleFieldLocalPosition(event, sourceField);
    if (!pos) return;
    if (!shouldAcceptMoveInput(event, pos)) {
      updatePositionDebugOverlay({ tap: `${options.source || event.type}/${event.pointerType || ""} duplicate ${Math.round(pos.x)},${Math.round(pos.y)}` });
      return;
    }

    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation?.();
    event.stopPropagation?.();

    // 0.9.82FO：點擊地面是玩家的手動指令。中止手動連擊，也短暫
    // 解除自動追擊目標，避免掛機路線立刻把角色拉回上一隻怪物。
    if (typeof stopManualMonsterAttack === "function") {
      stopManualMonsterAttack({ clearTarget: true, silent: true });
    }
    if (typeof isAutoBattleRunning === "function" && isAutoBattleRunning() && typeof clearAutoBattleTarget === "function") {
      clearAutoBattleTarget({ reason: "manual_ground_move", suppressMs: 650, updateUi: true });
    }

    // V0.9.78W：world-only。所有平台都只更新 player.position.target，交給 camera-follow render。
    if (!setPlayerMoveTarget(pos.x, pos.y)) {
      updatePositionDebugOverlay({ tap: `${options.source || event.type}/${event.pointerType || ""} casting movement locked` });
      return;
    }
    updatePositionCoordinateUi();
    updatePositionDebugOverlay({ tap: `${options.source || event.type}/${event.pointerType || ""} WorldEngine → ${Math.round(pos.x)},${Math.round(pos.y)}` });
  };

  // PC / PointerEvent 正常路線：保留 78J 原本 battle-field click → world-camera move。
  if (window.PointerEvent) {
    field.addEventListener("pointerdown", handlePointerMoveRequest, { passive: false, capture: true });
  } else {
    field.addEventListener("touchstart", handlePointerMoveRequest, { passive: false, capture: true });
    field.addEventListener("click", handlePointerMoveRequest, { passive: false, capture: true });
  }

  // V0.9.78W：手機保險入口，但只回到同一個 World Camera Engine。
  // 只在 world-camera 模式下，把落在 battle-field 可視範圍內的 touch/pointer/click
  // 轉回同一個 handlePointerMoveRequest，等於「手機假裝成 PC 點擊」。
  if (!window.__roWebWorldCameraPcFlowFallbackBound) {
    window.__roWebWorldCameraPcFlowFallbackBound = true;
    const handleWorldCameraPcFlowFallback = event => {
      const activeField = getBattleFieldElement();
      const isWorldMode = Boolean(currentMap?.worldCamera || activeField?.dataset?.worldCamera === "true" || activeField?.classList?.contains("world-camera-mode"));
      if (!isWorldMode || !activeField) return;
      if (event.target === activeField || activeField.contains(event.target)) return; // field 自己會走原本 PC 流程
      if (window.RO_WEB_UI_DRAG_ACTIVE || !isPrimaryMoveInput(event) || isPointerOnBlockedUi(event.target) || !player) return;
      if (player.currentCity && !isWorldCameraEngineActive()) return;

      const point = getEventClientPoint(event);
      if (!point) return;
      const rect = getBattleFieldVisibleRect(activeField);
      if (point.clientX < rect.left || point.clientX > rect.right || point.clientY < rect.top || point.clientY > rect.bottom) return;

      handlePointerMoveRequest(event, activeField, { source: "mobile→PC" });
    };
    document.addEventListener("pointerdown", handleWorldCameraPcFlowFallback, { passive: false, capture: true });
    document.addEventListener("touchstart", handleWorldCameraPcFlowFallback, { passive: false, capture: true });
    document.addEventListener("click", handleWorldCameraPcFlowFallback, { passive: false, capture: true });
  }
}

function setPlayerMoveTarget(x, y) {
  const activeBuffs = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
  if (Number(activeBuffs.movementLocked || 0) > 0) {
    if (typeof addBattleLog === "function") addBattleLog("目前的偽裝戰術等級無法移動。");
    return false;
  }
  if (typeof isRuntimeCastingMovementLocked === "function" && isRuntimeCastingMovementLocked()) {
    if (typeof notifyRuntimeCastMovementLocked === "function") notifyRuntimeCastMovementLocked();
    return false;
  }
  if (typeof isRuntimeSkillMovementDelayed === "function" && isRuntimeSkillMovementDelayed()) {
    if (typeof notifyRuntimeSkillMovementDelayed === "function") notifyRuntimeSkillMovementDelayed();
    return false;
  }
  normalizePositionData();
  const target = clampPositionToBounds({ x, y }, "player");
  player.position.targetX = target.x;
  player.position.targetY = target.y;
  if (typeof clearROStudioPlayerAttackMotionForMovement === "function") clearROStudioPlayerAttackMotionForMovement();
  player.state = autoBattleTimer ? "Moving" : "Move";
  updatePositionCoordinateUi();
  return true;
}

function updatePositionMovement(dt) {
  if (!player?.position) return;
  const activeBuffs = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
  if (Number(activeBuffs.movementLocked || 0) > 0) {
    player.position.targetX = null;
    player.position.targetY = null;
    player.state = "Idle";
    return;
  }
  if (typeof isRuntimeCastingMovementLocked === "function" && isRuntimeCastingMovementLocked()) {
    player.position.targetX = null;
    player.position.targetY = null;
    player.state = "Cast";
    return;
  }
  if (typeof isRuntimeSkillMovementDelayed === "function" && isRuntimeSkillMovementDelayed()) {
    player.position.targetX = null;
    player.position.targetY = null;
    player.state = "Idle";
    return;
  }
  const tx = player.position.targetX;
  const ty = player.position.targetY;
  if (tx === null || ty === null || tx === undefined || ty === undefined) return;

  const dx = tx - player.position.x;
  const dy = ty - player.position.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= 2) {
    player.position.x = tx;
    player.position.y = ty;
    player.position.targetX = null;
    player.position.targetY = null;
    if (!autoBattleTimer) player.state = "Idle";
    return;
  }

  player.position.moveSpeed = getPlayerMovePixelsPerSecond();
  const step = Math.max(1, Number(player.position.moveSpeed || ROWEB_MOVEMENT.defaultPixelsPerSecond) * dt);
  const ratio = Math.min(1, step / dist);
  const next = clampPositionToBounds({
    x: player.position.x + dx * ratio,
    y: player.position.y + dy * ratio
  }, "player");
  player.position.x = next.x;
  player.position.y = next.y;
  if (typeof createPropertyWalkTrailAt === "function") createPropertyWalkTrailAt({ x: player.position.x, y: player.position.y });
}

function distanceBetween(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(Number(a.x || 0) - Number(b.x || 0), Number(a.y || 0) - Number(b.y || 0));
}

function getPlayerPosition() {
  normalizePositionData();
  return { x: player.position.x, y: player.position.y };
}

function getMonsterPosition(monster = currentMonster) {
  if (!monster) return null;
  if (!monster.position) {
    monster.position = randomPositionInBattleField();
    monster.spawnPosition = { ...monster.position };
  }
  return monster.position;
}

function getCurrentDistanceToMonster(monster = currentMonster) {
  if (!player || !monster) return Infinity;
  return distanceBetween(getPlayerPosition(), getMonsterPosition(monster));
}

function getEquippedWeaponData() {
  const weaponId = player?.equipment?.weapon;
  return weaponId ? getItemData(weaponId) : null;
}

function getWeaponRangeConfig() {
  if (weaponRangeConfigCache) return weaponRangeConfigCache;
  const bundled = window.RO_WEB_DATA?.["data/weapon_types.json"] || window.RO_WEB_DATA?.weapon_types;
  weaponRangeConfigCache = bundled || { cellSizePx: POSITION_CELL_SIZE_PX, types: DEFAULT_WEAPON_RANGE_CELLS };
  if (!weaponRangeConfigCache.types) weaponRangeConfigCache.types = DEFAULT_WEAPON_RANGE_CELLS;
  return weaponRangeConfigCache;
}

function normalizeWeaponTypeName(rawType, weapon = null) {
  const raw = String(rawType || "").trim();
  const lower = raw.toLowerCase();
  const name = String(weapon?.name || "");

  if (lower.includes("bow") || name.includes("弓")) return "bow";
  if (lower.includes("spear") || name.includes("矛") || name.includes("槍")) return "spear";
  if (lower.includes("dagger") || name.includes("短劍") || name.includes("匕首")) return "dagger";
  if (lower.includes("katar") || name.includes("拳刃")) return "katar";
  if (lower.includes("knuckle") || name.includes("拳套")) return "knuckle";
  if (lower.includes("instrument") || name.includes("樂器")) return "instrument";
  if (lower.includes("whip") || name.includes("鞭")) return "whip";
  if (lower.includes("book") || name.includes("書")) return "book";
  if (lower.includes("staff") || name.includes("杖")) return "staff";
  if (lower.includes("axe") || name.includes("斧")) return "axe";
  if (lower.includes("mace") || lower.includes("hammer") || name.includes("鈍器") || name.includes("錘") || name.includes("棰")) return "mace";
  if ((lower.includes("two") || lower.startsWith("2h")) && lower.includes("sword")) return "twoHandSword";
  if (lower.includes("sword") || name.includes("劍")) return "sword";
  return raw || "fist";
}

function getSkillRangeConfig() {
  const bundled = window.RO_WEB_DATA?.["data/skill_range_config.json"] || window.RO_WEB_DATA?.skill_range_config;
  return bundled || {
    cellSizePx: POSITION_CELL_SIZE_PX,
    renewal: { skillRangeFromWeapon: false, serverBaseRangeCapCells: 14, screenWideRadiusCells: 999 }
  };
}

function cellsToPixels(cells) {
  const config = getSkillRangeConfig();
  const cellSize = Number(config.cellSizePx || POSITION_CELL_SIZE_PX || 36);
  const value = Number(cells);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value * cellSize);
}

function pixelsToCells(pixels) {
  const config = getSkillRangeConfig();
  const cellSize = Number(config.cellSizePx || POSITION_CELL_SIZE_PX || 36);
  return Math.max(0, Number(pixels || 0) / Math.max(1, cellSize));
}

function getPlayerNormalAttackRangeCells() {
  const weapon = getEquippedWeaponData();
  // V0.9.80U: DB_RE item_db_equip.yml 的每件武器 Range 是第一優先。
  // data/weapon_types.json 只作為沒有裝備 / 舊資料缺 Range 時的 fallback。
  const itemRange = weapon?.range ?? weapon?.Range ?? weapon?.attackRangeCells;
  if (itemRange !== undefined && itemRange !== null && itemRange !== "") {
    const passive = typeof getPassiveSkillBonusTotals === "function" ? getPassiveSkillBonusTotals() : {};
    return Math.max(1, Number(itemRange || 1) + Number(passive.attackRangeCells || 0));
  }
  const config = getWeaponRangeConfig();
  const type = normalizeWeaponTypeName(weapon?.weaponType || weapon?.dbSubType || weapon?.subCategory || weapon?.category, weapon);
  const data = config.types?.[type] ?? config.types?.fist ?? DEFAULT_WEAPON_RANGE_CELLS.fist;
  const cells = typeof data === "object" ? data.attackRangeCells : data;
  const passive = typeof getPassiveSkillBonusTotals === "function" ? getPassiveSkillBonusTotals() : {};
  return Math.max(1, Number(cells || 1) + Number(passive.attackRangeCells || 0));
}

function getPlayerNormalAttackRange() {
  return cellsToPixels(getPlayerNormalAttackRangeCells());
}

function getSkillRangeLevel(skill, requestedLevel = null) {
  const explicit = Number(requestedLevel);
  if (Number.isFinite(explicit) && explicit > 0) return Math.max(1, Math.floor(explicit));
  if (skill && typeof getSkillLevel === "function") {
    const learned = Number(getSkillLevel(skill.officialId ?? skill.id) || 0);
    if (Number.isFinite(learned) && learned > 0) return Math.max(1, Math.floor(learned));
  }
  return 1;
}

function getRaRangeLevelValue(raw, level = 1, fallback = null, valueKeys = ["Size", "Area", "Range", "Value"]) {
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (Number.isFinite(Number(raw))) return Number(raw);
  if (Array.isArray(raw)) {
    if (!raw.length) return fallback;
    if (raw.every(value => Number.isFinite(Number(value)))) {
      const index = Math.max(0, Math.min(raw.length - 1, Math.floor(Number(level || 1)) - 1));
      return Number(raw[index]);
    }
    const normalized = raw
      .filter(row => row && typeof row === "object")
      .map((row, index) => {
        const rowLevel = Number(row.Level ?? row.level ?? index + 1);
        let value = null;
        for (const key of valueKeys) {
          if (Number.isFinite(Number(row[key]))) { value = Number(row[key]); break; }
          const lowerKey = key.charAt(0).toLowerCase() + key.slice(1);
          if (Number.isFinite(Number(row[lowerKey]))) { value = Number(row[lowerKey]); break; }
        }
        return { level: Number.isFinite(rowLevel) ? rowLevel : index + 1, value };
      })
      .filter(row => Number.isFinite(row.value))
      .sort((a, b) => a.level - b.level);
    if (!normalized.length) return fallback;
    const targetLevel = Math.max(1, Number(level || 1));
    let selected = normalized[0].value;
    for (const row of normalized) {
      if (row.level > targetLevel) break;
      selected = row.value;
    }
    return selected;
  }
  if (typeof raw === "object") {
    const numericKeys = Object.keys(raw).filter(key => /^\d+$/.test(String(key))).map(Number).sort((a, b) => a - b);
    if (numericKeys.length) {
      const targetLevel = Math.max(1, Number(level || 1));
      const selectedKey = numericKeys.filter(key => key <= targetLevel).pop() ?? numericKeys[0];
      return getRaRangeLevelValue(raw[String(selectedKey)] ?? raw[selectedKey], level, fallback, valueKeys);
    }
    for (const key of valueKeys) {
      if (Number.isFinite(Number(raw[key]))) return Number(raw[key]);
      const lowerKey = key.charAt(0).toLowerCase() + key.slice(1);
      if (Number.isFinite(Number(raw[lowerKey]))) return Number(raw[lowerKey]);
    }
  }
  return fallback;
}

function getSkillBaseRangeCells(skill, requestedLevel = null) {
  if (!skill) return getPlayerNormalAttackRangeCells();
  const level = getSkillRangeLevel(skill, requestedLevel);
  const targetType = String(skill.targetType || skill.target || "").toLowerCase();
  const raw = skill.rangeCells ?? skill.attackRangeCells ?? skill.skillRangeCells ?? skill.range ?? skill.attackRange ?? skill.skillRange ?? skill.ai?.range;
  let baseRange = getRaRangeLevelValue(raw, level, null, ["Size", "Range", "Value"]);
  if (!Number.isFinite(Number(baseRange))) {
    if (targetType === "self" || targetType === "passive") return 0;
    return getPlayerNormalAttackRangeCells();
  }
  baseRange = Number(baseRange);
  if (baseRange < 0) {
    const config = getSkillRangeConfig();
    const useWeaponRange = config?.renewal?.skillRangeFromWeapon === true;
    baseRange = useWeaponRange ? getPlayerNormalAttackRangeCells() : Math.abs(baseRange);
  }
  const config = getSkillRangeConfig();
  const cap = Math.max(1, Number(config?.renewal?.serverBaseRangeCapCells || 14));
  if (baseRange > cap) baseRange = cap;
  return Math.max(0, baseRange);
}

function getSkillRangeBonusCells(skill) {
  if (!skill) return 0;
  const flags = skill.flags || {};
  const passive = typeof getPassiveSkillBonusTotals === "function" ? (getPassiveSkillBonusTotals() || {}) : {};
  let bonus = 0;
  if (flags.AlterRangeVulture === true) bonus += Number(passive.attackRangeCells || 0);
  if (flags.AlterRangeSnakeEye === true) bonus += Number(passive.snakeEyeRangeCells || 0);
  if (flags.AlterRangeRadius === true) bonus += Number(passive.warlockSkillRangeCells || 0);
  if (flags.AlterRangeResearchTrap === true) bonus += Number(passive.trapRangeCells || 0);
  if (flags.AlterRangeShadowJump === true) bonus += Number(passive.shadowJumpRangeCells || 0);
  return Math.max(0, bonus);
}

function getSkillRangeCells(skill, requestedLevel = null) {
  return Math.max(0, getSkillBaseRangeCells(skill, requestedLevel) + getSkillRangeBonusCells(skill));
}

function getSkillRangePx(skill, requestedLevel = null) {
  return cellsToPixels(getSkillRangeCells(skill, requestedLevel));
}

function getSkillEffectRadiusCells(skill, requestedLevel = null) {
  if (!skill) return 0;
  const level = getSkillRangeLevel(skill, requestedLevel);
  const profile = typeof getSkillRuntimeProfile === "function" ? (getSkillRuntimeProfile(skill) || {}) : (skill.runtimeProfile || {});
  const targeting = profile.targeting || profile.area || {};
  const profileRadius = getRaRangeLevelValue(targeting.radius ?? targeting.rangeCells, level, null, ["Area", "Size", "Range", "Value"]);
  if (Number.isFinite(Number(profileRadius))) return Math.max(0, Number(profileRadius));
  const splash = getRaRangeLevelValue(skill.splashArea, level, null, ["Area", "Size", "Range", "Value"]);
  if (Number.isFinite(Number(splash))) {
    if (Number(splash) < 0) return Math.max(1, Number(getSkillRangeConfig()?.renewal?.screenWideRadiusCells || 999));
    return Math.max(0, Number(splash));
  }
  const unitRange = getRaRangeLevelValue(skill.unit?.Range ?? skill.unit?.range, level, null, ["Range", "Size", "Area", "Value"]);
  if (Number.isFinite(Number(unitRange))) return Math.max(0, Number(unitRange));
  return 0;
}

function getSkillEffectDiameterCells(skill, requestedLevel = null) {
  const radius = getSkillEffectRadiusCells(skill, requestedLevel);
  if (!Number.isFinite(radius) || radius >= 999) return radius;
  return radius * 2 + 1;
}

function getSkillDistanceProfile(skill, requestedLevel = null) {
  const level = getSkillRangeLevel(skill, requestedLevel);
  const castRangeCells = getSkillRangeCells(skill, level);
  const effectRadiusCells = getSkillEffectRadiusCells(skill, level);
  return {
    skillId: Number(skill?.officialId ?? skill?.id ?? 0),
    level,
    targetType: String(skill?.targetType || skill?.target || "Passive"),
    cellSizePx: Number(getSkillRangeConfig()?.cellSizePx || POSITION_CELL_SIZE_PX || 36),
    baseCastRangeCells: getSkillBaseRangeCells(skill, level),
    rangeBonusCells: getSkillRangeBonusCells(skill),
    castRangeCells,
    castRangePx: cellsToPixels(castRangeCells),
    effectRadiusCells,
    effectRadiusPx: cellsToPixels(effectRadiusCells),
    effectDiameterCells: getSkillEffectDiameterCells(skill, level)
  };
}

function canUseSkillOnTarget(skill, requestedLevel = null, target = currentMonster, origin = player) {
  if (!skill || !target || !origin) return false;
  const targetType = String(skill.targetType || skill.target || "").toLowerCase();
  if (targetType === "self" || targetType === "passive") return true;
  const originPosition = origin === player ? getPlayerPosition() : (origin.position || origin);
  const targetPosition = target === currentMonster ? getMonsterPosition(target) : (target.position || target);
  if (!originPosition || !targetPosition) return false;
  return distanceBetween(originPosition, targetPosition) <= getSkillRangePx(skill, requestedLevel);
}

window.getSkillRangeConfig = getSkillRangeConfig;
window.cellsToPixels = cellsToPixels;
window.pixelsToCells = pixelsToCells;
window.getRaRangeLevelValue = getRaRangeLevelValue;
window.getSkillBaseRangeCells = getSkillBaseRangeCells;
window.getSkillRangeBonusCells = getSkillRangeBonusCells;
window.getSkillRangeCells = getSkillRangeCells;
window.getSkillRangePx = getSkillRangePx;
window.getSkillEffectRadiusCells = getSkillEffectRadiusCells;
window.getSkillEffectDiameterCells = getSkillEffectDiameterCells;
window.getSkillDistanceProfile = getSkillDistanceProfile;
window.canUseSkillOnTarget = canUseSkillOnTarget;

function stopPlayerCombatMovementForAttack(monster = currentMonster) {
  if (!player?.position) return;
  player.position.targetX = null;
  player.position.targetY = null;
  if (monster?.position) {
    player.state = "Attacking";
  } else if (player.state === "Approaching" || player.state === "Moving" || player.state === "Move") {
    player.state = "Idle";
  }
  if (typeof updatePositionCoordinateUi === "function") updatePositionCoordinateUi();
}

function canAttackMonsterByRange(monster = currentMonster, rangePx = null) {
  if (!monster) return false;
  const attackRange = Number(rangePx ?? getPlayerNormalAttackRange());
  return getCurrentDistanceToMonster(monster) <= attackRange;
}

// 舊名稱保留給 battle.js / auto_battle.js 呼叫，但內部統一走 Position Engine。 
function isInPlayerAttackRange(monster = currentMonster, range = null) {
  return canAttackMonsterByRange(monster, range);
}

function getMonsterAttackRangePx(monster = currentMonster) {
  const raw = monster?.AttackRange ?? monster?.attackRange ?? monster?.attack_range;
  if (raw !== undefined && raw !== null) return Math.max(55, Number(raw) * 36);
  return 55;
}

function getMonsterViewRangePx(monster = currentMonster) {
  const raw = monster?.SkillRange ?? monster?.skillRange ?? monster?.viewRange ?? monster?.view_range;
  if (raw !== undefined && raw !== null) return Math.max(getMonsterAttackRangePx(monster), Number(raw) * 36);
  return 360;
}
function getMonsterChaseRangePx(monster = currentMonster) {
  const raw = monster?.ChaseRange ?? monster?.chaseRange ?? monster?.chase_range;
  if (raw !== undefined && raw !== null) return Math.max(160, Number(raw) * 36);
  return 432;
}
function getMonsterRetaliationChaseRangePx(monster = currentMonster) {
  let minCells = 24;
  try { minCells = Number(getWorldMonsterRuntimeValves?.().retaliationChaseMinCells ?? minCells); } catch (_) {}
  return Math.max(getMonsterChaseRangePx(monster), Math.max(1, minCells) * 36);
}
window.getMonsterViewRangePx = getMonsterViewRangePx;
window.getMonsterRetaliationChaseRangePx = getMonsterRetaliationChaseRangePx;

function getMonsterMoveSpeedPx(monster = currentMonster) {
  // RA WalkSpeed：數值越小越快；此函式保留舊名稱供其他模組呼叫。
  return getMonsterMovePixelsPerSecond(monster);
}

// 0.9.82FM：自動近戰追逐移動怪物時使用短距離預判與命中容差。
function isMonsterMovingForAutoChase(monster = currentMonster) {
  const state = String(monster?.aiState || "").toUpperCase();
  return ["WANDER", "CHASE", "RUSH", "MOVING"].includes(state) || !!monster?._wanderTarget;
}
function getAutoBattleEffectiveAttackRange(monster = currentMonster, baseRangePx = null) {
  const range = Math.max(1, Number(baseRangePx ?? getPlayerNormalAttackRange()));
  const autoRunning = typeof isAutoBattleRunning === "function" ? isAutoBattleRunning() : false;
  if (!autoRunning || range > 72 || !isMonsterMovingForAutoChase(monster)) return range;
  return range + 24;
}
function getPredictedMonsterChasePosition(monster = currentMonster) {
  const pos = getMonsterPosition(monster);
  if (!pos || !isMonsterMovingForAutoChase(monster)) return pos;
  const state = String(monster?.aiState || "").toUpperCase();
  const target = monster?._wanderTarget || (["CHASE", "RUSH"].includes(state) ? getPlayerPosition() : null);
  if (!target) return pos;
  const dx = Number(target.x || 0) - Number(pos.x || 0);
  const dy = Number(target.y || 0) - Number(pos.y || 0);
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return pos;
  const speed = Math.max(20, Number(getMonsterMovePixelsPerSecond(monster) || 80));
  const lead = Math.min(72, distance, speed * 0.28);
  return { x:Number(pos.x || 0) + dx / distance * lead, y:Number(pos.y || 0) + dy / distance * lead };
}
window.isMonsterMovingForAutoChase = isMonsterMovingForAutoChase;
window.getAutoBattleEffectiveAttackRange = getAutoBattleEffectiveAttackRange;
window.getPredictedMonsterChasePosition = getPredictedMonsterChasePosition;

function movePlayerTowardMonster(monster = currentMonster, desiredRange = null) {
  if (!monster || !player?.position) return false;
  const baseMonsterPos = getMonsterPosition(monster);
  const autoRunning = typeof isAutoBattleRunning === "function" ? isAutoBattleRunning() : false;
  const monsterPos = autoRunning ? getPredictedMonsterChasePosition(monster) : baseMonsterPos;
  const playerPos = getPlayerPosition();
  const range = desiredRange ?? getPlayerNormalAttackRange();
  const dist = distanceBetween(playerPos, monsterPos);
  if (dist <= range * 0.86) {
    stopPlayerCombatMovementForAttack(monster);
    return true;
  }

  const stopDistance = Math.max(34, range * 0.78);
  const dx = playerPos.x - monsterPos.x;
  const dy = playerPos.y - monsterPos.y;
  const safeDist = Math.max(1, Math.hypot(dx, dy));
  const targetX = monsterPos.x + (dx / safeDist) * stopDistance;
  const targetY = monsterPos.y + (dy / safeDist) * stopDistance;
  setPlayerMoveTarget(targetX, targetY);
  player.state = "Approaching";
  return false;
}

function movePlayerAdjacentToMonster(monster = currentMonster) {
  if (!monster || !player?.position) return false;
  const monsterPos = getMonsterPosition(monster);
  const playerPos = getPlayerPosition();
  let dx = Number(playerPos.x || 0) - Number(monsterPos.x || 0);
  let dy = Number(playerPos.y || 0) - Number(monsterPos.y || 0);
  let length = Math.hypot(dx, dy);
  if (length < 1) { dx = -1; dy = 0; length = 1; }
  const stopDistance = Math.max(24, POSITION_CELL_SIZE_PX * 0.78);
  const safe = clampPositionToBounds({
    x: Number(monsterPos.x || 0) + dx / length * stopDistance,
    y: Number(monsterPos.y || 0) + dy / length * stopDistance
  }, "player");
  player.position.x = safe.x;
  player.position.y = safe.y;
  player.position.targetX = null;
  player.position.targetY = null;
  player.state = "Attacking";
  renderPositionSprites();
  if (typeof updatePositionCoordinateUi === "function") updatePositionCoordinateUi();
  return true;
}

function updateMonsterMovement(dt) {
  if (!currentMonster || !currentMonster.position || !player || player.currentCity) return;
  const monster = currentMonster;
  const behavior = getMonsterAiBehavior(monster);
  const runtimeControl=typeof getMonsterRuntimeBonuses==="function"?getMonsterRuntimeBonuses(monster):{};
  if (Number(runtimeControl.rooted||0)>0 || window.StatusManager?.has(monster, "closeconfine") || window.StatusManager?.has(monster, "magneticfield")) { monster.aiState = "ROOTED"; return; }
  if (!behavior.canMove) { monster.aiState = "IDLE"; return; }
  const distance = getCurrentDistanceToMonster(monster);
  const attackRange = getMonsterAttackRangePx(monster);
  const viewRange = getMonsterViewRangePx(monster);
  const chaseRange = monster.provoked ? getMonsterRetaliationChaseRangePx(monster) : getMonsterChaseRangePx(monster);
  if (!monster.provoked && behavior.aggressive && distance <= viewRange) {
    monster.provoked = true;
    monster._aggroReason = "aggressive";
    monster._aggroSince = Date.now();
  }
  const castState = typeof getRuntimeSkillCastState === "function" ? getRuntimeSkillCastState() : null;
  if (!monster.provoked && behavior.castSensorIdle && castState?.active !== false && distance <= viewRange) {
    monster.provoked = true;
    monster._aggroReason = "cast_sensor";
    monster._aggroSince = Date.now();
  }
  const engaged = Boolean(monster.provoked);

  if (engaged && distance <= attackRange) {
    monster.aiState = "ATTACK";
    if (behavior.canAttack && typeof monsterAttackPlayer === "function") monsterAttackPlayer({ respectCooldown:true, source:"active_ai" });
    return;
  }
  if (engaged && distance <= chaseRange) {
    monster.aiState = monster._aggroReason === "damage" ? "RUSH" : "CHASE";
    moveMonsterToward(monster, getPlayerPosition(), dt, attackRange * 0.86);
    return;
  }
  updateMonsterRandomWalk(monster, dt, behavior);
}

function updateMonsterRandomWalk(monster, dt, behavior = getMonsterAiBehavior(monster)) {
  if (!behavior.canMove || !behavior.randomWalk) { monster.aiState="IDLE"; return; }
  const now=Date.now();
  const pos=getMonsterPosition(monster);
  let target=monster._wanderTarget;
  if (target && distanceBetween(pos,target) < 8) target=null;
  if (!target && now >= Number(monster._nextWanderAt||0)) {
    const origin=monster.spawnPosition||pos;
    const angle=Math.random()*Math.PI*2;
    const radius=80+Math.random()*180;
    target=clampPositionToBounds({x:Number(origin.x||0)+Math.cos(angle)*radius,y:Number(origin.y||0)+Math.sin(angle)*radius},"monster");
    monster._wanderTarget=target;
    monster._nextWanderAt=now+1800+Math.random()*2600;
  }
  if (target && now < Number(monster._nextWanderAt||0)-500) {
    monster.aiState="WANDER";
    moveMonsterToward(monster,target,dt,2);
  } else monster.aiState="IDLE";
}

function moveMonsterToward(monster, target, dt, stopDistance = 50) {
  const pos = getMonsterPosition(monster);
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= stopDistance) return;
  const step = getMonsterMoveSpeedPx(monster) * dt;
  const ratio = Math.min(1, step / Math.max(1, dist - stopDistance));
  const next = clampPositionToBounds({ x: pos.x + dx * ratio, y: pos.y + dy * ratio }, "monster");
  pos.x = next.x;
  pos.y = next.y;
}

function assignMonsterSpawnPosition(monster) {
  let pos;
  if (currentMap?.monsterVisualTest && player?.position) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 260 + Math.random() * 180;
    pos = clampPositionToBounds({ x:Number(player.position.x||0)+Math.cos(angle)*radius, y:Number(player.position.y||0)+Math.sin(angle)*radius }, "monster");
  } else pos = randomPositionInBattleField("monster");
  // 避免貼臉出生，盡量讓玩家先看到靠近/遠距差異。
  if (player?.position && distanceBetween(player.position, pos) < 180) {
    const shifted = clampPositionToBounds({ x: pos.x + 220, y: pos.y }, "monster");
    pos.x = shifted.x;
    pos.y = shifted.y;
  }
  monster.position = pos;
  monster.spawnPosition = { ...pos };
  monster.aiState = "IDLE";
}

function getSpriteAnchorOffset(element, kind = "player") {
  if (!element) return { x: 0, y: 0 };
  const width = Number(element.offsetWidth || (kind === "monster" ? 150 : 220));
  const height = Number(element.offsetHeight || (kind === "monster" ? 170 : 250));
  let ratio = { x: 0.5, y: kind === "monster" ? 0.82 : 0.86 };

  // V0.9.79F：玩家使用 RO Studio Atlas 時，位置錨點改讀 JSON anchor。
  // 若舊 V59 JSON 沒有 anchor，Runtime 預設 128,220 / 256，等同官方 Reference Point。
  if (kind === "player" && typeof window.getROStudioPlayerAnchorRatio === "function") {
    const atlasRatio = window.getROStudioPlayerAnchorRatio();
    if (atlasRatio && Number.isFinite(atlasRatio.x) && Number.isFinite(atlasRatio.y)) ratio = atlasRatio;
  }
  if (kind === "monster" && typeof window.getROStudioMonsterAnchorRatio === "function") {
    const atlasRatio = window.getROStudioMonsterAnchorRatio();
    if (atlasRatio && Number.isFinite(atlasRatio.x) && Number.isFinite(atlasRatio.y)) ratio = atlasRatio;
  }

  return {
    x: width * ratio.x,
    y: height * ratio.y
  };
}

function getLogicalPointClientPosition(pos) {
  const field = getBattleFieldElement();
  if (!field || !pos) return null;
  const rect = field.getBoundingClientRect();
  const viewport = getViewportLogicalSize();
  const camera = getMapCameraOffset();
  const screenX = Number(pos.x || 0) - camera.x;
  const screenY = Number(pos.y || 0) - camera.y;
  return {
    x: rect.left + (screenX / viewport.width) * rect.width,
    y: rect.top + (screenY / viewport.height) * rect.height
  };
}

function getUiFadeElements() {
  return [
    document.getElementById("player-info"),
    document.getElementById("top-bar"),
    document.getElementById("quick-buttons"),
    document.getElementById("battle-log"),
    document.getElementById("quick-slot-bar"),
    document.getElementById("auto-battle-area"),
    document.querySelector(".dev-buttons"),
    ...Array.from(document.querySelectorAll(".game-window:not(.hidden-window)"))
  ].filter(Boolean);
}

function getPlayerFadeClientPoint() {
  // V0.9.78X：UI 透明判定改優先吃「實際畫面上的 player-sprite 腳底」。
  // 78W 之後城鎮 / 大地圖可能由 camera layer translate 或 city sprite 校正決定視覺位置，
  // 若只用 player.position 反推 client 座標，會在城鎮右側站位或 camera render 後吃到舊座標。
  const playerEl = document.getElementById("player-sprite");
  const rect = playerEl?.getBoundingClientRect?.();
  const style = playerEl ? window.getComputedStyle?.(playerEl) : null;
  if (rect && rect.width > 0 && rect.height > 0 && style?.display !== "none" && style?.visibility !== "hidden") {
    const ratio = getSpriteAnchorRatio("player");
    return {
      x: rect.left + rect.width * ratio.x,
      y: rect.top + rect.height * ratio.y
    };
  }
  return getLogicalPointClientPosition(player?.position);
}

function updateUiFadeForPosition() {
  const point = getPlayerFadeClientPoint();
  const elements = getUiFadeElements();
  if (!point) {
    elements.forEach(el => el.classList.remove("ui-under-player"));
    return;
  }

  // V0.9.72f / 78X：UI Fade 改用「玩家實際腳底 1 Cell 的小判定框」與 UI 實際 DOM 矩形相交。
  // 不再使用很大的放大半徑，避免右側 / 下方 UI 在角色還很遠時就透明；
  // 同時讓左側 / 上方 / 彈窗都用同一套判定，不再有方向差異。
  const halfCell = Math.max(6, POSITION_CELL_SIZE_PX * 0.33);
  const footRect = {
    left: point.x - halfCell,
    right: point.x + halfCell,
    top: point.y - halfCell,
    bottom: point.y + halfCell
  };

  elements.forEach(el => {
    const style = window.getComputedStyle?.(el);
    const rect = el.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0 &&
      style?.display !== "none" && style?.visibility !== "hidden";
    const overlaps = isVisible &&
      footRect.right >= rect.left &&
      footRect.left <= rect.right &&
      footRect.bottom >= rect.top &&
      footRect.top <= rect.bottom;
    el.classList.toggle("ui-under-player", overlaps);
  });
}

function getFieldClientScale() {
  const field = getBattleFieldElement();
  const rect = field?.getBoundingClientRect?.();
  const viewport = getViewportLogicalSize();
  const isWorldMode = Boolean(currentMap?.worldCamera || field?.dataset?.worldCamera === "true" || field?.classList?.contains("world-camera-mode"));
  // V0.9.78T：大地圖座標系是 camera viewport（通常 1280×720），不是手機 DOM 寬高。
  // 手機版若用 field.offsetWidth 當 logicalWidth，角色會被畫到右側，camera-follow 看起來失效。
  const logicalWidth = isWorldMode ? viewport.width : (field?.offsetWidth || 1280);
  const logicalHeight = isWorldMode ? viewport.height : (field?.offsetHeight || 720);
  return {
    x: rect?.width ? rect.width / Math.max(1, logicalWidth) : 1,
    y: rect?.height ? rect.height / Math.max(1, logicalHeight) : 1
  };
}

function getSpriteAnchorRatio(kind = "player") {
  if (kind === "player" && typeof window.getROStudioPlayerAnchorRatio === "function") {
    const atlasRatio = window.getROStudioPlayerAnchorRatio();
    if (atlasRatio && Number.isFinite(atlasRatio.x) && Number.isFinite(atlasRatio.y)) return atlasRatio;
  }
  if (kind === "monster" && typeof window.getROStudioMonsterAnchorRatio === "function") {
    const atlasRatio = window.getROStudioMonsterAnchorRatio();
    if (atlasRatio && Number.isFinite(atlasRatio.x) && Number.isFinite(atlasRatio.y)) return atlasRatio;
  }
  return {
    x: 0.5,
    y: kind === "monster" ? 0.82 : 0.86
  };
}

function placeSpriteByFootPosition(element, pos, kind = "player") {
  if (!element || !pos) return;

  const field = getBattleFieldElement();
  const anchor = getSpriteAnchorOffset(element, kind);
  const camera = getMapCameraOffset();
  const viewport = getViewportLogicalSize();
  const isWorldMode = Boolean(currentMap?.worldCamera || field?.dataset?.worldCamera === "true" || field?.classList?.contains("world-camera-mode"));

  if (isWorldMode && field) {
    // V0.9.78W：world viewport 已等於實際可視畫面，世界不縮放。
    // 因此 sprite 畫面座標就是 world position - camera offset。
    const screenX = Number(pos.x || 0) - camera.x;
    const screenY = Number(pos.y || 0) - camera.y;
    element.style.setProperty("left", `${Math.round(screenX - anchor.x)}px`, "important");
    element.style.setProperty("top", `${Math.round(screenY - anchor.y)}px`, "important");
    return;
  } else {
    element.style.setProperty("left", `${Math.round(Number(pos.x || 0) - camera.x - anchor.x)}px`, "important");
    element.style.setProperty("top", `${Math.round(Number(pos.y || 0) - camera.y - anchor.y)}px`, "important");
  }

  // V0.9.72g / 78T：用實際 client 位置反校正，避免 CSS zoom / mobile viewport 造成腳底偏移。
  const targetClient = getLogicalPointClientPosition(pos);
  const rect = element.getBoundingClientRect?.();
  if (!targetClient || !rect || rect.width <= 0 || rect.height <= 0) return;

  const ratio = getSpriteAnchorRatio(kind);
  const actualClient = {
    x: rect.left + rect.width * ratio.x,
    y: rect.top + rect.height * ratio.y
  };
  const fieldScale = getFieldClientScale();
  const dx = (targetClient.x - actualClient.x) / Math.max(0.01, fieldScale.x);
  const dy = (targetClient.y - actualClient.y) / Math.max(0.01, fieldScale.y);

  if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
    const currentLeft = parseFloat(element.style.left) || 0;
    const currentTop = parseFloat(element.style.top) || 0;
    element.style.setProperty("left", `${Math.round(currentLeft + dx)}px`, "important");
    element.style.setProperty("top", `${Math.round(currentTop + dy)}px`, "important");
  }
}


function resetFieldPlayerSpriteStyle() {
  const field = getBattleFieldElement();
  const playerEl = document.getElementById("player-sprite");
  const playerImage = document.getElementById("playerImage");
  if (!field || !playerEl) return;
  field.classList.remove("city-mode");
  if (window.RO_STUDIO_PLAYER_ATLAS?.ready) { field.dataset.atlasActive = "true"; playerEl.dataset.atlasActive = "true"; }
  ["width", "height", "min-width", "min-height", "z-index"].forEach(name => playerEl.style.removeProperty(name));
  if (playerImage) {
    ["left", "top", "width", "height", "max-width", "max-height", "visibility", "opacity"].forEach(name => playerImage.style.removeProperty(name));
    playerImage.removeAttribute("data-ro-portrait-lock");
    // V0.9.80K：離開城鎮後，真正顯示交給 RO Studio atlas canvas，舊 img 只當尺寸參考，避免騎士/舊圖殘影。
    if (window.RO_STUDIO_PLAYER_ATLAS?.ready) {
      playerImage.style.setProperty("visibility", "hidden", "important");
      playerImage.style.setProperty("opacity", "0", "important");
    }
  }
  const atlasCanvas = document.getElementById("playerAtlasCanvas");
  if (atlasCanvas && window.RO_STUDIO_PLAYER_ATLAS?.ready) {
    atlasCanvas.style.setProperty("display", "block", "important");
    atlasCanvas.style.setProperty("visibility", "visible", "important");
    atlasCanvas.style.setProperty("opacity", "1", "important");
  }
}

function renderPositionSprites() {
  // V0.9.78W：未來主流程改為大地圖常駐；world-camera 時禁止進入一般野外／城鎮 sprite 定位。
  if (player?.currentCity && !isWorldCameraEngineActive()) {
    renderCityPlayerSprite();
    updateUiFadeForPosition();
    updatePositionDebugOverlay({ engine: "city-disabled" });
    return;
  }

  resetFieldPlayerSpriteStyle();
  const monsterElForField = document.getElementById("monster-sprite");
  if (monsterElForField) monsterElForField.style.display = "";

  applyLargeMapCamera();
  if (player?.position) {
    const safePlayerPos = clampPositionToBounds(player.position, "player");
    player.position.x = safePlayerPos.x;
    player.position.y = safePlayerPos.y;
    const playerEl = document.getElementById("player-sprite");
    if (playerEl) {
      // Position 座標為腳底中心；圖片本體可覆蓋 UI，但不再縮小可走範圍。
      placeSpriteByFootPosition(playerEl, player.position, "player");
    }
  }

  const monsterEl = document.getElementById("monster-sprite");
  if (!currentMap?.monsterVisualTest && monsterEl && currentMonster?.position) {
    const safeMonsterPos = clampPositionToBounds(currentMonster.position, "monster");
    currentMonster.position.x = safeMonsterPos.x;
    currentMonster.position.y = safeMonsterPos.y;
    placeSpriteByFootPosition(monsterEl, currentMonster.position, "monster");
    monsterEl.dataset.aiState = currentMonster.aiState || "IDLE";
  }
  if (currentMap?.monsterVisualTest && typeof renderWorldMonsterFieldTest === "function") renderWorldMonsterFieldTest();
  updateUiFadeForPosition();
  updatePositionCoordinateUi();
  updatePositionDebugCross(player?.position);
  if (!currentMap?.monsterVisualTest) updateMonsterPositionDebugCross(currentMonster);
  updatePositionDebugOverlay();
}

function countInventoryItem(itemId) {
  const inv = findInventoryItemById(itemId);
  return Number(inv?.count || 0);
}

function addInventoryItemCount(itemId, count) {
  if (!player) return;
  const normalized = normalizeItemId(itemId);
  const existing = findInventoryItemById(normalized);
  if (existing) {
    existing.count = Number(existing.count || 0) + Number(count || 0);
  } else {
    player.inventory.push({ id: normalized, count: Number(count || 0) });
  }
}

function consumeInventoryItemCount(itemId, count = 1) {
  const inv = findInventoryItemById(itemId);
  if (!inv || Number(inv.count || 0) < count) return false;
  inv.count = Number(inv.count || 0) - count;
  if (inv.count <= 0) player.inventory = player.inventory.filter(item => String(item.id) !== String(itemId));
  return true;
}

function useFlyWing(options = {}) {
  if (!player) return false;
  if (player.currentCity) {
    if (!options.silent) addBattleLog("城鎮內暫不使用蒼蠅翅膀。");
    return false;
  }
  if (countInventoryItem(FLY_WING_ITEM_ID) <= 0) {
    if (!options.silent) addBattleLog("沒有蒼蠅翅膀，無法瞬移。");
    return false;
  }

  consumeInventoryItemCount(FLY_WING_ITEM_ID, 1);
  const previousTarget = currentMonster || null;
  const pos = randomPositionInBattleField("player");
  normalizePositionData();
  const safePos = clampPositionToBounds(pos, "player");
  player.position.x = safePos.x;
  player.position.y = safePos.y;
  player.position.targetX = null;
  player.position.targetY = null;
  if (previousTarget) previousTarget.aiState = "IDLE";
  if (typeof onAutoBattleTeleportCompleted === "function") onAutoBattleTeleportCompleted(previousTarget, { source:"fly_wing" });
  else currentMonster = null;
  renderPositionSprites();
  updateInventoryUI();
  saveGame();
  addBattleLog(`使用蒼蠅翅膀，瞬移到 (${Math.round(pos.x)}, ${Math.round(pos.y)})。剩餘 ${countInventoryItem(FLY_WING_ITEM_ID)} 個。`);
  return true;
}

function useButterflyWing(options = {}) {
  if (!player) return false;
  if (player.currentCity) {
    if (!options.silent && typeof addBattleLog === "function") addBattleLog("目前已在城鎮內。");
    return false;
  }
  if (countInventoryItem(BUTTERFLY_WING_ITEM_ID) <= 0) {
    if (!options.silent && typeof addBattleLog === "function") addBattleLog("沒有蝴蝶翅膀，無法返回城鎮。");
    return false;
  }
  const requestedCityId = String(options.cityId || "prontera");
  const city = typeof getCityData === "function"
    ? (getCityData(requestedCityId) || getCityData("prontera") || (typeof cities !== "undefined" && Array.isArray(cities) ? cities[0] : null))
    : null;
  if (!city || typeof enterCity !== "function") {
    if (!options.silent && typeof addBattleLog === "function") addBattleLog("找不到可返回的城鎮。");
    return false;
  }

  consumeInventoryItemCount(BUTTERFLY_WING_ITEM_ID, 1);
  const previousTarget = currentMonster || null;
  if (typeof onAutoBattleTeleportCompleted === "function") onAutoBattleTeleportCompleted(previousTarget, { source:"butterfly_wing", ignoreMs:1500 });
  else currentMonster = null;
  if (typeof updateInventoryUI === "function") updateInventoryUI();
  enterCity(city.id);
  if (!options.silent && typeof addBattleLog === "function") {
    addBattleLog(`使用蝴蝶翅膀返回 ${city.name}。剩餘 ${countInventoryItem(BUTTERFLY_WING_ITEM_ID)} 個。`);
  }
  if (typeof saveGame === "function") saveGame();
  return true;
}
window.useButterflyWing = useButterflyWing;

function maybeAutoTeleportWhenNoTarget() {
  if (!player?.autoCombat?.teleport?.enabled) return false;
  // 0.9.82FL：只打指定怪物但尚未勾選任何目標時，停在原地等待，
  // 不可每秒浪費蒼蠅翅膀。
  if (typeof canAutoBattleSearchForConfiguredTargets === "function" && !canAutoBattleSearchForConfiguredTargets()) {
    resetAutoNoTargetTimer();
    return false;
  }
  const validTarget = typeof isAutoBattleTargetValid === "function" ? isAutoBattleTargetValid(currentMonster) : !!currentMonster;
  if (validTarget) {
    resetAutoNoTargetTimer();
    return false;
  }
  const waitSeconds = 1;
  if (!autoNoTargetSince) autoNoTargetSince = Date.now();
  if (Date.now() - autoNoTargetSince < waitSeconds * 1000) return false;

  if (typeof setAutoBattleControllerState === "function") {
    setAutoBattleControllerState(AUTO_BATTLE_STATES.TELEPORTING, { action: "fly_wing", reason: "no_target_timeout" });
  }
  const used = useFlyWing({ silent: false });
  if (!used) {
    autoNoTargetSince = Date.now();
    return false;
  }

  resetAutoNoTargetTimer();
  if (window.AUTO_BATTLE_CONTROLLER) window.AUTO_BATTLE_CONTROLLER.lastTeleportAt = Date.now();
  // The world stream is centered on the player's new coordinates. Refresh once,
  // then immediately reacquire instead of waiting for an unrelated later tick.
  if (typeof maintainWorldMonsterPopulation === "function") maintainWorldMonsterPopulation(Date.now(), { initial: false });
  if (typeof acquireAutoBattleTarget === "function") acquireAutoBattleTarget({ reason: "teleport_reacquire" });
  if (typeof scheduleAutoBattleTick === "function" && typeof isAutoBattleRunning === "function" && isAutoBattleRunning()) {
    scheduleAutoBattleTick(8);
  }
  return true;
}


// Runtime physical-skill knockback. Uses the shared world-coordinate state.
function knockbackMonsterFromPlayer(monster, cells = 1) {
  if (!monster || !player || monster.knockbackImmune || monster.isBoss || monster.isMvp) return false;
  // RO_WEB intentionally ignores wall/obstacle collision; world bounds only.
  const p = getPlayerPosition();
  const m = getMonsterPosition(monster);
  const dx = Number(m.x || 0) - Number(p.x || 0);
  const dy = Number(m.y || 0) - Number(p.y || 0);
  const length = Math.hypot(dx, dy) || 1;
  const cellPx = Number(window.RO_WEB_CELL_SIZE || 36);
  const distance = Math.max(0, Number(cells || 0)) * cellPx;
  const safe = clampPositionToBounds({
    x: Number(m.x || 0) + dx / length * distance,
    y: Number(m.y || 0) + dy / length * distance
  }, "monster");
  monster.position.x = safe.x;
  monster.position.y = safe.y;
  // Keep legacy coordinates mirrored for older Runtime helpers, while position remains authoritative.
  monster.worldX = safe.x;
  monster.worldY = safe.y;
  renderPositionSprites();
  return true;
}

window.movePlayerAdjacentToMonster = movePlayerAdjacentToMonster;
window.knockbackMonsterFromPlayer = knockbackMonsterFromPlayer;
