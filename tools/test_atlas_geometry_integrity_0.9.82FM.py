#!/usr/bin/env python3
from pathlib import Path
import json, math, struct, sys
ROOT=Path(__file__).resolve().parents[1]
errors=[]

def image_size(path: Path):
    data=path.read_bytes()
    if data.startswith(b'\x89PNG\r\n\x1a\n') and len(data)>=24:
        return struct.unpack('>II',data[16:24])
    if len(data)>=30 and data[:4]==b'RIFF' and data[8:12]==b'WEBP':
        ctype=data[12:16]; payload=data[20:]
        if ctype==b'VP8X' and len(payload)>=10:
            return (1+int.from_bytes(payload[4:7],'little'),1+int.from_bytes(payload[7:10],'little'))
        if ctype==b'VP8L' and len(payload)>=5 and payload[0]==0x2f:
            b1,b2,b3,b4=payload[1:5]
            return (1+(((b2&0x3f)<<8)|b1),1+(((b4&0x0f)<<10)|(b3<<2)|((b2&0xc0)>>6)))
        if ctype==b'VP8 ':
            marker=payload.find(b'\x9d\x01\x2a')
            if marker>=0 and marker+7<=len(payload):
                w,h=struct.unpack('<HH',payload[marker+3:marker+7]); return (w&0x3fff,h&0x3fff)
    raise ValueError('unsupported image header')

character_atlases=character_frames=0
for p in (ROOT/'assets/characters').rglob('*.json'):
    d=json.loads(p.read_text(encoding='utf-8'))
    if d.get('schema')!='ro_web_packed_character_atlas': continue
    character_atlases+=1
    img=p.parent/str(d.get('image') or '')
    try: iw,ih=image_size(img)
    except Exception as e: errors.append(f'{p.relative_to(ROOT)} image: {e}'); continue
    atlas=d.get('atlas') or {}
    if (atlas.get('width'),atlas.get('height'))!=(iw,ih): errors.append(f'{p.relative_to(ROOT)} atlas/image dimension mismatch')
    for motion,fs in (d.get('frame_sets') or {}).items():
        declared=(fs or {}).get('frameCount')
        for direction,rows in ((fs or {}).get('directions') or {}).items():
            if declared is not None and len(rows)!=declared: errors.append(f'{p.relative_to(ROOT)} {motion}/{direction} frame count')
            for i,row in enumerate(rows):
                character_frames+=1; r=row.get('region') or {}
                vals=[r.get('x'),r.get('y'),r.get('w'),r.get('h'),row.get('offsetX'),row.get('offsetY')]
                if any(not isinstance(v,(int,float)) or not math.isfinite(v) for v in vals):
                    errors.append(f'{p.relative_to(ROOT)} {motion}/{direction}/{i} invalid number'); continue
                x,y,w,h=vals[:4]
                if x<0 or y<0 or w<=0 or h<=0 or x+w>iw or y+h>ih: errors.append(f'{p.relative_to(ROOT)} {motion}/{direction}/{i} outside atlas')

monsters=json.loads((ROOT/'data/monsters.json').read_text(encoding='utf-8'))
seen=set(); monster_jsons=monster_frames=0
for m in monsters:
    p=ROOT/m['animationJson']
    if p in seen: continue
    seen.add(p); monster_jsons+=1
    d=json.loads(p.read_text(encoding='utf-8'))
    dims={}
    for a in d.get('atlases') or ([d.get('atlas')] if d.get('atlas') else []):
        q=p.parent/a['file']
        try: dims[int(a.get('index',0))]=image_size(q)
        except Exception as e: errors.append(f'{p.relative_to(ROOT)} atlas image: {e}'); continue
        if (a.get('width'),a.get('height'))!=dims[int(a.get('index',0))]: errors.append(f'{p.relative_to(ROOT)} atlas dimension mismatch')
    ids=set()
    for f in d.get('frames') or []:
        monster_frames+=1; ids.add(f.get('id')); idx=int(f.get('atlas',0)); iw,ih=dims.get(idx,(0,0))
        vals=[f.get('x'),f.get('y'),f.get('width'),f.get('height')]
        if any(not isinstance(v,(int,float)) or not math.isfinite(v) for v in vals): errors.append(f'{p.relative_to(ROOT)} frame {f.get("id")} invalid number'); continue
        x,y,w,h=vals
        if x<0 or y<0 or w<=0 or h<=0 or x+w>iw or y+h>ih: errors.append(f'{p.relative_to(ROOT)} frame {f.get("id")} outside atlas')

maps=json.loads((ROOT/'data/maps.json').read_text(encoding='utf-8'))
map_tiles=0
for row in maps:
    tiles=(row.get('chunkGrid') or {}).get('sourceTiles') or []
    if len(tiles)!=9: errors.append(f'{row.get("id")} tile count {len(tiles)}')
    for ref in tiles:
        map_tiles+=1
        try: size=image_size(ROOT/ref)
        except Exception as e: errors.append(f'{ref}: {e}'); continue
        if size!=(512,512): errors.append(f'{ref}: {size} != (512,512)')
    for key,expected in (('background',(1536,1536)),('thumb',(320,320))):
        try:size=image_size(ROOT/row[key])
        except Exception as e: errors.append(f'{row.get(key)}: {e}'); continue
        if size!=expected: errors.append(f'{row[key]}: {size} != {expected}')

result={'version':'0.9.82FM','status':'PASS' if not errors else 'FAIL','characterAtlases':character_atlases,'characterFrames':character_frames,'monsterAtlases':monster_jsons,'monsterFrames':monster_frames,'mapTiles':map_tiles,'errors':errors}
print(json.dumps(result,ensure_ascii=False,indent=2))
sys.exit(1 if errors else 0)
