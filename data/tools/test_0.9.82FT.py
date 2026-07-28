from pathlib import Path
from PIL import Image
import json,re,sys
ROOT=Path(__file__).resolve().parents[1]
errors=[]; checks=[]
def ok(cond,msg):
    checks.append((bool(cond),msg))
    if not cond: errors.append(msg)

# version/index/UI
html=(ROOT/'index.html').read_text(encoding='utf-8')
ok('0.9.82FT' in html,'index cache/version updated')
ok(html.count('id="right-hud-shell"')==1,'right HUD shell exists once')
ok(html.count('id="rightHudCollapseToggle"')==1,'collapse toggle exists once')
ok(html.count('id="autoBattleQuickToggle"')==1,'standalone auto battle button exists once')
quick=re.search(r'<div id="quick-buttons">(.*?)</div>',html,re.S)
ok(bool(quick),'quick button container found')
if quick:
    ok(len(re.findall(r'<button\b',quick.group(1)))==9,'quick button group contains exactly nine feature buttons')
    ok('autoBattleQuickToggle' not in quick.group(1),'auto battle button is outside quick button group')
ui=(ROOT/'js/ui.js').read_text(encoding='utf-8')
ok('function toggleRightHudCollapse' in ui and 'RO_WEB_RIGHT_HUD_STORAGE_KEY' in ui,'collapsible HUD runtime exists')
css=(ROOT/'css/style.css').read_text(encoding='utf-8')
ok('RO_WEB 0.9.82FT — independent挂机 button + collapsible right HUD' in css,'FT HUD CSS marker exists')
ok('#right-hud-shell.is-collapsed #rightHudCollapsible' in css,'collapsed HUD CSS exists')
ok('#autoBattleQuickToggle.auto-battle-standalone' in css,'standalone auto button CSS exists')

# death recovery behavior
battle=(ROOT/'js/battle.js').read_text(encoding='utf-8')
for token in ['RO_WEB_AUTO_BATTLE_RESUME_PENDING','keepResumePending: true','HP 已恢復，自動掛機繼續運作','setTimeout(() => startAutoBattle(), 80)']:
    ok(token in battle,f'death auto-resume token present: {token}')

# maps / tile sharing
maps=json.loads((ROOT/'data/maps.json').read_text(encoding='utf-8'))
byid={m['id']:m for m in maps}
ids=['einbech_mine_normal_3x3_region_camera','illusion_teddy_bear_3x3_region_camera','abyss_einbech_mine_3x3_region_camera']
for mid in ids: ok(mid in byid,f'map exists: {mid}')
if all(mid in byid for mid in ids):
    tile_sets={byid[mid].get('tileSetId') for mid in ids}
    backgrounds={byid[mid].get('background') for mid in ids}
    thumbs={byid[mid].get('thumb') for mid in ids}
    tile_lists={tuple(byid[mid]['chunkGrid']['sourceTiles']) for mid in ids}
    ok(tile_sets=={'einbech_mine_118_126_shared'},'three maps share one tileSetId')
    ok(len(backgrounds)==1 and len(thumbs)==1 and len(tile_lists)==1,'three maps share exact same physical image paths')
    ok(len(next(iter(tile_lists)))==9,'shared tile set contains nine tiles')
    for p in next(iter(tile_lists)): ok((ROOT/p).is_file(),f'tile exists: {p}')
    ok((ROOT/next(iter(backgrounds))).is_file(),'shared background exists')
    ok((ROOT/next(iter(thumbs))).is_file(),'shared thumbnail exists')

manifest=json.loads((ROOT/'data/world_region_manifest.json').read_text(encoding='utf-8'))
ok(manifest.get('version')=='0.9.82FT','manifest version')
ok(manifest.get('regionCount')==17,'manifest logical map count 17')
ok(manifest.get('physicalTileSetCount')==14,'manifest physical tile set count 14')
ok(set(manifest.get('tileSets',{}).get('einbech_mine_118_126_shared',{}).get('logicalMapIds',[]))==set(ids),'manifest records three logical maps on one tile set')

# spawn config / monster records / animation assets
spawn=json.loads((ROOT/'data/monster_spawn_config.json').read_text(encoding='utf-8'))
for mid in ids: ok(mid in spawn.get('regions',{}),f'spawn profile exists: {mid}')
expected={
 ids[0]:{1614,1615,1616,1617,1618,1619,1620,1621,1622,1623},
 ids[1]:{20255,20256,20257,20258,20259,20260,20261,20262,20263},
 ids[2]:{20592,20593,20594,20595,20596,20597,20598,20600,20601,20602,20603},
}
mons=json.loads((ROOT/'data/monsters.json').read_text(encoding='utf-8'))
monby={int(m['id']):m for m in mons}
for mapid,mids in expected.items():
    ok(set(byid[mapid]['monsters'])==mids,f'{mapid} monster pool matches expected RA set')
    pool={int(x['monsterId']) for x in spawn['regions'][mapid]['pool']}
    ok(pool==mids,f'{mapid} spawn pool matches map monster list')
    for mobid in mids:
        ok(mobid in monby,f'monster record exists: {mobid}')
        if mobid in monby:
            for rel in [monby[mobid].get('animationJson'),monby[mobid].get('animationAtlas')]:
                ok(bool(rel) and (ROOT/rel).is_file(),f'monster animation asset exists: {mobid} {rel}')
# generated green mineral should actually be greener than red on nontransparent pixels
try:
    im=Image.open(ROOT/'assets/monsters/animations/20594/20594.png').convert('RGBA')
    px=[(r,g,b) for r,g,b,a in im.getdata() if a>0]
    ar=sum(r for r,g,b in px)/len(px); ag=sum(g for r,g,b in px)/len(px)
    ok(ag>ar,'generated 20594 atlas is green-dominant')
except Exception as e: ok(False,f'green mineral atlas decode: {e}')

# bundle parity for key entries
text=(ROOT/'js/data_bundle.js').read_text(encoding='utf-8')
prefix='window.RO_WEB_DATA = '
ok(text.startswith(prefix),'data bundle prefix')
try:
    bundle=json.loads(text[len(prefix):].strip().rstrip(';'))
    for rel in ['data/maps.json','data/monsters.json','data/monster_spawn_config.json','data/world_region_manifest.json']:
        ok(rel in bundle,f'bundle contains {rel}')
        if rel in bundle:
            disk=json.loads((ROOT/rel).read_text(encoding='utf-8-sig'))
            ok(bundle[rel]==disk,f'bundle matches disk: {rel}')
except Exception as e: ok(False,f'data bundle parse: {e}')

# validate all project JSON
for p in ROOT.rglob('*.json'):
    try: json.loads(p.read_text(encoding='utf-8-sig'))
    except Exception as e: ok(False,f'JSON parse failed {p.relative_to(ROOT)}: {e}')

print(json.dumps({'version':'0.9.82FT','checks':len(checks),'passed':sum(1 for x,_ in checks if x),'errors':errors},ensure_ascii=False,indent=2))
sys.exit(1 if errors else 0)
