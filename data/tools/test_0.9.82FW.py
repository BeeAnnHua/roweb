#!/usr/bin/env python3
from pathlib import Path
import collections, json, re, sys
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
errors=[]; checks=[]
def check(cond,label,detail=''):
    checks.append((label,bool(cond),detail))
    if not cond: errors.append(f'{label}: {detail}')
def load(rel): return json.loads((ROOT/rel).read_text(encoding='utf-8-sig'))

# Version/cache contract.
index=(ROOT/'index.html').read_text(encoding='utf-8')
game=(ROOT/'js/game.js').read_text(encoding='utf-8')
check('RO_WEB V0.9.82FW' in index,'index version')
check('const RO_WEB_VERSION = "0.9.82FW"' in game,'game version')
cache_versions=set(re.findall(r'\?v=([^"\']+)',index))
check(cache_versions=={'0.9.82FW'},'cache version consistency',str(sorted(cache_versions)))

# Runtime card datasets.
cards={}
for rel in ('data/items/cards_1.json','data/items/cards_2.json'):
    cards.update(load(rel))
combos=load('data/card_runtime/card_combos.json')
drops=load('data/card_runtime/card_drop_sources.json')
groups=load('data/card_runtime/item_groups.json')
check(len(cards)==910,'card count',str(len(cards)))
check(sum(len(v) for v in drops.values())==1422,'card drop source count',str(sum(len(v) for v in drops.values())))
check(len(combos)==784,'combo count',str(len(combos)))
check(len(groups.get('IG_FOOD',{}).get('entries',[]))==22,'IG_FOOD entries')
check(len(groups.get('IG_RECOVERY',{}).get('entries',[]))==14,'IG_RECOVERY entries')
card_ids=[int(x) for x in cards]
check(len(card_ids)==len(set(card_ids)),'duplicate card IDs',str(len(card_ids)-len(set(card_ids))))
check(all(str(c.get('name','')).strip() for c in cards.values()),'all cards have names')
check(all(c.get('icon')==f"images/items/{c.get('id')}.webp" for c in cards.values()),'card icon ID mapping')
check(all(c.get('cardTarget') for c in cards.values()),'all monster-drop cards have socket targets')
check(cards['6716'].get('cardTarget')==['headTop'] and 'bCritical' in cards['6716'].get('scriptRaw',''),'WA Treasure CRI stone runtime')
check(cards['6717'].get('cardTarget')==['headMid'] and 'bMaxHP' in cards['6717'].get('scriptRaw',''),'WA Treasure HP stone runtime')
check(cards['6718'].get('cardTarget')==['headLow'] and 'bMaxSP' in cards['6718'].get('scriptRaw',''),'WA Treasure SP stone runtime')

# Description cleanup.
bad_desc=[]
for cid,c in cards.items():
    for line in c.get('description',[]):
        s=str(line).strip()
        if re.search(r'\^[0-9A-Fa-f]{6}',s) or re.match(r'^(系列|重量)\s*[:：]',s) or re.match(r'^裝備\s*[:：]',s):
            bad_desc.append((cid,s))
check(not bad_desc,'card description metadata/color cleanup',repr(bad_desc[:5]))

# Authoritative split item records have no duplicate IDs. Legacy card rows removed.
manifest=load('data/items/database_manifest.json')
all_ids=[]
legacy_cards=[]
for rel in manifest['allDataPaths']:
    data=load(rel)
    rows=list(data.values()) if isinstance(data,dict) else data
    for row in rows:
        if not isinstance(row,dict): continue
        iid=row.get('officialId',row.get('id'))
        if iid is not None: all_ids.append(int(iid))
        if rel.endswith('monster_drops_0_9_82EI.json') and (str(row.get('type','')).lower()=='card' or int(iid or 0) in set(card_ids)):
            legacy_cards.append(int(iid or 0))
dup_ids=[x for x,n in collections.Counter(all_ids).items() if n>1]
check(not dup_ids,'authoritative item duplicate IDs',repr(dup_ids[:10]))
check(not legacy_cards,'legacy duplicate card rows removed',repr(legacy_cards[:10]))
check(manifest.get('cardSystem',{}).get('legacyDuplicateCardRecordsRemovedFromFU')==155,'legacy removal recorded')
check(manifest.get('cardSystem',{}).get('duplicateCardIds')==0,'manifest duplicate card IDs')

# Active regional monster card drops are synchronized and unique per monster/card.
monsters=load('data/monsters.json')
active=[]
for m in monsters:
    seen=set()
    for d in m.get('drops',[]):
        iid=int(d.get('itemId') or 0)
        if iid in set(card_ids):
            pair=(int(m['id']),iid)
            active.append(pair)
            check(iid not in seen,f"monster {m['id']} duplicate card drop",str(iid))
            seen.add(iid)
check(len(active)==172,'active monster card drop rows',str(len(active)))
check(len(active)==len(set(active)),'active monster/card drop pair uniqueness')

# Corrected icon source is fully synchronized; seven audited assets are valid 24x24 RGBA and visible.
icon_count=len(list((ROOT/'images/items').glob('*.webp')))
check(icon_count==20909,'item icon count',str(icon_count))
for iid in (1000,1001,1010,2324,7041,7043,1000504):
    p=ROOT/f'images/items/{iid}.webp'
    try:
        with Image.open(p) as im:
            rgba=im.convert('RGBA')
            alpha=rgba.getchannel('A').getextrema()
            check(im.size==(24,24),f'icon {iid} size',str(im.size))
            check(alpha[1]>0,f'icon {iid} nontransparent',str(alpha))
    except Exception as e:
        check(False,f'icon {iid} readable',str(e))

# Data bundle contains exact authoritative JSON datasets.
bundle=(ROOT/'js/data_bundle.js').read_text(encoding='utf-8')
prefix='window.RO_WEB_DATA = '
check(bundle.startswith(prefix),'data bundle prefix')
try:
    bundled=json.loads(bundle[len(prefix):].rstrip().removesuffix(';'))
except Exception as e:
    bundled={}; check(False,'data bundle JSON parse',str(e))
for rel in ('data/items/cards_1.json','data/items/cards_2.json','data/card_runtime/card_effects.json','data/card_runtime/card_combos.json','data/card_runtime/card_drop_sources.json','data/card_runtime/item_groups.json','data/npcs.json'):
    check(rel in bundled,f'bundle includes {rel}')
    if rel in bundled: check(bundled[rel]==load(rel),f'bundle matches {rel}')

# Runtime integration contracts.
card_js=(ROOT/'js/card_runtime.js').read_text(encoding='utf-8')
auto_js=(ROOT/'js/auto_battle.js').read_text(encoding='utf-8')
battle_js=(ROOT/'js/battle.js').read_text(encoding='utf-8')
skill_js=(ROOT/'js/skill_engine.js').read_text(encoding='utf-8')
town_js=(ROOT/'js/town.js').read_text(encoding='utf-8')
item_ui=(ROOT/'js/item_instance_ui.js').read_text(encoding='utf-8')
npcs=load('data/npcs.json')
for token in ('socketCard','getSocketCandidates','removeAllCardsFromEquipped','1000000','isMvpCard','onNormalAttack','onPlayerDamaged','onMonsterDefeated'):
    check(token in card_js,f'CardRuntime token {token}')
check(any(n.get('id')=='prontera_card_removal_npc' and n.get('type')=='card_removal' for n in npcs),'Prontera card removal NPC data')
check('openCardRemovalNpc' in town_js and 'removeAllCardsFromEquipped' in town_js,'card removal NPC runtime')
check('getSocketCandidates' in item_ui and 'socketCard' in item_ui and 'item-detail-socket-candidate' in item_ui,'socketing UI integration')
for token in ('AUTO_RESOURCE_RETRY_MS = 15000','resourceRetryUntil','handleAutoSkillResourceBlock','suppressAutoSkillForResource'):
    check(token in auto_js,f'auto resource retry token {token}')
check('handleAutoSkillResourceBlock(autoAction.skill,recheck)' in battle_js,'battle race-condition fallback')
check('resourceBlock:{type,current,required,label,retryMs:15000}' in skill_js,'skill resource block contract')

# FU regression guard: right HUD collapse and standalone auto-combat layout remain.
ui_js=(ROOT/'js/ui.js').read_text(encoding='utf-8')
css=(ROOT/'css/style.css').read_text(encoding='utf-8')
for token in ('right-hud-shell','rightHudCollapseToggle','right-hud-action-row'):
    check(token in index or token in css,f'FU HUD token {token}')
check('RO_WEB_RIGHT_HUD_STORAGE_KEY' in ui_js and 'toggleRightHudCollapse' in ui_js,'FU right HUD collapse runtime')
check('autoCombatSettingsScroll' in auto_js,'FU auto battle settings preserved')

# Parse every JSON file.
json_bad=[]
for p in ROOT.rglob('*.json'):
    try: json.loads(p.read_text(encoding='utf-8-sig'))
    except Exception as e: json_bad.append((str(p.relative_to(ROOT)),str(e)))
check(not json_bad,'all JSON parses',repr(json_bad[:5]))

report={
    'version':'0.9.82FW','checks':len(checks),'passed':sum(1 for _,ok,_ in checks if ok),
    'failed':len(errors),'errors':errors,
    'metrics':{'cards':len(cards),'dropSources':sum(len(v) for v in drops.values()),'combos':len(combos),'activeCardDrops':len(active),'itemIcons':icon_count}
}
(ROOT/'tools/test_report_0.9.82FW.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(1 if errors else 0)
