#!/usr/bin/env python3
from pathlib import Path
import json, mimetypes
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
css=(ROOT/'css/style.css').read_text(encoding='utf-8')
ui=(ROOT/'js/ui.js').read_text(encoding='utf-8')
html_source=(ROOT/'index.html').read_text(encoding='utf-8')
checks=[]; errors=[]
def check(name, ok, detail=None): checks.append({'name':name,'pass':bool(ok),'detail':detail})

check('index uses HR cache version', '0.9.82HP' not in html_source and '?v=0.9.82HR' in html_source)
check('top bar keeps inline fallback', 'id="top-bar" onclick="return toggleCurrencyBarExpanded(event)"' in html_source)
check('currency uses inline expanded class', 'is-currency-expanded' in ui and 'is-currency-expanded' in css)
check('currency uses capture pointer and click', 'document.addEventListener("pointerup", captureToggle, true)' in ui and 'document.addEventListener("click", captureToggle, true)' in ui)
check('full values use independent nodes', 'currency-expanded-value' in ui and 'currency-expanded-value' in css)
check('legacy popup is disabled', '.currency-detail-popup{display:none!important}' in css)

page_html=f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="http://assets.local/"><style>{css}</style></head><body class="ro-black-gold-theme">
<div id="game-root"><div id="battle-field" style="position:relative;width:100vw;height:100vh">
  <div id="right-hud-shell" class="right-hud-shell"><div id="rightHudCollapsible" class="right-hud-collapsible"><div id="top-bar" onclick="return toggleCurrencyBarExpanded(event)">
    <div class="currency-item"><img id="goldIcon" src="images/ui/icons/icon_gold_64.png"><span id="zeny">991.4M</span></div>
    <div class="currency-item gem-blue"><img src="images/ui/icons/icon_blue_gem_64.png"><span id="blueGem">2.3M</span></div>
    <div class="currency-item gem-red"><img src="images/ui/icons/icon_red_gem_64.png"><span id="redGem">3.4M</span></div>
  </div><div id="quick-buttons"><button>背包</button><button>技能</button></div></div></div>
  <button id="outside" style="position:absolute;left:50px;top:420px">outside</button>
</div></div><script>var player=window.player={{zeny:991400123,blueGem:2345678,redGem:3456789}};</script></body></html>'''

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
    page.evaluate('() => initCurrencyDetailPopup()')
    before=page.evaluate("() => {const t=document.getElementById('top-bar'),r=t.getBoundingClientRect();return {expanded:t.getAttribute('aria-expanded'),height:r.height,fullCount:document.querySelectorAll('.currency-expanded-value').length,title:t.title}}")
    check('starts collapsed at compact height',before['expanded']=='false' and before['height']<=45,before)
    check('creates three full value nodes',before['fullCount']==3,before)
    check('hover title keeps exact zeny', '991,400,123' in page.locator('#goldIcon').locator('..').get_attribute('title'))

    # Old target-level click blocker must not prevent document capture from expanding.
    page.evaluate("() => document.getElementById('top-bar').addEventListener('click',e=>e.stopImmediatePropagation(),true)")
    page.click('#goldIcon'); page.wait_for_timeout(100)
    expanded=page.evaluate("() => {const t=document.getElementById('top-bar'),r=t.getBoundingClientRect();return {expanded:t.getAttribute('aria-expanded'),className:t.className,height:r.height,text:t.innerText,compact:[...document.querySelectorAll('.currency-compact-value')].map(x=>getComputedStyle(x).display),full:[...document.querySelectorAll('.currency-expanded-value')].map(x=>getComputedStyle(x).display),popup:document.getElementById('currency-detail-popup')}}")
    check('click expands despite old blocker',expanded['expanded']=='true' and 'is-currency-expanded' in expanded['className'],expanded)
    check('expanded bar grows in place',expanded['height']>=110,expanded)
    check('shows all exact full values',all(x in expanded['text'] for x in ['991,400,123','2,345,678','3,456,789']),expanded)
    check('compact nodes hidden and full nodes shown',all(x=='none' for x in expanded['compact']) and all(x=='block' for x in expanded['full']),expanded)
    check('does not create separate popup',expanded['popup'] is None,expanded)
    check('pressed feedback is cleared', 'is-currency-pressed' not in expanded['className'],expanded)

    out=ROOT/'docs/previews'; out.mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(out/'CURRENCY_INLINE_EXPAND_0.9.82HR_desktop.png'),full_page=False)

    # Player/UI refresh must update the independent full-number nodes.
    page.evaluate("() => {player.zeny=1234567890;player.blueGem=7654321;player.redGem=9876543;document.getElementById('zeny').textContent='1.2B';refreshCurrencyAccessibleLabels();}")
    updated=page.locator('.currency-expanded-value').all_text_contents()
    check('runtime refresh updates full nodes',updated==['1,234,567,890','7,654,321','9,876,543'],updated)

    page.click('#outside'); page.wait_for_timeout(50)
    check('outside click collapses',page.locator('#top-bar').get_attribute('aria-expanded')=='false')
    page.click('#goldIcon'); page.wait_for_timeout(50)
    page.press('#top-bar','Escape'); page.wait_for_timeout(50)
    check('escape collapses',page.locator('#top-bar').get_attribute('aria-expanded')=='false')
    page.focus('#top-bar'); page.press('#top-bar','Enter'); page.wait_for_timeout(50)
    check('enter expands',page.locator('#top-bar').get_attribute('aria-expanded')=='true')
    page.click('#goldIcon'); page.wait_for_timeout(50)
    check('second click collapses',page.locator('#top-bar').get_attribute('aria-expanded')=='false')

    mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    mobile.route('http://assets.local/**',route_factory)
    mobile.on('pageerror',lambda e: errors.append('mobile: '+str(e)))
    mobile.set_content(page_html,wait_until='load'); mobile.add_script_tag(content=ui); mobile.evaluate('() => initCurrencyDetailPopup()')
    mobile.tap('#goldIcon'); mobile.wait_for_timeout(100)
    m=mobile.evaluate("() => {const t=document.getElementById('top-bar'),r=t.getBoundingClientRect();return {expanded:t.getAttribute('aria-expanded'),height:r.height,left:r.left,right:r.right,vw:innerWidth,text:t.innerText}}")
    check('mobile tap expands inline',m['expanded']=='true' and m['height']>=108,m)
    check('mobile expanded bar fits viewport',m['left']>=0 and m['right']<=m['vw']+1,m)
    check('mobile shows exact values','991,400,123' in m['text'] and '2,345,678' in m['text'] and '3,456,789' in m['text'],m)
    mobile.screenshot(path=str(out/'CURRENCY_INLINE_EXPAND_0.9.82HR_mobile.png'),full_page=False)
    browser.close()

check('no browser runtime errors',not errors,errors)
failed=[x for x in checks if not x['pass']]
report={'version':'0.9.82HR','passed':len(checks)-len(failed),'failed':len(failed),'checks':checks,'errors':errors}
(ROOT/'tools/test_hr_currency_inline_expand_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':report['passed'],'failed':report['failed'],'failedChecks':failed,'errors':errors},ensure_ascii=False,indent=2))
raise SystemExit(1 if failed else 0)
