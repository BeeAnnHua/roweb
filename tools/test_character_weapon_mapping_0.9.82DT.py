#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
EXPECTED={
 ('swordman','male'): {'axe','dagger','fist','mace','spear','sword'},
 ('swordman','female'): {'axe','dagger','fist','mace','spear','sword'},
 ('archer','male'): {'bow','dagger','fist'},
 ('archer','female'): {'bow','dagger','fist'},
}
errors=[]
for (job,gender),expected in EXPECTED.items():
 p=ROOT/f'assets/characters/{job}/{gender}/motions.json'
 d=json.loads(p.read_text(encoding='utf-8'))
 attacks=d['variants']['on_foot']['attack']
 got=set(attacks)
 if got!=expected: errors.append(f'{job}/{gender}: {sorted(got)} != {sorted(expected)}')
 hashes={}
 for weapon,rel in attacks.items():
  jp=ROOT/rel
  data=json.loads(jp.read_text(encoding='utf-8'))
  png=jp.parent/data['image']
  if not png.is_file(): errors.append(f'{job}/{gender}/{weapon}: missing {png}')
  else: hashes[weapon]=hashlib.sha256(png.read_bytes()).hexdigest()
 if len(set(hashes.values()))!=len(hashes):
  rev={}
  for k,v in hashes.items(): rev.setdefault(v,[]).append(k)
  duplicates=[v for v in rev.values() if len(v)>1]
  errors.append(f'{job}/{gender}: duplicate attack PNGs {duplicates}')
result={'version':'0.9.82DT','status':'PASS' if not errors else 'FAIL','checked':len(EXPECTED),'errors':errors}
print(json.dumps(result,ensure_ascii=False,indent=2))
raise SystemExit(0 if not errors else 1)
