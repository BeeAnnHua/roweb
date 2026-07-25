#!/usr/bin/env python3
"""Forward-compatible mage-family appearance regression."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'data/character_atlas_manifest.json').read_text(encoding='utf-8'))
jobs=json.loads((ROOT/'data/jobs.json').read_text(encoding='utf-8'))
groups=['arch_mage','elemental_master','mage','sage','sorcerer','warlock','wizard']
job_keys=['mage','mage_high','wizard','high_wizard','warlock','arch_mage','sage','professor','sorcerer','elemental_master']
for key in job_keys: assert jobs[key].get('appearanceAssetStatus')=='ready',key
expected_map={'mage':'mage','mage_high':'mage','wizard':'wizard','high_wizard':'wizard','warlock':'warlock','arch_mage':'arch_mage','sage':'sage','professor':'sage','sorcerer':'sorcerer','elemental_master':'elemental_master'}
for key,group in expected_map.items(): assert jobs[key].get('appearanceGroup')==group
for group in groups:
    for gender in ('male','female'):
        key=f'{group}_{gender}'; row=manifest['characters'][key]
        mp=row.get('motion_map') or row['motions_json']; mm=json.loads((ROOT/mp).read_text(encoding='utf-8'))
        v=mm['variants']['on_foot']; aliases=mm.get('weaponAliases',{})
        assert v['hurt']==v['dead']
        required=['fist','dagger','staff'] + (['book'] if group in ('sage','sorcerer','elemental_master') else [])
        for wt in required: assert wt in v['attack'],f'{key}:{wt}'
        assert aliases.get('oneHandStaff')=='staff' and aliases.get('twoHandStaff')=='staff'
        dead=json.loads((ROOT/v['dead']).read_text(encoding='utf-8'))
        assert dead['frame_sets']['hurt']['frameCount']==3
        assert dead['frame_sets']['dead']['frameCount']==4
        for ref in [row['idle_image'],mp,v['idle'],v['walk'],v['cast'],v['dead'],*v['attack'].values()]: assert (ROOT/ref).is_file(),ref
print(f"PASS DO forward regression: 14 mage packed character sets; {len(manifest['characters'])} entries")
