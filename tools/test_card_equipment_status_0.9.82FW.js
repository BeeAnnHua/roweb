const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const checks = [];
function check(ok, name, detail = '') { checks.push({ name, ok: !!ok, detail }); }

global.window = global;
global.document = undefined;
window.setInterval = () => 0;
const cards = read('data/card_runtime/card_effects.json');
const equipmentEffects = read('data/card_runtime/equipment_effects.json');
const combos = read('data/card_runtime/card_combos.json');
const groups = read('data/card_runtime/item_groups.json');
const drops = read('data/card_runtime/card_drop_sources.json');
const jobs = read('data/jobs.json');
const basepoints = read('data/job_basepoints.json');
window.RO_WEB_DATA = {
  'data/card_runtime/card_effects.json': cards,
  'data/card_runtime/equipment_effects.json': equipmentEffects,
  'data/card_runtime/card_combos.json': combos,
  'data/card_runtime/item_groups.json': groups,
  'data/card_runtime/card_drop_sources.json': drops,
  'data/jobs.json': jobs
};
const item2387 = { id:2387, name:'急速衝刺鎧甲', type:'equipment', slot:'body', equipSlot:'body', slotCount:1 };
window.getItemData = id => String(id) === '2387' ? item2387 : (cards[String(id)] || null);
window.getEquipmentInstance = slot => window.player?.equipmentInstances?.[slot] || null;
window.getCurrentJobData = () => jobs[window.player?.jobKey];
window.getTrainingBonusTotals = () => ({});
window.getPassiveSkillBonusTotals = () => ({});
window.getActiveBuffBonusTotals = () => ({});
window.loadJson = async (url, fallback) => {
  const rel = String(url).replace(/^\.\//, '');
  try { return read(rel); } catch (_) { return fallback; }
};
window.player = {
  jobKey:'dragon_knight', job:'龍騎士', baseLevel:200, jobLevel:1,
  stats:{str:1,agi:1,vit:130,int:1,dex:1,luk:1}, traits:{pow:0,sta:0,wis:0,spl:0,con:0,crt:0},
  equipment:{body:2387}, equipmentInstances:{body:{id:2387,instanceId:'fw-test',refine:0,cards:[4392,null,null,null]}},
  inventory:[], learnedSkills:{}, activeBuffs:{}, completedAdventurerTraining:[], usedStatusPoints:0
};

vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js/card_runtime.js'), 'utf8'), { filename:'card_runtime.js' });
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js/status_system.js'), 'utf8'), { filename:'status_system.js' });

(async () => {
  const originalLog = console.log;
  console.log = () => {};
  await loadStatusData();
  console.log = originalLog;
  CardRuntime.init();

  const sources = CardRuntime.getSources();
  const equip = sources.find(row => row.sourceType === 'equipment' && Number(row.sourceId) === 2387);
  const card = sources.find(row => row.sourceType === 'card' && Number(row.sourceId) === 4392);
  const derived = calculateDerivedPlayerStats();
  check(equip?.vitFlat === 1, 'Sprint Mail VIT +1', JSON.stringify(equip));
  check(equip?.hpRecoveryRate === 5, 'Sprint Mail HP natural recovery +5%', JSON.stringify(equip));
  check(equip?.itemHpRecoveryRate === 3, 'Sprint Mail item recovery +3%', JSON.stringify(equip));
  check(equip?.healingReceivedRate === 3, 'Sprint Mail healing received +3%', JSON.stringify(equip));
  check(Math.floor(Number(card?.dexFlat || 0)) === 7, 'Observation Card VIT/18 DEX evaluator', String(card?.dexFlat));
  check(derived.stats.vit === 131, 'Derived VIT includes equipment script', String(derived.stats.vit));
  check(derived.stats.dex === 8, 'Derived DEX includes Observation Card', String(derived.stats.dex));

  const baseHp = Number(basepoints.dragon_knight.baseHp['200']);
  const expectedWithArmor = Math.floor((baseHp * (1 + 131 / 100) * 1.25 + 1));
  const expectedWithoutArmor = Math.floor(baseHp * (1 + 130 / 100) * 1.25);
  check(derived.maxHp === expectedWithArmor, 'Dragon Knight MaxHP exact FW formula', `${derived.maxHp} vs ${expectedWithArmor}`);
  check(derived.maxHp > expectedWithoutArmor, 'VIT +1 armor increases MaxHP', `${expectedWithoutArmor} -> ${derived.maxHp}`);
  check(derived.maxHp >= 70000, 'Fourth-job HP no novice fallback', String(derived.maxHp));

  let runtimeErrors = 0;
  const unresolved = {};
  for (const record of Object.values(equipmentEffects)) {
    const out = CardRuntime._debugEvaluateRecord(record, {
      sourceType:'equipment', hostRow:{itemId:record.id,refine:10,item:{weaponLevel:4,weaponType:'sword'}},
      slot:'body', equippedIds:[record.id], maxRefine:10
    });
    if (out.runtimeError) runtimeErrors += 1;
    for (const [key, rows] of Object.entries(out.rawBonuses || {})) unresolved[key] = (unresolved[key] || 0) + (Array.isArray(rows) ? rows.length : 1);
  }
  check(Object.keys(equipmentEffects).length === 141, 'Active equipment script count', String(Object.keys(equipmentEffects).length));
  check(runtimeErrors === 0, 'Equipment script runtime errors', String(runtimeErrors));
  check(Object.keys(unresolved).length === 0, 'Equipment unhandled bonus commands', JSON.stringify(unresolved));

  const fourthJobs = Object.entries(jobs).filter(([key,row]) => Number(row.tier || 0) === 4 || key === 'hyper_novice');
  const incomplete = fourthJobs.filter(([key]) => {
    const row = basepoints[key];
    return !row || Object.keys(row.baseHp || {}).length < 275 || Object.keys(row.baseSp || {}).length < 275;
  }).map(([key]) => key);
  check(fourthJobs.length === 14, 'Fourth/Hyper job table count', String(fourthJobs.length));
  check(incomplete.length === 0, 'Fourth/Hyper BaseHP BaseSP Lv1-275 coverage', JSON.stringify(incomplete));

  const report = {
    version:'0.9.82FW',
    summary:{checks:checks.length,passed:checks.filter(x=>x.ok).length,failed:checks.filter(x=>!x.ok).length},
    observed:{observationCardDexFlat:card?.dexFlat,sprintMail:equip,derivedStats:derived.stats,maxHpWithoutArmor:expectedWithoutArmor,maxHpWithArmor:derived.maxHp},
    checks
  };
  fs.writeFileSync(path.join(ROOT, 'tools/test_card_equipment_status_report_0.9.82FW.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exit(report.summary.failed ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
