#!/usr/bin/env python3
from __future__ import annotations
import base64,json,shutil,subprocess,tempfile,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PORT=9237
checks=[]
def check(value,label):
    checks.append((bool(value),label)); print(('PASS' if value else 'FAIL')+': '+label)
try:
    import websocket
except Exception as exc:
    print('SKIP: websocket-client unavailable:',exc); raise SystemExit(2)
chrome=shutil.which('chromium') or shutil.which('google-chrome') or shutil.which('chrome')
if not chrome:
    print('SKIP: Chromium unavailable'); raise SystemExit(2)
profile=tempfile.mkdtemp(prefix='roweb-go-chrome-')
proc=subprocess.Popen([chrome,'--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',f'--remote-debugging-port={PORT}','--remote-allow-origins=*',f'--user-data-dir={profile}','about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    for _ in range(60):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json',timeout=.4) as response: targets=json.load(response)
            if targets: break
        except Exception: time.sleep(.1)
    else: raise RuntimeError('Chromium CDP did not start')
    target=next(x for x in targets if x.get('type')=='page')
    ws=websocket.create_connection(target['webSocketDebuggerUrl'],timeout=15)
    seq=0
    def cmd(method,params=None):
        nonlocal_seq[0]+=1; ident=nonlocal_seq[0]
        ws.send(json.dumps({'id':ident,'method':method,'params':params or {}}))
        while True:
            data=json.loads(ws.recv())
            if data.get('id')==ident:return data
    nonlocal_seq=[0]
    cmd('Page.enable');cmd('Runtime.enable')
    frame=cmd('Page.getFrameTree')['result']['frameTree']['frame']['id']

    css=(ROOT/'css/style.css').read_text(encoding='utf-8')
    css=css[css.index('/* ============================================================\n   RO_WEB 0.9.82GO'):]
    theme=(ROOT/'js/ui_theme_runtime.js').read_text(encoding='utf-8').replace('</script>','<\\/script>')
    html=f'''<html><head><style>{css}</style></head><body><label>本次合成數量<input id="qty" type="number" min="1" max="9" value="3"></label><button id="job">確認轉職</button><button id="cancel">取消</button><button id="danger">刪除角色</button><script>{theme}</script><script>setTimeout(()=>ROGoldUI.confirm('是否確認轉職？',{{title:'轉職確認',confirmText:'確認轉職',cancelText:'我再考慮一下'}}),20)</script></body></html>'''
    cmd('Page.setDocumentContent',{'frameId':frame,'html':html});time.sleep(.35)
    expr="""(()=>{document.querySelector('.ro-number-step-plus').click();return {stepper:!!document.querySelector('.ro-number-stepper'),qty:document.getElementById('qty').value,audited:document.querySelectorAll('button.ro-gold-control').length,modal:!document.getElementById('roGoldDialogOverlay').hidden,title:document.getElementById('roGoldDialogTitle').textContent,secondary:document.getElementById('cancel').classList.contains('ro-gold-secondary-control'),danger:document.getElementById('danger').classList.contains('ro-gold-danger-control')}})()"""
    result=cmd('Runtime.evaluate',{'expression':expr,'returnByValue':True})['result']['result']['value']
    check(result['stepper'],'native number input replaced by custom stepper')
    check(result['qty']=='4','custom plus button increments quantity')
    check(result['audited']>=7,'dynamic action buttons receive gold audit classes')
    check(result['modal'] and result['title']=='轉職確認','black-gold confirmation modal opens')
    check(result['secondary'],'cancel action classified as secondary gold')
    check(result['danger'],'danger action classified as red-gold')

    mapjs=(ROOT/'js/map.js').read_text(encoding='utf-8').replace('</script>','<\\/script>')
    stub='''var maps=[{id:"test",name:"測試地圖",monsters:[1],monsterSpawnProfile:"test"}],monsters=[{id:1,name:"測試怪物",drops:[{itemId:501,chance:5000}]}],player={favoriteMaps:[]},currentMap=maps[0];window.RO_WEB_DATA={"data/monster_spawn_config.json":{regions:{test:{pool:[{monsterId:1,category:"normal",weight:1}]}}},"data/enchant_grade_map_drops.json":{profiles:{}}};function getItemData(id){return {id,name:"紅色藥水",icon:""}};function saveGame(){};function updateMapUI(){};function addBattleLog(){};'''
    maphtml=f'''<html><head><style>.map-monster-distribution-tooltip{{position:fixed;width:300px;max-height:280px;overflow:auto}}.map-monster-distribution-tooltip[hidden],.map-monster-drop-detail[hidden]{{display:none}}.map-monster-distribution-row{{display:block}}</style></head><body><button id="anchor">地圖</button><div id="outside">外部</div><script>{stub}</script><script>{mapjs}</script></body></html>'''
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
    try:proc.wait(timeout=3)
    except Exception:proc.kill()
    shutil.rmtree(profile,ignore_errors=True)
failed=[label for ok,label in checks if not ok]
print(json.dumps({'version':'0.9.82GO','passed':len(checks)-len(failed),'total':len(checks),'failed':failed},ensure_ascii=False))
raise SystemExit(1 if failed else 0)
