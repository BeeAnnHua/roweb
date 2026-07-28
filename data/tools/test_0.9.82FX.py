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
check('RO_WEB V0.9.82FX' in index,'index version')
check('const RO_WEB_VERSION = "0.9.82FX"' in game,'game version')
cache_versions=set(re.findall(r'\?v=([^"\']+)',index))
check(cache_versions=={'0.9.82FX'},'cache version consistency',str(sorted(cache_versions)))

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

# FX unified effect Runtime release gates.
effect_js=(ROOT/'js/effect_runtime.js').read_text(encoding='utf-8')
visual_js=(ROOT/'js/effect_visual_runtime.js').read_text(encoding='utf-8')
player_js=(ROOT/'js/player.js').read_text(encoding='utf-8')
combat_formula_js=(ROOT/'js/combat_formula_runtime.js').read_text(encoding='utf-8')
combat_mechanics_js=(ROOT/'js/combat_mechanics_runtime.js').read_text(encoding='utf-8')
ra_pipeline_js=(ROOT/'js/ra_renewal_damage_pipeline.js').read_text(encoding='utf-8')
loot_js=(ROOT/'js/loot.js').read_text(encoding='utf-8')
check('js/card_runtime.js?v=0.9.82FX' in index and 'js/effect_runtime.js?v=0.9.82FX' in index,'FX unified Runtime scripts loaded')
check(index.index('js/card_runtime.js?v=0.9.82FX') < index.index('js/effect_runtime.js?v=0.9.82FX') < index.index('js/status_system.js?v=0.9.82FX'),'FX Runtime load order')
check('js/effect_visual_runtime.js?v=0.9.82FX' in index,'FX transform visual Runtime loaded')
for token in ('dynamicRecord','compileRawScript','recordDiagnostic','unhandled rAthena bonus','getSupportedBonusTypes','getDiagnostics'):
    check(token in card_js,f'FX CardRuntime future-data gate {token}')
for token in ('const COVERAGE','auditCanonicalSource','auditSources','getCoverageManifest','getSources'):
    check(token in effect_js,f'FX EffectRuntime coverage gate {token}')
for token in ('EffectRuntime?.getSources','hpRecoveryRate','spRecoveryRate','noHpRegen','noSpRegen'):
    check(token in (status_system_js if (status_system_js:=(ROOT/'js/status_system.js').read_text(encoding='utf-8')) else '' ) or token in player_js,f'FX status/recovery consumer {token}')
for token in ('EffectRuntime','physicalRaceDamage','elementResist','sizeDamage','magicImmune'):
    check(token in combat_formula_js or token in combat_mechanics_js or token in ra_pipeline_js,f'FX combat consumer {token}')
for token in ('CardRuntime?.rollExtraDrops','CardRuntime?.onMonsterDefeated','CardRuntime.getExpRate'):
    check(token in loot_js,f'FX reward hook {token}')
for token in ('equipmentNoWalkDelay','EffectRuntime?.hasFlag?.("noWalkDelay"','window.revealHiddenMonstersAroundPlayer'):
    check(token in skill_js,f'FX timing/visibility hook {token}')
check('revealHiddenMonstersAroundPlayer(24)' in card_js,'FX intravision periodic consumer')
check('visible fallback used' in visual_js and 'ro:web-player-transform' in visual_js,'FX transform visible fallback contract')

# All active_transform IDs have either an exact local atlas or a visible fallback.
transform_ids=set()
for rel in ('data/items/cards_1.json','data/items/cards_2.json','data/card_runtime/equipment_effects.json','data/card_runtime/card_combos.json'):
    data=load(rel); rows=data.values() if isinstance(data,dict) else data
    for row in rows:
        if not isinstance(row,dict): continue
        script='\n'.join(str(row.get(k,'')) for k in ('scriptRaw','Script','script','compiledScript'))
        transform_ids.update(int(x) for x in re.findall(r'active_transform\s*\(?\s*(\d+)\s*,',script,re.I))
exact_transform_ids=set()
for iid in transform_ids:
    manifest_path=ROOT/f'assets/monsters/animations/{iid}/{iid}.json'
    if not manifest_path.is_file(): continue
    manifest_data=load(str(manifest_path.relative_to(ROOT)).replace('\\','/'))
    atlas_rows=manifest_data.get('atlases') or ([manifest_data.get('atlas')] if manifest_data.get('atlas') else [])
    if atlas_rows and all((manifest_path.parent/str(row.get('file',''))).is_file() for row in atlas_rows if isinstance(row,dict)):
        exact_transform_ids.add(iid)
missing_transform_ids=transform_ids-exact_transform_ids
check(len(transform_ids)==20,'FX active_transform ID count',str(sorted(transform_ids)))
check(len(exact_transform_ids)==7,'FX exact transform atlas count',str(sorted(exact_transform_ids)))
check(len(missing_transform_ids)==13,'FX transform fallback count',str(sorted(missing_transform_ids)))
check(bool(missing_transform_ids) and 'showFallback' in visual_js,'FX missing transform IDs never silently disappear')

# Node matrix report is a release artifact and must prove full parser/consumer coverage.
fx_matrix=load('tools/test_effect_runtime_report_0.9.82FX.json')
check(fx_matrix.get('counts',{}).get('bonusVocabulary')==142,'FX rAthena bonus vocabulary count',str(fx_matrix.get('counts',{}).get('bonusVocabulary')))
check(fx_matrix.get('counts',{}).get('matrixEvaluations')==29360,'FX full effect matrix evaluations',str(fx_matrix.get('counts',{}).get('matrixEvaluations')))
check(fx_matrix.get('matrix',{}).get('runtimeErrors')==0,'FX effect matrix runtime errors',str(fx_matrix.get('matrix',{}).get('runtimeErrors')))
check(not fx_matrix.get('matrix',{}).get('rawBonuses'),'FX effect matrix unhandled commands',str(fx_matrix.get('matrix',{}).get('rawBonuses')))
check(not fx_matrix.get('matrix',{}).get('coverageMissing'),'FX canonical consumer coverage gaps',str(fx_matrix.get('matrix',{}).get('coverageMissing')))
check(fx_matrix.get('summary',{}).get('failed')==0,'FX unified Runtime behavior tests',str(fx_matrix.get('summary')))

# Parse every JSON file.
json_bad=[]
for p in ROOT.rglob('*.json'):
    try: json.loads(p.read_text(encoding='utf-8-sig'))
    except Exception as e: json_bad.append((str(p.relative_to(ROOT)),str(e)))
check(not json_bad,'all JSON parses',repr(json_bad[:5]))

report={
    'version':'0.9.82FX','checks':len(checks),'passed':sum(1 for _,ok,_ in checks if ok),
    'failed':len(errors),'errors':errors,
    'metrics':{'cards':len(cards),'dropSources':sum(len(v) for v in drops.values()),'combos':len(combos),'activeCardDrops':len(active),'itemIcons':icon_count,'effectBonusVocabulary':fx_matrix.get('counts',{}).get('bonusVocabulary'),'effectMatrixEvaluations':fx_matrix.get('counts',{}).get('matrixEvaluations'),'exactTransformAtlases':len(exact_transform_ids),'transformFallbackIds':len(missing_transform_ids)}
}
(ROOT/'tools/test_report_0.9.82FX.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(1 if errors else 0)
