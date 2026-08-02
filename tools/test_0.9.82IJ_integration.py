from pathlib import Path
import json, subprocess, sys, re
ROOT=Path(__file__).resolve().parents[1]
checks={}; errors=[]
def check(name,cond,detail=''):
    checks[name]={'pass':bool(cond),'detail':str(detail)}
    if not cond: errors.append(f'{name}: {detail}')
index=(ROOT/'index.html').read_text(encoding='utf8')
skill=(ROOT/'js/skill_engine.js').read_text(encoding='utf8')
quick=(ROOT/'js/quick_slots.js').read_text(encoding='utf8')
combat=(ROOT/'js/combat_formula_runtime.js').read_text(encoding='utf8')
world=(ROOT/'js/world_monster_test_runtime.js').read_text(encoding='utf8')
sphere=(ROOT/'js/warlock_elemental_sphere_runtime.js').read_text(encoding='utf8')
check('version_title','RO_WEB 0.9.82IJ' in index)
versions=set(re.findall(r'[?&]v=([^&"\']+)',index))
check('cache_bust_only_ij',versions=={'0.9.82IJ'},sorted(versions))
check('sphere_runtime_loaded','warlock_elemental_sphere_runtime.js?v=0.9.82IJ' in index)
check('sphere_after_skill_engine',index.find('skill_engine.js')<index.find('warlock_elemental_sphere_runtime.js'))
check('sphere_before_status',index.find('warlock_elemental_sphere_runtime.js')<index.find('status_system.js'))
for token in ['elemental_sphere_summon','tetra_vortex','elemental_release']:
    check('quick_dispatch_'+token,token in quick)
check('tetra_precast_four','requiredElementalSphereCount' in skill and '元素球不足' in skill)
check('release_precast_one','requiredElementalSphereCountAtLevel2' in skill and '元素球不足' in skill)
check('max_five_guard','元素球已達 5 顆上限' in skill)
check('five_discards_oldest','if(spheres.length===5)spheres.shift()' in sphere)
check('tetra_newest_first','slice(-4).reverse()' in sphere)
check('tetra_200ms','hitIntervalMs||200' in sphere)
check('sphere_death_cleanup','Number(p.hp||0)<=0' in sphere)
check('violent_identity_override','COELACANTH_H_A' in combat and 'return 2190' in combat)
check('mutant_identity_override','COELACANTH_H_M' in combat and 'return 2189' in combat)
check('violent_mode_authority','identity===2190' in combat and "key==='IgnoreMelee'||key==='IgnoreRanged'||key==='Mvp'" in combat)
check('mutant_mode_authority','identity===2189' in combat and "key==='IgnoreMagic'||key==='Mvp'" in combat)
check('spawn_combat_id','combatMonsterId: authoritativeMonsterId' in world)
# Data records
core=json.loads((ROOT/'data/skills/skills_core_1.json').read_text(encoding='utf8'))['skills']
runtime=json.loads((ROOT/'data/skill_runtime/runtime_generated_all.json').read_text(encoding='utf8'))['skills']
expected={'2217':'tetra_vortex','2222':'elemental_sphere_summon','2223':'elemental_sphere_summon','2224':'elemental_sphere_summon','2229':'elemental_sphere_summon','2230':'elemental_release'}
for sid,handler in expected.items():
    check('core_handler_'+sid,core[sid].get('runtimeHandler')==handler,core[sid].get('runtimeHandler'))
    check('core_effect_handler_'+sid,core[sid].get('effectRuntime',{}).get('handler')==handler,core[sid].get('effectRuntime'))
    check('runtime_handler_'+sid,runtime[sid].get('handler')==handler,runtime[sid].get('handler'))
    check('runtime_enabled_'+sid,runtime[sid].get('executionEnabled') is True,runtime[sid].get('executionEnabled'))
check('old_holy_formula_removed','renewal_tetra_vortex_holy' not in json.dumps(core['2217'],ensure_ascii=False))
check('tetra_requires_four',runtime['2217']['runtimeProfile'].get('requiredElementalSphereCount')==4)
check('tetra_consumes_four',runtime['2217']['runtimeProfile'].get('consumeElementalSphereCount')==4)
check('tetra_sp_cost',runtime['2217']['runtimeProfile'].get('spCost')==[120,150,180,210,240,200,240,280,320,360])
for sid in ['2222','2223','2224','2229']:
    p=runtime[sid]['runtimeProfile']
    check('summon_rule_'+sid,p.get('summonAmount')==[1,5] and p.get('replaceAllAtLevel')==2 and p.get('durationMs')==[120000,160000],p)
check('release_partial_declared',runtime['2230'].get('implementationMode')=='official_partial')
# Syntax and executable tests
for rel in ['js/warlock_elemental_sphere_runtime.js','js/combat_formula_runtime.js','js/world_monster_test_runtime.js','js/skill_engine.js','js/quick_slots.js']:
    r=subprocess.run(['node','--check',str(ROOT/rel)],capture_output=True,text=True)
    check('syntax_'+Path(rel).stem,r.returncode==0,r.stderr)
for test in ['tools/test_warlock_spheres_coelacanth_0.9.82IJ.js','tools/test_0.9.82II_runtime_recovery.js','tools/test_hotfix_0.9.82II.js','tools/test_skill_effect_runtime_0.9.82II.js']:
    r=subprocess.run(['node',str(ROOT/test)],capture_output=True,text=True,timeout=60)
    check('run_'+Path(test).stem,r.returncode==0,(r.stdout+r.stderr)[-3000:])
result={'version':'0.9.82IJ','pass':not errors,'checks':checks,'errors':errors,'summary':{'passed':sum(v['pass'] for v in checks.values()),'total':len(checks)}}
(ROOT/'TEST_REPORT_0.9.82IJ_INTEGRATION.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(result,ensure_ascii=False,indent=2));sys.exit(0 if result['pass'] else 1)
