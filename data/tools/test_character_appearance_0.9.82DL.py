#!/usr/bin/env python3
"""Forward-compatible thief-family appearance regression."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'data/character_atlas_manifest.json').read_text(encoding='utf-8'))
jobs=json.loads((ROOT/'data/jobs.json').read_text(encoding='utf-8'))
groups=['abyss_chaser','assassin','guillotine_cross','rogue','shadow_chaser','shadow_cross','thief']
job_keys=['thief','thief_high','assassin','assassin_cross','guillotine_cross','shadow_cross','rogue','stalker','shadow_chaser','abyss_chaser']
for key in job_keys: assert jobs[key].get('appearanceAssetStatus')=='ready',key
for group in groups:
    for gender in ('male','female'):
        key=f'{group}_{gender}'; row=manifest['characters'][key]
        mp=row.get('motion_map') or row['motions_json']; mm=json.loads((ROOT/mp).read_text(encoding='utf-8'))
        v=mm['variants']['on_foot']; assert v['hurt']==v['dead']
        dead=json.loads((ROOT/v['dead']).read_text(encoding='utf-8'))
        assert dead['frame_sets']['hurt']['frameCount']==3
        assert dead['frame_sets']['dead']['frameCount']==4
        required=('fist','dagger','sword','katar','dual_dagger','dual_sword') if group in ('assassin','guillotine_cross','shadow_cross') else ('fist','dagger','sword','bow')
        for wt in required: assert wt in v['attack'],f'{key}:{wt}'
        for ref in [row['idle_image'],mp,v['idle'],v['walk'],v['cast'],v['dead'],*v['attack'].values()]: assert (ROOT/ref).is_file(),ref
axe=json.loads((ROOT/'data/equipment/weapon/axe.json').read_text(encoding='utf-8'))
for iid in ('1301','1302'):
    assert axe[iid].get('Jobs',{}).get('Assassin') is False
rt=(ROOT/'js/player_atlas_runtime.js').read_text(encoding='utf-8')
assert 'dual_dagger' in rt and 'sworddagger' in rt
print(f"PASS DL forward regression: 14 thief packed character sets; {len(manifest['characters'])} entries")
