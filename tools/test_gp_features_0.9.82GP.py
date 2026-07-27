#!/usr/bin/env python3
from pathlib import Path
import json,re,sys
ROOT=Path(__file__).resolve().parents[1]
checks=[]
def check(cond,label): checks.append((bool(cond),label))
server=json.loads((ROOT/'data/server_config.json').read_text(encoding='utf-8'))
index=(ROOT/'index.html').read_text(encoding='utf-8')
player=(ROOT/'js/player.js').read_text(encoding='utf-8')
skill=(ROOT/'js/skill_engine.js').read_text(encoding='utf-8')
theme=(ROOT/'js/ui_theme_runtime.js').read_text(encoding='utf-8')
auto=(ROOT/'js/auto_battle.js').read_text(encoding='utf-8')
game=(ROOT/'js/game.js').read_text(encoding='utf-8')
check(server.get('version')=='0.9.82GP','server version GP')
check('const RO_WEB_VERSION = "0.9.82GP"' in game,'game version GP')
check(set(re.findall(r'[?&]v=([^&"\']+)',index))=={'0.9.82GP'},'all cache keys GP')
check('function normalizeActiveBuffs(options = {})' in skill,'active buff normalization accepts options')
check('const processPeriodic = options.processPeriodic !== false' in skill,'periodic processing flag exists')
check('normalizeActiveBuffs({ processPeriodic: false });' in skill,'buff totals use pure normalization')
check('normalizeActiveBuffs({ processPeriodic: false });' in player,'save loading does not tick periodic buffs')
check('renewal_mediale_votum' in skill and 'if (!processPeriodic) return;' in skill,'Cardinal periodic-heal recursion gate')
check('input.dataset.roNumberOwner === "auto-combat"' in theme,'global stepper skips auto combat owner')
check('input.closest("#auto-combat-panel, .auto-number-control")' in theme,'global stepper skips auto panel')
check('input.dataset.roNumberOwner = "auto-combat"' in auto,'auto combat claims number inputs')
check('const queuedRoots = new Set()' in theme and 'requestAnimationFrame(flushAuditQueue)' in theme,'theme mutation audit batched')
failed=[label for ok,label in checks if not ok]
print(json.dumps({'version':'0.9.82GP','passed':len(checks)-len(failed),'total':len(checks),'failed':failed},ensure_ascii=False,indent=2))
sys.exit(1 if failed else 0)
