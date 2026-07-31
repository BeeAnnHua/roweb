#!/usr/bin/env python3
from __future__ import annotations
import argparse, collections, json, pathlib, re, shutil, struct, subprocess, sys, zlib
from html.parser import HTMLParser

EXPECTED_VERSION = "0.9.82HX"
KNOWN_MISSING_ITEM_ICONS = set()
DYNAMIC_DOM_IDS = {"autoHpPotionSelect","autoSpPotionSelect","autoHpEnabled","autoHpPercent","autoSpEnabled","autoSpPercent","world-camera-layer","playerAtlasCanvas","position-debug-overlay","position-debug-cross","position-coordinate-ui","basic-skill-info-window","battle-log-new-notice","battle-area","game-tooltip","runtime-skill-cast-bar","status-advanced-panel","autoCombatSettingsScroll","cardTransformCanvas","cardTransformFallback","monster-position-debug-cross","monsterAtlasCanvas","map-monster-distribution-tooltip","roGoldDialogOverlay","roGoldDialogTitle","roGoldDialogMessage","currency-detail-popup"}

class Audit:
    def __init__(self, root): self.root=root; self.errors=[]; self.warnings=[]; self.info={}
    def add(self, level, code, message): getattr(self, level).append({"code":code,"message":message})
    def error(self,c,m): self.add("errors",c,m)
    def warn(self,c,m): self.add("warnings",c,m)
    def load(self, rel):
        p=self.root/rel
        try: return json.loads(p.read_text(encoding="utf-8-sig"))
        except Exception as e: self.error("JSON_PARSE",f"{rel}: {e}"); return None

def main():
    ap=argparse.ArgumentParser(description="RO_WEB deep project health check")
    ap.add_argument("root",nargs="?",default=".")
    ap.add_argument("--json-output")
    args=ap.parse_args(); root=pathlib.Path(args.root).resolve(); a=Audit(root)
    if not (root/"index.html").is_file(): print("Not a RO_WEB project root",file=sys.stderr); return 2

    def dup_hook(pairs):
        d={}; dup=[]
        for k,v in pairs:
            if k in d: dup.append(k)
            d[k]=v
        if dup: d["__RO_DUP_KEYS__"]=dup
        return d

    json_files=sorted(root.rglob("*.json")); a.info["jsonFiles"]=len(json_files)
    for p in json_files:
        try:
            data=json.loads(p.read_text(encoding="utf-8-sig"),object_pairs_hook=dup_hook); stack=[([],data)]
            while stack:
                path,x=stack.pop()
                if isinstance(x,dict):
                    if "__RO_DUP_KEYS__" in x: a.error("JSON_DUP_KEY",f"{p.relative_to(root)} at {path}: {x['__RO_DUP_KEYS__']}")
                    stack += [(path+[k],v) for k,v in x.items() if k!="__RO_DUP_KEYS__"]
                elif isinstance(x,list): stack += [(path+[i],v) for i,v in enumerate(x)]
        except Exception as e: a.error("JSON_PARSE",f"{p.relative_to(root)}: {e}")

    def validate_png(path):
        data=path.read_bytes()
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError("invalid PNG signature")
        pos=8; idat=[]; seen_iend=False; chunks=0
        while pos < len(data):
            if pos + 12 > len(data): raise ValueError(f"truncated PNG chunk header at {pos}")
            length=struct.unpack(">I",data[pos:pos+4])[0]
            ctype=data[pos+4:pos+8]; end=pos+12+length
            if end > len(data): raise ValueError(f"truncated {ctype.decode('latin1')} chunk")
            payload=data[pos+8:pos+8+length]
            stored=struct.unpack(">I",data[pos+8+length:end])[0]
            actual=zlib.crc32(ctype); actual=zlib.crc32(payload,actual)&0xffffffff
            if stored!=actual: raise ValueError(f"bad {ctype.decode('latin1')} CRC")
            chunks+=1
            if ctype==b"IDAT": idat.append(payload)
            if ctype==b"IEND":
                seen_iend=True
                if end!=len(data): raise ValueError("trailing bytes after IEND")
                break
            pos=end
        if not seen_iend: raise ValueError("missing IEND")
        if not idat: raise ValueError("missing IDAT")
        try: zlib.decompress(b"".join(idat))
        except Exception as e: raise ValueError(f"invalid IDAT zlib stream: {e}")
        return chunks

    def validate_webp(path):
        data=path.read_bytes()
        if len(data)<12 or data[:4]!=b"RIFF" or data[8:12]!=b"WEBP": raise ValueError("invalid WebP RIFF header")
        declared=struct.unpack("<I",data[4:8])[0]+8
        if declared!=len(data): raise ValueError(f"WebP RIFF length {declared} != {len(data)}")
        return 1

    binary_counts=collections.Counter(); binary_bytes=0
    for p in sorted(root.rglob("*")):
        if not p.is_file(): continue
        ext=p.suffix.lower()
        if ext not in (".png",".webp"): continue
        binary_counts[ext[1:]]+=1; binary_bytes+=p.stat().st_size
        try:
            validate_png(p) if ext==".png" else validate_webp(p)
        except Exception as e:
            a.error("BINARY_ASSET_INVALID",f"{p.relative_to(root)}: {e}")
    a.info["binaryAssets"]={"counts":dict(binary_counts),"bytes":binary_bytes}

    class HP(HTMLParser):
        def __init__(self): super().__init__(); self.ids=[]; self.refs=[]; self.scripts=[]
        def handle_starttag(self,tag,attrs):
            d=dict(attrs)
            if "id" in d: self.ids.append(d["id"])
            for attr in ("src","href"):
                ref=d.get(attr)
                if ref and not re.match(r"^(?:https?:|data:|#|javascript:)",ref,re.I): self.refs.append((tag,attr,ref))
            if tag=="script" and d.get("src"): self.scripts.append(d["src"])
    h=HP(); h.feed((root/"index.html").read_text(encoding="utf-8"))
    for k,n in collections.Counter(h.ids).items():
        if n>1:a.error("HTML_DUP_ID",f"{k} x{n}")
    versions=[]
    for tag,attr,ref in h.refs:
        rel=ref.split("?")[0].lstrip("./").lstrip("/")
        if rel and not (root/rel).exists():a.error("HTML_MISSING_RESOURCE",f"{tag} {attr}={ref}")
        m=re.search(r"[?&]v=([^&]+)",ref)
        if m:versions.append(m.group(1))
    if set(versions)!={EXPECTED_VERSION}:a.error("CACHE_VERSION",f"Expected only {EXPECTED_VERSION}; found {sorted(set(versions))}")
    a.info.update(htmlIds=len(h.ids),htmlResources=len(h.refs),cacheVersions=sorted(set(versions)))

    loaded=[]; missing_dom=collections.Counter()
    for src in h.scripts:
        rel=src.split("?")[0].lstrip("./").lstrip("/"); p=root/rel
        if p.is_file(): loaded.append(p)
    for p in loaded:
        text=p.read_text(encoding="utf-8")
        names=collections.Counter(re.findall(r"(?m)^\s*function\s+([A-Za-z_$][\w$]*)\s*\(",text))
        for name,n in names.items():
            if n>1:a.warn("JS_DUP_FUNCTION_SAME_FILE",f"{p.relative_to(root)}: {name} x{n} (review scopes)")
        for dom_id in re.findall(r"getElementById\([\"']([^\"']+)[\"']\)",text):
            if dom_id not in set(h.ids) and dom_id not in DYNAMIC_DOM_IDS:missing_dom[dom_id]+=1
    for k,n in missing_dom.items():a.warn("DOM_ID_NOT_STATIC",f"{k} referenced {n}x and not present in static index")
    a.info["loadedScripts"]=len(loaded)

    sm=a.load("data/skill_manifest.json") or {}; im=a.load("data/items/database_manifest.json") or {}
    for field in ("cores","trees","runtimeProfiles","runtimeCatalogs"):
        for rel in sm.get(field,[]) or []:
            if not (root/rel).is_file():a.error("MANIFEST_MISSING",f"{field}: {rel}")
    for field in ("pendingReview","copyableSkills"):
        rel=sm.get(field)
        if rel and not (root/rel).is_file():a.error("MANIFEST_MISSING",f"{field}: {rel}")
    for rel in im.get("allDataPaths",[]):
        if not (root/rel).is_file():a.error("ITEM_MANIFEST_MISSING",rel)

    item_ids={}
    for rel in im.get("allDataPaths",[]):
        d=a.load(rel); rows=d if isinstance(d,list) else ([v for v in d.values() if isinstance(v,dict)] if isinstance(d,dict) else [])
        for row in rows:
            iid=row.get("id",row.get("Id",row.get("officialId")))
            if iid is None:continue
            try:iid=int(iid)
            except Exception:a.warn("ITEM_BAD_ID",f"{rel}: {iid}");continue
            if iid in item_ids:a.error("ITEM_DUP_ID",f"{iid}: {item_ids[iid]} and {rel}")
            item_ids[iid]=rel
            ref=row.get("image") or row.get("icon")
            if ref and not (root/str(ref).split("?")[0].lstrip("./")).is_file():
                code="ITEM_ICON_KNOWN_MISSING" if iid in KNOWN_MISSING_ITEM_ICONS else "ITEM_IMAGE_MISSING"
                a.warn(code,f"{iid}: {ref}")
    a.info["itemIds"]=len(item_ids)

    mons=a.load("data/monsters.json") or []; mids={}
    for m in mons:
        mid=int(m.get("id",m.get("officialId",-1)))
        if mid in mids:a.error("MONSTER_DUP_ID",str(mid))
        mids[mid]=m
        for drop in m.get("drops",[]):
            iid=int(drop.get("itemId",-1))
            if iid not in item_ids:a.error("MONSTER_DROP_ORPHAN",f"{mid}->{iid}")
        for key in ("image","hitImage"):
            ref=m.get(key)
            if ref and not (root/ref).is_file():
                if key == "image" and m.get("useAnimatedAtlas") and m.get("animationAtlas") and (root/m["animationAtlas"]).is_file():
                    continue
                a.warn("MONSTER_IMAGE_MISSING",f"{mid} {ref}")
    a.info["monsters"]=len(mids)

    maps=a.load("data/maps.json") or []; mapids=set()
    for m in maps:
        mid=str(m.get("id"))
        if mid in mapids:a.error("MAP_DUP_ID",mid)
        mapids.add(mid)
        for mon in m.get("monsters",[]):
            try:x=int(mon if not isinstance(mon,dict) else mon.get("id",mon.get("monsterId")))
            except Exception:continue
            if x not in mids:a.error("MAP_MONSTER_ORPHAN",f"{mid}->{x}")
        refs=[m.get("background"),m.get("thumb")]+((m.get("chunkGrid") or {}).get("sourceTiles") or [])
        for ref in filter(None,refs):
            if not (root/ref).is_file():a.error("MAP_ASSET_MISSING",f"{mid}: {ref}")

    cities=a.load("data/cities.json") or []; cityids=set()
    for c in cities:
        cid=str(c.get("id"));
        if cid in cityids:a.error("CITY_DUP_ID",cid)
        cityids.add(cid)
        for key in ("background","thumb"):
            ref=c.get(key)
            if ref and not (root/ref).is_file():a.error("CITY_ASSET_MISSING",f"{cid}: {ref}")
    shops=a.load("data/shops.json") or {}; shopids=set(shops)
    for sid,s in shops.items():
        for row in s.get("items",[]):
            iid=int(row.get("itemId",-1))
            if iid not in item_ids:a.error("SHOP_ITEM_ORPHAN",f"{sid}->{iid}")
    npcs=a.load("data/npcs.json") or []; npcids=set()
    for n in npcs:
        nid=str(n.get("id"))
        if nid in npcids:a.error("NPC_DUP_ID",nid)
        npcids.add(nid)
        if n.get("cityId") and n["cityId"] not in cityids:a.error("NPC_CITY_ORPHAN",f"{nid}->{n['cityId']}")
        if n.get("shopId") and n["shopId"] not in shopids:a.error("NPC_SHOP_ORPHAN",f"{nid}->{n['shopId']}")

    jobs=a.load("data/jobs.json") or {}; jobids=set(jobs)
    for jid,j in jobs.items():
        if j.get("parent") and j["parent"] not in jobids:a.error("JOB_PARENT_ORPHAN",f"{jid}->{j['parent']}")
        for nxt in j.get("nextJobs",[]):
            if nxt not in jobids:a.warn("JOB_NEXT_NOT_DEFINED",f"{jid}->{nxt}")

    # 0.9.82DS packed character library integrity.
    character_manifest=a.load("data/character_atlas_manifest.json") or {}; character_rows=character_manifest.get("characters") or {}
    if character_manifest.get("schema_version")!="3.1":a.error("CHARACTER_MANIFEST_SCHEMA",str(character_manifest.get("schema_version")))
    if len(character_rows)!=90:a.error("CHARACTER_MANIFEST_COUNT",f"{len(character_rows)} != 90")
    character_motion_maps=0; character_variants=0; character_mounted=0; character_atlases=set(); character_images=set()
    for ckey,crow in character_rows.items():
        idle=str(crow.get("idle_image") or ""); motion_map=str(crow.get("motion_map") or crow.get("motions_json") or "")
        if not idle or not (root/idle).is_file():a.error("CHARACTER_IDLE_MISSING",f"{ckey}: {idle}")
        else:character_images.add(idle)
        if not motion_map or not (root/motion_map).is_file():a.error("CHARACTER_MOTION_MAP_MISSING",f"{ckey}: {motion_map}");continue
        mm=a.load(motion_map) or {}; character_motion_maps+=1
        variants=mm.get("variants") or {}; character_variants+=len(variants); character_mounted+=int("mounted" in variants)
        expected={"on_foot","mounted"} if crow.get("has_mounted_variant") else {"on_foot"}
        if set(variants)!=expected:a.error("CHARACTER_VARIANT_MISMATCH",f"{ckey}: {sorted(variants)} expected {sorted(expected)}")
        for vkey,vrow in variants.items():
            paths=[]
            for mid in ("idle","walk","cast","dead","hurt"):
                ref=str(vrow.get(mid) or "")
                if not ref or not (root/ref).is_file():a.error("CHARACTER_ATLAS_JSON_MISSING",f"{ckey}/{vkey}/{mid}: {ref}")
                else:paths.append((mid,ref))
            for weapon,ref in (vrow.get("attack") or {}).items():
                ref=str(ref or "")
                if not ref or not (root/ref).is_file():a.error("CHARACTER_ATTACK_JSON_MISSING",f"{ckey}/{vkey}/{weapon}: {ref}")
                else:paths.append(("attack",ref))
            for mid,ref in paths:
                character_atlases.add(ref); atlas=a.load(ref) or {}
                if atlas.get("schema")!="ro_web_packed_character_atlas":a.error("CHARACTER_ATLAS_SCHEMA",f"{ref}: {atlas.get('schema')}")
                if atlas.get("cell")!={"width":256,"height":256}:a.error("CHARACTER_CELL",ref)
                if atlas.get("anchor")!={"x":128,"y":140}:a.error("CHARACTER_ANCHOR",ref)
                image=str(pathlib.PurePosixPath(ref).parent / str(atlas.get("image") or ""))
                if not (root/image).is_file():a.error("CHARACTER_ATLAS_IMAGE_MISSING",f"{ref}: {image}")
                else:character_images.add(image)
                fs=(atlas.get("frame_sets") or {}).get(mid)
                if fs is None and mid=="hurt":fs=(atlas.get("frame_sets") or {}).get("hurt") or (atlas.get("frame_sets") or {}).get("dead")
                if fs is None:a.error("CHARACTER_FRAME_SET_MISSING",f"{ref}: {mid}")
    a.info.update(characterManifest=len(character_rows),characterMotionMaps=character_motion_maps,characterVariants=character_variants,characterMountedVariants=character_mounted,characterAtlasJson=len(character_atlases),characterImages=len(character_images))

    skillids={}; skillkeys={}; skillrows={}
    for rel in sm.get("cores",[]):
        d=a.load(rel) or {}
        for sid,row in (d.get("skills") or {}).items():
            sid=int(sid)
            if sid in skillids:a.error("SKILL_DUP_ID",f"{sid}: {skillids[sid]} and {rel}")
            skillids[sid]=rel; skillrows[sid]=row; key=row.get("skillKey") or row.get("code") or row.get("key")
            if key and key in skillkeys and skillkeys[key]!=sid:a.error("SKILL_DUP_KEY",f"{key}: {skillkeys[key]},{sid}")
            if key:skillkeys[key]=sid
    tree_nodes=0
    for rel in sm.get("trees",[]):
        d=a.load(rel) or {}; seen=set()
        for node in d.get("skills",[]):
            sid=int(node.get("skillId"));tree_nodes+=1
            if sid in seen:a.error("TREE_DUP_SKILL",f"{rel}:{sid}")
            seen.add(sid)
            if sid not in skillids:a.error("TREE_SKILL_ORPHAN",f"{rel}:{sid}")
            req=node.get("requires",[])
            if not isinstance(req,list):a.error("TREE_REQUIRES_NOT_ARRAY",f"{rel}:{sid}");continue
            for rq in req:
                rid=int(rq.get("id",rq.get("officialId",rq.get("skillId",-1))))
                if rid not in skillids:a.error("TREE_PREREQ_ORPHAN",f"{rel}:{sid}->{rid}")
    a.info.update(skillIds=len(skillids),treeNodes=tree_nodes)

    base=a.load("data/skill_runtime/runtime_generated_all.json") or {}; official=a.load("data/skill_runtime/runtime_core_1_v1.json") or {}; pending=a.load("data/skill_runtime/runtime_pending_review.json") or {}
    baseids=set(map(int,(base.get("skills") or {}).keys())); officialids=set(map(int,(official.get("skills") or {}).keys())); pendingids=[int(x.get("skillId")) for x in pending.get("skills",[])]
    if baseids!=set(skillids):a.error("RUNTIME_BASE_COVERAGE",f"base={len(baseids)} core={len(skillids)}")
    if len(pendingids)!=len(set(pendingids)):a.error("PENDING_DUP_ID",str(len(pendingids)-len(set(pendingids))))
    if officialids & set(pendingids):a.error("RUNTIME_OVERLAP",str(sorted(officialids&set(pendingids))[:20]))
    if officialids|set(pendingids)!=set(skillids):a.error("RUNTIME_PARTITION",f"official={len(officialids)} pending={len(set(pendingids))} core={len(skillids)}")
    quick=(root/"js/quick_slots.js").read_text(encoding="utf-8"); handlers=collections.Counter()
    for row in (official.get("skills") or {}).values():
        profile=row.get("runtimeProfile") or row; handler=profile.get("handler") or row.get("handler");handlers[handler]+=1
    for handler,n in handlers.items():
        if handler and handler!="passive" and handler not in quick:a.error("HANDLER_NOT_DISPATCHED",f"{handler}: {n}")
    a.info.update(officialRuntime=len(officialids),pendingRuntime=len(set(pendingids)),officialHandlers=dict(handlers))
    forbidden_desc = ("待後續", "尚未完成", "成本延後", "TODO", "GroundEffectManager", "SkillInfoz", "Duration2", "HitCount", "需求元資料", "等待精靈系統", "供後續", "尚未統一", "統一成本系統", "統一扣費系統", "統一冷卻系統", "職業技能補完後", "現階段", "尚未提供", "戰鬥效果將", "此版本先完成", "初版", "暫不", "目前不", "依使用者決議", "製作系統完成後", "若未來", "共用攔截入口", "供怪物主動技能 AI 使用", "依官方技能樹加入")
    blank_desc = 0
    for sid in sorted(officialids):
        row = skillrows.get(sid) or {}
        desc = str(row.get("description") or "").strip()
        official_desc = str(row.get("officialDescription") or "").strip()
        if not desc:
            blank_desc += 1; a.error("SKILL_DESCRIPTION_EMPTY", f"{sid}: {row.get('name')}")
        if desc != official_desc:
            a.error("SKILL_DESCRIPTION_MISMATCH", f"{sid}: {row.get('name')}")
        for token in forbidden_desc:
            if token.lower() in desc.lower(): a.error("SKILL_DESCRIPTION_DEV_TEXT", f"{sid}: {token}")
    a.info["implementedSkillDescriptions"] = len(officialids) - blank_desc

    copy=a.load(sm.get("copyableSkills")) or {}
    for mode in ("plagiarism","reproduce"):
        seen=set()
        for row in copy.get(mode,[]):
            sid=int(row.get("skillId"))
            if sid in seen:a.error("COPYABLE_DUP",f"{mode}:{sid}")
            seen.add(sid)
            if sid not in skillids and not row.get("intentionalExclusion"):
                (a.error if row.get("enabled") else a.warn)("COPYABLE_ORPHAN",f"{mode}:{sid} enabled={bool(row.get('enabled'))}")
            if row.get("enabled") and sid not in officialids:a.error("COPYABLE_NOT_OFFICIAL",f"{mode}:{sid}")

    for jc in a.load("data/job_change.json") or []:
        enabled=bool(jc.get("enabled")); report=a.error if enabled else a.warn
        if jc.get("fromJob") not in jobids:report("JOB_CHANGE_FROM_ORPHAN",f"{jc.get('id')}->{jc.get('fromJob')} enabled={enabled}")
        if jc.get("toJob") not in jobids:report("JOB_CHANGE_TO_ORPHAN",f"{jc.get('id')}->{jc.get('toJob')} enabled={enabled}")
        if jc.get("npcId") not in npcids:report("JOB_CHANGE_NPC_ORPHAN",f"{jc.get('id')}->{jc.get('npcId')} enabled={enabled}")

    prefix="window.RO_WEB_DATA = "; text=(root/"js/data_bundle.js").read_text(encoding="utf-8")
    try:
        if not text.startswith(prefix):raise ValueError("missing window.RO_WEB_DATA prefix")
        bundled=json.loads(text[len(prefix):].strip().rstrip(";"))
        runtime_json=sorted(list((root/"data").rglob("*.json"))+list((root/"assets").rglob("*.json")))
        actual={str(p.relative_to(root)).replace("\\","/"):json.loads(p.read_text(encoding="utf-8-sig")) for p in runtime_json}
        missing=set(actual)-set(bundled); extra=set(bundled)-set(actual); diff=[k for k in actual.keys()&bundled.keys() if actual[k]!=bundled[k]]
        if missing:a.error("BUNDLE_MISSING",str(sorted(missing)[:10]))
        if extra:a.error("BUNDLE_EXTRA",str(sorted(extra)[:10]))
        if diff:a.error("BUNDLE_DIFFERENT",f"{len(diff)}: {diff[:10]}")
        a.info["bundleEntries"]=len(bundled)
    except Exception as e:a.error("BUNDLE_PARSE",str(e))

    # 0.9.82HQ consumable / Horse Badge / box equipment guarantees.
    consumable_runtime = root / "js/consumable_runtime.js"
    if not consumable_runtime.is_file(): a.error("HQ_CONSUMABLE_RUNTIME_MISSING", str(consumable_runtime.relative_to(root)))
    else:
        crt = consumable_runtime.read_text(encoding="utf-8")
        for token in ("sc_start", "percentheal", "bonus_script", "SC_SPEEDUP0"):
            if token not in crt: a.error("HQ_CONSUMABLE_RUNTIME_TOKEN", token)
    if 662 not in item_ids: a.error("HQ_HORSE_BADGE_ITEM_MISSING", "Item 662")
    else:
        badge_icon = root / "images/items/662.webp"
        if not badge_icon.is_file(): a.error("HQ_HORSE_BADGE_ICON_MISSING", "images/items/662.webp")
    badge_shop = any(int(row.get("itemId", -1)) == 662 and int(row.get("price", -1)) == 1450 for shop in shops.values() for row in shop.get("items", []))
    if not badge_shop: a.error("HQ_HORSE_BADGE_SHOP", "Item 662 at 1450 Zeny")
    index_text = (root / "index.html").read_text(encoding="utf-8")
    if 'id="autoCombatSpeedBadgeEnabled"' not in index_text: a.error("HQ_HORSE_BADGE_UI", "autoCombatSpeedBadgeEnabled")
    for rel in ("CONSUMABLE_EFFECT_AUDIT_0.9.82HQ.json", "BOX_EQUIPMENT_EFFECT_AUDIT_0.9.82HQ.json", "TEST_REPORT_0.9.82HQ_CONSUMABLE_RUNTIME.json", "TEST_REPORT_0.9.82HQ_AUTO_HORSE_BADGE.json"):
        if not (root / rel).is_file(): a.error("HQ_REPORT_MISSING", rel)

    # 0.9.82HR global rare-item announcements / absolute 5% grade materials.
    rare_runtime = root / "js/rare_item_announcement_runtime.js"
    if not rare_runtime.is_file(): a.error("HR_RARE_RUNTIME_MISSING", "js/rare_item_announcement_runtime.js")
    else:
        rrt = rare_runtime.read_text(encoding="utf-8")
        for token in ("tierForChanceBasisPoints", "weightedItemChanceBasisPoints", "announceAcquisition", "announceBatch", "THRESHOLDS.gold", "THRESHOLDS.purple"):
            if token not in rrt: a.error("HR_RARE_RUNTIME_TOKEN", token)
    index_text = (root / "index.html").read_text(encoding="utf-8")
    rare_tag = f'./js/rare_item_announcement_runtime.js?v={EXPECTED_VERSION}'
    if rare_tag not in index_text: a.error("HR_RARE_RUNTIME_INDEX", rare_tag)
    else:
        try:
            rare_pos=index_text.index(rare_tag); gacha_pos=index_text.index(f'./js/mvp_gacha_runtime.js?v={EXPECTED_VERSION}'); box_pos=index_text.index(f'./js/item_box_runtime.js?v={EXPECTED_VERSION}')
            if not (rare_pos < gacha_pos and rare_pos < box_pos): a.error("HR_RARE_RUNTIME_ORDER", "rare runtime must load before gacha and boxes")
        except ValueError as e: a.error("HR_RARE_RUNTIME_ORDER", str(e))
    server_cfg=a.load("data/server_config.json") or {}
    rates=((server_cfg.get("server") or {}).get("rates") or {})
    if rates.get("gradeMaterialDropChanceBasisPoints") != 500: a.error("HR_GRADE_ABSOLUTE_RATE", str(rates.get("gradeMaterialDropChanceBasisPoints")))
    grade_map=a.load("data/enchant_grade_map_drops.json") or {}
    grade_rows=[]
    for profile in (grade_map.get("profiles") or {}).values():
        for row in profile.get("entries",[]):
            if str(row.get("rateMode","")).lower() in {"normal","globaldrop","global_drop"}: continue
            grade_rows.append(row)
    if not grade_rows: a.error("HR_GRADE_ROWS_MISSING", "no grade material drop entries")
    for row in grade_rows:
        if int(row.get("absoluteChanceBasisPoints",-1)) != 500 or int(row.get("chance",-1)) != 500:
            a.error("HR_GRADE_ROW_NOT_5_PERCENT", f"Item {row.get('itemId')}: {row.get('chance')}/{row.get('absoluteChanceBasisPoints')}")
    bridge_tokens={
        "js/loot.js":"announceRareItemAcquisition",
        "js/mvp_gacha_runtime.js":"rareAcquisitions",
        "js/item_box_runtime.js":"rewardChanceBasisPoints",
        "js/card_runtime.js":"RareItemAnnouncementRuntime",
        "js/enchant_grade_runtime.js":"gradeMaterialDropChanceBasisPoints"
    }
    for rel,token in bridge_tokens.items():
        fp=root/rel
        if not fp.is_file() or token not in fp.read_text(encoding="utf-8"): a.error("HR_RARE_BRIDGE_MISSING", f"{rel}: {token}")
    for rel in ("TEST_REPORT_0.9.82HR_RARE_ITEM_ANNOUNCEMENT.json", "RARE_ITEM_PROBABILITY_AUDIT_0.9.82HR.json", "RARE_ITEM_PROBABILITY_AUDIT_0.9.82HR.md"):
        if not (root/rel).is_file(): a.error("HR_REPORT_MISSING", rel)

    # 0.9.82HT manual combat target authority and aggressive-monster retaliation.
    battle_js = (root / "js/battle.js").read_text(encoding="utf-8") if (root / "js/battle.js").is_file() else ""
    quick_js = (root / "js/quick_slots.js").read_text(encoding="utf-8") if (root / "js/quick_slots.js").is_file() else ""
    world_js = (root / "js/world_monster_test_runtime.js").read_text(encoding="utf-8") if (root / "js/world_monster_test_runtime.js").is_file() else ""
    for token in ("isManualCombatTargetValid", "requestManualRetaliationAgainstMonster", "getManualMonsterAttackTarget"):
        if token not in battle_js: a.error("HS_MANUAL_COMBAT_TOKEN", f"js/battle.js: {token}")
    if "!autoRunning && typeof isManualCombatTargetValid" not in quick_js:
        a.error("HS_QUICK_SLOT_MANUAL_TARGET", "manual quick-slot target must bypass auto monster filter")
    for token in ("requestManualRetaliationAgainstMonster(entity", "forceAutoBattleTarget(entity", "startManualMonsterAttack(entity"):
        if token not in world_js: a.error("HS_WORLD_MANUAL_BRIDGE", token)
    hs_report = root / "TEST_REPORT_0.9.82HT_MANUAL_COMBAT.json"
    if not hs_report.is_file(): a.error("HS_REPORT_MISSING", hs_report.name)
    else:
        report = a.load(hs_report.name) or {}
        if int(report.get("failed", -1)) != 0: a.error("HS_REPORT_FAILED", str(report.get("failures")))

    # 0.9.82HT death / revival token / automatic revival / 5% gacha box.
    death_runtime = root / "js/death_revival_runtime.js"
    if not death_runtime.is_file(): a.error("HT_DEATH_RUNTIME_MISSING", "js/death_revival_runtime.js")
    else:
        drt = death_runtime.read_text(encoding="utf-8")
        for token in ("TOKEN_ITEM_ID = 7621", "TOKEN_BOX_ITEM_ID = 12922", "handleDeath", "reviveWithToken", "returnToVillage", "recoverPersistedDeathState"):
            if token not in drt: a.error("HT_DEATH_RUNTIME_TOKEN", token)
    index_text = (root / "index.html").read_text(encoding="utf-8")
    for token in ('id="playerDeathModal"', 'id="deathReviveTokenButton"', 'id="deathReturnVillageButton"', 'id="autoCombatAutoReviveTokenEnabled"', f'./js/death_revival_runtime.js?v={EXPECTED_VERSION}'):
        if token not in index_text: a.error("HT_DEATH_UI_MISSING", token)
    for iid in (7621,12922):
        if iid not in item_ids: a.error("HT_REVIVAL_ITEM_MISSING", str(iid))
        if not (root / f"images/items/{iid}.webp").is_file(): a.error("HT_REVIVAL_ICON_MISSING", str(iid))
    item_boxes = a.load("data/item_boxes.json") or {}
    token_box = (item_boxes.get("boxes") or {}).get("token_of_siegfried_box") or {}
    token_rewards = token_box.get("rewards") or []
    if int(token_box.get("itemId",0)) != 12922 or len(token_rewards) != 1 or int(token_rewards[0].get("itemId",0)) != 7621 or int(token_rewards[0].get("quantity",0)) != 10:
        a.error("HT_TOKEN_BOX_DATA", str(token_box))
    gacha = a.load("data/mvp_gacha.json") or {}
    token_category = next((row for row in gacha.get("rareCategories",[]) if row.get("id") == "token_of_siegfried_box"), None)
    if not token_category or int(token_category.get("chanceBasisPoints",0)) != 500:
        a.error("HT_GACHA_TOKEN_BOX_5PCT", str(token_category))
    gacha_total = int(gacha.get("ordinaryFillBasisPoints",0)) + sum(int(row.get("chanceBasisPoints",0)) for row in gacha.get("rareCategories",[]))
    if gacha_total != 10000: a.error("HT_GACHA_TOTAL", str(gacha_total))
    ht_report = root / "TEST_REPORT_0.9.82HU_DEATH_REVIVAL.json"
    if not ht_report.is_file(): a.error("HT_REPORT_MISSING", ht_report.name)
    else:
        report = a.load(ht_report.name) or {}
        if int(report.get("failed", -1)) != 0: a.error("HT_REPORT_FAILED", str(report.get("failures")))

    # 0.9.82HU death movement lock: no residual path, click/touch fallback, chase or wing movement while dead.
    position_js = (root / "js/position_engine.js").read_text(encoding="utf-8") if (root / "js/position_engine.js").is_file() else ""
    for token in ("isPlayerDeathMovementLocked", "clearPlayerMovementForDeath", "death movement locked", "角色已死亡，請使用死亡視窗返回村莊"):
        if token not in position_js: a.error("HU_DEATH_MOVE_TOKEN", token)
    for token in ("clearPlayerMovementForDeath", "bindDeathInputShield"):
        if token not in drt: a.error("HU_DEATH_RUNTIME_MOVE_BRIDGE", token)
    for token in (f'./js/position_engine.js?v={EXPECTED_VERSION}', f'./js/death_revival_runtime.js?v={EXPECTED_VERSION}'):
        if token not in index_text: a.error("HU_INDEX_CACHE", token)
    style_text = (root / "css/style.css").read_text(encoding="utf-8") if (root / "css/style.css").is_file() else ""
    if "body.player-death-modal-open #battle-field{touch-action:none!important}" not in style_text:
        a.error("HU_DEATH_TOUCH_LOCK", "death modal must disable battle-field touch action")
    hu_report = root / "TEST_REPORT_0.9.82HU_DEATH_MOVEMENT_LOCK.json"
    if not hu_report.is_file(): a.error("HU_REPORT_MISSING", hu_report.name)
    else:
        report = a.load(hu_report.name) or {}
        if int(report.get("failed", -1)) != 0: a.error("HU_REPORT_FAILED", str(report.get("failures")))

    # 0.9.82HW MVP gacha per-reward absolute probabilities.
    hw_gacha = a.load("data/mvp_gacha.json") or {}
    if hw_gacha.get("version") != EXPECTED_VERSION: a.error("HX_GACHA_VERSION", str(hw_gacha.get("version")))
    expected_reward_chances = {
        4403:1, 400368:10, 420186:10,
        450175:100, 480076:100, 22202:100, 490030:100, 490097:100,
        450299:10, 480312:10, 470183:10, 490404:10, 12922:500
    }
    seen_reward_chances = {}
    for category in hw_gacha.get("rareCategories",[]):
        if category.get("chanceMode") != "per_reward_absolute":
            a.error("HW_GACHA_CHANCE_MODE", str(category.get("id")))
        row_sum = 0
        for reward in category.get("rewards",[]):
            item_id = int(reward.get("itemId",0)); chance = int(reward.get("chanceBasisPoints",0))
            seen_reward_chances[item_id] = chance; row_sum += chance
        if row_sum != int(category.get("chanceBasisPoints",-1)):
            a.error("HW_GACHA_CATEGORY_TOTAL", f"{category.get('id')}: {row_sum}/{category.get('chanceBasisPoints')}")
    if seen_reward_chances != expected_reward_chances:
        a.error("HW_GACHA_REWARD_CHANCES", str(seen_reward_chances))
    hw_special_total = sum(int(row.get("chanceBasisPoints",0)) for row in hw_gacha.get("rareCategories",[]))
    if hw_special_total != 1061 or int(hw_gacha.get("ordinaryFillBasisPoints",0)) != 8939:
        a.error("HW_GACHA_POOL_TOTALS", f"{hw_special_total}/{hw_gacha.get('ordinaryFillBasisPoints')}")
    hw_runtime = (root / "js/mvp_gacha_runtime.js").read_text(encoding="utf-8") if (root / "js/mvp_gacha_runtime.js").is_file() else ""
    for token in ('chanceMode || "") === "per_reward_absolute"', 'chanceBasisPoints = Math.max(0, integer(row.chanceBasisPoints))'):
        if token not in hw_runtime: a.error("HW_GACHA_RUNTIME_TOKEN", token)
    hw_report = root / f"TEST_REPORT_{EXPECTED_VERSION}_MVP_GACHA_PER_ITEM.json"
    if not hw_report.is_file(): a.error("HX_REPORT_MISSING", hw_report.name)
    else:
        report = a.load(hw_report.name) or {}
        if int(report.get("failed", -1)) != 0: a.error("HX_REPORT_FAILED", str(report.get("checks")))

    for rel in ("RARE_ITEM_PROBABILITY_AUDIT_0.9.82HW.json", "RARE_ITEM_PROBABILITY_AUDIT_0.9.82HW.md"):
        if not (root / rel).is_file(): a.error("HW_AUDIT_MISSING", rel)

    # 0.9.82HX durable gacha save barrier / verified manual save.
    player_js = (root / "js/player.js").read_text(encoding="utf-8") if (root / "js/player.js").is_file() else ""
    gacha_runtime = (root / "js/mvp_gacha_runtime.js").read_text(encoding="utf-8") if (root / "js/mvp_gacha_runtime.js").is_file() else ""
    for token in ("preparePendingRewardsForSave", "saveGameAndWait", "manualSaveGame", "RO_WEB_MANUAL_SAVE_PROMISE", "forceWriter"):
        if token not in player_js: a.error("HX_SAVE_BARRIER_PLAYER_TOKEN", token)
    for token in ("flushPendingGachaForSave", "flushPendingForSave", "openedSinceCheckpoint", "drainAll", "mvp-gacha-batch"):
        if token not in gacha_runtime: a.error("HX_SAVE_BARRIER_GACHA_TOKEN", token)
    if 'id="manualSaveButton" type="button" onclick="manualSaveGame()"' not in index_text:
        a.error("HX_MANUAL_SAVE_BUTTON", "manual save must await durable verified save")
    barrier_report = root / "tools/test_gacha_save_barrier_report_0.9.82HX.json"
    if not barrier_report.is_file():
        a.error("HX_SAVE_BARRIER_REPORT_MISSING", str(barrier_report.relative_to(root)))
    else:
        report = a.load(str(barrier_report.relative_to(root))) or {}
        if int(report.get("failed", -1)) != 0 or int(report.get("passed", 0)) < 18:
            a.error("HX_SAVE_BARRIER_REPORT_FAILED", str(report))
        checks = report.get("checks") or {}
        for key in ("queued4000", "manualDrain", "writerReclaim", "localReadback", "durableReadback", "quotaFallback"):
            if checks.get(key) is not True: a.error("HX_SAVE_BARRIER_CHECK", key)

    # 0.9.82HV unified damage-number colors / critical effect / incoming red damage.
    battle_js = (root / "js/battle.js").read_text(encoding="utf-8") if (root / "js/battle.js").is_file() else ""
    style_text = (root / "css/style.css").read_text(encoding="utf-8") if (root / "css/style.css").is_file() else ""
    for token in ("incoming-damage-number", "damageKind", 'source:"monster"', "target === player", "worldY = Number(position.y) - 96"):
        if token not in battle_js: a.error("HV_DAMAGE_NUMBER_RUNTIME", token)
    for token in (
        "RO_WEB 0.9.82HV — Unified combat-number color contract",
        "ro-web-critical-spark-burst",
        "ro-web-critical-ring-burst",
        ".damage-number.incoming-damage-number",
        "-webkit-text-fill-color:#ffe84f !important"
    ):
        if token not in style_text: a.error("HV_DAMAGE_NUMBER_STYLE", token)
    for report_name in ("TEST_REPORT_0.9.82HV_DAMAGE_NUMBER_VISUAL_CONTRACT.json", "TEST_REPORT_0.9.82HV_DAMAGE_NUMBER_BROWSER_RENDER.json"):
        hv_report = root / report_name
        if not hv_report.is_file(): a.error("HV_REPORT_MISSING", hv_report.name)
        else:
            report = a.load(hv_report.name) or {}
            if int(report.get("failed", -1)) != 0: a.error("HV_REPORT_FAILED", f"{report_name}: {report.get('failures') or report.get('checks')}")
    if not (root / "docs/previews/DAMAGE_NUMBER_VISUAL_0.9.82HV.png").is_file():
        a.error("HV_PREVIEW_MISSING", "docs/previews/DAMAGE_NUMBER_VISUAL_0.9.82HV.png")

    node=shutil.which("node")
    if node:
        checker=root/"tools/check_all_js_syntax.js"
        cp=subprocess.run([node,str(checker),str(root)],capture_output=True,text=True)
        try:syntax_result=json.loads(cp.stdout or "{}")
        except Exception:syntax_result={"checked":0,"errors":[cp.stderr.strip() or "syntax checker output invalid"]}
        for msg in syntax_result.get("errors",[]):a.error("JS_SYNTAX",msg)
        a.info["jsSyntaxChecked"]=int(syntax_result.get("checked",0))
    else:a.warn("NODE_NOT_FOUND","Node.js unavailable; JavaScript syntax step skipped")

    result={"version":EXPECTED_VERSION,"summary":{"errors":len(a.errors),"warnings":len(a.warnings),"status":"PASS" if not a.errors else "FAIL"},"info":a.info,"errors":a.errors,"warnings":a.warnings}
    out=json.dumps(result,ensure_ascii=False,indent=2)
    print(out)
    if args.json_output:pathlib.Path(args.json_output).write_text(out+"\n",encoding="utf-8")
    return 0 if not a.errors else 1

if __name__=="__main__":raise SystemExit(main())
