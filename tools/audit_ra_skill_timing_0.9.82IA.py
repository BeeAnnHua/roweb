#!/usr/bin/env python3
from __future__ import annotations
import json, pathlib, sys, yaml

ROOT = pathlib.Path(__file__).resolve().parents[1]
RA = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path('/mnt/data/ra_extract/rathena-master/db/re/skill_db.yml')
OUT = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'tools/ra_skill_timing_audit_0.9.82IA.json'
FIELDS = {
    'CastTime': 'castTime',
    'FixedCastTime': 'fixedCastTime',
    'AfterCastActDelay': 'afterCastActDelay',
    'AfterCastWalkDelay': 'afterCastWalkDelay',
    'Cooldown': 'cooldown',
    'CastTimeFlags': 'castTimeFlags',
    'CastDelayFlags': 'castDelayFlags',
}

def norm(value):
    # JSON and YAML both preserve the RA flag object shape. Normalizing dict key
    # order is enough for deterministic comparison; missing remains None.
    if isinstance(value, dict):
        return {str(k): norm(v) for k, v in sorted(value.items(), key=lambda kv: str(kv[0]))}
    if isinstance(value, list):
        return [norm(v) for v in value]
    return value

ra_doc = yaml.safe_load(RA.read_text(encoding='utf-8'))
ra = {int(r['Id']): r for r in ra_doc.get('Body', []) if 'Id' in r}
skills = {}
for rel in ('data/skills/skills_core_1.json', 'data/skills/skills_core_2.json'):
    doc = json.loads((ROOT / rel).read_text(encoding='utf-8'))
    skills.update({int(k): v for k, v in doc['skills'].items()})

errors = []
counts = {v: 0 for v in FIELDS.values()}
zero_counts = {v: 0 for v in FIELDS.values()}
flag_skill_ids = {'castTimeFlags': [], 'castDelayFlags': []}
for sid, skill in sorted(skills.items()):
    row = ra.get(sid)
    if not row:
        errors.append({'skillId': sid, 'code': 'RA_SKILL_MISSING'})
        continue
    for ra_key, web_key in FIELDS.items():
        expected = norm(row.get(ra_key, None))
        actual = norm(skill.get(web_key, None))
        if expected != actual:
            errors.append({
                'skillId': sid,
                'code': 'TIMING_MISMATCH',
                'field': web_key,
                'expected': expected,
                'actual': actual,
            })
        if expected is not None:
            counts[web_key] += 1
            if web_key in flag_skill_ids:
                flag_skill_ids[web_key].append(sid)
        else:
            zero_counts[web_key] += 1

result = {
    'version': '0.9.82IA',
    'renewalOnly': True,
    'source': str(RA),
    'skillCount': len(skills),
    'matchedRaSkills': len(skills) - sum(1 for e in errors if e['code'] == 'RA_SKILL_MISSING'),
    'fieldPresentCounts': counts,
    'fieldDefaultZeroCounts': zero_counts,
    'flagSkillIds': flag_skill_ids,
    'errors': errors,
    'summary': {'status': 'PASS' if not errors else 'FAIL', 'errors': len(errors)},
}
OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
raise SystemExit(0 if not errors else 1)
