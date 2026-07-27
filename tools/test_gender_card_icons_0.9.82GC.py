#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
from collections import Counter
import hashlib, json, re, sys

ROOT=Path(__file__).resolve().parents[1]
checks=[]; errors=[]
def check(ok,name,detail=''):
    checks.append({'ok':bool(ok),'name':name,'detail':str(detail)})
    if not ok: errors.append(f'{name}: {detail}')
def load(rel): return json.loads((ROOT/rel).read_text(encoding='utf-8-sig'))
def text(rel): return (ROOT/rel).read_text(encoding='utf-8')

def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()

index=text('index.html'); player_js=text('js/player.js'); game_js=text('js/game.js')
atlas_js=text('js/player_atlas_runtime.js'); town_js=text('js/town.js')
job_js=text('js/job.js'); constitution_js=text('js/job_constitution.js'); gender_js=text('js/character_gender.js')

check('<title>RO_WEB 0.9.82GC</title>' in index,'release title')
check(set(re.findall(r'\?v=([^"\']+)',index))=={'0.9.82GC'},'all HTML cache keys are GC',set(re.findall(r'\?v=([^"\']+)',index)))
check('const RO_WEB_VERSION = "0.9.82GC"' in game_js,'game release constant')
check('characterGenderModal' in index and 'data-character-gender="male"' in index and 'data-character-gender="female"' in index,'opening gender modal has both choices')
check('js/player_atlas_runtime.js?v=0.9.82GC' in index and 'js/character_gender.js?v=0.9.82GC' in index,'gender runtime loaded')
check(index.index('js/player_atlas_runtime.js?v=0.9.82GC') < index.index('js/character_gender.js?v=0.9.82GC') < index.index('js/game.js?v=0.9.82GC'),'gender runtime load order')
check('await ensureInitialCharacterGenderSelection();' in game_js and game_js.index('await loadPlayerData();') < game_js.index('await ensureInitialCharacterGenderSelection();') < game_js.index('validateStartupData();'),'new-character chooser blocks startup after player load')

default=load('data/player_default.json')
check(default.get('gender') is None and default.get('genderChosen') is False and default.get('characterAtlas') is None,'fresh default requires explicit gender choice',default.get('gender'))
check('inferLegacyCharacterGender' in player_js and 'player.genderChosen = true' in player_js and 'window.RO_WEB_PLAYER_SAVE_FOUND' in player_js,'legacy save gender migration exists')
check('normalizeJobForGender' not in player_js,'load normalization never changes job for gender')
check('allowedGenders' not in job_js and 'allowedGenders' not in constitution_js,'job change runtime ignores gender restrictions')
check('protectedSnapshot' in gender_js and 'player.characterAtlas = null' in gender_js,'gender change protects progress and invalidates only appearance')
check('genderCounterpartJob' in atlas_js and 'counterpartAtlas' in atlas_js,'missing-gender job art uses counterpart appearance fallback')

npcs=load('data/npcs.json')
npc=next((x for x in npcs if x.get('id')=='prontera_gender_change_npc'),None)
check(npc and npc.get('cityId')=='prontera' and npc.get('type')=='gender_change','Prontera gender-change NPC exists',npc)
check('openCharacterGenderSelection({ required: false, source: npc.name })' in town_js,'NPC uses shared gender modal')
check('characterGenderToggle' in index and "source: '角色介面'" in index,'character panel uses same gender modal')

jobs=load('data/jobs.json'); manifest=load('data/character_atlas_manifest.json')['characters']
for current, opposite_gender in [('bard','female'),('dancer','male'),('clown','female'),('gypsy','male'),('minstrel','female'),('wanderer','male'),('troubadour','female'),('trouvere','male')]:
    counterpart=jobs[current].get('genderCounterpartJob')
    appearance=jobs[counterpart].get('appearanceGroup') or counterpart
    expected=f'{appearance}_{opposite_gender}'
    check(expected in manifest,f'{current} {opposite_gender} counterpart atlas exists',expected)

cards=load('data/card_runtime/card_effects.json'); index_items=load('data/items/item_index.json')
counts=Counter(row.get('cardVisualTier') for row in cards.values())
check(len(cards)==910 and counts==Counter({'normal':687,'mvp':142,'boss':81}),'card rarity totals corrected',dict(counts))
expected={4074:'normal',4127:'normal',4169:'boss',4210:'normal',4246:'normal',4344:'normal',4410:'normal'}
for cid,tier in expected.items():
    row=cards[str(cid)]
    check(row.get('cardVisualTier')==tier and row.get('isMvpCard')==(tier=='mvp'),f'card {cid} corrected to {tier}',row.get('cardVisualTier'))
anopheles=cards['4344']
check(anopheles.get('cardTierSourceMonsterIds')==[1627] and anopheles.get('icon')=='images/items/card_normal.webp','Anopheles canonical normal source controls visual tier',anopheles.get('cardTierSourceMonsterIds'))
check(cards['4001'].get('icon')=='images/items/4001.webp' and index_items['4001'].get('icon')=='images/items/4001.webp','Poring card explicitly uses original card image path')
check(sha(ROOT/'images/items/4001.webp')==sha('/mnt/data/original_4001.webp'),'Poring card image bytes match original source')
check(sha(ROOT/'images/items/4001.webp')==sha(ROOT/'images/items/card_normal.webp'),'Poring card is original normal-card graphic, not monster portrait')

icon_dir=ROOT/'images/items'; icons={p.name for p in icon_dir.glob('*.webp')}
prune=load('ITEM_ICON_PRUNE_REPORT_0.9.82GC.json')
check(len(icons)==796 and prune['before']['count']==20912 and prune['deleted']['count']==20116,'ITEM icon library pruned to active set',len(icons))
check(not prune.get('missingReferences') and not prune.get('unreferencedRemaining'),'prune audit has no missing or leftover references')
check({'4001.webp','card_normal.webp','card_boss.webp','card_mvp.webp'}.issubset(icons),'required card icons preserved')
check('4344.webp' not in icons and '14848.webp' not in icons,'unused numeric duplicates removed')

item_manifest=load('data/items/database_manifest.json')
missing=[]; records=0
for rel in item_manifest.get('allDataPaths',[]):
    data=load(rel); rows=data.values() if isinstance(data,dict) else data
    for row in rows:
        if isinstance(row,dict) and row.get('id') is not None:
            records+=1
            icon=row.get('icon')
            if not icon or not (ROOT/icon).is_file(): missing.append((row.get('id'),icon,rel))
check(not missing,'all active item records retain an existing icon',missing[:10])
check(records>=1700,'active item database record count preserved',records)

# Every JSON file used by the runtime must still parse after all updates.
json_errors=[]
for path in list((ROOT/'data').rglob('*.json'))+list((ROOT/'assets').rglob('*.json')):
    try: json.loads(path.read_text(encoding='utf-8-sig'))
    except Exception as exc: json_errors.append((str(path.relative_to(ROOT)),str(exc)))
check(not json_errors,'all runtime JSON parses',json_errors[:5])

bundle=text('js/data_bundle.js')
check('"gender":null,"characterAtlas":null' in bundle and '"prontera_gender_change_npc"' in bundle,'data bundle contains fresh gender default and NPC')
check('"4344":{"id":4344' in bundle and '"cardVisualTier":"normal"' in bundle,'data bundle includes corrected card data')

report={'version':'0.9.82GC','summary':{'checks':len(checks),'passed':sum(x['ok'] for x in checks),'failed':len(errors)},'errors':errors,'checks':checks}
(ROOT/'tools/test_gender_card_icons_report_0.9.82GC.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(1 if errors else 0)
