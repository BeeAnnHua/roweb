#!/usr/bin/env python3
from __future__ import annotations
import collections, hashlib, json, pathlib, re, struct, sys

VERSION = "0.9.82DY"
ROOT = pathlib.Path(__file__).resolve().parents[1]

def load(rel):
    return json.loads((ROOT / rel).read_text(encoding="utf-8-sig"))

def add(rows, code, message, skill_id=None):
    row={"code":code,"message":message}
    if skill_id is not None: row["skillId"]=int(skill_id)
    rows.append(row)

manifest=load("data/skill_manifest.json")
skills={}
for rel in manifest["cores"]:
    pack=load(rel)
    for sid,row in pack["skills"].items():
        sid=int(sid)
        if sid in skills: raise SystemExit(f"duplicate skill {sid}")
        skills[sid]=row
runtime={int(k):v for k,v in load("data/skill_runtime/runtime_core_1_v1.json")["skills"].items()}
pending={int(x["skillId"]):x for x in load("data/skill_runtime/runtime_pending_review.json")["skills"]}
errors=[]; warnings=[]; info={}

# Coverage / identity / display data.
if len(skills)!=1139: add(errors,"SKILL_COUNT",f"expected 1139, got {len(skills)}")
if len(runtime)!=828: add(errors,"OFFICIAL_RUNTIME_COUNT",f"expected 828, got {len(runtime)}")
if len(pending)!=311: add(errors,"PENDING_COUNT",f"expected 311, got {len(pending)}")
if set(runtime)&set(pending): add(errors,"RUNTIME_OVERLAP",str(sorted(set(runtime)&set(pending))[:20]))
if set(runtime)|set(pending)!=set(skills): add(errors,"RUNTIME_PARTITION","official + pending does not cover Skill Core")

icon_hashes=collections.defaultdict(list); dimensions=collections.Counter(); modes=collections.Counter()
for sid,s in skills.items():
    if int(s.get("id",-1))!=sid or int(s.get("officialId",-1))!=sid: add(errors,"SKILL_ID_MISMATCH",repr((s.get('id'),s.get('officialId'))),sid)
    if not str(s.get("name") or "").strip(): add(errors,"SKILL_NAME_EMPTY","empty name",sid)
    if not isinstance(s.get("maxLevel"),int) or s["maxLevel"]<1: add(errors,"SKILL_MAXLEVEL",repr(s.get('maxLevel')),sid)
    p=ROOT/f"images/skills/{sid}.png"
    if not p.is_file(): add(errors,"SKILL_ICON_MISSING",str(p.relative_to(ROOT)),sid); continue
    raw=p.read_bytes()
    if len(raw)<33 or raw[:8]!=b"\x89PNG\r\n\x1a\n": add(errors,"SKILL_ICON_BAD_PNG",p.name,sid); continue
    w,h,bit_depth,color_type=struct.unpack(">IIBB",raw[16:26])
    dimensions[(w,h)]+=1; modes[(bit_depth,color_type)]+=1
    if (w,h)!=(24,24) or bit_depth!=8 or color_type!=6: add(errors,"SKILL_ICON_FORMAT",f"{w}x{h} bit={bit_depth} colorType={color_type}",sid)
    icon_hashes[hashlib.sha256(raw).hexdigest()].append(sid)

# Runtime handler and formula reachability.
all_js="\n".join(p.read_text(encoding="utf-8") for p in sorted((ROOT/"js").glob("*.js")))
quick=(ROOT/"js/quick_slots.js").read_text(encoding="utf-8")
handlers=collections.Counter(); formulas=collections.Counter(); profile_drifts=[]
formula_fields={"formula","healFormula","successFormula","statusChanceFormula","statusDurationFormula","dynamicHitCountFormula","primaryGateChanceFormula","periodicHealFormula","durationFormula","damageFormula"}

def profile_of(row): return row.get("runtimeProfile") or row

# Player-facing description coverage for every implemented skill.
for sid in sorted(runtime):
    row=skills[sid]; desc=str(row.get("description") or "").strip(); official_desc=str(row.get("officialDescription") or "").strip()
    if not desc: add(errors,"SKILL_DESCRIPTION_EMPTY","empty description",sid)
    if desc!=official_desc: add(errors,"SKILL_DESCRIPTION_MISMATCH","description != officialDescription",sid)
    for token in ("待後續","尚未完成","成本延後","TODO","GroundEffectManager","SkillInfoz","Duration2","HitCount","需求元資料","等待精靈系統","供後續","尚未統一","統一成本系統","統一扣費系統","統一冷卻系統","職業技能補完後","現階段","尚未提供","戰鬥效果將","此版本先完成","初版","暫不","目前不","依使用者決議","製作系統完成後","若未來","共用攔截入口","供怪物主動技能 AI 使用","依官方技能樹加入"):
        if token.lower() in desc.lower(): add(errors,"SKILL_DESCRIPTION_DEV_TEXT",token,sid)

# Final RO_WEB decisions: Warg Rider is passive move speed only; Mado skills remain directly usable.
warg=profile_of(runtime[2241])
if warg.get("handler")!="passive" or warg.get("passiveBonuses",{}).get("moveSpeedRate")!=[10,20,30]: add(errors,"WARG_RIDER_POLICY",repr(warg),2241)
MADO_IDS={2255,2256,2257,2258,2259,2260,2261,2262,2263,2264,2265,2266,2267,2268,2269,2270,2271,2272,2273,2274,2275,6002,6003,6508}
def find_mado_gate(x):
    if isinstance(x,dict):
        for k,v in x.items():
            if k in {"requiresMounted","requiresMado","requiredMountType","requiredState","madoRequired","requiresMadoGear"} and v not in (None,False,"",[],{}): return (k,v)
            found=find_mado_gate(v)
            if found:return found
    elif isinstance(x,list):
        for v in x:
            found=find_mado_gate(v)
            if found:return found
    return None
for sid in sorted(MADO_IDS):
    gate=find_mado_gate(runtime[sid])
    if gate:add(errors,"MADO_STATE_GATE",repr(gate),sid)

def walk_formula(x):
    if isinstance(x,dict):
        for k,v in x.items():
            if k in formula_fields and isinstance(v,str): formulas[v]+=1
            walk_formula(v)
    elif isinstance(x,list):
        for v in x: walk_formula(v)

for sid,row in runtime.items():
    p=profile_of(row); handler=p.get("handler") or row.get("handler")
    if not handler: add(errors,"RUNTIME_HANDLER_EMPTY","no handler",sid); continue
    handlers[handler]+=1
    if handler!="passive" and handler not in quick: add(errors,"HANDLER_NOT_DISPATCHED",handler,sid)
    walk_formula(p)
    core_profile=skills[sid].get("runtimeProfile")
    # Numeric strings are intentional profile pointers in older imported entries.
    if isinstance(core_profile,dict) and core_profile!=p: profile_drifts.append(sid)
for f,n in formulas.items():
    if f not in all_js: add(errors,"FORMULA_NOT_IMPLEMENTED",f"{f} ({n} refs)")
if profile_drifts: add(errors,"CORE_RUNTIME_PROFILE_DRIFT",str(profile_drifts[:30]))

# Targeted per-level invariants discovered by the full audit.
def assert_eq(sid,path,actual,expected):
    if actual!=expected: add(errors,"PER_LEVEL_DATA",f"{path}: expected {expected}, got {actual}",sid)
assert_eq(358,"effects.hpRecoveryRate",profile_of(runtime[358]).get("effects",{}).get("hpRecoveryRate"),200)
assert_eq(2003,"counterRatio",profile_of(runtime[2003]).get("counterRatio"),[600,700,800,900,1000,1100,1200,1300,1400,1500])
assert_eq(2309,"passiveBonuses.atkRate",profile_of(runtime[2309]).get("passiveBonuses",{}).get("atkRate"),[2,4,6])
for sid in (319,320,327,328):
    p=profile_of(runtime[sid])
    duration_table = p.get("statusDuration") if sid == 328 else p.get("duration")
    if duration_table != [30000,60000,90000,120000,150000,180000,210000,240000,270000,300000]: add(errors,"PERFORMANCE_DURATION","duration table mismatch",sid)
    if p.get("sustainedPerformance") is not True or len(p.get("sustainedSpCostPer5s",[]))!=10: add(errors,"PERFORMANCE_SUSTAIN","sustain metadata incomplete",sid)

# Tree prerequisites and max levels.
tree_nodes=0
for rel in manifest["trees"]:
    d=load(rel)
    for node in d.get("skills",[]):
        tree_nodes+=1; sid=int(node["skillId"])
        if sid not in skills: add(errors,"TREE_SKILL_ORPHAN",f"{rel}->{sid}") ; continue
        if node.get("maxLevel") is not None and int(node["maxLevel"])>skills[sid]["maxLevel"]: add(errors,"TREE_MAXLEVEL",f"{rel}: {node['maxLevel']} > {skills[sid]['maxLevel']}",sid)
        for req in node.get("requires",[]):
            rid=int(req.get("id",req.get("officialId",req.get("skillId",-1))))
            lv=int(req.get("level",req.get("requiredLevel",1)))
            if rid not in skills: add(errors,"TREE_PREREQ_ORPHAN",f"{rel}: {sid}->{rid}",sid)
            elif lv>skills[rid]["maxLevel"]: add(errors,"TREE_PREREQ_LEVEL",f"{rel}: needs {rid} Lv{lv}, max {skills[rid]['maxLevel']}",sid)

# Homunculus catalog / AI coverage.
hom=load("data/homunculus/homunculi.json"); hskills=load("data/homunculus/homunculus_skills.json")
defs=hom.get("definitions",{}); hs=hskills.get("skills",{})
if len(defs)!=9: add(errors,"HOMUNCULUS_DEFINITION_COUNT",f"expected 9, got {len(defs)}")
if len(hs)!=58: add(errors,"HOMUNCULUS_SKILL_COUNT",f"expected 58, got {len(hs)}")
status_counts=collections.Counter()
for sid,row in hs.items():
    rp=row.get("runtimeProfile") or {}; status=str(rp.get("runtimeStatus") or row.get("runtimeStatus") or "")
    if "excluded" in status: status_counts["excluded"]+=1
    elif "enabled" in status: status_counts["enabled"]+=1
    else: status_counts["other"]+=1
if status_counts["enabled"]!=53 or status_counts["excluded"]!=5 or status_counts["other"]: add(errors,"HOMUNCULUS_RUNTIME_COVERAGE",repr(dict(status_counts)))
for hid,row in defs.items():
    for sid in row.get("skills",[]):
        skill_id=int(sid.get("skillId") if isinstance(sid,dict) else sid)
        if str(skill_id) not in hs: add(errors,"HOMUNCULUS_SKILL_ORPHAN",f"{hid}->{skill_id}")

# Information only: identical official icons can be legitimate.
dup_groups=[sorted(v) for v in icon_hashes.values() if len(v)>1]
info.update({
    "version":VERSION,"skillCount":len(skills),"officialRuntime":len(runtime),"pendingRuntime":len(pending),
    "handlerCount":len(handlers),"handlers":dict(sorted(handlers.items())),"formulaReferenceCount":len(formulas),
    "treeNodes":tree_nodes,"skillIconDimensions":{f"{k[0]}x{k[1]}":v for k,v in dimensions.items()},
    "skillIconPngModes":{f"bit{k[0]}-type{k[1]}":v for k,v in modes.items()},"identicalIconGroups":dup_groups,
    "homunculusDefinitions":len(defs),"homunculusSkills":len(hs),"homunculusRuntime":dict(status_counts)
})
result={"version":VERSION,"summary":{"status":"PASS" if not errors else "FAIL","errors":len(errors),"warnings":len(warnings)},"info":info,"errors":errors,"warnings":warnings}
out=json.dumps(result,ensure_ascii=False,indent=2)
print(out)
if len(sys.argv)>1: pathlib.Path(sys.argv[1]).write_text(out+"\n",encoding="utf-8")
raise SystemExit(0 if not errors else 1)
