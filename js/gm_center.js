(function(){
  "use strict";
  const VERSION="0.9.85C";
  const SUPABASE_URL="https://ecbnsobcjxnrwqlefjci.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY="sb_publishable_LrQiZeOESpuGnt-hL6m0VQ_zXqn8ehS";
  const SELECTED_ACCOUNT_KEY="roweb_cloud_selected_account_v1";
  const sdk=window.supabase;
  const client=sdk?.createClient?.(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const el=id=>document.getElementById(id);
  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  let gmAccount=null;
  let itemIndex={};

  function setStatus(text,kind=""){const node=el("gmStatus");if(!node)return;node.textContent=String(text||"");node.className=kind?`gm-status-${kind}`:"";}
  function friendly(error){const raw=String(error?.message||error||"未知錯誤");if(/RO_GM_PERMISSION_DENIED/i.test(raw))return"GM 權限不足。";if(/RO_GM_NO_RECIPIENT/i.test(raw))return"找不到符合條件的收件帳號。";if(/RO_GM_INVALID_ATTACHMENT/i.test(raw))return"道具附件格式錯誤。";if(/RO_GM_INVALID_SUBJECT/i.test(raw))return"郵件標題需為 1～80 字。";if(/fetch|network/i.test(raw))return"目前無法連線到 Supabase。";return raw;}
  function returnPath(){const raw=new URLSearchParams(location.search).get("return")||"index.html";return /^https?:|^\/\//i.test(raw)?"index.html":raw.replace(/^\.\//,"")||"index.html";}

  async function auth(){
    if(!client)throw new Error("Supabase SDK 載入失敗。");
    const {data,error}=await client.auth.getSession();if(error)throw error;
    const user=data?.session?.user;if(!user){location.replace(`cloud_account.html?return=${encodeURIComponent('gm_center.html')}`);return false;}
    const {data:accounts,error:aerr}=await client.from("ro_accounts").select("account_id,player_id,account_name,account_role,account_status,is_test,user_id").eq("user_id",user.id).order("player_id",{ascending:true});
    if(aerr)throw aerr;
    const selected=String(localStorage.getItem(SELECTED_ACCOUNT_KEY)||"");
    gmAccount=(accounts||[]).find(a=>String(a.account_id)===selected)||null;
    if(gmAccount){
      const {data:allowed,error:permError}=await client.rpc("ro_gm_can_access",{p_gm_account_id:String(gmAccount.account_id)});
      if(permError)throw permError;
      if(allowed!==true)gmAccount=null;
    }
    if(!gmAccount){el("gmDenied").hidden=false;el("gmWorkspace").hidden=true;el("gmIdentity").textContent="無 GM 權限";return false;}
    el("gmIdentity").textContent=`GM ${gmAccount.account_name}｜Player ID ${gmAccount.player_id}`;
    el("gmWorkspace").hidden=false;el("gmDenied").hidden=true;return true;
  }

  async function loadItems(){
    try{const res=await fetch("data/items/item_index.json?v=0.9.85C");if(!res.ok)throw new Error(`HTTP ${res.status}`);itemIndex=await res.json();}
    catch(error){console.warn("item index load failed",error);itemIndex={};}
  }
  function itemName(id){return itemIndex?.[String(id)]?.name||"";}
  function rebuildSuggestions(query=""){
    const q=String(query||"").trim().toLowerCase();if(!q)return;
    const rows=Object.values(itemIndex).filter(row=>String(row.id).includes(q)||String(row.name||"").toLowerCase().includes(q)).slice(0,25);
    el("itemSuggestions").innerHTML=rows.map(row=>`<option value="${Number(row.id)}">${esc(row.name)}</option>`).join("");
  }

  function buildAttachmentRows(){
    const host=el("attachmentRows");host.innerHTML="";
    for(let i=0;i<5;i++){
      const row=document.createElement("div");row.className="gm-attachment-row";row.dataset.index=String(i);
      row.innerHTML=`<input class="attachment-id" type="number" min="1" step="1" placeholder="Item ID" list="itemSuggestions"><span class="gm-attachment-name">未設定</span><input class="attachment-amount" type="number" min="1" max="999999999" value="1"><button class="remove" type="button">×</button>`;
      const idInput=row.querySelector(".attachment-id"), amount=row.querySelector(".attachment-amount"), name=row.querySelector(".gm-attachment-name");
      const sync=()=>{const id=Number(idInput.value||0);const n=itemName(id);name.textContent=id?(n||"找不到此 Item ID"):"未設定";name.style.color=id&&!n?"#ffad91":"";};
      idInput.addEventListener("input",()=>{rebuildSuggestions(idInput.value);sync();});idInput.addEventListener("change",sync);amount.addEventListener("change",()=>{amount.value=String(Math.max(1,Math.floor(Number(amount.value||1))));});row.querySelector(".remove").addEventListener("click",()=>{idInput.value="";amount.value="1";sync();});host.appendChild(row);
    }
  }

  function collectAttachments(){
    const out=[];
    document.querySelectorAll(".gm-attachment-row").forEach(row=>{const id=Number(row.querySelector(".attachment-id")?.value||0);if(!id)return;const name=itemName(id);if(!name)throw new Error(`Item ID ${id} 不存在於目前物品資料庫。`);const amount=Math.max(1,Math.floor(Number(row.querySelector(".attachment-amount")?.value||1)));out.push({item_id:id,amount,name});});
    return out;
  }

  function syncTargetUi(){const mode=el("targetMode").value;el("playerIdWrap").style.display=mode==="player"?"grid":"none";el("recipientPreview").textContent=mode==="player"?"請指定 Player ID":mode==="all"?"將寄送給所有啟用帳號":mode==="all_normal"?"將寄送給所有一般玩家":"將寄送給 GM / 測試帳號";}

  async function searchPlayers(query){
    const host=el("playerResults");host.innerHTML='<div class="gm-empty">查詢中…</div>';
    const {data,error}=await client.rpc("ro_gm_find_players",{p_gm_account_id:String(gmAccount.account_id),p_query:String(query||""),p_limit:30});if(error)throw error;
    if(!data?.length){host.innerHTML='<div class="gm-empty">找不到玩家。</div>';return;}
    host.innerHTML=data.map(row=>`<div class="gm-player-row"><div><b>${Number(row.player_id)}</b> ${esc(row.account_name)}<small>${esc(row.account_status)}｜${row.is_test?"測試":"一般"}｜${esc(row.account_role)}</small></div><button type="button" data-player-id="${Number(row.player_id)}">選擇</button></div>`).join("");
    host.querySelectorAll("[data-player-id]").forEach(btn=>btn.addEventListener("click",()=>{el("targetMode").value="player";el("targetPlayerId").value=btn.dataset.playerId;syncTargetUi();el("recipientPreview").textContent=`指定 Player ID ${btn.dataset.playerId}`;}));
  }

  async function lookupTarget(){const id=String(el("targetPlayerId").value||"").trim();if(!id)return;await searchPlayers(id);el("recipientPreview").textContent=`正在核對 Player ID ${id}`;}

  async function sendMail(){
    try{
      setStatus("寄送中…");el("sendMailButton").disabled=true;
      const mode=el("targetMode").value;const playerId=mode==="player"?Number(el("targetPlayerId").value||0):null;
      if(mode==="player"&&playerId<100001)throw new Error("請輸入有效的 Player ID。");
      const subject=String(el("mailSubject").value||"").trim();if(!subject)throw new Error("請輸入郵件標題。");
      const body=String(el("mailBody").value||"");
      const zeny=Math.max(0,Math.floor(Number(el("mailZeny").value||0)));
      const blueGem=Math.max(0,Math.floor(Number(el("mailBlueGem").value||0)));
      const redGem=Math.max(0,Math.floor(Number(el("mailRedGem").value||0)));
      const attachments=collectAttachments();
      const {data,error}=await client.rpc("ro_gm_send_mail",{p_gm_account_id:String(gmAccount.account_id),p_target_mode:mode,p_player_id:playerId,p_subject:subject,p_body:body,p_attachments:attachments,p_zeny:zeny,p_blue_gem:blueGem,p_red_gem:redGem,p_expires_at:null});if(error)throw error;
      setStatus(`寄送完成：${Number(data?.recipient_count||0).toLocaleString()} 個帳號`,"ok");
      el("mailSubject").value="";el("mailBody").value="";el("mailZeny").value="0";el("mailBlueGem").value="0";el("mailRedGem").value="0";buildAttachmentRows();await refreshHistory();
    }catch(error){console.error(error);setStatus(friendly(error),"error");}finally{el("sendMailButton").disabled=false;}
  }

  async function refreshHistory(){
    const host=el("mailHistory");host.innerHTML='<div class="gm-empty">讀取中…</div>';
    try{const {data,error}=await client.rpc("ro_gm_recent_mail",{p_gm_account_id:String(gmAccount.account_id),p_limit:20});if(error)throw error;if(!data?.length){host.innerHTML='<div class="gm-empty">尚無寄送紀錄。</div>';return;}host.innerHTML=data.map(row=>`<div class="gm-history-row"><strong>${esc(row.subject)}</strong><span>${esc(row.target_mode)}${row.target_player_id?` → ${Number(row.target_player_id)}`:""}｜${Number(row.recipient_count).toLocaleString()} 人</span><small>${new Date(row.created_at).toLocaleString("zh-TW",{hour12:false})}｜道具 ${Number(row.attachment_count||0)} 種｜Zeny ${Number(row.zeny||0).toLocaleString()}｜藍寶石 ${Number(row.blue_gem||0).toLocaleString()}｜紅寶石 ${Number(row.red_gem||0).toLocaleString()}</small></div>`).join("");}catch(error){host.innerHTML=`<div class="gm-empty">${esc(friendly(error))}</div>`;}
  }

  function bind(){
    el("backGameButton").addEventListener("click",()=>location.href=returnPath());el("targetMode").addEventListener("change",syncTargetUi);el("lookupPlayerButton").addEventListener("click",()=>lookupTarget().catch(e=>setStatus(friendly(e),"error")));el("searchPlayerButton").addEventListener("click",()=>searchPlayers(el("playerSearch").value).catch(e=>setStatus(friendly(e),"error")));el("playerSearch").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();el("searchPlayerButton").click();}});el("sendMailButton").addEventListener("click",sendMail);el("refreshHistoryButton").addEventListener("click",refreshHistory);el("clearAttachments").addEventListener("click",buildAttachmentRows);
  }

  async function init(){bind();syncTargetUi();buildAttachmentRows();try{if(!(await auth()))return;await loadItems();await refreshHistory();setStatus(`GM CENTER V${VERSION} 已連線`,"ok");}catch(error){console.error(error);setStatus(friendly(error),"error");}}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
