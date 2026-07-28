#!/usr/bin/env python3
from pathlib import Path
import json, re, mimetypes
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
checks=[]
def check(name, cond, detail=''):
    checks.append({'name':name,'pass':bool(cond),'detail':str(detail)})

html=(ROOT/'index.html').read_text(encoding='utf-8')
js_enchant=(ROOT/'js/enchant_platform_preview.js').read_text(encoding='utf-8')
js_exchange=(ROOT/'js/enchant_material_exchange_preview.js').read_text(encoding='utf-8')
css=(ROOT/'css/style.css').read_text(encoding='utf-8')
npcs=json.loads((ROOT/'data/npcs.json').read_text(encoding='utf-8'))
enchant=json.loads((ROOT/'data/dim_glacier_enchant_preview.json').read_text(encoding='utf-8'))
exchange=json.loads((ROOT/'data/enchant_material_exchange_preview.json').read_text(encoding='utf-8'))

check('version GX', enchant.get('version')=='0.9.82GX' and exchange.get('version')=='0.9.82GX')
check('slot order 4-3-2', enchant.get('constitution',{}).get('slotOrder')==[4,3,2])
check('slot 4 count 179', enchant.get('slots',{}).get('4',{}).get('count')==179)
check('slot 3 count 99', enchant.get('slots',{}).get('3',{}).get('count')==99)
check('slot 2 count 2', enchant.get('slots',{}).get('2',{}).get('count')==2)
check('unique enchant count 189', enchant.get('counts',{}).get('uniqueEnchantItems')==189)
check('upgrade steps 8', len(enchant.get('upgrades',[]))==8)
check('reset raw ore x5', enchant.get('reset',{}).get('materials')==[{'id':1000811,'name':'雪花魔力原石','amount':5}])
check('exchange shows all without inventory', exchange.get('inventoryFiltered') is False and exchange.get('recipePolicy',{}).get('showAllRecipesWithoutInventory') is True)
check('exchange execution disabled', exchange.get('recipePolicy',{}).get('executeDisabled') is True)
check('exchange catalog 16', len(exchange.get('catalog',[]))==16)
check('exchange NPC exists in Payon', any(n.get('id')=='payon_enchant_material_exchange_npc' and n.get('cityId')=='payon' and n.get('type')=='enchant_material_exchange' for n in npcs))
check('enchant NPC still exists', any(n.get('id')=='payon_enchant_platform_npc' and n.get('cityId')=='payon' for n in npcs))
check('new exchange UI exists', 'id="enchantMaterialExchangeWindow"' in html)
check('enchant search exists', 'id="enchantPlatformStoneSearch"' in html)
check('exchange runtime included', 'js/enchant_material_exchange_preview.js?v=0.9.82GX' in html)
check('all cache refs GX', set(re.findall(r'[?&]v=([^&"\']+)',html))=={'0.9.82GX'}, sorted(set(re.findall(r'[?&]v=([^&"\']+)',html))))
check('preview scripts do not save', 'saveGame(' not in js_enchant and 'saveGame(' not in js_exchange)
check('preview scripts do not consume', all(x not in (js_enchant+js_exchange) for x in ['consumeItem(', 'removeItem(', 'player.inventory', 'player.equipment']))

# Exact RA material costs already parsed into project data.
slot_expected={
    4:[(1001034,10),(1001035,15),(1001036,25)],
    3:[(1001034,15),(1001035,20),(1001036,35)],
    2:[(1001034,30),(1001035,40),(1001036,60),(1001037,50)],
}
for slot, expected in slot_expected.items():
    rows=enchant['slots'][str(slot)]['items']
    got=[(int(x['id']),int(x['amount'])) for x in rows[0]['materials']]
    check(f'slot {slot} exact material cost', got==expected, got)
    check(f'slot {slot} every entry shares cost', all([(int(x['id']),int(x['amount'])) for x in row['materials']]==expected for row in rows))

# All data-linked item icons.
required=set()
for slot in enchant['slots'].values():
    for row in slot['items']:
        required.add(int(row['id']))
        required.update(int(x['id']) for x in row.get('materials',[]))
for step in enchant['upgrades']:
    required.update([int(step['from']['id']),int(step['to']['id'])])
    required.update(int(x['id']) for x in step.get('materials',[]))
required.update(int(x['id']) for x in exchange['catalog'])
required.add(int(exchange['sourceItem']['id']))
required.update([4001,600030,550089,700059])
missing=[x for x in sorted(required) if not (ROOT/f'images/items/{x}.webp').is_file()]
check('all required icons exist', not missing, missing)
check('required icon count 209', len(required)==209, len(required))

# Isolated Chromium interaction test.
start=html.index('<section id="enchantPlatformWindow"')
end=html.index('<section id="storageWindow"',start)
fragment=html[start:end]
marker='/* =========================================================\n   0.9.82GW'
preview_css=css[css.index(marker):]
ro_data={
  'data/dim_glacier_enchant_preview.json':enchant,
  'data/enchant_material_exchange_preview.json':exchange,
}
page_html=f'''<!doctype html><html><head><meta charset="utf-8"><base href="http://assets.local/"><style>html,body{{margin:0;width:100%;height:100%;background:#101820;font-family:Arial,sans-serif}}{preview_css}</style></head><body>{fragment}<script>window.RO_WEB_DATA={json.dumps(ro_data,ensure_ascii=False)};</script><script>{js_enchant}</script><script>{js_exchange}</script></body></html>'''
errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    def attach(page):
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
    page=browser.new_page(viewport={'width':1440,'height':900}); attach(page)
    page.evaluate("openEnchantPlatformPreview({name:'附魔研究員'})")
    initial=page.evaluate("() => ({open:!enchantPlatformWindow.hidden,slot:EnchantPlatformPreview.getState().currentSlot,rows:document.querySelectorAll('.enchant-stone-row').length,heading:enchantPlatformStoneHeading.textContent,disabled:enchantPlatformExecute.disabled})")
    page.fill('#enchantPlatformStoneSearch','天龍氣息')
    searched=page.evaluate("() => ({rows:document.querySelectorAll('.enchant-stone-row').length,names:[...document.querySelectorAll('.enchant-stone-row b')].map(x=>x.textContent)})")
    page.fill('#enchantPlatformStoneSearch','')
    page.locator('.enchant-stone-row').first.click()
    selected=page.evaluate("() => ({info:!enchantStoneInfoWindow.hidden,selected:document.querySelectorAll('.enchant-stone-row.is-selected').length,disabled:enchantPlatformExecute.disabled,costs:[...document.querySelectorAll('.enchant-cost-item b')].map(x=>x.textContent)})")
    page.evaluate('closeEnchantStoneInfo()')
    page.locator('#enchantPlatformExecute').click()
    after4=page.evaluate("() => ({slot:EnchantPlatformPreview.getState().currentSlot,rows:document.querySelectorAll('.enchant-stone-row').length,heading:enchantPlatformStoneHeading.textContent,costs:[...document.querySelectorAll('.enchant-cost-item b')].map(x=>x.textContent)})")
    page.evaluate("setEnchantPlatformTab('upgrade')")
    upgrade=page.evaluate("() => ({rows:document.querySelectorAll('.enchant-upgrade-row').length,costs:[...document.querySelectorAll('.enchant-cost-item b')].map(x=>x.textContent),ready:!enchantPlatformExecute.disabled})")
    page.evaluate('closeEnchantPlatformPreview()')
    page.evaluate("openEnchantMaterialExchangePreview({name:'綜合材料兌換研究員'})")
    ex_initial=page.evaluate("() => ({open:!enchantMaterialExchangeWindow.hidden,groups:document.querySelectorAll('.enchant-exchange-groups button').length,items:document.querySelectorAll('.enchant-exchange-item').length,disabled:enchantExchangeExecute.disabled,detail:enchantExchangeDetail.textContent})")
    page.fill('#enchantExchangeSearch','萃取液')
    ex_search=page.evaluate("() => ({items:document.querySelectorAll('.enchant-exchange-item').length,names:[...document.querySelectorAll('.enchant-exchange-item b')].map(x=>x.textContent)})")

    mobile=browser.new_page(viewport={'width':390,'height':844}); attach(mobile)
    mobile.evaluate("openEnchantPlatformPreview({name:'附魔研究員'})")
    m1=mobile.evaluate("() => ({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,bottom:document.querySelector('.enchant-platform-dialog').getBoundingClientRect().bottom,height:innerHeight})")
    mobile.evaluate('closeEnchantPlatformPreview()')
    mobile.evaluate("openEnchantMaterialExchangePreview({name:'綜合材料兌換研究員'})")
    m2=mobile.evaluate("() => ({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,bottom:document.querySelector('.enchant-exchange-dialog').getBoundingClientRect().bottom,height:innerHeight})")
    browser.close()

check('enchant preview opens', initial['open'], initial)
check('enchant starts slot 4', initial['slot']==4, initial)
check('slot 4 renders all 179', initial['rows']==179, initial)
check('slot 4 heading count', '179 / 179' in initial['heading'], initial)
check('execute disabled before selection', initial['disabled'] is True, initial)
check('search finds actual enchant', searched['rows']>=1 and any('天龍氣息' in n for n in searched['names']), searched)
check('selection opens info', selected['info'] is True and selected['selected']==1, selected)
check('selection lights execute', selected['disabled'] is False, selected)
check('slot 4 costs display exact amounts', selected['costs'][:3]==['×10','×15','×25'], selected)
check('preview advances to slot 3', after4['slot']==3, after4)
check('slot 3 renders all 99', after4['rows']==99, after4)
check('slot 3 costs exact', after4['costs'][:3]==['×15','×20','×35'], after4)
check('upgrade renders 8 steps', upgrade['rows']==8, upgrade)
check('upgrade selected and ready', upgrade['ready'] is True, upgrade)
check('exchange preview opens', ex_initial['open'], ex_initial)
check('exchange has all categories', ex_initial['groups']==5, ex_initial)
check('exchange displays all 16', ex_initial['items']==16, ex_initial)
check('exchange remains disabled', ex_initial['disabled'] is True, ex_initial)
check('exchange explains fixed display', '固定顯示全部項目' in ex_initial['detail'], ex_initial['detail'][:200])
check('exchange search works', 1 <= ex_search['items'] < 16 and all('萃取液' in n for n in ex_search['names']), ex_search)
check('mobile enchant no horizontal overflow', m1['scrollWidth']==m1['clientWidth'], m1)
check('mobile enchant dialog in viewport', m1['bottom']<=m1['height']+1, m1)
check('mobile exchange no horizontal overflow', m2['scrollWidth']==m2['clientWidth'], m2)
check('mobile exchange dialog in viewport', m2['bottom']<=m2['height']+1, m2)
check('Chromium UI errors', not errors, errors)

failed=[c for c in checks if not c['pass']]
report={'version':'0.9.82GX','checks':checks,'passed':len(checks)-len(failed),'failed':len(failed),'errors':errors}
(ROOT/'tools/test_enchant_catalog_exchange_preview_report_0.9.82GX.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(1 if failed else 0)
