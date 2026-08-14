//=======================================
// RO Studio Monster Atlas Runtime v1.0
// V0.9.82DH: 4-direction, tight atlas, RA AI behavior test.
//=======================================

const RO_STUDIO_MONSTER_ATLAS = {
  ready: false,
  canvas: null,
  ctx: null,
  cache: new Map(),
  loadToken: 0,
  monsterId: null,
  monsterRef: null,
  data: null,
  image: null,
  frameById: new Map(),
  bounds: null,
  anchorRatio: { x: .5, y: 1, rawX: 0, rawY: 0 },
  direction: "south_west",
  lastPosition: null,
  lastTime: 0,
  motion: "idle",
  frameCursor: 0,
  frameElapsed: 0,
  overrideMotion: null,
  overrideHoldLast: false,
  overrideMonster: null,
  hiddenAfter: 0,
  pendingMotion: null
};
window.RO_STUDIO_MONSTER_ATLAS = RO_STUDIO_MONSTER_ATLAS;
const RO_STUDIO_MONSTER_CACHE_LIMIT = 12;
const RO_STUDIO_MONSTER_RELEASE_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

function getROStudioMonsterGlobalScale() {
  return Math.max(.1, Number(currentMap?.monsterGlobalScale ?? 1));
}
window.getROStudioMonsterGlobalScale = getROStudioMonsterGlobalScale;

function setupROStudioMonsterCanvas() {
  const state = RO_STUDIO_MONSTER_ATLAS;
  const host = document.getElementById("monster-sprite");
  const legacy = document.getElementById("monsterImage");
  if (!host) return null;
  let canvas = document.getElementById("monsterAtlasCanvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "monsterAtlasCanvas";
    canvas.setAttribute("aria-label", "monster atlas animation");
    if (legacy) legacy.insertAdjacentElement("afterend", canvas); else host.appendChild(canvas);
  }
  state.canvas = canvas;
  state.ctx = canvas.getContext("2d");
  state.ctx.imageSmoothingEnabled = false;
  return canvas;
}

function loadROStudioMonsterImage(path) {
  return new Promise((resolve, reject) => {
    const image = document.createElement("img");
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Monster atlas image load failed: ${path}`));
    image.src = path;
  });
}

function getMonsterAnimationFrameIds(data, motion, direction) {
  const entry = data?.animations?.[motion];
  const raw = entry?.directions?.[direction]?.frames ?? entry?.[direction] ?? [];
  return Array.isArray(raw) ? raw : [];
}

function calculateMonsterAtlasBounds(data) {
  const frames = Array.isArray(data?.frames) ? data.frames : [];
  let left = 0, top = 0, right = 1, bottom = 1;
  frames.forEach(frame => {
    left = Math.min(left, -Number(frame.pivotX || 0));
    top = Math.min(top, -Number(frame.pivotY || 0));
    right = Math.max(right, Number(frame.width || 1) - Number(frame.pivotX || 0));
    bottom = Math.max(bottom, Number(frame.height || 1) - Number(frame.pivotY || 0));
  });
  return { left, top, right, bottom, width: Math.max(1, right-left), height: Math.max(1, bottom-top), anchorX: -left, anchorY: -top };
}

async function loadROStudioMonsterAsset(monster) {
  if (!monster?.animationJson || !monster?.animationAtlas) return null;
  const state = RO_STUDIO_MONSTER_ATLAS;
  const id = Number(monster.id);
  if (state.cache.has(id)) {
    const cached = state.cache.get(id);
    state.cache.delete(id);
    state.cache.set(id,cached);
    return cached;
  }
  const data = await loadJson(`./${String(monster.animationJson).replace(/^\.\//, "")}`, null);
  if (!data) throw new Error(`Monster animation JSON missing: ${monster.animationJson}`);
  const image = await loadROStudioMonsterImage(monster.animationAtlas);
  const asset = { data, image, frameById: new Map((data.frames || []).map(frame => [Number(frame.id), frame])), bounds: calculateMonsterAtlasBounds(data) };
  state.cache.set(id, asset);
  // V0.9.88B3: legacy/single-monster maps previously retained every species atlas
  // seen during the whole tab lifetime. World-streamed maps bypass this runtime,
  // but bounding the legacy cache prevents cross-map accumulation too.
  while (state.cache.size > RO_STUDIO_MONSTER_CACHE_LIMIT) {
    const oldestId = state.cache.keys().next().value;
    const evicted = state.cache.get(oldestId);
    state.cache.delete(oldestId);
    if (evicted && evicted !== asset && evicted.image !== state.image) {
      try { evicted.image.onload=null; evicted.image.onerror=null; evicted.image.src=RO_STUDIO_MONSTER_RELEASE_PIXEL; } catch (_) {}
      try { evicted.frameById?.clear?.(); } catch (_) {}
    }
  }
  return asset;
}

function applyROStudioMonsterLayout() {
  const state = RO_STUDIO_MONSTER_ATLAS;
  const host = document.getElementById("monster-sprite");
  const canvas = state.canvas;
  if (!host || !canvas || !state.bounds) return;
  const scale = getROStudioMonsterGlobalScale();
  const width = Math.max(1, Math.ceil(state.bounds.width * scale));
  const height = Math.max(1, Math.ceil(state.bounds.height * scale));
  const anchorX = state.bounds.anchorX * scale;
  const anchorY = state.bounds.anchorY * scale;
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  host.style.setProperty("width", `${width}px`, "important");
  host.style.setProperty("height", `${height}px`, "important");
  host.style.setProperty("min-width", "0px", "important");
  host.dataset.atlasActive = "true";
  state.anchorRatio = { x: anchorX / width, y: anchorY / height, rawX: anchorX, rawY: anchorY };
}

function getROStudioMonsterAnchorRatio() {
  return RO_STUDIO_MONSTER_ATLAS.anchorRatio;
}
window.getROStudioMonsterAnchorRatio = getROStudioMonsterAnchorRatio;

async function syncROStudioMonsterAtlas(monster = window.currentMonster) {
  const state = RO_STUDIO_MONSTER_ATLAS;
  setupROStudioMonsterCanvas();
  if (!monster?.useAnimatedAtlas) {
    if (!state.overrideMotion) deactivateROStudioMonsterAtlas();
    return false;
  }
  const id = Number(monster.id);
  if (state.monsterId === id && state.monsterRef === monster && state.data && state.image) return true;
  const token = ++state.loadToken;
  try {
    const asset = await loadROStudioMonsterAsset(monster);
    if (!asset || token !== state.loadToken) return false;
    state.monsterId = id;
    state.monsterRef = monster;
    state.data = asset.data;
    state.image = asset.image;
    state.frameById = asset.frameById;
    state.bounds = asset.bounds;
    state.motion = "idle";
    state.frameCursor = 0;
    state.frameElapsed = 0;
    state.overrideMotion = null;
    state.overrideHoldLast = false;
    state.overrideMonster = null;
    state.hiddenAfter = 0;
    state.lastPosition = monster.position ? { x:Number(monster.position.x||0), y:Number(monster.position.y||0) } : null;
    applyROStudioMonsterLayout();
    document.getElementById("monsterImage")?.setAttribute("hidden", "");
    const placeholder = document.querySelector("#monster-sprite .monster-placeholder");
    if (placeholder) placeholder.style.display = "none";
    return true;
  } catch (error) {
    console.warn("Monster atlas sync failed", monster, error);
    deactivateROStudioMonsterAtlas();
    return false;
  }
}
window.syncROStudioMonsterAtlas = syncROStudioMonsterAtlas;

function deactivateROStudioMonsterAtlas() {
  const state = RO_STUDIO_MONSTER_ATLAS;
  const host = document.getElementById("monster-sprite");
  if (host) host.dataset.atlasActive = "false";
  if (state.canvas && state.ctx) state.ctx.clearRect(0,0,state.canvas.width,state.canvas.height);
  state.monsterId = null; state.monsterRef = null; state.data = null; state.image = null; state.frameById = new Map(); state.bounds = null;
}
window.deactivateROStudioMonsterAtlas = deactivateROStudioMonsterAtlas;

function getROStudioMonsterDirection(monster) {
  const state = RO_STUDIO_MONSTER_ATLAS;
  let dx = 0, dy = 0;
  if (monster?.position && state.lastPosition) {
    dx = Number(monster.position.x||0) - Number(state.lastPosition.x||0);
    dy = Number(monster.position.y||0) - Number(state.lastPosition.y||0);
  }
  if (Math.hypot(dx,dy) < .25 && monster?.position && player?.position && ["CHASE","ATTACK"].includes(String(monster.aiState||""))) {
    dx = Number(player.position.x||0) - Number(monster.position.x||0);
    dy = Number(player.position.y||0) - Number(monster.position.y||0);
  }
  if (monster?.position) state.lastPosition = { x:Number(monster.position.x||0), y:Number(monster.position.y||0) };
  if (Math.hypot(dx,dy) < .25) return state.direction;
  if (dx < 0 && dy >= 0) return "south_west";
  if (dx < 0 && dy < 0) return "north_west";
  if (dx >= 0 && dy < 0) return "north_east";
  return "south_east";
}

function getROStudioMonsterAutoMotion(monster) {
  const ai = String(monster?.aiState || "IDLE");
  if (ai === "CHASE" || ai === "WANDER") return "walk";
  return "idle";
}

function playROStudioMonsterMotion(motion, options = {}) {
  const state = RO_STUDIO_MONSTER_ATLAS;
  const monster = options.monster || window.currentMonster || state.monsterRef;
  if (!monster?.useAnimatedAtlas) return false;
  if (state.monsterId !== Number(monster.id) || !state.data) {
    state.pendingMotion = { motion, options:{...options, monster} };
    syncROStudioMonsterAtlas(monster).then(ok => { if (ok && state.pendingMotion) { const p=state.pendingMotion; state.pendingMotion=null; playROStudioMonsterMotion(p.motion,p.options); } });
    return true;
  }
  state.overrideMotion = motion;
  state.overrideHoldLast = Boolean(options.holdLast || motion === "dead");
  state.overrideMonster = monster;
  state.frameCursor = 0;
  state.frameElapsed = 0;
  state.hiddenAfter = Number(options.hiddenAfter || 0);
  return true;
}
window.playROStudioMonsterMotion = playROStudioMonsterMotion;

function isROStudioMonsterDeathPlaying() {
  return RO_STUDIO_MONSTER_ATLAS.overrideMotion === "dead";
}
window.isROStudioMonsterDeathPlaying = isROStudioMonsterDeathPlaying;

function renderROStudioMonsterFrame(frame) {
  const state = RO_STUDIO_MONSTER_ATLAS;
  const ctx = state.ctx, canvas = state.canvas;
  if (!ctx || !canvas || !state.image || !frame || !state.bounds) return;
  const scale = getROStudioMonsterGlobalScale();
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.imageSmoothingEnabled = false;
  const dx = (state.bounds.anchorX - Number(frame.pivotX||0)) * scale;
  const dy = (state.bounds.anchorY - Number(frame.pivotY||0)) * scale;
  const sourceX=Number(frame.x||0), sourceY=Number(frame.y||0), sourceWidth=Number(frame.width||1), sourceHeight=Number(frame.height||1);
  const drawX=Math.round(dx), drawY=Math.round(dy);
  const drawWidth=Math.max(1,Math.round(sourceWidth*scale)), drawHeight=Math.max(1,Math.round(sourceHeight*scale));
  if (frame.flipX === true) {
    ctx.save();
    ctx.translate(drawX + drawWidth, drawY);
    ctx.scale(-1, 1);
    ctx.drawImage(state.image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, drawWidth, drawHeight);
    ctx.restore();
  } else {
    ctx.drawImage(state.image, sourceX, sourceY, sourceWidth, sourceHeight, drawX, drawY, drawWidth, drawHeight);
  }
  canvas.dataset.flipX = frame.flipX === true ? "true" : "false";
}

function tickROStudioMonsterAtlas(timestamp) {
  const state = RO_STUDIO_MONSTER_ATLAS;
  // 妙勒尼四怪同場測試由 world_monster_test_runtime 管理多實體，
  // 單體 Runtime 暫停，避免隱藏 DOM 重複解碼與繪圖。
  if (currentMap?.monsterVisualTest && typeof isWorldMonsterTestActive === "function" && isWorldMonsterTestActive()) {
    state.lastTime = timestamp;
    requestAnimationFrame(tickROStudioMonsterAtlas);
    return;
  }
  const monster = state.overrideMonster || window.currentMonster;
  if (monster?.useAnimatedAtlas && (state.monsterId !== Number(monster.id) || state.monsterRef !== monster) && !state.overrideMotion) syncROStudioMonsterAtlas(monster);
  if (state.data && state.image) {
    applyROStudioMonsterLayout();
    state.direction = getROStudioMonsterDirection(monster || state.monsterRef);
    const motion = state.overrideMotion || getROStudioMonsterAutoMotion(monster || state.monsterRef);
    if (state.motion !== motion) { state.motion=motion; state.frameCursor=0; state.frameElapsed=0; }
    const ids = getMonsterAnimationFrameIds(state.data, motion, state.direction);
    if (ids.length) {
      const dt = Math.min(100,Math.max(0,timestamp-(state.lastTime||timestamp)));
      state.frameElapsed += dt;
      let frame = state.frameById.get(Number(ids[Math.min(state.frameCursor,ids.length-1)]));
      const duration = Math.max(24,Number(frame?.durationMs||96));
      while (state.frameElapsed >= duration && ids.length) {
        state.frameElapsed -= duration;
        if (state.overrideMotion) {
          if (state.frameCursor < ids.length-1) state.frameCursor++;
          else if (state.overrideHoldLast) { state.frameCursor=ids.length-1; }
          else { state.overrideMotion=null; state.overrideMonster=null; state.frameCursor=0; state.motion=getROStudioMonsterAutoMotion(window.currentMonster); break; }
        } else state.frameCursor=(state.frameCursor+1)%ids.length;
        frame = state.frameById.get(Number(ids[Math.min(state.frameCursor,ids.length-1)]));
      }
      renderROStudioMonsterFrame(frame);
      document.getElementById("monster-sprite")?.setAttribute("data-atlas-active","true");
    }
  }
  state.lastTime=timestamp;
  requestAnimationFrame(tickROStudioMonsterAtlas);
}

function initROStudioMonsterAtlasRuntime() {
  setupROStudioMonsterCanvas();
  if (!RO_STUDIO_MONSTER_ATLAS.ready) {
    RO_STUDIO_MONSTER_ATLAS.ready=true;
    requestAnimationFrame(tickROStudioMonsterAtlas);
  }
  if (window.currentMonster) syncROStudioMonsterAtlas(window.currentMonster);
}
window.initROStudioMonsterAtlasRuntime = initROStudioMonsterAtlasRuntime;
