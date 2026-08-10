(function(){
  "use strict";
  const VERSION="0.9.86D";
  const SUPABASE_URL="https://ecbnsobcjxnrwqlefjci.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY="sb_publishable_LrQiZeOESpuGnt-hL6m0VQ_zXqn8ehS";
  const SELECTED_ACCOUNT_KEY="roweb_cloud_selected_account_v1";
  const LOGIN_HINT_KEY="roweb_cloud_login_aliases_v1";
  const PENDING_KEY="roweb_cloud_signup_pending_v2";
  const SIGNUP_TAB_KEY="roweb_cloud_signup_tab_v1";
  const RESEND_DIAG_KEY="roweb_cloud_resend_diag_v1";
  const RECOVERY_EMAIL_KEY="roweb_recovery_email_v1";

  const sdk=window.supabase;
  if(!sdk?.createClient) return;
  const client=sdk.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.ROWebAuthStorage||window.localStorage}});
  const el=id=>document.getElementById(id);
  let accountLoadingTimer=0;
  function setAccountLoading(value,label=""){
    const pct=Math.max(0,Math.min(100,Math.round(Number(value)||0)));
    const box=el("accountLoading"),fill=el("accountLoadingFill"),num=el("accountLoadingPercent"),text=el("accountLoadingLabel");
    if(!box)return;
    box.hidden=false;if(fill)fill.style.width=`${pct}%`;if(num)num.textContent=`${pct}%`;if(text&&label)text.textContent=label;
  }
  function showAccountLoading(label="正在登入…"){
    clearTimeout(accountLoadingTimer);
    setAccountLoading(0,label);
    setTimeout(()=>setAccountLoading(8,label),20);
    accountLoadingTimer=setTimeout(()=>setAccountLoading(28,label),100);
  }
  function hideAccountLoading(){clearTimeout(accountLoadingTimer);const box=el("accountLoading");if(box)box.hidden=true;}
  const params=new URLSearchParams(location.search);
  const returnPath=(()=>{
    const raw=String(params.get("return")||"index.html").trim();
    return (!raw||/^https?:/i.test(raw)||raw.startsWith("//"))?"index.html":raw.replace(/^\.?\//,"");
  })();

  function forceCharacterSelectorNext(){
    try{
      sessionStorage.removeItem("ro_web_character_entry_v1");
      sessionStorage.setItem("ro_web_force_character_selector_v1","1");
    }catch(_){}
    return true;
  }
  let signupResendTimer=null;
  let recoveryResendTimer=null;
  let signupResendInFlight=false;
  let recoveryResendInFlight=false;

  function setStatus(message,kind="info"){const n=el("status");if(!n)return;n.textContent=String(message||"");n.className=`status show ${kind}`;}
  function clearStatus(){const n=el("status");if(n){n.textContent="";n.className="status";}}
  function validName(v){return /^[A-Za-z0-9_]{4,20}$/.test(String(v||"").trim());}
  function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||"").trim());}
  function readJson(key,fallback={}){
    let raw=null;
    try{raw=localStorage.getItem(key)}catch(_){}
    if(raw==null){try{raw=sessionStorage.getItem(key)}catch(_){}}
    try{return JSON.parse(raw||"null")||fallback}catch(_){return fallback}
  }
  function writeJson(key,v){
    const text=JSON.stringify(v);
    try{localStorage.setItem(key,text);return true}catch(_){}
    try{sessionStorage.setItem(key,text);return true}catch(_){return false}
  }
  function setSelectedAccount(value){
    const text=String(value||"");
    try{localStorage.setItem(SELECTED_ACCOUNT_KEY,text);return true}catch(_){}
    try{sessionStorage.setItem(SELECTED_ACCOUNT_KEY,text);return true}catch(_){return false}
  }
  function clearSelectedAccount(){try{localStorage.removeItem(SELECTED_ACCOUNT_KEY)}catch(_){}try{sessionStorage.removeItem(SELECTED_ACCOUNT_KEY)}catch(_){}}
  function pending(){return readJson(PENDING_KEY,null)}
  function readSessionJson(key,fallback=null){try{return JSON.parse(sessionStorage.getItem(key)||"null")||fallback}catch(_){return fallback}}
  function writeSessionJson(key,value){try{sessionStorage.setItem(key,JSON.stringify(value));return true}catch(_){return false}}
  function savePending(v){writeJson(PENDING_KEY,v);writeSessionJson(SIGNUP_TAB_KEY,v)}
  function clearPending(){try{localStorage.removeItem(PENDING_KEY)}catch(_){}try{sessionStorage.removeItem(PENDING_KEY)}catch(_){}try{sessionStorage.removeItem(SIGNUP_TAB_KEY)}catch(_){}}
  function signupContext(){
    const tab=readSessionJson(SIGNUP_TAB_KEY,null);
    const shared=pending();
    const uiEmail=String(el("otpEmail")?.textContent||"").trim();
    const formEmail=String(el("email")?.value||"").trim();
    const formName=String(el("accountName")?.value||"").trim();
    const source=(tab&&typeof tab==="object")?tab:((shared&&typeof shared==="object")?shared:{});
    const email=validEmail(uiEmail)?uiEmail:(validEmail(source.email)?String(source.email).trim():formEmail);
    const accountName=validName(formName)?formName:String(source.accountName||"").trim();
    return {accountName,email,createdAt:Number(source.createdAt||0),source:tab?"tab":(shared?"shared":"ui")};
  }
  function saveTabSignupContext(v){if(v&&validEmail(v.email))writeSessionJson(SIGNUP_TAB_KEY,v)}
  function formatClock(ts=Date.now()){try{return new Intl.DateTimeFormat("zh-TW",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date(ts))}catch(_){return new Date(ts).toLocaleTimeString()}}
  function recordResendDiagnostic(entry){
    const row={...entry,at:Number(entry?.at||Date.now()),version:VERSION};
    try{
      const list=readSessionJson(RESEND_DIAG_KEY,[]);
      const next=(Array.isArray(list)?list:[]).concat(row).slice(-20);
      writeSessionJson(RESEND_DIAG_KEY,next);
    }catch(_){}
    try{console.info("[RO_WEB auth resend]",row)}catch(_){}
  }
  function aliases(){return readJson(LOGIN_HINT_KEY,{})}
  function saveAlias(name,email){const a=aliases();a[String(name||"").trim().toLowerCase()]=String(email||"").trim();writeJson(LOGIN_HINT_KEY,a)}
  function rememberAccounts(rows,email){for(const row of rows||[])saveAlias(row.account_name,email)}
  function maskEmail(value){
    const email=String(value||"").trim();const at=email.indexOf("@");if(at<=0)return email||"-";
    const name=email.slice(0,at),domain=email.slice(at+1);
    const visible=name.length<=2?name.slice(0,1):name.slice(0,2);
    return `${visible}${"•".repeat(Math.max(3,Math.min(8,name.length-visible)))}@${domain}`;
  }
  function friendly(error){
    const raw=String(error?.message||error||"未知錯誤");
    if(/Invalid login credentials/i.test(raw))return"帳號或密碼不正確。";
    if(/Email not confirmed/i.test(raw))return"此 Email 尚未完成驗證。";
    if(/duplicate key.*account_name|uq_ro_accounts_account_name/i.test(raw))return"此遊戲帳號已被使用，請更換名稱。";
    if(/RO_ACCOUNT_LIMIT_EXCEEDED/i.test(raw))return"此 Email 已達 5 個遊戲帳號上限。";
    if(/rate limit|seconds|email rate/i.test(raw))return"寄信過於頻繁，請稍後再試。";
    if(/token.*expired|invalid.*token|expired/i.test(raw))return"驗證碼錯誤或已過期，請重新寄送。";
    if(/User already registered/i.test(raw))return"此 Email 已經註冊。請切換到「登入」，登入後即可新增其他遊戲帳號。";
    if(/same password|different from the old/i.test(raw))return"新密碼請勿與目前密碼相同。";
    if(/current password|current_password/i.test(raw))return"目前密碼不正確。";
    if(/RO_AUTH_STORAGE_UNAVAILABLE|QuotaExceeded|exceeded the quota|setItem.*Storage/i.test(raw))return"瀏覽器登入儲存空間不足。遊戲已改用耐久儲存；請重新整理後再試。若仍失敗，請勿清除角色資料，先聯絡管理員協助。";
    return raw;
  }

  function showPanel(name){
    clearStatus();
    ["Login","Register","Recovery","Accounts"].forEach(k=>el(`panel${k}`)?.classList.toggle("active",k.toLowerCase()===name.toLowerCase()));
    document.querySelectorAll("#tabs [data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));
    el("tabs").style.display=name==="accounts"?"none":"grid";
  }

  function startCountdown(buttonId,type="signup"){
    if(type==="signup"&&signupResendTimer)clearInterval(signupResendTimer);
    if(type==="recovery"&&recoveryResendTimer)clearInterval(recoveryResendTimer);
    let remain=60;const btn=el(buttonId);
    const paint=()=>{if(!btn)return;btn.disabled=remain>0;btn.textContent=remain>0?`${remain} 秒後可重寄`:"重新寄送驗證碼";};
    paint();
    const timer=setInterval(()=>{remain-=1;paint();if(remain<=0){clearInterval(timer);if(type==="signup")signupResendTimer=null;else recoveryResendTimer=null}},1000);
    if(type==="signup")signupResendTimer=timer;else recoveryResendTimer=timer;
  }

  async function listAccounts(){
    const {data:sessionData,error:sessionError}=await client.auth.getSession();
    if(sessionError)throw sessionError;
    const user=sessionData?.session?.user;if(!user)return[];
    const {data,error}=await client.from("ro_accounts").select("account_id,player_id,account_name,account_role,account_status,is_test,slot_limit,user_id").eq("user_id",user.id).order("player_id",{ascending:true});
    if(error)throw error;
    rememberAccounts(data,user.email);
    return Array.isArray(data)?data:[];
  }

  async function showAccounts(){
    const {data:sessionData,error:sessionError}=await client.auth.getSession();
    if(sessionError)throw sessionError;
    const user=sessionData?.session?.user;
    if(!user){showPanel("login");return[];}
    const rows=await listAccounts();
    showPanel("accounts");
    if(el("accountOwnerEmail"))el("accountOwnerEmail").textContent=maskEmail(user.email);
    el("accountCountText").textContent=`目前共有 ${rows.length} / 5 個遊戲帳號。`;
    const list=el("accountList");list.textContent="";
    for(const row of rows){
      const card=document.createElement("article");card.className="account-card";
      const active=String(row.account_status||"active")==="active";
      card.innerHTML=`<div><h3>${String(row.account_name).replace(/[<>&"]/g,"")}</h3><p>Player ID ${Number(row.player_id)} · ${active?"可登入":"目前不可登入"}</p></div><button type="button"${active?"":" disabled"}>進入遊戲</button>`;
      card.querySelector("button").onclick=()=>{
        showAccountLoading("正在進入角色選擇…");
        forceCharacterSelectorNext();
        setSelectedAccount(row.account_id);
        setTimeout(()=>setAccountLoading(42,"正在綁定遊戲帳號…"),70);
        setTimeout(()=>setAccountLoading(78,"正在載入雲端角色…"),140);
        setTimeout(()=>setAccountLoading(100,"準備完成"),205);
        setTimeout(()=>{location.href=returnPath;},285);
      };
      list.appendChild(card);
    }
    el("toggleAddAccountBtn").hidden=rows.length>=5;
    el("addAccountBox").classList.add("hidden");
    return rows;
  }

  async function createRoAccount(accountName,user){
    const {data,error}=await client.from("ro_accounts").insert({user_id:user.id,account_name:accountName,shared_save:{}}).select("account_id,player_id,account_name,account_role,account_status,is_test,slot_limit,user_id").single();
    if(error)throw error;
    saveAlias(data.account_name,user.email);
    return data;
  }

  async function login(){
    const id=String(el("loginId").value||"").trim();
    const password=String(el("loginPassword").value||"");
    if(!id||!password)return setStatus("請輸入遊戲帳號與密碼。","err");
    let email=id;
    if(!id.includes("@")){
      email=String(aliases()[id.toLowerCase()]||"");
      if(!email)return setStatus("這台裝置尚未記錄此遊戲帳號。請先使用綁定 Email 登入一次；成功後即可在這台裝置直接使用遊戲帳號登入。","info");
    }
    try{
      setStatus("正在登入…","info");
      showAccountLoading("正在驗證帳號…");
      const {error}=await client.auth.signInWithPassword({email,password});if(error)throw error;
      setAccountLoading(62,"登入成功，正在讀取遊戲帳號…");
      el("loginPassword").value="";
      await showAccounts();
      setAccountLoading(100,"登入完成");
      setTimeout(hideAccountLoading,180);
    }catch(e){hideAccountLoading();setStatus(friendly(e),"err")}
  }

  async function sendOtp(){
    const accountName=String(el("accountName").value||"").trim();
    const email=String(el("email").value||"").trim();
    const password=String(el("password").value||"");
    const password2=String(el("password2").value||"");
    if(!validName(accountName))return setStatus("遊戲帳號需為 4～20 碼英文字母、數字或底線。","err");
    if(!validEmail(email))return setStatus("請輸入有效 Email。","err");
    if(password.length<8)return setStatus("密碼至少需要 8 碼。","err");
    if(password!==password2)return setStatus("兩次輸入的密碼不一致。","err");
    try{
      setStatus("正在寄送驗證碼…","info");
      const {data,error}=await client.auth.signUp({email,password});if(error)throw error;
      savePending({accountName,email,createdAt:Date.now()});
      el("otpEmail").textContent=email;
      el("registerForm").classList.add("hidden");el("otpForm").classList.remove("hidden");
      startCountdown("resendBtn","signup");
      setStatus("驗證碼已寄出。請到 Email 收取 6 位數驗證碼。","ok");
      if(data?.session?.user){const row=await createRoAccount(accountName,data.session.user);return registrationSuccess(row,data.session.user);}
    }catch(e){setStatus(friendly(e),"err")}
  }

  async function verifyOtp(){
    const p=signupContext();const email=String(p?.email||"");const name=String(p?.accountName||"");
    const token=String(el("otp").value||"").replace(/\D/g,"").slice(0,6);el("otp").value=token;
    if(!validEmail(email)||!validName(name))return setStatus("註冊資料已失效，請返回重新填寫。","err");
    if(!/^\d{6}$/.test(token))return setStatus("請輸入 6 位數驗證碼。","err");
    try{
      setStatus("正在驗證…","info");
      const {data,error}=await client.auth.verifyOtp({email,token,type:"email"});if(error)throw error;
      const user=data?.user||data?.session?.user;if(!user)throw new Error("驗證成功但沒有取得登入狀態。");
      const row=await createRoAccount(name,user);clearPending();registrationSuccess(row,user);
    }catch(e){setStatus(friendly(e),"err")}
  }

  function registrationSuccess(row,user){
    saveAlias(row.account_name,user.email);
    setSelectedAccount(row.account_id);
    el("successAccount").textContent=String(row.account_name);
    el("successPlayerId").textContent=String(row.player_id);
    el("otpForm").classList.add("hidden");el("registerForm").classList.add("hidden");el("registerSuccess").classList.remove("hidden");
    setStatus("Email 驗證完成，遊戲帳號已建立。","ok");
  }

  async function resend(){
    if(signupResendInFlight)return;
    const p=signupContext();
    const email=String(p?.email||"").trim();
    const name=String(p?.accountName||"").trim();
    if(!validEmail(email))return setStatus("找不到待驗證 Email。請返回註冊資料重新確認。","err");
    if(!validName(name))return setStatus("找不到待驗證遊戲帳號。請返回註冊資料重新確認。","err");
    const btn=el("resendBtn");
    signupResendInFlight=true;
    if(btn){btn.disabled=true;btn.textContent="寄送中…";}
    saveTabSignupContext({accountName:name,email,createdAt:Number(p?.createdAt||Date.now())});
    setStatus(`正在重新寄送至 ${maskEmail(email)}…`,`info`);
    const requestedAt=Date.now();
    try{
      const {data,error}=await client.auth.resend({type:"signup",email});
      if(error)throw error;
      recordResendDiagnostic({type:"signup",email,result:"ok",at:Date.now(),requestedAt,hasUser:Boolean(data?.user)});
      startCountdown("resendBtn","signup");
      setStatus(`已重新寄送至 ${maskEmail(email)}（${formatClock()}）。請使用最新一封驗證碼；若數分鐘仍未收到，請確認 Email 地址與垃圾郵件。`,`ok`);
    }catch(e){
      recordResendDiagnostic({type:"signup",email,result:"error",message:String(e?.message||e),at:Date.now(),requestedAt});
      if(btn){btn.disabled=false;btn.textContent="重新寄送驗證碼";}
      setStatus(friendly(e),"err");
    }finally{signupResendInFlight=false;}
  }

  async function sendRecovery(){
    const email=String(el("recoveryEmail").value||"").trim();if(!validEmail(email))return setStatus("請輸入有效 Email。","err");
    try{
      setStatus("正在寄送密碼重設驗證碼…","info");
      const {error}=await client.auth.resetPasswordForEmail(email);if(error)throw error;
      sessionStorage.setItem(RECOVERY_EMAIL_KEY,email);
      el("recoveryOtpEmail").textContent=email;
      el("recoveryRequest").classList.add("hidden");el("recoveryVerify").classList.remove("hidden");
      startCountdown("resendRecoveryBtn","recovery");
      setStatus("密碼重設驗證碼已寄出。若沒看到請檢查垃圾郵件。","ok");
    }catch(e){setStatus(friendly(e),"err")}
  }

  async function resendRecovery(){
    if(recoveryResendInFlight)return;
    const email=String(sessionStorage.getItem(RECOVERY_EMAIL_KEY)||"").trim();
    if(!validEmail(email))return setStatus("找不到待重設密碼的 Email。","err");
    const btn=el("resendRecoveryBtn");
    recoveryResendInFlight=true;
    if(btn){btn.disabled=true;btn.textContent="寄送中…";}
    setStatus(`正在重新寄送密碼重設驗證碼至 ${maskEmail(email)}…`,`info`);
    const requestedAt=Date.now();
    try{
      const {error}=await client.auth.resetPasswordForEmail(email);if(error)throw error;
      recordResendDiagnostic({type:"recovery",email,result:"ok",at:Date.now(),requestedAt});
      startCountdown("resendRecoveryBtn","recovery");
      setStatus(`已重新寄送密碼重設驗證碼至 ${maskEmail(email)}（${formatClock()}）。`,`ok`);
    }catch(e){
      recordResendDiagnostic({type:"recovery",email,result:"error",message:String(e?.message||e),at:Date.now(),requestedAt});
      if(btn){btn.disabled=false;btn.textContent="重新寄送驗證碼";}
      setStatus(friendly(e),"err");
    }finally{recoveryResendInFlight=false;}
  }

  async function verifyRecovery(){
    const email=String(sessionStorage.getItem(RECOVERY_EMAIL_KEY)||"");
    const token=String(el("recoveryOtp").value||"").replace(/\D/g,"").slice(0,6);
    const p1=String(el("newPassword").value||""),p2=String(el("newPassword2").value||"");
    if(!/^\d{6}$/.test(token))return setStatus("請輸入 6 位數驗證碼。","err");
    if(p1.length<8)return setStatus("新密碼至少需要 8 碼。","err");
    if(p1!==p2)return setStatus("兩次輸入的新密碼不一致。","err");
    try{
      setStatus("正在驗證並更新密碼…","info");
      const {error:otpError}=await client.auth.verifyOtp({email,token,type:"recovery"});if(otpError)throw otpError;
      const {error:updateError}=await client.auth.updateUser({password:p1});if(updateError)throw updateError;
      sessionStorage.removeItem(RECOVERY_EMAIL_KEY);
      el("recoveryOtp").value="";el("newPassword").value="";el("newPassword2").value="";
      await client.auth.signOut();
      showPanel("login");
      el("loginId").value=email;
      setStatus("密碼已更新，請使用新密碼登入。","ok");
    }catch(e){setStatus(friendly(e),"err")}
  }

  async function changePassword(){
    const current=String(el("currentPassword").value||"");
    const next=String(el("accountNewPassword").value||"");
    const next2=String(el("accountNewPassword2").value||"");
    if(!current)return setStatus("請輸入目前密碼。","err");
    if(next.length<8)return setStatus("新密碼至少需要 8 碼。","err");
    if(next!==next2)return setStatus("兩次輸入的新密碼不一致。","err");
    if(current===next)return setStatus("新密碼請勿與目前密碼相同。","err");
    try{
      setStatus("正在更新密碼…","info");
      const {error}=await client.auth.updateUser({password:next,current_password:current});
      if(error)throw error;
      el("currentPassword").value="";el("accountNewPassword").value="";el("accountNewPassword2").value="";
      if(el("changePasswordDetails"))el("changePasswordDetails").open=false;
      setStatus("密碼已更新。下次登入請使用新密碼。","ok");
    }catch(e){setStatus(friendly(e),"err")}
  }

  async function createExtra(){
    const name=String(el("extraAccountName").value||"").trim();if(!validName(name))return setStatus("遊戲帳號需為 4～20 碼英文字母、數字或底線。","err");
    try{
      const {data:s,error:sessionError}=await client.auth.getSession();if(sessionError)throw sessionError;
      const user=s?.session?.user;if(!user)throw new Error("登入狀態已失效。");
      const row=await createRoAccount(name,user);el("extraAccountName").value="";await showAccounts();setStatus(`遊戲帳號 ${row.account_name} 已建立。`,`ok`);
    }catch(e){setStatus(friendly(e),"err")}
  }

  function resetRecoveryForm(){
    sessionStorage.removeItem(RECOVERY_EMAIL_KEY);
    el("recoveryVerify")?.classList.add("hidden");el("recoveryRequest")?.classList.remove("hidden");
    clearStatus();
  }

  async function restore(){
    const err=params.get("error");if(err)setStatus(decodeURIComponent(err),"err");
    const {data,error}=await client.auth.getSession();
    if(error){setStatus(friendly(error),"err");return;}
    if(data?.session?.user){try{return await showAccounts()}catch(e){setStatus(friendly(e),"err")}}
    const p=readSessionJson(SIGNUP_TAB_KEY,null)||pending();
    if(p?.accountName&&p?.email){
      el("accountName").value=p.accountName;el("email").value=p.email;el("otpEmail").textContent=p.email;
      saveTabSignupContext(p);
      showPanel("register");el("registerForm").classList.add("hidden");el("otpForm").classList.remove("hidden");startCountdown("resendBtn","signup");
    } else if(params.get("mode")==="register") showPanel("register");
    else if(params.get("mode")==="recovery") showPanel("recovery");
  }

  document.addEventListener("DOMContentLoaded",()=>{
    document.querySelectorAll("#tabs [data-tab]").forEach(b=>b.onclick=()=>showPanel(b.dataset.tab));
    el("loginBtn").onclick=login;el("sendOtpBtn").onclick=sendOtp;el("verifyBtn").onclick=verifyOtp;el("resendBtn").onclick=resend;
    el("backRegisterBtn").onclick=()=>{el("otpForm").classList.add("hidden");el("registerForm").classList.remove("hidden");clearStatus()};
    el("enterAfterRegisterBtn").onclick=()=>{
      showAccountLoading("正在進入角色選擇…");
      forceCharacterSelectorNext();
      setTimeout(()=>setAccountLoading(55,"正在準備新帳號…"),80);
      setTimeout(()=>setAccountLoading(100,"準備完成"),170);
      setTimeout(()=>location.href=returnPath,240);
    };
    el("sendRecoveryBtn").onclick=sendRecovery;el("verifyRecoveryBtn").onclick=verifyRecovery;el("resendRecoveryBtn").onclick=resendRecovery;el("backRecoveryBtn").onclick=resetRecoveryForm;
    el("toggleAddAccountBtn").onclick=()=>el("addAccountBox").classList.toggle("hidden");
    el("createExtraAccountBtn").onclick=createExtra;el("changePasswordBtn").onclick=changePassword;
    el("signOutBtn").onclick=async()=>{forceCharacterSelectorNext();await client.auth.signOut();clearSelectedAccount();showPanel("login");setStatus("已登出。","ok")};
    for(const id of ["otp","recoveryOtp"])el(id).addEventListener("input",e=>e.target.value=String(e.target.value||"").replace(/\D/g,"").slice(0,6));
    for(const id of ["loginPassword","password2","newPassword2","accountNewPassword2"])el(id)?.addEventListener("keydown",event=>{if(event.key!=="Enter")return;if(id==="loginPassword")login();else if(id==="password2")sendOtp();else if(id==="newPassword2")verifyRecovery();else changePassword();});
    window.ROWebAuthDiagnostics={
      version:VERSION,
      getResendLog:()=>readSessionJson(RESEND_DIAG_KEY,[]),
      currentSignupTarget:()=>{const p=signupContext();return {accountName:p.accountName,email:p.email,source:p.source};}
    };
    restore();
  });
})();
