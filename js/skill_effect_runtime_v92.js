// ================================================================
// RO_WEB V0.9.83E1 / Generic 12 Shared Skill Effect Runtime
// - 3 progression tiers x 4 categories = 12 shared effects only.
// - Offensive visuals anchor to the runtime target/monster.
// - Buff/support visuals anchor to the caster/player.
// - Passive/pending/disabled skills are never scheduled.
// - Legacy per-skill effect assets have been retired.
// ================================================================
(() => {
  'use strict';

  const VERSION = '0.9.83E1';
  const BASE = './assets/skill_effects/v92/';
  const MANIFEST_URL = `${BASE}V92_RUNTIME_TIMELINE_MANIFEST.json`;
  const EFFECT_MANIFEST_URL = `${BASE}V92_EFFECT_MANIFEST.json`;
  const GATE_URL = `${BASE}V92_RUNTIME_GATE_INDEX.json`;
  const ADDITIVE_PAIRS = new Set(['1:1','5:1','5:2','5:6','1:6','7:6','6:6','6:1','7:1']);
  const BEGIN_TRIGGERS = new Set(['SKILL_BEGIN','CAST_BEGIN']);
  const COMMIT_TRIGGERS = new Set(['CAST_COMPLETE','PROJECTILE_LAUNCH','GROUND_SPAWN','DAMAGE_COMMIT','LOOP_START','SKILL_END']);
  const HIT_TRIGGERS = new Set(['HIT_CONFIRM']);
  // 0.9.82IE：地面特效座標政策。GROUND_CELL／GROUND_SPAWN 在事件觸發瞬間
  // 取得目標腳下的世界座標快照；強酸禁地三系的所有目標端視覺也視為
  // 地面爆發，固定於命中瞬間的位置，不再跟隨玩家或怪物移動。
  const GROUND_SNAPSHOT_SKILL_IDS = new Set();
  const GROUND_SNAPSHOT_TRIGGERS = new Set(['GROUND_SPAWN']);

  const state = {
    ready: false,
    loading: null,
    loadError: null,
    manifest: null,
    effectManifest: null,
    gate: null,
    skills: new Map(),
    effects: new Map(),
    effectData: new Map(),
    imageCache: new Map(),
    instances: [],
    lifecycle: new Map(),
    timers: new Set(),
    latestCast: new Map(),
    lastHit: new Map(),
    latestTarget: new Map(),
    pendingGroundEvents: new Map(),
    canvases: null,
    raf: 0,
    lastMapIdentity: '',
    lastPlayerIdentity: '',
    scratch: null,
    diagnostics: {
      begins: 0, commits: 0, hits: 0, skippedPassive: 0,
      playedEvents: 0, loadedEffects: 0, loadFailures: 0,
      clearedLifecycles: 0, fixedGroundAnchors: 0,
      liveCasterAnchors: 0, liveTargetAnchors: 0, projectileAnchors: 0,
      targetPayloadsCaptured: 0, targetPayloadMisses: 0,
      pendingGroundQueued: 0, pendingGroundFlushed: 0,
      skippedGroundWithoutTarget: 0, repairedGroundAnchors: 0,
      authoritativeGroundPayloads: 0, authoritativeGroundMisses: 0, forcedGroundRelocations: 0,
      exactTargetEntityHits: 0, ambiguousTargetIdentityRejects: 0, invalidTargetElementRejects: 0
    }
  };

  function normalizePath(path) {
    return String(path || '').replace(/^\.\//, '').replace(/\\/g, '/');
  }

  async function loadJson(url) {
    const key = normalizePath(url);
    const bundled = window.RO_WEB_DATA?.[key] ?? window.RO_WEB_DATA?.[`./${key}`];
    if (bundled !== undefined) return bundled;
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response.json();
  }

  function runtimeRow(skillOrId) {
    const id = String(typeof skillOrId === 'object'
      ? (skillOrId?.officialId ?? skillOrId?.skillId ?? skillOrId?.id ?? 0)
      : (skillOrId ?? 0));
    try {
      if (typeof skillsData !== 'undefined') return skillsData?.runtimeProfiles?.[id] || null;
    } catch (_) {}
    return null;
  }

  function runtimeHandler(skillOrId) {
    const row = runtimeRow(skillOrId);
    const profile = row?.runtimeProfile || row || {};
    if (profile?.handler) return String(profile.handler).toLowerCase();
    try {
      if (typeof getSkillRuntimeProfile === 'function') {
        const fallback = getSkillRuntimeProfile(skillOrId) || {};
        return String(fallback.handler || '').toLowerCase();
      }
    } catch (_) {}
    return '';
  }

  function isEligible(skillOrId) {
    const id = Number(typeof skillOrId === 'object'
      ? (skillOrId?.officialId ?? skillOrId?.skillId ?? skillOrId?.id ?? 0)
      : skillOrId);
    if (!Number.isFinite(id) || !state.skills.has(id)) return false;
    const handler = runtimeHandler(skillOrId);
    if (handler === 'passive' || handler === 'pending' || !handler) {
      if (handler === 'passive') state.diagnostics.skippedPassive++;
      return false;
    }
    const row = runtimeRow(skillOrId);
    if (row && row.executionEnabled === false) return false;
    if (state.gate?.passiveIds?.includes?.(id)) {
      state.diagnostics.skippedPassive++;
      return false;
    }
    try {
      if (typeof getRuntimeSkillUiType === 'function' && typeof skillOrId === 'object') {
        const uiType = getRuntimeSkillUiType(skillOrId);
        if (uiType === 'passive' || uiType === 'pending') return false;
      }
    } catch (_) {}
    return true;
  }

  function skillIdOf(skillOrId) {
    return Number(typeof skillOrId === 'object'
      ? (skillOrId?.officialId ?? skillOrId?.skillId ?? skillOrId?.id ?? 0)
      : skillOrId);
  }

  function chooseQuality() {
    const explicit = String(window.RO_WEB_SKILL_EFFECT_QUALITY || localStorage.getItem('ro_web_skill_effect_quality') || '').toUpperCase();
    if (explicit === 'FULL' || explicit === 'MIN') return explicit;
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
    const lowCpu = Number(navigator.hardwareConcurrency || 8) <= 4;
    return (window.innerWidth <= 900 || coarse || lowCpu) ? 'MIN' : 'FULL';
  }

  function chooseEffectId(event) {
    const quality = chooseQuality();
    const primary = quality === 'MIN' ? event.min_effect : event.full_effect;
    const fallback = quality === 'MIN' ? event.full_effect : event.min_effect;
    if (primary && state.effects.has(primary)) return primary;
    if (fallback && state.effects.has(fallback)) return fallback;
    return (event.source_effect_ids || []).find(id => state.effects.has(id)) || null;
  }

  async function loadEffect(effectId) {
    if (!effectId) return null;
    if (state.effectData.has(effectId)) return state.effectData.get(effectId);
    const meta = state.effects.get(effectId);
    if (!meta) return null;
    const promise = loadJson(`${BASE}${meta.data}`).then(data => {
      const dependencyMap = new Map();
      for (const dep of data.dependencies || []) {
        if (dep?.missing || !dep?.png) continue;
        const declared = String(dep.declared || '').toLowerCase();
        const basename = declared.split(/[\\/]/).pop();
        if (declared) dependencyMap.set(declared, dep.png);
        if (basename) dependencyMap.set(basename, dep.png);
      }
      data.__dependencyMap = dependencyMap;
      data.__effectId = effectId;
      state.diagnostics.loadedEffects++;
      return data;
    }).catch(error => {
      state.effectData.delete(effectId);
      state.diagnostics.loadFailures++;
      console.warn('[Generic12 SkillEffect] effect load failed', effectId, error);
      return null;
    });
    state.effectData.set(effectId, promise);
    return promise;
  }

  function loadImage(relativePath) {
    if (!relativePath) return null;
    const url = `${BASE}${relativePath}`;
    if (state.imageCache.has(url)) return state.imageCache.get(url);
    const record = { image: new Image(), ready: false, failed: false };
    record.image.decoding = 'async';
    record.image.onload = () => { record.ready = true; requestFrame(); };
    record.image.onerror = () => { record.failed = true; state.diagnostics.loadFailures++; };
    record.image.src = url;
    state.imageCache.set(url, record);
    return record;
  }

  function ensureCanvases() {
    const field = document.getElementById('battle-field');
    if (!field) return null;
    if (state.canvases?.field === field) return state.canvases;
    for (const old of field.querySelectorAll('.ro-v92-skill-effect-canvas')) old.remove();
    const back = document.createElement('canvas');
    const front = document.createElement('canvas');
    back.id = 'skill-effect-back-canvas';
    front.id = 'skill-effect-front-canvas';
    back.className = front.className = 'ro-v92-skill-effect-canvas';
    back.setAttribute('aria-hidden', 'true');
    front.setAttribute('aria-hidden', 'true');
    field.insertBefore(back, field.firstChild);
    field.appendChild(front);
    state.canvases = { field, back, front, backCtx: back.getContext('2d'), frontCtx: front.getContext('2d'), width: 0, height: 0, dpr: 1 };
    resizeCanvases();
    return state.canvases;
  }

  function resizeCanvases() {
    const c = state.canvases || ensureCanvases();
    if (!c) return;
    const rect = c.field.getBoundingClientRect();
    const width = Math.max(1, Math.round(c.field.clientWidth || rect.width || 1280));
    const height = Math.max(1, Math.round(c.field.clientHeight || rect.height || 720));
    const dpr = Math.max(1, Math.min(2, Number(window.devicePixelRatio || 1)));
    if (c.width === width && c.height === height && c.dpr === dpr) return;
    c.width = width; c.height = height; c.dpr = dpr;
    for (const canvas of [c.back, c.front]) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
  }

  function clearCanvas(ctx, c) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, Math.ceil(c.width * c.dpr), Math.ceil(c.height * c.dpr));
    ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }

  function elementForTarget(targetObject) {
    if (targetObject?._element instanceof Element) return targetObject._element;
    if (targetObject?.element instanceof Element) return targetObject.element;
    if (targetObject?.domElement instanceof Element) return targetObject.domElement;
    const id = targetObject?.elementId || targetObject?.domId;
    if (id && document.getElementById(id)) return document.getElementById(id);
    const current = currentMonsterObject();
    const targetId = targetObject?.runtimeId ?? targetObject?.id ?? targetObject?.mobId;
    const currentId = current?.runtimeId ?? current?.id ?? current?.mobId;
    if (targetObject && (targetObject === current || (targetId != null && currentId != null && String(targetId) === String(currentId)))) {
      return document.getElementById('monster-sprite');
    }
    return null;
  }

  function anchorFromElement(element, foot = false) {
    const c = state.canvases || ensureCanvases();
    if (!c || !element) return { x: c?.width / 2 || 640, y: c?.height / 2 || 360 };
    const fieldRect = c.field.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const sx = c.field.clientWidth / Math.max(1, fieldRect.width);
    const sy = c.field.clientHeight / Math.max(1, fieldRect.height);
    return {
      x: (rect.left - fieldRect.left + rect.width / 2) * sx,
      y: (rect.top - fieldRect.top + rect.height * (foot ? 0.86 : 0.50)) * sy
    };
  }

  function finitePair(value) {
    if (!value || typeof value !== 'object') return null;
    const x = Number(value.x ?? value.worldX);
    const y = Number(value.y ?? value.worldY);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  function targetStrongIdentity(value) {
    if (!value || typeof value !== 'object') return '';
    return String(value._instanceId ?? value.runtimeId ?? value.instanceId ?? '');
  }

  function targetSpeciesIdentity(value) {
    if (!value || typeof value !== 'object') return '';
    return String(value.mobId ?? value.id ?? '');
  }

  function targetIdentity(value) {
    return targetStrongIdentity(value) || targetSpeciesIdentity(value);
  }

  function isFormalMonsterEntity(value) {
    return Boolean(value && typeof value === 'object' && (value._worldTestEntity === true || value._worldMonsterEntity === true));
  }

  function collectTargetResolutionSources() {
    const sources = [], seen = new Set();
    const add = row => { if (row && typeof row === 'object' && !seen.has(row)) { seen.add(row); sources.push(row); } };
    try { if (typeof collectLiveCombatEnemies === 'function') (collectLiveCombatEnemies({ includeDead: true, activeOnly: false }) || []).forEach(add); } catch (_) {}
    try { if (typeof getWorldMonsterTestEntities === 'function') (getWorldMonsterTestEntities({ includeDead: true, activeOnly: false }) || []).forEach(add); } catch (_) {}
    try { if (Array.isArray(window.activeMonsters)) window.activeMonsters.forEach(add); } catch (_) {}
    try { if (Array.isArray(window.mapMonsters)) window.mapMonsters.forEach(add); } catch (_) {}
    try { add(currentMonsterObject()); } catch (_) {}
    return sources;
  }

  // 0.9.82II: Never identify a streamed monster by species ID when several
  // instances can coexist. IH could resolve a lightweight target with mobId/id
  // to the first same-species entity, which explains effects jumping to a remote
  // corner. Exact instance IDs or the original formal entity object are required.
  function resolveLiveTargetObject(value) {
    if (!value || typeof value !== 'object') return null;
    if (isFormalMonsterEntity(value)) { state.diagnostics.exactTargetEntityHits++; return value; }
    if (value._element instanceof Element && value._element?.dataset?.instanceId) return value;
    const sources = collectTargetResolutionSources();
    const strong = targetStrongIdentity(value);
    if (strong) {
      const matches = sources.filter(row => targetStrongIdentity(row) === strong);
      if (matches.length === 1) { state.diagnostics.exactTargetEntityHits++; return matches[0]; }
      if (matches.length > 1) state.diagnostics.ambiguousTargetIdentityRejects++;
      return matches.length === 1 ? matches[0] : value;
    }
    // A direct object with a finite position is safer than an ambiguous species lookup.
    if (finitePair(value.position) || finitePair(value.worldPosition) || finitePair(value._worldPosition)) return value;
    const species = targetSpeciesIdentity(value);
    if (!species) return value;
    const matches = sources.filter(row => targetSpeciesIdentity(row) === species);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) state.diagnostics.ambiguousTargetIdentityRejects++;
    return value;
  }

  function finiteWorldPosition(value) {
    if (!value || typeof value !== 'object') return null;
    const live = resolveLiveTargetObject(value) || value;
    const candidates = [
      live.position,
      live.worldPosition,
      live._worldPosition,
      live,
      live._damageNumberAnchorWorld
    ];
    for (const candidate of candidates) {
      const pair = finitePair(candidate);
      if (pair) return pair;
    }
    return null;
  }

  function worldPositionFromElement(element, foot = true) {
    const c = state.canvases || ensureCanvases();
    if (!c || !element) return null;
    const canvasPoint = anchorFromElement(element, foot);
    let camera = { x: 0, y: 0 };
    try { if (typeof getMapCameraOffset === 'function') camera = getMapCameraOffset() || camera; } catch (_) {}
    return {
      x: Number(canvasPoint.x || 0) + Number(camera.x || 0),
      y: Number(canvasPoint.y || 0) + Number(camera.y || 0)
    };
  }

  function captureTargetPayload(targetObject, explicitWorldPosition = null) {
    const liveTarget = resolveLiveTargetObject(targetObject || currentMonsterObject());
    let worldPosition = finitePair(explicitWorldPosition) || finiteWorldPosition(liveTarget);
    let source = worldPosition ? (finitePair(explicitWorldPosition) ? 'EVENT_PAYLOAD' : 'TARGET_OBJECT') : '';
    if (!worldPosition) {
      const element = elementForTarget(liveTarget);
      worldPosition = worldPositionFromElement(element, true);
      if (worldPosition) source = 'TARGET_ELEMENT';
    }
    if (worldPosition) state.diagnostics.targetPayloadsCaptured++;
    else state.diagnostics.targetPayloadMisses++;
    return {
      targetObject: liveTarget || targetObject || null,
      targetWorldPosition: worldPosition ? { x: Number(worldPosition.x), y: Number(worldPosition.y) } : null,
      targetIdentity: targetIdentity(liveTarget || targetObject),
      targetPayloadSource: source || 'MISSING'
    };
  }


  function isPlayerLikeTarget(value) {
    const playerObject = currentPlayerObject();
    if (!value || typeof value !== 'object') return false;
    if (value === playerObject || value?.isPlayer === true || value?.entityType === 'player') return true;
    const identity = targetIdentity(value);
    return identity === 'player' || (identity && identity === targetIdentity(playerObject));
  }

  function isUsableTargetElement(element, targetObject) {
    if (!element || !(element instanceof Element) || !element.isConnected) return false;
    if (element.id === 'player-sprite' || element.closest?.('#player-sprite')) return false;
    const field = state.canvases?.field || document.getElementById('battle-field');
    if (!field || !field.contains(element)) return false;
    const rect = element.getBoundingClientRect?.();
    const fieldRect = field.getBoundingClientRect?.();
    if (!rect || !fieldRect || rect.width <= 0 || rect.height <= 0) return false;
    const instanceId = String(element.dataset?.instanceId || '');
    const targetInstanceId = targetStrongIdentity(targetObject);
    if (instanceId && targetInstanceId && instanceId !== targetInstanceId) return false;
    return rect.right >= fieldRect.left && rect.left <= fieldRect.right && rect.bottom >= fieldRect.top && rect.top <= fieldRect.bottom;
  }

  // 0.9.82II: The formal monster entity position is the authoritative world-foot
  // coordinate (the monster renderer itself subtracts its atlas anchor from it).
  // Prefer the event-time snapshot for that exact entity, then its live position.
  // A DOM rect is only a final, validated fallback; detached/offscreen/same-species
  // elements must never send the effect to the upper-left corner.
  function captureAuthoritativeGroundPayload(targetObject, explicitWorldPosition = null) {
    const inputTarget = targetObject || currentMonsterObject();
    const liveTarget = resolveLiveTargetObject(inputTarget);
    if (!liveTarget || isPlayerLikeTarget(liveTarget)) {
      state.diagnostics.authoritativeGroundMisses++;
      return { targetObject: null, targetWorldPosition: null, targetIdentity: '', targetPayloadSource: 'MISSING_OR_PLAYER' };
    }

    let worldPosition = null;
    let source = '';
    const explicit = finitePair(explicitWorldPosition);
    const directFormalTarget = isFormalMonsterEntity(inputTarget) && inputTarget === liveTarget;
    if (explicit && directFormalTarget) {
      worldPosition = explicit;
      source = 'EXACT_ENTITY_EVENT_SNAPSHOT';
    }
    if (!worldPosition) {
      const position = finitePair(liveTarget.position) || finitePair(liveTarget.worldPosition) || finitePair(liveTarget._worldPosition);
      if (position) { worldPosition = position; source = 'EXACT_TARGET_ENTITY_POSITION'; }
    }
    if (!worldPosition && explicit && targetStrongIdentity(liveTarget)) {
      worldPosition = explicit;
      source = 'EXACT_ID_EVENT_SNAPSHOT';
    }
    if (!worldPosition) {
      const damageAnchor = finitePair(liveTarget._damageNumberAnchorWorld);
      if (damageAnchor) {
        worldPosition = { x: damageAnchor.x, y: damageAnchor.y + 76 };
        source = 'TARGET_DAMAGE_ANCHOR_TO_FOOT';
      }
    }
    if (!worldPosition) {
      const element = elementForTarget(liveTarget);
      if (isUsableTargetElement(element, liveTarget)) {
        worldPosition = worldPositionFromElement(element, true);
        if (worldPosition) source = 'VALIDATED_TARGET_ELEMENT_FOOT_WORLD';
      } else if (element) {
        state.diagnostics.invalidTargetElementRejects++;
      }
    }

    if (worldPosition) state.diagnostics.authoritativeGroundPayloads++;
    else state.diagnostics.authoritativeGroundMisses++;
    return {
      targetObject: liveTarget,
      targetWorldPosition: worldPosition ? { x:Number(worldPosition.x), y:Number(worldPosition.y) } : null,
      targetIdentity: targetIdentity(liveTarget),
      targetPayloadSource: source || 'MISSING'
    };
  }

  function anchorFromWorldPosition(worldPosition, foot = true, kind = 'monster') {
    const c = state.canvases || ensureCanvases();
    if (!c || !worldPosition) return { x: c?.width / 2 || 640, y: c?.height / 2 || 360 };
    let clientPoint = null;
    try {
      if (typeof getLogicalPointClientPosition === 'function') clientPoint = getLogicalPointClientPosition(worldPosition);
    } catch (_) {}
    if (clientPoint && Number.isFinite(clientPoint.x) && Number.isFinite(clientPoint.y)) {
      const fieldRect = c.field.getBoundingClientRect();
      const sx = c.field.clientWidth / Math.max(1, fieldRect.width);
      const sy = c.field.clientHeight / Math.max(1, fieldRect.height);
      const bodyLift = foot ? 0 : (kind === 'player' ? 72 : 54);
      return {
        x: (clientPoint.x - fieldRect.left) * sx,
        y: (clientPoint.y - fieldRect.top) * sy - bodyLift
      };
    }
    // Legacy/small-map fallback. Player.position drives the camera, so subtracting
    // the current camera offset keeps a saved world point fixed in the map.
    let camera = { x: 0, y: 0 };
    try { if (typeof getMapCameraOffset === 'function') camera = getMapCameraOffset() || camera; } catch (_) {}
    return {
      x: Number(worldPosition.x || 0) - Number(camera.x || 0),
      y: Number(worldPosition.y || 0) - Number(camera.y || 0) - (foot ? 0 : (kind === 'player' ? 72 : 54))
    };
  }

  function liveObjectAnchor(targetObject, foot = false, kind = 'monster') {
    const element = kind === 'player' ? document.getElementById('player-sprite') : elementForTarget(targetObject);
    if (element) return anchorFromElement(element, foot);
    const worldPosition = finiteWorldPosition(targetObject);
    if (worldPosition) return anchorFromWorldPosition(worldPosition, foot, kind);
    const fallback = kind === 'player' ? currentPlayerObject() : currentMonsterObject();
    const fallbackWorld = finiteWorldPosition(fallback);
    if (fallbackWorld) return anchorFromWorldPosition(fallbackWorld, foot, kind);
    return anchorFromElement(kind === 'player' ? document.getElementById('player-sprite') : document.getElementById('monster-sprite'), foot);
  }

  function shouldSnapshotGroundAnchor(skillEntry, event) {
    const target = String(event?.target || '');
    const skillId = Number(skillEntry?.skillId || 0);

    // 0.9.82IH: RO_WEB's acidified zones are target-point attacks rather than
    // persistent caster auras. Every visual phase for 5340/5341/5342, including
    // CAST and CAST_BOTTOM, must be frozen at the selected monster's foot point.
    // This check intentionally runs before the generic CASTER_* exception.
    if (GROUND_SNAPSHOT_SKILL_IDS.has(skillId) && event?.trigger !== 'SKILL_END' && !event?.cleanup_only) {
      return true;
    }

    // CASTER anchors remain authoritative for ordinary buffs/stances/auras.
    if (target.startsWith('CASTER_') || target === 'PROJECTILE_PATH') return false;
    if (target === 'GROUND_CELL' || GROUND_SNAPSHOT_TRIGGERS.has(String(event?.trigger || ''))) return true;
    return false;
  }

  function captureGroundAnchor(skillEntry, event, targetObject, explicitWorldPosition = null) {
    if (!shouldSnapshotGroundAnchor(skillEntry, event)) return null;
    const payload = GROUND_SNAPSHOT_SKILL_IDS.has(Number(skillEntry?.skillId || 0))
      ? captureAuthoritativeGroundPayload(targetObject, explicitWorldPosition)
      : captureTargetPayload(targetObject, explicitWorldPosition);
    if (payload.targetWorldPosition) {
      return {
        policy: 'GROUND_WORLD_SNAPSHOT',
        worldPosition: { ...payload.targetWorldPosition },
        targetIdentity: payload.targetIdentity,
        payloadSource: payload.targetPayloadSource
      };
    }
    return null;
  }

  function pendingGroundKey(skillEntry, event, context = {}) {
    return [
      Number(skillEntry?.skillId || 0),
      String(context.token || 'no-token'),
      String(event?.trigger || ''),
      String(event?.phase || ''),
      String(event?.full_effect || event?.min_effect || '')
    ].join(':');
  }

  function queuePendingGroundEvent(skillEntry, event, context = {}) {
    const key = pendingGroundKey(skillEntry, event, context);
    state.pendingGroundEvents.set(key, {
      key, skillEntry, event,
      context: { ...context },
      queuedAt: Date.now(),
      expiresAt: Date.now() + 2500
    });
    state.diagnostics.pendingGroundQueued++;
  }

  function flushPendingGroundEvents(skillId, payload) {
    if (!payload?.targetWorldPosition) return 0;
    let flushed = 0;
    for (const [key, pending] of [...state.pendingGroundEvents.entries()]) {
      if (Number(pending.skillEntry?.skillId || 0) !== Number(skillId || 0)) continue;
      state.pendingGroundEvents.delete(key);
      flushed++;
      playEvent(pending.skillEntry, pending.event, {
        ...pending.context,
        target: payload.targetObject,
        targetWorldPosition: payload.targetWorldPosition,
        targetIdentity: payload.targetIdentity,
        __pendingGroundFlush: true
      });
    }
    state.diagnostics.pendingGroundFlushed += flushed;
    return flushed;
  }

  function repairRecentGroundAnchors(skillId, payload) {
    if (!payload?.targetWorldPosition) return 0;
    const now = Date.now();
    let repaired = 0;
    for (const instance of state.instances) {
      if (Number(instance.skillId || 0) !== Number(skillId || 0)) continue;
      if (!shouldSnapshotGroundAnchor({ skillId: instance.skillId }, instance.event || {})) continue;
      if (now - Number(instance.startAt || 0) > 3000) continue;
      const current = instance.fixedAnchor?.worldPosition;
      const forceRelocate = GROUND_SNAPSHOT_SKILL_IDS.has(Number(skillId || 0));
      const needsRepair = forceRelocate || !current || instance.fixedAnchor?.policy !== 'GROUND_WORLD_SNAPSHOT';
      if (!needsRepair) continue;
      instance.targetObject = payload.targetObject || instance.targetObject;
      instance.fixedAnchor = {
        policy: 'GROUND_WORLD_SNAPSHOT',
        worldPosition: { ...payload.targetWorldPosition },
        targetIdentity: payload.targetIdentity,
        payloadSource: payload.targetPayloadSource || 'HIT_CONFIRM_REPAIR'
      };
      repaired++;
      if (forceRelocate) state.diagnostics.forcedGroundRelocations++;
    }
    state.diagnostics.repairedGroundAnchors += repaired;
    return repaired;
  }

  function eventAnchor(instance, now) {
    const target = String(instance.event.target || 'CASTER_BODY');
    if (instance.fixedAnchor?.worldPosition) return anchorFromWorldPosition(instance.fixedAnchor.worldPosition, true, 'monster');
    if (instance.fixedAnchor?.canvasPosition) return { ...instance.fixedAnchor.canvasPosition };
    if (target === 'CASTER_FOOT') { state.diagnostics.liveCasterAnchors++; return liveObjectAnchor(currentPlayerObject(), true, 'player'); }
    if (target === 'TARGET_BODY') { state.diagnostics.liveTargetAnchors++; return liveObjectAnchor(instance.targetObject, false, 'monster'); }
    if (target === 'TARGET_FOOT' || target === 'GROUND_CELL') { state.diagnostics.liveTargetAnchors++; return liveObjectAnchor(instance.targetObject, true, 'monster'); }
    if (target === 'PROJECTILE_PATH') {
      state.diagnostics.projectileAnchors++;
      const a = liveObjectAnchor(currentPlayerObject(), false, 'player');
      const b = liveObjectAnchor(instance.targetObject, false, 'monster');
      const duration = Math.max(1, instance.visualDurationMs);
      const t = Math.max(0, Math.min(1, (now - instance.startAt) / duration));
      const eased = 1 - Math.pow(1 - t, 2);
      return { x: a.x + (b.x - a.x) * eased, y: a.y + (b.y - a.y) * eased };
    }
    state.diagnostics.liveCasterAnchors++;
    return liveObjectAnchor(currentPlayerObject(), false, 'player');
  }

  function sampleKeyframe(layer, frame) {
    const frames = layer?.keyframes || [];
    if (!frames.length) return null;
    let baseIndex = -1;
    for (let i = 0; i < frames.length; i++) {
      if (Number(frames[i].type) !== 0) continue;
      if (Number(frames[i].frame || 0) <= frame) baseIndex = i;
      else break;
    }
    if (baseIndex < 0) baseIndex = frames.findIndex(k => Number(k.type) === 0);
    if (baseIndex < 0) return frames[0];
    const base = frames[baseIndex];
    const candidate = frames[baseIndex + 1];
    const morph = candidate && Number(candidate.type) === 1 && Number(candidate.frame) === Number(base.frame) ? candidate : null;
    const elapsed = morph ? Math.max(0, frame - Number(base.frame || 0)) : 0;
    const add = (name, count) => Array.from({ length: count }, (_, i) => Number(base[name]?.[i] || 0) + Number(morph?.[name]?.[i] || 0) * elapsed);
    return {
      frame: Number(base.frame || 0),
      position: add('position', 2), uv: add('uv', 8), xy: add('xy', 8),
      textureId: Number(base.textureId || 0) + Number(morph?.textureId || 0) * elapsed,
      animationType: Number(base.animationType || 0),
      animationDelta: Number(base.animationDelta || 0),
      rotation: Number(base.rotation || 0) + Number(morph?.rotation || 0) * elapsed,
      color: add('color', 4),
      sourceBlend: Number(base.sourceBlend || 0), destBlend: Number(base.destBlend || 0)
    };
  }

  function animatedTextureIndex(kf, layer, frame) {
    const count = layer?.textures?.length || 0;
    if (!count) return -1;
    let value = Number(kf.textureId || 0);
    const elapsed = Math.max(0, frame - Number(kf.frame || 0));
    const mode = Number(kf.animationType || 0);
    if ([1,2,3,4,5].includes(mode)) value += elapsed * Number(kf.animationDelta || 0);
    if (mode === 2) value = Math.min(count - 1, value);
    else if (mode === 3 || mode === 4) value = ((value % count) + count) % count;
    else if (mode === 5 && count > 1) {
      const period = 2 * (count - 1);
      const v = ((Math.floor(value) % period) + period) % period;
      value = v >= count ? period - v : v;
    }
    return Math.max(0, Math.min(count - 1, Math.floor(value + 1e-6)));
  }

  function layerMode(effect, layer, index, phase) {
    if (!layer?.textures?.length || !layer?.keyframes?.length) return 'HIDDEN';
    const role = String(phase || effect.role || '').toUpperCase();
    if (role.endsWith('BOTTOM') || ['BOTTOM','LOOP_BOTTOM','START_BOTTOM'].includes(role)) return 'BACK';
    const names = layer.textures.join(' ').toLowerCase();
    if (/(bottom|ground|circle|shadow|_bg|background)/.test(names)) return 'BACK';
    if (['HIT','TARGET','PROJECTILE','SHOT'].includes(role)) return 'FRONT';
    const count = effect.layers?.length || 1;
    const split = count > 1 ? Math.max(1, Math.min(count - 1, Math.ceil(count * 0.55))) : 0;
    return index < split ? 'BACK' : 'FRONT';
  }

  function normalizedColor(raw) {
    const c = [0,1,2,3].map(i => Number(raw?.[i] ?? 255));
    const normalized = Math.max(...c.map(Math.abs)) <= 2;
    const scale = normalized ? 1 : 255;
    return {
      r: Math.max(0, Math.min(2, c[0] / scale)),
      g: Math.max(0, Math.min(2, c[1] / scale)),
      b: Math.max(0, Math.min(2, c[2] / scale)),
      a: Math.max(0, Math.min(1, c[3] / scale))
    };
  }

  function tintedTexture(record, crop, width, height, color) {
    if (!record?.ready || width < 1 || height < 1) return null;
    const canvas = state.scratch || (state.scratch = document.createElement('canvas'));
    canvas.width = Math.max(1, Math.min(2048, Math.round(width)));
    canvas.height = Math.max(1, Math.min(2048, Math.round(height)));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(record.image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
    if (Math.abs(color.r - 1) > 0.01 || Math.abs(color.g - 1) > 0.01 || Math.abs(color.b - 1) > 0.01) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgb(${Math.min(255, color.r * 255)},${Math.min(255, color.g * 255)},${Math.min(255, color.b * 255)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(record.image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
    }
    return canvas;
  }

  function renderLayer(instance, effect, layer, layerIndex, frame, anchor, scale) {
    const kf = sampleKeyframe(layer, frame);
    if (!kf || !layer.textures?.length) return;
    const textureIndex = animatedTextureIndex(kf, layer, frame);
    if (textureIndex < 0) return;
    const declared = String(layer.textures[textureIndex] || '').toLowerCase();
    const relative = effect.__dependencyMap?.get(declared) || effect.__dependencyMap?.get(declared.split(/[\\/]/).pop());
    const image = loadImage(relative);
    if (!image?.ready) return;

    const uv = kf.uv || [];
    let sx = 0, sy = 0, sw = image.image.naturalWidth, sh = image.image.naturalHeight;
    if (uv.length >= 4 && uv.slice(0,4).every(v => Number(v) >= -0.01 && Number(v) <= 1.01)) {
      sx = Math.max(0, Math.round(Math.min(uv[0], uv[2]) * sw));
      sy = Math.max(0, Math.round(Math.min(uv[1], uv[3]) * sh));
      const x1 = Math.min(sw, Math.round(Math.max(uv[0], uv[2]) * sw));
      const y1 = Math.min(sh, Math.round(Math.max(uv[1], uv[3]) * sh));
      if (x1 > sx && y1 > sy) { sw = x1 - sx; sh = y1 - sy; }
      else { sx = 0; sy = 0; sw = image.image.naturalWidth; sh = image.image.naturalHeight; }
    }
    const xs = (kf.xy || []).slice(0,4), ys = (kf.xy || []).slice(4,8);
    let width = xs.length ? Math.abs(Math.max(...xs) - Math.min(...xs)) : sw;
    let height = ys.length ? Math.abs(Math.max(...ys) - Math.min(...ys)) : sh;
    if (width < 1) width = sw;
    if (height < 1) height = sh;
    width = Math.max(1, Math.min(2048, width * scale));
    height = Math.max(1, Math.min(2048, height * scale));
    const color = normalizedColor(kf.color);
    if (color.a <= 0.001) return;
    const tinted = tintedTexture(image, { sx, sy, sw, sh }, width, height, color);
    if (!tinted) return;

    let localX, localY;
    if (Math.abs(kf.position?.[0] || 0) < 8 && Math.abs(kf.position?.[1] || 0) < 8) {
      localX = Number(kf.position?.[0] || 0) * scale;
      localY = Number(kf.position?.[1] || 0) * scale;
    } else {
      localX = (Number(kf.position?.[0] || 320) - 320) * scale;
      localY = (Number(kf.position?.[1] || 240) - 240) * scale;
    }
    const mode = layerMode(effect, layer, layerIndex, instance.event.phase);
    const ctx = mode === 'BACK' ? state.canvases.backCtx : state.canvases.frontCtx;
    if (!ctx || mode === 'HIDDEN') return;
    const blendKey = `${kf.sourceBlend}:${kf.destBlend}`;
    const nearBlack = Math.max(color.r, color.g, color.b) <= 0.02 && color.a > 0.01;
    ctx.save();
    ctx.globalAlpha = color.a;
    ctx.globalCompositeOperation = !nearBlack && ADDITIVE_PAIRS.has(blendKey) ? 'lighter' : 'source-over';
    ctx.translate(anchor.x + localX, anchor.y + localY);
    if (Math.abs(kf.rotation) > 0.01) ctx.rotate(-Number(kf.rotation) * Math.PI / 180);
    ctx.drawImage(tinted, -tinted.width / 2, -tinted.height / 2);
    ctx.restore();
  }

  function renderInstance(instance, now) {
    const effect = instance.effect;
    if (!effect) return false;
    const elapsedMs = Math.max(0, now - instance.startAt);
    if (!instance.loop && elapsedMs > instance.visualDurationMs) return false;
    if (instance.endAt && now >= instance.endAt) return false;
    const fps = Math.max(1, Number(effect.fps || 60));
    const frameCount = Math.max(1, Number(effect.frameCount || 1));
    let frame = elapsedMs * fps / 1000;
    frame = instance.loop ? frame % frameCount : Math.min(frameCount - 1e-4, frame);
    const anchor = eventAnchor(instance, now);
    const c = state.canvases;
    const scale = Math.max(0.7, Math.min(1.5, Math.min(c.width / 640, c.height / 480)));
    for (let i = 0; i < (effect.layers || []).length; i++) renderLayer(instance, effect, effect.layers[i], i, frame, anchor, scale);
    return true;
  }

  function render(now = performance.now()) {
    state.raf = 0;
    const c = ensureCanvases();
    if (!c) return;
    resizeCanvases();
    clearCanvas(c.backCtx, c);
    clearCanvas(c.frontCtx, c);
    const wallNow = Date.now();
    state.instances = state.instances.filter(instance => renderInstance(instance, wallNow));
    const liveIds = new Set(state.instances.map(instance => instance.instanceId));
    for (const [key, ids] of state.lifecycle.entries()) {
      for (const id of [...ids]) if (!liveIds.has(id)) ids.delete(id);
      if (!ids.size) state.lifecycle.delete(key);
    }
    if (state.instances.length) requestFrame();
  }

  function requestFrame() {
    if (!state.raf) state.raf = requestAnimationFrame(render);
  }

  function cleanupLifecycle(key, reason = 'skill_end', castToken = null) {
    if (!key) return;
    const ids = state.lifecycle.get(key);
    if (!ids?.size) return;
    const removeIds = new Set();
    for (const instance of state.instances) {
      if (!ids.has(instance.instanceId)) continue;
      if (castToken && instance.castToken !== castToken) continue;
      removeIds.add(instance.instanceId);
    }
    if (removeIds.size) {
      state.instances = state.instances.filter(instance => !removeIds.has(instance.instanceId));
      state.diagnostics.clearedLifecycles += removeIds.size;
      for (const id of removeIds) ids.delete(id);
    }
    if (!ids.size) state.lifecycle.delete(key);
    requestFrame();
  }

  function schedule(fn, delayMs) {
    const timer = setTimeout(() => { state.timers.delete(timer); fn(); }, Math.max(0, Number(delayMs || 0)));
    state.timers.add(timer);
    return timer;
  }

  async function playEvent(skillEntry, event, context = {}) {
    if (event.cleanup_only || event.trigger === 'SKILL_END') {
      cleanupLifecycle(event.lifecycle_key, 'manifest_skill_end', context.token || null);
      return;
    }
    const effectId = chooseEffectId(event);
    if (!effectId) return;

    // 0.9.82IH: capture the combat target payload before any asynchronous effect
    // loading. The old flow waited for JSON/PNG metadata first; by then currentMonster
    // could have changed or the commit context could have lost its world position.
    const groundRequired = shouldSnapshotGroundAnchor(skillEntry, event);
    const payload = GROUND_SNAPSHOT_SKILL_IDS.has(Number(skillEntry?.skillId || 0)) && groundRequired
      ? captureAuthoritativeGroundPayload(context.target, context.targetWorldPosition)
      : captureTargetPayload(context.target, context.targetWorldPosition);
    const fixedAnchor = captureGroundAnchor(
      skillEntry,
      event,
      payload.targetObject,
      payload.targetWorldPosition
    );
    if (groundRequired && !fixedAnchor) {
      if (!context.__pendingGroundFlush) queuePendingGroundEvent(skillEntry, event, {
        ...context,
        target: payload.targetObject,
        targetIdentity: payload.targetIdentity
      });
      else state.diagnostics.skippedGroundWithoutTarget++;
      console.warn('[Generic12 SkillEffect] ground event waiting for target payload', {
        skillId: skillEntry.skillId,
        trigger: event.trigger,
        phase: event.phase,
        targetIdentity: payload.targetIdentity || null
      });
      return;
    }

    const effect = await loadEffect(effectId);
    if (!effect || !isEligible(skillEntry.skillId)) return;
    const effectDuration = Math.max(1, Number(effect.durationSeconds || 0) * 1000);
    const eventDuration = Math.max(1, Number(event.duration_ms || effectDuration));
    const loop = event.trigger === 'LOOP_START' || String(event.phase || '').startsWith('LOOP');
    const instanceId = `${skillEntry.skillId}:${effectId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    if (fixedAnchor) state.diagnostics.fixedGroundAnchors++;
    const instance = {
      instanceId, skillId: skillEntry.skillId, skillKey: skillEntry.skillKey,
      effectId, effect, event,
      targetObject: payload.targetObject,
      targetIdentity: payload.targetIdentity,
      fixedAnchor,
      startAt: Date.now(), castToken: context.token || null,
      visualDurationMs: loop ? eventDuration : Math.min(eventDuration, Math.max(effectDuration, 100)),
      endAt: loop ? Date.now() + eventDuration : 0, loop
    };
    state.instances.push(instance);
    if (event.lifecycle_key) {
      const set = state.lifecycle.get(event.lifecycle_key) || new Set();
      set.add(instanceId);
      state.lifecycle.set(event.lifecycle_key, set);
    }
    state.diagnostics.playedEvents++;
    requestFrame();
  }

  function runTriggerGroup(skillEntry, triggerSet, context = {}) {
    const payload = captureTargetPayload(context.target, context.targetWorldPosition);
    const frozenContext = {
      ...context,
      target: payload.targetObject,
      targetWorldPosition: payload.targetWorldPosition,
      targetIdentity: payload.targetIdentity,
      targetPayloadSource: payload.targetPayloadSource
    };
    for (const event of skillEntry.events || []) {
      if (!triggerSet.has(event.trigger)) continue;
      schedule(() => playEvent(skillEntry, event, frozenContext), event.offset_ms || 0);
    }
  }

  function onSkillBegin(skill, level = 1, context = {}) {
    if (!state.ready || !isEligible(skill)) return null;
    const id = skillIdOf(skill);
    const entry = state.skills.get(id);
    if (!entry) return null;
    const token = context.token || `${id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const beginTarget = context.target || currentMonsterObject();
    const payload = GROUND_SNAPSHOT_SKILL_IDS.has(id)
      ? captureAuthoritativeGroundPayload(beginTarget, context.targetWorldPosition)
      : captureTargetPayload(beginTarget, context.targetWorldPosition);
    state.latestCast.set(id, {
      token, startedAt: Date.now(), level,
      target: payload.targetObject,
      targetWorldPosition: payload.targetWorldPosition,
      targetIdentity: payload.targetIdentity
    });
    if (payload.targetWorldPosition) state.latestTarget.set(id, payload);
    state.diagnostics.begins++;
    runTriggerGroup(entry, BEGIN_TRIGGERS, {
      ...context, target: payload.targetObject,
      targetWorldPosition: payload.targetWorldPosition,
      token, level
    });
    return token;
  }

  function onSkillCommit(skill, level = 1, context = {}) {
    if (!state.ready || !isEligible(skill)) return false;
    const id = skillIdOf(skill);
    const entry = state.skills.get(id);
    if (!entry) return false;
    if (!state.latestCast.has(id)) onSkillBegin(skill, level, context);
    const cast = state.latestCast.get(id) || {};
    const remembered = state.latestTarget.get(id) || {};
    const commitTarget = context.target || cast.target || remembered.targetObject || currentMonsterObject();
    const commitWorldPosition = context.targetWorldPosition || cast.targetWorldPosition || remembered.targetWorldPosition;
    const payload = GROUND_SNAPSHOT_SKILL_IDS.has(id)
      ? captureAuthoritativeGroundPayload(commitTarget, commitWorldPosition)
      : captureTargetPayload(commitTarget, commitWorldPosition);
    if (payload.targetWorldPosition) state.latestTarget.set(id, payload);
    state.diagnostics.commits++;
    runTriggerGroup(entry, COMMIT_TRIGGERS, {
      ...context,
      target: payload.targetObject,
      targetWorldPosition: payload.targetWorldPosition,
      targetIdentity: payload.targetIdentity,
      level, token: cast.token
    });
    schedule(() => state.latestCast.delete(id), 2000);
    return true;
  }

  function onSkillHit(skillOrId, target = null, context = {}) {
    if (!state.ready || !isEligible(skillOrId)) return false;
    const id = skillIdOf(skillOrId);
    const entry = state.skills.get(id);
    if (!entry) return false;
    const payload = GROUND_SNAPSHOT_SKILL_IDS.has(id)
      ? captureAuthoritativeGroundPayload(target || currentMonsterObject(), context.targetWorldPosition)
      : captureTargetPayload(target || currentMonsterObject(), context.targetWorldPosition);
    const targetKey = String(payload.targetIdentity || 'main');
    const key = `${id}:${targetKey}`;
    const now = Date.now();
    if (now - Number(state.lastHit.get(key) || 0) < 30) return false;
    state.lastHit.set(key, now);
    if (payload.targetWorldPosition) {
      state.latestTarget.set(id, payload);
      repairRecentGroundAnchors(id, payload);
      flushPendingGroundEvents(id, payload);
    }
    state.diagnostics.hits++;
    runTriggerGroup(entry, HIT_TRIGGERS, {
      ...context,
      target: payload.targetObject,
      targetWorldPosition: payload.targetWorldPosition,
      targetIdentity: payload.targetIdentity
    });
    return true;
  }

  function emitDirect(skill, level = 1, context = {}) {
    if (!state.ready || !isEligible(skill)) return false;
    const id = skillIdOf(skill);
    const entry = state.skills.get(id);
    if (!entry) return false;
    const target = context.target || context.primaryTarget || currentMonsterObject();
    const payload = captureTargetPayload(target, context.targetWorldPosition);
    const token = context.token || `${id}:${Date.now()}:direct`;
    state.diagnostics.begins++;
    state.diagnostics.commits++;
    runTriggerGroup(entry, COMMIT_TRIGGERS, {
      ...context, target: payload.targetObject, targetWorldPosition: payload.targetWorldPosition,
      targetIdentity: payload.targetIdentity, level, token
    });
    return true;
  }

  function onSkillEnd(skillOrId, reason = 'runtime_end') {
    const id = skillIdOf(skillOrId);
    const entry = state.skills.get(id);
    if (!entry) return false;
    for (const event of entry.events || []) {
      if (event.lifecycle_key) cleanupLifecycle(event.lifecycle_key, reason);
    }
    return true;
  }

  function clearAll(reason = 'clear_all') {
    for (const timer of state.timers) clearTimeout(timer);
    state.timers.clear();
    state.instances.length = 0;
    state.lifecycle.clear();
    state.latestCast.clear();
    state.lastHit.clear();
    state.latestTarget.clear();
    state.pendingGroundEvents.clear();
    if (state.canvases) {
      clearCanvas(state.canvases.backCtx, state.canvases);
      clearCanvas(state.canvases.frontCtx, state.canvases);
    }
    return reason;
  }

  function currentPlayerObject() {
    try { if (typeof player !== 'undefined') return player; } catch (_) {}
    return window.player || null;
  }

  function currentMonsterObject() {
    try { if (typeof currentMonster !== 'undefined') return currentMonster; } catch (_) {}
    return window.currentMonster || null;
  }

  function environmentIdentity() {
    const field = document.getElementById('battle-field');
    const map = String(field?.dataset?.mapId || field?.dataset?.worldMapId || window.currentMap?.id || '');
    const p = currentPlayerObject();
    const playerIdentity = String(p?.id || p?.name || p?.job || '');
    return { map, playerIdentity };
  }

  function safetyPoll() {
    const env = environmentIdentity();
    if (state.lastMapIdentity && env.map && env.map !== state.lastMapIdentity) clearAll('map_change');
    if (state.lastPlayerIdentity && env.playerIdentity && env.playerIdentity !== state.lastPlayerIdentity) clearAll('character_change');
    state.lastMapIdentity = env.map;
    state.lastPlayerIdentity = env.playerIdentity;
    const p = currentPlayerObject();
    if (p && Number(p.hp || 0) <= 0 && state.instances.length) clearAll('player_death');
    for (const [key, ids] of state.lifecycle.entries()) {
      if (!ids?.size) state.lifecycle.delete(key);
    }
    const now = Date.now();
    for (const [key, pending] of state.pendingGroundEvents.entries()) {
      if (Number(pending.expiresAt || 0) <= now) {
        state.pendingGroundEvents.delete(key);
        state.diagnostics.skippedGroundWithoutTarget++;
      }
    }
  }

  async function init() {
    if (state.ready) return true;
    if (state.loading) return state.loading;
    state.loading = Promise.all([loadJson(MANIFEST_URL), loadJson(EFFECT_MANIFEST_URL), loadJson(GATE_URL)])
      .then(([manifest, effectManifest, gate]) => {
        state.manifest = manifest;
        state.effectManifest = effectManifest;
        state.gate = gate;
        state.skills = new Map((manifest.skills || []).map(row => [Number(row.skillId), row]));
        state.effects = new Map((effectManifest.effects || []).map(row => [String(row.effectId), row]));
        ensureCanvases();
        state.ready = true;
        window.RO_WEB_SKILL_EFFECT_RUNTIME_STATUS = {
          version: VERSION, ready: true, skills: state.skills.size, effects: state.effects.size,
          passiveCandidatesExcluded: Number(manifest.scope?.excludedPassiveOrDisabledSkills || 0),
          localizationWriteback: false, genericSharedEffects: true, genericEffectCount: 12,
          anchorPolicy: 'GENERIC12_TARGET_DAMAGE_CASTER_BUFF'
        };
        console.info(`[Generic12 SkillEffect] ready: ${state.skills.size} active skills / ${state.effects.size} effects; passive guard enabled.`);
        return true;
      })
      .catch(error => {
        state.loadError = String(error?.stack || error);
        state.diagnostics.loadFailures++;
        window.RO_WEB_SKILL_EFFECT_RUNTIME_STATUS = { version: VERSION, ready: false, error: state.loadError };
        console.error('[Generic12 SkillEffect] init failed', error);
        return false;
      });
    return state.loading;
  }

  function selfTest() {
    const errors = [];
    if (!state.ready) errors.push('runtime_not_ready');
    if (state.skills.size !== Number(state.manifest?.scope?.deployedActiveSkills || state.skills.size)) errors.push('skill_count_mismatch');
    if (state.effects.size !== Number(state.manifest?.scope?.deployedEffects || state.effects.size)) errors.push('effect_count_mismatch');
    for (const id of state.gate?.candidateExcludedIds || []) if (state.skills.has(Number(id))) errors.push(`excluded_skill_present:${id}`);
    for (const skill of state.skills.values()) {
      for (const event of skill.events || []) {
        for (const effectId of [event.full_effect, event.min_effect, ...(event.source_effect_ids || [])].filter(Boolean)) {
          if (!state.effects.has(effectId)) errors.push(`missing_effect:${skill.skillId}:${effectId}`);
        }
        const target = String(event.target || '');
        if (GROUND_SNAPSHOT_SKILL_IDS.has(Number(skill.skillId)) && target.startsWith('TARGET_') && !shouldSnapshotGroundAnchor(skill, event)) {
          errors.push(`acidified_target_not_ground_snapshot:${skill.skillId}:${event.trigger}:${event.phase}`);
        }
      }
    }
    return {
      pass: errors.length === 0, errors, skills: state.skills.size, effects: state.effects.size,
      anchorPolicy: 'GENERIC12_TARGET_DAMAGE_CASTER_BUFF',
      groundSnapshotSkills: [...GROUND_SNAPSHOT_SKILL_IDS],
      diagnostics: { ...state.diagnostics }
    };
  }

  const api = {
    version: VERSION,
    init, isEligible, onSkillBegin, onSkillCommit, onSkillHit, onSkillEnd, emitDirect,
    clearAll, selfTest,
    get ready() { return state.ready; },
    get status() { return window.RO_WEB_SKILL_EFFECT_RUNTIME_STATUS || { version: VERSION, ready: state.ready }; },
    get diagnostics() {
      return {
        ...state.diagnostics,
        activeInstances: state.instances.length,
        activeLifecycles: state.lifecycle.size,
        pendingGroundEvents: state.pendingGroundEvents.size
      };
    },
    captureTargetPayload(target, explicitWorldPosition = null) {
      const payload = captureTargetPayload(target, explicitWorldPosition);
      return {
        targetIdentity: payload.targetIdentity,
        targetWorldPosition: payload.targetWorldPosition ? { ...payload.targetWorldPosition } : null,
        targetPayloadSource: payload.targetPayloadSource
      };
    },
    debugSnapshot() {
      return {
        pendingGroundEvents: state.pendingGroundEvents.size,
        latestTargets: [...state.latestTarget.entries()].map(([skillId, payload]) => ({
          skillId,
          targetIdentity: payload.targetIdentity,
          targetWorldPosition: payload.targetWorldPosition ? { ...payload.targetWorldPosition } : null
        })),
        instances: state.instances.map(instance => ({
          skillId: instance.skillId,
          effectId: instance.effectId,
          trigger: instance.event?.trigger,
          phase: instance.event?.phase,
          targetIdentity: instance.targetIdentity,
          fixedAnchor: instance.fixedAnchor ? JSON.parse(JSON.stringify(instance.fixedAnchor)) : null
        }))
      };
    },
    resolveAnchorPolicy(skillId, event) {
      const entry = state.skills.get(Number(skillId)) || { skillId: Number(skillId) };
      if (shouldSnapshotGroundAnchor(entry, event || {})) return 'GROUND_WORLD_SNAPSHOT';
      const target = String(event?.target || 'CASTER_BODY');
      if (target === 'PROJECTILE_PATH') return 'PROJECTILE_LIVE_ENDPOINTS';
      if (target.startsWith('TARGET_')) return 'TARGET_LIVE';
      return 'CASTER_LIVE';
    },
    preview(skillId, trigger = 'DAMAGE_COMMIT') {
      const entry = state.skills.get(Number(skillId));
      if (!entry) return false;
      const event = (entry.events || []).find(row => row.trigger === trigger && !row.cleanup_only);
      if (!event) return false;
      playEvent(entry, event, { target: currentMonsterObject(), preview: true });
      return true;
    }
  };
  window.SkillEffectRuntimeV92 = api;

  window.addEventListener('resize', () => { resizeCanvases(); requestFrame(); }, { passive: true });
  window.addEventListener('pagehide', () => clearAll('pagehide'));
  window.addEventListener('beforeunload', () => clearAll('beforeunload'));
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearAll('visibility_hidden'); });
  setInterval(safetyPoll, 500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
