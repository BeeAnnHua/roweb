// ============================================================
// 彼岸花仙境 / RO_WEB - In-game Mail Runtime V0.9.85I
// ============================================================
(function(){
  "use strict";
  const VERSION="0.9.85I";
  const REFRESH_MS=60000;
  let mails=[];
  let selectedMailId="";
  let refreshTimer=null;
  let busy=false;
  let gmAccess=false;
  // V0.9.85H: finalized claims stay locally authoritative until the next server list catches up.
  // This prevents a just-claimed attachment button from reappearing because of an immediately refreshed stale row.
  const confirmedClaimedIds=new Map();

  const el=id=>document.getElementById(id);
  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const fmtTime=value=>{ if(!value)return ""; const d=new Date(value); return Number.isNaN(d.getTime())?"":d.toLocaleString("zh-TW",{hour12:false}); };
  const client=()=>window.ROWebCloudRuntime?.getClient?.()||null;
  const account=()=>window.ROWebCloudRuntime?.getAccount?.()||null;
  const activeCharacter=()=>window.CharacterSlotsRuntime?.getActiveContext?.()||{};

  function friendly(error){
    const raw=String(error?.message||error||"未知錯誤");
    if(/RO_MAIL_NOT_FOUND/i.test(raw))return "找不到這封信，可能已被移除。";
    if(/RO_MAIL_EXPIRED/i.test(raw))return "這封信的附件已超過領取期限。";
    if(/RO_MAIL_NO_REWARD/i.test(raw))return "這封信沒有可領取的附件。";
    if(/RO_ACCOUNT_PERMISSION_DENIED/i.test(raw))return "目前遊戲帳號沒有此信箱的操作權限。";
    if(/RO_GM_PERMISSION_DENIED/i.test(raw))return "目前遊戲帳號沒有 GM CENTER 權限。";
    if(/permission|denied|JWT|session/i.test(raw))return "登入權限已失效，請重新登入。";
    if(/fetch|network/i.test(raw))return "目前無法連線到信箱伺服器。";
    return raw;
  }

  function rewardRows(mail){
    const rows=Array.isArray(mail?.attachments)?mail.attachments:[];
    return rows.map(row=>{
      const id=Number(row?.item_id||0), amount=Math.max(1,Number(row?.amount||1));
      const data=typeof window.getItemData==="function"?window.getItemData(id):null;
      return {id,amount,name:String(data?.name||row?.name||`Item ${id}`),icon:String(data?.icon||`images/items/${id}.webp`)};
    }).filter(row=>row.id>0);
  }

  function hasReward(mail){
    return Number(mail?.zeny||0)>0||Number(mail?.blue_gem||0)>0||Number(mail?.red_gem||0)>0||(Array.isArray(mail?.attachments)&&mail.attachments.length>0);
  }
  function isExpired(mail){return Boolean(mail?.expires_at&&new Date(mail.expires_at).getTime()<=Date.now());}
  function effectiveClaimedAt(mail){
    const id=String(mail?.mail_id||"");
    const receipt=getLocalReceipt(id);
    const localAt=receipt?.receivedAt?new Date(Number(receipt.receivedAt)).toISOString():"";
    // V0.9.85I: once the reward is already in the active character and the anti-duplicate
    // receipt exists, the player-facing UI must immediately become claimed. Server finalize
    // may continue in the background/reconciliation path, but the claim button never returns.
    return mail?.claimed_at||confirmedClaimedIds.get(id)||localAt||"";
  }
  function isClaimable(mail){return Boolean(mail&&!effectiveClaimedAt(mail)&&!isExpired(mail)&&hasReward(mail));}
  function mergeConfirmedClaims(rows){
    for(const mail of rows){
      const id=String(mail?.mail_id||"");
      if(!id)continue;
      if(mail?.claimed_at){confirmedClaimedIds.set(id,String(mail.claimed_at));continue;}
      const confirmed=confirmedClaimedIds.get(id);
      if(confirmed){mail.claimed_at=confirmed;mail.is_read=true;mail.read_at=mail.read_at||confirmed;}
    }
    return rows;
  }

  function renderList(){
    const host=el("mailList"); if(!host)return;
    const filter=String(el("mailFilter")?.value||"all");
    const shown=mails.filter(m=>filter==="unread"?!m.is_read:filter==="reward"?isClaimable(m):true);
    if(!shown.length){host.innerHTML='<div class="mail-empty">目前沒有符合條件的郵件。</div>';return;}
    host.innerHTML=shown.map(m=>{
      const active=String(m.mail_id)===selectedMailId?" is-active":"";
      const unread=!m.is_read?" is-unread":"";
      let reward="";
      if(hasReward(m)){
        if(effectiveClaimedAt(m))reward='<span class="mail-reward-dot is-claimed">已領取</span>';
        else if(isExpired(m))reward='<span class="mail-reward-dot is-expired">已過期</span>';
        else reward='<span class="mail-reward-dot">附件</span>';
      }
      return `<button class="mail-row${active}${unread}" type="button" data-mail-id="${esc(m.mail_id)}"><span class="mail-row-top"><b>${esc(m.subject)}</b>${reward}</span><span>${esc(m.sender_name||"GM CENTER")}</span><small>${esc(fmtTime(m.created_at))}</small></button>`;
    }).join("");
    host.querySelectorAll("[data-mail-id]").forEach(btn=>btn.addEventListener("click",()=>selectMail(btn.dataset.mailId)));
  }

  function renderDetail(){
    const host=el("mailDetail"); if(!host)return;
    const mail=mails.find(m=>String(m.mail_id)===selectedMailId);
    if(!mail){host.innerHTML='<div class="mail-empty mail-detail-empty">請從左側選擇郵件。</div>';return;}
    const rewards=rewardRows(mail);
    const expired=isExpired(mail);
    const rewardHtml=[
      ...rewards.map(row=>`<div class="mail-attachment"><img src="${esc(row.icon)}" alt=""><span><b>${esc(row.name)}</b><small>Item ID ${row.id}</small></span><strong>× ${row.amount.toLocaleString()}</strong></div>`),
      Number(mail.zeny||0)>0?`<div class="mail-attachment mail-zeny"><img src="images/ui/icons/icon_gold_64.png" alt=""><span><b>Zeny</b><small>遊戲貨幣</small></span><strong>${Number(mail.zeny).toLocaleString()}</strong></div>`:"",
      Number(mail.blue_gem||0)>0?`<div class="mail-attachment mail-blue-gem"><img src="images/ui/icons/icon_blue_gem_64.png" alt=""><span><b>藍寶石</b><small>商城貨幣</small></span><strong>× ${Number(mail.blue_gem).toLocaleString()}</strong></div>`:"",
      Number(mail.red_gem||0)>0?`<div class="mail-attachment mail-red-gem"><img src="images/ui/icons/icon_red_gem_64.png" alt=""><span><b>紅寶石</b><small>商城貨幣</small></span><strong>× ${Number(mail.red_gem).toLocaleString()}</strong></div>`:""
    ].join("");
    const mailHasReward=hasReward(mail);
    const claimedAt=effectiveClaimedAt(mail);
    const showReward=mailHasReward&&!claimedAt;
    const claimLabel=expired?"附件已過期":"領取附件";
    const claimMeta=claimedAt?`附件已領取${claimedAt?`（${esc(fmtTime(claimedAt))}）`:""}`:mail.expires_at?`領取期限：${esc(fmtTime(mail.expires_at))}`:"無領取期限";
    const body=String(mail.body||"").replace(/\\n/g,"\n");
    host.innerHTML=`
      <div class="mail-detail-head"><div><small>${esc(mail.sender_name||"GM CENTER")}</small><h3>${esc(mail.subject)}</h3></div><time>${esc(fmtTime(mail.created_at))}</time></div>
      <div class="mail-detail-body">${esc(body).replace(/\n/g,"<br>")||"（無內文）"}</div>
      ${showReward?`<div class="mail-attachment-title">附件</div><div class="mail-attachments">${rewardHtml}</div>`:""}
      <div class="mail-detail-foot">
        <span>${claimMeta}</span>
        ${showReward?`<button id="mailClaimButton" type="button" ${expired?"disabled":""}>${claimLabel}</button>`:""}
      </div>`;
    const claim=el("mailClaimButton"); if(claim)claim.addEventListener("click",()=>claimMail(mail.mail_id));
  }

  function renderSummary(){
    const unread=mails.filter(m=>!m.is_read).length;
    const claimable=mails.filter(isClaimable).length;
    const badge=el("mailUnreadBadge");
    if(badge){
      badge.textContent="";
      badge.hidden=unread===0;
      badge.title=unread?`${unread} 封未讀郵件`:"";
      badge.setAttribute("aria-label",unread?`${unread} 封未讀郵件`:"沒有未讀郵件");
    }
    const summary=el("mailSummary"); if(summary)summary.textContent=`共 ${mails.length} 封｜未讀 ${unread} 封｜可領 ${claimable} 封`;
  }

  function render(){renderSummary();renderList();renderDetail();}

  function setToolbarBusy(value){
    ["mailClaimAllButton","mailDeleteReadButton","mailRefreshButton"].forEach(id=>{const node=el(id);if(node)node.disabled=Boolean(value);});
  }

  async function reconcileLegacyClaims(){
    const api=client(),acct=account();
    if(!api||!acct?.account_id||!window.player)return 0;
    let fixed=0;
    const targets=mails.filter(m=>!m.claimed_at&&!isExpired(m)&&hasReward(m)&&hasLocalReceipt(m.mail_id));
    for(const mail of targets){
      const receipt=getLocalReceipt(mail.mail_id);
      const receiptToken=String(receipt?.claimToken||"");
      if(!receiptToken)continue;
      try{
        const {data,error}=await api.rpc("ro_mail_begin_claim",{p_account_id:String(acct.account_id),p_mail_id:String(mail.mail_id)});
        if(error)throw error;
        const payload=data||{};
        if(payload.already_claimed){
          mail.claimed_at=payload.claimed_at||new Date().toISOString();
          mail.is_read=true;
          fixed+=1;
          continue;
        }
        if(String(payload.claim_token||"")!==receiptToken)continue;
        const {data:finalized,error:finalizeError}=await api.rpc("ro_mail_finalize_claim",{
          p_account_id:String(acct.account_id),
          p_mail_id:String(mail.mail_id),
          p_claim_token:receiptToken
        });
        if(finalizeError)throw finalizeError;
        if(finalized){
          mail.claimed_at=new Date().toISOString();
          mail.is_read=true;
          fixed+=1;
        }
      }catch(error){
        console.warn("Legacy mail claim reconciliation failed:",mail.mail_id,error);
      }
    }
    return fixed;
  }

  async function refresh(options={}){
    const api=client(), acct=account();
    if(!api||!acct?.account_id)return false;
    try{
      const {data,error}=await api.rpc("ro_mail_list",{p_account_id:String(acct.account_id),p_limit:100});
      if(error)throw error;
      mails=mergeConfirmedClaims(Array.isArray(data)?data:[]);
      const reconciled=await reconcileLegacyClaims();
      if(reconciled>0){
        const synced=await api.rpc("ro_mail_list",{p_account_id:String(acct.account_id),p_limit:100});
        if(!synced.error)mails=mergeConfirmedClaims(Array.isArray(synced.data)?synced.data:mails);
      }
      if(selectedMailId&&!mails.some(m=>String(m.mail_id)===selectedMailId))selectedMailId="";
      render();
      const status=el("mailStatus"); if(status&&options.silent!==true)status.textContent="信箱已更新";
      return true;
    }catch(error){
      console.warn("Mail refresh failed:",error);
      const status=el("mailStatus"); if(status)status.textContent=friendly(error);
      return false;
    }
  }

  async function selectMail(mailId){
    selectedMailId=String(mailId||"");
    const mail=mails.find(m=>String(m.mail_id)===selectedMailId);
    render();
    if(mail&&!mail.is_read){
      mail.is_read=true; renderSummary(); renderList();
      try{const {error}=await client().rpc("ro_mail_mark_read",{p_account_id:String(account()?.account_id||""),p_mail_id:mail.mail_id});if(error)throw error;}catch(error){console.warn("mark read failed",error);}
    }
  }

  function getLocalReceipt(mailId){
    const rows=Array.isArray(window.player?.mailClaimReceipts)?window.player.mailClaimReceipts:[];
    const found=rows.find(row=>String(row?.mailId||row)===String(mailId));
    if(!found)return null;
    if(found&&typeof found==="object")return found;
    return {mailId:String(found),claimToken:""};
  }

  function hasLocalReceipt(mailId){
    return Boolean(getLocalReceipt(mailId));
  }

  function writeLocalReceipt(mailId,claimToken){
    if(!window.player)return;
    const rows=Array.isArray(player.mailClaimReceipts)?player.mailClaimReceipts:[];
    if(!rows.some(row=>String(row?.mailId||row)===String(mailId))){
      rows.push({mailId:String(mailId),claimToken:String(claimToken||""),receivedAt:Date.now()});
      if(rows.length>500)rows.splice(0,rows.length-500);
    }
    player.mailClaimReceipts=rows;
  }

  async function grantRewardOnce(payload){
    const mailId=String(payload?.mail_id||"");
    if(hasLocalReceipt(mailId))return {alreadyLocal:true};
    if(!window.player)throw new Error("角色資料尚未載入。");
    const attachments=Array.isArray(payload?.attachments)?payload.attachments:[];
    for(const row of attachments){
      const id=Number(row?.item_id||0);
      if(id<=0||typeof window.getItemData!=="function"||!window.getItemData(id))throw new Error(`附件 Item ID ${id} 不存在於目前物品資料庫。`);
    }
    const prevBatch=Boolean(window.RO_WEB_REWARD_BATCH_ACTIVE);
    const prevSuppress=Boolean(window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG);
    window.RO_WEB_REWARD_BATCH_ACTIVE=true;
    window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG=true;
    try{
      for(const row of attachments){
        const id=Number(row.item_id), amount=Math.max(1,Math.floor(Number(row.amount||1)));
        const data=window.getItemData(id);
        window.addItem(data,amount);
      }
      const zeny=Math.max(0,Math.floor(Number(payload?.zeny||0)));
      const blueGem=Math.max(0,Math.floor(Number(payload?.blue_gem||0)));
      const redGem=Math.max(0,Math.floor(Number(payload?.red_gem||0)));
      if(zeny>0)window.addZeny(zeny);
      if(blueGem>0)player.blueGem=Number(player.blueGem||0)+blueGem;
      if(redGem>0)player.redGem=Number(player.redGem||0)+redGem;
      writeLocalReceipt(mailId,payload?.claim_token);
    }finally{
      window.RO_WEB_REWARD_BATCH_ACTIVE=prevBatch;
      window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG=prevSuppress;
    }
    window.updateInventoryUI?.();
    window.updatePlayerUI?.();
    window.addBattleLog?.("已從信箱取得附件。");
    return {alreadyLocal:false};
  }

  async function claimMailCore(mailId,{refreshAfter=true}={}){
    const api=client(); if(!api)throw new Error("信箱伺服器尚未連線。");
    const context=activeCharacter();
    if(!context?.characterId)throw new Error("請先進入角色後再領取附件。");
    const acct=account();
    if(!acct?.account_id)throw new Error("目前沒有選定的遊戲帳號。");

    const {data,error}=await api.rpc("ro_mail_begin_claim",{p_account_id:String(acct.account_id),p_mail_id:String(mailId)});
    if(error)throw error;
    const payload=data||{};
    const localMail=mails.find(m=>String(m.mail_id)===String(mailId));
    if(payload.already_claimed){
      const claimedAt=payload.claimed_at||localMail?.claimed_at||new Date().toISOString();
      confirmedClaimedIds.set(String(mailId),String(claimedAt));
      if(localMail){localMail.claimed_at=claimedAt;localMail.is_read=true;localMail.read_at=localMail.read_at||claimedAt;}
      render();
      if(refreshAfter)await refresh({silent:true});
      return true;
    }

    await grantRewardOnce(payload);
    // V0.9.85I: reward and local receipt are already committed to the active character in memory.
    // Hide attachment rows / claim button NOW; cloud verification continues below.
    render();
    if(el("mailStatus"))el("mailStatus").textContent="附件已領取，正在同步雲端存檔…";
    const saveOk=await window.ROWebSaveManager?.saveAndWait?.({reason:`mail-claim:${mailId}`,forceWriter:true,durableDelayMs:0});
    const saveState=window.ROWebSaveManager?.getState?.()||{};
    if(!saveOk)throw new Error("附件已加入角色資料，但本機存檔驗證失敗；請勿重新整理，稍後再按一次領取附件。");
    if(saveState.lastManualCloudVerified!==true)throw new Error("附件已安全保存於本機，但雲端尚未驗證完成；請保持連線後再按一次領取附件，系統不會重複發放。");
    const {data:finalized,error:finalizeError}=await api.rpc("ro_mail_finalize_claim",{p_account_id:String(acct.account_id),p_mail_id:String(mailId),p_claim_token:String(payload.claim_token)});
    if(finalizeError)throw finalizeError;
    if(!finalized)throw new Error("附件已存檔，但伺服器尚未完成領取標記；再次按領取即可安全續接，不會重複發放。");

    const claimedAt=new Date().toISOString();
    confirmedClaimedIds.set(String(mailId),claimedAt);
    if(localMail){
      localMail.claimed_at=claimedAt;
      localMail.is_read=true;
      localMail.read_at=localMail.read_at||claimedAt;
    }
    // Render immediately: attachment rows and the claim button disappear in the same click cycle.
    render();
    if(refreshAfter)await refresh({silent:true});
    return true;
  }

  async function claimMail(mailId){
    if(busy)return;
    busy=true;setToolbarBusy(true);
    const button=el("mailClaimButton"); if(button){button.disabled=true;button.textContent="領取中…";}
    try{
      await claimMailCore(mailId,{refreshAfter:true});
      if(el("mailStatus"))el("mailStatus").textContent="附件領取完成，角色雲端存檔已驗證。";
    }catch(error){
      console.error("Mail claim failed:",error);
      if(el("mailStatus"))el("mailStatus").textContent=friendly(error);
      renderDetail();
    }finally{busy=false;setToolbarBusy(false);}
  }

  async function claimAll(){
    if(busy)return;
    const targets=mails.filter(isClaimable);
    if(!targets.length){if(el("mailStatus"))el("mailStatus").textContent="目前沒有可領取的附件。";return;}
    if(!activeCharacter()?.characterId){if(el("mailStatus"))el("mailStatus").textContent="請先進入角色後再使用一鍵領取。";return;}
    busy=true;setToolbarBusy(true);
    let done=0;
    try{
      for(let i=0;i<targets.length;i++){
        if(el("mailStatus"))el("mailStatus").textContent=`一鍵領取中 ${i+1}/${targets.length}：${targets[i].subject}`;
        await claimMailCore(targets[i].mail_id,{refreshAfter:false});
        done+=1;
      }
      await refresh({silent:true});
      if(el("mailStatus"))el("mailStatus").textContent=`一鍵領取完成，共領取 ${done} 封郵件附件。`;
    }catch(error){
      console.error("Mail claim-all failed:",error);
      await refresh({silent:true});
      if(el("mailStatus"))el("mailStatus").textContent=`已成功領取 ${done} 封；後續已停止：${friendly(error)}`;
    }finally{busy=false;setToolbarBusy(false);}
  }

  async function deleteRead(){
    if(busy)return;
    const readCount=mails.filter(m=>m.is_read).length;
    if(!readCount){if(el("mailStatus"))el("mailStatus").textContent="目前沒有已讀郵件可刪除。";return;}
    const protectedCount=mails.filter(m=>m.is_read&&!m.claimed_at&&hasReward(m)).length;
    const message=`將刪除已讀郵件。\n\n尚未領取附件的已讀郵件會自動保留${protectedCount?`（目前 ${protectedCount} 封）`:""}。`;
    const ok=window.ROGoldUI?.confirm?await window.ROGoldUI.confirm(message,{title:"刪除已讀郵件",confirmText:"確認刪除",danger:true}):window.confirm(message);
    if(!ok)return;
    busy=true;setToolbarBusy(true);
    try{
      const {data,error}=await client().rpc("ro_mail_delete_read",{p_account_id:String(account()?.account_id||"")});
      if(error)throw error;
      const deleted=Number(data?.deleted_count||0), skipped=Number(data?.skipped_unclaimed_rewards||0);
      await refresh({silent:true});
      if(el("mailStatus"))el("mailStatus").textContent=`已刪除 ${deleted} 封已讀郵件${skipped?`；保留 ${skipped} 封尚未領取附件的郵件`:""}。`;
    }catch(error){
      console.error("Mail delete-read failed:",error);
      if(el("mailStatus"))el("mailStatus").textContent=friendly(error);
    }finally{busy=false;setToolbarBusy(false);}
  }

  async function verifyGmAccess(){
    gmAccess=false;
    const btn=el("mailGmCenterButton");
    if(btn){btn.hidden=true;btn.setAttribute("aria-hidden","true");}
    const api=client(),acct=account();
    if(!api||!acct?.account_id)return false;
    try{
      const {data,error}=await api.rpc("ro_gm_can_access",{p_gm_account_id:String(acct.account_id)});
      if(error)throw error;
      gmAccess=data===true;
    }catch(error){
      console.warn("GM access check failed:",error);
      gmAccess=false;
    }
    if(btn){btn.hidden=!gmAccess;btn.setAttribute("aria-hidden",gmAccess?"false":"true");}
    return gmAccess;
  }

  async function openGmCenter(){
    if(!(await verifyGmAccess())){if(el("mailStatus"))el("mailStatus").textContent="目前遊戲帳號沒有 GM CENTER 權限。";return;}
    location.href="gm_center.html?return=index.html";
  }

  function bind(){
    el("mailRefreshButton")?.addEventListener("click",()=>refresh());
    el("mailClaimAllButton")?.addEventListener("click",claimAll);
    el("mailDeleteReadButton")?.addEventListener("click",deleteRead);
    el("mailFilter")?.addEventListener("change",renderList);
    el("mailGmCenterButton")?.addEventListener("click",openGmCenter);
    document.addEventListener("click",event=>{
      const button=event.target instanceof Element?event.target.closest('[data-target="mail-window"]'):null;
      if(button)setTimeout(()=>refresh({silent:true}),0);
    });
  }

  function init(){
    bind();
    let tries=0;
    const boot=()=>{
      tries+=1;
      if(account()?.account_id){verifyGmAccess();refresh({silent:true});if(!refreshTimer)refreshTimer=setInterval(()=>refresh({silent:true}),REFRESH_MS);return;}
      if(tries<60)setTimeout(boot,500);
    };
    boot();
  }

  window.ROWebMailRuntime=Object.freeze({version:VERSION,refresh,claimMail,claimAll,deleteRead,openGmCenter,getMails:()=>mails.map(m=>({...m}))});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
