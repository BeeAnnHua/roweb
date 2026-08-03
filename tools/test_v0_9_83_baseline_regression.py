from pathlib import Path
import json, subprocess, re, sys
ROOT=Path(__file__).resolve().parents[1]
checks={}; errors=[]
def check(name, cond, detail=''):
    checks[name]={'pass':bool(cond),'detail':str(detail)}
    if not cond: errors.append(f'{name}: {detail}')
index=(ROOT/'index.html').read_text(encoding='utf8')
battle=(ROOT/'js/battle.js').read_text(encoding='utf8')
loot=(ROOT/'js/loot.js').read_text(encoding='utf8')
monsters=json.loads((ROOT/'data/monsters.json').read_text(encoding='utf8'))
byid={int(x.get('id',0)):x for x in monsters}
sources=json.loads((ROOT/'data/card_runtime/card_drop_sources.json').read_text(encoding='utf8'))
check('version_title','RO_WEB V0.9.83' in index)
versions=set(re.findall(r'[?&]v=([^&"\']+)',index))
check('cache_bust_only_v083',versions=={'0.9.83'},sorted(versions))
check('detale_authoritative_name',byid[1719].get('name')=='迪塔勒泰晤勒斯',byid[1719].get('name'))
check('ktullanux_authoritative_name',byid[1779].get('name')=='冰晶龍',byid[1779].get('name'))
check('detale_card_source', [int(x['monsterId']) for x in sources['4386']]==[1719],sources['4386'])
check('ktullanux_card_source', 1779 in [int(x['monsterId']) for x in sources['4419']] and 1719 not in [int(x['monsterId']) for x in sources['4419']],sources['4419'])
for token in ['createMonsterDeathRewardSnapshot','getAuthoritativeMonsterDeathId','DEATH_IDENTITY_LOCKED','sourceMonster:monster']:
    check('battle_'+token,token in battle)
for token in ['validateMonsterDropIdentity','CARD_SOURCE_MISMATCH_BLOCKED','getCardDropSourceMonsterIds','來源：${identity.name}']:
    check('loot_'+token,token in loot)
# data bundle exact
text=(ROOT/'js/data_bundle.js').read_text(encoding='utf8')
body=text[len('window.RO_WEB_DATA = '):].strip(); body=body[:-1] if body.endswith(';') else body
bundle=json.loads(body)
check('data_bundle_monsters_exact',bundle.get('data/monsters.json')==monsters)
# JS syntax
jsfiles=sorted((ROOT/'js').rglob('*.js'))
syntax_ok=0
for p in jsfiles:
    r=subprocess.run(['node','--check',str(p)],capture_output=True,text=True)
    if r.returncode:
        check('syntax_'+p.name,False,r.stderr[-1000:]);break
    syntax_ok+=1
check('javascript_syntax_all',syntax_ok==len(jsfiles),f'{syntax_ok}/{len(jsfiles)}')
# executable regressions
for test in [
    'tools/test_monster_death_card_identity_0.9.82IK.js',
    'tools/test_warlock_spheres_coelacanth_0.9.82IJ.js',
    'tools/test_0.9.82II_runtime_recovery.js',
    'tools/test_hotfix_0.9.82II.js',
    'tools/test_skill_effect_runtime_0.9.82II.js']:
    r=subprocess.run(['node',str(ROOT/test)],capture_output=True,text=True,timeout=90)
    check('run_'+Path(test).stem,r.returncode==0,(r.stdout+r.stderr)[-2000:])
result={'version':'0.9.83','baseVersion':'0.9.82IL4','pass':not errors,'checks':checks,'errors':errors,'summary':{'passed':sum(v['pass'] for v in checks.values()),'total':len(checks),'jsSyntax':f'{syntax_ok}/{len(jsfiles)}'}}
print(json.dumps(result,ensure_ascii=False,indent=2));sys.exit(0 if result['pass'] else 1)
