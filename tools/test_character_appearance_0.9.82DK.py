#!/usr/bin/env python3
"""Forward-compatible DK family regression for packed character schema."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'data/character_atlas_manifest.json').read_text(encoding='utf-8'))
jobs=json.loads((ROOT/'data/jobs.json').read_text(encoding='utf-8'))
expected_groups=['acolyte','arch_bishop','archer','bard','cardinal','dancer','hunter','hyper_novice','inquisitor','minstrel','monk','novice','priest','ranger','super_novice','sura','troubadour','trouvere','wanderer','windhawk']
for group in expected_groups:
    gdir=ROOT/'assets/characters'/group
    assert gdir.is_dir(),group
    for gender_dir in [p for p in gdir.iterdir() if p.is_dir()]:
        key=f'{group}_{gender_dir.name}'
        row=manifest['characters'][key]
        mp=row.get('motion_map') or row['motions_json']; mm=json.loads((ROOT/mp).read_text(encoding='utf-8'))
        v=mm['variants']['on_foot']; assert v['hurt']==v['dead']
        dead=json.loads((ROOT/v['dead']).read_text(encoding='utf-8'))
        assert dead['frame_sets']['hurt']['frameCount']==3
        assert dead['frame_sets']['dead']['frameCount']==4
        for ref in [row['idle_image'],mp,v['idle'],v['walk'],v['cast'],v['dead'],*v['attack'].values()]:
            assert (ROOT/ref).is_file(),ref
for job in ['archer','archer_high','hunter','sniper','ranger','windhawk','bard','clown','minstrel','troubadour','dancer','gypsy','wanderer','trouvere']:
    assert jobs[job].get('appearanceAssetStatus')=='ready',job
# Cross-gender aliases were removed when the official gender lock was restored.
for key in ['bard_female','minstrel_female','troubadour_female','dancer_male','wanderer_male','trouvere_male']:
    assert key not in manifest['characters'],key
rt=(ROOT/'js/player_atlas_runtime.js').read_text(encoding='utf-8')
for token in ['getROStudioMotionDefinition','getROStudioPackedFrame','frame_sets','flipX']:
    assert token in rt,token
print(f"PASS DK forward regression: {len(manifest['characters'])} packed manifest entries")
