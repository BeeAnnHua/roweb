// ============================================================
// 彼岸花仙境 / RO_WEB - Auction House Runtime V0.9.87A
// 藍寶石上架費 / 5% Zeny 成交稅 / Mail escrow delivery
// ============================================================
(function(){
  "use strict";
  const VERSION="0.9.87A";
  const MARKET_LIMIT=60;
  const state={open:false,tab:"market",busy:false,market:[],mine:[],history:[],selected:null,search:"",category:"all",sort:"newest"};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  const int=(v,d=0)=>Math.floor(num(v,d));
  const clone=v=>{try{return structuredClone(v)}catch(_){return JSON.parse(JSON.stringify(v))}};
  const fmt=v=>Math.max(0,int(v)).toLocaleString("zh-TW");
  const client=()=>window.ROWebCloudRuntime?.getClient?.()||null;
  const account=()=>window.ROWebCloudRuntime?.getAccount?.()||null;
  const context=()=>window.CharacterSlotsRuntime?.getActiveContext?.()||{};
  const currentPlayer=()=>window.player&&typeof window.player==="object"?window.player:null;

  function friendly(error){
    const raw=String(error?.message||error||"未知錯誤");
    const pairs=[
      [/RO_AUCTION_PERMISSION_DENIED|RO_AUTH_REQUIRED/i,"目前登入狀態沒有拍賣場操作權限。"],
      [/RO_AUCTION_SAVE_REQUIRED/i,"角色尚未完成雲端存檔，請先按一次存檔。"],
      [/RO_AUCTION_ITEM_RESTRICTED/i,"這個道具屬於不可交易／不可拍賣物品。"],
      [/RO_AUCTION_ITEM_LOCKED/i,"鎖定中的物品不能上架。"],
      [/RO_AUCTION_ITEM_NOT_FOUND|RO_AUCTION_ITEM_NOT_ENOUGH/i,"雲端存檔中的物品數量不足，請先同步存檔後再試。"],
      [/RO_AUCTION_BLUE_GEM_NOT_ENOUGH/i,"藍寶石不足，無法支付上架費。"],
      [/RO_AUCTION_LISTING_LIMIT/i,"同一遊戲帳號最多同時上架 5 件商品。"],
      [/RO_AUCTION_INVALID_PRICE|RO_AUCTION_INVALID_QUANTITY/i,"請確認上架數量與售價。"],
      [/RO_AUCTION_SAVE_NOT_SYNCED|RO_AUCTION_FEE_NOT_SAVED|RO_AUCTION_ITEM_NOT_ESCROWED|RO_AUCTION_ESCROW_RECEIPT_MISSING/i,"上架資料尚未完成雲端同步；請到「我的商品」按完成上架。"],
      [/RO_AUCTION_NOT_AVAILABLE/i,"商品已被其他玩家購買、保留或已到期。"],
      [/RO_AUCTION_CANNOT_BUY_OWN/i,"不能購買自己目前遊戲帳號上架的商品。"],
      [/RO_AUCTION_ZENY_NOT_ENOUGH/i,"Zeny 不足，無法購買此商品。"],
      [/RO_AUCTION_PAYMENT_NOT_SAVED|RO_AUCTION_PAYMENT_RECEIPT_MISSING/i,"付款資料尚未完成雲端同步，系統會保留交易並可安全續接。"],
      [/RO_AUCTION_PENDING_ALREADY_DEDUCTED/i,"物品／上架費已經寫入雲端，不能取消待處理；請改按完成上架。"],
      [/RO_AUCTION_PURCHASE_ALREADY_PAID/i,"付款已寫入雲端，不能取消；請完成交易。"],
      [/fetch|network|timeout/i,"目前與拍賣伺服器連線不穩，交易資料會保留，請稍後重新整理。"],
      [/JWT|session|permission denied/i,"登入權限已失效，請重新登入。"]
    ];
    for(const [re,text] of pairs)if(re.test(raw))return text;
    return raw;
  }

  function ensureReady(){
    const api=client(),acct=account(),ctx=context(),p=currentPlayer();
    if(!api||!acct?.account_id)throw new Error("RO_AUCTION_PERMISSION_DENIED");
    if(!ctx?.characterId||!p)throw new Error("請先進入角色後再使用拍賣場。");
    return {api,acct,ctx,p};
  }

  function itemData(row){return typeof window.getItemData==="function"?window.getItemData(Number(row?.id||0)):null;}
  function itemId(row){return Number(row?.id||0);}
  function isInstance(row){return Boolean(row?.instanceId);}
  function countOf(row){return isInstance(row)?1:Math.max(1,int(row?.count,1));}
  function itemName(row,data=itemData(row)){
    try{if(typeof window.buildCompactItemName==="function")return window.buildCompactItemName(row,data)}catch(_){}
    return String(data?.name||row?.name||`Item ${itemId(row)}`);
  }
  function iconOf(row,data=itemData(row)){return String(data?.icon||`images/items/${itemId(row)}.webp`);}
  function isRestricted(row,data=itemData(row)){
    const trade=data?.trade||{};
    return Boolean(row?.locked||row?.characterBound||row?.noAuction||data?.tradeRestricted||data?.characterBound||trade?.NoAuction||trade?.NoTrade);
  }
  function auctionCategory(data){
    if(!data)return "other";
    if(data.type==="card"||data.category==="card")return "card";
    if(data.type==="equipment")return data.category==="weapon"?"weapon":"armor";
    if(data.type==="consume")return "consume";
    if(["drop_misc","stone"].includes(String(data.category||""))||["etc","enchant"].includes(String(data.type||"")))return "material";
    return "other";
  }
  function categoryLabel(value){return ({weapon:"武器",armor:"防具",card:"卡片",consume:"消耗品",material:"材料",other:"其他"})[value]||"其他";}
  function feeFor(total){total=Math.max(0,int(total));if(total<=1000000)return 1;if(total<=10000000)return 2;if(total<=100000000)return 3;return 5;}
  function remaining(value){const ms=new Date(value||0).getTime()-Date.now();if(!Number.isFinite(ms)||ms<=0)return "即將結束";const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000);return h>0?`${h}小時 ${m}分`:`${m}分鐘`;}
  function statusLabel(value){return ({pending:"待完成",active:"上架中",reserved:"交易保留",sold:"已售出",cancelled:"已取消",expired:"已到期",aborted:"已中止"})[value]||value;}

  function setStatus(text,type=""){
    const node=$("auctionStatus");if(!node)return;node.textContent=String(text||"");node.className=`auction-status${type?` is-${type}`:""}`;
  }
  function setBusy(value,text="處理中…"){
    state.busy=Boolean(value);
    document.querySelectorAll("#auctionOverlay button,#auctionOverlay input,#auctionOverlay select").forEach(node=>{
      if(node.classList.contains("auction-close"))return;
      if(value){node.dataset.auctionBusyWasDisabled=node.disabled?"1":"0";node.disabled=true;}
      else if(Object.prototype.hasOwnProperty.call(node.dataset,"auctionBusyWasDisabled")){node.disabled=node.dataset.auctionBusyWasDisabled==="1";delete node.dataset.auctionBusyWasDisabled;}
    });
    if(value)setStatus(text);
  }
  function refreshWallet(){
    const p=currentPlayer();
    if($("auctionWalletZeny"))$("auctionWalletZeny").textContent=fmt(p?.zeny||0);
    if($("auctionWalletBlue"))$("auctionWalletBlue").textContent=fmt(p?.blueGem||0);
    if($("auctionWalletRed"))$("auctionWalletRed").textContent=fmt(p?.redGem||0);
  }

  function buildUi(){
    if($("auctionOverlay"))return;
    const overlay=document.createElement("section");overlay.id="auctionOverlay";overlay.className="auction-overlay";overlay.hidden=true;overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-label","拍賣交易所");
    overlay.innerHTML=`<div class="auction-shell">
      <header class="auction-head"><div class="auction-head-mark">♜</div><div class="auction-head-title"><h2>拍賣交易所</h2><p>玩家市場｜藍寶石上架費｜成交稅 5%｜信箱安全交付</p></div>
        <div class="auction-wallet"><span><img src="images/ui/icons/icon_gold_64.png" alt="">Z <b id="auctionWalletZeny">0</b></span><span><img src="images/ui/icons/icon_blue_gem_64.png" alt="">藍 <b id="auctionWalletBlue">0</b></span><span><img src="images/ui/icons/icon_red_gem_64.png" alt="">紅 <b id="auctionWalletRed">0</b></span></div>
        <button type="button" class="auction-close ro-gold-secondary-control" aria-label="關閉">×</button></header>
      <nav class="auction-tabs"><button class="auction-tab" data-auction-tab="market">購買商品</button><button class="auction-tab" data-auction-tab="sell">我要上架</button><button class="auction-tab" data-auction-tab="mine">我的商品</button><button class="auction-tab" data-auction-tab="history">交易紀錄</button></nav>
      <div class="auction-body">
        <section class="auction-pane" data-auction-pane="market"><div class="auction-toolbar"><input id="auctionSearch" class="auction-search" type="search" maxlength="80" placeholder="搜尋物品名稱或 Item ID"><select id="auctionCategory"><option value="all">全部分類</option><option value="weapon">武器</option><option value="armor">防具</option><option value="card">卡片</option><option value="consume">消耗品</option><option value="material">材料</option><option value="other">其他</option></select><select id="auctionSort"><option value="newest">最新上架</option><option value="price_asc">單價低 → 高</option><option value="price_desc">單價高 → 低</option><option value="oldest">最早到期</option></select><button id="auctionRefreshMarket" class="auction-refresh">重新整理</button></div><div id="auctionStatus" class="auction-status"></div><div id="auctionMarketList" class="auction-market-list"></div></section>
        <section class="auction-pane" data-auction-pane="sell" hidden><div class="auction-sell-layout"><div class="auction-inventory-panel"><div class="auction-inventory-head"><b>我的背包</b><small>鎖定／歸屬／NoAuction 道具無法上架</small></div><div id="auctionInventoryList" class="auction-inventory-list"></div></div><div id="auctionSellForm" class="auction-sell-form"></div></div></section>
        <section class="auction-pane" data-auction-pane="mine" hidden><div class="auction-toolbar"><span style="flex:1;color:#b5a68c;font-size:12px">同一遊戲帳號最多同時 5 件；取消與到期商品由信箱退還。</span><button id="auctionRefreshMine">重新整理</button></div><div id="auctionMyList" class="auction-my-list"></div></section>
        <section class="auction-pane" data-auction-pane="history" hidden><div class="auction-toolbar"><span style="flex:1;color:#b5a68c;font-size:12px">成交商品與款項皆由信箱交付，交易紀錄永久以伺服器狀態為準。</span><button id="auctionRefreshHistory">重新整理</button></div><div id="auctionHistoryList" class="auction-history-list"></div></section>
      </div><footer class="auction-foot-note">V1 規則：24H 上架｜上架費依總價收 1 / 2 / 3 / 5 藍寶石且不退｜成交稅 5% Zeny｜紅寶石目前不作為必要手續費。</footer>
    </div>`;
    document.body.appendChild(overlay);
    window.ROGoldUI?.audit?.(overlay);
    overlay.querySelector(".auction-close")?.addEventListener("click",close);
    overlay.addEventListener("click",e=>{if(e.target===overlay)close();});
    overlay.querySelectorAll("[data-auction-tab]").forEach(btn=>btn.addEventListener("click",()=>switchTab(btn.dataset.auctionTab)));
    $("auctionRefreshMarket")?.addEventListener("click",()=>loadMarket());
    $("auctionRefreshMine")?.addEventListener("click",()=>loadMine());
    $("auctionRefreshHistory")?.addEventListener("click",()=>loadHistory());
    $("auctionSearch")?.addEventListener("keydown",e=>{if(e.key==="Enter")loadMarket();});
    $("auctionCategory")?.addEventListener("change",()=>loadMarket());
    $("auctionSort")?.addEventListener("change",()=>loadMarket());
  }

  function switchTab(tab){
    state.tab=tab;
    document.querySelectorAll("[data-auction-tab]").forEach(btn=>btn.classList.toggle("is-active",btn.dataset.auctionTab===tab));
    document.querySelectorAll("[data-auction-pane]").forEach(pane=>pane.hidden=pane.dataset.auctionPane!==tab);
    if(tab==="market")loadMarket();
    if(tab==="sell"){renderInventory();renderSellForm();}
    if(tab==="mine")loadMine();
    if(tab==="history")loadHistory();
  }

  function listingCard(row,{mine=false,history=false}={}){
    const data=typeof window.getItemData==="function"?window.getItemData(Number(row.item_id||0)):null;
    const payload=row.item_payload&&typeof row.item_payload==="object"?row.item_payload:{id:row.item_id};
    const name=isInstance(payload)?itemName(payload,data):String(row.item_name||data?.name||`Item ${row.item_id}`);
    const icon=String(data?.icon||`images/items/${row.item_id}.webp`);
    const own=String(row.seller_account_id||"")===String(account()?.account_id||"");
    let action="";
    if(!mine&&!history)action=`<button class="auction-buy" data-auction-buy="${esc(row.listing_id)}" ${own?"disabled title=\"自己的商品\"":""}>購買</button>`;
    if(mine&&row.status==="active")action=`<button data-auction-cancel="${esc(row.listing_id)}">取消</button>`;
    if(mine&&row.status==="pending")action=`<button data-auction-finalize="${esc(row.listing_id)}" data-auction-token="${esc(row.listing_token||"")}">完成上架</button><button data-auction-abort="${esc(row.listing_id)}" data-auction-token="${esc(row.listing_token||"")}" class="ro-gold-secondary-control">中止</button>`;
    const role=history?(String(row.buyer_account_id||"")===String(account()?.account_id||"")?`<span class="auction-history-role is-buy">買入</span>`:`<span class="auction-history-role is-sell">賣出</span>`):"";
    const status=mine||history?`<span class="auction-badge is-${esc(row.status)}">${esc(statusLabel(row.status))}</span>`:"";
    return `<article class="auction-card"><div class="auction-item-icon"><img src="${esc(icon)}" alt="" onerror="this.style.display='none'"></div><div class="auction-card-main"><b class="auction-card-name" title="${esc(name)}">${esc(name)}</b><div class="auction-card-meta"><span>${esc(categoryLabel(row.category))}</span><span>× ${fmt(row.quantity)}</span>${role}${status}</div><div class="auction-card-price"><b>${fmt(row.unit_price)}</b> Z / 個<br><small>總價 ${fmt(row.total_price)} Z</small></div><div class="auction-card-meta"><span>賣家 ${esc(row.seller_name||"—")} #${esc(row.seller_player_id||"")}</span></div></div><div class="auction-card-side">${action}<span class="auction-time">${row.expires_at&&["active","reserved"].includes(row.status)?esc(remaining(row.expires_at)):""}</span></div></article>`;
  }

  function bindMarketActions(){document.querySelectorAll("[data-auction-buy]").forEach(btn=>btn.addEventListener("click",()=>buyListing(btn.dataset.auctionBuy)));}
  async function loadMarket(){
    if(state.busy)return;let env;try{env=ensureReady()}catch(error){setStatus(friendly(error),"error");return;}
    setBusy(true,"正在取得拍賣商品…");
    try{
      const search=String($("auctionSearch")?.value||"").trim(),category=String($("auctionCategory")?.value||"all"),sort=String($("auctionSort")?.value||"newest");
      const {data,error}=await env.api.rpc("ro_auction_market",{p_account_id:String(env.acct.account_id),p_search:search,p_category:category,p_sort:sort,p_limit:MARKET_LIMIT,p_offset:0});if(error)throw error;
      state.market=Array.isArray(data)?data:[];const host=$("auctionMarketList");
      host.innerHTML=state.market.length?state.market.map(row=>listingCard(row)).join(""):'<div class="auction-empty">目前沒有符合條件的商品。</div>';bindMarketActions();setStatus(`找到 ${state.market.length} 件商品。`,"ok");
    }catch(error){console.error("Auction market load failed",error);setStatus(friendly(error),"error");}finally{setBusy(false);refreshWallet();}
  }

  function inventoryRows(){return Array.isArray(currentPlayer()?.inventory)?currentPlayer().inventory.filter(row=>row&&itemId(row)>0):[];}
  function renderInventory(){
    const host=$("auctionInventoryList");if(!host)return;const rows=inventoryRows();
    host.innerHTML=rows.length?rows.map((row,index)=>{const data=itemData(row),restricted=isRestricted(row,data),selected=state.selected===row;return `<button type="button" class="auction-inv-item${selected?" is-selected":""}${restricted?" is-disabled":""}" data-auction-inv-index="${index}" ${restricted?"title=\"此物品不可拍賣\"":""}><img src="${esc(iconOf(row,data))}" alt="" onerror="this.style.display='none'"><span>${esc(itemName(row,data))}</span>${countOf(row)>1?`<em>${fmt(countOf(row))}</em>`:""}</button>`;}).join(""):'<div class="auction-empty">背包目前沒有可上架物品。</div>';
    host.querySelectorAll("[data-auction-inv-index]").forEach(btn=>btn.addEventListener("click",()=>{const row=inventoryRows()[Number(btn.dataset.auctionInvIndex)];if(!row)return;if(isRestricted(row,itemData(row))){setStatus("這個物品不可拍賣。","error");return;}state.selected=row;renderInventory();renderSellForm();}));
  }

  function selectedDescription(row,data){
    try{if(isInstance(row)&&typeof window.buildEquipmentHoverTooltip==="function")return window.buildEquipmentHoverTooltip(row,data).split("\n").slice(1,6).join("\n")}catch(_){}
    return `Item ID ${itemId(row)}｜${categoryLabel(auctionCategory(data))}`;
  }
  function updateFeePreview(){
    const row=state.selected;if(!row)return;const qty=isInstance(row)?1:Math.max(1,Math.min(countOf(row),int($("auctionSellQty")?.value,1)));const price=Math.max(1,int($("auctionSellPrice")?.value,1));const total=Math.min(9000000000000000,qty*price),fee=feeFor(total),tax=Math.floor(total/20);
    if($("auctionPreviewTotal"))$("auctionPreviewTotal").textContent=`${fmt(total)} Z`;
    if($("auctionPreviewFee"))$("auctionPreviewFee").textContent=`${fee} 藍寶石`;
    if($("auctionPreviewNet"))$("auctionPreviewNet").textContent=`${fmt(total-tax)} Z`;
  }
  function renderSellForm(){
    const host=$("auctionSellForm");if(!host)return;const row=state.selected;
    if(!row||!inventoryRows().includes(row)){state.selected=null;host.innerHTML='<div class="auction-sell-placeholder">從左側背包選擇要上架的商品。</div>';return;}
    const data=itemData(row),max=countOf(row),name=itemName(row,data),restricted=isRestricted(row,data);
    host.innerHTML=`<div class="auction-selected-head"><div class="auction-item-icon"><img src="${esc(iconOf(row,data))}" alt=""></div><div><h3>${esc(name)}</h3><p>${esc(selectedDescription(row,data))}</p></div></div>
      <div class="auction-field"><label>上架數量</label><input id="auctionSellQty" type="number" min="1" max="${max}" value="1" ${isInstance(row)?"disabled":""} data-ro-gold-stepper></div>
      <div class="auction-field"><label>每個售價</label><input id="auctionSellPrice" type="number" min="1" max="9000000000000000" step="1000" value="1000" data-ro-gold-stepper></div>
      <div class="auction-field"><label>上架時間</label><div>24 小時</div></div>
      <div class="auction-fee-box"><div class="auction-fee-row"><span>商品總價</span><strong id="auctionPreviewTotal">—</strong></div><div class="auction-fee-row"><span>本次上架費</span><strong id="auctionPreviewFee">—</strong></div><div class="auction-fee-row"><span>售出後預估實收</span><strong id="auctionPreviewNet">—</strong></div><div id="auctionPriceStats" class="auction-fee-note">最近 7 天成交行情：讀取中…</div><div class="auction-fee-note">上架費以商品總價計算：≤100萬 1 藍｜≤1,000萬 2 藍｜≤1億 3 藍｜超過 1億 5 藍。取消或到期不退上架費；成交時另外回收 5% Zeny。</div></div>
      ${restricted?'<div class="auction-restricted-note">此物品屬於不可交易／不可拍賣類型。</div>':""}<button id="auctionSubmitListing" class="auction-submit" ${restricted?"disabled":""}>確認上架</button>`;
    window.ROGoldUI?.enhanceNumberInputs?.(host,{force:true});
    $("auctionSellQty")?.addEventListener("input",updateFeePreview);$("auctionSellPrice")?.addEventListener("input",updateFeePreview);$("auctionSubmitListing")?.addEventListener("click",submitListing);updateFeePreview();loadPriceStats(itemId(row));
  }

  async function loadPriceStats(id){
    const node=$("auctionPriceStats");if(!node)return;let env;try{env=ensureReady()}catch(_){return;}
    try{const {data,error}=await env.api.rpc("ro_auction_price_stats",{p_account_id:String(env.acct.account_id),p_item_id:Number(id)});if(error)throw error;const c=Number(data?.count||0);node.textContent=c?`最近 7 天成交 ${fmt(c)} 件｜平均 ${fmt(data.average_unit_price)} Z｜最低 ${fmt(data.min_unit_price)} Z｜最高 ${fmt(data.max_unit_price)} Z`:`最近 7 天尚無成交紀錄。`;}catch(_){node.textContent="最近 7 天成交行情暫時無法取得。";}
  }

  function removeLocalItem(row,qty){
    const inv=currentPlayer().inventory||[];
    if(isInstance(row)){const idx=inv.findIndex(x=>String(x?.instanceId||"")===String(row.instanceId));if(idx<0)throw new Error("背包已找不到這件裝備。");inv.splice(idx,1);return;}
    let need=qty;for(let i=inv.length-1;i>=0&&need>0;i--){const x=inv[i];if(!x||x.instanceId||itemId(x)!==itemId(row))continue;const take=Math.min(need,Math.max(0,int(x.count,1)));x.count=Math.max(0,int(x.count,1)-take);need-=take;if(x.count<=0)inv.splice(i,1);}if(need>0)throw new Error("背包數量不足。");
  }
  function applyLocalSnapshot(snap){if(!currentPlayer())return;currentPlayer().inventory=clone(snap.inventory);currentPlayer().blueGem=snap.blueGem;currentPlayer().zeny=snap.zeny;currentPlayer().auctionReceipts=clone(snap.auctionReceipts||[]);window.updateInventoryUI?.();window.updatePlayerUI?.();refreshWallet();}
  function addAuctionReceipt(type,listingId,token){
    const p=currentPlayer();if(!p)return;const rows=Array.isArray(p.auctionReceipts)?p.auctionReceipts:[];
    if(!rows.some(r=>String(r?.type||"")===String(type)&&String(r?.listingId||"")===String(listingId)&&String(r?.token||"")===String(token)))rows.push({type:String(type),listingId:String(listingId),token:String(token),at:Date.now()});
    if(rows.length>200)rows.splice(0,rows.length-200);p.auctionReceipts=rows;
  }
  async function cloudSave(reason){
    window.markGameSaveDirty?.(reason);const ok=await window.ROWebSaveManager?.saveAndWait?.({reason,forceWriter:true,durableDelayMs:0});const st=window.ROWebSaveManager?.getState?.()||{};return Boolean(ok&&st.lastManualCloudVerified===true);
  }

  async function submitListing(){
    if(state.busy||!state.selected)return;let env;try{env=ensureReady()}catch(error){setStatus(friendly(error),"error");return;}
    const row=state.selected,data=itemData(row);if(isRestricted(row,data)){setStatus("這個物品不能上架。","error");return;}
    const qty=isInstance(row)?1:Math.max(1,Math.min(countOf(row),int($("auctionSellQty")?.value,1))),price=Math.max(1,int($("auctionSellPrice")?.value,0));if(price<1)return setStatus("請輸入正確售價。","error");
    const total=qty*price,fee=feeFor(total);if(num(env.p.blueGem)<fee)return setStatus(`需要 ${fee} 顆藍寶石，目前持有 ${fmt(env.p.blueGem)}。`,"error");
    const ok=window.ROGoldUI?.confirm?await window.ROGoldUI.confirm(`確定上架「${itemName(row,data)}」× ${qty}？\n\n總價：${fmt(total)} Zeny\n上架費：${fee} 藍寶石（無論是否售出都不退）\n成交稅：5% Zeny\n上架時間：24 小時`,{title:"確認上架",confirmText:"支付並上架"}):window.confirm("確定上架？");if(!ok)return;
    setBusy(true,"正在同步上架前角色資料…");let pending=null;const snap={inventory:clone(env.p.inventory||[]),blueGem:num(env.p.blueGem),zeny:num(env.p.zeny),auctionReceipts:clone(env.p.auctionReceipts||[])};
    try{
      if(!(await cloudSave("auction-preflight-list")))throw new Error("上架前雲端同步尚未完成，請保持連線後再試。");
      setStatus("正在建立安全上架交易…");
      const {data:begin,error:beginError}=await env.api.rpc("ro_auction_begin_listing",{p_account_id:String(env.acct.account_id),p_character_id:String(env.ctx.characterId),p_item_id:itemId(row),p_instance_id:isInstance(row)?String(row.instanceId):null,p_quantity:qty,p_unit_price:price,p_item_name:String(data?.name||row.name||itemName(row,data)),p_item_type:String(data?.type||"etc"),p_category:auctionCategory(data)});if(beginError)throw beginError;pending=begin;
      removeLocalItem(row,qty);env.p.blueGem=Math.max(0,num(env.p.blueGem)-Number(begin.fee_blue_gem||fee));addAuctionReceipt("list",begin.listing_id,begin.listing_token);window.updateInventoryUI?.();window.updatePlayerUI?.();refreshWallet();
      const saved=await cloudSave(`auction-list:${begin.listing_id}`);
      if(!saved){
        try{const {data:aborted,error}=await env.api.rpc("ro_auction_abort_pending",{p_account_id:String(env.acct.account_id),p_character_id:String(env.ctx.characterId),p_listing_id:String(begin.listing_id),p_listing_token:String(begin.listing_token)});if(error)throw error;if(aborted){applyLocalSnapshot(snap);throw new Error("雲端存檔尚未完成，上架已安全取消，物品與藍寶石已恢復。");}throw new Error("上架待處理狀態無法自動取消，請到『我的商品』確認。") }catch(abortError){if(/RO_AUCTION_PENDING_ALREADY_DEDUCTED/i.test(String(abortError?.message||abortError))){throw new Error("物品與上架費已寫入雲端，但商品尚未公開。請到『我的商品』按『完成上架』，不要重新取得物品。")};throw abortError;}
      }
      const {data:done,error:finalError}=await env.api.rpc("ro_auction_finalize_listing",{p_account_id:String(env.acct.account_id),p_character_id:String(env.ctx.characterId),p_listing_id:String(begin.listing_id),p_listing_token:String(begin.listing_token)});if(finalError)throw finalError;
      state.selected=null;renderInventory();renderSellForm();setStatus(`上架成功！已支付 ${begin.fee_blue_gem} 顆藍寶石，商品將於 24 小時後到期。`,"ok");window.addBattleLog?.(`拍賣上架：${itemName(row,data)} × ${qty}，總價 ${fmt(total)} Zeny。`);
    }catch(error){console.error("Auction listing failed",error);setStatus(friendly(error),"error");if(!pending)applyLocalSnapshot(snap);}finally{setBusy(false);refreshWallet();}
  }

  async function buyListing(listingId){
    if(state.busy)return;let env;try{env=ensureReady()}catch(error){setStatus(friendly(error),"error");return;}const row=state.market.find(x=>String(x.listing_id)===String(listingId));if(!row)return;
    if(num(env.p.zeny)<num(row.total_price))return setStatus("Zeny 不足。","error");
    const ok=window.ROGoldUI?.confirm?await window.ROGoldUI.confirm(`購買「${row.item_name}」× ${fmt(row.quantity)}？\n\n總價：${fmt(row.total_price)} Zeny\n\n付款完成後，商品會寄到遊戲信箱，避免斷線造成遺失。`,{title:"確認購買",confirmText:"支付 Zeny"}):window.confirm("確定購買？");if(!ok)return;
    setBusy(true,"正在同步購買前角色資料…");const snap={inventory:clone(env.p.inventory||[]),blueGem:num(env.p.blueGem),zeny:num(env.p.zeny),auctionReceipts:clone(env.p.auctionReceipts||[])};let reservation=null;
    try{
      if(!(await cloudSave("auction-preflight-buy")))throw new Error("購買前雲端同步尚未完成，請保持連線後再試。");
      setStatus("正在鎖定商品…");
      const {data:begin,error:beginError}=await env.api.rpc("ro_auction_begin_purchase",{p_account_id:String(env.acct.account_id),p_character_id:String(env.ctx.characterId),p_listing_id:String(listingId)});if(beginError)throw beginError;reservation=begin;
      env.p.zeny=Math.max(0,num(env.p.zeny)-num(begin.total_price));addAuctionReceipt("buy",listingId,begin.purchase_token);window.updatePlayerUI?.();refreshWallet();
      const saved=await cloudSave(`auction-buy:${listingId}`);
      if(!saved){
        try{const {data:aborted,error}=await env.api.rpc("ro_auction_abort_purchase",{p_account_id:String(env.acct.account_id),p_character_id:String(env.ctx.characterId),p_listing_id:String(listingId),p_purchase_token:String(begin.purchase_token)});if(error)throw error;if(aborted){applyLocalSnapshot(snap);throw new Error("付款尚未寫入雲端，本次購買已安全取消，Zeny 已恢復。");}throw new Error("購買保留狀態無法自動取消，請重新開啟拍賣場續接。") }catch(abortError){if(/RO_AUCTION_PURCHASE_ALREADY_PAID/i.test(String(abortError?.message||abortError)))throw new Error("Zeny 已寫入雲端，交易仍保留中；請重新開啟拍賣場，系統會續接成交，不會重複扣款。");throw abortError;}
      }
      const {data:done,error:finalError}=await env.api.rpc("ro_auction_finalize_purchase",{p_account_id:String(env.acct.account_id),p_character_id:String(env.ctx.characterId),p_listing_id:String(listingId),p_purchase_token:String(begin.purchase_token)});if(finalError)throw finalError;
      window.addBattleLog?.(`拍賣購買成功：${row.item_name} × ${fmt(row.quantity)}。請至信箱領取。`);await window.ROWebMailRuntime?.refresh?.({silent:true});setBusy(false);await loadMarket();setStatus(`購買成功！${fmt(begin.total_price)} Zeny 已支付，商品已寄到信箱。`,"ok");
    }catch(error){console.error("Auction purchase failed",error);setStatus(friendly(error),"error");if(!reservation)applyLocalSnapshot(snap);}finally{setBusy(false);refreshWallet();}
  }

  function bindMineActions(){
    document.querySelectorAll("[data-auction-cancel]").forEach(btn=>btn.addEventListener("click",()=>cancelListing(btn.dataset.auctionCancel)));
    document.querySelectorAll("[data-auction-finalize]").forEach(btn=>btn.addEventListener("click",()=>resumeListing(btn.dataset.auctionFinalize,btn.dataset.auctionToken)));
    document.querySelectorAll("[data-auction-abort]").forEach(btn=>btn.addEventListener("click",()=>abortPending(btn.dataset.auctionAbort,btn.dataset.auctionToken)));
  }
  async function loadMine(){
    let env;try{env=ensureReady()}catch(error){return;}setBusy(true,"正在讀取我的商品…");
    try{const {data,error}=await env.api.rpc("ro_auction_my_listings",{p_account_id:String(env.acct.account_id),p_limit:100});if(error)throw error;state.mine=Array.isArray(data)?data:[];const host=$("auctionMyList");host.innerHTML=state.mine.length?state.mine.map(row=>listingCard(row,{mine:true})).join(""):'<div class="auction-empty">目前沒有上架紀錄。</div>';bindMineActions();}catch(error){setStatus(friendly(error),"error");}finally{setBusy(false);refreshWallet();}
  }
  async function resumeListing(id,token){let env;try{env=ensureReady()}catch(error){return;}setBusy(true,"正在完成上架…");try{const {data,error}=await env.api.rpc("ro_auction_finalize_listing",{p_account_id:String(env.acct.account_id),p_character_id:String(env.ctx.characterId),p_listing_id:String(id),p_listing_token:String(token)});if(error)throw error;setBusy(false);await loadMine();setStatus("待處理商品已正式上架。","ok");}catch(error){setStatus(friendly(error),"error");}finally{setBusy(false);}}
  async function abortPending(id,token){let env;try{env=ensureReady()}catch(error){return;}const ok=window.ROGoldUI?.confirm?await window.ROGoldUI.confirm("只有『物品與上架費尚未寫入雲端』時才能安全中止。若已扣除，系統會阻止中止。",{title:"中止待處理上架",confirmText:"嘗試中止",danger:true}):true;if(!ok)return;setBusy(true);try{const {data,error}=await env.api.rpc("ro_auction_abort_pending",{p_account_id:String(env.acct.account_id),p_character_id:String(env.ctx.characterId),p_listing_id:String(id),p_listing_token:String(token)});if(error)throw error;setBusy(false);await loadMine();setStatus(data?"待處理上架已中止。":"此上架目前無法中止。",data?"ok":"error");}catch(error){setStatus(friendly(error),"error");}finally{setBusy(false);}}
  async function cancelListing(id){let env;try{env=ensureReady()}catch(error){return;}const row=state.mine.find(x=>String(x.listing_id)===String(id));const ok=window.ROGoldUI?.confirm?await window.ROGoldUI.confirm(`確定取消「${row?.item_name||"此商品"}」？\n\n商品會退回遊戲信箱，但上架藍寶石費用不退。`,{title:"取消拍賣",confirmText:"取消並退回",danger:true}):window.confirm("確定取消？");if(!ok)return;setBusy(true,"正在取消商品…");try{const {data,error}=await env.api.rpc("ro_auction_cancel_listing",{p_account_id:String(env.acct.account_id),p_character_id:String(env.ctx.characterId),p_listing_id:String(id)});if(error)throw error;await window.ROWebMailRuntime?.refresh?.({silent:true});setBusy(false);await loadMine();setStatus("商品已取消並寄回信箱。","ok");}catch(error){setStatus(friendly(error),"error");}finally{setBusy(false);}}

  async function loadHistory(){let env;try{env=ensureReady()}catch(error){return;}setBusy(true,"正在讀取交易紀錄…");try{const {data,error}=await env.api.rpc("ro_auction_my_history",{p_account_id:String(env.acct.account_id),p_limit:100});if(error)throw error;state.history=Array.isArray(data)?data:[];const host=$("auctionHistoryList");host.innerHTML=state.history.length?state.history.map(row=>listingCard(row,{history:true})).join(""):'<div class="auction-empty">目前沒有完成的交易紀錄。</div>';}catch(error){setStatus(friendly(error),"error");}finally{setBusy(false);refreshWallet();}}

  async function resumePendingPurchases(){
    let env;try{env=ensureReady()}catch(_){return 0;}try{const {data,error}=await env.api.rpc("ro_auction_pending_purchases",{p_account_id:String(env.acct.account_id),p_character_id:String(env.ctx.characterId)});if(error)throw error;let fixed=0;for(const row of Array.isArray(data)?data:[]){try{const {error:finalError}=await env.api.rpc("ro_auction_finalize_purchase",{p_account_id:String(env.acct.account_id),p_character_id:String(env.ctx.characterId),p_listing_id:String(row.listing_id),p_purchase_token:String(row.purchase_token)});if(!finalError)fixed++;}catch(_){}}if(fixed)await window.ROWebMailRuntime?.refresh?.({silent:true});return fixed;}catch(error){console.warn("Auction pending purchase reconcile failed",error);return 0;}
  }

  async function open(tab="market"){
    buildUi();try{ensureReady()}catch(error){window.ROGoldUI?.alert?.(friendly(error),{title:"拍賣交易所"});return false;}
    state.open=true;$("auctionOverlay").hidden=false;refreshWallet();await resumePendingPurchases();switchTab(tab);return true;
  }
  function close(){state.open=false;if($("auctionOverlay"))$("auctionOverlay").hidden=true;}
  function init(){buildUi();document.addEventListener("keydown",e=>{if(e.key==="Escape"&&state.open)close();});}
  window.ROAuctionRuntime=Object.freeze({version:VERSION,open,close,refresh:()=>state.tab==="market"?loadMarket():state.tab==="mine"?loadMine():state.tab==="history"?loadHistory():Promise.resolve(),feeFor,resumePendingPurchases});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
