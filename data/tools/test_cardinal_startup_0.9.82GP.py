#!/usr/bin/env python3
from __future__ import annotations
import json, re, subprocess, tempfile, time, urllib.request, shutil, sys
from pathlib import Path
import websocket

ROOT=Path(__file__).resolve().parents[1]
CDP=9251
checks=[]
def check(cond,label,detail=''):
    checks.append({'label':label,'passed':bool(cond),'detail':detail})

# Maxed Cardinal save with an overdue but still-active Mediale Votum periodic heal.
p=json.loads((ROOT/'data/player_default.json').read_text(encoding='utf-8'))
p.update({'name':'CardinalRegression','playerIdVersion':1,'gender':'female','genderChosen':True,
          'job':'樞機主教','jobKey':'cardinal','baseLevel':275,'jobLevel':60,
          'baseExp':0,'jobExp':0,'hp':1,'sp':999999,'currentCity':'prontera',
          'map':'prontera_3x3_region_camera','lastFieldMap':'prontera_3x3_region_camera','skillPoints':100})
jobs=json.loads((ROOT/'data/jobs.json').read_text(encoding='utf-8'))
learned={}
for tree in jobs['cardinal']['skillTreeChain']:
    fp=ROOT/'data/skill_trees'/f'{tree}.json'
    if fp.exists():
        for row in json.loads(fp.read_text(encoding='utf-8')).get('skills',[]):
            learned[str(row['skillId'])]=row.get('maxLevel',1)
p['learnedSkills']=learned
p['autoCombat']={'enabled':False,'buffs':{str(sid):{'enabled':True,'spPercent':0} for sid in [5269,5271,5272,5275,5278,5281,5282]}}
now_ms=int(time.time()*1000)
p['activeBuffs']={'5269':{'id':5269,'name':'持續祈療','level':5,'effects':{},'expiresAt':now_ms+600000,
                                 'periodicHealFormula':'renewal_mediale_votum','periodicHpIntervalMs':2000,
                                 'lastPeriodicFormulaTick':now_ms-3000}}

html=(ROOT/'index.html').read_text(encoding='utf-8')
css=(ROOT/'css/style.css').read_text(encoding='utf-8').replace('</style>','<\\/style>')
html=re.sub(r'<link[^>]+href="css/style\.css[^>]*>', '<style>'+css+'</style>', html, count=1)
marker='<script src="./js/data_bundle.js?v=0.9.82GP"></script>'
assert marker in html
html=html.replace(marker,'<script>window.__TEST_SAVE__='+json.dumps(p,ensure_ascii=False).replace('</script>','<\\/script>')+';</script>'+marker)
pat=re.compile(r'<script src="\.\/([^"?]+)(?:\?[^" ]*)?"></script>')
def repl(m):
    path=ROOT/m.group(1)
    src=path.read_text(encoding='utf-8')
    if m.group(1)=='js/player.js':
        old='savedData = localStorage.getItem(SAVE_KEY);'
        assert old in src
        src=src.replace(old,'savedData = JSON.stringify(window.__TEST_SAVE__);',1)
    return '<script>\n'+src.replace('</script>','<\\/script>')+'\n</script>'
html=pat.sub(repl,html)

chrome=shutil.which('chromium') or shutil.which('chromium-browser')
if not chrome:
    print(json.dumps({'version':'0.9.82GP','passed':0,'total':1,'failed':['Chromium unavailable']},ensure_ascii=False))
    sys.exit(2)
profile=tempfile.mkdtemp(prefix='gp-cardinal-')
proc=subprocess.Popen([chrome,'--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
                       f'--remote-debugging-port={CDP}','--remote-allow-origins=*',f'--user-data-dir={profile}','about:blank'],
                      stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
ws=None
try:
    targets=None
    for _ in range(120):
        try:
            targets=json.load(urllib.request.urlopen(f'http://127.0.0.1:{CDP}/json',timeout=.3)); break
        except Exception: time.sleep(.1)
    if not targets: raise RuntimeError('CDP target unavailable')
    ws=websocket.create_connection(next(x for x in targets if x['type']=='page')['webSocketDebuggerUrl'],timeout=120,max_size=220*1024*1024)
    seq=0
    def cmd(method,params=None):
        nonlocal_seq[0]+=1; ident=nonlocal_seq[0]
        ws.send(json.dumps({'id':ident,'method':method,'params':params or {}},ensure_ascii=False))
        while True:
            data=json.loads(ws.recv())
            if data.get('id')==ident:return data
    nonlocal_seq=[0]
    cmd('Runtime.enable'); cmd('Page.enable')
    frame=cmd('Page.getFrameTree')['result']['frameTree']['frame']['id']
    cmd('Page.setDocumentContent',{'frameId':frame,'html':html})
    time.sleep(6)
    expression=r'''(() => {
      const beforeAuto=document.querySelectorAll('.auto-number-control').length;
      for(let i=0;i<20;i++) updateAutoCombatUI();
      const afterAuto=document.querySelectorAll('.auto-number-control').length;
      const buff=player.activeBuffs['5269'];
      const pureBefore=Number(buff.lastPeriodicFormulaTick||0);
      buff.lastPeriodicFormulaTick=Date.now()-3000;
      const pureSet=Number(buff.lastPeriodicFormulaTick||0);
      getActiveBuffBonusTotals();
      const pureAfter=Number(buff.lastPeriodicFormulaTick||0);
      player.hp=1;
      normalizeActiveBuffs();
      const runtimeAfter=Number(buff.lastPeriodicFormulaTick||0);
      return {
        boot:window.RO_WEB_BOOT_STATE?.status,
        job:player?.jobKey,
        level:player?.baseLevel,
        log:document.getElementById('battle-log')?.innerText||'',
        buffRows:document.querySelectorAll('.auto-buff-row').length,
        autoBefore:beforeAuto,autoAfter:afterAuto,
        roSteps:document.querySelectorAll('.ro-number-stepper').length,
        nested:document.querySelectorAll('.auto-number-control .ro-number-stepper, .ro-number-stepper .auto-number-control').length,
        pureSet,pureAfter,runtimeAfter,hp:player.hp,maxHp:player.maxHp
      };
    })()'''
    result=cmd('Runtime.evaluate',{'expression':expression,'returnByValue':True})['result']['result'].get('value',{})
    check(result.get('boot') in ('ready','ready_with_warnings'),'Cardinal save completes startup',str(result.get('boot')))
    check(result.get('job')=='cardinal' and result.get('level')==275,'Cardinal identity preserved',f"{result.get('job')} Lv{result.get('level')}")
    check('Maximum call stack' not in result.get('log',''),'No call-stack overflow in battle log')
    check(result.get('buffRows',0)>=7,'Cardinal auto-buff rows render',str(result.get('buffRows')))
    check(result.get('nested')==0,'No nested global/auto number steppers',str(result.get('nested')))
    check(result.get('autoBefore')==result.get('autoAfter'),'Repeated auto UI refresh keeps stable wrapper count',f"{result.get('autoBefore')}->{result.get('autoAfter')}")
    check(result.get('pureSet')==result.get('pureAfter'),'Buff-total aggregation does not execute periodic heal',f"{result.get('pureSet')}->{result.get('pureAfter')}")
    check(result.get('runtimeAfter',0)>result.get('pureAfter',0),'Normal runtime normalization still advances periodic heal tick',f"{result.get('pureAfter')}->{result.get('runtimeAfter')}")
    check(result.get('hp',0)>1,'Normal periodic heal still restores HP',f"HP {result.get('hp')}/{result.get('maxHp')}")
finally:
    if ws:
        try: ws.close()
        except Exception: pass
    proc.terminate()
    try: proc.wait(3)
    except Exception: proc.kill()
    shutil.rmtree(profile,ignore_errors=True)

failed=[x for x in checks if not x['passed']]
print(json.dumps({'version':'0.9.82GP','passed':len(checks)-len(failed),'total':len(checks),'failed':failed,'checks':checks},ensure_ascii=False,indent=2))
sys.exit(1 if failed else 0)
