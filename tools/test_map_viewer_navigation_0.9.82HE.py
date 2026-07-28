from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
map_js=(ROOT/'js/map.js').read_text(encoding='utf-8')
ui_js=(ROOT/'js/ui.js').read_text(encoding='utf-8')
css=(ROOT/'css/style.css').read_text(encoding='utf-8')
# Keep the browser test light: only load the final map-viewer CSS block and small base styles.
he_css=css
html=f'''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html,body{{margin:0;width:100%;height:100%;background:#222}}#battle-field{{position:relative;width:100%;height:100%}}
.game-window{{position:absolute;left:10px;top:80px;width:370px;height:500px;background:#1d1006;border:1px solid #c99a43;color:#ffe6a4}}
.window-title{{height:38px;display:flex;align-items:center;justify-content:space-between;background:#33200e;padding:0 8px;box-sizing:border-box}}
.window-close{{width:32px;height:30px}}.map-template-body{{position:relative;height:462px;overflow:auto}}.hidden-window{{display:none!important}}
.map-monster-distribution-tooltip{{box-sizing:border-box;background:#160d05;border:1px solid #d3a34a;color:#f1dfb5;padding:8px;overflow:auto}}
.map-monster-distribution-row{{display:block;width:100%;min-height:34px;background:#241507;color:#ffe6a4;border:0;border-bottom:1px solid #76501e;text-align:left}}
.map-monster-drop-row{{display:flex;gap:8px;min-height:42px}}.map-monster-drop-row img{{width:28px;height:28px}}
{he_css}
</style></head><body><div id="battle-field"><section id="map-window" class="game-window draggable-window" data-default-x="10" data-default-y="80"><div class="window-title drag-handle">地圖 / 傳送<button class="window-close" data-target="map-window">×</button></div><div class="map-template-body"><div id="current-map-name"></div><div id="map-list"><button id="anchor">初學者修練場</button></div></div></section></div></body></html>'''

stubs='''
window.matchMedia=(q)=>({matches:/pointer: coarse|max-width: 700|max-width: 900/.test(q),addEventListener(){},removeEventListener(){}});
window.RO_WEB_DATA={"data/monster_spawn_config.json":{regions:{training:{pool:[{monsterId:1002,category:"normal"}]}}}};
var maps=[{id:"training",displayName:"初學者修練場",name:"初學者修練場",recommendedLevel:"1～10",monsterSpawnProfile:"training"}];
var monsters=[{id:1002,name:"波利",drops:[{itemId:501,chance:10000,qtyMin:1,qtyMax:1}]}];
var player={currentCity:null}; var currentMap={id:"prontera",name:"普隆德拉"};
window.changedMap=null; function changeMap(id){window.changedMap=id;currentMap=maps.find(x=>x.id===id)||currentMap;}
function getItemData(id){return {name:"紅色藥水",icon:"",type:"consumable",officialId:id};}
function updateToggleButtonStates(){window.toggleStateUpdated=true;}
function hideGameTooltip(){} function getSavedWindowPositions(){return {};}
function recoverWindowToViewport(){} function applyStoredWindowVisualScale(){} function bringWindowToFront(){}
function getSavedWindowSizes(){return {}} function applyWindowSize(){} function saveWindowSize(){} function updateStatusUI(){}
'''

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
    page.set_content(html)
    page.add_script_tag(content=stubs)
    page.add_script_tag(content=map_js)
    page.evaluate('''() => { window.changeMap=(id)=>{window.changedMap=id;currentMap=maps.find(x=>x.id===id)||currentMap;}; }''')
    page.add_script_tag(content=ui_js)
    page.evaluate('''() => { initCloseButtons(); initDraggableWindows(); showMapMonsterDistributionTooltip(maps[0],document.getElementById("anchor")); }''')

    assert page.locator('.map-monster-enter-map').count()==1
    assert page.locator('.map-monster-return-map').count()==1
    assert page.locator('.map-monster-level').inner_text().startswith('建議等級')
    assert page.locator('.map-monster-distribution-row').count()==1

    page.locator('.map-monster-distribution-row').tap()
    assert page.locator('.map-monster-drop-title').count()==1
    assert page.locator('.map-monster-header-action .map-monster-return-list').count()==1
    assert page.locator('.map-monster-drop-footer').count()==0
    assert page.locator('.map-monster-header-action .map-monster-enter-map').count()==1

    page.locator('.map-monster-header-action .map-monster-return-list').tap()
    assert page.locator('.map-monster-distribution-row').count()==1
    assert page.locator('.map-monster-drop-title').count()==0

    # Return to the map browser hides only the overlay.
    page.locator('.map-monster-return-map').tap()
    assert page.locator('#map-monster-distribution-tooltip').is_hidden()
    assert not page.locator('#map-window').evaluate('(e)=>e.classList.contains("hidden-window")')

    # Reopen: title-bar dragging must not be swallowed by the modal touch guard.
    page.evaluate('showMapMonsterDistributionTooltip(maps[0],document.getElementById("anchor"))')
    title=page.locator('#map-window > .window-title')
    box=title.bounding_box()
    before=page.locator('#map-window').evaluate('(e)=>({left:e.style.left,top:e.style.top})')
    page.mouse.move(box['x']+50,box['y']+18)
    page.mouse.down()
    page.mouse.move(box['x']+90,box['y']+48,steps=4)
    page.mouse.up()
    after=page.locator('#map-window').evaluate('(e)=>({left:e.style.left,top:e.style.top})')
    assert before!=after,(before,after)

    # Close button must stay usable while the embedded viewer is open.
    page.locator('#map-window .window-close').click()
    assert page.locator('#map-window').evaluate('(e)=>e.classList.contains("hidden-window")')
    assert page.locator('#map-monster-distribution-tooltip').is_hidden()

    # Enter Map performs travel and closes the map window.
    page.wait_for_timeout(900)
    page.evaluate('''() => {document.getElementById("map-window").classList.remove("hidden-window");showMapMonsterDistributionTooltip(maps[0],document.getElementById("anchor"));}''')
    page.locator('.map-monster-enter-map').tap()
    assert page.evaluate('window.changedMap')=='training'
    assert page.locator('#map-window').evaluate('(e)=>e.classList.contains("hidden-window")')

    browser.close()
print('PASS HE map viewer navigation, compact detail controls, touch drag, close, enter map')
