#!/usr/bin/env python3
from pathlib import Path
import json,re
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
css=(ROOT/'css/style.css').read_text(encoding='utf-8')
start=css.index('/* ============================================================\n   RO_WEB 0.9.82HV — Unified combat-number color contract')
hv_css=css[start:]
base='''.damage-number{position:relative;display:inline-block;min-width:120px;text-align:center;font-family:"Arial Black","Microsoft JhengHei",sans-serif;font-size:39px;font-weight:900;letter-spacing:.35px;pointer-events:none}.summon-damage-number{color:#72e6ff;-webkit-text-fill-color:#72e6ff;-webkit-text-stroke:2px #07384a;text-shadow:0 3px 0 #00151e,0 0 12px rgba(92,225,255,.95)}.miss-damage-number{color:#f7f7f7!important;-webkit-text-fill-color:#f7f7f7!important;-webkit-text-stroke:2px #2a2a2a!important}'''
preview='''html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#252018;font-family:"Microsoft JhengHei",sans-serif}.preview{width:960px;height:540px;position:relative;background:radial-gradient(circle at 55% 42%,rgba(139,111,68,.35),transparent 38%),linear-gradient(135deg,#395245,#4d553c 44%,#514132);box-shadow:inset 0 0 100px rgba(0,0,0,.58)}.title{position:absolute;left:28px;top:22px;color:#ffe4a0;font-weight:900;font-size:22px;text-shadow:0 2px 3px #000}.row{position:absolute;left:45px;right:45px;display:flex;align-items:center;gap:48px}.row.one{top:130px}.row.two{top:300px}.sample{width:160px;height:100px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px}.label{color:#eadfc8;font-size:14px;text-shadow:0 2px 2px #000}.damage-number{left:auto!important;top:auto!important;opacity:1!important;transform:none!important;animation:none!important}.damage-number.critical-damage-number::before{opacity:1!important;transform:translate(-50%,-50%) scale(1.05) rotate(12deg)!important;animation:none!important}.damage-number.critical-damage-number::after{opacity:.85!important;transform:translate(-50%,-50%) scale(1)!important;animation:none!important}.note{position:absolute;left:28px;bottom:18px;color:#d2c3a6;font-size:12px}'''
body='''<div class="preview"><div class="title">RO_WEB 0.9.82HV 傷害數字規則預覽</div><div class="row one"><div class="sample"><div id="normal" class="damage-number">12,345</div><div class="label">一般攻擊／一般技能：白色</div></div><div class="sample"><div id="combo" class="damage-number combo-damage-number">24,680</div><div class="label">連段／多段／追加：黃色</div></div><div class="sample"><div id="critical" class="damage-number critical-damage-number">98,765</div><div class="label">普通／技能爆擊：黃紅＋特效</div></div><div class="sample"><div id="incoming" class="damage-number incoming-damage-number">4,321</div><div class="label">怪物打玩家：固定紅色</div></div></div><div class="row two"><div class="sample"><div class="damage-number combo-damage-number critical-damage-number cumulative-damage-final">1,234,567</div><div class="label">連段技能爆擊總傷</div></div><div class="sample"><div class="damage-number summon-damage-number">36,900</div><div class="label">召喚物維持藍色識別</div></div><div class="sample"><div class="damage-number miss-damage-number">MISS</div><div class="label">MISS 維持白灰色</div></div></div><div class="note">實際遊戲仍使用浮起、累積與世界座標動畫。</div></div>'''
html=f'<!doctype html><meta charset="utf-8"><style>{base}\n{hv_css}\n{preview}</style>{body}'
checks=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-gpu'])
    page=browser.new_page(viewport={'width':960,'height':540},device_scale_factor=1)
    page.set_content(html,wait_until='load')
    styles=page.evaluate('''() => { const get=id=>{const s=getComputedStyle(document.getElementById(id));return {color:s.color,fill:s.webkitTextFillColor,stroke:s.webkitTextStrokeColor,background:s.backgroundImage,fontSize:s.fontSize}}; return {normal:get('normal'),combo:get('combo'),critical:get('critical'),incoming:get('incoming')}; }''')
    checks.append({'name':'normal white','ok':styles['normal']['fill'] in ('rgb(255, 255, 255)','#ffffff')})
    checks.append({'name':'combo yellow','ok':'255, 227, 74' in styles['combo']['fill']})
    checks.append({'name':'critical yellow fill red outline','ok':'255, 232, 79' in styles['critical']['fill'] and '211, 43, 31' in styles['critical']['stroke']})
    checks.append({'name':'incoming red','ok':'255, 60, 60' in styles['incoming']['fill']})
    out=ROOT/'docs/previews/DAMAGE_NUMBER_VISUAL_0.9.82HV.png'
    page.screenshot(path=str(out),full_page=False)
    browser.close()
report={'version':'0.9.82HV','suite':'damage-number-browser-render','passed':sum(1 for x in checks if x['ok']),'failed':sum(1 for x in checks if not x['ok']),'checks':checks,'computedStyles':styles}
(ROOT/'TEST_REPORT_0.9.82HV_DAMAGE_NUMBER_BROWSER_RENDER.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(1 if report['failed'] else 0)
