#!/usr/bin/env python3
from pathlib import Path
import json,re,sys
ROOT=Path(__file__).resolve().parents[1]
checks=[]
def check(cond,label): checks.append((bool(cond),label)); print(('PASS' if cond else 'FAIL')+': '+label)
server=json.loads((ROOT/'data/server_config.json').read_text(encoding='utf-8'))
index=(ROOT/'index.html').read_text(encoding='utf-8')
player=(ROOT/'js/player.js').read_text(encoding='utf-8')
skill=(ROOT/'js/skill_engine.js').read_text(encoding='utf-8')
theme=(ROOT/'js/ui_theme_runtime.js').read_text(encoding='utf-8')
auto=(ROOT/'js/auto_battle.js').read_text(encoding='utf-8')
game=(ROOT/'js/game.js').read_text(encoding='utf-8')
check(server.get('version')=='0.9.82GQ','server version GQ')
check('const RO_WEB_VERSION = "0.9.82GQ"' in game,'game version GQ')
check(set(re.findall(r'[?&]v=([^&"\']+)',index))=={'0.9.82GQ'},'all cache keys GQ')
check('function normalizeActiveBuffs(options = {})' in skill,'active buff normalization accepts options')
check('const processPeriodic = options.processPeriodic !== false' in skill,'periodic processing flag exists')
check('normalizeActiveBuffs({ processPeriodic: false });' in skill,'buff totals use pure normalization')
check('normalizeActiveBuffs({ processPeriodic: false });' in player,'save loading does not tick periodic buffs')
check('renewal_mediale_votum' in skill and 'if (!processPeriodic) return;' in skill,'Cardinal periodic-heal recursion gate')
check('input.dataset.roNumberOwner === "auto-combat"' in theme,'global stepper skips auto-combat owner')
check('input.closest("#auto-combat-panel, .auto-number-control, .shop-qty-row")' in theme,'global stepper skips auto panel and shop controls')
check('input.dataset.roNumberOwner = "auto-combat"' in auto,'auto combat claims number inputs')
check('new MutationObserver' not in theme and 'backgroundPolling: false' in theme,'theme has no background DOM audit')
failed=[label for ok,label in checks if not ok]
print(json.dumps({'version':'0.9.82GQ','passed':len(checks)-len(failed),'total':len(checks),'failed':failed},ensure_ascii=False,indent=2))
sys.exit(1 if failed else 0)
