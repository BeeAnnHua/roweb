#!/usr/bin/env python3
from pathlib import Path
import json, struct, zlib, sys
ROOT=Path(__file__).resolve().parents[1]

def validate_png(path):
    data=path.read_bytes()
    if not data.startswith(b'\x89PNG\r\n\x1a\n'): raise ValueError('invalid PNG signature')
    pos=8; idat=[]; iend=False
    while pos < len(data):
        if pos+12>len(data): raise ValueError(f'truncated chunk header at {pos}')
        length=struct.unpack('>I',data[pos:pos+4])[0]; ctype=data[pos+4:pos+8]; end=pos+12+length
        if end>len(data): raise ValueError(f'truncated {ctype!r}')
        payload=data[pos+8:pos+8+length]
        stored=struct.unpack('>I',data[pos+8+length:end])[0]
        actual=zlib.crc32(ctype); actual=zlib.crc32(payload,actual)&0xffffffff
        if stored!=actual: raise ValueError(f'bad {ctype.decode("latin1")} CRC')
        if ctype==b'IDAT': idat.append(payload)
        if ctype==b'IEND':
            iend=True
            if end!=len(data): raise ValueError('trailing bytes after IEND')
            break
        pos=end
    if not iend: raise ValueError('missing IEND')
    if not idat: raise ValueError('missing IDAT')
    zlib.decompress(b''.join(idat))

def validate_webp(path):
    data=path.read_bytes()
    if len(data)<12 or data[:4]!=b'RIFF' or data[8:12]!=b'WEBP': raise ValueError('invalid WebP header')
    declared=struct.unpack('<I',data[4:8])[0]+8
    if declared!=len(data): raise ValueError(f'RIFF length {declared} != {len(data)}')

errors=[]; counts={'png':0,'webp':0}; total=0
for p in ROOT.rglob('*'):
    if not p.is_file() or p.suffix.lower() not in ('.png','.webp'): continue
    counts[p.suffix.lower()[1:]]+=1; total+=p.stat().st_size
    try: validate_png(p) if p.suffix.lower()=='.png' else validate_webp(p)
    except Exception as e: errors.append(f'{p.relative_to(ROOT)}: {e}')
result={'version':'0.9.82FM','status':'PASS' if not errors else 'FAIL','counts':counts,'bytes':total,'errors':errors}
print(json.dumps(result,ensure_ascii=False,indent=2))
sys.exit(1 if errors else 0)
