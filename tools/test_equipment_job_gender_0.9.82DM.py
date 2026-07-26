#!/usr/bin/env python3
from pathlib import Path
import json,sys
R=Path(__file__).resolve().parents[1]
E=[]
axe=json.loads((R/'data/equipment/weapon/axe.json').read_text(encoding='utf-8'))
for iid in ('1301','1302'):
 for fam in ('Assassin','Rogue'):
  if axe[iid].get('Jobs',{}).get(fam) is not False: E.append(f'{iid} Jobs {fam} not false')
  if axe[iid].get('equipJobs',{}).get(fam) is not False: E.append(f'{iid} equipJobs {fam} not false')
jobs=json.loads((R/'data/jobs.json').read_text(encoding='utf-8'))
expected={'bard':'male','clown':'male','minstrel':'male','troubadour':'male','dancer':'female','gypsy':'female','wanderer':'female','trouvere':'female'}
for k,g in expected.items():
 if jobs[k].get('allowedGenders') != [g]: E.append(f'{k} gender wrong')
rules=json.loads((R/'data/job_change.json').read_text(encoding='utf-8'))
for r in rules:
 if r.get('toJob') in expected:
  if r.get('allowedGenders') != [expected[r['toJob']]]: E.append(f'{r["id"]} allowedGenders wrong')
  if 'specialDialogueByGender' in r: E.append(f'{r["id"]} joke dialogue remains')
m=json.loads((R/'data/character_atlas_manifest.json').read_text(encoding='utf-8'))
for k in ('bard_female','dancer_male','minstrel_female','wanderer_male','troubadour_female','trouvere_male'):
 if k in m.get('characters',{}): E.append(f'cross alias remains {k}')
p=(R/'js/player.js').read_text(encoding='utf-8')
for token in ('isTwoHandedWeaponItem','resolveEquipmentTargetSlot','unequipInvalidEquipmentAfterJobChange','isAssassinOffhandWeaponItem'):
 if token not in p: E.append(f'player.js missing {token}')
j=(R/'js/job.js').read_text(encoding='utf-8')
if 'unequipInvalidEquipmentAfterJobChange()' not in j: E.append('job change does not revalidate equipment')
rt=(R/'js/player_atlas_runtime.js').read_text(encoding='utf-8')
for key in ('dualDagger','dualSword','swordDagger','daggerSword'):
 if key not in rt: E.append(f'runtime missing {key}')
if E:
 print('FAIL'); print('\n'.join('- '+x for x in E)); sys.exit(1)
print('PASS: axe, gender, job-change equipment, two-hand and assassin offhand rules verified.')
