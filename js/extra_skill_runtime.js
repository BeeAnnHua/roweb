//=======================================
// ExtraSkillRuntime v0.9.82R
// 抄襲 / 繁殖 / 裝備 / 卡片等非本職技能來源管理
//=======================================
(function(){
  const SLOT_LABELS={plagiarism:"抄襲",reproduce:"繁殖",equipment:"裝備",card:"卡片"};
  const skillData=()=>typeof skillsData!=="undefined"?skillsData:window.skillsData;
  function normalize(){
    if(typeof player==="undefined"||!player)return {};
    const raw=player.extraSkills;
    player.extraSkills=(raw&&typeof raw==="object"&&!Array.isArray(raw))?raw:{};
    Object.keys(player.extraSkills).forEach(k=>{const e=player.extraSkills[k];if(!e||!Number(e.skillId)||Number(e.level)<=0)delete player.extraSkills[k];});
    return player.extraSkills;
  }
  function entries(){return Object.values(normalize());}
  function latestCopied(){return entries().filter(e=>["plagiarism","reproduce"].includes(String(e?.sourceType||""))).sort((a,b)=>Number(b?.acquiredAt||0)-Number(a?.acquiredAt||0))[0]||null;}
  function level(skillId){return entries().filter(e=>String(e.skillId)===String(skillId)).reduce((m,e)=>Math.max(m,Number(e.level||0)),0);}
  function sourceText(entry){return SLOT_LABELS[entry?.sourceType]||"其他來源";}
  function skillList(){
    const out=[];
    for(const e of entries()){
      const s=skillData()?.skillIndex?.[String(e.skillId)]; if(!s)continue;
      out.push({...s,extraSkill:true,extraSourceType:e.sourceType,extraSourceText:sourceText(e),extraSkillLevel:Number(e.level||1)});
    }
    const seen=new Set();return out.filter(s=>{const id=String(s.officialId??s.id);if(seen.has(id))return false;seen.add(id);return true;});
  }
  function setSlot(slotKey,skillId,skillLevel,meta={}){
    normalize(); const s=skillData()?.skillIndex?.[String(skillId)]; if(!s)return false;
    player.extraSkills[String(slotKey)]={slotKey:String(slotKey),skillId:Number(skillId),level:Math.max(1,Math.min(Number(skillLevel||1),Number(s.maxLevel||1))),sourceType:meta.sourceType||String(slotKey).split(":")[0],sourceId:meta.sourceId??null,sourceSlot:meta.sourceSlot??null,temporary:meta.temporary!==false,removeOnSourceLost:meta.removeOnSourceLost!==false,acquiredAt:Date.now()};
    if(typeof updateSkillUI==="function")updateSkillUI();if(typeof updateQuickSlotUI==="function")updateQuickSlotUI();if(typeof saveGame==="function")saveGame();return true;
  }
  function removeSlot(slotKey){normalize();delete player.extraSkills[String(slotKey)];if(typeof updateSkillUI==="function")updateSkillUI();if(typeof updateQuickSlotUI==="function")updateQuickSlotUI();}
  function collectGrantedSkills(item){
    const raw=item?.grantedSkills??item?.GrantedSkills??[]; const rows=Array.isArray(raw)?raw:[raw];
    return rows.map(x=>typeof x==="number"||typeof x==="string"?{skillId:Number(x),level:1}:{skillId:Number(x?.skillId??x?.SkillId??x?.id),level:Number(x?.level??x?.Level??1)}).filter(x=>x.skillId>0&&x.level>0);
  }
  function syncEquipment(){
    if(typeof player==="undefined"||!player)return;normalize();
    Object.keys(player.extraSkills).filter(k=>k.startsWith("equipment:")||k.startsWith("card:")).forEach(k=>delete player.extraSkills[k]);
    for(const [slot,itemId] of Object.entries(player.equipment||{})){
      if(!itemId)continue;const item=typeof getItemData==="function"?getItemData(itemId):null;if(!item)continue;
      collectGrantedSkills(item).forEach(g=>setSlot(`equipment:${slot}:${itemId}:${g.skillId}`,g.skillId,g.level,{sourceType:"equipment",sourceId:itemId,sourceSlot:slot,removeOnSourceLost:true}));
      const equipmentInstance=typeof getEquipmentInstance==='function'?getEquipmentInstance(slot):null;
      const cards=equipmentInstance?.cards??item.cards??item.Cards??[];
      (Array.isArray(cards)?cards:[]).forEach(cardId=>{const card=typeof getItemData==="function"?getItemData(cardId):null;collectGrantedSkills(card).forEach(g=>setSlot(`card:${slot}:${cardId}:${g.skillId}`,g.skillId,g.level,{sourceType:"card",sourceId:cardId,sourceSlot:slot,removeOnSourceLost:true}));});
    }
  }
  function dataFor(mode){const key=mode==="reproduce"?"reproduce":"plagiarism";return skillData()?.copyableSkills?.[key]||[];}
  function close(){document.getElementById("skill-copy-modal")?.classList.add("hidden-window");}
  function open(mode,sourceLevel){
    const modal=document.getElementById("skill-copy-modal");if(!modal)return false;
    modal.dataset.copyMode=mode;modal.dataset.sourceLevel=String(sourceLevel||1);modal.classList.remove("hidden-window");
    const title=modal.querySelector(".skill-copy-title");if(title)title.textContent=mode==="reproduce"?"繁殖技能選擇":"抄襲技能選擇";
    render();return true;
  }
  function render(){
    const modal=document.getElementById("skill-copy-modal");if(!modal)return;const mode=modal.dataset.copyMode||"plagiarism",lv=Number(modal.dataset.sourceLevel||1),q=String(modal.querySelector("#skill-copy-search")?.value||"").trim().toLowerCase();
    const all=dataFor(mode),ready=all.filter(x=>x.runtimeReady),filtered=ready.filter(x=>!q||String(x.name).toLowerCase().includes(q)||String(x.skillKey).toLowerCase().includes(q)||String(x.skillId).includes(q));
    const summary=modal.querySelector(".skill-copy-summary");if(summary)summary.textContent=`RA 可複製 ${all.length} 招；目前 Runtime 可選 ${ready.length} 招。`;
    const list=modal.querySelector(".skill-copy-list");if(!list)return;list.innerHTML="";
    for(const row of filtered){const copyLv=Math.max(1,Math.min(lv,Number(row.maxLevel||1)));const b=document.createElement("button");b.type="button";b.className="skill-copy-entry";b.innerHTML=`<img src="./images/skills/${row.skillId}.png" alt=""><span><b>${row.name}</b><small>${row.skillKey} · Lv${copyLv}</small></span>`;b.onclick=()=>select(mode,row.skillId,copyLv);list.appendChild(b);}
    if(!filtered.length)list.innerHTML='<div class="skill-copy-empty">沒有符合條件且已完成 Runtime 的技能。</div>';
  }
  function select(mode,skillId,copyLv){
    const other=mode==="reproduce"?"plagiarism":"reproduce";const dup=normalize()[other];if(dup&&String(dup.skillId)===String(skillId))delete player.extraSkills[other];
    setSlot(mode,skillId,copyLv,{sourceType:mode,sourceId:mode,temporary:true,removeOnSourceLost:false});
    const s=skillData()?.skillIndex?.[String(skillId)];if(typeof addBattleLog==="function")addBattleLog(`${mode==="reproduce"?"繁殖":"抄襲"}取得 ${s?.name||skillId} Lv${copyLv}，已加入「其他技能」。`);close();
  }
  function canCopy(mode,skillId){return dataFor(mode).some(x=>String(x.skillId)===String(skillId)&&x.runtimeReady);}
  function preserveActive(){
    if(typeof player==="undefined"||!player)return false;
    const buff=player.activeBuffs?.["475"]||player.activeBuffs?.[475];
    return !!buff&&Number(buff.expiresAt||0)>Date.now()&&Number(buff.effects?.copyProtection||0)>0;
  }
  function onHit(skillId,incomingLevel,preferredMode=null){
    const pLv=typeof getNativeSkillLevel==="function"?getNativeSkillLevel(225):0,rLv=typeof getNativeSkillLevel==="function"?getNativeSkillLevel(2285):0;
    let mode=preferredMode;if(!mode)mode=rLv>0&&canCopy("reproduce",skillId)?"reproduce":pLv>0&&canCopy("plagiarism",skillId)?"plagiarism":null;if(!mode)return false;
    const sourceLv=mode==="reproduce"?rLv:pLv, s=skillData()?.skillIndex?.[String(skillId)];if(!s)return false;
    if(preserveActive()&&normalize()[mode]){if(typeof addBattleLog==="function")addBattleLog(`自由保護生效，${mode==="reproduce"?"繁殖":"抄襲"}技能未被覆蓋。`);return false;}
    return setSlot(mode,skillId,Math.min(Number(incomingLevel||1),sourceLv,Number(s.maxLevel||1)),{sourceType:mode,sourceId:"monster_hit",temporary:true,removeOnSourceLost:false});
  }
  document.addEventListener("DOMContentLoaded",()=>{document.getElementById("skill-copy-search")?.addEventListener("input",render);document.querySelector("#skill-copy-modal .skill-copy-close")?.addEventListener("click",close);});
  Object.assign(window,{normalizeExtraSkillData:normalize,getExtraSkillEntries:entries,getLatestCopiedSkillEntry:latestCopied,getExtraSkillLevel:level,getExtraSkillSkillList:skillList,setExtraSkillSlot:setSlot,removeExtraSkillSlot:removeSlot,syncEquipmentGrantedSkills:syncEquipment,openSkillCopySelector:open,closeSkillCopySelector:close,selectCopiedSkill:select,onPlayerHitByCopyableSkill:onHit,getExtraSkillSourceText:sourceText});
})();
