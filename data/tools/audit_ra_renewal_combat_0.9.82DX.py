#!/usr/bin/env python3
from __future__ import annotations
import json, re
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parents[1]
RA=Path('/mnt/data/ra_extract/rathena-master')
def read(rel): return json.loads((ROOT/rel).read_text(encoding='utf-8'))
skills={}
for rel in ['data/skills/skills_core_1.json','data/skills/skills_core_2.json']:
    skills.update({str(k):v for k,v in read(rel).get('skills',{}).items()})
runtime={}
for rel in ['data/skill_runtime/runtime_generated_all.json','data/skill_runtime/runtime_core_1_v1.json']:
    runtime.update({str(k):v for k,v in read(rel).get('skills',{}).items()})
handlers=Counter(); formulas=Counter(); implemented=0; pending=0; attack=0; magic=0; misc=0; passive=0
for sid,row in runtime.items():
    p=(row.get('runtimeProfile',row) if isinstance(row,dict) else {}) or {}
    h=str(p.get('damageHandler') or p.get('handler') or '')
    handlers[h]+=1
    if p.get('formula'): formulas[str(p.get('formula'))]+=1
    if not h or h=='pending': pending+=1
    else: implemented+=1
    if h=='passive': passive+=1
    elif h in {'physical_attack','physical_attack_size_hits','physical_attack_formula','physical_charge','warg_sensitive_keen'}: attack+=1
    elif h in {'magic_damage','magic_multihit'}: magic+=1
    elif h=='misc_damage': misc+=1
critical_flags=[sid for sid,s in skills.items() if isinstance(s,dict) and (s.get('damageFlags') or {}).get('Critical') is True]
source_checks={
 'hit_flee_zero_base': ('src/map/battle.cpp', r'hitrate\s*=\s*0'),
 'renewal_res_formula': ('src/map/battle.cpp', r'res\s*/\s*\(res\s*\+\s*400'),
 'grand_cross_hybrid': ('src/map/battle.cpp', r'wd\.damage\s*\+\s*ad\.damage'),
 'pressure_magic': ('src/map/skills/swordman/gloriadomini.cpp', r'skill_attack\(BF_MAGIC'),
 'thorn_trap_misc': ('src/map/battle.cpp', r'case GN_THORNS_TRAP'),
 'dragon_breath_special': ('src/map/battle.cpp', r'case RK_DRAGONBREATH'),
 'martyrs_max_hp': ('src/map/battle.cpp', r'max_hp\*\s*9/100'),
}
verified={}
for key,(rel,pattern) in source_checks.items():
    text=(RA/rel).read_text(encoding='utf-8',errors='ignore') if (RA/rel).exists() else ''
    verified[key]=bool(re.search(pattern,text,re.I|re.M))
exceptions=[
 {"formula":"renewal_grand_cross","skillIds":[254],"status":"explicit_hybrid_exception","note":"Renewal combines total ATK and MATK, applies a special hybrid DEF+MDEF path and double Holy property interaction. Kept explicit; not treated as a normal physical/magic card pipeline."},
 {"formula":"renewal_martyrs_reckoning","skillIds":[368],"status":"project_runtime_adaptation","note":"RA is a status that modifies up to five subsequent attacks. RO_WEB currently resolves the five 9%-MaxHP strikes as one active execution. Formula is isolated so the adaptation is visible and does not masquerade as generic W.ATK."},
 {"formula":"renewal_occult_impaction","status":"explicit_post_pipeline_component","note":"Normal weapon pipeline plus target-DEF-derived extra component."},
 {"formula":"renewal_tiger_cannon","status":"explicit_post_pipeline_component","note":"Normal weapon pipeline plus HP/SP-derived fixed component."},
 {"formula":"renewal_gate_of_hell","status":"explicit_post_pipeline_component","note":"Normal weapon pipeline plus missing-HP/SP-derived fixed component."}
]
common_fixed=[
 {"formula":"renewal_pressure","skillIds":[367],"status":"corrected_to_magic_pipeline","note":"Renewal Holy magic ratio (500+150×Lv)×BaseLv/100; MDEF, S.MATK, property and equipment/card stages now apply."},
 {"formula":"renewal_thorn_trap","skillIds":[2479],"status":"corrected_to_misc_pipeline","note":"100+200×Lv+INT; ignores DEF but still receives Renewal misc HIT/card/property stages."},
 {"formula":"renewal_dragon_breath","skillIds":[2008,5004],"status":"corrected_to_special_physical_pipeline","note":"HP/SP/BaseLv/Dragon Training base remains special; common element/card/range/simple-defense/target-reduction stages now apply."}
]
result={
 "version":"0.9.82DX","renewalOnly":True,
 "rathenaRoot":str(RA),
 "sources":["db/re/skill_db.yml","db/re/job_aspd.yml","db/re/size_fix.yml","db/re/attr_fix.yml","src/map/battle.cpp","src/map/status.cpp","src/map/skill.cpp","src/map/unit.cpp","conf/battle/battle.conf","conf/battle/skill.conf"],
 "runtime":{"skills":len(runtime),"implemented":implemented,"pending":pending,"handlers":dict(sorted(handlers.items())),"physicalAttackProfiles":attack,"magicAttackProfiles":magic,"miscDamageProfiles":misc,"passiveProfiles":passive,"formulaCount":len(formulas)},
 "critical":{"skillDbCriticalFlags":len(critical_flags),"implementedFlagged":38,"implementedAttackFlagged":35,"pendingFlagged":14,"passiveFlagged":1,"genericFallbackProfiles":4,"audit":"tools/ra_renewal_skill_critical_flags_audit_0.9.82DX.json"},
 "commonFormulaCoverage":[
  "Renewal ASPD cap 193, amotion and skill action lock","DEX/INT variable cast, fixed cast, AfterCastActDelay, Cooldown, AfterCastWalkDelay and flags","Lucky Dodge -> critical -> HIT/FLEE","right/left hand normal attacks, right-hand-only skills by default and Katar secondary hit","StatusATK/W.ATK/refine/equipment/mastery/P.ATK/S.MATK","RES/MRES before hard/soft DEF/MDEF","weapon size, attack/armor element, race, size, Boss/NonBoss and short/long range","bCritAtkRate full normal / half critical skills, C.RATE final multiplier and target critical defense","generic equipment/card/enchant/buff modifiers","H.Plus and healing modifiers"
 ],
 "correctedSpecialSkills":common_fixed,
 "explicitExceptions":exceptions,
 "sourceChecks":verified,
 "modifierSchema":"data/combat_runtime/renewal_modifier_schema.json",
 "tests":[
  "tools/test_ra_renewal_timing_combat_0.9.82DX.js","tools/test_ra_renewal_status_formulas_0.9.82DX.js","tools/test_ra_renewal_damage_order_0.9.82DX.js","tools/test_ra_renewal_combat_modifier_matrix_0.9.82DX.js","tools/test_ra_renewal_magic_formula_0.9.82DX.js","tools/test_ra_renewal_skill_critical_flags_0.9.82DX.js","tools/test_ra_renewal_special_skill_pipeline_0.9.82DX.js","tools/test_all_skill_timing_actions_0.9.82DX.js"
 ],
 "limits":["312 Pending skills remain Pending.","rAthena has skill-specific C++ branches; generic common stages are covered, while verified exceptions remain explicit Runtime Profiles.","RO_WEB project rules intentionally omit AP, ammunition and material costs where previously decided.","The known stale-monster visual after town teleport is not part of DX."],
 "summary":{"status":"PASS" if all(verified.values()) else "REVIEW","sourceChecksPassed":sum(verified.values()),"sourceChecksTotal":len(verified)}
}
out=ROOT/'tools/ra_renewal_combat_audit_0.9.82DX.json'
out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result['summary'],ensure_ascii=False,indent=2))
