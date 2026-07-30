#!/usr/bin/env python3
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
expected_10000={k:10000 for k in ['baseExp','jobExp','drop','zeny','cardDrop','mapExclusiveDrop','gradeMaterialDropRate']}
config=json.loads((ROOT/'data/server_config.json').read_text(encoding='utf-8'))
rates=config['server']['rates']
assert config['version']=='0.9.82HS',config.get('version')
for key,value in expected_10000.items(): assert rates.get(key)==value,(key,rates.get(key))
assert rates.get('gradeMaterialDropChanceBasisPoints')==500,rates
text=(ROOT/'js/data_bundle.js').read_text(encoding='utf-8')
needle='"data/server_config.json":'; start=text.index(needle)+len(needle)
bundled,_=json.JSONDecoder().raw_decode(text[start:])
assert bundled['version']=='0.9.82HS',bundled.get('version')
assert bundled['server']['rates']==rates,(bundled['server']['rates'],rates)
print(json.dumps({'version':'0.9.82HS','passed':3,'failed':0,'rates':rates,'gradeMaterialPolicy':'absolute 500/10000; legacy multiplier ignored'},ensure_ascii=False,indent=2))
