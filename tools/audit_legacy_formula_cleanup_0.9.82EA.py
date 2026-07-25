#!/usr/bin/env python3
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[1]
prod=[p for p in (ROOT/'js').glob('*.js') if p.name!='data_bundle.js']
text='\n'.join(p.read_text(encoding='utf-8') for p in prod)
checks={
 'legacyHitPlus80':len(re.findall(r'\+\s*80\s*\)?\s*/\s*100',text)),
 'legacyAspdApproximation':len(re.findall(r'2000\s*-\s*\([^\n]*ASPD[^\n]*150[^\n]*45',text,re.I)),
 'legacy32pxCellFallback':len(re.findall(r'RO_WEB_CELL_SIZE\s*\|\|\s*32',text)),
 'playerHitsMonsterCalls':len(re.findall(r'playerHitsMonster\s*\(',text)),
 'monsterHitsPlayerCalls':len(re.findall(r'monsterHitsPlayer\s*\(',text)),
 'calculatePlayerDamageCalls':len(re.findall(r'calculatePlayerDamage\s*\(',text)),
 'calculateMonsterDamageCalls':len(re.findall(r'calculateMonsterDamage\s*\(',text)),
}
allowed_south={'js/player.js'}
south=[]
scan_roots=[ROOT/'js',ROOT/'data',ROOT/'css',ROOT/'index.html',ROOT/'docs/map_settings.txt']
for base in scan_roots:
    candidates=[base] if base.is_file() else base.rglob('*')
    for p in candidates:
        if not p.is_file():continue
        if p.name=='data_bundle.js':continue
        if p.suffix.lower() not in {'.js','.json','.html','.css','.txt','.md'}:continue
        try:s=p.read_text(encoding='utf-8')
        except UnicodeDecodeError:continue
        if 'prontera_south' in s:
            rel=p.relative_to(ROOT).as_posix()
            if rel not in allowed_south:south.append(rel)
maps=json.loads((ROOT/'data/maps.json').read_text(encoding='utf-8'))
default=json.loads((ROOT/'data/player_default.json').read_text(encoding='utf-8'))
result={
 'version':'0.9.82EA','ruleset':'rAthena Renewal','status':'PASS',
 'formulaAuthority':{
  'normalAttack':'CombatDamagePipeline.resolveNormalAttack','physicalSkill':'CombatDamagePipeline.resolvePhysicalSkill',
  'magicSkill':'CombatDamagePipeline.resolveMagicSkill','miscSkill':'CombatDamagePipeline.resolveMiscSkill',
  'monsterAttack':'CombatDamagePipeline.resolveMonsterAttack','modifiers':'CombatFormulaRuntime.applyDamage',
  'hit':'HitResolver','critical':'CriticalResolver','defense':'DefenseResolver'},
 'legacyFormulaFindings':checks,
 'mapCleanup':{'fieldMapCount':len(maps),'fieldMapIds':[m.get('id') for m in maps],'defaultMap':default.get('map'),'defaultLastFieldMap':default.get('lastFieldMap'),'unexpectedSouthReferences':south,
 'backgroundExists':(ROOT/'images/maps/backgrounds/prontera_south_bg.webp').exists(),'thumbExists':(ROOT/'images/maps/thumbs/prontera_south_small.webp').exists()},
 'allowedMigrationReference':'js/player.js: RO_WEB_REMOVED_FIELD_MAP_IDS'
}
errors=[]
if any(checks.values()):errors.append('legacy formula pattern remains')
if len(maps)!=1 or maps[0].get('id')!='mjolnir_3x3_region_camera':errors.append('field map cleanup mismatch')
if default.get('map')!='mjolnir_3x3_region_camera' or default.get('lastFieldMap')!='mjolnir_3x3_region_camera':errors.append('default map migration mismatch')
if south:errors.append('unexpected removed-map references remain')
if result['mapCleanup']['backgroundExists'] or result['mapCleanup']['thumbExists']:errors.append('removed map assets remain')
if errors:result['status']='FAIL';result['errors']=errors
out=ROOT/'tools/legacy_formula_cleanup_audit_0.9.82EA.json';out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'version':result['version'],'status':result['status'],'legacyFormulaFindings':checks,'fieldMapCount':len(maps),'unexpectedSouthReferences':south},ensure_ascii=False,indent=2))
raise SystemExit(0 if not errors else 1)
