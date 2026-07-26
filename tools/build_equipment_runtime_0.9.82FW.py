#!/usr/bin/env python3
from __future__ import annotations
import json,re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/'data/items/database_manifest.json'
OUT=ROOT/'data/card_runtime/equipment_effects.json'
COMMANDS={
    'bonus','bonus2','bonus3','bonus4','bonus5','skill','autobonus','autobonus2','autobonus3',
    'sc_start','heal','showscript','specialeffect2','active_transform'
}

def transform_script(src:str)->str:
    src=src or ''
    src=re.sub(r'/\*.*?\*/\s*\)?', '', src, flags=re.S)
    src=re.sub(r'\.\@([A-Za-z_]\w*)', r'v.\1', src)
    out=[]; i=0; n=len(src)
    while i<n:
        ch=src[i]
        if ch in ('"',"'"):
            q=ch; j=i+1; esc=False
            while j<n:
                c=src[j]
                if esc: esc=False
                elif c=='\\': esc=True
                elif c==q: j+=1; break
                j+=1
            out.append(src[i:j]); i=j; continue
        if ch.isalpha() or ch=='_':
            m=re.match(r'[A-Za-z_]\w*',src[i:]); word=m.group(0); j=i+len(word)
            if word in COMMANDS and (j>=n or src[j]!='('):
                k=j; quote=None; esc=False; depth=0
                while k<n:
                    c=src[k]
                    if quote:
                        if esc: esc=False
                        elif c=='\\': esc=True
                        elif c==quote: quote=None
                    else:
                        if c in ('"',"'"): quote=c
                        elif c in '([': depth+=1
                        elif c in ')]': depth=max(0,depth-1)
                        elif c==';' and depth==0: break
                    k+=1
                args=src[j:k].strip()
                parts=[]; start=0; quote=None; esc=False; dep=0
                for idx,c in enumerate(args):
                    if quote:
                        if esc: esc=False
                        elif c=='\\': esc=True
                        elif c==quote: quote=None
                    else:
                        if c in ('"',"'"): quote=c
                        elif c in '([{': dep+=1
                        elif c in ')]}': dep=max(0,dep-1)
                        elif c==',' and dep==0:
                            parts.append(args[start:idx].strip()); start=idx+1
                parts.append(args[start:].strip())
                if word.startswith('bonus') and parts and re.fullmatch(r'[A-Za-z_]\w*',parts[0]): parts[0]=json.dumps(parts[0])
                elif word in {'skill','sc_start','active_transform'} and parts and re.fullmatch(r'[A-Za-z_]\w*',parts[0]): parts[0]=json.dumps(parts[0])
                out.append(f'{word}({", ".join(parts)})')
                if k<n and src[k]==';': out.append(';'); k+=1
                i=k; continue
            out.append(word); i=j; continue
        out.append(ch); i+=1
    return ''.join(out)

manifest=json.loads(MANIFEST.read_text(encoding='utf-8'))
records={}
paths=[]
for rel in manifest.get('allDataPaths',[]):
    if not (rel.startswith('data/equipment/') or rel=='data/items/monster_drops_0_9_82EI.json'):
        continue
    p=ROOT/rel
    if p.exists(): paths.append(p)

for p in paths:
    data=json.loads(p.read_text(encoding='utf-8-sig'))
    rows=data.values() if isinstance(data,dict) else data
    for item in rows:
        if not isinstance(item,dict) or str(item.get('type','')).lower()!='equipment':
            continue
        raw=str(item.get('scriptRaw') or item.get('Script') or item.get('script') or '')
        if not raw.strip():
            continue
        iid=int(item.get('id') or item.get('officialId') or item.get('Id') or 0)
        if iid<=0: continue
        records[str(iid)]={
            'id':iid,
            'name':str(item.get('name') or item.get('Name') or iid),
            'aegisName':item.get('aegisName') or item.get('AegisName'),
            'scriptRaw':raw,
            'compiledScript':transform_script(raw),
            'sourcePath':p.relative_to(ROOT).as_posix(),
            'sourceType':'equipment'
        }

OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps(dict(sorted(records.items(),key=lambda kv:int(kv[0]))),ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(json.dumps({'version':'0.9.82FW','equipmentScripts':len(records),'output':OUT.relative_to(ROOT).as_posix()},ensure_ascii=False))
