#!/usr/bin/env python3
from pathlib import Path
import json, re
from html.parser import HTMLParser
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
errors=[]
html=(ROOT/'index.html').read_text(encoding='utf-8')
css=(ROOT/'css/style.css').read_text(encoding='utf-8')
ui=(ROOT/'js/ui.js').read_text(encoding='utf-8')

def need(cond,msg):
    if not cond: errors.append(msg)

# structural order: collapsible first, then one action row containing toggle before auto button
need('class="right-hud-action-row"' in html,'missing right-hud-action-row')
a=html.find('id="rightHudCollapseToggle"'); b=html.find('id="autoBattleQuickToggle"')
need(a>=0 and b>a,'collapse toggle must be left/before auto-battle button')
segment=html[html.rfind('<div class="right-hud-action-row">',0,a):html.find('</div>',b)+6]
need('🔼' in segment,'expanded icon should be 🔼')
need('right-hud-toggle-icon' in segment,'toggle icon span missing')
need('icon.textContent = value ? "🔽" : "🔼"' in ui,'runtime icon state switch missing')
need('aria-label' in ui,'runtime aria label update missing')
need('#right-hud-shell .right-hud-action-row' in css,'action row CSS missing')
need('border-radius: 50% !important' in css,'round toggle CSS missing')
need('\\n' not in css[-5000:],'literal escaped newlines found in final CSS')
# basic brace balance ignoring comments/strings is enough for appended block regression
need(css.count('{')==css.count('}'),f'CSS brace mismatch {css.count("{")} != {css.count("}")}')
# item audit and normalized bad files
report=ROOT/'ITEM_ICON_AUDIT_0.9.82FU.txt'
need(report.is_file(),'item icon audit report missing')
for iid in ('1010','2324'):
    p=ROOT/'images/items'/f'{iid}.webp'
    try:
        im=Image.open(p).convert('RGBA')
        need(im.size==(24,24),f'{iid} fallback should be 24x24, got {im.size}')
        need(im.getchannel('A').getbbox() is not None,f'{iid} fallback is transparent')
    except Exception as e: errors.append(f'{iid} cannot decode: {e}')
# all active item icon references exist
for p in list((ROOT/'data/items').glob('*.json'))+list((ROOT/'data/equipment').glob('**/*.json')):
    try:d=json.loads(p.read_text(encoding='utf-8'))
    except Exception as e: errors.append(f'JSON parse {p}: {e}'); continue
    if not isinstance(d,dict): continue
    for k,v in d.items():
        if not isinstance(v,dict) or ('id' not in v and 'Id' not in v): continue
        iid=str(v.get('id',v.get('Id',k)))
        icon=v.get('icon') or f'images/items/{iid}.webp'
        need((ROOT/icon).is_file(),f'missing icon {iid} {icon}')
print(json.dumps({'version':'0.9.82FU','tests':9,'errors':errors,'status':'PASS' if not errors else 'FAIL'},ensure_ascii=False,indent=2))
raise SystemExit(1 if errors else 0)
