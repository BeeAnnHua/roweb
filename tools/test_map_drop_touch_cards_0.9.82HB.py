#!/usr/bin/env python3
from __future__ import annotations
import asyncio, json, pathlib
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
CSS = (ROOT / 'css/style.css').read_text(encoding='utf-8')
MAP_JS = (ROOT / 'js/map.js').read_text(encoding='utf-8')
GAME_JS = (ROOT / 'js/game.js').read_text(encoding='utf-8')
CHROME = '/usr/bin/chromium'

MONSTERS = [
    {'id':1000+i,'name':f'MVP怪物{i+1}','aegisName':f'MVP_{i+1}',
     'drops':[{'itemId':501,'chance':5000,'qtyMin':1,'qtyMax':1}], 'mvpDrops':[]}
    for i in range(51)
]
POOL = [{'monsterId':1000+i,'category':'mvp','maxAlive':1} for i in range(51)]
MAPS = [
    {'id':'current','name':'目前地圖','displayName':'目前地圖','recommendedLevel':'1+', 'profile':{'pool':[]}, 'thumb':''},
    {'id':'test_map','name':'葛坡尼亞 MVP 試煉場','displayName':'葛坡尼亞 MVP 試煉場','recommendedLevel':'250+', 'profile':{'pool':POOL}, 'thumb':''},
    {'id':'other_map','name':'其他地圖','displayName':'其他地圖','recommendedLevel':'100+', 'profile':{'pool':[]}, 'thumb':''},
]

HTML = '''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>{css}</style></head>
<body class="ro-black-gold-theme" style="margin:0;background:#15100b">
<div id="map-window" class="true-map-window game-window" style="position:relative;display:block;left:0;top:0;width:390px;height:400px">
  <div class="map-template-body"><div id="map-list"></div></div>
</div>
</body></html>'''

INIT = '''({mapsData,monstersData}) => {
  window.maps=mapsData; window.monsters=monstersData; window.player={favoriteMaps:[],map:'current',lastFieldMap:'current'}; window.currentMap=mapsData[0]; window.RO_WEB_DATA={};
  window.getWorldMonsterProfile=m=>m.profile; window.getItemData=id=>({id,officialId:id,name:id===501?'紅色藥水':`物品${id}`,icon:''});
  window.getWorldMonsterRegionUniqueAvailability=()=>({respawning:false,remainingSeconds:0});
  window.EnchantGradeRuntime={getScaledGradeDropChance:x=>x}; window.addBattleLog=()=>{}; window.saveGame=()=>{}; window.updateMonsterUI=()=>{};
  window.stopAutoBattle=()=>{}; window.clearBattleTimersAndMonster=()=>{}; window.clearWorldMonsterFieldTest=()=>{}; window.discoverCurrentMap=()=>{};
  window.updateBattleBackground=()=>{}; window.updateTownUI=()=>{}; window.updateAutoCombatMonsterFilterUI=()=>{};
  maps=window.maps; monsters=window.monsters; player=window.player; currentMap=window.currentMap;
}'''

async def test_touch(browser, failures):
    page = await browser.new_page(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
    await page.set_content(HTML.format(css=CSS))
    await page.evaluate(INIT, {'mapsData':MAPS,'monstersData':MONSTERS})
    await page.add_script_tag(content=MAP_JS)
    await page.evaluate('updateMapUI()')
    btn = page.locator('.map-region-warp-button', has_text='葛坡尼亞 MVP 試煉場')
    await btn.tap()
    tooltip=page.locator('#map-monster-distribution-tooltip')
    if await tooltip.get_attribute('hidden') is not None: failures.append('mobile tooltip did not open')
    row=page.locator("[data-monster-drop-id='1000']")
    await row.tap()
    # Simulate the synthetic/ghost click landing on a different destination immediately after DOM changes.
    await page.evaluate("document.querySelectorAll('.map-region-warp-button')[2].click()")
    await page.wait_for_timeout(1100)
    detail=await page.evaluate('''() => {const t=document.getElementById('map-monster-distribution-tooltip');return {hidden:t.hidden,view:t.classList.contains('is-drop-detail-view'),listHidden:t.querySelector('.map-monster-distribution-list').hidden,detailHidden:t.querySelector('.map-monster-drop-detail').hidden,mapId:RO_MAP_MONSTER_TOOLTIP_STATE.mapId,topBack:t.querySelectorAll('.map-monster-drop-back.is-header').length,bottomBack:t.querySelectorAll('.map-monster-drop-back.is-footer').length,title:t.querySelector('.map-monster-drop-title b')?.textContent||'',underlyingMap:window.currentMap?.id};}''')
    if detail['hidden'] or not detail['view'] or not detail['listHidden'] or detail['detailHidden']:
        failures.append(f'mobile detail rebounded: {detail}')
    if detail['mapId']!='test_map': failures.append(f'ghost click changed preview map to {detail["mapId"]}')
    if detail['topBack']!=1 or detail['bottomBack']!=1: failures.append('return buttons missing')
    if 'MVP怪物1掉落物' not in detail['title']: failures.append('wrong detail title')
    await page.locator('.map-monster-drop-back.is-header').tap()
    returned=await page.evaluate('''() => {const t=document.getElementById('map-monster-distribution-tooltip');return {view:t.classList.contains('is-drop-detail-view'),listHidden:t.querySelector('.map-monster-distribution-list').hidden,detailHidden:t.querySelector('.map-monster-drop-detail').hidden,action:t.querySelector('.map-monster-header-action').innerText.trim(),rows:t.querySelectorAll('[data-monster-drop-id]').length};}''')
    if returned['view'] or returned['listHidden'] or not returned['detailHidden'] or returned['rows']!=51:
        failures.append(f'mobile return failed: {returned}')
    if returned['action']!='建議等級 250+': failures.append(f'recommended level not restored: {returned["action"]}')
    await page.close()

async def test_card_merge(browser, failures):
    page=await browser.new_page()
    monster_rows=[
        {'id':1038,'name':'俄塞里斯','aegisName':'OSIRIS','drops':[],'mvpDrops':[]},
        {'id':1518,'name':'白素貞','aegisName':'BACSOJIN','drops':[],'mvpDrops':[]},
        {'id':1956,'name':'夜勝魔','aegisName':'NAGHT_SIEGER','drops':[],'mvpDrops':[]},
        {'id':1059,'name':'蜂后','aegisName':'MISTRESS','drops':[{'itemId':4132,'chance':1,'type':'card'}],'mvpDrops':[]},
    ]
    sources={
        '4144':[{'monsterId':1038,'monsterAegisName':'OSIRIS','rate':1,'stealProtected':True,'isMvp':True,'isBoss':True}],
        '4372':[{'monsterId':1630,'monsterAegisName':'BACSOJIN_','rate':1,'stealProtected':True,'isMvp':True,'isBoss':True}],
        '4132':[{'monsterId':1059,'monsterAegisName':'MISTRESS','rate':1,'stealProtected':True,'isMvp':True,'isBoss':True}],
    }
    await page.set_content('<html><body></body></html>')
    await page.evaluate('''({m,s})=>{window.RO_WEB_DATA={'data/monsters.json':m,'data/card_runtime/card_drop_sources.json':s};window.addBattleLog=()=>{};}''', {'m':monster_rows,'s':sources})
    await page.add_script_tag(content=GAME_JS)
    await page.evaluate('loadMonsterData()')
    result=await page.evaluate('''() => ({report:window.RO_WEB_CARD_DROP_MERGE_REPORT, rows:monsters.map(m=>({id:m.id,drops:m.drops.map(d=>({id:d.itemId,chance:d.chance,type:d.type,source:d.cardDropSource}))}))})''')
    rows={r['id']:r['drops'] for r in result['rows']}
    if not any(d['id']==4144 and d['chance']==1 and d['type']=='card' for d in rows[1038]): failures.append('Osiris card not merged')
    if not any(d['id']==4372 for d in rows[1518]): failures.append('Bacsojin alias card not merged')
    if rows[1956]: failures.append('card invented for monster without source')
    if sum(1 for d in rows[1059] if d['id']==4132)!=1: failures.append('existing card duplicated')
    if result['report']['merged']!=2 or result['report']['duplicates']!=1: failures.append(f'card merge report invalid: {result["report"]}')
    await page.close()

async def main():
    failures=[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,executable_path=CHROME,args=['--no-sandbox','--disable-dev-shm-usage'])
        try:
            await test_touch(browser,failures)
            await test_card_merge(browser,failures)
        finally:
            await browser.close()
    result={'version':'0.9.82HB','passed':not failures,'failures':failures,'checks':{'touchGhostClickGuard':True,'headerAndFooterReturn':True,'mvpCardSourceMerge':True,'aegisAliasMerge':True,'noInventedCards':True}}
    (ROOT/'MAP_DROP_TOUCH_CARD_FIX_0.9.82HB.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return 1 if failures else 0

if __name__=='__main__':
    raise SystemExit(asyncio.run(main()))
