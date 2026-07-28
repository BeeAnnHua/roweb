#!/usr/bin/env python3
from __future__ import annotations
import json, re, shutil, hashlib, zipfile
from pathlib import Path
from collections import defaultdict
from PIL import Image
import yaml

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT.parent
MON_SRC = WORK / 'monsters'
SKILL_NAMES_PATH = WORK / 'skillinfo_names.json'
ITEMINFO_PATH = Path('/mnt/data/itemInfo_UTF8.lub')
CN_CARD_YML = Path('/mnt/data/item_db_etc(卡片中文對照).yml')
VERSION = '0.9.82GR'
MONSTER_IDS = [21520,21521,21522,21523,21524,21525,21526,21527,21528,21529,21537,21599]
MONSTER_NAME_FIX = {
    21520: '青翅巨鳥',
    21522: '克拉波利',
    21523: '冰蛇鰻',
    21524: '閃亮海帶',
    21525: '冰鋒球',
    21537: '終極青翅巨鳥',
}
CARD_IDS = [300360,300361,300362,300363,300364,300365,300366,300367,300368,300377,300381]
REQUIRED_MOTIONS = {'idle','walk','attack','hit','dead'}
REQUIRED_DIRS = {'south_west','north_west','north_east','south_east'}
PENDING_DESC = '此技能目前尚未接入 RO_WEB Runtime；僅保留技能樹與官方時序資料，不會套用舊傷害、Buff、Debuff、召喚或其他未驗證效果。'


def read_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def write_json(path: Path, data, compact=False):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',',':') if compact else None, indent=None if compact else 2) + ('\n' if not compact else ''), encoding='utf-8')

def sha256(path: Path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024), b''): h.update(b)
    return h.hexdigest()

def clean_client_lines(lines):
    out=[]
    for raw in lines or []:
        s=re.sub(r'\^[0-9A-Fa-f]{6}', '', str(raw)).strip()
        if not s or s == '_' or re.match(r'^(系列|裝備|重量)\s*[:：]',s):
            continue
        out.append(s)
    return out

def parse_iteminfo_entry(text: str, item_id: int):
    pat=re.compile(rf'^\s*\[{item_id}\]\s*=\s*\{{(.*?)(?=^\s*\[\d+\]\s*=\s*\{{|\Z)', re.M|re.S)
    m=pat.search(text)
    if not m: return None
    block=m.group(1)
    nm=re.search(r'(?<!un)identifiedDisplayName\s*=\s*"((?:\\.|[^"\\])*)"',block,re.S)
    dm=re.search(r'(?<!un)identifiedDescriptionName\s*=\s*\{(.*?)\}',block,re.S)
    strings=[]
    if dm:
        for sm in re.finditer(r'"((?:\\.|[^"\\])*)"',dm.group(1),re.S):
            s=bytes(sm.group(1),'utf-8').decode('unicode_escape') if '\\' in sm.group(1) else sm.group(1)
            strings.append(s)
    return {'name': nm.group(1) if nm else None, 'description': clean_client_lines(strings)}

def locations_to_targets(loc):
    loc=loc or {}; out=[]
    if loc.get('Right_Hand') or loc.get('Both_Hand'): out.append('weapon')
    if loc.get('Left_Hand') or loc.get('Shield'): out.append('shield')
    if loc.get('Armor'): out.append('body')
    if loc.get('Garment'): out.append('garment')
    if loc.get('Shoes'): out.append('shoes')
    if loc.get('Accessory') or loc.get('Both_Accessory'): out.append('accessory')
    if loc.get('Accessory_Left') or loc.get('Left_Accessory'): out.append('accessory1')
    if loc.get('Accessory_Right') or loc.get('Right_Accessory'): out.append('accessory2')
    if loc.get('Head_Top'): out.append('headTop')
    if loc.get('Head_Mid'): out.append('headMid')
    if loc.get('Head_Low'): out.append('headLow')
    return list(dict.fromkeys(out))

COMMANDS={'bonus','bonus2','bonus3','bonus4','bonus5','skill','autobonus','autobonus2','autobonus3','sc_start','heal','showscript','specialeffect2','active_transform'}
def transform_script(src: str) -> str:
    src=src or ''
    src=re.sub(r'/\*.*?\*/\s*\)?','',src,flags=re.S)
    src=re.sub(r'\.\@([A-Za-z_]\w*)',r'v.\1',src)
    out=[]; i=0; n=len(src)
    while i<n:
        ch=src[i]
        if ch in ('"',"'"):
            q=ch; j=i+1; esc=False
            while j<n:
                c=src[j]
                if esc: esc=False
                elif c=='\\': esc=True
                elif c==q: j+=1; break
                j+=1
            out.append(src[i:j]); i=j; continue
        if (ch.isalpha() or ch=='_') and not (i>0 and (src[i-1]=='.' or src[i-1].isalnum() or src[i-1]=='_')):
            m=re.match(r'[A-Za-z_]\w*',src[i:]); word=m.group(0); j=i+len(word)
            if word in COMMANDS and (j>=n or src[j]!='('):
                k=j; quote=None; esc=False; depth=0
                while k<n:
                    c=src[k]
                    if quote:
                        if esc: esc=False
                        elif c=='\\': esc=True
                        elif c==quote: quote=None
                    else:
                        if c in ('"',"'"): quote=c
                        elif c in '([': depth+=1
                        elif c in ')]': depth=max(0,depth-1)
                        elif c==';' and depth==0: break
                    k+=1
                args=src[j:k].strip(); parts=[]; start=0; quote=None; esc=False; dep=0
                for idx,c in enumerate(args):
                    if quote:
                        if esc: esc=False
                        elif c=='\\': esc=True
                        elif c==quote: quote=None
                    else:
                        if c in ('"',"'"): quote=c
                        elif c in '([{': dep+=1
                        elif c in ')]}': dep=max(0,dep-1)
                        elif c==',' and dep==0: parts.append(args[start:idx].strip()); start=idx+1
                parts.append(args[start:].strip())
                if (word.startswith('bonus') or word in {'skill','sc_start','active_transform'}) and parts and re.fullmatch(r'[A-Za-z_]\w*',parts[0]):
                    parts[0]=json.dumps(parts[0])
                out.append(f'{word}({", ".join(parts)})')
                if k<n and src[k]==';': out.append(';'); k+=1
                i=k; continue
            out.append(word); i=j; continue
        out.append(ch); i+=1
    return ''.join(out)

# 1) Validate and install formal monster atlases.
atlas_audit=[]
for mid in MONSTER_IDS:
    src_dir=MON_SRC/str(mid); png=src_dir/f'{mid}.png'; js=src_dir/f'{mid}.json'
    if not png.exists() or not js.exists(): raise FileNotFoundError(f'missing monster asset {mid}')
    data=read_json(js); im=Image.open(png); w,h=im.size
    atlas=data.get('atlas') or {}
    if int(atlas.get('width',w))!=w or int(atlas.get('height',h))!=h: raise ValueError(f'{mid}: atlas dimensions mismatch')
    frames=data.get('frames') or []; byid={int(f['id']):f for f in frames}
    bad=[]; flip_count=0
    for f in frames:
        x,y,fw,fh=map(int,(f['x'],f['y'],f['width'],f['height']))
        if x<0 or y<0 or fw<=0 or fh<=0 or x+fw>w or y+fh>h: bad.append(f['id'])
        if f.get('flipX'): flip_count+=1
    if bad: raise ValueError(f'{mid}: out-of-bounds frames {bad[:10]}')
    anims=data.get('animations') or {}
    if not REQUIRED_MOTIONS.issubset(anims): raise ValueError(f'{mid}: missing motions {REQUIRED_MOTIONS-set(anims)}')
    refs=0
    for motion in REQUIRED_MOTIONS:
        dirs=(anims[motion].get('directions') or {})
        if not REQUIRED_DIRS.issubset(dirs): raise ValueError(f'{mid}/{motion}: missing directions {REQUIRED_DIRS-set(dirs)}')
        for dn,row in dirs.items():
            for fid in row.get('frames') or []:
                if int(fid) not in byid: raise ValueError(f'{mid}/{motion}/{dn}: missing frame {fid}')
                refs+=1
    dst=ROOT/f'assets/monsters/animations/{mid}'; dst.mkdir(parents=True,exist_ok=True)
    shutil.copy2(png,dst/f'{mid}.png'); shutil.copy2(js,dst/f'{mid}.json')
    atlas_audit.append({'monsterId':mid,'pngSize':[w,h],'frameEntries':len(frames),'animationFrameRefs':refs,'flipXFrames':flip_count,'motions':sorted(anims),'pngSha256':sha256(dst/f'{mid}.png'),'jsonSha256':sha256(dst/f'{mid}.json')})

# 2) Fix monster display names and mark formal pipeline.
mon_path=ROOT/'data/monsters.json'; monsters=read_json(mon_path); mon_by={int(m['id']):m for m in monsters}
monster_name_changes=[]
for mid in MONSTER_IDS:
    m=mon_by[mid]
    old=m.get('name')
    if mid in MONSTER_NAME_FIX: m['name']=MONSTER_NAME_FIX[mid]
    m['animationSchema']='ro_web_monster_animation_v1_4dir'
    m['animationPipeline']='RO Studio V73 trim + V74 exact dedup + V76 flipX mirror dedup; RO_WEB 0.9.82GR formal animated atlas'
    m['useAnimatedAtlas']=True
    if old!=m.get('name'): monster_name_changes.append({'monsterId':mid,'oldName':old,'newName':m['name']})
write_json(mon_path,monsters)

# 3) Official TW skill names; never replace runtime/custom descriptions.
skill_name_doc=read_json(SKILL_NAMES_PATH); official_names=dict(skill_name_doc['mapping'])
official_names['BA_FROSTJOKER']=official_names.get('BA_FROSTJOKE','冷笑話')
skill_name_changes=[]; missing_skill_names=[]
for rel in ['data/skills/skills_core_1.json','data/skills/skills_core_2.json']:
    path=ROOT/rel; doc=read_json(path); is_core2=rel.endswith('skills_core_2.json')
    for sid,s in doc['skills'].items():
        key=s.get('key'); new=official_names.get(key)
        if not new:
            missing_skill_names.append({'skillId':int(sid),'skillKey':key,'oldName':s.get('name')}); continue
        old=s.get('name')
        if old!=new:
            skill_name_changes.append({'skillId':int(sid),'skillKey':key,'oldName':old,'newName':new,'core':2 if is_core2 else 1})
            s['name']=new
        if is_core2:
            if s.get('description'):
                s['officialDescription']=s['description']
            else:
                s['description']=PENDING_DESC
                s['officialDescription']=PENDING_DESC
    doc['version']=VERSION
    if isinstance(doc.get('title'),dict): doc['title']['version']=VERSION
    if isinstance(doc.get('meta'),dict): doc['meta']['version']=VERSION
    write_json(path,doc)

# Recursively synchronize duplicated names in runtime/manifest data.
runtime_name_updates=[]
def sync_names(obj,path=''):
    if isinstance(obj,dict):
        key=obj.get('skillKey') or (obj.get('key') if ('skillId' in obj or 'officialId' in obj or 'maxLevel' in obj) else None)
        if key in official_names and 'name' in obj and obj.get('name')!=official_names[key]:
            runtime_name_updates.append({'path':path,'skillKey':key,'oldName':obj.get('name'),'newName':official_names[key]})
            obj['name']=official_names[key]
        for k,v in obj.items(): sync_names(v,f'{path}/{k}')
    elif isinstance(obj,list):
        for i,v in enumerate(obj): sync_names(v,f'{path}/{i}')

skill_sync_files=[]
for path in sorted((ROOT/'data').rglob('*.json')):
    rel=path.relative_to(ROOT).as_posix()
    if rel.startswith('data/skills/') or rel.startswith('data/skill_runtime/') or rel in {'data/skill_manifest.json'}:
        doc=read_json(path); before=len(runtime_name_updates); sync_names(doc,rel)
        if isinstance(doc,dict) and rel in {
            'data/skill_manifest.json','data/skill_runtime/runtime_generated_all.json','data/skill_runtime/runtime_formula_catalog.json',
            'data/skill_runtime/runtime_pending_review.json','data/skill_runtime/runtime_core_1_v1.json','data/skill_runtime/runtime_copyable_skills.json'
        }: doc['version']=VERSION
        if len(runtime_name_updates)>before:
            write_json(path,doc,compact=(rel.startswith('data/skill_runtime/') and path.stat().st_size>2_000_000))
            skill_sync_files.append(rel)
        elif rel=='data/skill_manifest.json': write_json(path,doc)

# 4) Official item names/descriptions for every active drop of the 12 monsters.
drop_ids=sorted({int(d['itemId']) for mid in MONSTER_IDS for d in mon_by[mid].get('drops',[])})
iteminfo_text=ITEMINFO_PATH.read_text(encoding='utf-8',errors='replace')
item_official={i:parse_iteminfo_entry(iteminfo_text,i) for i in drop_ids}
client=read_json(ROOT/'data/client_item_display_data.json'); client_cards=client.get('cardInfo',{})
cn=yaml.safe_load(CN_CARD_YML.read_text(encoding='cp950')); cn_by={int(x['Id']):x for x in cn.get('Body',[]) if x.get('Id') is not None}

# Map each relevant card to the actual world monster/drop row.
card_sources=defaultdict(list)
for mid in MONSTER_IDS:
    m=mon_by[mid]
    for d in m.get('drops',[]):
        cid=int(d['itemId'])
        if cid in CARD_IDS:
            card_sources[cid].append({'monsterId':mid,'monsterAegisName':m.get('aegisName'),'monsterName':m.get('name'),'rate':int(d.get('chance') or 0),'stealProtected':bool(d.get('stealProtected')),'isMvp':bool(m.get('isMvp') or m.get('mvpExp')),'isBoss':bool(m.get('isBoss'))})

cards_path=ROOT/'data/items/cards_2.json'; cards=read_json(cards_path)
card_effects_path=ROOT/'data/card_runtime/card_effects.json'; card_effects=read_json(card_effects_path)
card_drop_path=ROOT/'data/card_runtime/card_drop_sources.json'; card_drop=read_json(card_drop_path)
item_changes=[]
for cid in CARD_IDS:
    y=cn_by.get(cid)
    if not y: raise KeyError(f'card source missing {cid}')
    old=cards.get(str(cid),{})
    info=client_cards.get(str(cid),{})
    sources=card_sources.get(cid,[])
    is_mvp=any(x['isMvp'] for x in sources); is_boss=is_mvp or any(x['isBoss'] for x in sources)
    rec=dict(old)
    rec.update({
        'id':cid,'officialId':cid,'aegisName':y.get('AegisName'),'name':y.get('Name'),'type':'card','category':'card','subCategory':'monster_card',
        'cardTarget':locations_to_targets(y.get('Locations')),'locations':y.get('Locations') or {},
        'description':clean_client_lines(info.get('description') or (item_official.get(cid) or {}).get('description') or []),
        'icon':f'images/items/{cid}.webp','slotCount':0,'slots':0,
        'scriptRaw':y.get('Script') or '','compiledScript':transform_script(y.get('Script') or ''),
        'dropSources':sources,'isMvpCard':is_mvp,'isBossCard':is_boss,
        'cardVisualTier':'mvp' if is_mvp else ('boss' if is_boss else 'normal'),
        'cardTierSourceMonsterIds':[x['monsterId'] for x in sources],
        'dataSource':'台服 itemInfo_UTF8.lub + 中文 item_db_etc + RO_WEB 0.9.82GR'
    })
    rec['Name']=rec['name']; rec['AegisName']=rec['aegisName']; rec['Type']='Card'; rec['dbType']='Card'
    cards[str(cid)]=rec; card_effects[str(cid)]=rec; card_drop[str(cid)]=sources
    item_changes.append({'itemId':cid,'oldName':old.get('name'),'newName':rec['name'],'kind':'card','scriptBytes':len(rec['scriptRaw']),'cardTargets':rec['cardTarget']})
write_json(cards_path,cards); write_json(card_effects_path,card_effects,compact=True); write_json(card_drop_path,card_drop,compact=True)

# Patch non-card active drops in all authoritative item files plus item_index.
item_files=[]
for path in sorted((ROOT/'data/items').glob('*.json')):
    try: doc=read_json(path)
    except Exception: continue
    if not isinstance(doc,dict): continue
    changed=False
    for iid in drop_ids:
        if iid in CARD_IDS or str(iid) not in doc: continue
        off=item_official.get(iid)
        if not off or not off.get('name'): continue
        rec=doc[str(iid)]; old=rec.get('name')
        rec['name']=off['name']; rec['Name']=off['name']
        if off.get('description'): rec['description']=off['description']
        rec['dataSource']='台服 itemInfo_UTF8.lub + RO_WEB 0.9.82GR'
        if old!=rec['name'] or path.name!='item_index.json':
            item_changes.append({'itemId':iid,'oldName':old,'newName':rec['name'],'kind':'drop','file':path.name})
        changed=True
    if changed:
        write_json(path,doc); item_files.append(path.relative_to(ROOT).as_posix())

# Replace relevant item_index cards with complete records after material pass.
idx_path=ROOT/'data/items/item_index.json'; idx=read_json(idx_path)
for cid in CARD_IDS: idx[str(cid)]=cards[str(cid)]
write_json(idx_path,idx)

# 5) Version/cache-bust only active app surface, preserving older audit filenames.
index_path=ROOT/'index.html'; txt=index_path.read_text(encoding='utf-8').replace('0.9.82GQ',VERSION); index_path.write_text(txt,encoding='utf-8')
game_path=ROOT/'js/game.js'; txt=game_path.read_text(encoding='utf-8').replace('const RO_WEB_VERSION = "0.9.82GQ"',f'const RO_WEB_VERSION = "{VERSION}"'); game_path.write_text(txt,encoding='utf-8')
for rel in ['js/ui_theme_runtime.js','css/style.css']:
    path=ROOT/rel; path.write_text(path.read_text(encoding='utf-8').replace('RO_WEB 0.9.82GQ',f'RO_WEB {VERSION}'),encoding='utf-8')
server_path=ROOT/'data/server_config.json'
if server_path.exists():
    server=read_json(server_path)
    def replace_version(o):
        if isinstance(o,dict):
            for k,v in o.items():
                if isinstance(v,str) and v=='0.9.82GQ': o[k]=VERSION
                else: replace_version(v)
        elif isinstance(o,list):
            for v in o: replace_version(v)
    replace_version(server); write_json(server_path,server)

# 6) Reports/manifests.
name_audit={
    'version':VERSION,'source':'skillinfoz原文版/skillinfolist.lub (Lua 5.1 bytecode extracted mapping)',
    'skillCount':1139,'coreNameChanges':len(skill_name_changes),'runtimeDuplicateNameChanges':len(runtime_name_updates),
    'missingOfficialNames':missing_skill_names,'changes':skill_name_changes,'synchronizedFiles':skill_sync_files,
    'descriptionPolicy':{'core1':'preserve RO_WEB Runtime/custom descriptions','core2Existing':'preserve existing Runtime descriptions','core2Pending':PENDING_DESC}
}
write_json(ROOT/f'SKILL_TW_NAME_AUDIT_{VERSION}.json',name_audit)
write_json(ROOT/f'EP19_MONSTER_ATLAS_AUDIT_{VERSION}.json',{'version':VERSION,'monsters':atlas_audit,'nameChanges':monster_name_changes,'requiredMotions':sorted(REQUIRED_MOTIONS),'requiredDirections':sorted(REQUIRED_DIRS)})
# Deduplicate item audit rows for presentation while retaining file list.
item_summary={}
for row in item_changes:
    key=(row['itemId'],row['kind'])
    item_summary.setdefault(key,{'itemId':row['itemId'],'kind':row['kind'],'oldNames':set(),'newName':row['newName'],'files':set()})
    if row.get('oldName'): item_summary[key]['oldNames'].add(row['oldName'])
    if row.get('file'): item_summary[key]['files'].add(row['file'])
item_rows=[]
for v in item_summary.values():
    v['oldNames']=sorted(v['oldNames']); v['files']=sorted(v['files']); item_rows.append(v)
item_rows.sort(key=lambda x:x['itemId'])
missing_iteminfo=[i for i in drop_ids if not item_official.get(i)]
missing_icons=[i for i in drop_ids if not (ROOT/f'images/items/{i}.webp').exists()]
write_json(ROOT/f'EP19_ITEM_AUDIT_{VERSION}.json',{'version':VERSION,'monsterIds':MONSTER_IDS,'activeDropItemIds':drop_ids,'activeDropItemCount':len(drop_ids),'missingItemInfoEntries':missing_iteminfo,'missingIcons':missing_icons,'changes':item_rows,'cardRuntimeCompleted':CARD_IDS})

manifest={
    'version':VERSION,'base':'0.9.82GQ','date':'2026-07-28',
    'features':['1,139 個玩家技能依台服 SkillInfoz 統一繁體中文名稱，保留 RO_WEB Runtime 效果說明','12 隻 EP19 怪物正式 PNG+JSON 動畫圖集取代單幀光球/煙霧替代圖','EP19 活躍掉落名稱與說明依 itemInfo_UTF8.lub 校正','11 張 EP19 卡片補齊插卡部位、效果腳本、掉落來源與 Runtime 記錄'],
    'monsterIds':MONSTER_IDS,'cardIds':CARD_IDS,
    'reports':[f'SKILL_TW_NAME_AUDIT_{VERSION}.json',f'EP19_MONSTER_ATLAS_AUDIT_{VERSION}.json',f'EP19_ITEM_AUDIT_{VERSION}.json',f'TEST_REPORT_{VERSION}.txt']
}
write_json(ROOT/f'UPDATE_MANIFEST_{VERSION}.json',manifest)

# Changelog / start-here prepend.
changelog=ROOT/'CHANGELOG.md'
entry=f'''# RO_WEB {VERSION}\n\n- 以 0.9.82GQ 為基準。\n- 玩家技能名稱依台服 SkillInfoz 統一為繁體中文；RO_WEB 已改造技能的公式、被動、Buff、召喚、坐騎與時序完全保留。\n- 12 隻 EP19 怪物改用 RO Studio V73/V74/V76 正式動畫圖集，移除單幀替代圖。\n- 校正冰鱗山丘／蛇巢穴活躍掉落的中文名稱與說明。\n- 11 張 EP19 卡片補齊可插部位、rAthena 腳本轉譯、掉落來源與卡片 Runtime。\n\n'''
changelog.write_text(entry+changelog.read_text(encoding='utf-8'),encoding='utf-8')
ai=ROOT/'AI_START_HERE.md'
ai_entry=f'''# {VERSION} 最新基準（2026-07-28）\n\n- 下一次修改必須以 {VERSION} 為唯一基準。\n- 技能名稱顯示以台服 SkillInfoz 為準；技能效果仍以 RO_WEB Runtime 為唯一權威，不得用官方原始說明覆蓋專案改造效果。\n- EP19 12 隻怪物已使用正式動畫圖集；不得恢復光球、煙霧或單幀 fallback。\n- EP19 卡片資料已補齊 Runtime 腳本與插卡部位；不得再由簡化 item stub 覆蓋。\n\n'''
ai.write_text(ai_entry+ai.read_text(encoding='utf-8'),encoding='utf-8')

print(json.dumps({'version':VERSION,'atlasMonsters':len(atlas_audit),'skillNameChanges':len(skill_name_changes),'runtimeNameChanges':len(runtime_name_updates),'missingSkillNames':len(missing_skill_names),'activeDropItems':len(drop_ids),'cardRuntimeCompleted':len(CARD_IDS),'itemFilesTouched':sorted(set(item_files))},ensure_ascii=False,indent=2))
