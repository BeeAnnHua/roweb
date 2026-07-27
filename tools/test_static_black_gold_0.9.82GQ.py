#!/usr/bin/env python3
from pathlib import Path
import json, sys
ROOT=Path(__file__).resolve().parents[1]
checks=[]
def check(v,label):
    checks.append((bool(v),label)); print(('PASS' if v else 'FAIL')+': '+label)
js=(ROOT/'js/ui_theme_runtime.js').read_text(encoding='utf-8')
css=(ROOT/'css/style.css').read_text(encoding='utf-8')
html=(ROOT/'index.html').read_text(encoding='utf-8')
storage=(ROOT/'js/storage_runtime.js').read_text(encoding='utf-8')
town=(ROOT/'js/town.js').read_text(encoding='utf-8')
mapjs=(ROOT/'js/map.js').read_text(encoding='utf-8')
check('new MutationObserver' not in js and '.observe(' not in js,'black-gold runtime has no MutationObserver')
check('backgroundPolling: false' in js and 'staticCss: true' in js,'runtime publishes zero-background profile')
check('<body class="ro-black-gold-theme">' in html,'theme class is static in HTML')
check('body.ro-black-gold-theme button:not(:is(' in css,'dynamic action buttons use static CSS')
check('data-ro-gold-stepper' in html and 'enchantGradeExchangeQty' in html,'grade quantity explicitly requests custom stepper')
check('enhanceNumberInput?.(qty,{force:true})' in storage,'storage quantity initializes once at creation')
check('data-ro-number-owner="shop"' in town,'shop quantity keeps existing manual controls')
check('ROBlackGoldAudit?.auditRoot?.(host)' not in mapjs,'monster drop panel performs no per-render theme audit')
check('input[type="number"]::-webkit-inner-spin-button' in css,'native white number arrows are hidden')
check('ensureDialog();' in js and 'roGoldDialogOverlay' in js,'single reusable dialog exists')
check('RO_WEB_VERSION = "0.9.82GQ"' in (ROOT/'js/game.js').read_text(encoding='utf-8'),'runtime version updated')
check('v=0.9.82GQ' in html and 'v=0.9.82GP' not in html,'index cache keys updated')
failed=[label for ok,label in checks if not ok]
result={'version':'0.9.82GQ','passed':len(checks)-len(failed),'total':len(checks),'failed':failed}
(ROOT/'GQ_STATIC_BLACK_GOLD_TEST_0.9.82GQ.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
sys.exit(1 if failed else 0)
