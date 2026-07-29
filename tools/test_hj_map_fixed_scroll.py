#!/usr/bin/env python3
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
css=(ROOT/'css/style.css').read_text(encoding='utf-8')
map_js=(ROOT/'js/map.js').read_text(encoding='utf-8')
rows=[{'monsterId':11000+i,'category':'normal'} for i in range(18)]
monsters=[]
for i,row in enumerate(rows):
    drops=[{'itemId':50000+i*30+j,'chance':10000-j*100,'qtyMin':1,'qtyMax':1} for j in range(18)]
    monsters.append({'id':row['monsterId'],'name':f'冰川測試怪物 {i+1:02d}','drops':drops})
items={str(d['itemId']):{'id':d['itemId'],'officialId':d['itemId'],'name':f'測試掉落 {d["itemId"]}','icon':''} for m in monsters for d in m['drops']}
base=f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>{css}</style></head><body class="ro-black-gold-theme" style="margin:0;background:#37451f;min-height:100vh"><div id="battle-field"><section id="map-window" class="game-window true-map-window" style="position:absolute;left:750px;top:80px"><div class="window-title drag-handle">地圖傳送<button class="window-size-cycle">中</button><button class="window-close">×</button></div><div class="map-template-body"><div id="map-list"><button id="anchor">冰川地圖</button></div></div></section></div></body></html>'''
spawn_data=json.dumps({'regions':{'ice':{'pool':rows}}},ensure_ascii=False)
monster_data=json.dumps(monsters,ensure_ascii=False)
item_data=json.dumps(items,ensure_ascii=False)
stubs=f'''
window.RO_WEB_DATA={{"data/monster_spawn_config.json":{spawn_data},"data/enchant_grade_map_drops.json":{{"profiles":{{}}}}}};
var maps=[{{id:'ice',displayName:'冰川地圖',name:'冰川地圖',recommendedLevel:'200～245',monsterSpawnProfile:'ice'}}];
var monsters={monster_data};var player={{currentCity:null}};var currentMap={{id:'ice',name:'冰川地圖'}};
var __items={item_data};function getItemData(id){{return __items[String(id)]||{{id:id,name:'Item '+id,officialId:id,icon:''}};}}
function changeMap(){{}} function updateToggleButtonStates(){{}} function hideGameTooltip(){{}}
'''
checks=[]; errors=[]
def check(name,ok,detail=None):checks.append({'name':name,'pass':bool(ok),'detail':detail})
def open_page(page,coarse):
    page.set_content(base,wait_until='load')
    page.add_script_tag(content=f"window.matchMedia=(q)=>({{matches:{str(coarse).lower()} && /pointer: coarse|max-width: 700|max-width: 900/.test(q),addEventListener(){{}},removeEventListener(){{}}}});")
    page.add_script_tag(content=stubs)
    page.add_script_tag(content=map_js)
    page.evaluate("showMapMonsterDistributionTooltip(maps[0],document.getElementById('anchor'))")
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':720})
    page.on('pageerror',lambda e:errors.append(str(e)))
    open_page(page,False)
    title=page.locator('#map-window>.window-title').inner_text().strip()
    check('map title renamed to 地圖傳送',title.startswith('地圖傳送') and '/' not in title,title)
    roster=page.evaluate('''() => {const x=document.getElementById('map-monster-distribution-tooltip'),r=x.getBoundingClientRect(),cs=getComputedStyle(x);return {height:r.height,clientHeight:x.clientHeight,scrollHeight:x.scrollHeight,overflowY:cs.overflowY,rowHeight:document.querySelector('.map-monster-distribution-row').getBoundingClientRect().height,rowCount:document.querySelectorAll('.map-monster-distribution-row').length};}''')
    check('desktop roster fixed to compact viewport',395<=roster['height']<=432,roster)
    check('desktop roster scrolls internally',roster['scrollHeight']>roster['clientHeight'] and roster['overflowY']=='auto',roster)
    visible_rows=(roster['clientHeight']-55)/max(1,roster['rowHeight'])
    check('viewport is roughly 10–12 monster rows',9.5<=visible_rows<=12.5,{'visibleRows':visible_rows,**roster})
    page.locator('.map-monster-distribution-row').first.click()
    detail=page.evaluate('''() => {const x=document.getElementById('map-monster-distribution-tooltip'),r=x.getBoundingClientRect(),cs=getComputedStyle(x);return {height:r.height,clientHeight:x.clientHeight,scrollHeight:x.scrollHeight,overflowY:cs.overflowY,detailVisible:!document.querySelector('.map-monster-drop-detail').hidden,footerCount:document.querySelectorAll('.map-monster-drop-footer').length};}''')
    check('long drop detail uses same fixed frame',395<=detail['height']<=432,detail)
    check('long drop detail scrolls internally',detail['scrollHeight']>detail['clientHeight'] and detail['overflowY']=='auto',detail)
    check('drop detail has no duplicate footer buttons',detail['footerCount']==0,detail)
    out=ROOT/'docs/previews';out.mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(out/'MAP_FIXED_SCROLL_0.9.82HJ_desktop.png'),full_page=False)
    mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    open_page(mobile,True)
    mob=mobile.evaluate('''() => {const x=document.getElementById('map-monster-distribution-tooltip'),cs=getComputedStyle(x);return {embedded:x.classList.contains('is-embedded'),height:x.getBoundingClientRect().height,maxHeight:cs.maxHeight,enter:document.querySelectorAll('.map-monster-enter-map').length,back:document.querySelectorAll('.map-monster-return-map').length};}''')
    check('mobile retains embedded navigation viewer',mob['embedded'] and mob['enter']==1 and mob['back']==1,mob)
    check('desktop fixed 430px rule does not force mobile',mob['maxHeight']!='430px',mob)
    mobile.screenshot(path=str(out/'MAP_FIXED_SCROLL_0.9.82HJ_mobile.png'),full_page=False)
    browser.close()
check('no map browser runtime errors',not errors,errors)
failed=[x for x in checks if not x['pass']]
report={'version':'0.9.82HJ','checks':checks,'passed':len(checks)-len(failed),'failed':len(failed),'errors':errors}
(ROOT/'tools/test_hj_map_fixed_scroll_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':report['passed'],'failed':report['failed'],'failedChecks':failed,'errors':errors},ensure_ascii=False,indent=2))
raise SystemExit(1 if failed else 0)
