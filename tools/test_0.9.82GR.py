#!/usr/bin/env python3
from pathlib import Path
import json,re,zipfile,sys
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
BASE_ZIP=Path('/mnt/data/RO_WEB_0.9.82GQ_Static_Black_Gold_UI_Performance(1).zip')
VERSION='0.9.82GR'
MIDS={21520,21521,21522,21523,21524,21525,21526,21527,21528,21529,21537,21599}
CARDS={300360,300361,300362,300363,300364,300365,300366,300367,300368,300377,300381}
checks=[]
def check(ok,name,detail=''):
 checks.append({'ok':bool(ok),'name':name,'detail':str(detail)})
def load(rel):return json.loads((ROOT/rel).read_text(encoding='utf-8-sig'))
# Version/cache.
index=(ROOT/'index.html').read_text(encoding='utf-8'); game=(ROOT/'js/game.js').read_text(encoding='utf-8')
check(f'const RO_WEB_VERSION = "{VERSION}"' in game,'game version',VERSION)
check(set(re.findall(r'\?v=([^"\']+)',index))=={VERSION},'cache version consistency',sorted(set(re.findall(r'\?v=([^"\']+)',index))))
# Skill names and non-regression descriptions.
name_doc=load('../skillinfo_names.json') if (ROOT/'../skillinfo_names.json').exists() else json.loads(Path('/mnt/data/ro_gr_work/skillinfo_names.json').read_text(encoding='utf-8'))
name_map=dict(name_doc['mapping']); name_map['BA_FROSTJOKER']=name_map.get('BA_FROSTJOKE','冷笑話')
core1=load('data/skills/skills_core_1.json'); core2=load('data/skills/skills_core_2.json')
allskills={**core1['skills'],**core2['skills']}
wrong=[(sid,s.get('key'),s.get('name'),name_map.get(s.get('key'))) for sid,s in allskills.items() if s.get('name')!=name_map.get(s.get('key'))]
check(len(allskills)==1139,'player skill count',len(allskills)); check(not wrong,'all skill names match TW SkillInfoz',wrong[:10])
check(all(str(s.get('description') or '').strip() for s in allskills.values()),'all player skills have display descriptions')
# Compare original GQ descriptions: Core1 and any pre-existing Core2 text must be byte-for-byte preserved.
with zipfile.ZipFile(BASE_ZIP) as z:
 old1=json.loads(z.read('data/skills/skills_core_1.json').decode('utf-8-sig'))['skills']
 old2=json.loads(z.read('data/skills/skills_core_2.json').decode('utf-8-sig'))['skills']
reg1=[sid for sid,s in core1['skills'].items() if s.get('description')!=old1[sid].get('description') or s.get('officialDescription')!=old1[sid].get('officialDescription')]
reg2=[sid for sid,s in core2['skills'].items() if old2[sid].get('description') and s.get('description')!=old2[sid].get('description')]
check(not reg1,'Core1 Runtime descriptions unchanged from GQ',reg1[:10]); check(not reg2,'existing Core2 Runtime descriptions unchanged from GQ',reg2[:10])
# Runtime duplicated names.
runtime_bad=[]
def walk(o,path=''):
 if isinstance(o,dict):
  k=o.get('skillKey') or (o.get('key') if ('skillId' in o or 'officialId' in o or 'maxLevel' in o) else None)
  if k in name_map and 'name' in o and o.get('name')!=name_map[k]:runtime_bad.append((path,k,o.get('name'),name_map[k]))
  for x,v in o.items():walk(v,path+'/'+x)
 elif isinstance(o,list):
  for i,v in enumerate(o):walk(v,path+f'/{i}')
for rel in ['data/skill_runtime/runtime_generated_all.json','data/skill_runtime/runtime_formula_catalog.json','data/skill_runtime/runtime_pending_review.json','data/skill_runtime/runtime_core_1_v1.json','data/skill_runtime/runtime_copyable_skills.json']:
 walk(load(rel),rel)
check(not runtime_bad,'Runtime skill names synchronized',runtime_bad[:10])
# Monster atlas and spawn mapping.
mons={int(m['id']):m for m in load('data/monsters.json')}; atlas_errors=[]
for mid in sorted(MIDS):
 m=mons[mid]; png=ROOT/m['animationAtlas']; jp=ROOT/m['animationJson']; d=json.loads(jp.read_text(encoding='utf-8')); im=Image.open(png)
 frames={int(f['id']):f for f in d.get('frames',[])}
 if im.width<=64 or im.height<=64: atlas_errors.append((mid,'placeholder-sized',im.size))
 if set(['idle','walk','attack','hit','dead'])-set(d.get('animations',{})): atlas_errors.append((mid,'motions'))
 for motion in ['idle','walk','attack','hit','dead']:
  dirs=(d.get('animations',{}).get(motion,{}).get('directions') or {})
  if set(['south_west','north_west','north_east','south_east'])-set(dirs):atlas_errors.append((mid,motion,'dirs'))
  for row in dirs.values():
   if any(int(fid) not in frames for fid in row.get('frames',[])):atlas_errors.append((mid,motion,'frame-ref'))
 for f in frames.values():
  if f['x']<0 or f['y']<0 or f['x']+f['width']>im.width or f['y']+f['height']>im.height:atlas_errors.append((mid,'bounds',f['id']))
check(not atlas_errors,'12 formal monster atlases valid',atlas_errors[:20])
spawn=load('data/monster_spawn_config.json')['regions']
ice={int(x['monsterId']) for x in spawn['ice_scale_hill_3x3_region_camera']['pool']}; serpent={int(x['monsterId']) for x in spawn['serpent_nest_3x3_region_camera']['pool']}
check({21520,21521,21522,21523,21524,21525,21526,21527,21537}.issubset(ice),'Ice Scale Hill spawn set',sorted(ice))
check({21526,21527,21528,21529,21599}.issubset(serpent),'Serpent Nest spawn set',sorted(serpent))
# Item/drop/card completeness.
idx=load('data/items/item_index.json'); dropids={int(d['itemId']) for mid in MIDS for d in mons[mid].get('drops',[])}
check(len(dropids)==35,'EP19 active drop item count',len(dropids)); check(all(str(i) in idx for i in dropids),'all EP19 drops resolve in item index')
check(all((ROOT/(idx[str(i)].get('icon') or f'images/items/{i}.webp')).exists() for i in dropids),'all EP19 drop icons exist')
cards=load('data/items/cards_2.json'); effects=load('data/card_runtime/card_effects.json'); sources=load('data/card_runtime/card_drop_sources.json')
card_bad=[]
for cid in CARDS:
 r=cards.get(str(cid))
 if not r or not r.get('cardTarget') or not r.get('scriptRaw') or not r.get('compiledScript'):card_bad.append((cid,'record'))
 if effects.get(str(cid),{}).get('compiledScript')!=r.get('compiledScript'):card_bad.append((cid,'effect-sync'))
 if not sources.get(str(cid)):card_bad.append((cid,'drop-source'))
check(not card_bad,'11 EP19 cards have targets/scripts/sources',card_bad)
# Bundle parity report from deep health must pass.
deep=load('DEEP_HEALTH_0.9.82GR.json'); check(deep.get('summary',{}).get('status')=='PASS','deep health PASS',deep.get('summary'))
effect=load('EFFECT_RUNTIME_TEST_0.9.82GR.json'); check(effect.get('summary',{}).get('failed')==0,'effect runtime matrix PASS',effect.get('summary'))
errors=[x for x in checks if not x['ok']]
out={'version':VERSION,'summary':{'checks':len(checks),'passed':len(checks)-len(errors),'failed':len(errors),'status':'PASS' if not errors else 'FAIL'},'checks':checks}
(ROOT/f'GR_FEATURE_TEST_{VERSION}.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(out,ensure_ascii=False,indent=2))
sys.exit(1 if errors else 0)
