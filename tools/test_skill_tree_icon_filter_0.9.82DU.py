#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
errors = []

def fail(message: str) -> None:
    errors.append(message)

novice = json.loads((ROOT / 'data/skill_trees/novice.json').read_text(encoding='utf-8'))
visible = [int(row['skillId']) for row in novice.get('skills', []) if row.get('exclude') is not True]
excluded = [int(row['skillId']) for row in novice.get('skills', []) if row.get('exclude') is True]
if visible != [1, 142]:
    fail(f'novice visible skills expected [1, 142], got {visible}')
if sorted(excluded) != [143, 410]:
    fail(f'novice excluded skills expected [143, 410], got {excluded}')

job_js = (ROOT / 'js/job.js').read_text(encoding='utf-8')
required_fragments = [
    '.filter(node => node?.exclude !== true).map(node => {',
    'icon: skill?.icon || (officialId !== undefined && officialId !== null ? `images/skills/${officialId}.png` : "")'
]
for fragment in required_fragments:
    if fragment not in job_js:
        fail(f'job.js missing runtime fragment: {fragment}')

manifest = json.loads((ROOT / 'data/skill_manifest.json').read_text(encoding='utf-8'))
checked = 0
for tree_path in manifest.get('trees', []):
    tree = json.loads((ROOT / tree_path).read_text(encoding='utf-8'))
    for node in tree.get('skills', []):
        if node.get('exclude') is True:
            continue
        sid = int(node['skillId'])
        checked += 1
        icon = ROOT / 'images' / 'skills' / f'{sid}.png'
        if not icon.is_file():
            fail(f'missing skill icon for visible tree node: {tree_path} -> {sid}')

result = {
    'version': '0.9.82DU',
    'status': 'PASS' if not errors else 'FAIL',
    'noviceVisible': visible,
    'noviceExcluded': excluded,
    'visibleTreeIconsChecked': checked,
    'errors': errors,
}
print(json.dumps(result, ensure_ascii=False, indent=2))
raise SystemExit(0 if not errors else 1)
