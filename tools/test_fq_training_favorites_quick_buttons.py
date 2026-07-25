from pathlib import Path
from PIL import Image
import json,re,sys
ROOT=Path(__file__).resolve().parents[1]
errors=[]
def check(cond,msg):
    if not cond: errors.append(msg)

maps=json.loads((ROOT/'data/maps.json').read_text(encoding='utf-8'))
check(len(maps)==12,f'map count {len(maps)}')
check(maps[0].get('id')=='novice_training_3x3_region_camera','training map not first')
check(maps[0].get('regionOrder')==1,'training map order not 1')
check(maps[0].get('sourceChunkRange')=='100-108','training range wrong')
check(maps[0].get('monsters')==[1002,1113,1063,1007,1009,1011,1010,1004],'training monster pool wrong')
check(all(maps[i].get('regionOrder')==i+1 for i in range(len(maps))),'region orders not continuous')
for i in range(1,10):
    p=ROOT/f'images/maps/world/novice_training_3x3/tiles/{i:03d}.webp'
    check(p.exists(),f'missing tile {p}')
    if p.exists(): check(Image.open(p).size==(512,512),f'bad tile size {i}')
for rel,size in [
 ('images/maps/world/novice_training_3x3/novice_training_3x3_region_bg_0_9_82FQ.webp',(1536,1536)),
 ('images/maps/world/novice_training_3x3/novice_training_3x3_region_small_0_9_82FQ.webp',(320,320))]:
    p=ROOT/rel;check(p.exists(),f'missing {rel}')
    if p.exists():check(Image.open(p).size==size,f'bad {rel} size')
spawn=json.loads((ROOT/'data/monster_spawn_config.json').read_text(encoding='utf-8'))
profile=spawn.get('regions',{}).get('novice_training_3x3_region_camera')
check(bool(profile),'training spawn profile missing')
if profile:
    check([x.get('monsterId') for x in profile.get('pool',[])]==[1002,1113,1063,1007,1009,1011,1010,1004],'spawn pool mismatch')
manifest=json.loads((ROOT/'data/world_region_manifest.json').read_text(encoding='utf-8'))
check(manifest.get('regionCount')==12,'manifest count wrong')
check(manifest.get('regions',[{}])[0].get('id')=='novice_training_3x3_region_camera','manifest training not first')
html=(ROOT/'index.html').read_text(encoding='utf-8')
check('data-target="auto-combat-panel">戰鬥</button>' in html,'battle button missing')
check('id="autoBattleQuickToggle"' in html,'quick hang button missing')
check(html.count('id="autoBattleQuickToggle"')==1,'quick hang duplicate')
check('0.9.82FP' not in html,'old cache version in index')
mapjs=(ROOT/'js/map.js').read_text(encoding='utf-8')
for token in ['getFavoriteMapIds','toggleFavoriteMap','getSortedFieldMapDestinations','map-favorite-toggle']:
    check(token in mapjs,f'{token} missing')
check('(cities || []).forEach(city => destinations.push' not in mapjs,'city destinations still rendered')
check('enterCity(dest.id)' not in mapjs,'map UI still enters cities')
css=(ROOT/'css/style.css').read_text(encoding='utf-8')
check('grid-template-columns: repeat(5' in css,'desktop quick grid missing')
check('#map-window .map-favorite-toggle' in css,'favorite CSS missing')
bundle=(ROOT/'js/data_bundle.js').read_text(encoding='utf-8')
check('novice_training_3x3_region_camera' in bundle,'training map absent from bundle')
check('初學者修練場' in bundle,'training map name absent from bundle')
print(json.dumps({'status':'PASS' if not errors else 'FAIL','errors':errors,'checks':30},ensure_ascii=False,indent=2))
if errors: sys.exit(1)
