from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
map_js=(ROOT/'js/map.js').read_text(encoding='utf-8')
ui_js=(ROOT/'js/ui.js').read_text(encoding='utf-8')
css=(ROOT/'css/style.css').read_text(encoding='utf-8')

BASE_HTML='''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html,body{margin:0;width:100%;height:100%;background:#526835}#battle-field{position:relative;width:100%;height:100%}
body.ro-black-gold-theme{font-family:Arial,sans-serif}.game-window{position:absolute;left:80px;top:70px;width:455px;height:356px;background:#1d1006;border:1px solid #c99a43;color:#ffe6a4}.window-title{height:54px;display:flex;align-items:center;justify-content:center;background:#33200e;padding:0 8px;box-sizing:border-box}.map-template-body{position:relative;height:302px;overflow:auto}.hidden-window{display:none!important}.map-monster-distribution-tooltip{box-sizing:border-box;background:#160d05;border:1px solid #d3a34a;color:#f1dfb5;padding:8px;overflow:auto}.map-monster-distribution-row{display:block;width:100%;min-height:34px;background:#241507;color:#ffe6a4;border:0;border-bottom:1px solid #76501e;text-align:left}.map-monster-drop-row{display:flex;gap:8px;min-height:42px}.map-monster-drop-row img{width:28px;height:28px}
CSS_HERE
</style></head><body class="ro-black-gold-theme"><div id="battle-field"><section id="map-window" class="game-window true-map-window draggable-window" data-default-x="80" data-default-y="70"><div class="window-title drag-handle">地圖 / 傳送<button class="window-size-cycle">中</button><button class="window-close" data-target="map-window">×</button></div><div class="map-template-body"><div id="current-map-name"></div><div id="map-list"><button id="anchor">吉芬地區</button></div></div></section><section id="inventory-window" class="game-window draggable-window" style="left:570px;top:70px;width:300px;height:300px;pointer-events:none"><div class="window-title drag-handle">背包欄<button class="window-close" data-target="inventory-window">×</button></div></section></div></body></html>'''.replace('CSS_HERE',css)

STUBS='''
window.RO_WEB_DATA={"data/monster_spawn_config.json":{regions:{training:{pool:[{monsterId:1002,category:"normal"}]}}}};
var maps=[{id:"training",displayName:"吉芬地區",name:"吉芬地區",recommendedLevel:"48～86",monsterSpawnProfile:"training"}];
var monsters=[{id:1002,name:"蒼蠅",drops:[{itemId:501,chance:10000,qtyMin:1,qtyMax:1},{itemId:502,chance:7000,qtyMin:1,qtyMax:1}]}];
var player={currentCity:null}; var currentMap={id:"prontera",name:"普隆德拉"};
window.changedMap=null; function changeMap(id){window.changedMap=id;currentMap=maps.find(x=>x.id===id)||currentMap;}
function getItemData(id){return {name:id===501?"紅色藥水":"堅硬外殼",icon:"",type:"consumable",officialId:id};}
function updateToggleButtonStates(){} function hideGameTooltip(){} function getSavedWindowPositions(){return {}} function recoverWindowToViewport(){} function applyStoredWindowVisualScale(){} function bringWindowToFront(){} function getSavedWindowSizes(){return {}} function applyWindowSize(){} function saveWindowSize(){} function updateStatusUI(){}
'''

def init(page, coarse):
    page.set_content(BASE_HTML)
    if coarse:
        page.locator('#inventory-window').evaluate("e=>e.style.setProperty('display','none','important')")
    page.add_script_tag(content=f'''window.matchMedia=(q)=>({{matches:{str(coarse).lower()} && /pointer: coarse|max-width: 700|max-width: 900/.test(q),addEventListener(){{}},removeEventListener(){{}}}});''')
    page.add_script_tag(content=STUBS)
    page.add_script_tag(content=map_js)
    page.add_script_tag(content=ui_js)
    page.evaluate('''() => { initCloseButtons(); initDraggableWindows(); showMapMonsterDistributionTooltip(maps[0],document.getElementById("anchor")); }''')

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])

    # Desktop: no travel/back-to-map controls inside viewer; only return to list in detail.
    desktop=browser.new_page(viewport={"width":1280,"height":720})
    init(desktop,False)
    assert desktop.locator('.map-monster-enter-map').count()==0
    assert desktop.locator('.map-monster-return-map').count()==0
    desktop.locator('.map-monster-distribution-row').click()
    assert desktop.locator('.map-monster-enter-map').count()==0
    assert desktop.locator('.map-monster-return-map').count()==0
    assert desktop.locator('.map-monster-return-list').count()==2
    assert desktop.locator('.map-monster-header-action .map-monster-return-list').inner_text()=='返回怪物清單'

    # Close button restored to round image and map controls pinned on the right.
    close=desktop.locator('#map-window > .window-title > .window-close')
    size=desktop.locator('#map-window > .window-title > .window-size-cycle')
    cstyle=close.evaluate('''e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {position:s.position,borderRadius:s.borderRadius,bg:s.backgroundImage,w:r.width,h:r.height,left:r.left,top:r.top}}''')
    sbox=size.bounding_box(); titlebox=desktop.locator('#map-window > .window-title').bounding_box()
    assert cstyle['position']=='absolute',cstyle
    assert cstyle['w']==28 and cstyle['h']==28,cstyle
    assert cstyle['borderRadius'] in ('50%','9999px'),cstyle
    assert 'btn_close_round.png' in cstyle['bg'],cstyle
    assert cstyle['left'] > titlebox['x']+titlebox['width']-45,cstyle
    assert sbox['x'] < cstyle['left'] and sbox['x'] > titlebox['x']+titlebox['width']-90,(sbox,cstyle,titlebox)
    generic=desktop.locator('#inventory-window > .window-title > .window-close').evaluate('''e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {borderRadius:s.borderRadius,bg:s.backgroundImage,w:r.width,h:r.height}}''')
    assert generic['borderRadius'] in ('50%','9999px') and 'btn_close_round.png' in generic['bg'],generic
    desktop.screenshot(path=str(ROOT/'docs/previews/MAP_VIEWER_DESKTOP_0.9.82HD.png'),full_page=True)

    # Mobile: explicit Enter Map/Back remain, including footer return-to-map.
    mobile=browser.new_page(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
    init(mobile,True)
    assert mobile.locator('.map-monster-enter-map').count()==1
    assert mobile.locator('.map-monster-return-map').count()==1
    mobile.locator('.map-monster-distribution-row').tap()
    assert mobile.locator('.map-monster-enter-map').count()==1
    assert mobile.locator('.map-monster-return-map').count()==1
    assert mobile.locator('.map-monster-return-list').count()==2
    mclose=mobile.locator('#map-window > .window-title > .window-close')
    mstyle=mclose.evaluate('''e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {position:s.position,borderRadius:s.borderRadius,bg:s.backgroundImage,w:r.width,h:r.height}}''')
    assert mstyle['position']=='absolute' and mstyle['w']==28 and mstyle['h']==28,mstyle
    assert 'btn_close_round.png' in mstyle['bg'],mstyle
    mobile.screenshot(path=str(ROOT/'docs/previews/MAP_VIEWER_MOBILE_0.9.82HD.png'),full_page=True)

    browser.close()
print('PASS responsive viewer split and round window chrome')
