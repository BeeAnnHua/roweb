#!/usr/bin/env python3
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
expected={k:10000 for k in ['baseExp','jobExp','drop','zeny','cardDrop','mapExclusiveDrop','gradeMaterialDropRate']}
config=json.loads((ROOT/'data/server_config.json').read_text(encoding='utf-8'))
assert config['version']=='0.9.82HN',config.get('version')
assert config['server']['rates']==expected,config['server']['rates']
text=(ROOT/'js/data_bundle.js').read_text(encoding='utf-8')
needle='"data/server_config.json":'; start=text.index(needle)+len(needle)
bundled,_=json.JSONDecoder().raw_decode(text[start:])
assert bundled['version']=='0.9.82HN',bundled.get('version')
assert bundled['server']['rates']==expected,bundled['server']['rates']
print(json.dumps({'version':'0.9.82HN','passed':2,'failed':0,'rates':expected},ensure_ascii=False,indent=2))
