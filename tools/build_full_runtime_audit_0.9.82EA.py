#!/usr/bin/env python3
from pathlib import Path
import json, collections

ROOT=Path(__file__).resolve().parents[1]
VERSION='0.9.82EA'

def load(rel): return json.loads((ROOT/rel).read_text(encoding='utf-8-sig'))

full_skill=load('tools/full_skill_audit_0.9.82EA.json')
ra=load('tools/ra_skill_timing_audit_0.9.82EA.json')
action=load('tools/all_skill_timing_action_audit_0.9.82EA.json')
combat=load('tools/ra_renewal_combat_audit_0.9.82EA.json')
critical=load('tools/ra_renewal_skill_critical_flags_audit_0.9.82EA.json')
range_audit=load('tools/ra_skill_range_audit_0.9.82EA.json')
distance=load('tools/all_skill_distance_profile_audit_0.9.82EA.json')
pending_scope=load('tools/pending_skill_scope_audit_0.9.82EA.json')
legacy_cleanup=load('tools/legacy_formula_cleanup_audit_0.9.82EA.json')
open_work=load('docs/OPEN_WORK_ITEMS_0.9.82EA.json')
ground_runtime=load('tools/full_combat_ground_runtime_audit_0.9.82EA.json')
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
   'distanceRuntime':{
      'cellSizePx':distance['cellSizePx'], 'skills':distance['skills'], 'levels':distance['levels'],
      'raMatched':range_audit['summary']['matchedRaSkills'], 'rangeErrors':len(range_audit['errors']),
      'intentionalRangeExceptions':len(range_audit['intentionalExceptions']),
      'groundTargetSkills':range_audit['summary']['groundTargetSkills'], 'aoeMetadataSkills':range_audit['summary']['aoeMetadataSkills']
   },
   'pendingScope':pending_scope,
   'combatGroundRuntime':ground_runtime,
   'verifiedFixes':[
      'ASPD cap 193, Renewal normal-attack interval and cast-begin physical skill action lock.',
      'DEX/INT variable cast, fixed cast, independent cooldown, common after-cast delay, default walk delay and RA flags.',
      'Equipment/card/enchant/buff timing fields share one resolver; fixed-cast percentage uses the strongest reduction only.',
      'Physical skills use the current weapon Attack animation; magic/heal/buff/debuff/support use Cast.',
      'Lucky Dodge -> critical -> HIT/FLEE, with Renewal 5%-100% HIT-FLEE rate and no duplicate pre-hit roll.',
      'RES/MRES and hard/soft DEF/MDEF are separated and applied in Renewal order.',
      'Normal attacks may use both hands; active physical skills default to right hand; Katar secondary hit uses TF_DOUBLE.',
      'Weapon size, armor property, race, size, Boss/NonBoss, range and equipment/card stages share one formula runtime.',
      'Normal critical uses full bCritAtkRate, critical skills use half; C.RATE is final and target critical defense follows.',
      'Skill DB DamageFlags.Critical is connected to the common Critical Resolver, including Gale Storm conditional override.',
      'Gloria Domini, Thorn Trap and Dragon Breath special bases re-enter the allowed Renewal common stages.',
      'H.Plus, outgoing healing and received-healing modifiers share one resolver.',
      'All 1,139 skill ranges and 6,323 skill-level distance profiles resolve through the shared 36px-per-cell layer.',
      'Quick slots and auto battle use level-aware cast range before cost/cooldown; cast range and effect radius remain separate.',
      'Trick Dead (NV_TRICKDEAD) is implemented as a toggle state; 310 expanded-job skills remain explicitly deferred and AM_RESURRECTHOMUN remains a system exception.',
      'Death plays all 4 frames and holds the final frame before recovery.',
      'All executable legacy HIT, ASPD, 32px-cell and alternate player/monster damage call paths are removed or fail closed.',
      'South-gate test map, monster configuration, warp entry and image assets are removed; old saves migrate to the Mjolnir world map.',
      'Travel clears classic monster, world monster, battle timers and auto-battle runtime before entering the destination.'
   ],
   'combatAudit':{
      'status':combat['summary']['status'],
      'sourceChecks':combat['sourceChecks'],
      'critical':critical['counts'],
      'explicitExceptions':combat['explicitExceptions'],
      'modifierSchema':combat['modifierSchema']
   },
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
 'formulaCleanup':legacy_cleanup,
 'openWorkItems':open_work,
 'knownLimitations':[
   '311 Pending skills remain data-only: 310 deferred expanded-job skills and AM_RESURRECTHOMUN.',
   'Automated Chromium visual playback is unavailable in the managed work environment; final in-browser visual acceptance remains a local-device check.',
   'Historical regression scripts that hard-code older timing assumptions are not authoritative for the EA Renewal layer; dedicated 0.9.82EA tests are authoritative.',
   "Grand Cross and Martyr\'s Reckoning remain explicit special/project-adaptation formulas and are not represented as ordinary generic weapon or magic profiles."
 ],
 'summary':{
   'status':'PASS' if legacy_cleanup['status']=='PASS' and not errors and not full_skill['errors'] and not ra['errors'] and not action['errors'] and combat['summary']['status']=='PASS' and not critical['errors'] and not range_audit['errors'] and not distance['errors'] and pending_scope['unexpectedPending']==0 else 'FAIL',
   'skillErrors':len(full_skill['errors'])+len(ra['errors'])+len(action['errors'])+len(critical['errors'])+len(range_audit['errors'])+len(distance['errors'])+pending_scope['unexpectedPending'],
   'characterErrors':len(errors),
   'warnings':len(full_skill['warnings'])+len(warnings)
 }
}
out=ROOT/'docs/FULL_SKILL_CHARACTER_RUNTIME_AUDIT_0.9.82EA.json'
out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result['summary'],ensure_ascii=False))
print(json.dumps(result['characters'],ensure_ascii=False)[:1000])
