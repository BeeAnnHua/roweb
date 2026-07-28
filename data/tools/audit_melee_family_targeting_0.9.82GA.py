#!/usr/bin/env python3
"""Audit five melee job families against the 0.9.82GA unified targeting rules."""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = "0.9.82GA"
FAMILIES = {
    "Knight": ["knight", "knight2", "lord_knight", "lord_knight2", "rune_knight", "rune_knight2", "dragon_knight", "dragon_knight2"],
    "Crusader": ["crusader", "crusader2", "paladin", "paladin2", "royal_guard", "royal_guard2", "imperial_guard", "imperial_guard2"],
    "Assassin": ["assassin", "assassin_cross", "guillotine_cross", "shadow_cross"],
    "Rogue": ["rogue", "stalker", "shadow_chaser", "abyss_chaser"],
    "Blacksmith": ["blacksmith", "whitesmith", "mechanic", "mechanic2", "meister", "meister2"],
}
ATTACK_HANDLERS = {
    "physical_attack", "physical_attack_size_hits", "physical_attack_formula", "physical_charge",
    "magic_multihit", "magic_damage", "misc_damage", "ground_damage", "chain_magic", "combo_sequence",
}

def load(rel: str):
    return json.loads((ROOT / rel).read_text(encoding="utf-8"))

def level_value(value, level=5, fallback=0):
    if isinstance(value, list):
        if value and isinstance(value[0], dict):
            rows=[]
            for row in value:
                if not isinstance(row,dict): continue
                lv=int(row.get("Level",row.get("level",1)))
                area=row.get("Area",row.get("area",row.get("Value",row.get("value",fallback))))
                try: rows.append((lv,float(area)))
                except Exception: pass
            rows.sort()
            found=[v for lv,v in rows if lv<=level]
            return found[-1] if found else (rows[0][1] if rows else fallback)
        if not value: return fallback
        idx=max(0,min(len(value)-1,level-1))
        try: return float(value[idx])
        except Exception: return fallback
    try: return float(value)
    except Exception: return fallback

def skill_ids_for_tree(tree: str):
    data=load(f"data/skill_trees/{tree}.json")
    ids=[]
    for row in data.get("skills",[]):
        try:
            ids.append(int(row.get("id",row.get("skillId"))) if isinstance(row,dict) else int(row))
        except Exception:
            pass
    return ids

def main():
    core_raw=load("data/skills/skills_core_1.json")["skills"]
    core={int(k):v for k,v in core_raw.items()}
    runtime_raw=load("data/skill_runtime/runtime_generated_all.json")["skills"]
    runtime={int(v.get("skillId",v.get("id",0))):v for v in (runtime_raw.values() if isinstance(runtime_raw,dict) else runtime_raw)}
    result={
        "version": VERSION,
        "policy": {
            "selfOriginRangeCheck": False,
            "targetOriginRangeCheck": True,
            "officialSplashArea": "authoritative minimum radius for circle/square AoE",
            "autoBattleAttackSlots": "round-robin 1->2->3->4",
        },
        "families": {},
        "focusSkills": {},
        "issues": [],
    }
    for family,trees in FAMILIES.items():
        ids=sorted(set(i for t in trees for i in skill_ids_for_tree(t)))
        rows=[]
        counters={"attackSkills":0,"selfCentered":0,"selfDirectional":0,"targetedAoE":0,"groundAoE":0,"singleTarget":0,"officialSplashExpanded":0}
        for sid in ids:
            s=core.get(sid)
            r=runtime.get(sid,{})
            if not s: continue
            p=r.get("runtimeProfile") or r.get("formula") or s.get("runtimeProfile") or {}
            handler=str(r.get("handler") or (p.get("handler") if isinstance(p,dict) else "") or s.get("runtimeHandler") or "").lower()
            if handler not in ATTACK_HANDLERS: continue
            counters["attackSkills"]+=1
            level=min(5,max(1,int(s.get("maxLevel",5) or 5)))
            splash=max(0,level_value(s.get("splashArea",p.get("splashRange") if isinstance(p,dict) else 0),level,0))
            targeting=(p.get("targeting") if isinstance(p,dict) else None)
            expanded=False
            if isinstance(targeting,dict) and targeting:
                origin=str(targeting.get("origin","target")).lower()
                shape=str(targeting.get("shape","circle")).lower()
                radius=max(0,level_value(targeting.get("radius",targeting.get("rangeCells",0)),level,0))
                if shape in ("circle","square") and splash>radius:
                    radius=splash; expanded=True
            elif splash>0:
                origin="self" if str(s.get("targetType","")).lower()=="self" else "target"
                shape="circle"; radius=splash
            else:
                origin="ground" if str(s.get("targetType","")).lower()=="ground" else "target"
                shape="single"; radius=0
            if expanded: counters["officialSplashExpanded"]+=1
            if origin=="self":
                if shape in ("line","directed_line","cone","sector"):
                    counters["selfDirectional"]+=1; cls="self_directional"
                else:
                    counters["selfCentered"]+=1; cls="self_centered"
            elif origin=="ground":
                counters["groundAoE"]+=1; cls="ground_aoe"
            elif radius>0 or shape not in ("single",""):
                counters["targetedAoE"]+=1; cls="targeted_aoe"
            else:
                counters["singleTarget"]+=1; cls="single_target"
            rows.append({
                "id":sid,"name":s.get("name"),"handler":handler,"class":cls,
                "targetType":s.get("targetType"),"origin":origin,"shape":shape,"radiusAtAuditLevel":radius,
                "officialSplashAtAuditLevel":splash,"officialSplashExpanded":expanded,
                "requiresTargetRange": origin not in ("self",),
            })
            explicit_target_required = bool(isinstance(p,dict) and p.get("requiresPrimaryTarget") is True) or s.get("requiresPrimaryTarget") is True
            if str(s.get("targetType","")).lower()=="self" and origin=="target" and not explicit_target_required:
                result["issues"].append({"family":family,"id":sid,"name":s.get("name"),"issue":"Self skill still has target-origin runtime without explicit target requirement"})
        result["families"][family]={"trees":trees,"summary":counters,"skills":rows}

    for sid in [7,214,406,2005,2006,2280,2317,2319,2320,2321,2323,5265,5295,6004]:
        s=core.get(sid); r=runtime.get(sid,{})
        if not s: continue
        p=r.get("runtimeProfile") or r.get("formula") or {}
        result["focusSkills"][str(sid)]={
            "name":s.get("name"),"targetType":s.get("targetType"),"splashArea":s.get("splashArea"),
            "runtimeTargeting":p.get("targeting") if isinstance(p,dict) else None,
        }
    result["status"]="PASS" if not result["issues"] else "REVIEW"
    out=ROOT / "tools" / "melee_family_targeting_audit_0.9.82GA.json"
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"version":VERSION,"status":result["status"],"issues":len(result["issues"]),"families":{k:v["summary"] for k,v in result["families"].items()}},ensure_ascii=False,indent=2))
    return 0 if result["status"]=="PASS" else 1

if __name__=="__main__":
    raise SystemExit(main())
