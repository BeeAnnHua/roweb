//============================================================
// RO_WEB V0.9.82GS - RA regional monster streaming runtime
//
// Keeps a weighted regional monster population around the player instead of
// constructing every rAthena field spawn at once. Ordinary monsters use the
// central count valve; plants and unique rare/Boss/MVP species keep their own
// limits and respawn timers. Existing function names are retained so battle,
// map and position modules remain backwards compatible with the former
// Mjolnir two-monster visual test runtime.
//============================================================

const RO_WORLD_MONSTER_TEST = {
  ready: false,
  config: null,
  mapId: null,
  profile: null,
  entities: [],
  respawnQueue: [],
  assetCache: new Map(),
  loadGeneration: 0,
  lastTimestamp: 0,
  lastMaintenanceAt: 0,
  instanceCounter: 0,
  rafStarted: false,
  savedMapSnapshotAt: 0,
  crowdPlan: null,
  crowdPlanAt: 0,
  crowdPlanPlayerPosition: null
};
window.RO_WORLD_MONSTER_TEST = RO_WORLD_MONSTER_TEST;

const RO_WORLD_MONSTER_Z_MIN = 1000;
const RO_WORLD_MONSTER_Z_MAX = 8999;

// 0.9.82ES: Incremental spatial hash for combat queries.
// Monsters register only when crossing a cell boundary, so skill targeting no
// longer scans every streamed entity as the regional population grows.
const RO_WORLD_MONSTER_SPATIAL_INDEX = {
  cellSize: 288,
  buckets: new Map(),
  registeredCount: 0,
  rebuilding: false,
  lastQuery: null
};
window.RO_WORLD_MONSTER_SPATIAL_INDEX = RO_WORLD_MONSTER_SPATIAL_INDEX;

function getWorldMonsterSpatialCellSize() {
  // Resolved once when the runtime config is loaded. This function is called by
  // moving monsters every frame, so it must remain allocation-free.
  return Math.max(96, Math.round(Number(RO_WORLD_MONSTER_SPATIAL_INDEX.cellSize || 288)));
}
function getWorldMonsterSpatialKeyAt(x, y) {
  const size = getWorldMonsterSpatialCellSize();
  return `${Math.floor(Number(x || 0) / size)},${Math.floor(Number(y || 0) / size)}`;
}
function unregisterWorldMonsterSpatialEntity(entity) {
  const key = entity?._spatialCellKey;
  if (!key) return false;
  const bucket = RO_WORLD_MONSTER_SPATIAL_INDEX.buckets.get(key);
  if (bucket && bucket.delete(entity)) {
    RO_WORLD_MONSTER_SPATIAL_INDEX.registeredCount = Math.max(0, RO_WORLD_MONSTER_SPATIAL_INDEX.registeredCount - 1);
    if (!bucket.size) RO_WORLD_MONSTER_SPATIAL_INDEX.buckets.delete(key);
  }
  entity._spatialCellKey = null;
  return true;
}
function refreshWorldMonsterSpatialEntity(entity) {
  if (!entity?.position) return false;
  const key = getWorldMonsterSpatialKeyAt(entity.position.x, entity.position.y);
  if (entity._spatialCellKey === key) return false;
  unregisterWorldMonsterSpatialEntity(entity);
  let bucket = RO_WORLD_MONSTER_SPATIAL_INDEX.buckets.get(key);
  if (!bucket) { bucket = new Set(); RO_WORLD_MONSTER_SPATIAL_INDEX.buckets.set(key, bucket); }
  if (!bucket.has(entity)) {
    bucket.add(entity);
    RO_WORLD_MONSTER_SPATIAL_INDEX.registeredCount += 1;
  }
  entity._spatialCellKey = key;
  return true;
}
function clearWorldMonsterSpatialIndex() {
  RO_WORLD_MONSTER_SPATIAL_INDEX.buckets.clear();
  RO_WORLD_MONSTER_SPATIAL_INDEX.registeredCount = 0;
}
function rebuildWorldMonsterSpatialIndex() {
  if (RO_WORLD_MONSTER_SPATIAL_INDEX.rebuilding) return;
  RO_WORLD_MONSTER_SPATIAL_INDEX.rebuilding = true;
  try {
    clearWorldMonsterSpatialIndex();
    for (const entity of RO_WORLD_MONSTER_TEST.entities || []) {
      if (entity) { entity._spatialCellKey = null; refreshWorldMonsterSpatialEntity(entity); }
    }
  } finally { RO_WORLD_MONSTER_SPATIAL_INDEX.rebuilding = false; }
}
function ensureWorldMonsterSpatialIndexIntegrity() {
  if (RO_WORLD_MONSTER_SPATIAL_INDEX.registeredCount !== (RO_WORLD_MONSTER_TEST.entities || []).length) rebuildWorldMonsterSpatialIndex();
}
function queryWorldMonsterEntitiesInBounds(bounds = {}, options = {}) {
  ensureWorldMonsterSpatialIndexIntegrity();
  const minX = Number.isFinite(Number(bounds.minX)) ? Number(bounds.minX) : -Infinity;
  const maxX = Number.isFinite(Number(bounds.maxX)) ? Number(bounds.maxX) : Infinity;
  const minY = Number.isFinite(Number(bounds.minY)) ? Number(bounds.minY) : -Infinity;
  const maxY = Number.isFinite(Number(bounds.maxY)) ? Number(bounds.maxY) : Infinity;
  if (![minX,maxX,minY,maxY].every(Number.isFinite)) {
    return getLivingWorldMonsterTestEntities({ activeOnly: options.activeOnly !== false });
  }
  const size = getWorldMonsterSpatialCellSize();
  const startX = Math.floor(minX / size), endX = Math.floor(maxX / size);
  const startY = Math.floor(minY / size), endY = Math.floor(maxY / size);
  const result = [], seen = new Set();
  let visitedBuckets = 0, visitedEntities = 0;
  for (let cy = startY; cy <= endY; cy += 1) {
    for (let cx = startX; cx <= endX; cx += 1) {
      const bucket = RO_WORLD_MONSTER_SPATIAL_INDEX.buckets.get(`${cx},${cy}`);
      if (!bucket) continue;
      visitedBuckets += 1;
      for (const entity of bucket) {
        visitedEntities += 1;
        if (!entity || seen.has(entity)) continue;
        if (options.includeDead !== true && (entity._deathHandled || Number(entity.currentHp || 0) <= 0)) continue;
        const x = Number(entity.position?.x || 0), y = Number(entity.position?.y || 0);
        if (x < minX || x > maxX || y < minY || y > maxY) continue;
        seen.add(entity); result.push(entity);
      }
    }
  }
  RO_WORLD_MONSTER_SPATIAL_INDEX.lastQuery = {
    visitedBuckets, visitedEntities, resultCount:result.length, totalEntities:(RO_WORLD_MONSTER_TEST.entities || []).length, bounds:{minX,maxX,minY,maxY}
  };
  return result;
}
function queryWorldMonsterEntitiesNear(origin, rangePx, options = {}) {
  const x = Number(origin?.position?.x ?? origin?.worldX ?? origin?.x ?? 0);
  const y = Number(origin?.position?.y ?? origin?.worldY ?? origin?.y ?? 0);
  const r = Math.max(0, Number(rangePx || 0));
  return queryWorldMonsterEntitiesInBounds({ minX:x-r, maxX:x+r, minY:y-r, maxY:y+r }, options);
}
window.refreshWorldMonsterSpatialEntity = refreshWorldMonsterSpatialEntity;
window.rebuildWorldMonsterSpatialIndex = rebuildWorldMonsterSpatialIndex;
window.unregisterWorldMonsterSpatialEntity = unregisterWorldMonsterSpatialEntity;
window.queryWorldMonsterEntitiesInBounds = queryWorldMonsterEntitiesInBounds;
window.queryWorldMonsterEntitiesNear = queryWorldMonsterEntitiesNear;

function getWorldMonsterDepthZIndex(entity) {
  const worldHeight = Math.max(1, Number(currentMap?.worldHeight || currentMap?.height || 4608));
  const y = Math.max(0, Math.min(worldHeight, Number(entity?.position?.y || 0)));
  const ratio = y / worldHeight;
  return Math.round(RO_WORLD_MONSTER_Z_MIN + ratio * (RO_WORLD_MONSTER_Z_MAX - RO_WORLD_MONSTER_Z_MIN));
}
window.getWorldMonsterDepthZIndex = getWorldMonsterDepthZIndex;

const RO_WORLD_MONSTER_DEFAULTS = Object.freeze({
  monsterCountRate: 33,
  normalSpawnDelayRate: 100,
  plantSpawnDelayRate: 100,
  bossSpawnDelayRate: 100,
  spawnVariance: true,
  baseMonstersPerSource512: 5,
  activeWindowSourceSize: 1024,
  retainWindowSourceSize: 1280,
  normalHardCap: 40,
  spawnBatchSize: 4,
  initialSpawnBatchSize: 8,
  spawnMaintenanceMs: 500,
  renderPaddingWorldPx: 260,
  minimumSpawnDistanceWorldPx: 140,
  preferredSpawnRadiusWorldPx: 900,
  nearSpawnBias: 0.68,
  avoidViewportSpawnChance: 0,
  retaliationChaseMinCells: 24,
  retaliationLeashCells: 34,
  assistRangeCells: 11,
  aggroForgetMs: 12000,
  castSensorEnabled: true,
  normalOutsideCombatGraceMs: 5000,
  spatialCellSizeWorldPx: 288
});

function isWorldMonsterTestActive() {
  return Boolean(
    RO_WORLD_MONSTER_TEST.ready &&
    !player?.currentCity &&
    currentMap?.monsterStreaming &&
    currentMap?.monsterVisualTest &&
    currentMap?.monsterSpawnProfile
  );
}
window.isWorldMonsterTestActive = isWorldMonsterTestActive;

function getWorldMonsterTestHost() {
  return document.getElementById("battle-field") || document.getElementById("battle-area");
}

function getWorldMonsterRuntimeValves() {
  let serverOverrides = {};
  try {
    if (typeof serverConfig !== "undefined") serverOverrides = serverConfig?.server?.monsters || {};
  } catch (_) {}
  const merged = {
    ...RO_WORLD_MONSTER_DEFAULTS,
    ...(RO_WORLD_MONSTER_TEST.config?.global || {})
  };
  const firstDefined = (...values) => values.find(value => value !== undefined && value !== null);
  return {
    ...merged,
    ...serverOverrides,
    monsterCountRate: Number(firstDefined(serverOverrides.mob_count_rate, serverOverrides.monsterCountRate, merged.monsterCountRate)),
    normalSpawnDelayRate: Number(firstDefined(serverOverrides.mob_spawn_delay, serverOverrides.normalSpawnDelayRate, merged.normalSpawnDelayRate)),
    plantSpawnDelayRate: Number(firstDefined(serverOverrides.plant_spawn_delay, serverOverrides.plantSpawnDelayRate, merged.plantSpawnDelayRate)),
    bossSpawnDelayRate: Number(firstDefined(serverOverrides.boss_spawn_delay, serverOverrides.bossSpawnDelayRate, merged.bossSpawnDelayRate)),
    spawnVariance: Boolean(firstDefined(serverOverrides.mob_spawn_variance, serverOverrides.spawnVariance, merged.spawnVariance))
  };
}
window.getWorldMonsterRuntimeValves = getWorldMonsterRuntimeValves;

function getWorldMonsterProfile(map = currentMap) {
  const key = map?.monsterSpawnProfile || map?.id;
  return key ? RO_WORLD_MONSTER_TEST.config?.regions?.[key] || null : null;
}
window.getWorldMonsterProfile = getWorldMonsterProfile;

function getWorldMonsterCrowdControlConfig(profile = RO_WORLD_MONSTER_TEST.profile) {
  const raw = profile?.crowdControl;
  if (!raw || raw.enabled !== true) return null;
  const categories = Array.isArray(raw.categories) && raw.categories.length
    ? raw.categories.map(value => String(value || "").toLowerCase())
    : ["mvp"];
  return { ...raw, categories };
}
window.getWorldMonsterCrowdControlConfig = getWorldMonsterCrowdControlConfig;

function isWorldMonsterCoarsePointer() {
  try {
    return Boolean(window.matchMedia?.("(pointer: coarse)")?.matches || navigator?.maxTouchPoints > 0);
  } catch (_) {
    return false;
  }
}

function getWorldMonsterCrowdAttackerLimit(config) {
  if (!config) return Infinity;
  const coarse = isWorldMonsterCoarsePointer();
  const raw = coarse ? config.maxConcurrentAttackersCoarse : config.maxConcurrentAttackers;
  return Math.max(1, Math.floor(Number(raw || config.maxConcurrentAttackers || 6)));
}

function isWorldMonsterCrowdCandidate(entity, config = getWorldMonsterCrowdControlConfig()) {
  if (!config || !entity || entity._deathHandled || Number(entity.currentHp || 0) <= 0) return false;
  return config.categories.includes(String(entity._category || "normal").toLowerCase());
}

function refreshWorldMonsterCrowdPlan(now = Date.now(), options = {}) {
  const config = getWorldMonsterCrowdControlConfig();
  if (!config || !player?.position) {
    RO_WORLD_MONSTER_TEST.crowdPlan = null;
    return null;
  }
  const planningInterval = Math.max(50, Number(config.planningIntervalMs || 180));
  const previousPosition = RO_WORLD_MONSTER_TEST.crowdPlanPlayerPosition;
  const moved = previousPosition
    ? Math.hypot(Number(player.position.x || 0) - Number(previousPosition.x || 0), Number(player.position.y || 0) - Number(previousPosition.y || 0))
    : Infinity;
  if (!options.force && RO_WORLD_MONSTER_TEST.crowdPlan && now - Number(RO_WORLD_MONSTER_TEST.crowdPlanAt || 0) < planningInterval && moved < 18) {
    return RO_WORLD_MONSTER_TEST.crowdPlan;
  }

  const candidates = (RO_WORLD_MONSTER_TEST.entities || [])
    .filter(entity => isWorldMonsterCrowdCandidate(entity, config) && entity.provoked)
    .map(entity => ({
      entity,
      distance: Math.hypot(Number(entity.position?.x || 0) - Number(player.position.x || 0), Number(entity.position?.y || 0) - Number(player.position.y || 0))
    }))
    .sort((a, b) => a.distance - b.distance || Number(a.entity._instanceId || 0) - Number(b.entity._instanceId || 0));

  const attackerLimit = getWorldMonsterCrowdAttackerLimit(config);
  const assignments = new Map();
  const previousAssignments = RO_WORLD_MONSTER_TEST.crowdPlan?.assignments instanceof Map
    ? RO_WORLD_MONSTER_TEST.crowdPlan.assignments
    : new Map();
  const candidateById = new Map(candidates.map(entry => [Number(entry.entity._instanceId || 0), entry]));
  const engagedSlots = new Map();
  const reserveSlots = new Map();
  const usedEngagedSlots = new Set();
  const usedReserveSlots = new Set();

  // Keep existing crowd slots whenever possible. The previous implementation
  // re-ranked every MVP by distance on each planning pass, causing them to swap
  // destinations and repeatedly cross through the same center point.
  for (const [id, previous] of previousAssignments.entries()) {
    if (!candidateById.has(Number(id)) || previous?.engaged !== true) continue;
    const slot = Math.max(0, Math.floor(Number(previous.slotIndex || 0)));
    if (slot >= attackerLimit || usedEngagedSlots.has(slot)) continue;
    engagedSlots.set(Number(id), slot);
    usedEngagedSlots.add(slot);
  }
  for (const entry of candidates) {
    const id = Number(entry.entity._instanceId || 0);
    if (engagedSlots.has(id) || engagedSlots.size >= attackerLimit) continue;
    let slot = 0;
    while (usedEngagedSlots.has(slot) && slot < attackerLimit) slot += 1;
    if (slot >= attackerLimit) break;
    engagedSlots.set(id, slot);
    usedEngagedSlots.add(slot);
  }

  for (const [id, previous] of previousAssignments.entries()) {
    if (!candidateById.has(Number(id)) || engagedSlots.has(Number(id)) || previous?.engaged === true) continue;
    const slot = Math.max(0, Math.floor(Number(previous.slotIndex || 0)));
    if (usedReserveSlots.has(slot)) continue;
    reserveSlots.set(Number(id), slot);
    usedReserveSlots.add(slot);
  }
  for (const entry of candidates) {
    const id = Number(entry.entity._instanceId || 0);
    if (engagedSlots.has(id) || reserveSlots.has(id)) continue;
    let slot = 0;
    while (usedReserveSlots.has(slot)) slot += 1;
    reserveSlots.set(id, slot);
    usedReserveSlots.add(slot);
  }

  candidates.forEach((entry, rank) => {
    const id = Number(entry.entity._instanceId || 0);
    const engaged = engagedSlots.has(id);
    assignments.set(id, {
      rank,
      engaged,
      slotIndex: engaged ? engagedSlots.get(id) : reserveSlots.get(id),
      attackerLimit,
      total: candidates.length
    });
    entry.entity._crowdEngaged = engaged;
    entry.entity._crowdRank = rank;
  });
  for (const entity of RO_WORLD_MONSTER_TEST.entities || []) {
    if (!assignments.has(Number(entity?._instanceId || 0))) {
      entity._crowdEngaged = false;
      entity._crowdRank = -1;
    }
  }
  const plan = { config, assignments, attackerLimit, total:candidates.length, createdAt:now };
  RO_WORLD_MONSTER_TEST.crowdPlan = plan;
  RO_WORLD_MONSTER_TEST.crowdPlanAt = now;
  RO_WORLD_MONSTER_TEST.crowdPlanPlayerPosition = { x:Number(player.position.x || 0), y:Number(player.position.y || 0) };
  return plan;
}
window.refreshWorldMonsterCrowdPlan = refreshWorldMonsterCrowdPlan;

function getWorldMonsterCrowdTarget(entity, assignment, attackRange) {
  const plan = RO_WORLD_MONSTER_TEST.crowdPlan;
  const config = plan?.config || getWorldMonsterCrowdControlConfig();
  if (!config || !assignment || !player?.position) return null;
  let radius;
  let angle;
  if (assignment.engaged) {
    const count = Math.max(1, Number(assignment.attackerLimit || 1));
    radius = Math.max(28, Math.min(Number(config.engagedRadiusWorldPx || 44), Math.max(30, Number(attackRange || 55) * 0.86)));
    angle = (Math.PI * 2 * Number(assignment.slotIndex || 0) / count) + 0.19;
  } else {
    const capacity = Math.max(6, Math.floor(Number(config.reserveRingCapacity || 10)));
    const slot = Math.max(0, Number(assignment.slotIndex || 0));
    const ring = Math.floor(slot / capacity);
    const index = slot % capacity;
    radius = Math.max(90, Number(config.reserveRadiusWorldPx || 150)) + ring * Math.max(36, Number(config.reserveRingSpacingWorldPx || 72));
    angle = (Math.PI * 2 * index / capacity) + ring * 0.31 + 0.11;
  }
  return clampWorldMonsterPosition({
    x: Number(player.position.x || 0) + Math.cos(angle) * radius,
    y: Number(player.position.y || 0) + Math.sin(angle) * radius
  });
}
window.getWorldMonsterCrowdTarget = getWorldMonsterCrowdTarget;

function getWorldMonsterAiIntervalMs(entity, distance, assignment = null) {
  const config = getWorldMonsterCrowdControlConfig();
  if (!config || !isWorldMonsterCrowdCandidate(entity, config)) return 50;
  if (assignment?.engaged || entity === currentMonster) return Math.max(35, Number(config.nearAiIntervalMs || 50));
  if (Number(distance || 0) >= Math.max(360, Number(config.farDistanceWorldPx || 760))) return Math.max(120, Number(config.farAiIntervalMs || 260));
  return Math.max(80, Number(config.reserveAiIntervalMs || 160));
}

function getWorldMonsterEffectiveAiDt(entity, now, fallbackDt, intervalMs) {
  const last = Number(entity?._lastAiUpdateAt || 0);
  if (now < Number(entity?._nextAiUpdateAt || 0)) return 0;
  const elapsed = last > 0 ? (now - last) / 1000 : Number(fallbackDt || 0.05);
  entity._lastAiUpdateAt = now;
  const crowdConfig = getWorldMonsterCrowdControlConfig();
  const stagger = crowdConfig && isWorldMonsterCrowdCandidate(entity, crowdConfig)
    ? (Number(entity?._instanceId || 0) % 5) * 4
    : 0;
  entity._nextAiUpdateAt = now + Math.max(35, Number(intervalMs || 50)) + stagger;
  return Math.max(Number(fallbackDt || 0.05), Math.min(0.3, elapsed));
}

function getWorldMonsterScale() {
  return Math.max(0.1, Number(currentMap?.worldScale || currentMap?.chunkGrid?.displayScale || 1));
}

function getWorldMonsterActiveWindowWorldSize() {
  return Math.max(256, Number(getWorldMonsterRuntimeValves().activeWindowSourceSize || 1024)) * getWorldMonsterScale();
}

function getWorldMonsterRetainWindowWorldSize() {
  const active = getWorldMonsterActiveWindowWorldSize();
  return Math.max(active, Number(getWorldMonsterRuntimeValves().retainWindowSourceSize || 1280) * getWorldMonsterScale());
}

function getWorldMonsterWindowTargetCount(profile = RO_WORLD_MONSTER_TEST.profile) {
  const valves = getWorldMonsterRuntimeValves();
  const sourceWindow = Math.max(512, Number(valves.activeWindowSourceSize || 1024));
  const sourceTiles = Math.max(1, (sourceWindow / 512) ** 2);
  const base = Number(profile?.targetNormalCountAt100 || (Number(valves.baseMonstersPerSource512 || 15) * sourceTiles));
  const scaled = Math.round(base * Math.max(0, Number(valves.monsterCountRate || 0)) / 100);
  return Math.max(0, Math.min(Math.max(1, Number(valves.normalHardCap || 40)), scaled));
}
window.getWorldMonsterWindowTargetCount = getWorldMonsterWindowTargetCount;

function isWorldMonsterUniqueCategory(category) {
  return ["rare", "boss", "mvp"].includes(String(category || "").toLowerCase());
}

function getWorldMonsterPersistentRoot() {
  if (!player || typeof player !== "object") return null;
  if (!player.worldMonsterState || typeof player.worldMonsterState !== "object") {
    player.worldMonsterState = { version: "0.9.82EM", regions: {} };
  }
  if (!player.worldMonsterState.regions || typeof player.worldMonsterState.regions !== "object") {
    player.worldMonsterState.regions = {};
  }
  player.worldMonsterState.version = "0.9.82EM";
  return player.worldMonsterState;
}

function getWorldMonsterRegionPersistentState(mapId = RO_WORLD_MONSTER_TEST.mapId || currentMap?.id) {
  const root = getWorldMonsterPersistentRoot();
  if (!root || !mapId) return null;
  if (!root.regions[mapId] || typeof root.regions[mapId] !== "object") {
    root.regions[mapId] = { unique: {} };
  }
  if (!root.regions[mapId].unique || typeof root.regions[mapId].unique !== "object") {
    root.regions[mapId].unique = {};
  }
  return root.regions[mapId];
}


function getWorldMonsterRegionUniqueAvailability(mapId, monsterId, now = Date.now()) {
  const key = String(Number(monsterId || 0));
  const state = player?.worldMonsterState?.regions?.[mapId]?.unique?.[key] || null;
  const nextSpawnAt = Math.max(0, Number(state?.nextSpawnAt || 0));
  const respawning = state?.alive === false && nextSpawnAt > now;
  return {
    mapId,
    monsterId: Number(monsterId || 0),
    alive: !respawning,
    respawning,
    nextSpawnAt,
    remainingSeconds: respawning ? Math.max(1, Math.ceil((nextSpawnAt - now) / 1000)) : 0,
    lastDeathAt: Math.max(0, Number(state?.lastDeathAt || 0))
  };
}
window.getWorldMonsterRegionUniqueAvailability = getWorldMonsterRegionUniqueAvailability;

function getWorldMonsterUniquePersistentEntry(monsterId, create = true) {
  const regionState = getWorldMonsterRegionPersistentState();
  if (!regionState) return null;
  const key = String(Number(monsterId || 0));
  if (!key || key === "0") return null;
  if (!regionState.unique[key] && create) {
    regionState.unique[key] = {
      alive: true,
      nextSpawnAt: 0,
      currentHp: null,
      position: null,
      lastDeathAt: 0
    };
  }
  return regionState.unique[key] || null;
}

function syncWorldMonsterUniquePersistentState(entity) {
  if (!entity || !isWorldMonsterUniqueCategory(entity._category)) return;
  const state = getWorldMonsterUniquePersistentEntry(entity.id, true);
  if (!state) return;
  const alive = Number(entity.currentHp || 0) > 0 && !entity._deathHandled;
  state.alive = alive;
  state.currentHp = alive ? Math.max(1, Math.floor(Number(entity.currentHp || 1))) : 0;
  state.position = entity.position ? {
    x: Math.round(Number(entity.position.x || 0)),
    y: Math.round(Number(entity.position.y || 0))
  } : null;
  if (Number(entity._respawnAt || 0) > 0) state.nextSpawnAt = Number(entity._respawnAt || 0);
}

function snapshotWorldMonsterRegionState(options = {}) {
  RO_WORLD_MONSTER_TEST.entities.forEach(syncWorldMonsterUniquePersistentState);
  RO_WORLD_MONSTER_TEST.savedMapSnapshotAt = Date.now();
  if (options.save && typeof saveGame === "function") saveGame();
}
window.snapshotWorldMonsterRegionState = snapshotWorldMonsterRegionState;

function getWorldMonsterAssetBounds(data) {
  const frames = Array.isArray(data?.frames) ? data.frames : [];
  let left = 0, top = 0, right = 1, bottom = 1;
  frames.forEach(frame => {
    left = Math.min(left, -Number(frame.pivotX || 0));
    top = Math.min(top, -Number(frame.pivotY || 0));
    right = Math.max(right, Number(frame.width || 1) - Number(frame.pivotX || 0));
    bottom = Math.max(bottom, Number(frame.height || 1) - Number(frame.pivotY || 0));
  });
  return {
    left, top, right, bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
    anchorX: -left,
    anchorY: -top
  };
}

function loadWorldMonsterImage(src) {
  return new Promise((resolve, reject) => {
    const image = document.createElement("img");
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Monster atlas image load failed: ${src}`));
    image.src = src;
  });
}

async function loadWorldMonsterTestAsset(monster) {
  const id = Number(monster?.id || 0);
  if (!id) return null;
  if (RO_WORLD_MONSTER_TEST.assetCache.has(id)) return RO_WORLD_MONSTER_TEST.assetCache.get(id);

  const promise = (async () => {
    if (!monster?.animationJson) {
      const rawSrc = monster?.staticImage || monster?.image;
      if (!rawSrc) return null;
      const src = String(rawSrc).replace(/^\.\//, "");
      const image = await loadWorldMonsterImage(src);
      const width = Math.max(1, Number(image.naturalWidth || image.width || 1));
      const height = Math.max(1, Number(image.naturalHeight || image.height || 1));
      const frame = { id:0, atlas:0, x:0, y:0, width, height, pivotX:width / 2, pivotY:height, durationMs:1000 };
      const directionFrames = { south_west:{frames:[0]}, north_west:{frames:[0]}, north_east:{frames:[0]}, south_east:{frames:[0]} };
      const animations = {};
      ["idle","walk","attack","hurt","hit","dead"].forEach(motion => { animations[motion] = { directions:directionFrames }; });
      const data = { frames:[frame], animations, staticFallback:true };
      return {
        data,
        images:new Map([[0,image]]),
        image,
        frameById:new Map([[0,frame]]),
        bounds:getWorldMonsterAssetBounds(data),
        staticFallback:true
      };
    }
    const jsonPath = String(monster.animationJson).replace(/^\.\//, "");
    const data = await loadJson(`./${jsonPath}`, null);
    if (!data) throw new Error(`Monster animation JSON missing: ${monster.animationJson}`);
    const baseDir = jsonPath.includes("/") ? jsonPath.slice(0, jsonPath.lastIndexOf("/")) : "";
    const atlasDefs = Array.isArray(data.atlases) && data.atlases.length
      ? data.atlases
      : (data.atlas ? [data.atlas] : []);
    if (!atlasDefs.length && monster.animationAtlas) atlasDefs.push({ index: 0, file: monster.animationAtlas });

    const images = new Map();
    await Promise.all(atlasDefs.map(async (atlasDef, listIndex) => {
      const atlasIndex = Number(atlasDef?.index ?? listIndex);
      const explicit = Array.isArray(monster.animationAtlases) ? monster.animationAtlases[atlasIndex] : null;
      const rawFile = explicit || atlasDef?.file || (atlasIndex === 0 ? monster.animationAtlas : null);
      if (!rawFile) throw new Error(`Monster atlas ${atlasIndex} missing for ${monster.id}`);
      const clean = String(rawFile).replace(/^\.\//, "");
      const src = clean.includes("/") ? clean : `${baseDir}/${clean}`;
      images.set(atlasIndex, await loadWorldMonsterImage(src));
    }));

    return {
      data,
      images,
      image: images.get(0) || images.values().next().value || null,
      frameById: new Map((data.frames || []).map(frame => [Number(frame.id), frame])),
      bounds: getWorldMonsterAssetBounds(data)
    };
  })();

  RO_WORLD_MONSTER_TEST.assetCache.set(id, promise);
  try {
    const asset = await promise;
    RO_WORLD_MONSTER_TEST.assetCache.set(id, asset);
    return asset;
  } catch (error) {
    RO_WORLD_MONSTER_TEST.assetCache.delete(id);
    throw error;
  }
}

function findWorldMonsterSource(monsterId) {
  return (Array.isArray(monsters) ? monsters : []).find(monster => Number(monster.id) === Number(monsterId)) || null;
}

function getWorldMonsterMapBounds() {
  if (typeof getCurrentMapWorldSize === "function") return getCurrentMapWorldSize();
  return {
    width: Math.max(1, Number(currentMap?.worldWidth || 4608)),
    height: Math.max(1, Number(currentMap?.worldHeight || 4608))
  };
}

function clampWorldMonsterPosition(position) {
  if (typeof clampPositionToBounds === "function") return clampPositionToBounds(position, "monster");
  const world = getWorldMonsterMapBounds();
  return {
    x: Math.max(1, Math.min(world.width - 1, Number(position?.x || 0))),
    y: Math.max(1, Math.min(world.height - 1, Number(position?.y || 0)))
  };
}

function isWorldMonsterInsideSquare(entity, fullSize, center = player?.position) {
  if (!entity?.position || !center) return false;
  const half = Math.max(1, Number(fullSize || 1)) / 2;
  return Math.abs(Number(entity.position.x || 0) - Number(center.x || 0)) <= half &&
    Math.abs(Number(entity.position.y || 0) - Number(center.y || 0)) <= half;
}

function isWorldMonsterPositionInsideViewport(position, padding = 0) {
  if (!position) return false;
  const camera = typeof getMapCameraOffset === "function" ? getMapCameraOffset() : { x: 0, y: 0 };
  const viewport = typeof getViewportLogicalSize === "function"
    ? getViewportLogicalSize()
    : { width: 1280, height: 720 };
  return Number(position.x || 0) >= Number(camera.x || 0) - padding &&
    Number(position.x || 0) <= Number(camera.x || 0) + Number(viewport.width || 1280) + padding &&
    Number(position.y || 0) >= Number(camera.y || 0) - padding &&
    Number(position.y || 0) <= Number(camera.y || 0) + Number(viewport.height || 720) + padding;
}

function chooseWorldMonsterSpawnPosition(options = {}) {
  const center = player?.position || currentMap?.spawnPoint || { x: 2304, y: 2304 };
  const valves = getWorldMonsterRuntimeValves();
  const activeSize = getWorldMonsterActiveWindowWorldSize();
  const half = activeSize / 2;
  const minimumDistance = Math.max(0, Number(valves.minimumSpawnDistanceWorldPx || 140));
  const preferredRadius = Math.max(minimumDistance + 80, Math.min(half * 0.95, Number(valves.preferredSpawnRadiusWorldPx || 900)));
  const nearBias = Math.max(0, Math.min(1, Number(valves.nearSpawnBias ?? 0.68)));
  const avoidViewport = options.avoidViewport === true || Math.random() < Math.max(0, Math.min(1, Number(valves.avoidViewportSpawnChance || 0)));
  const preferNear = options.preferNear !== false;
  let fallback = clampWorldMonsterPosition({ x:Number(center.x||0)+minimumDistance, y:Number(center.y||0) });

  for (let attempt = 0; attempt < 48; attempt += 1) {
    let raw;
    if (preferNear && Math.random() < nearBias) {
      const angle = Math.random() * Math.PI * 2;
      // Power > 1 biases the population toward the player without spawning on top of them.
      const radius = minimumDistance + (preferredRadius - minimumDistance) * Math.pow(Math.random(), 1.45);
      raw = { x:Number(center.x||0)+Math.cos(angle)*radius, y:Number(center.y||0)+Math.sin(angle)*radius };
    } else {
      raw = { x:Number(center.x||0)+(Math.random()*2-1)*half, y:Number(center.y||0)+(Math.random()*2-1)*half };
    }
    const candidate = clampWorldMonsterPosition(raw);
    fallback = candidate;
    const distanceToPlayer = Math.hypot(candidate.x - Number(center.x || 0), candidate.y - Number(center.y || 0));
    if (distanceToPlayer < minimumDistance) continue;
    if (avoidViewport && isWorldMonsterPositionInsideViewport(candidate, 36)) continue;
    const overlaps = RO_WORLD_MONSTER_TEST.entities.some(entity =>
      Number(entity.currentHp || 0) > 0 &&
      Math.hypot(Number(entity.position?.x || 0) - candidate.x, Number(entity.position?.y || 0) - candidate.y) < 42
    );
    if (overlaps) continue;
    return candidate;
  }
  return fallback;
}

function createWorldMonsterEntity(monsterData, spawnEntry, options = {}) {
  const persistent = isWorldMonsterUniqueCategory(spawnEntry?.category)
    ? getWorldMonsterUniquePersistentEntry(monsterData.id, true)
    : null;
  const storedPos = persistent?.position && Number.isFinite(Number(persistent.position.x)) && Number.isFinite(Number(persistent.position.y))
    ? clampWorldMonsterPosition(persistent.position)
    : null;
  const configuredPos = spawnEntry?.spawnPosition && Number.isFinite(Number(spawnEntry.spawnPosition.x)) && Number.isFinite(Number(spawnEntry.spawnPosition.y))
    ? clampWorldMonsterPosition(spawnEntry.spawnPosition)
    : null;
  const fixedSpawnPosition = Boolean(getWorldMonsterProfile(currentMap)?.fixedSpawnPositions === true && configuredPos);
  // The MVP arena uses authored grid positions. Do not restore a saved chase
  // coordinate on the next visit, otherwise every MVP reappears where the last
  // fight ended and the whole map starts as one pile. HP/respawn timers remain persistent.
  const position = fixedSpawnPosition
    ? configuredPos
    : (storedPos || configuredPos || chooseWorldMonsterSpawnPosition({ avoidViewport: options.avoidViewport !== false }));
  const maxHp = Math.max(1, Number(monsterData.maxHp || monsterData.hp || 1));
  const storedHp = Number(persistent?.currentHp || 0);
  const currentHp = persistent?.alive !== false && storedHp > 0 ? Math.min(maxHp, storedHp) : maxHp;
  const instanceId = ++RO_WORLD_MONSTER_TEST.instanceCounter;

  const authoritativeMonsterId = Number(spawnEntry?.monsterId || monsterData?.officialId || monsterData?.id || 0);
  const authoritativeCoelacanthModes = authoritativeMonsterId === 2189
    ? ["IgnoreMagic", "Mvp"]
    : (authoritativeMonsterId === 2190 ? ["IgnoreMelee", "IgnoreRanged", "Mvp"] : null);
  const entity = {
    ...monsterData,
    id: authoritativeMonsterId || Number(monsterData?.id || 0),
    officialId: authoritativeMonsterId || Number(monsterData?.officialId || monsterData?.id || 0),
    combatMonsterId: authoritativeMonsterId || Number(monsterData?.officialId || monsterData?.id || 0),
    ...(authoritativeCoelacanthModes ? { Modes: authoritativeCoelacanthModes, modeFlags: null } : {}),
    currentHp,
    position: { ...position },
    spawnPosition: { ...position },
    aiState: "IDLE",
    provoked: false,
    _aggroReason: null,
    _aggroSince: 0,
    _aggroLastSeenAt: 0,
    _worldTestEntity: true,
    _worldMonsterEntity: true,
    _worldTestIndex: instanceId,
    _instanceId: instanceId,
    _spawnEntry: spawnEntry,
    _category: String(spawnEntry?.category || "normal").toLowerCase(),
    _wanderTarget: null,
    _nextWanderAt: Date.now() + 500 + Math.random() * 2400,
    _nextActiveAttackAt: 0,
    _respawnAt: 0,
    _despawnAt: 0,
    _outsideRetainSince: 0,
    _deathHandled: false,
    _lastDamagedAt: 0,
    _hurtLockUntil: 0,
    _nextAiUpdateAt: Date.now(),
    _lastAiUpdateAt: Date.now(),
    _nextRenderAt: 0,
    _lastRenderLeft: null,
    _lastRenderTop: null,
    _lastRenderZ: null,
    _crowdEngaged: false,
    _crowdRank: -1,
    _hpBarRevealed: currentHp < maxHp,
    _animation: {
      asset: null,
      direction: "south_west",
      lastPosition: { ...position },
      motion: "idle",
      frameCursor: 0,
      frameElapsed: 0,
      overrideMotion: null,
      overrideHoldLast: false,
      lastTimestamp: 0
    },
    _element: null,
    _canvas: null,
    _ctx: null,
    _assetLoading: false
  };

  if (authoritativeMonsterId === 2189) {
    entity.behavior = { ...(entity.behavior || {}), ignoreMagic:true, ignoreMelee:false, ignoreRanged:false, mvpMode:true, source:"rAthena mob_db authoritative 2189" };
    entity.magicImmune = true; entity.magicImmunity = true; entity.immuneMagic = true;
  } else if (authoritativeMonsterId === 2190) {
    entity.behavior = { ...(entity.behavior || {}), ignoreMagic:false, ignoreMelee:true, ignoreRanged:true, mvpMode:true, source:"rAthena mob_db authoritative 2190" };
    entity.magicImmune = false; entity.magicImmunity = false; entity.immuneMagic = false;
    entity.infiniteDefense = false;
  }

  if (persistent) {
    persistent.alive = true;
    persistent.nextSpawnAt = 0;
    persistent.currentHp = currentHp;
    persistent.position = { x: Math.round(position.x), y: Math.round(position.y) };
  }
  return entity;
}

function getWorldMonsterCategoryLabel(entity) {
  const category = String(entity?._category || "normal");
  if (category === "mvp") return "MVP";
  if (category === "boss") return "Boss";
  if (category === "rare") return "稀有";
  if (category === "plant") return "植物";
  return "";
}

function createWorldMonsterElement(entity) {
  if (entity?._element) return entity._element;
  const host = getWorldMonsterTestHost();
  if (!host) return null;
  const el = document.createElement("div");
  const category = String(entity._category || "normal");
  el.className = `world-monster-entity category-${category}`;
  el.dataset.monsterId = String(entity.id);
  el.dataset.instanceId = String(entity._instanceId);
  el.dataset.aiState = "IDLE";
  el.title = `${entity.name}${getWorldMonsterCategoryLabel(entity) ? ` · ${getWorldMonsterCategoryLabel(entity)}` : ""}`;
  el.innerHTML = `
    <div class="world-monster-label"><span class="world-monster-name"></span><small class="world-monster-category"></small></div>
    <canvas class="world-monster-canvas" aria-label="${entity.name} monster animation"></canvas>
    <button type="button" class="world-monster-hitbox" aria-label="鎖定 ${entity.name}"></button>
    <div class="world-monster-hp"><span></span></div>
  `;
  const canvas = el.querySelector("canvas");
  entity._element = el;
  entity._canvas = canvas;
  entity._labelElement = el.querySelector(".world-monster-label");
  entity._nameElement = el.querySelector(".world-monster-name");
  entity._categoryElement = el.querySelector(".world-monster-category");
  entity._hitboxElement = el.querySelector(".world-monster-hitbox");
  entity._hpBarElement = el.querySelector(".world-monster-hp");
  entity._hpFillElement = entity._hpBarElement?.querySelector("span") || null;
  entity._ctx = canvas.getContext("2d");
  entity._ctx.imageSmoothingEnabled = false;
  entity._nameElement.textContent = entity.name;
  entity._categoryElement.textContent = getWorldMonsterCategoryLabel(entity);
  entity._hitboxElement?.addEventListener("click", event => {
    event.preventDefault();
    event.stopImmediatePropagation?.();
    event.stopPropagation();
    if (Number(entity.currentHp || 0) <= 0 || entity._deathHandled) return;
    selectWorldMonsterTestTarget(entity, { announce: true, attacking: true });
    if (typeof isAutoBattleRunning === "function" && isAutoBattleRunning()) {
      if (typeof forceAutoBattleTarget === "function") forceAutoBattleTarget(entity, { announce: false, manual: true, priorityMs: 12000 });
    } else if (typeof startManualMonsterAttack === "function") {
      startManualMonsterAttack(entity, { immediate: true });
    }
  });
  host.appendChild(el);
  if (entity._animation?.asset) applyWorldMonsterAssetToElement(entity, entity._animation.asset);
  return el;
}

function applyWorldMonsterAssetToElement(entity, asset) {
  if (!entity?._element || !entity?._canvas || !asset) return false;
  const scale = Math.max(0.1, Number(currentMap?.monsterGlobalScale ?? 1) * Number(entity.displayScale || 1));
  const width = Math.max(1, Math.ceil(asset.bounds.width * scale));
  const height = Math.max(1, Math.ceil(asset.bounds.height * scale));
  entity._canvas.width = width;
  entity._canvas.height = height;
  entity._canvas.style.width = `${width}px`;
  entity._canvas.style.height = `${height}px`;
  entity._element.style.width = `${width}px`;
  entity._element.style.height = `${height}px`;
  if (entity._ctx) entity._ctx.imageSmoothingEnabled = false;
  return true;
}

function removeWorldMonsterElement(entity) {
  if (!entity) return;
  entity._element?.remove();
  entity._element = null;
  entity._canvas = null;
  entity._labelElement = null;
  entity._nameElement = null;
  entity._categoryElement = null;
  entity._hitboxElement = null;
  entity._hpBarElement = null;
  entity._hpFillElement = null;
  entity._ctx = null;
  entity._nextRenderAt = 0;
  entity._lastRenderLeft = null;
  entity._lastRenderTop = null;
  entity._lastRenderZ = null;
  entity._assetLoading = false;
}

async function prepareWorldMonsterEntity(entity, generation = RO_WORLD_MONSTER_TEST.loadGeneration) {
  if (!entity || entity._assetLoading || entity._animation.asset) return;
  entity._assetLoading = true;
  try {
    const asset = await loadWorldMonsterTestAsset(entity);
    if (!asset || generation !== RO_WORLD_MONSTER_TEST.loadGeneration || !entity._element) return;
    entity._animation.asset = asset;
    applyWorldMonsterAssetToElement(entity, asset);
    renderWorldMonsterTestFrame(entity, performance.now());
  } catch (error) {
    console.warn("World monster streaming asset failed", entity?.id, error);
    entity._element?.classList.add("asset-error");
  } finally {
    entity._assetLoading = false;
  }
}

function clearWorldMonsterFieldTest(options = {}) {
  if (RO_WORLD_MONSTER_TEST.mapId && options.persist !== false) snapshotWorldMonsterRegionState({ save: Boolean(options.save) });
  RO_WORLD_MONSTER_TEST.loadGeneration += 1;
  RO_WORLD_MONSTER_TEST.entities.forEach(removeWorldMonsterElement);
  RO_WORLD_MONSTER_TEST.entities = [];
  clearWorldMonsterSpatialIndex();
  RO_WORLD_MONSTER_TEST.respawnQueue = [];
  RO_WORLD_MONSTER_TEST.profile = null;
  RO_WORLD_MONSTER_TEST.mapId = null;
  RO_WORLD_MONSTER_TEST.lastMaintenanceAt = 0;
  RO_WORLD_MONSTER_TEST.crowdPlan = null;
  RO_WORLD_MONSTER_TEST.crowdPlanAt = 0;
  RO_WORLD_MONSTER_TEST.crowdPlanPlayerPosition = null;
  const field = getWorldMonsterTestHost();
  field?.classList.remove("world-monster-test-active", "world-monster-streaming-active");
}
window.clearWorldMonsterFieldTest = clearWorldMonsterFieldTest;

function getWorldMonsterPoolEntries(category) {
  const pool = Array.isArray(RO_WORLD_MONSTER_TEST.profile?.pool) ? RO_WORLD_MONSTER_TEST.profile.pool : [];
  if (Array.isArray(category)) return pool.filter(entry => category.includes(String(entry.category || "normal").toLowerCase()));
  if (category) return pool.filter(entry => String(entry.category || "normal").toLowerCase() === String(category).toLowerCase());
  return pool;
}

function countWorldMonsterEntitiesByEntry(entry, options = {}) {
  const activeSize = getWorldMonsterActiveWindowWorldSize();
  return RO_WORLD_MONSTER_TEST.entities.filter(entity =>
    Number(entity.id) === Number(entry?.monsterId) &&
    (options.living === false || Number(entity.currentHp || 0) > 0) &&
    !entity._deathHandled &&
    (!options.activeOnly || isWorldMonsterInsideSquare(entity, activeSize))
  ).length;
}

function countWorldMonsterOrdinaryEntities(options = {}) {
  const activeSize = getWorldMonsterActiveWindowWorldSize();
  return RO_WORLD_MONSTER_TEST.entities.filter(entity =>
    ["normal", "plant"].includes(String(entity._category || "")) &&
    Number(entity.currentHp || 0) > 0 &&
    !entity._deathHandled &&
    (!options.activeOnly || isWorldMonsterInsideSquare(entity, activeSize))
  ).length;
}

function countWorldMonsterPendingByEntry(entry) {
  return RO_WORLD_MONSTER_TEST.respawnQueue.filter(item => Number(item.entry?.monsterId) === Number(entry?.monsterId)).length;
}

function chooseWeightedEntry(entries, weightResolver = entry => Number(entry.weight || 1)) {
  const valid = (entries || []).filter(Boolean);
  if (!valid.length) return null;
  const weights = valid.map(entry => Math.max(0, Number(weightResolver(entry) || 0)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return valid[Math.floor(Math.random() * valid.length)];
  let roll = Math.random() * total;
  for (let index = 0; index < valid.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return valid[index];
  }
  return valid[valid.length - 1];
}

function addWorldMonsterEntityFromEntry(entry, options = {}) {
  if (!entry) return null;
  const source = findWorldMonsterSource(entry.monsterId);
  if (!source) return null;
  const entity = createWorldMonsterEntity(source, entry, options);
  RO_WORLD_MONSTER_TEST.entities.push(entity);
  refreshWorldMonsterSpatialEntity(entity);
  return entity;
}

function getDesiredWorldMonsterPlantCount(targetTotal) {
  const plants = getWorldMonsterPoolEntries("plant");
  if (!plants.length || targetTotal <= 0) return 0;
  const cap = plants.reduce((sum, entry) => sum + Math.max(0, Number(entry.maxAlive ?? 1)), 0);
  return Math.min(cap, Math.max(1, Math.round(targetTotal * 0.08)));
}

function selectNormalEntryByDeficit(entries, desiredTotal) {
  if (!entries.length) return null;
  const totalWeight = entries.reduce((sum, entry) => sum + Math.max(1, Number(entry.weight || entry.raSpawnCount || 1)), 0);
  const underMinimum = entries.filter(entry => {
    const current = countWorldMonsterEntitiesByEntry(entry, { activeOnly: true }) + countWorldMonsterPendingByEntry(entry);
    return current < Math.max(0, Number(entry.minAlive || 0));
  });
  if (underMinimum.length) return chooseWeightedEntry(underMinimum);

  return chooseWeightedEntry(entries, entry => {
    const weight = Math.max(1, Number(entry.weight || entry.raSpawnCount || 1));
    const expected = desiredTotal * weight / Math.max(1, totalWeight);
    const current = countWorldMonsterEntitiesByEntry(entry, { activeOnly: true }) + countWorldMonsterPendingByEntry(entry);
    const deficit = Math.max(0.15, expected - current + 0.75);
    return weight * deficit;
  });
}

function populateWorldMonsterOrdinaryTarget(options = {}) {
  const targetTotal = getWorldMonsterWindowTargetCount();
  if (targetTotal <= 0) return 0;
  const valves = getWorldMonsterRuntimeValves();
  const hardCap = Math.max(1, Number(valves.normalHardCap || 40));
  const normalEntries = getWorldMonsterPoolEntries("normal");
  const plantEntries = getWorldMonsterPoolEntries("plant");
  const desiredPlants = getDesiredWorldMonsterPlantCount(targetTotal);
  const desiredNormals = Math.max(0, targetTotal - desiredPlants);
  const maxCreates = options.initial
    ? Math.min(targetTotal, Math.max(1, Number(valves.initialSpawnBatchSize || 8)))
    : Math.max(1, Number(valves.spawnBatchSize || 4));
  let created = 0;

  const activePlants = plantEntries.reduce((sum, entry) => sum + countWorldMonsterEntitiesByEntry(entry, { activeOnly: true }), 0);
  const pendingPlants = plantEntries.reduce((sum, entry) => sum + countWorldMonsterPendingByEntry(entry), 0);
  let plantNeed = Math.max(0, desiredPlants - activePlants - pendingPlants);
  while (plantEntries.length && plantNeed > 0 && created < maxCreates && countWorldMonsterOrdinaryEntities() < hardCap) {
    const eligible = plantEntries.filter(entry => {
      const cap = Math.max(0, Number(entry.maxAlive ?? 1));
      return countWorldMonsterEntitiesByEntry(entry) + countWorldMonsterPendingByEntry(entry) < cap;
    });
    const entry = chooseWeightedEntry(eligible, item => Number(item.weight || item.raSpawnCount || 1));
    if (!entry || !addWorldMonsterEntityFromEntry(entry, { avoidViewport: false, preferNear: true })) break;
    plantNeed -= 1;
    created += 1;
  }

  const activeNormals = normalEntries.reduce((sum, entry) => sum + countWorldMonsterEntitiesByEntry(entry, { activeOnly: true }), 0);
  const pendingNormals = normalEntries.reduce((sum, entry) => sum + countWorldMonsterPendingByEntry(entry), 0);
  let normalNeed = Math.max(0, desiredNormals - activeNormals - pendingNormals);
  while (normalEntries.length && normalNeed > 0 && created < maxCreates && countWorldMonsterOrdinaryEntities() < hardCap) {
    const entry = selectNormalEntryByDeficit(normalEntries, desiredNormals);
    if (!entry || !addWorldMonsterEntityFromEntry(entry, { avoidViewport: false, preferNear: true })) break;
    normalNeed -= 1;
    created += 1;
  }
  return created;
}

function restoreWorldMonsterUniqueEntries() {
  const now = Date.now();
  const entries = getWorldMonsterPoolEntries(["rare", "boss", "mvp"]);
  entries.forEach(entry => {
    if (countWorldMonsterEntitiesByEntry(entry) > 0) return;
    const state = getWorldMonsterUniquePersistentEntry(entry.monsterId, true);
    const dueAt = Math.max(0, Number(state?.nextSpawnAt || 0));
    if (state?.alive === false && dueAt > now) return;
    addWorldMonsterEntityFromEntry(entry, { avoidViewport: false });
  });
}

function ensureWorldMonsterFieldTest() {
  if (!isWorldMonsterTestActive()) {
    if (RO_WORLD_MONSTER_TEST.entities.length) clearWorldMonsterFieldTest();
    return [];
  }
  if (RO_WORLD_MONSTER_TEST.mapId === currentMap.id && RO_WORLD_MONSTER_TEST.profile) return RO_WORLD_MONSTER_TEST.entities;

  clearWorldMonsterFieldTest({ persist: true, save: false });
  RO_WORLD_MONSTER_TEST.loadGeneration += 1;
  RO_WORLD_MONSTER_TEST.mapId = currentMap.id;
  RO_WORLD_MONSTER_TEST.profile = getWorldMonsterProfile(currentMap);
  const field = getWorldMonsterTestHost();
  field?.classList.add("world-monster-test-active", "world-monster-streaming-active");
  getWorldMonsterRegionPersistentState(currentMap.id);

  restoreWorldMonsterUniqueEntries();
  populateWorldMonsterOrdinaryTarget({ initial: true });
  RO_WORLD_MONSTER_TEST.lastMaintenanceAt = Date.now();
  return RO_WORLD_MONSTER_TEST.entities;
}
window.ensureWorldMonsterFieldTest = ensureWorldMonsterFieldTest;

function getLivingWorldMonsterTestEntities(options = {}) {
  const entities = ensureWorldMonsterFieldTest().filter(entity => Number(entity.currentHp || 0) > 0 && !entity._deathHandled);
  if (options.activeOnly === false) return entities;
  const activeSize = getWorldMonsterActiveWindowWorldSize();
  return entities.filter(entity => isWorldMonsterInsideSquare(entity, activeSize));
}
window.getLivingWorldMonsterTestEntities = getLivingWorldMonsterTestEntities;
window.getWorldMonsterTestEntities = function(options = {}) {
  if (options?.bounds && typeof queryWorldMonsterEntitiesInBounds === "function") {
    return queryWorldMonsterEntitiesInBounds(options.bounds, { activeOnly: options.activeOnly !== false, includeDead: options.includeDead === true });
  }
  return getLivingWorldMonsterTestEntities({ activeOnly: options.activeOnly !== false });
};

function getNearestWorldMonsterTestTarget(options = {}) {
  const living = getLivingWorldMonsterTestEntities({ activeOnly: true });
  if (!living.length) return null;
  const center = player?.position || currentMap?.spawnPoint || { x: 0, y: 0 };
  const exclude = options.exclude || null;
  return living
    .filter(entity => entity !== exclude)
    .sort((a, b) => Math.hypot(a.position.x - center.x, a.position.y - center.y) - Math.hypot(b.position.x - center.x, b.position.y - center.y))[0] || living[0];
}
window.getNearestWorldMonsterTestTarget = getNearestWorldMonsterTestTarget;

function selectWorldMonsterTestTarget(entity, options = {}) {
  if (!entity || Number(entity.currentHp || 0) <= 0 || entity._deathHandled) return false;
  if (currentMonster && currentMonster !== entity && typeof stopManualMonsterAttack === "function") {
    stopManualMonsterAttack({ clearTarget: false, silent: true });
  }
  currentMonster = entity;
  RO_WORLD_MONSTER_TEST.entities.forEach(item => item._element?.classList.toggle("is-selected", item === entity));
  if (player && options.attacking !== false) player.state = "Attacking";
  if (typeof updateMonsterUI === "function") updateMonsterUI();
  if (options.announce && typeof addBattleLog === "function") addBattleLog(`鎖定目標：${entity.name}。`);
  return true;
}
window.selectWorldMonsterTestTarget = selectWorldMonsterTestTarget;

function getWorldMonsterAnimationIds(entity, motion, direction) {
  const entry = entity?._animation?.asset?.data?.animations?.[motion];
  const raw = entry?.directions?.[direction]?.frames ?? [];
  return Array.isArray(raw) ? raw : [];
}

function getWorldMonsterDirection(entity) {
  const animation = entity._animation;
  const position = entity.position;
  let dx = Number(position.x || 0) - Number(animation.lastPosition?.x || 0);
  let dy = Number(position.y || 0) - Number(animation.lastPosition?.y || 0);
  if (Math.hypot(dx, dy) < 0.2 && ["CHASE", "RUSH", "ATTACK"].includes(String(entity.aiState || "")) && player?.position) {
    dx = Number(player.position.x || 0) - Number(position.x || 0);
    dy = Number(player.position.y || 0) - Number(position.y || 0);
  }
  animation.lastPosition = { x: Number(position.x || 0), y: Number(position.y || 0) };
  if (Math.hypot(dx, dy) < 0.2) return animation.direction || "south_west";
  if (dx < 0 && dy >= 0) return "south_west";
  if (dx < 0 && dy < 0) return "north_west";
  if (dx >= 0 && dy < 0) return "north_east";
  return "south_east";
}

function renderWorldMonsterTestFrame(entity, timestamp) {
  const animation = entity?._animation;
  const asset = animation?.asset;
  const ctx = entity?._ctx;
  const canvas = entity?._canvas;
  if (!asset || !ctx || !canvas) return;
  const dead = Number(entity.currentHp || 0) <= 0 || entity._deathHandled;
  animation.direction = getWorldMonsterDirection(entity);
  const autoMotion = dead ? "dead" : (["CHASE", "RUSH", "WANDER"].includes(String(entity.aiState || "")) ? "walk" : "idle");
  const motion = animation.overrideMotion || autoMotion;
  if (animation.motion !== motion) {
    animation.motion = motion;
    animation.frameCursor = 0;
    animation.frameElapsed = 0;
  }
  const ids = getWorldMonsterAnimationIds(entity, motion, animation.direction);
  if (!ids.length) return;
  const dt = Math.min(100, Math.max(0, Number(timestamp || 0) - Number(animation.lastTimestamp || timestamp || 0)));
  animation.frameElapsed += dt;
  let frame = asset.frameById.get(Number(ids[Math.min(animation.frameCursor, ids.length - 1)]));
  let duration = Math.max(24, Number(frame?.durationMs || 96));
  while (animation.frameElapsed >= duration) {
    animation.frameElapsed -= duration;
    if (animation.overrideMotion) {
      if (animation.frameCursor < ids.length - 1) animation.frameCursor += 1;
      else if (animation.overrideHoldLast) animation.frameCursor = ids.length - 1;
      else {
        animation.overrideMotion = null;
        animation.overrideHoldLast = false;
        animation.motion = autoMotion;
        animation.frameCursor = 0;
        break;
      }
    } else if (dead) animation.frameCursor = Math.min(ids.length - 1, animation.frameCursor + 1);
    else animation.frameCursor = (animation.frameCursor + 1) % ids.length;
    frame = asset.frameById.get(Number(ids[Math.min(animation.frameCursor, ids.length - 1)]));
    duration = Math.max(24, Number(frame?.durationMs || 96));
  }
  animation.lastTimestamp = Number(timestamp || 0);
  if (!frame) return;

  const scale = Math.max(0.1, Number(currentMap?.monsterGlobalScale ?? 1) * Number(entity.displayScale || 1));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const dx = (asset.bounds.anchorX - Number(frame.pivotX || 0)) * scale;
  const dy = (asset.bounds.anchorY - Number(frame.pivotY || 0)) * scale;
  const drawWidth = Math.max(1, Math.round(Number(frame.width || 1) * scale));
  const drawHeight = Math.max(1, Math.round(Number(frame.height || 1) * scale));
  const sourceX = Number(frame.x || 0);
  const sourceY = Number(frame.y || 0);
  const sourceWidth = Number(frame.width || 1);
  const sourceHeight = Number(frame.height || 1);
  const drawX = Math.round(dx);
  const drawY = Math.round(dy);
  const image = asset.images.get(Number(frame.atlas || 0)) || asset.image;
  if (!image) return;

  if (frame.flipX === true) {
    ctx.save();
    ctx.translate(drawX + drawWidth, drawY);
    ctx.scale(-1, 1);
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, drawWidth, drawHeight);
    ctx.restore();
  } else {
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, drawX, drawY, drawWidth, drawHeight);
  }
  canvas.dataset.flipX = frame.flipX === true ? "true" : "false";
  const hitbox = entity._hitboxElement || entity._element?.querySelector(".world-monster-hitbox");
  if (hitbox) {
    entity._hitboxElement = hitbox;
    hitbox.style.left = `${Math.round(dx)}px`;
    hitbox.style.top = `${Math.round(dy)}px`;
    hitbox.style.width = `${drawWidth}px`;
    hitbox.style.height = `${drawHeight}px`;
  }
  const label = entity._labelElement || entity._element?.querySelector(".world-monster-label");
  if (label) {
    entity._labelElement = label;
    label.style.left = `${Math.round(dx + drawWidth / 2)}px`;
    label.style.top = `${Math.round(dy - 31)}px`;
  }
  const hp = entity._hpBarElement || entity._element?.querySelector(".world-monster-hp");
  if (hp) {
    hp.style.left = `${Math.round(dx + drawWidth / 2)}px`;
    hp.style.top = `${Math.round(dy - 9)}px`;
  }
  // Store a local top-center anchor; the outer render loop turns it into a
  // screen coordinate without getBoundingClientRect/layout reads.
  entity._damageNumberAnchorLocal = { x:dx + drawWidth / 2, y:dy - 24 };
}

function getWorldMonsterAssistRangePx() {
  return Math.max(1, Number(getWorldMonsterRuntimeValves().assistRangeCells || 11)) * 36;
}

function markWorldMonsterAttacked(entity, options = {}) {
  if (!entity?._worldTestEntity || entity._deathHandled || Number(entity.currentHp || 0) <= 0) return false;
  const behavior = typeof getMonsterAiBehavior === "function" ? getMonsterAiBehavior(entity) : (entity.behavior || {});
  const now = Date.now();
  entity.provoked = true;
  entity._aggroReason = String(options.reason || "damage");
  entity._aggroSince = Number(entity._aggroSince || now);
  entity._aggroLastSeenAt = now;
  if (entity._aggroReason === "damage") entity._lastDamagedAt = now;
  entity._wanderTarget = null;
  entity.aiState = behavior.canMove ? "RUSH" : "ANGRY";

  if (options.propagateAssist !== false) propagateWorldMonsterAssistBatch([entity]);
  return true;
}
window.markWorldMonsterAttacked = markWorldMonsterAttacked;

function propagateWorldMonsterAssistBatch(damagedEntities = []) {
  const assistRange = getWorldMonsterAssistRangePx();
  const damaged = [...new Set((damagedEntities || []).filter(entity => entity?._worldTestEntity && !entity._deathHandled && Number(entity.currentHp || 0) > 0))];
  if (!damaged.length) return 0;
  const allies = new Set();
  for (const source of damaged) {
    const nearby = queryWorldMonsterEntitiesNear(source, assistRange, { activeOnly:false });
    for (const ally of nearby) {
      if (!ally || ally === source || damaged.includes(ally) || ally._deathHandled || Number(ally.currentHp || 0) <= 0) continue;
      const allyBehavior = typeof getMonsterAiBehavior === "function" ? getMonsterAiBehavior(ally) : (ally.behavior || {});
      if (!allyBehavior.assist || !allyBehavior.canAttack) continue;
      allies.add(ally);
    }
  }
  allies.forEach(ally => markWorldMonsterAttacked(ally, { reason:"assist", propagateAssist:false }));
  return allies.size;
}
window.propagateWorldMonsterAssistBatch = propagateWorldMonsterAssistBatch;

function clearWorldMonsterAggro(entity) {
  if (!entity) return;
  entity.provoked = false;
  entity._aggroReason = null;
  entity._aggroSince = 0;
  entity._aggroLastSeenAt = 0;
}
window.clearWorldMonsterAggro = clearWorldMonsterAggro;

function playWorldMonsterTestMotion(motion, options = {}) {
  const entity = options.monster;
  if (!entity?._worldTestEntity || !entity._animation) return false;
  const normalizedMotion = motion === "hit" ? "hurt" : motion;
  entity._animation.overrideMotion = normalizedMotion;
  entity._animation.overrideHoldLast = Boolean(options.holdLast || normalizedMotion === "dead");
  entity._animation.frameCursor = 0;
  entity._animation.frameElapsed = 0;
  if (normalizedMotion === "hurt") {
    // RA DamageMotion is a short hit-stun, not a movement animation. Pause briefly, then resume with Walk/RUSH.
    const rawDamageMotion = Math.max(1, Number(entity.DamageMotion ?? entity.damageMotion ?? 180));
    const hurtLockMs = Math.max(80, Math.min(220, Math.round(rawDamageMotion * 0.35)));
    entity._hurtLockUntil = Date.now() + hurtLockMs;
    if (options.skipAggro !== true) markWorldMonsterAttacked(entity, { reason:"damage", propagateAssist:options.propagateAssist !== false });
    if (options.deferUi !== true && typeof updateWorldMonsterFieldTestUi === "function") updateWorldMonsterFieldTestUi(entity);
  }
  return true;
}
window.playWorldMonsterTestMotion = playWorldMonsterTestMotion;

function getWorldMonsterCrowdSeparationRadius(entity, config) {
  if (!entity || !config) return 0;
  if (entity._crowdEngaged) return Math.max(18, Number(config.engagedSeparationRadiusWorldPx || 40));
  const category = String(entity._category || "normal").toLowerCase();
  if (category === "mvp") return Math.max(24, Number(config.separationRadiusWorldPx || 66));
  if (category === "boss") return Math.max(22, Number(config.bossSeparationRadiusWorldPx || 54));
  return Math.max(16, Number(config.otherSeparationRadiusWorldPx || 32));
}

function resolveWorldMonsterCrowdSeparation(entity, candidate) {
  const config = getWorldMonsterCrowdControlConfig();
  if (!config || config.separationEnabled !== true || !isWorldMonsterCrowdCandidate(entity, config)) return candidate;
  const radius = getWorldMonsterCrowdSeparationRadius(entity, config);
  if (radius <= 0) return candidate;
  const padding = Math.max(0, Number(config.separationPaddingWorldPx || 10));
  const iterations = Math.max(1, Math.min(3, Math.floor(Number(config.separationIterations || 2))));
  const strength = Math.max(0.1, Math.min(1, Number(config.separationStrength || 0.62)));
  const maxPush = Math.max(2, Number(config.separationMaxPushWorldPx || 20));
  let result = { x:Number(candidate.x || 0), y:Number(candidate.y || 0) };

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const queryRadius = radius * 2 + padding + 40;
    const nearby = queryWorldMonsterEntitiesNear({ position:result }, queryRadius, { activeOnly:false });
    let pushX = 0;
    let pushY = 0;
    for (const other of nearby) {
      if (!other || other === entity || other._deathHandled || Number(other.currentHp || 0) <= 0) continue;
      if (!isWorldMonsterCrowdCandidate(other, config)) continue;
      const otherRadius = getWorldMonsterCrowdSeparationRadius(other, config);
      const dx = result.x - Number(other.position?.x || 0);
      const dy = result.y - Number(other.position?.y || 0);
      let distance = Math.hypot(dx, dy);
      const minimum = radius + otherRadius + padding;
      if (distance >= minimum) continue;
      let ux, uy;
      if (distance < 0.01) {
        const angle = ((Number(entity._instanceId || 1) * 2.3999632297) % (Math.PI * 2));
        ux = Math.cos(angle);
        uy = Math.sin(angle);
        distance = 0;
      } else {
        ux = dx / distance;
        uy = dy / distance;
      }
      const overlap = minimum - distance;
      pushX += ux * overlap * strength;
      pushY += uy * overlap * strength;
    }
    const magnitude = Math.hypot(pushX, pushY);
    if (magnitude < 0.01) break;
    const scale = Math.min(1, maxPush / magnitude);
    result = clampWorldMonsterPosition({ x:result.x + pushX * scale, y:result.y + pushY * scale });
  }
  return result;
}
window.resolveWorldMonsterCrowdSeparation = resolveWorldMonsterCrowdSeparation;

function moveWorldMonsterToward(entity, target, dt, stopDistance) {
  const dx = Number(target.x || 0) - Number(entity.position.x || 0);
  const dy = Number(target.y || 0) - Number(entity.position.y || 0);
  const distance = Math.hypot(dx, dy);
  if (distance <= stopDistance) return;
  const speed = typeof getMonsterMoveSpeedPx === "function" ? getMonsterMoveSpeedPx(entity) : 80;
  const step = Math.min(distance - stopDistance, Math.max(0, speed * dt));
  const next = {
    x: Number(entity.position.x || 0) + dx / Math.max(1, distance) * step,
    y: Number(entity.position.y || 0) + dy / Math.max(1, distance) * step
  };
  const safe = resolveWorldMonsterCrowdSeparation(entity, clampWorldMonsterPosition(next));
  entity.position.x = safe.x;
  entity.position.y = safe.y;
  refreshWorldMonsterSpatialEntity(entity);
}

function updateWorldMonsterWander(entity, dt, behavior) {
  if (!behavior.canMove || !behavior.randomWalk) {
    entity.aiState = "IDLE";
    entity._wanderTarget = null;
    return;
  }
  const now = Date.now();
  const target = entity._wanderTarget;
  if (target) {
    const distance = Math.hypot(Number(target.x || 0) - Number(entity.position.x || 0), Number(target.y || 0) - Number(entity.position.y || 0));
    if (distance <= 8) {
      entity._wanderTarget = null;
      entity._nextWanderAt = now + 900 + Math.random() * 2600;
      entity.aiState = "IDLE";
      return;
    }
    entity.aiState = "WANDER";
    moveWorldMonsterToward(entity, target, dt, 2);
    return;
  }
  if (now < Number(entity._nextWanderAt || 0)) {
    entity.aiState = "IDLE";
    return;
  }
  const angle = Math.random() * Math.PI * 2;
  const radius = 45 + Math.random() * 115;
  const origin = entity.spawnPosition || entity.position;
  const targetPosition = clampWorldMonsterPosition({
    x: Number(origin.x || 0) + Math.cos(angle) * radius,
    y: Number(origin.y || 0) + Math.sin(angle) * radius
  });
  if (Math.hypot(targetPosition.x - entity.position.x, targetPosition.y - entity.position.y) <= 8) {
    entity._nextWanderAt = now + 350;
    return;
  }
  entity._wanderTarget = targetPosition;
  entity.aiState = "WANDER";
  moveWorldMonsterToward(entity, targetPosition, dt, 2);
}

function worldMonsterAttackPlayer(entity) {
  if (!entity || Number(entity.currentHp || 0) <= 0 || !player || Number(player.hp || 0) <= 0 || typeof monsterAttackPlayer !== "function") return;
  const previousTarget = currentMonster;
  const autoRunning = typeof isAutoBattleRunning === "function" && isAutoBattleRunning();
  const manualTargetBefore = typeof getManualMonsterAttackTarget === "function" ? getManualMonsterAttackTarget() : null;
  const manualRunningBefore = typeof isManualMonsterAttackRunning === "function" && isManualMonsterAttackRunning();
  currentMonster = entity;
  monsterAttackPlayer({ respectCooldown: true, source: "world_monster_stream" });
  const previousStillValid = previousTarget && previousTarget !== entity && Number(previousTarget.currentHp || 0) > 0 && !previousTarget._deathHandled;
  if (Number(player.hp || 0) > 0 && previousStillValid) {
    currentMonster = previousTarget;
    if (typeof updateMonsterUI === "function") updateMonsterUI();
  }

  // 0.9.82II：未開啟自動掛機時，主動怪可以攻擊玩家，但不得自動啟動
  // 玩家連續反擊。這避免重新載入／進圖後按鈕未亮卻自行打怪；玩家仍可
  // 手動點擊怪物開始普通攻擊，或明確開啟自動掛機。
  if (!autoRunning && !manualRunningBefore && !previousStillValid && player && player.state === "Attacking") {
    player.state = "Idle";
  }
}

function getWorldMonsterRespawnRateForEntry(entry) {
  const valves = getWorldMonsterRuntimeValves();
  const category = String(entry?.category || "normal").toLowerCase();
  if (category === "plant") return Math.max(0, Number(valves.plantSpawnDelayRate || 0));
  if (isWorldMonsterUniqueCategory(category)) return Math.max(0, Number(valves.bossSpawnDelayRate || 0));
  return Math.max(0, Number(valves.normalSpawnDelayRate || 0));
}

function calculateWorldMonsterRespawnAt(entry, now = Date.now()) {
  const rate = getWorldMonsterRespawnRateForEntry(entry);
  const base = Math.max(0, Number(entry?.baseRespawnMs || 5000));
  const variance = getWorldMonsterRuntimeValves().spawnVariance
    ? Math.max(0, Number(entry?.respawnVarianceMs || 0))
    : 0;
  const raw = base + (variance > 0 ? Math.random() * variance : 0);
  return now + Math.max(0, Math.round(raw * rate / 100));
}

function onWorldMonsterDefeated(monster) {
  if (!monster?._worldTestEntity || monster._deathHandled) return false;
  const now = Date.now();
  monster.currentHp = 0;
  monster.aiState = "DEAD";
  monster._deathHandled = true;
  monster._respawnAt = calculateWorldMonsterRespawnAt(monster._spawnEntry, now);
  monster._despawnAt = now + 1250;
  clearWorldMonsterAggro(monster);
  monster._wanderTarget = null;
  playWorldMonsterTestMotion("dead", { monster, holdLast: true });

  if (isWorldMonsterUniqueCategory(monster._category)) {
    const state = getWorldMonsterUniquePersistentEntry(monster.id, true);
    if (state) {
      state.alive = false;
      state.currentHp = 0;
      state.position = monster.position ? { x: Math.round(monster.position.x), y: Math.round(monster.position.y) } : null;
      state.lastDeathAt = now;
      state.nextSpawnAt = monster._respawnAt;
    }
    if (typeof requestGameSave === "function") requestGameSave(400);
    else if (typeof saveGame === "function") { const deferSave = typeof setTimeout === "function" ? setTimeout : fn => fn(); deferSave(saveGame, 0); }
  } else {
    RO_WORLD_MONSTER_TEST.respawnQueue.push({
      entry: monster._spawnEntry,
      readyAt: monster._respawnAt,
      sourceInstanceId: monster._instanceId
    });
  }
  return true;
}
window.onWorldMonsterDefeated = onWorldMonsterDefeated;

function removeWorldMonsterEntity(entity) {
  if (!entity) return;
  unregisterWorldMonsterSpatialEntity(entity);
  removeWorldMonsterElement(entity);
  const index = RO_WORLD_MONSTER_TEST.entities.indexOf(entity);
  if (index >= 0) RO_WORLD_MONSTER_TEST.entities.splice(index, 1);
  if (currentMonster === entity) {
    currentMonster = null;
    if (typeof updateMonsterUI === "function") updateMonsterUI();
  }
}

function processWorldMonsterRespawnQueue(now) {
  if (!RO_WORLD_MONSTER_TEST.respawnQueue.length) return 0;
  const remaining = [];
  let spawned = 0;
  const target = getWorldMonsterWindowTargetCount();
  for (const item of RO_WORLD_MONSTER_TEST.respawnQueue) {
    if (Number(item.readyAt || 0) > now) {
      remaining.push(item);
      continue;
    }
    const ordinaryLiving = countWorldMonsterOrdinaryEntities({ activeOnly: true });
    const hardCap = Math.max(1, Number(getWorldMonsterRuntimeValves().normalHardCap || 120));
    if (ordinaryLiving >= target || countWorldMonsterOrdinaryEntities() >= hardCap) continue;
    const cap = Number(item.entry?.maxAlive ?? Infinity);
    if (Number.isFinite(cap) && countWorldMonsterEntitiesByEntry(item.entry) >= cap) continue;
    if (addWorldMonsterEntityFromEntry(item.entry, { avoidViewport: false, preferNear: true })) spawned += 1;
  }
  RO_WORLD_MONSTER_TEST.respawnQueue = remaining;
  return spawned;
}

function processWorldMonsterDeadEntities(now) {
  [...RO_WORLD_MONSTER_TEST.entities].forEach(entity => {
    if (!entity._deathHandled && Number(entity.currentHp || 0) <= 0) onWorldMonsterDefeated(entity);
    if (entity._deathHandled && Number(entity._despawnAt || 0) > 0 && now >= Number(entity._despawnAt || 0)) {
      removeWorldMonsterEntity(entity);
    }
  });
}

function isWorldMonsterProtectedFromStreamingCull(entity) {
  if (!entity) return false;
  if (isWorldMonsterUniqueCategory(entity._category)) return true;
  if (entity === currentMonster) return true;
  if (entity.provoked || ["CHASE", "ATTACK"].includes(String(entity.aiState || ""))) return true;
  if (entity._deathHandled || Number(entity.currentHp || 0) <= 0) return true;
  if (Number(entity._lastDamagedAt || 0) > Date.now() - 2000) return true;
  return false;
}

function cullWorldMonsterOrdinaryEntities(now) {
  const retainSize = getWorldMonsterRetainWindowWorldSize();
  const grace = Math.max(0, Number(getWorldMonsterRuntimeValves().normalOutsideCombatGraceMs || 5000));
  [...RO_WORLD_MONSTER_TEST.entities].forEach(entity => {
    if (isWorldMonsterUniqueCategory(entity._category) || entity._deathHandled) return;
    if (isWorldMonsterInsideSquare(entity, retainSize)) {
      entity._outsideRetainSince = 0;
      return;
    }
    if (isWorldMonsterProtectedFromStreamingCull(entity)) {
      entity._outsideRetainSince = 0;
      return;
    }
    if (!entity._outsideRetainSince) entity._outsideRetainSince = now;
    if (now - Number(entity._outsideRetainSince || now) >= grace) removeWorldMonsterEntity(entity);
  });
}

function maintainWorldMonsterUniqueEntries(now) {
  const entries = getWorldMonsterPoolEntries(["rare", "boss", "mvp"]);
  entries.forEach(entry => {
    if (countWorldMonsterEntitiesByEntry(entry) > 0) return;
    const state = getWorldMonsterUniquePersistentEntry(entry.monsterId, true);
    if (state?.alive === false && Number(state.nextSpawnAt || 0) > now) return;
    addWorldMonsterEntityFromEntry(entry, { avoidViewport: false });
  });
}

function maintainWorldMonsterPopulation(now = Date.now(), options = {}) {
  if (!isWorldMonsterTestActive()) return;
  processWorldMonsterDeadEntities(now);
  cullWorldMonsterOrdinaryEntities(now);
  processWorldMonsterRespawnQueue(now);
  maintainWorldMonsterUniqueEntries(now);
  populateWorldMonsterOrdinaryTarget({ initial: Boolean(options.initial) });

  if (now - Number(RO_WORLD_MONSTER_TEST.savedMapSnapshotAt || 0) >= 5000) {
    RO_WORLD_MONSTER_TEST.entities.forEach(syncWorldMonsterUniquePersistentState);
    RO_WORLD_MONSTER_TEST.savedMapSnapshotAt = now;
  }
}
window.maintainWorldMonsterPopulation = maintainWorldMonsterPopulation;

function updateWorldMonsterFieldTest(dt = 0.05) {
  const entities = ensureWorldMonsterFieldTest();
  if (!entities.length || !player?.position || player.currentCity) return;
  const now = Date.now();
  if (now - Number(RO_WORLD_MONSTER_TEST.lastMaintenanceAt || 0) >= Math.max(100, Number(getWorldMonsterRuntimeValves().spawnMaintenanceMs || 500))) {
    maintainWorldMonsterPopulation(now);
    RO_WORLD_MONSTER_TEST.lastMaintenanceAt = now;
  } else {
    processWorldMonsterDeadEntities(now);
  }

  const activeSize = getWorldMonsterActiveWindowWorldSize();
  const castState = typeof getRuntimeSkillCastState === "function" ? getRuntimeSkillCastState() : null;
  const casting = Boolean(getWorldMonsterRuntimeValves().castSensorEnabled !== false && castState?.active !== false && Number(castState?.endsAt || 0) > now);
  let crowdPlanDirty = false;

  // Mark newly detected targets first, then rebuild the dense-arena plan once.
  // This avoids an O(n²) burst when many MVPs notice the player on the same tick.
  for (const entity of RO_WORLD_MONSTER_TEST.entities) {
    if (!entity || entity._deathHandled || Number(entity.currentHp || 0) <= 0 || entity.provoked) continue;
    const behavior = typeof getMonsterAiBehavior === "function" ? getMonsterAiBehavior(entity) : (entity.behavior || {});
    const distance = Math.hypot(
      Number(player.position.x || 0) - Number(entity.position?.x || 0),
      Number(player.position.y || 0) - Number(entity.position?.y || 0)
    );
    const viewRange = typeof getMonsterViewRangePx === "function" ? getMonsterViewRangePx(entity) : 360;
    if (behavior.aggressive && distance <= viewRange) {
      markWorldMonsterAttacked(entity, { reason:"aggressive", propagateAssist:false });
      crowdPlanDirty = true;
    } else if (behavior.castSensorIdle && casting && distance <= viewRange) {
      markWorldMonsterAttacked(entity, { reason:"cast_sensor", propagateAssist:false });
      crowdPlanDirty = true;
    }
  }

  const crowdPlan = refreshWorldMonsterCrowdPlan(now, { force:crowdPlanDirty });
  [...RO_WORLD_MONSTER_TEST.entities].forEach(entity => {
    if (entity._deathHandled || Number(entity.currentHp || 0) <= 0) {
      entity.aiState = "DEAD";
      return;
    }
    const dx = Number(player.position.x || 0) - Number(entity.position.x || 0);
    const dy = Number(player.position.y || 0) - Number(entity.position.y || 0);
    const distance = Math.hypot(dx, dy);
    const assignment = crowdPlan?.assignments?.get(Number(entity._instanceId || 0)) || null;
    const aiInterval = getWorldMonsterAiIntervalMs(entity, distance, assignment);
    const effectiveDt = getWorldMonsterEffectiveAiDt(entity, now, dt, aiInterval);
    if (effectiveDt <= 0) return;

    const behavior = typeof getMonsterAiBehavior === "function" ? getMonsterAiBehavior(entity) : (entity.behavior || {});
    const attackRange = typeof getMonsterAttackRangePx === "function" ? getMonsterAttackRangePx(entity) : 55;
    const baseChaseRange = typeof getMonsterChaseRangePx === "function" ? getMonsterChaseRangePx(entity) : 432;
    const retaliationRange = typeof getMonsterRetaliationChaseRangePx === "function"
      ? getMonsterRetaliationChaseRangePx(entity)
      : Math.max(baseChaseRange, Number(getWorldMonsterRuntimeValves().retaliationChaseMinCells || 24) * 36);
    const leashRange = Math.max(retaliationRange, Number(getWorldMonsterRuntimeValves().retaliationLeashCells || 34) * 36);

    // Retaliating/chasing monsters keep their AI awake even outside the ordinary streaming square.
    if (!isWorldMonsterInsideSquare(entity, activeSize) && !entity.provoked) {
      entity.aiState = "SUSPENDED";
      return;
    }
    if (!behavior.canMove) {
      entity.aiState = entity.provoked ? "ANGRY" : "IDLE";
      if (entity.provoked && behavior.canAttack && distance <= attackRange && assignment?.engaged !== false) worldMonsterAttackPlayer(entity);
      return;
    }

    // Prevent the hurt frame from sliding across the ground. RA DamageMotion briefly locks movement,
    // then RUSH/CHASE immediately returns to the normal walk animation.
    if (now < Number(entity._hurtLockUntil || 0)) {
      entity.aiState = "HURT";
      return;
    }
    if (entity._animation?.overrideMotion === "hurt") {
      entity._animation.overrideMotion = null;
      entity._animation.overrideHoldLast = false;
      entity._animation.frameCursor = 0;
      entity._animation.frameElapsed = 0;
    }

    if (entity.provoked) {
      entity._aggroLastSeenAt = distance <= leashRange ? now : Number(entity._aggroLastSeenAt || 0);
      const forgetMs = Math.max(0, Number(getWorldMonsterRuntimeValves().aggroForgetMs || 12000));
      if (distance > leashRange || now - Number(entity._aggroLastSeenAt || entity._aggroSince || now) >= forgetMs) {
        clearWorldMonsterAggro(entity);
        crowdPlanDirty = true;
        updateWorldMonsterWander(entity, effectiveDt, behavior);
        return;
      }

      if (assignment && assignment.engaged === false) {
        // Dense MVP arenas keep the full population alive, but only a bounded front line
        // may attack at once. The remaining MVPs occupy deterministic reserve rings.
        entity.aiState = "RESERVE";
        const reserveTarget = getWorldMonsterCrowdTarget(entity, assignment, attackRange);
        if (reserveTarget) moveWorldMonsterToward(entity, reserveTarget, effectiveDt, 8);
        return;
      }

      const crowdTarget = assignment?.engaged ? getWorldMonsterCrowdTarget(entity, assignment, attackRange) : null;
      if (crowdTarget) {
        const slotDistance = Math.hypot(
          Number(crowdTarget.x || 0) - Number(entity.position.x || 0),
          Number(crowdTarget.y || 0) - Number(entity.position.y || 0)
        );
        if (slotDistance > 14) {
          entity.aiState = ["damage","assist"].includes(String(entity._aggroReason)) ? "RUSH" : "CHASE";
          moveWorldMonsterToward(entity, crowdTarget, effectiveDt, 5);
          return;
        }
      }

      if (distance <= attackRange) {
        entity.aiState = "ATTACK";
        if (behavior.canAttack) worldMonsterAttackPlayer(entity);
        return;
      }
      if (distance <= (entity._aggroReason === "aggressive" ? baseChaseRange : retaliationRange)) {
        entity.aiState = ["damage","assist"].includes(String(entity._aggroReason)) ? "RUSH" : "CHASE";
        moveWorldMonsterToward(entity, crowdTarget || player.position, effectiveDt, crowdTarget ? 5 : attackRange * 0.86);
        return;
      }
    }
    updateWorldMonsterWander(entity, effectiveDt, behavior);
  });
  if (crowdPlanDirty) refreshWorldMonsterCrowdPlan(now, { force:true });
}
window.updateWorldMonsterFieldTest = updateWorldMonsterFieldTest;

function updateWorldMonsterHpBarFast(entity) {
  if (!entity?._element) return false;
  const maxHp = Math.max(1, Number(entity.maxHp || entity.hp || 1));
  const currentHp = Math.max(0, Number(entity.currentHp || 0));
  if (currentHp < maxHp) entity._hpBarRevealed = true;
  const shouldShow = entity._hpBarRevealed === true && currentHp > 0;
  if (entity._hpVisibleState !== shouldShow) {
    entity._hpVisibleState = shouldShow;
    entity._element.classList.toggle("hp-revealed", shouldShow);
  }
  const ratio = Math.max(0, Math.min(1, currentHp / maxHp));
  if (!Number.isFinite(entity._lastHpRatio) || Math.abs(entity._lastHpRatio - ratio) > 0.0001) {
    entity._lastHpRatio = ratio;
    const fill = entity._hpFillElement || entity._element.querySelector(".world-monster-hp span");
    if (fill) {
      entity._hpFillElement = fill;
      fill.style.transform = `scaleX(${ratio})`;
    }
  }
  return true;
}
window.updateWorldMonsterHpBarFast = updateWorldMonsterHpBarFast;

function updateWorldMonsterFieldTestUi(entity) {
  if (!entity?._element) return;
  const aiState = String(entity.aiState || "IDLE");
  if (entity._uiAiState !== aiState) {
    entity._uiAiState = aiState;
    entity._element.dataset.aiState = aiState;
  }
  const selected = entity === currentMonster;
  const dead = Number(entity.currentHp || 0) <= 0 || entity._deathHandled;
  const damaged = Number(entity._lastDamagedAt || 0) > Date.now() - 1800;
  if (entity._uiSelected !== selected) { entity._uiSelected = selected; entity._element.classList.toggle("is-selected", selected); }
  if (entity._uiDead !== dead) { entity._uiDead = dead; entity._element.classList.toggle("is-dead", dead); }
  if (entity._uiDamaged !== damaged) { entity._uiDamaged = damaged; entity._element.classList.toggle("is-damaged", damaged); }
  updateWorldMonsterHpBarFast(entity);
}
window.updateWorldMonsterFieldTestUi = updateWorldMonsterFieldTestUi;

function shouldRenderWorldMonsterEntity(entity) {
  if (!entity?.position) return false;
  if (entity === currentMonster) return true;
  const padding = Math.max(0, Number(getWorldMonsterRuntimeValves().renderPaddingWorldPx || 260));
  return isWorldMonsterPositionInsideViewport(entity.position, padding);
}

function getWorldMonsterRenderIntervalMs(entity, visibleCount = 1) {
  const config = getWorldMonsterCrowdControlConfig();
  if (!config || !isWorldMonsterCrowdCandidate(entity, config)) return 0;
  if (entity === currentMonster || entity._crowdEngaged || entity.aiState === "HURT" || entity.aiState === "DEAD") {
    return Math.max(16, Number(config.renderEngagedIntervalMs || 32));
  }
  if (Number(visibleCount || 0) >= Math.max(8, Number(config.crowdedVisibleThreshold || 20))) {
    return Math.max(60, Number(config.renderCrowdedIntervalMs || 125));
  }
  return Math.max(45, Number(config.renderReserveIntervalMs || 90));
}
window.getWorldMonsterRenderIntervalMs = getWorldMonsterRenderIntervalMs;

function renderWorldMonsterFieldTest(timestamp = performance.now()) {
  const entities = ensureWorldMonsterFieldTest();
  if (!entities.length) return;
  const camera = typeof getMapCameraOffset === "function" ? getMapCameraOffset() : { x: 0, y: 0 };
  const generation = RO_WORLD_MONSTER_TEST.loadGeneration;
  const visibleEntities = [];

  entities.forEach(entity => {
    if (shouldRenderWorldMonsterEntity(entity)) visibleEntities.push(entity);
    else if (entity._element) removeWorldMonsterElement(entity);
  });
  const visibleCount = visibleEntities.length;

  visibleEntities.forEach(entity => {
    if (!entity._element) createWorldMonsterElement(entity);
    if (!entity._animation.asset && !entity._assetLoading) prepareWorldMonsterEntity(entity, generation);
    const element = entity._element;
    const asset = entity._animation.asset;
    if (!element || !asset) return;

    const interval = getWorldMonsterRenderIntervalMs(entity, visibleCount);
    if (interval > 0 && Number(timestamp || 0) < Number(entity._nextRenderAt || 0)) return;
    const stagger = interval > 0 ? (Number(entity._instanceId || 0) % 7) * 2 : 0;
    entity._nextRenderAt = Number(timestamp || 0) + interval + stagger;

    const scale = Math.max(0.1, Number(currentMap?.monsterGlobalScale ?? 1) * Number(entity.displayScale || 1));
    const left = Number(entity.position.x || 0) - Number(camera.x || 0) - asset.bounds.anchorX * scale;
    const top = Number(entity.position.y || 0) - Number(camera.y || 0) - asset.bounds.anchorY * scale;
    const roundedLeft = Math.round(left);
    const roundedTop = Math.round(top);
    const zIndex = getWorldMonsterDepthZIndex(entity);
    if (entity._lastRenderLeft !== roundedLeft) {
      entity._lastRenderLeft = roundedLeft;
      element.style.setProperty("left", `${roundedLeft}px`, "important");
    }
    if (entity._lastRenderTop !== roundedTop) {
      entity._lastRenderTop = roundedTop;
      element.style.setProperty("top", `${roundedTop}px`, "important");
    }
    if (entity._lastRenderZ !== zIndex) {
      entity._lastRenderZ = zIndex;
      element.style.zIndex = String(zIndex);
    }
    updateWorldMonsterFieldTestUi(entity);
    renderWorldMonsterTestFrame(entity, timestamp);
    const localAnchor = entity._damageNumberAnchorLocal;
    if (localAnchor) {
      const anchorX = left + Number(localAnchor.x || 0);
      const anchorY = top + Number(localAnchor.y || 0);
      entity._damageNumberAnchorScreen = {
        x:anchorX,
        y:anchorY,
        updatedAt:Number(timestamp || 0)
      };
      entity._damageNumberAnchorWorld = {
        x:anchorX + Number(camera.x || 0),
        y:anchorY + Number(camera.y || 0),
        updatedAt:Number(timestamp || 0)
      };
    }
  });
  if (typeof window.refreshWorldAnchoredDamageNumbers === "function") {
    window.refreshWorldAnchoredDamageNumbers(camera);
  }
}
window.renderWorldMonsterFieldTest = renderWorldMonsterFieldTest;

function tickWorldMonsterFieldTest(timestamp) {
  if (isWorldMonsterTestActive()) renderWorldMonsterFieldTest(timestamp);
  RO_WORLD_MONSTER_TEST.lastTimestamp = timestamp;
  requestAnimationFrame(tickWorldMonsterFieldTest);
}

async function initWorldMonsterFieldTestRuntime() {
  if (RO_WORLD_MONSTER_TEST.ready) return true;
  RO_WORLD_MONSTER_TEST.config = await loadJson("./data/monster_spawn_config.json", {
    global: { ...RO_WORLD_MONSTER_DEFAULTS },
    regions: {}
  });
  RO_WORLD_MONSTER_SPATIAL_INDEX.cellSize = Math.max(96, Math.round(Number(RO_WORLD_MONSTER_TEST.config?.global?.spatialCellSizeWorldPx || 288)));
  RO_WORLD_MONSTER_TEST.ready = true;
  if (player?.currentCity) clearWorldMonsterFieldTest({ persist: false, save: false });
  else ensureWorldMonsterFieldTest();
  if (!RO_WORLD_MONSTER_TEST.rafStarted) {
    RO_WORLD_MONSTER_TEST.rafStarted = true;
    requestAnimationFrame(tickWorldMonsterFieldTest);
  }
  return true;
}
window.initWorldMonsterFieldTestRuntime = initWorldMonsterFieldTestRuntime;

// Route battle animation hooks to the matching streaming entity while preserving
// the original singleton runtime for non-world maps.
if (!window.__roWorldMonsterMotionWrapped) {
  window.__roWorldMonsterMotionWrapped = true;
  const originalPlay = window.playROStudioMonsterMotion;
  window.playROStudioMonsterMotion = function(motion, options = {}) {
    if (options?.monster?._worldTestEntity) return playWorldMonsterTestMotion(motion, options);
    return typeof originalPlay === "function" ? originalPlay(motion, options) : false;
  };
}
