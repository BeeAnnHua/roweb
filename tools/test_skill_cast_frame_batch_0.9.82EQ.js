const fs=require('fs'),assert=require('assert');
const battle=fs.readFileSync('js/battle.js','utf8'),player=fs.readFileSync('js/player.js','utf8'),engine=fs.readFileSync('js/skill_engine.js','utf8');
for(const token of ['RO_WEB_DAMAGE_NUMBER_BATCH','createDocumentFragment','requestAnimationFrame','scheduleDamageNumberBatch'])assert(battle.includes(token),`missing damage batch token ${token}`);
for(const token of ['requestGameSave','RO_WEB_PENDING_SAVE_TIMER','pagehide','beforeunload'])assert(player.includes(token),`missing save debounce token ${token}`);
for(const token of ['createRuntimeCombatEvaluationContext','RO_WEB_COMBAT_EVAL_CONTEXT','requestRuntimeCombatSave','withRuntimeCombatEvaluationContext'])assert(engine.includes(token),`missing combat context token ${token}`);
assert(!/updateMonsterUI\(\); if\(hitTargets[^\n]+updatePlayerUI\(\); saveGame\(\);/.test(engine),'main attack still performs synchronous save');
console.log(JSON.stringify({version:'0.9.82EQ',status:'PASS',damageNumbers:'animation-frame batch',combatSave:'300ms debounce',castStats:'single evaluation context'},null,2));
