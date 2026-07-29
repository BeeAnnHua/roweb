#!/usr/bin/env python3
from pathlib import Path
import json, mimetypes
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
css=(ROOT/'css/style.css').read_text(encoding='utf-8')
ui=(ROOT/'js/ui.js').read_text(encoding='utf-8')
player_js=(ROOT/'js/player.js').read_text(encoding='utf-8')
item_ui=(ROOT/'js/item_instance_ui.js').read_text(encoding='utf-8')
html=(ROOT/'index.html').read_text(encoding='utf-8')

checks=[]; errors=[]
def check(name, ok, detail=None): checks.append({'name':name,'pass':bool(ok),'detail':detail})

# Static checks target the exact old-code regression paths.
check('all inventory categories receive native title fallback', 'slot.title = slot.dataset.tooltip;' in player_js)
check('consume title preserves rich tooltip', 'slot.title = `${slot.dataset.tooltip}\\n點擊查看與設定快捷欄`;' in player_js)
check('equipped slots receive native title fallback', 'element.title = element.dataset.tooltip;' in item_ui)
check('tooltip uses highest overlay layer', 'z-index:2147483000!important' in css)
check('currency uses capture pointer handler', 'document.addEventListener("pointerup"' in ui and '}, true);' in ui)
check('currency popup no six-second auto hide', 'setTimeout(hideCurrencyDetailPopup' not in ui)
check('all cache references use HL', '0.9.82HK' not in html and '?v=0.9.82HL' in html)

page_html=f'''<!doctype html><html><head><meta charset="utf-8"><base href="http://assets.local/"><style>{css}</style></head><body class="ro-black-gold-theme">
<div id="battle-field" style="position:relative;width:1280px;height:720px">
  <div id="right-hud-shell"><div id="rightHudCollapsible"><div id="top-bar">
    <div class="currency-item"><img id="goldIcon" src="images/ui/icons/icon_gold_64.png"><span id="zeny">991.4M</span></div>
    <div class="currency-item"><img src="images/ui/icons/icon_blue_gem_64.png"><span id="blueGem">2.3M</span></div>
    <div class="currency-item"><img src="images/ui/icons/icon_red_gem_64.png"><span id="redGem">3.4M</span></div>
  </div></div></div>
  <section id="inventory-window" class="game-window" style="left:20px;top:120px;z-index:26000;width:440px;height:300px">
    <button id="consume" class="inventory-slot" data-tooltip="紅色藥水" title="紅色藥水">消耗品</button>
    <button id="equipment" class="inventory-slot" data-tooltip="+13 [A] [卡片：波利卡片] [附魔4：雪花魔力] 黯淡冰晶長劍 [1]" title="+13 [A] [卡片：波利卡片] [附魔4：雪花魔力] 黯淡冰晶長劍 [1]">裝備</button>
    <button id="etc" class="inventory-slot" data-tooltip="高密度乙太鈽鐳" title="高密度乙太鈽鐳">道具</button>
  </section>
</div><button id="outside" style="position:fixed;left:600px;top:500px">outside</button>
<script>var player=window.player={{zeny:991400123,blueGem:2345678,redGem:3456789}};</script></body></html>'''

def route_factory(route):
    rel=route.request.url.split('http://assets.local/',1)[-1].split('?',1)[0]
    f=ROOT/rel
    if f.is_file(): route.fulfill(status=200,body=f.read_bytes(),content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream')
    else: route.fulfill(status=404,body=b'')

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':720})
    page.route('http://assets.local/**',route_factory)
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.set_content(page_html,wait_until='load')
    page.add_script_tag(content=ui)
    page.evaluate('() => { initGameTooltips(); initCurrencyDetailPopup(); }')

    for selector, expected in [('#consume','紅色藥水'),('#equipment','黯淡冰晶長劍'),('#etc','高密度乙太鈽鐳')]:
        page.hover(selector); page.wait_for_timeout(60)
        state=page.evaluate("() => {const t=document.getElementById('game-tooltip'),r=t.getBoundingClientRect();const top=document.elementFromPoint(r.left+Math.min(10,r.width/2),r.top+Math.min(10,r.height/2));return {visible:t.classList.contains('is-visible'),text:t.innerText,z:getComputedStyle(t).zIndex,topId:top?.id||'',topClass:top?.className||''};}")
        check(f'{selector} hover visible above window',state['visible'] and expected in state['text'] and int(state['z'])>26000,state)

    # Simulate an early HUD handler that blocks bubble click. Capture pointerup must still open the popup.
    page.evaluate("() => document.getElementById('top-bar').addEventListener('click',e=>e.stopImmediatePropagation(),true)")
    page.dispatch_event('#goldIcon','pointerup',{'pointerType':'mouse','clientX':1100,'clientY':20})
    page.wait_for_timeout(80)
    currency=page.evaluate("() => {const p=document.getElementById('currency-detail-popup'),r=p?.getBoundingClientRect?.()||{};return p?{hidden:p.hidden,visible:p.classList.contains('is-visible'),text:p.innerText,z:getComputedStyle(p).zIndex,rect:[r.left,r.top,r.right,r.bottom],expanded:document.getElementById('top-bar').getAttribute('aria-expanded')}:null}")
    check('currency pointerup bypasses old click blocker',currency and currency['visible'] and not currency['hidden'],currency)
    check('currency shows exact full values',currency and all(x in currency['text'] for x in ['991,400,123','2,345,678','3,456,789']),currency)
    check('currency popup above all legacy UI',currency and int(currency['z'])>26000,currency)
    page.wait_for_timeout(6200)
    check('currency remains open until explicit close',page.evaluate("() => document.getElementById('currency-detail-popup')?.classList.contains('is-visible')===true"))
    page.dispatch_event('#outside','pointerdown',{'pointerType':'mouse','clientX':620,'clientY':520})
    page.wait_for_timeout(30)
    check('outside pointer closes currency popup',page.evaluate("() => document.getElementById('currency-detail-popup')?.hidden===true"))

    out=ROOT/'docs/previews';out.mkdir(parents=True,exist_ok=True)
    page.hover('#equipment');page.wait_for_timeout(40)
    page.screenshot(path=str(out/'LEGACY_TOOLTIP_CURRENCY_0.9.82HL_desktop.png'),full_page=False)

    mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    mobile.set_content(page_html,wait_until='load'); mobile.add_script_tag(content=ui); mobile.evaluate('() => {initGameTooltips();initCurrencyDetailPopup();}')
    mobile.dispatch_event('#goldIcon','pointerup',{'pointerType':'touch','clientX':340,'clientY':20})
    mobile.wait_for_timeout(60)
    m=mobile.evaluate("() => {const p=document.getElementById('currency-detail-popup'),r=p.getBoundingClientRect();return {visible:p.classList.contains('is-visible'),text:p.innerText,left:r.left,right:r.right,vw:innerWidth}}")
    check('mobile pointerup opens currency',m['visible'] and '991,400,123' in m['text'],m)
    check('mobile currency fits viewport',m['left']>=0 and m['right']<=m['vw']+1,m)
    mobile.screenshot(path=str(out/'LEGACY_TOOLTIP_CURRENCY_0.9.82HL_mobile.png'),full_page=False)
    browser.close()

check('no browser runtime errors',not errors,errors)
failed=[x for x in checks if not x['pass']]
report={'version':'0.9.82HL','passed':len(checks)-len(failed),'failed':len(failed),'checks':checks,'errors':errors}
(ROOT/'tools/test_hl_legacy_tooltip_currency_hardening_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':report['passed'],'failed':report['failed'],'failedChecks':failed,'errors':errors},ensure_ascii=False,indent=2))
raise SystemExit(1 if failed else 0)
