#!/usr/bin/env python3
from pathlib import Path
import json,re,sys
ROOT=Path(__file__).resolve().parents[1]
checks=[]
def check(cond,label): checks.append((bool(cond),label))

def text(rel): return (ROOT/rel).read_text(encoding='utf-8')

server=json.loads(text('data/server_config.json'))
check(server.get('version')=='0.9.82GO','server version GO')
check(server['server']['rates'].get('gradeMaterialDropRate')==100,'grade material drop rate remains 100=1x')
index=text('index.html')
check('ui_theme_runtime.js?v=0.9.82GO' in index,'black-gold theme runtime loaded')
check(index.index('ui_theme_runtime.js') < index.index('job.js'), 'theme runtime loads before confirmation callers')
check(set(re.findall(r'[?&]v=([^&"\']+)',index))=={'0.9.82GO'},'all index cache keys GO')

theme=text('js/ui_theme_runtime.js')
for needle,label in [
 ('MutationObserver','dynamic controls are audited'),
 ('ro-number-stepper','custom number stepper exists'),
 ('stepNumberInput','number stepper changes values'),
 ('repeatTimer = global.setInterval','number stepper supports hold-repeat'),
 ('ro-gold-dialog-overlay','custom black-gold dialog exists'),
 ('ROGoldUI','shared gold confirmation API exported'),
 ('ro-gold-danger-control','danger action classification exists'),
 ('ro-gold-secondary-control','secondary action classification exists')]: check(needle in theme,label)

css=text('css/style.css')
for needle,label in [
 ('RO_WEB 0.9.82GO — 全站黑金互動元件稽核','GO theme CSS section'),
 ('input.ro-number-input[type="number"]::-webkit-inner-spin-button','native number arrows hidden'),
 ('.ro-number-stepper','gold number stepper styled'),
 ('.ro-gold-dialog-overlay','custom confirmation dialog styled'),
 ('button.ro-gold-control','general action buttons styled'),
 ('.map-monster-distribution-tooltip.is-drop-pinned','pinned monster tooltip styled'),
 ('.map-monster-distribution-row.is-selected','pinned monster row styled')]: check(needle in css,label)

# No browser-native dialog calls remain in production files.
prod='\n'.join(text(p.relative_to(ROOT)) for p in (ROOT/'js').glob('*.js') if p.name!='ui_theme_runtime.js')
check(not re.search(r'(?<![\w.])(confirm|alert|prompt)\s*\(',prod),'no bare native confirm/alert/prompt calls remain')
check('window.confirm(' not in prod and 'window.alert(' not in prod and 'window.prompt(' not in prod,'no window native dialogs remain')
for rel in ['js/job.js','js/status_system.js','js/refine_runtime.js','js/quick_slots.js']:
 check('ROGoldUI?.confirm' in text(rel),f'{rel} uses black-gold confirmation')

mapjs=text('js/map.js')
for needle,label in [
 ('pinned: false','monster drop pin state exists'),
 ('options.pin===true','click can pin selected monster'),
 ('is-drop-pinned','tooltip exposes pinned visual state'),
 ('map-monster-drop-unpin','explicit unpin control exists'),
 ('if(RO_MAP_MONSTER_TOOLTIP_STATE.pinned)return','pointer leave does not hide pinned tooltip'),
 ('document.addEventListener("pointerdown"','outside click closes pinned tooltip'),
 ('資料快取不參與掛機運算','drop lookup remains isolated from auto battle')]: check(needle in mapjs,label)
check('setInterval(refreshMapMonsterDistributionTooltip' not in mapjs,'monster drop lookup has no polling timer')
check('RO_MAP_MONSTER_DROP_CACHE = new Map()' in mapjs,'drop data still uses static cache')

# The static project currently contains these control factories; runtime audits future dynamic additions too.
static_buttons=len(re.findall(r'<button\b',index,re.I))+sum(len(re.findall(r'<button\b',text(p.relative_to(ROOT)),re.I)) for p in (ROOT/'js').glob('*.js'))
number_inputs=len(re.findall(r'type=["\']number["\']',index,re.I))+sum(len(re.findall(r'type=["\']number["\']',text(p.relative_to(ROOT)),re.I)) for p in (ROOT/'js').glob('*.js'))
check(static_buttons>=130,f'button audit coverage scan ({static_buttons} factories)')
check(number_inputs>=19,f'number input audit coverage scan ({number_inputs} factories)')

failed=[label for ok,label in checks if not ok]
for ok,label in checks: print(('PASS' if ok else 'FAIL')+': '+label)
print(json.dumps({'version':'0.9.82GO','passed':len(checks)-len(failed),'total':len(checks),'failed':failed},ensure_ascii=False))
if failed: sys.exit(1)
