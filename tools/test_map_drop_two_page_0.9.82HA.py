#!/usr/bin/env python3
from __future__ import annotations
import asyncio, json, pathlib, sys
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
CSS = (ROOT / 'css/style.css').read_text(encoding='utf-8')
MAP_JS = (ROOT / 'js/map.js').read_text(encoding='utf-8')
CHROME = '/usr/bin/chromium'

MONSTERS = [
    {
        'id': 1000 + i,
        'name': f'MVP怪物{i+1}',
        'drops': [
            {'itemId': 501, 'chance': 5000, 'qtyMin': 1, 'qtyMax': 1},
            {'itemId': 502, 'chance': 100, 'qtyMin': 1, 'qtyMax': 2},
        ],
        'mvpDrops': [],
    }
    for i in range(51)
]
POOL = [{'monsterId': 1000 + i, 'category': 'mvp', 'maxAlive': 1} for i in range(51)]

HTML = '''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>{css}</style></head>
<body class="ro-black-gold-theme" style="margin:0;background:#15100b">
<div id="map-window" class="true-map-window game-window" style="position:relative;display:block;left:0;top:0">
  <div class="map-template-body"><div class="map-current-card"><div class="map-current-title">目前地圖</div></div></div>
</div>
<button id="anchor" type="button">測試地圖</button>
</body></html>'''

INIT = '''({monstersData, profilePool}) => {
  window.maps=[{id:'test_map',name:'葛坡尼亞 MVP 試煉場',displayName:'葛坡尼亞 MVP 試煉場',recommendedLevel:'250+',profile:{pool:profilePool}}];
  window.monsters=monstersData; window.player={}; window.currentMap=window.maps[0]; window.RO_WEB_DATA={};
  window.getWorldMonsterProfile=m=>m.profile;
  window.getItemData=id=>({id,officialId:id,name:id===501?'紅色藥水':'神祕箱子',icon:''});
  window.getWorldMonsterRegionUniqueAvailability=()=>({respawning:false,remainingSeconds:0});
  window.EnchantGradeRuntime={getScaledGradeDropChance:x=>x};
  window.addBattleLog=()=>{}; window.saveGame=()=>{}; window.updateMonsterUI=()=>{}; window.stopAutoBattle=()=>{};
  window.clearBattleTimersAndMonster=()=>{}; window.clearWorldMonsterFieldTest=()=>{}; window.discoverCurrentMap=()=>{};
  maps=window.maps; monsters=window.monsters; player=window.player; currentMap=window.currentMap;
}'''

async def build_page(browser, mobile: bool):
    if mobile:
        page = await browser.new_page(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
    else:
        page = await browser.new_page(viewport={'width':1280,'height':720}, is_mobile=False, has_touch=False)
    await page.set_content(HTML.format(css=CSS))
    await page.evaluate(INIT, {'monstersData': MONSTERS, 'profilePool': POOL})
    await page.add_script_tag(content=MAP_JS)
    await page.evaluate("showMapMonsterDistributionTooltip(window.maps[0],document.getElementById('anchor'))")
    return page

async def main() -> int:
    failures=[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True, executable_path=CHROME, args=['--no-sandbox','--disable-dev-shm-usage'])
        try:
            mobile=await build_page(browser, True)
            initial=await mobile.evaluate('''() => {const t=document.getElementById('map-monster-distribution-tooltip'),r=t.getBoundingClientRect();return {parent:t.parentElement.className,rows:t.querySelectorAll('[data-monster-drop-id]').length,listHidden:t.querySelector('.map-monster-distribution-list').hidden,detailHidden:t.querySelector('.map-monster-drop-detail').hidden,rect:{x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom},vw:innerWidth,vh:innerHeight,bodyW:document.body.scrollWidth,scrollHeight:t.scrollHeight,clientHeight:t.clientHeight};}''')
            if initial['rows']!=51: failures.append(f"mobile rows {initial['rows']} != 51")
            if 'map-template-body' not in initial['parent'] or 'has-monster-overlay' not in initial['parent']: failures.append('mobile tooltip not in map body overlay')
            if initial['listHidden'] or not initial['detailHidden']: failures.append('mobile initial page state invalid')
            if initial['bodyW']>initial['vw']+1: failures.append(f"mobile horizontal overflow {initial['bodyW']}>{initial['vw']}")
            if initial['rect']['b']>initial['vh']+1: failures.append('mobile tooltip exceeds viewport')
            if initial['scrollHeight']<=initial['clientHeight']: failures.append('51-monster list is not internally scrollable')

            # Reproduce the original blur/hide race, then click a monster.
            await mobile.evaluate('scheduleHideMapMonsterDistributionTooltip()')
            await mobile.locator("[data-monster-drop-id='1000']").click()
            await mobile.wait_for_timeout(350)
            detail=await mobile.evaluate('''() => {const t=document.getElementById('map-monster-distribution-tooltip'),r=t.getBoundingClientRect();return {hidden:t.hidden,listHidden:t.querySelector('.map-monster-distribution-list').hidden,detailHidden:t.querySelector('.map-monster-drop-detail').hidden,action:t.querySelector('.map-monster-header-action').innerText.trim(),title:t.querySelector('.map-monster-drop-title b')?.textContent||'',viewClass:t.classList.contains('is-drop-detail-view'),rect:{x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom},bodyW:document.body.scrollWidth,vw:innerWidth};}''')
            if detail['hidden'] or not detail['listHidden'] or detail['detailHidden']: failures.append('mobile detail did not remain open after hide timer')
            if detail['action']!='返回': failures.append(f"mobile header action is {detail['action']!r}")
            if not detail['viewClass'] or 'MVP怪物1掉落物' not in detail['title']: failures.append('mobile detail content/class invalid')
            if detail['bodyW']>detail['vw']+1: failures.append('mobile detail horizontal overflow')

            await mobile.locator('.map-monster-drop-back').click()
            returned=await mobile.evaluate('''() => {const t=document.getElementById('map-monster-distribution-tooltip');return {hidden:t.hidden,listHidden:t.querySelector('.map-monster-distribution-list').hidden,detailHidden:t.querySelector('.map-monster-drop-detail').hidden,action:t.querySelector('.map-monster-header-action').innerText.trim(),rows:t.querySelectorAll('[data-monster-drop-id]').length,scrollTop:t.scrollTop};}''')
            if returned['hidden'] or returned['listHidden'] or not returned['detailHidden']: failures.append('mobile return did not restore list')
            if returned['action']!='建議等級 250+': failures.append(f"mobile recommended level not restored: {returned['action']!r}")
            if returned['rows']!=51 or returned['scrollTop']!=0: failures.append('mobile return changed list or scroll origin')
            await mobile.close()

            desktop=await build_page(browser, False)
            d0=await desktop.evaluate('''() => {const t=document.getElementById('map-monster-distribution-tooltip'),r=t.getBoundingClientRect();return {parent:t.parentElement.tagName,rows:t.querySelectorAll('[data-monster-drop-id]').length,rect:{l:r.left,t:r.top,r:r.right,b:r.bottom},vw:innerWidth,vh:innerHeight};}''')
            if d0['parent']!='BODY' or d0['rows']!=51: failures.append('desktop tooltip parent/rows invalid')
            if d0['rect']['l']<0 or d0['rect']['t']<0 or d0['rect']['r']>d0['vw']+1 or d0['rect']['b']>d0['vh']+1: failures.append('desktop tooltip outside viewport')
            await desktop.locator("[data-monster-drop-id='1000']").click()
            if await desktop.locator('.map-monster-drop-back').inner_text() != '返回': failures.append('desktop return button missing')
            await desktop.locator('.map-monster-drop-back').click()
            if await desktop.locator('[data-monster-drop-id]').count() != 51: failures.append('desktop return lost list')
            await desktop.close()
        finally:
            await browser.close()

    result={'version':'0.9.82HA','failures':failures,'passed':not failures,'checks':{'mobileRows':51,'desktopRows':51,'twoPage':True,'mobileOverlay':True,'returnButton':True,'hideRaceWaitMs':350}}
    out=ROOT/'MAP_DROP_TWO_PAGE_0.9.82HA.json'
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return 1 if failures else 0

if __name__=='__main__':
    raise SystemExit(asyncio.run(main()))
