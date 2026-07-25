#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
import hashlib, json, re, sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = Path('/mnt/data/world90_extract')
EXPECTED = [
    ('prontera_3x3_region_camera','普隆德拉地區','prontera_3x3',1,9),
    ('geffen_3x3_region_camera','吉芬地區','geffen_3x3',10,18),
    ('morocc_3x3_region_camera','夢羅克地區','morocc_3x3',19,27),
    ('mjolnir_3x3_region_camera','妙勒尼山脈','mjolnir_3x3',28,36),
    ('rachel_3x3_region_camera','拉赫地區','rachel_3x3',37,45),
    ('payon_3x3_region_camera','斐揚地區','payon_3x3',46,54),
    ('juno_3x3_region_camera','朱諾地區','juno_3x3',55,63),
    ('umbala_3x3_region_camera','汶巴拉地區','umbala_3x3',64,72),
    ('lighthouse_coast_3x3_region_camera','燈塔海邊地區','lighthouse_coast_3x3',73,81),
    ('veins_3x3_region_camera','菲音斯地區','veins_3x3',82,90),
]

def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()

def source_file(n: int) -> Path:
    hits = list(SOURCE_ROOT.rglob(f'{n:03d}.webp'))
    if len(hits) != 1:
        raise AssertionError(f'source {n:03d}.webp count={len(hits)}')
    return hits[0]

def check(cond, msg):
    if not cond:
        raise AssertionError(msg)

maps = json.loads((ROOT/'data/maps.json').read_text(encoding='utf-8-sig'))
manifest = json.loads((ROOT/'data/world_region_manifest.json').read_text(encoding='utf-8-sig'))
check(len(maps) == 10, f'map count {len(maps)} != 10')
check(manifest.get('regionCount') == 10, 'manifest regionCount != 10')
check(manifest.get('version') == '0.9.82EH', 'manifest version mismatch')

map_by_id = {m['id']: m for m in maps}
check(len(map_by_id) == 10, 'duplicate map ids')
all_runtime_tiles = []
for order,(mid,name,folder,start,end) in enumerate(EXPECTED,1):
    m = map_by_id.get(mid)
    check(m is not None, f'missing map {mid}')
    check(m.get('name') == name and m.get('displayName') == name, f'name mismatch {mid}')
    check(m.get('regionOrder') == order, f'order mismatch {mid}')
    check(m.get('sourceChunkRange') == f'{start:03d}-{end:03d}', f'range mismatch {mid}')
    check(m.get('worldCamera') is True, f'worldCamera false {mid}')
    check(m.get('worldScale') == 3, f'worldScale mismatch {mid}')
    check((m.get('worldWidth'),m.get('worldHeight')) == (4608,4608), f'world size mismatch {mid}')
    check((m.get('cameraWidth'),m.get('cameraHeight')) == (1280,720), f'camera mismatch {mid}')
    check((m.get('playerWorldWidth'),m.get('playerWorldHeight')) == (240,320), f'player scale mismatch {mid}')
    check(m.get('spawnPoint') == {'x':2304,'y':2304}, f'spawn mismatch {mid}')
    check(m.get('monsters') == [] and m.get('noMonster') is True, f'monsters not deferred {mid}')
    grid=m.get('chunkGrid') or {}
    check((grid.get('cols'),grid.get('rows'),grid.get('tileSize')) == (3,3,512), f'grid mismatch {mid}')
    check((grid.get('displayScale'),grid.get('displayTileSize')) == (3,1536), f'display scale mismatch {mid}')
    tiles=grid.get('sourceTiles') or []
    check(len(tiles)==9, f'tile count mismatch {mid}')
    for local_idx,(ref,src_num) in enumerate(zip(tiles,range(start,end+1)),1):
        rp=ROOT/ref
        check(rp.is_file(), f'missing runtime tile {ref}')
        check(Image.open(rp).size == (512,512), f'tile dimensions {ref}')
        check(rp.name == f'{local_idx:03d}.webp', f'local tile name mismatch {ref}')
        check(sha(rp) == sha(source_file(src_num)), f'tile bytes differ source {src_num:03d} -> {ref}')
        all_runtime_tiles.append(ref)
    bg=ROOT/m['background']; thumb=ROOT/m['thumb']
    check(bg.is_file() and Image.open(bg).size==(1536,1536), f'background invalid {mid}')
    check(thumb.is_file() and Image.open(thumb).size==(320,320), f'thumb invalid {mid}')
    # Composite must visually match the 3x3 source tiles. WebP is lossy, so use mean absolute channel error.
    stitched=Image.new('RGB',(1536,1536))
    for i,ref in enumerate(tiles):
        tile=Image.open(ROOT/ref).convert('RGB')
        stitched.paste(tile,((i%3)*512,(i//3)*512))
    actual=Image.open(bg).convert('RGB')
    diff=ImageChops.difference(stitched,actual)
    mean=sum(ImageStat.Stat(diff).mean)/3
    check(mean < 2.5, f'composite visual mismatch {mid}: mean error {mean:.3f}')

check(len(set(all_runtime_tiles)) == 90, 'runtime tile paths are not unique')
check(manifest.get('namingDecision',{}).get('runtime') == '斐揚地區', 'Payon naming decision missing')
check('RO_世界地圖.png' in manifest.get('deploymentExcludes',[]), 'world reference exclusion missing')
for forbidden in ['RO_世界地圖.png','RO世界地圖切割前原圖.zip']:
    check(not list(ROOT.rglob(forbidden)), f'forbidden original included: {forbidden}')

index=(ROOT/'index.html').read_text(encoding='utf-8')
versions=set(re.findall(r'[?&]v=([^"&]+)',index))
check(versions == {'0.9.82EH'}, f'cache versions {versions}')
bundle=(ROOT/'js/data_bundle.js').read_text(encoding='utf-8')
for mid,_,_,_,_ in EXPECTED:
    check(mid in bundle, f'bundle missing {mid}')
check('data/world_region_manifest.json' in bundle, 'bundle missing world manifest')
map_js=(ROOT/'js/map.js').read_text(encoding='utf-8')
check('dest.kind === "field"' in map_js and 'changeMap(dest.id)' in map_js, 'field travel UI dispatch missing')
check('地圖已建置｜怪物待配置' in map_js, 'deferred monster map UI state missing')

print(json.dumps({
    'version':'0.9.82EH',
    'regions':10,
    'tiles':90,
    'worldSize':[4608,4608],
    'cameraSize':[1280,720],
    'worldScale':3,
    'monstersDeferred':True,
    'cacheVersions':sorted(versions),
    'status':'PASS'
},ensure_ascii=False,indent=2))
