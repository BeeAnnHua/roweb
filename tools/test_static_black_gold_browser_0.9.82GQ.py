#!/usr/bin/env python3
from __future__ import annotations
import json,shutil,subprocess,tempfile,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PORT=9241
checks=[]
def check(v,label):
    checks.append((bool(v),label)); print(('PASS' if v else 'FAIL')+': '+label)
try: import websocket
except Exception as exc: print('SKIP:',exc); raise SystemExit(2)
chrome=shutil.which('chromium') or shutil.which('google-chrome') or shutil.which('chrome')
if not chrome: print('SKIP: Chromium unavailable'); raise SystemExit(2)
profile=tempfile.mkdtemp(prefix='roweb-gq-chrome-')
proc=subprocess.Popen([chrome,'--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',f'--remote-debugging-port={PORT}','--remote-allow-origins=*',f'--user-data-dir={profile}','about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    for _ in range(60):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json',timeout=.4) as r: targets=json.load(r)
            if targets: break
        except Exception: time.sleep(.1)
    else: raise RuntimeError('Chromium CDP did not start')
    target=next(x for x in targets if x.get('type')=='page')
    ws=websocket.create_connection(target['webSocketDebuggerUrl'],timeout=15); seq=[0]
    def cmd(method,params=None):
        seq[0]+=1; ident=seq[0]
        ws.send(json.dumps({'id':ident,'method':method,'params':params or {}}))
        while True:
            data=json.loads(ws.recv())
            if data.get('id')==ident:return data
    cmd('Page.enable');cmd('Runtime.enable')
    frame=cmd('Page.getFrameTree')['result']['frameTree']['frame']['id']
    css=(ROOT/'css/style.css').read_text(encoding='utf-8')
    css=css[css.index('/* ============================================================\n   RO_WEB 0.9.82GQ'):]
    theme=(ROOT/'js/ui_theme_runtime.js').read_text(encoding='utf-8').replace('</script>','<\\/script>')
    html='<html><head><style>'+css+'</style></head><body class="ro-black-gold-theme"><label>數量<input id="qty" data-ro-gold-stepper type="number" min="1" max="9" value="3"></label><section id="auto-combat-panel"><input id="auto" type="number" value="20"></section><button id="job">確認轉職</button><script>'+theme+'</script></body></html>'
    cmd('Page.setDocumentContent',{'frameId':frame,'html':html});time.sleep(.35)
    expr="""(()=>{const dynamic=document.createElement('button');dynamic.textContent='動態合成';document.body.appendChild(dynamic);document.querySelector('.ro-number-step-plus').click();const cs=getComputedStyle(dynamic);return {stepper:!!document.querySelector('.ro-number-stepper'),qty:document.getElementById('qty').value,autoWrapped:!!document.getElementById('auto').closest('.ro-number-stepper'),observer:window.__roBlackGoldObserver,profile:window.ROGoldUI.performanceProfile,border:cs.borderTopColor,bg:cs.backgroundImage,dialogs:document.querySelectorAll('#roGoldDialogOverlay').length};})()"""
    result=cmd('Runtime.evaluate',{'expression':expr,'returnByValue':True})['result']['result']['value']
    check(result['stepper'] and result['qty']=='4','explicit stepper renders and increments')
    check(not result['autoWrapped'],'auto-combat input is not globally wrapped')
    check(result['observer'] is None and result['profile']['mutationObserver'] is False,'no black-gold observer is active')
    check('rgb' in result['border'] and 'gradient' in result['bg'],'dynamic button receives static black-gold CSS')
    check(result['dialogs']==1,'only one reusable dialog node exists')
    cmd('Runtime.evaluate',{'expression':"ROGoldUI.confirm('是否確認轉職？',{title:'轉職確認'}); true",'returnByValue':True});time.sleep(.1)
    visible=cmd('Runtime.evaluate',{'expression':"!document.getElementById('roGoldDialogOverlay').hidden && document.getElementById('roGoldDialogTitle').textContent==='轉職確認'",'returnByValue':True})['result']['result']['value']
    check(visible,'shared black-gold confirmation dialog opens')

    # Pinned monster drop lookup remains independent from auto-battle and theme scanning.
    mapjs=(ROOT/'js/map.js').read_text(encoding='utf-8').replace('</script>',r'<\/script>')
    stub='''var maps=[{id:"test",name:"測試地圖",monsters:[1],monsterSpawnProfile:"test"}],monsters=[{id:1,name:"測試怪物",drops:[{itemId:501,chance:5000}]}],player={favoriteMaps:[]},currentMap=maps[0];window.RO_WEB_DATA={"data/monster_spawn_config.json":{regions:{test:{pool:[{monsterId:1,category:"normal",weight:1}]}}},"data/enchant_grade_map_drops.json":{profiles:{}}};function getItemData(id){return {id,name:"紅色藥水",icon:""}};function saveGame(){};function updateMapUI(){};function addBattleLog(){};'''
    maphtml='<html><head><style>.map-monster-distribution-tooltip{position:fixed;width:300px;max-height:280px;overflow:auto}.map-monster-distribution-tooltip[hidden],.map-monster-drop-detail[hidden]{display:none}.map-monster-distribution-row{display:block}</style></head><body><button id="anchor">地圖</button><div id="outside">外部</div><script>'+stub+'</script><script>'+mapjs+'</script></body></html>'
    cmd('Page.setDocumentContent',{'frameId':frame,'html':maphtml});time.sleep(.25)
    pinexpr="""(async()=>{const a=document.getElementById('anchor');showMapMonsterDistributionTooltip(maps[0],a);const t=document.getElementById('map-monster-distribution-tooltip');const row=t.querySelector('[data-monster-drop-id]');row.click();t.dispatchEvent(new PointerEvent('pointerleave',{bubbles:true}));await new Promise(r=>setTimeout(r,260));const pinnedVisible=!t.hidden&&t.classList.contains('is-drop-pinned')&&row.classList.contains('is-selected')&&!t.querySelector('.map-monster-drop-detail').hidden;const dropText=t.textContent.includes('紅色藥水');const unpin=!!t.querySelector('.map-monster-drop-unpin');document.getElementById('outside').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));return {pinnedVisible,dropText,unpin,hidden:t.hidden};})()"""
    pin=cmd('Runtime.evaluate',{'expression':pinexpr,'awaitPromise':True,'returnByValue':True})['result']['result']['value']
    check(pin['pinnedVisible'],'clicked monster remains pinned after pointer leaves')
    check(pin['dropText'],'pinned panel renders cached drop data')
    check(pin['unpin'],'pinned panel exposes unpin control')
    check(pin['hidden'],'outside click closes pinned monster panel')
    ws.close()
finally:
    proc.terminate()
    try: proc.wait(timeout=3)
    except Exception: proc.kill()
    shutil.rmtree(profile,ignore_errors=True)
failed=[label for ok,label in checks if not ok]
print(json.dumps({'version':'0.9.82GQ','passed':len(checks)-len(failed),'total':len(checks),'failed':failed},ensure_ascii=False))
raise SystemExit(1 if failed else 0)
