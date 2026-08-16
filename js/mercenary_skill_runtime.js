//============================================================
// RO_WEB V0.9.88B9 — 傭兵技能白名單、選擇 UI 與友軍／攻擊 AI
// 白名單只決定可選技能；實際公式、成本、延遲與特效一律交回 Skill Engine。
//============================================================
(() => {
  "use strict";
  const VERSION="0.9.88B9";
  const ATTACK_SKILL_IDS=Object.freeze([
    5,62,56,397,2002,2006,2004,2008,5004,253,254,368,2308,2307,2317,
    19,17,20,21,14,13,84,89,85,83,400,2211,2213,2214,2204,2216,2202,
    91,2454,2447,2446,2448,2445,2449,42,153,485,2280,2279,2259,2260,
    2261,230,229,490,2477,2483,2476,136,406,379,2022,5001,212,2285,
    2288,156,79,2038,2040,266,267,271,370,372,2330,2332,2343,2327,46,
    129,382,381,2233,316,394,2414,2418,324,5204,5205,5208,6001,5210,
    5211,5213,6502,5263,5264,5265,5266,5267,6504,6503,6505,5214,5215,
    5216,5217,5218,5220,5221,5222,5225,5227,5229,5230,5233,5234,5235,
    5237,5369,5370,5371,5372,5373,5380,6517,5295,5296,6002,6003,6004,
    6506,6507,6508,5340,5341,5342,5343,6005,6006,6509,6510,5287,5289,
    5291,5292,5294,6511,5314,5315,5316,5319,5320,5321,5322,6512,6513,
    6514,6515,5273,5277,5279,5283,5284,6518,5241,5243,5244,5245,5248,
    5249,5250,5251,5252,5253,6519,5326,5329,5330,5331,5332,5333,5334,
    5335,6520,5353,5355,5356,5357,6521,5451,5453,5455,5456,5457,5458,
    5452,5454,5459,5460
  ]);
  const GROUP_SUPPORT_SKILL_IDS=Object.freeze([
    33,66,67,69,74,75,2041,2042,2044,2045,2047,2048,2050,5269,5278,
    155,111,112,113,459,2273,2274,5338,383,307,309,310,312,313,319,320,
    321,322,327,329,330,2350,2351,2352,2381,2382,2423,2427,2428,2431,
    2434,5007,5361,5362,5364,285,286,287,2452,2465,2466,2467,2468,5008,
    369,2322,5013,5256,5261,5076,70,478,2043,5280
  ]);
  const SINGLE_SUPPORT_SKILL_IDS=Object.freeze([
    28,35,53,71,72,73,2051,2345,2421,5268,29,34,68,138,255,361,2053,
    2383,2451,2515,5271,5272,5275,5281,5282,5339,5366,5298,5299,54
  ]);
  const SUPPORT_SKILL_IDS=Object.freeze([...new Set([...GROUP_SUPPORT_SKILL_IDS,...SINGLE_SUPPORT_SKILL_IDS])]);
  const GROUP_SET=new Set(GROUP_SUPPORT_SKILL_IDS);
  const GROUP_HEAL_SET=new Set([70,478,2043,5280]);
  const HEAL_SET=new Set([28,478,2043,2051,2345,5268,5280]);
  const CURE_RULES=Object.freeze({
    35:{group:false,statuses:["silence","blind","confusion"]},
    72:{group:false,statuses:["stun","freeze","stone","sleep","blind","silence","confusion"]},
    2047:{group:true,statuses:["freeze","stone","blind","burning","freezing","crystalize","crystallize"],chance:[70,80,90,100]},
    2048:{group:true,statuses:["sleep","stun","silence","mandragora","deepsleep"],chance:[70,80,90,100]}
  });
  const drafts={};
  const n=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,n(value,0)));
  const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
  const clone=value=>{try{return structuredClone(value)}catch(_){}try{return JSON.parse(JSON.stringify(value))}catch(_){return value}};
  const normalizeIds=value=>[...new Set((Array.isArray(value)?value:[]).map(row=>Math.floor(n(row,0))).filter(Boolean))];
  const skillId=skill=>Number(skill?.officialId??skill?.skillId??skill?.id??0);

  function getSkill(id){
    try{return typeof getSkillDataById==="function"?getSkillDataById(Number(id),true):null}catch(_){return null}
  }
  function learnedLevel(snapshot,id){
    const skill=getSkill(id),learned=snapshot?.learnedSkills||{};
    const keys=[id,skill?.officialId,skill?.id,skill?.key,skill?.code].filter(value=>value!==undefined&&value!==null&&String(value)!=="").map(String);
    for(const key of keys){const raw=learned[key],level=raw&&typeof raw==="object"?n(raw.level??raw.skillLevel??raw.value,0):n(raw,0);if(level>0)return Math.floor(level)}
    return 0;
  }
  function copiedSkill(snapshot){
    const rows=Object.values(snapshot?.extraSkills||{}).filter(row=>String(row?.sourceType||row?.slotKey||"").toLowerCase().includes("reproduce"));
    return rows.sort((a,b)=>n(b.acquiredAt)-n(a.acquiredAt))[0]||null;
  }
  function catalogRows(snapshot,kind){
    const ids=kind==="attack"?ATTACK_SKILL_IDS:SUPPORT_SKILL_IDS;
    return ids.map(id=>{
      const level=learnedLevel(snapshot,id),skill=level>0?getSkill(id):null;
      if(!skill||level<=0)return null;
      let name=String(skill.name||skill.key||`技能 ${id}`),note=kind==="attack"?"攻擊":"輔助";
      if(id===2285){const copied=copiedSkill(snapshot),copiedData=copied?getSkill(copied.skillId):null;if(copiedData)name=`${name}：${copiedData.name}`,note=`繁殖 Lv${Math.max(1,n(copied.level,1))}`;else note="尚未設定繁殖技能";}
      if(CURE_RULES[id])note=CURE_RULES[id].group?"群體異常解除":"單體異常解除";
      else if(id===54)note="友軍復活";
      else if(HEAL_SET.has(id)||GROUP_HEAL_SET.has(id))note=GROUP_SET.has(id)?"群體恢復":"單體恢復";
      else if(kind==="support")note=GROUP_SET.has(id)?"群體增益":"單體增益";
      return {id,level,name,note,icon:String(skill.icon||`images/skills/${skillId(skill)||id}.png`)};
    }).filter(Boolean);
  }

  function currentSelection(characterId,context={}){
    const id=String(characterId||"");
    if(drafts[id])return drafts[id];
    const runtime=context.runtimeSettings?.[id]||window.ROWebMercenaryRuntime?.getRuntimeMembers?.().find(row=>row.characterId===id)||{};
    const saved=context.savedSettings?.[id]||{};
    return {
      selectedAttackSkills:normalizeIds(runtime.selectedAttackSkills??saved.selectedAttackSkills),
      selectedSupportSkills:normalizeIds(runtime.selectedSupportSkills??saved.selectedSupportSkills)
    };
  }
  function updateButton(panel,index,context){
    const id=String(panel.querySelector(`#mercenarySelect${index+1}`)?.value||""),button=panel.querySelector(`.mercenary-skill-button[data-slot="${index}"]`);
    if(!button)return;button.disabled=!id;
    const selection=currentSelection(id,context),count=selection.selectedAttackSkills.length+selection.selectedSupportSkills.length;
    button.textContent=id?(count?`技能設定 (${count})`:"技能設定"):"技能設定";
  }
  function closeEditor(panel){const editor=panel?.querySelector("#mercenarySkillEditor");if(editor){editor.hidden=true;editor.innerHTML="";}}
  function renderList(rows,selected,kind){
    return rows.length?rows.map(row=>`<label class="mercenary-skill-entry"><input type="checkbox" data-kind="${kind}" value="${row.id}" ${selected.has(row.id)?"checked":""}><img src="${esc(row.icon)}" alt="" loading="lazy"><span><b>${esc(row.name)}</b><small>${esc(row.note)}・Lv${row.level}・ID ${row.id}</small></span></label>`).join(""):`<div class="mercenary-skill-empty">這名角色目前沒有已學會且列入${kind==="attack"?"攻擊":"輔助"}白名單的技能。</div>`;
  }
  function openEditor(panel,index,context){
    const id=String(panel.querySelector(`#mercenarySelect${index+1}`)?.value||""),snapshot=(context.available||[]).find(row=>String(row.characterId)===id),editor=panel.querySelector("#mercenarySkillEditor");
    if(!id||!snapshot||!editor)return false;
    const attacks=catalogRows(snapshot,"attack"),supports=catalogRows(snapshot,"support"),selection=currentSelection(id,context),selectedAttack=new Set(selection.selectedAttackSkills),selectedSupport=new Set(selection.selectedSupportSkills);
    editor.hidden=false;editor.innerHTML=`<div class="mercenary-skill-editor-head"><div><b>${esc(snapshot.name)}｜技能設定</b><span>${esc(snapshot.jobName)}・只顯示角色已學會且列入傭兵目錄的技能</span></div><button class="mercenary-skill-editor-close" type="button">×</button></div>
      <div class="mercenary-skill-tabs"><button type="button" class="is-active" data-tab="attack">攻擊技能 <small>${attacks.length}</small></button><button type="button" data-tab="support">輔助技能 <small>${supports.length}</small></button></div>
      <div class="mercenary-skill-tab-panel" data-panel="attack"><div class="mercenary-skill-toolbar"><span>SP 不足、冷卻中或沒有可用技能時改用普通攻擊</span><span><button data-action="all-attack" type="button">全部勾選</button><button data-action="none-attack" type="button">全部取消</button></span></div><div class="mercenary-skill-list">${renderList(attacks,selectedAttack,"attack")}</div></div>
      <div class="mercenary-skill-tab-panel" data-panel="support" hidden><div class="mercenary-skill-toolbar"><span>治療／解除／復活會先偵測有效友軍目標</span><span><button data-action="all-support" type="button">全部勾選</button><button data-action="none-support" type="button">全部取消</button></span></div><div class="mercenary-skill-list">${renderList(supports,selectedSupport,"support")}</div></div>
      <div class="mercenary-skill-editor-actions"><span>儲存後請再按「套用隊伍」生效。</span><button data-action="cancel" type="button">取消</button><button data-action="save" class="primary" type="button">儲存選擇</button></div>`;
    editor.querySelector(".mercenary-skill-editor-close")?.addEventListener("click",()=>closeEditor(panel));
    editor.querySelector('[data-action="cancel"]')?.addEventListener("click",()=>closeEditor(panel));
    editor.querySelectorAll(".mercenary-skill-tabs button").forEach(button=>button.addEventListener("click",()=>{const tab=button.dataset.tab;editor.querySelectorAll(".mercenary-skill-tabs button").forEach(node=>node.classList.toggle("is-active",node===button));editor.querySelectorAll(".mercenary-skill-tab-panel").forEach(node=>node.hidden=node.dataset.panel!==tab);}));
    for(const kind of ["attack","support"]){editor.querySelector(`[data-action="all-${kind}"]`)?.addEventListener("click",()=>editor.querySelectorAll(`input[data-kind="${kind}"]`).forEach(input=>input.checked=true));editor.querySelector(`[data-action="none-${kind}"]`)?.addEventListener("click",()=>editor.querySelectorAll(`input[data-kind="${kind}"]`).forEach(input=>input.checked=false));}
    editor.querySelector('[data-action="save"]')?.addEventListener("click",()=>{drafts[id]={selectedAttackSkills:[...editor.querySelectorAll('input[data-kind="attack"]:checked')].map(input=>Number(input.value)),selectedSupportSkills:[...editor.querySelectorAll('input[data-kind="support"]:checked')].map(input=>Number(input.value))};updateButton(panel,index,context);const message=panel.querySelector("#mercenaryMessage");if(message)message.textContent=`已暫存 ${snapshot.name} 的攻擊 ${drafts[id].selectedAttackSkills.length} 招、輔助 ${drafts[id].selectedSupportSkills.length} 招；請按「套用隊伍」。`;closeEditor(panel);});
    return true;
  }
  function decoratePanel(panel,context={}){
    if(!panel)return false;
    panel.querySelectorAll(".mercenary-slot-row").forEach((row,index)=>{let button=row.querySelector(".mercenary-skill-button");if(!button){button=document.createElement("button");button.type="button";button.className="mercenary-skill-button";button.dataset.slot=String(index);row.appendChild(button);}button.addEventListener("click",()=>openEditor(panel,index,context));panel.querySelector(`#mercenarySelect${index+1}`)?.addEventListener("change",()=>{closeEditor(panel);updateButton(panel,index,context);});updateButton(panel,index,context);});
    if(!panel.querySelector("#mercenarySkillEditor")){const editor=document.createElement("section");editor.id="mercenarySkillEditor";editor.className="mercenary-skill-editor";editor.hidden=true;panel.appendChild(editor);}
    return true;
  }

  function allies(){
    const owner=window.player?[{owner:true,characterId:String(window.player.characterId||"player"),ref:window.player,hp:n(window.player.hp),maxHp:Math.max(1,n(window.player.maxHp,1)),dead:n(window.player.hp)<=0}]:[];
    return owner.concat((window.ROWebMercenaryRuntime?.getRuntimeMembers?.()||[]).map(ref=>({owner:false,characterId:ref.characterId,ref,hp:n(ref.hp),maxHp:Math.max(1,n(ref.maxHp,1)),dead:ref.dead===true||n(ref.hp)<=0})));
  }
  function statusKey(value){return String(value||"").toLowerCase().replace(/[ _-]/g,"")}
  function hasStatus(ally,names){const state=ally?.ref?.runtimeState||{},statuses=state.statuses||{};return names.some(name=>{const key=statusKey(name);return !!(statuses[key]||statuses[name]||state[key]||state[name]);});}
  function clearStatuses(ally,names){
    if(!ally)return 0;
    if(!ally.owner)return n(window.ROWebMercenaryRuntime?.clearStatuses?.(ally.characterId,names),0);
    const state=ally.ref.runtimeState=ally.ref.runtimeState||{},statuses=state.statuses=state.statuses||{};let removed=0;
    for(const name of names){const key=statusKey(name);if(statuses[key]||statuses[name]||state[key]||state[name])removed++;delete statuses[key];delete statuses[name];delete state[key];delete state[name];}
    return removed;
  }
  function buffOf(ally,id){const buff=ally?.ref?.activeBuffs?.[String(id)]||ally?.ref?.activeBuffs?.[id];return buff&&n(buff.expiresAt)>Date.now()+2500?buff:null;}
  function copyBuffSpec(buff,id,skill,level,filter=null){return {skillId:id,id,name:String(buff?.name||skill?.name||"傭兵增益"),level,effects:clone(buff?.effects||{}),durationMs:Math.max(250,n(buff?.expiresAt)-Date.now()),exclusiveBuffGroup:buff?.exclusiveBuffGroup||null,periodicHpHealRate:n(buff?.periodicHpHealRate),periodicHpHealFlat:n(buff?.periodicHpHealFlat),periodicHpIntervalMs:n(buff?.periodicHpIntervalMs),periodicSpHealRate:n(buff?.periodicSpHealRate),periodicSpHealFlat:n(buff?.periodicSpHealFlat),periodicSpHealIntervalMs:n(buff?.periodicSpHealIntervalMs),periodicHealFormula:buff?.periodicHealFormula||null,periodicHealLevel:level,periodicClearStatuses:clone(buff?.periodicClearStatuses||[]),followOwnerBuff:false,filter};}
  function applyBuffToOwner(spec,buff){
    const owner=window.player;if(!owner)return false;owner.activeBuffs=owner.activeBuffs||{};owner.activeBuffs[String(spec.skillId)]={...clone(buff),id:spec.skillId,sourceSkillId:spec.skillId,startedAt:Date.now(),expiresAt:Date.now()+spec.durationMs};
    try{window.recalculatePlayerStats?.();window.updatePlayerUI?.();window.saveGame?.("mercenary-party-buff")}catch(_){}return true;
  }
  function distributeBuff(member,target,skill,level,buff,group){
    if(!buff)return false;const id=skillId(skill),runtime=window.ROWebMercenaryRuntime,spec=copyBuffSpec(buff,id,skill,level,group?null:(row=>String(row.characterId)===String(target?.characterId)));
    if(group){runtime?.applyBuffToParty?.(spec);applyBuffToOwner(spec,buff);}
    else if(target?.owner)applyBuffToOwner(spec,buff);else runtime?.applyBuffToParty?.(spec);
    if(!group&&String(target?.characterId)!==String(member.characterId)){delete member.activeBuffs?.[String(id)];delete member.activeBuffs?.[id];runtime?.recalculateMember?.(member.characterId);}
    return true;
  }
  function applyHeal(target,amount){if(!target||target.dead||amount<=0)return 0;if(target.owner){const before=n(target.ref.hp);target.ref.hp=Math.min(n(target.ref.maxHp,1),before+amount);window.updatePlayerUI?.();return Math.max(0,target.ref.hp-before);}return n(window.ROWebMercenaryRuntime?.heal?.(target.characterId,amount)?.healed,0);}
  function healTargets(member,target,amount,group){let total=0;for(const ally of (group?allies().filter(row=>!row.dead):[target]))total+=applyHeal(ally,amount);if(total>0)window.addBattleLog?.(`${member.name} 的治療共恢復 ${Math.floor(total)} HP。`,"mercenary");return total;}

  function resolveCopiedAttack(member,id,level){if(id!==2285)return {id,level};const copied=copiedSkill(member.snapshot);return copied?{id:Number(copied.skillId),level:Math.max(1,n(copied.level,1)),via:2285}:null;}
  function preview(member,target,id,level){return window.ROWebMercenarySkillBridge?.preview?.(member,target,id,level)||{ok:false,reason:"SKILL_BRIDGE_NOT_READY"};}
  function executeAttack(member,target,id,level){const resolved=resolveCopiedAttack(member,id,level);if(!resolved||!target||n(target.currentHp)<=0)return false;const result=window.ROWebMercenarySkillBridge?.cast?.(member,target,resolved.id,resolved.level,{sourceSkillId:id});if(result?.used){member.lastActionAt=Date.now();member.lastCombatAt=Date.now();if(n(target.currentHp)<=0)setTimeout(()=>{try{window.defeatMonster?.(target)}catch(_){}},0);return true;}return false;}
  function executeCure(member,id,level){const rule=CURE_RULES[id],living=allies().filter(row=>!row.dead),affected=living.filter(row=>hasStatus(row,rule.statuses));if(!affected.length)return false;const result=window.ROWebMercenarySkillBridge?.consume?.(member,affected[0]?.ref||null,id,level);if(!result?.used)return false;const targets=rule.group?affected:[affected[0]],chance=Array.isArray(rule.chance)?n(rule.chance[Math.max(0,level-1)],100):100;let removed=0;for(const target of targets)if(Math.random()*100<chance)removed+=clearStatuses(target,rule.statuses);window.addBattleLog?.(`${member.name} 使用 ${getSkill(id)?.name||id}，解除 ${removed} 個友軍異常狀態。`,"mercenary");member.lastActionAt=Date.now();return true;}
  function executeResurrection(member,id,level){const target=allies().find(row=>row.dead);if(!target)return false;const result=window.ROWebMercenarySkillBridge?.consume?.(member,target.ref,id,level);if(!result?.used)return false;const hpRates=[10,30,50,80],hpRate=n(hpRates[Math.max(0,level-1)],80)/100;let revived=false;if(target.owner)revived=window.DeathRevivalRuntime?.reviveBySkill?.({hpRate,spRate:0,source:member.name})===true;else revived=window.ROWebMercenaryRuntime?.resurrect?.(target.characterId,{hpRate,spRate:0})===true;if(revived)window.addBattleLog?.(`${member.name} 使用復活術救起 ${target.ref?.name||"友軍"}。`,"mercenary");member.lastActionAt=Date.now();return revived;}
  function executeSupport(member,id,level){
    if(id===54)return executeResurrection(member,id,level);if(CURE_RULES[id])return executeCure(member,id,level);
    const skill=getSkill(id),profile=window.getSkillRuntimeProfile?.(skill)||{},living=allies().filter(row=>!row.dead);
    if(!skill||!living.length)return false;
    if(id===70){const result=window.ROWebMercenarySkillBridge?.cast?.(member,null,id,level);if(result?.used){member.lastActionAt=Date.now();return true;}return false;}
    if(HEAL_SET.has(id)){const target=living.sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];if(!target||target.hp/target.maxHp>0.78)return false;const result=window.ROWebMercenarySkillBridge?.heal?.(member,target.ref,id,level);if(!result?.used)return false;healTargets(member,target,n(result.healAmount),GROUP_HEAL_SET.has(id));member.lastActionAt=Date.now();return true;}
    if(String(profile.handler)!=="buff")return false;
    const group=GROUP_SET.has(id),target=group?(living.some(row=>!buffOf(row,id))?living[0]:null):living.find(row=>!buffOf(row,id));if(!target)return false;
    const result=window.ROWebMercenarySkillBridge?.cast?.(member,target.ref,id,level);if(!result?.used)return false;distributeBuff(member,target,skill,level,result.buff,group);member.lastActionAt=Date.now();return true;
  }
  function beginOrExecute(member,target,id,level,kind,now){
    const actual=kind==="attack"?resolveCopiedAttack(member,id,level):{id,level};if(!actual)return false;
    const check=preview(member,target,actual.id,actual.level);if(!check.ok)return false;
    const castMs=Math.max(0,n(check.timing?.cast?.totalMs));
    if(castMs>0){const begun=window.ROWebMercenarySkillBridge?.begin?.(member,target,actual.id,actual.level);if(!begun?.ok)return false;member.pendingSkillCast={kind,listedId:id,skillId:actual.id,level:actual.level,target,executeAt:now+castMs};member.aiState="CAST";return true;}
    return kind==="attack"?executeAttack(member,target,id,level):executeSupport(member,id,level);
  }
  function finishPending(member,now){const pending=member.pendingSkillCast;if(!pending)return null;if(now<n(pending.executeAt))return true;member.pendingSkillCast=null;return pending.kind==="attack"?executeAttack(member,pending.target,pending.listedId,pending.level):executeSupport(member,pending.listedId,pending.level);}
  function tryAct(member,target,now=Date.now()){
    if(!member||member.dead)return false;const pending=finishPending(member,now);if(pending!==null)return pending;
    const kind=member.mode==="support"?"support":"attack",ids=normalizeIds(kind==="attack"?member.selectedAttackSkills:member.selectedSupportSkills);if(!ids.length)return false;
    const rows=[];for(const id of ids){const level=learnedLevel(member.snapshot,id);if(level>0)rows.push({id,level});}
    if(!rows.length)return false;const cursor=Math.max(0,n(member.skillAiCursor?.[kind]))%rows.length;
    for(let offset=0;offset<rows.length;offset++){const row=rows[(cursor+offset)%rows.length];if(kind==="attack"&&!target&&row.id!==2445)continue;if(kind==="support"){
        if(row.id===54&&!allies().some(ally=>ally.dead))continue;
        if(CURE_RULES[row.id]&&!allies().some(ally=>!ally.dead&&hasStatus(ally,CURE_RULES[row.id].statuses)))continue;
      }
      if(beginOrExecute(member,target,row.id,row.level,kind,now)){member.skillAiCursor=member.skillAiCursor||{};member.skillAiCursor[kind]=(cursor+offset+1)%rows.length;return true;}
    }
    return false;
  }

  window.ROWebMercenarySkillRuntime=Object.freeze({version:VERSION,attackSkillIds:[...ATTACK_SKILL_IDS],supportSkillIds:[...SUPPORT_SKILL_IDS],groupSupportSkillIds:[...GROUP_SUPPORT_SKILL_IDS],decoratePanel,tryAct,getDraftSelection:id=>drafts[String(id||"")]?clone(drafts[String(id||"")]):null,clearDraftSelections(){for(const key of Object.keys(drafts))delete drafts[key];},getCatalogForSnapshot:(snapshot,kind)=>clone(catalogRows(snapshot,kind))});
})();
