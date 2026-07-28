from pathlib import Path
import json, zipfile
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]; checks=[]
def check(v,msg):
 if not v: raise AssertionError(msg)
 checks.append(msg)
maps=json.loads((ROOT/'data/maps.json').read_text())
by={m['id']:m for m in maps}
for mid,ran,name in [('ice_scale_hill_3x3_region_camera','134-142','冰鱗山丘'),('serpent_nest_3x3_region_camera','143-151','蛇巢穴')]:
 m=by[mid];check(m['name']==name and m['sourceChunkRange']==ran,f'{name} map metadata')
 check(len(m['chunkGrid']['sourceTiles'])==9,f'{name} has 9 chunks')
 for rel in m['chunkGrid']['sourceTiles']: check(Image.open(ROOT/rel).size==(512,512),f'{name} tile 512')
 check(Image.open(ROOT/m['background']).size==(1536,1536),f'{name} stitched background')
spawn=json.loads((ROOT/'data/monster_spawn_config.json').read_text())['regions']
check(spawn['ice_scale_hill_3x3_region_camera']['targetNormalCountAt100']==135,'ice normal target 135')
check(any(x['monsterId']==21537 and x.get('maxAlive')==1 for x in spawn['ice_scale_hill_3x3_region_camera']['pool']),'ice MVP unique')
check(spawn['serpent_nest_3x3_region_camera']['targetNormalCountAt100']==135,'snake normal target 135')
mons={m['id']:m for m in json.loads((ROOT/'data/monsters.json').read_text())}
for mid in [21520,21521,21522,21523,21524,21525,21526,21527,21528,21529,21537,21599]:
 check(mid in mons and mons[mid]['drops'],f'monster {mid} original drop table exists')
 check((ROOT/mons[mid]['animationAtlas']).exists() and (ROOT/mons[mid]['animationJson']).exists(),f'monster {mid} asset exists')
bonus=json.loads((ROOT/'data/enchant_grade_map_drops.json').read_text())
check(all(e.get('skipIfOriginalDrop') for p in bonus['profiles'].values() for e in p['entries']),'all supplemental drops enforce original-drop de-duplication')
check(1000322 in [d['itemId'] for d in mons[21525]['drops']],'one existing Etel Dust source preserved in original table')
rules=json.loads((ROOT/'data/enchant_grade_rules.json').read_text())
check(set(rules['groups'])=={'Armor','Weapon'},'RA grade groups')
check(set(rules['groups']['Weapon']['levels'])=={'5'} and set(rules['groups']['Armor']['levels'])=={'2'},'only Lv5 weapons / Lv2 armor')
recipes=json.loads((ROOT/'data/enchant_grade_exchange.json').read_text())['recipes']
check(len(recipes)==6 and sum(r['zeny'] for r in recipes)==1300000,'six RA recipes and exact base Zeny total')
npcs=json.loads((ROOT/'data/npcs.json').read_text())
check(any(n['cityId']=='payon' and n['type']=='enchant_grade' for n in npcs),'Payon enchant grade NPC')
print(json.dumps({'version':'0.9.82GO','passed':len(checks),'status':'PASS'},ensure_ascii=False))
