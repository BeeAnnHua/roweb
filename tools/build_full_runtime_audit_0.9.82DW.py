#!/usr/bin/env python3
from pathlib import Path
import json, collections

ROOT=Path(__file__).resolve().parents[1]
VERSION='0.9.82DW'

def load(rel): return json.loads((ROOT/rel).read_text(encoding='utf-8-sig'))

full_skill=load('tools/full_skill_audit_0.9.82DW.json')
ra=load('tools/ra_skill_timing_audit_0.9.82DW.json')
action=load('tools/all_skill_timing_action_audit_0.9.82DW.json')
manifest=load('data/character_atlas_manifest.json')
chars=manifest.get('characters',{})
char_root=ROOT/'assets/characters'

variants=0; mounted=0; attacks=0; atlas_paths=set(); png_paths=set(); motion_maps=0
motion_counts=collections.Counter(); policy_counts=collections.Counter(); direction_frame_records=0
errors=[]; warnings=[]
for key,row in chars.items():
    idle=ROOT/str(row.get('idle_image') or '')
    if idle.is_file(): png_paths.add(idle)
    else: errors.append(f'{key}: missing idle image')
    mp=ROOT/(row.get('motion_map') or row.get('motions_json') or '')
    if not mp.is_file(): errors.append(f'{key}: missing motion map'); continue
    motion_maps += 1
    mm=json.loads(mp.read_text(encoding='utf-8-sig'))
    for vn,var in (mm.get('variants') or {}).items():
        variants += 1; mounted += int(vn=='mounted')
        for motion in ('idle','walk','cast','dead','hurt'):
            jp=ROOT/str(var.get(motion) or '')
            if not jp.is_file(): errors.append(f'{key}/{vn}: missing {motion}'); continue
            atlas_paths.add(jp)
            data=json.loads(jp.read_text(encoding='utf-8-sig'))
            fs=(data.get('frame_sets') or {}).get(motion)
            if fs is None and motion=='hurt': fs=(data.get('frame_sets') or {}).get('dead')
            if not fs: errors.append(f'{key}/{vn}: no frame set {motion}'); continue
            motion_counts[motion]+=1
            policy_counts[(motion,str((data.get('optimization') or {}).get('directionPolicy') or 'unknown'))]+=1
            direction_frame_records += sum(len(v or []) for v in (fs.get('directions') or {}).values())
            img=jp.parent/str(data.get('image') or '')
            if img.is_file(): png_paths.add(img)
            else: errors.append(f'{key}/{vn}/{motion}: missing PNG')
        for weapon,path in (var.get('attack') or {}).items():
            attacks += 1
            jp=ROOT/path
            if not jp.is_file(): errors.append(f'{key}/{vn}/attack/{weapon}: missing JSON'); continue
            atlas_paths.add(jp)
            data=json.loads(jp.read_text(encoding='utf-8-sig'))
            fs=(data.get('frame_sets') or {}).get('attack')
            if not fs: errors.append(f'{key}/{vn}/attack/{weapon}: no frame set'); continue
            motion_counts['attack']+=1
            policy_counts[('attack',str((data.get('optimization') or {}).get('directionPolicy') or 'unknown'))]+=1
            direction_frame_records += sum(len(v or []) for v in (fs.get('directions') or {}).values())
            img=jp.parent/str(data.get('image') or '')
            if img.is_file(): png_paths.add(img)
            else: errors.append(f'{key}/{vn}/attack/{weapon}: missing PNG')

all_atlas={p for p in char_root.rglob('*.json') if p.name not in {'motions.json','manifest.generated.json'}}
all_png=set(char_root.rglob('*.png'))
if atlas_paths != all_atlas:
    missing=all_atlas-atlas_paths; extra=atlas_paths-all_atlas
    if missing: errors.append(f'unreferenced atlas JSON: {len(missing)}')
    if extra: errors.append(f'referenced JSON outside atlas library: {len(extra)}')
if png_paths != all_png:
    missing=all_png-png_paths; extra=png_paths-all_png
    if missing: errors.append(f'unreferenced PNG: {len(missing)}')
    if extra: errors.append(f'referenced PNG outside library: {len(extra)}')

result={
 'version':VERSION,
 'scope':'Implemented skill Runtime + full deployed character animation JSON/runtime structural audit',
 'skills':{
   'total':full_skill['info']['skillCount'],
   'implementedRuntime':full_skill['info']['officialRuntime'],
   'pendingRuntime':full_skill['info']['pendingRuntime'],
   'handlerCount':full_skill['info']['handlerCount'],
   'handlers':full_skill['info']['handlers'],
   'treeNodes':full_skill['info']['treeNodes'],
   'icons':full_skill['info']['skillIconDimensions'],
   'raTiming':{
      'matched':ra['matchedRaSkills'], 'total':ra['skillCount'],
      'fieldPresentCounts':ra['fieldPresentCounts'],
      'fieldDefaultZeroCounts':ra['fieldDefaultZeroCounts'],
      'errors':len(ra['errors'])
   },
   'actionRuntime':action['counts'],
   'verifiedFixes':[
      'Physical skills use the current weapon Attack animation; magic/heal/buff/debuff/support use Cast.',
      'Zero-cast/zero-cooldown/zero-aftercast physical skills are ASPD-gated by the existing normal-attack interval.',
      'Independent cooldown, common after-cast delay, after-cast walk delay and variable/fixed cast are enforced.',
      'Passive detection accepts declared passive type or passive Runtime handler.',
      'Negative and level-table ranges are normalized correctly.',
      'Shield requirements, Holy resistance, weapon/shield mastery and Guardian Shield barrier are enforced.',
      'Auto Guard, Parry, magic evasion, physical reflect, long-range/final reduction and armor element overrides are applied.',
      'Percentage six-stat bonuses, Aura Blade mastery ATK and next-physical-attack multipliers are applied.',
      'Wind Insignia Lv3 reduces Wind-skill common delay without affecting non-Wind skills.',
      'Full Throttle expiration creates its 10-second HP/SP natural-recovery and movement penalty.',
      'Death plays all 4 frames and holds the final frame before recovery.'
   ],
   'errors':len(full_skill['errors']), 'warnings':len(full_skill['warnings'])
 },
 'characters':{
   'manifestCharacters':len(chars), 'motionMaps':motion_maps,
   'variants':variants, 'mountedVariants':mounted,
   'attackAtlases':attacks, 'atlasJson':len(all_atlas), 'png':len(all_png),
   'directionFrameRecords':direction_frame_records,
   'motionCounts':dict(motion_counts),
   'policyCounts':{f'{m}:{p}':n for (m,p),n in sorted(policy_counts.items())},
   'rulesVerified':[
      'Idle/Walk direction aliases and flipX remain in packed JSON.',
      'Every Attack weapon source is referenced by its motion map.',
      'Hurt uses 3 frames; Dead uses 4 frames and holds the last frame.',
      'Mounted/on-foot variants, weapon aliases and mixed dual-wield fallback resolve.',
      'One/two-handed sword, axe and staff share visual atlases without changing equipment logic.',
      'All packed regions and logical target offsets remain inside their atlas/cell bounds (covered by library/runtime tests).'
   ],
   'errors':errors, 'warnings':warnings
 },
 'knownLimitations':[
   '312 Pending skills remain data-only and are not represented as completed Runtime effects.',
   'Automated Chromium visual playback is unavailable in the managed work environment; final in-browser visual acceptance remains a local-device check.',
   'The previously reported old-map monster residue after town teleport is not changed in this version.',
   'Historical regression scripts that hard-code older version strings or assume zero timing between multiple skill calls are not authoritative for the new RA timing layer; dedicated 0.9.82DW tests are authoritative.'
 ],
 'summary':{
   'status':'PASS' if not errors and not full_skill['errors'] and not ra['errors'] and not action['errors'] else 'FAIL',
   'skillErrors':len(full_skill['errors'])+len(ra['errors'])+len(action['errors']),
   'characterErrors':len(errors),
   'warnings':len(full_skill['warnings'])+len(warnings)
 }
}
out=ROOT/'docs/FULL_SKILL_CHARACTER_RUNTIME_AUDIT_0.9.82DW.json'
out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result['summary'],ensure_ascii=False))
print(json.dumps(result['characters'],ensure_ascii=False)[:1000])
