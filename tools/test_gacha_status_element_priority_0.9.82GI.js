const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let passed = 0;
const results = [];
function check(condition, label) {
  if (!condition) throw new Error(label);
  passed += 1;
  results.push(`PASS - ${label}`);
}
function text(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const paramsStart = source.indexOf('(', start);
  let paramsDepth = 0;
  let paramsEnd = -1;
  for (let i = paramsStart; i < source.length; i += 1) {
    if (source[i] === '(') paramsDepth += 1;
    else if (source[i] === ')') {
      paramsDepth -= 1;
      if (paramsDepth === 0) { paramsEnd = i; break; }
    }
  }
  if (paramsEnd < 0) throw new Error(`Unclosed parameter list for ${name}`);
  const brace = source.indexOf('{', paramsEnd);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unclosed function ${name}`);
}

// 1) 100-click gacha queue: no overlapping full UI/save work.
{
  const cfg = JSON.parse(text('data/mvp_gacha.json'));
  const timers = [];
  const logs = [];
  let quick = 0;
  let saveRequests = 0;
  const context = {
    console,
    Math: Object.create(Math),
    Date,
    Object, Array, String, Number, Boolean, JSON, Map, Set,
    setTimeout: fn => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
    document: {
      getElementById: () => null,
      createElement: tag => ({ tagName: tag, style: {}, className: '', dataset: {}, children: [], firstElementChild: null, setAttribute() {}, appendChild() {}, remove() {} }),
      head: { appendChild() {} },
      body: { appendChild() {} }
    }
  };
  context.Math.random = () => 0.9999;
  context.window = context;
  context.RO_WEB_DATA = { 'data/mvp_gacha.json': cfg };
  context.player = { name: 'Tester', inventory: [{ id: cfg.gachaItemId, name: 'MVP幸運轉蛋', count: 100 }] };
  const itemMap = new Map([[Number(cfg.gachaItemId), { id: Number(cfg.gachaItemId), name: 'MVP幸運轉蛋' }]]);
  for (const row of cfg.ordinaryRewards || []) itemMap.set(Number(row.itemId), { id: Number(row.itemId), name: `Reward ${row.itemId}` });
  for (const cat of cfg.rareCategories || []) for (const row of cat.rewards || []) itemMap.set(Number(row.itemId), { id: Number(row.itemId), name: `Rare ${row.itemId}` });
  context.getItemData = id => itemMap.get(Number(id)) || { id: Number(id), name: `Item ${id}` };
  context.findInventoryItemById = id => context.player.inventory.find(row => String(row.id) === String(id) && !row.instanceId) || null;
  context.canUseConsumableItem = () => ({ ok: true });
  context.markConsumableItemUsed = () => {};
  context.addItem = (item, count = 1) => {
    const existing = context.player.inventory.find(row => String(row.id) === String(item.id) && !row.instanceId);
    if (existing) existing.count += count;
    else context.player.inventory.push({ id: item.id, name: item.name, count });
  };
  context.updateQuickSlotUI = () => { quick += 1; };
  context.requestGameSave = delay => { check(delay === 1200, 'gacha uses 1200ms trailing save debounce'); saveRequests += 1; };
  context.addBattleLog = (message, type) => logs.push({ text: message, type });
  context.addBattleLogBatch = entries => logs.push(...entries);
  context.getPlayerAnnouncementName = () => context.player.name;
  vm.createContext(context);
  vm.runInContext(text('js/mvp_gacha_runtime.js'), context, { filename: 'mvp_gacha_runtime.js' });
  for (let i = 0; i < 100; i += 1) check(context.MvpGachaRuntime.openGacha(context.getItemData(cfg.gachaItemId)) === true, `gacha click ${i + 1} accepted`);
  check(context.MvpGachaRuntime.openGacha(context.getItemData(cfg.gachaItemId)) === false, 'queued opens cannot exceed inventory count');
  let guard = 0;
  while (timers.length && guard++ < 1000) timers.shift()();
  check(guard < 1000, 'gacha queue terminates');
  check(context.MvpGachaRuntime.getPendingOpenCount() === 0, 'gacha pending count returns to zero');
  check(!context.player.inventory.some(row => String(row.id) === String(cfg.gachaItemId)), '100 gacha items consumed exactly once');
  const batchLogCount = logs.filter(entry => /開啟/.test(String(entry && entry.text || ''))).length;
  const missingLogCount = logs.filter(entry => /背包裡沒有/.test(String(entry && entry.text || ''))).length;
  check(batchLogCount <= 4, '100 opens produce at most four batched gacha log mutations');
  check(missingLogCount <= 1, 'over-limit click emits at most one missing-item notice');
  check(quick <= 4 && saveRequests <= 4, '100 opens produce at most four quick-slot/save requests');
  check(context.RO_WEB_REWARD_SAVE_DIRTY === false && context.RO_WEB_REWARD_INVENTORY_UI_DIRTY === false, 'gacha clears its reward dirty flags');
}

// 2) Status/trait allocation keeps the running controller and current target.
{
  const playerSource = text('js/player.js');
  let resetCount = 0;
  let scheduleCount = 0;
  const context = {
    console,
    window: null,
    roPlayerBuildMutationDepth: 0,
    roPlayerBuildMutationResumeAuto: false,
    player: { state: 'Attacking' },
    currentMonster: { id: 1002 },
    isAutoBattleRunning: () => true,
    invalidatePlayerUiRenderCaches: () => {},
    resetAutoBattleController: () => { resetCount += 1; },
    scheduleAutoBattleTick: () => { scheduleCount += 1; }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(extractFunction(playerSource, 'withPlayerBuildMutation'), context);
  context.withPlayerBuildMutation('status_allocate', () => {});
  check(resetCount === 0, 'normal status allocation does not reset Auto Battle Controller');
  check(context.player.state === 'Attacking', 'normal status allocation preserves player combat state');
  context.withPlayerBuildMutation('trait_allocate', () => {});
  check(resetCount === 0, 'trait allocation does not reset Auto Battle Controller');
  context.withPlayerBuildMutation('skill_allocate', () => {});
  check(resetCount === 1, 'skill allocation still performs required full controller reset');
  check(scheduleCount === 3, 'all build mutations resume/sustain the scheduled battle tick');

  const statusSource = text('js/status_system.js');
  check(statusSource.includes('STATUS_CONTROL_INTERACTION_GUARD_MS = 420'), 'status controls have pointer interaction redraw guard');
  check(statusSource.includes('win.addEventListener("pointerdown", guard, true)'), 'status pointerdown is protected before click');
  check(statusSource.includes('requestStatusUIUpdate({ force:true })'), 'status allocation performs one controlled immediate render');
  check(statusSource.includes('requestGameSave(350)'), 'status allocation uses delayed save instead of synchronous localStorage write');
}

// 3) Weapon element priority: skill > converter > equipment/weapon.
{
  const playerSource = text('js/player.js');
  const start = playerSource.indexOf('const ITEM_PHYSICAL_ELEMENT_ENDOW_BUFF_ID');
  const end = playerSource.indexOf('// 0.9.82FM', start);
  const converterLogs = [];
  const context = {
    console,
    window: null,
    Date, Object, String, Number, Array, Math,
    player: { activeBuffs: {}, attackElement: null },
    getPlainPlayerObject: value => value && typeof value === 'object' ? value : {},
    logs: converterLogs,
    addBattleLog: message => { converterLogs.push(message); }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(playerSource.slice(start, end), context, { filename: 'converter_segment.js' });
  const now = Date.now();
  context.player.activeBuffs.item_physical_element_endow = { name: '火 肯貝特', startedAt: now - 10, expiresAt: now + 100000, effects: { attackElementOverride: 'Fire' } };
  context.player.activeBuffs[68] = { name: '灑水祈福', startedAt: now, expiresAt: now + 100000, effects: { attackElementOverride: 'Holy' } };
  check(context.resolvePhysicalWeaponElement('Neutral') === 'Holy', 'Aspersio/skill endow overrides converter');
  check(context.cancelConverterForSkillWeaponEndow('灑水祈福') === true, 'skill endow removes active converter layer');
  check(!context.player.activeBuffs.item_physical_element_endow, 'converter buff is removed after skill endow');
  const buffCount = Object.keys(context.player.activeBuffs).length;
  check(context.applyPhysicalElementEndowFromItem({ id: 12114, name: '火 肯貝特', useEffect: { type: 'physical_element_endow', element: 'Fire', durationMs: 10000 } }) === false, 'converter cannot overwrite an active skill endow');
  check(Object.keys(context.player.activeBuffs).length === buffCount, 'rejected converter creates no new buff');

  const skillSource = text('js/skill_engine.js');
  const damageSource = text('js/ra_renewal_damage_pipeline.js');
  const autoSource = text('js/auto_battle.js');
  const instanceSource = text('js/item_instance_ui.js');
  check(skillSource.includes('cancelConverterForSkillWeaponEndow?.(skill.name'), 'all skill buffs with attackElementOverride cancel converter');
  check(skillSource.includes('window.cancelConverterForSkillUse(skill?.name || "技能")'), 'every successful player skill cast clears converter at the shared cost commit point');
  {
    let clearedBySkill = 0;
    const skillCostContext = {
      console,
      window: null,
      player: { sp: 50, hp: 50, zeny: 50 },
      currentMonster: null,
      getRuntimeSkillSpCost: () => 0,
      getSkillRuntimeProfile: () => ({}),
      getLevelValue: () => 0,
      getRuntimeSkillZenyCost: () => 0,
      consumeMemorizeChargeOnMagicCast: () => false,
      commitRuntimeSkillTiming: () => {},
      consumeRuntimeCastAnimationHandoff: () => false,
      playRuntimeSkillActionMotion: () => {},
      cancelConverterForSkillUse: () => { clearedBySkill += 1; return true; },
      CardRuntime: { onSkillUsed() {} }
    };
    skillCostContext.window = skillCostContext;
    vm.createContext(skillCostContext);
    vm.runInContext(extractFunction(skillSource, 'paySkillCost'), skillCostContext);
    skillCostContext.paySkillCost({ id: 5, name: '火箭術' }, 1);
    check(clearedBySkill === 1, 'shared skill payment path actually clears converter exactly once');
  }
  check(damageSource.includes('resolvePhysicalWeaponElement(fallback)'), 'Renewal physical damage uses central priority resolver');
  check(autoSource.includes('getActiveSkillWeaponElementEndow()) return false'), 'auto converter pauses while a skill weapon endow is active');
  check(playerSource.includes('if (isPhysicalEndowItem && !appliedPhysicalEndow) return;'), 'rejected manual converter is not consumed');
  check(playerSource.includes('slot === "shield" && isWeaponEquipmentItem(itemData)'), 'equipping an assassin offhand weapon clears converter');
  check(instanceSource.includes("slot === 'shield' && isWeaponEquipmentItem(itemData)"), 'instance-safe offhand equipment flow clears converter');
}

// 4) Release/cache wiring.
{
  const index = text('index.html');
  check(index.includes('<title>RO_WEB 0.9.82GI</title>'), 'page title updated to GI');
  const versions = [...index.matchAll(/[?&]v=([^"&]+)/g)].map(match => match[1]);
  check(versions.length > 0 && versions.every(version => version === '0.9.82GI'), 'all index cache versions are GI');
  check(text('js/game.js').includes('const RO_WEB_VERSION = "0.9.82GI";'), 'runtime version updated to GI');
}

console.log(JSON.stringify({ version: '0.9.82GI', passed, failed: 0 }, null, 2));
for (const row of results.slice(-20)) console.log(row);
