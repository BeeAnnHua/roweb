#!/usr/bin/env python3
from pathlib import Path
import json, re, mimetypes
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
checks=[]
def check(name, cond, detail=''):
    checks.append({'name':name,'pass':bool(cond),'detail':str(detail)})

html=(ROOT/'index.html').read_text(encoding='utf-8')
js=(ROOT/'js/enchant_platform_preview.js').read_text(encoding='utf-8')
css=(ROOT/'css/style.css').read_text(encoding='utf-8')
npcs=json.loads((ROOT/'data/npcs.json').read_text(encoding='utf-8'))
constitution=json.loads((ROOT/'RO_WEB_CONSTITUTION.json').read_text(encoding='utf-8'))
platform=json.loads((ROOT/'data/enchant_platform_constitution.json').read_text(encoding='utf-8'))

check('NPC exists in Payon', any(n.get('id')=='payon_enchant_platform_npc' and n.get('cityId')=='payon' and n.get('type')=='enchant_platform' for n in npcs))
check('constitution rule exists', any(r.get('id')=='ENCHANT-PLATFORM-001' for r in constitution.get('rules',[])))
check('constitutional slot order 4-3-2', platform.get('slotOrder')==[4,3,2], platform.get('slotOrder'))
check('card slot fixed to 1', platform.get('cardSlot')==1, platform.get('cardSlot'))
check('preview boundary disables inventory detection', platform.get('detectInventory') is False)
check('preview boundary disables material consumption', platform.get('consumeMaterials') is False)
check('preview boundary disables persistence', platform.get('persistEnchantments') is False)
check('static UI exists', 'id="enchantPlatformWindow"' in html)
check('runtime included', 'js/enchant_platform_preview.js?v=0.9.82GW' in html)
check('all cache refs are GW', set(re.findall(r'[?&]v=([^&"\']+)',html))=={'0.9.82GW'}, sorted(set(re.findall(r'[?&]v=([^&"\']+)',html))))
check('no save call in preview runtime', 'saveGame(' not in js)
check('no consume call in preview runtime', 'consumeItem(' not in js and 'removeItem(' not in js)
check('no player inventory read in preview runtime', 'player.inventory' not in js and 'player.equipment' not in js)
check('fixed slot CSS positions', all(token in css for token in ['.slot-1{left:22px;top:26px}', '.slot-4{right:22px;top:26px}', '.slot-2{left:22px;bottom:26px}', '.slot-3{right:22px;bottom:26px}']))
for icon in [4001,600030,550089,700059,311342,311343,311344,311345,311346,311347,311443,1000811,1000812,1000813]:
    check(f'icon {icon} exists', (ROOT/f'images/items/{icon}.webp').is_file())

# Isolated real Chromium interaction test. This tests the UI without loading the full game or touching a save.
start=html.index('<section id="enchantPlatformWindow"')
end=html.index('<section id="storageWindow"',start)
fragment=html[start:end]
marker='/* =========================================================\n   0.9.82GW'
preview_css=css[css.index(marker):]
page_html=f'<!doctype html><html><head><meta charset="utf-8"><base href="http://assets.local/"><style>html,body{{margin:0;width:100%;height:100%;background:#101820;font-family:Arial,sans-serif}}{preview_css}</style></head><body>{fragment}<script>{js}</script></body></html>'
errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':900})
    def route_handler(route):
        path=route.request.url.split('http://assets.local/',1)[-1].split('?',1)[0]
        file=ROOT/path
        if file.exists() and file.is_file():
            route.fulfill(status=200,body=file.read_bytes(),content_type=mimetypes.guess_type(str(file))[0] or 'application/octet-stream')
        else:
            route.fulfill(status=404,body=b'')
    page.route('http://assets.local/**',route_handler)
    page.on('pageerror',lambda exc: errors.append(str(exc)))
    page.set_content(page_html,wait_until='load')
    page.evaluate("openEnchantPlatformPreview({name:'附魔研究員'})")
    initial=page.evaluate("() => ({open:!enchantPlatformWindow.hidden,slot:EnchantPlatformPreview.getState().currentSlot,stones:document.querySelectorAll('.enchant-stone-row').length,disabled:enchantPlatformExecute.disabled})")
    page.locator('.enchant-stone-row').first.click()
    selected=page.evaluate("() => ({info:!enchantStoneInfoWindow.hidden,selected:document.querySelectorAll('.enchant-stone-row.is-selected').length,disabled:enchantPlatformExecute.disabled})")
    page.evaluate('closeEnchantStoneInfo()')
    page.locator('#enchantPlatformExecute').click()
    after=page.evaluate("() => ({slot:EnchantPlatformPreview.getState().currentSlot,slot4:!!EnchantPlatformPreview.getState().slotContents['4'],heading:enchantPlatformStoneHeading.textContent})")
    mobile=browser.new_page(viewport={'width':390,'height':844})
    mobile.route('http://assets.local/**',route_handler)
    mobile.set_content(page_html,wait_until='load')
    mobile.evaluate("openEnchantPlatformPreview({name:'附魔研究員'})")
    metrics=mobile.evaluate("() => ({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,bottom:document.querySelector('.enchant-platform-dialog').getBoundingClientRect().bottom,height:innerHeight})")
    browser.close()

check('preview opens', initial['open'], initial)
check('starts at slot 4', initial['slot']==4, initial)
check('slot 4 list has candidates', initial['stones']==3, initial)
check('execute disabled before selection', initial['disabled'] is True, initial)
check('click opens stone info', selected['info'] is True, selected)
check('candidate locks selected', selected['selected']==1, selected)
check('execute lights after valid selection', selected['disabled'] is False, selected)
check('preview advances 4 to 3', after['slot']==3 and after['slot4'] is True, after)
check('slot 3 heading updates', '第3洞' in after['heading'], after)
check('mobile has no horizontal page overflow', metrics['scrollWidth']==metrics['clientWidth'], metrics)
check('mobile dialog stays in viewport', metrics['bottom']<=metrics['height']+1, metrics)
check('Chromium UI errors', not errors, errors)

failed=[c for c in checks if not c['pass']]
report={'version':'0.9.82GW','checks':checks,'passed':len(checks)-len(failed),'failed':len(failed),'errors':errors}
(ROOT/'tools/test_enchant_platform_preview_report_0.9.82GW.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(1 if failed else 0)
