from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
map_js=(ROOT/'js/map.js').read_text(encoding='utf-8')
ui_js=(ROOT/'js/ui.js').read_text(encoding='utf-8')
css=(ROOT/'css/style.css').read_text(encoding='utf-8')

BASE_HTML='''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html,body{margin:0;width:100%;height:100%;background:#526835}#battle-field{position:relative;width:100%;height:100%}
body.ro-black-gold-theme{font-family:Arial,sans-serif}.game-window{position:absolute;left:20px;top:70px;width:455px;height:356px;background:#1d1006;border:1px solid #c99a43;color:#ffe6a4}.window-title{height:54px;display:flex;align-items:center;justify-content:center;background:#33200e;padding:0 8px;box-sizing:border-box}.map-template-body{position:relative;height:302px;overflow:auto}.hidden-window{display:none!important}.map-monster-distribution-tooltip{box-sizing:border-box;background:#160d05;border:1px solid #d3a34a;color:#f1dfb5;padding:8px;overflow:auto}.map-monster-distribution-row{display:block;width:100%;min-height:34px;background:#241507;color:#ffe6a4;border:0;border-bottom:1px solid #76501e;text-align:left}.map-monster-drop-row{display:flex;gap:8px;min-height:42px}.map-monster-drop-row img{width:28px;height:28px}
CSS_HERE
</style></head><body class="ro-black-gold-theme"><div id="battle-field"><section id="map-window" class="game-window true-map-window draggable-window" data-default-x="20" data-default-y="70"><div class="window-title drag-handle">地圖 / 傳送<button class="window-size-cycle">中</button><button class="window-close" data-target="map-window">×</button></div><div class="map-template-body"><div id="current-map-name"></div><div id="map-list"><button id="anchor">吉芬地區</button></div></div></section></div></body></html>'''.replace('CSS_HERE',css)

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
    page.add_script_tag(content=f'''window.matchMedia=(q)=>({{matches:{str(coarse).lower()} && /pointer: coarse|max-width: 700|max-width: 900/.test(q),addEventListener(){{}},removeEventListener(){{}}}});''')
    page.add_script_tag(content=STUBS)
    page.add_script_tag(content=map_js)
    page.add_script_tag(content=ui_js)
    page.evaluate('''() => { initCloseButtons(); initDraggableWindows(); showMapMonsterDistributionTooltip(maps[0],document.getElementById("anchor")); }''')

def centers(page):
    return page.evaluate('''() => {
      const title=document.querySelector('#map-window > .window-title').getBoundingClientRect();
      const size=document.querySelector('#map-window > .window-title > .window-size-cycle').getBoundingClientRect();
      const close=document.querySelector('#map-window > .window-title > .window-close').getBoundingClientRect();
      return {title, size, close, sizeCenter:size.top+size.height/2, closeCenter:close.top+close.height/2, titleCenter:title.top+title.height/2, gap:close.left-(size.left+size.width)};
    }''')

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])

    desktop=browser.new_page(viewport={"width":1280,"height":720})
    init(desktop,False)
    assert desktop.locator('.map-monster-enter-map').count()==0
    assert desktop.locator('.map-monster-return-map').count()==0
    desktop.locator('.map-monster-distribution-row').click()
    assert desktop.locator('.map-monster-enter-map').count()==0
    assert desktop.locator('.map-monster-return-map').count()==0
    assert desktop.locator('.map-monster-return-list').count()==1
    assert desktop.locator('.map-monster-drop-footer').count()==0
    assert desktop.locator('.map-monster-header-action .map-monster-return-list').inner_text()=='返回怪物清單'
    d=centers(desktop)
    assert abs(d['sizeCenter']-d['closeCenter']) < 0.6,d
    assert abs(d['sizeCenter']-d['titleCenter']) < 0.6,d
    assert 3 <= d['gap'] <= 8,d
    assert d['close']['width']==28 and d['close']['height']==28,d
    assert d['size']['height']==28,d
    desktop.screenshot(path=str(ROOT/'docs/previews/MAP_VIEWER_DESKTOP_0.9.82HE.png'),full_page=True)

    mobile=browser.new_page(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
    init(mobile,True)
    assert mobile.locator('.map-monster-enter-map').count()==1
    assert mobile.locator('.map-monster-return-map').count()==1
    mobile.locator('.map-monster-distribution-row').tap()
    assert mobile.locator('.map-monster-enter-map').count()==1
    assert mobile.locator('.map-monster-return-map').count()==0
    assert mobile.locator('.map-monster-return-list').count()==1
    assert mobile.locator('.map-monster-drop-footer').count()==0
    assert mobile.locator('.map-monster-header-action .map-monster-enter-map').inner_text()=='進入地圖'
    assert mobile.locator('.map-monster-header-action .map-monster-return-list').inner_text()=='返回'
    m=centers(mobile)
    assert abs(m['sizeCenter']-m['closeCenter']) < 0.6,m
    assert abs(m['sizeCenter']-m['titleCenter']) < 0.6,m
    assert 3 <= m['gap'] <= 8,m
    mobile.screenshot(path=str(ROOT/'docs/previews/MAP_VIEWER_MOBILE_0.9.82HE.png'),full_page=True)

    browser.close()
print('PASS HE compact navigation and aligned map title controls')
