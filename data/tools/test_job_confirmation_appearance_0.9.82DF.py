#!/usr/bin/env python3
"""Forward-compatible regression for DF confirmation + acolyte appearance rules."""
import json, pathlib
root=pathlib.Path(__file__).resolve().parents[1]
jobs=json.loads((root/'data/jobs.json').read_text(encoding='utf-8'))
routes=json.loads((root/'data/job_change.json').read_text(encoding='utf-8'))
manifest=json.loads((root/'data/character_atlas_manifest.json').read_text(encoding='utf-8'))
expected={'acolyte','priest','monk','arch_bishop','sura','cardinal','inquisitor'}
assert jobs['high_novice']['appearanceGroup']=='novice'
assert jobs['acolyte_high']['appearanceGroup']=='acolyte'
assert jobs['high_priest']['appearanceGroup']=='priest'
assert jobs['champion']['appearanceGroup']=='monk'
for g in expected:
    for sex in ('male','female'):
        key=f'{g}_{sex}'; assert key in manifest['characters'],key
        e=manifest['characters'][key]
        assert (root/e['idle_image']).is_file(),e['idle_image']
        mp=e.get('motion_map') or e.get('motions_json'); assert mp and (root/mp).is_file(),mp
        mm=json.loads((root/mp).read_text(encoding='utf-8')); v=mm['variants']['on_foot']
        for path in [v['idle'],v['walk'],v['hurt'],v['dead'],v['cast'],*v['attack'].values()]:
            assert (root/path).is_file(),path
        assert v['hurt']==v['dead']
        assert 'fist' in v['attack']
for r in routes:
    assert r.get('requiresFinalConfirmation') is True,r['id']
    assert r.get('selectionMode'),r['id']
# Official gender lock is the current rule.
assert jobs['bard'].get('allowedGenders')==['male']
assert jobs['dancer'].get('allowedGenders')==['female']
# Every pre-rebirth second job resolves to exactly one advanced second job.
seconds=[k for k,v in jobs.items() if v.get('routeGroup')=='second']
for origin in seconds:
    family=jobs[origin]['family']
    high_first=[k for k,v in jobs.items() if v.get('routeGroup')=='high_first' and v.get('family')==family]
    assert len(high_first)==1,(origin,high_first)
    visible=[r for r in routes if r.get('fromJob')==high_first[0] and r.get('requiredRebirthOrigin')==origin]
    assert len(visible)==1,(origin,visible)
print('PASS DF confirmation/appearance audit: 7 groups / 14 packed characters')
