// ============================================================
// 彼岸花仙境 / RO_WEB V0.9.86G
// 低流量延遲聊天：玩家頻道 + 世界聊天 + 私信 + 玩家資訊 + 封鎖
// - 不使用 Supabase Realtime / WebSocket
// - 只以 message_id 增量輪詢
// - 前景 10~30 秒自適應；背景 60 秒
// ============================================================
(function(){
  'use strict';

  const VERSION = '0.9.86G';
  const MAX_RENDERED = 80;
  const MAX_MESSAGE_LENGTH = 120;
  const ACTIVE_POLL_MS = 10000;
  const WARM_POLL_MS = 20000;
  const IDLE_POLL_MS = 30000;
  const HIDDEN_POLL_MS = 60000;

  const state = {
    ready:false,
    account:null,
    character:null,
    lastId:0,
    seen:new Set(),
    activeTab:'player',
    timer:null,
    polling:false,
    sending:false,
    lastTrafficAt:Date.now(),
    whisperTarget:null,
    popupProfile:null,
    popupBlocked:false,
    initializedRows:false
  };

  const $ = id => document.getElementById(id);
  const nowMs = () => Date.now();
  const number = (value, fallback=0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const text = (value, fallback='') => String(value ?? fallback);
  const bool = value => value === true || value === 1 || value === '1' || String(value ?? '').toLowerCase() === 'true';

  function client(){
    return window.ROWebCloudRuntime?.getClient?.() || window.ROWebSupabaseClient || null;
  }

  function friendlyError(error){
    const raw = String(error?.message || error || '聊天服務暫時無法使用。');
    if (/RO_CHAT_RATE_LIMIT/i.test(raw)) return '說話太快了，請稍等一下。';
    if (/RO_CHAT_MESSAGE_TOO_LONG/i.test(raw)) return `訊息最多 ${MAX_MESSAGE_LENGTH} 個字。`;
    if (/RO_CHAT_EMPTY_MESSAGE/i.test(raw)) return '請先輸入聊天內容。';
    if (/RO_CHAT_TARGET_NOT_FOUND/i.test(raw)) return '找不到這名玩家，可能已停用帳號。';
    if (/RO_CHAT_WHISPER_BLOCKED/i.test(raw)) return '對方目前不接受你的私信。';
    if (/RO_CHAT_TARGET_BLOCKED_BY_YOU/i.test(raw)) return '你已封鎖這名玩家，請先解除封鎖後再私信。';
    if (/RO_CHAT_CANNOT_WHISPER_SELF/i.test(raw)) return '不能私信自己。';
    if (/RO_CHAT_CHARACTER_PERMISSION_DENIED/i.test(raw)) return '目前角色尚未完成雲端驗證，暫時不能聊天。';
    if (/RO_CHAT_ACCOUNT_PERMISSION_DENIED|RO_AUTH_REQUIRED/i.test(raw)) return '聊天登入狀態已失效，請重新登入。';
    if (/Failed to fetch|NetworkError|fetch/i.test(raw)) return '聊天連線暫時中斷，系統會自動重試。';
    return raw;
  }

  function getContext(){
    const account = window.ROWebCloudRuntime?.getAccount?.() || null;
    const character = window.CharacterSlotsRuntime?.getActiveCharacter?.() || null;
    return { account, character };
  }

  async function ensureContext(){
    try { await window.ROWebCloudRuntime?.ensureReady?.(); } catch (_) {}
    const ctx = getContext();
    if (!ctx.account?.account_id || !ctx.character?.characterId) return false;
    state.account = ctx.account;
    state.character = ctx.character;
    return true;
  }

  function isSelf(row){
    return String(row?.sender_player_id ?? row?.senderPlayerId ?? '') === String(state.account?.player_id ?? '');
  }

  function formatTime(value){
    const d = value ? new Date(value) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    return `[${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}]`;
  }

  function normalizeRow(raw){
    if (!raw || typeof raw !== 'object') return null;
    return {
      messageId:number(raw.message_id ?? raw.messageId, 0),
      type:text(raw.message_type ?? raw.messageType, 'world').toLowerCase(),
      senderPlayerId:number(raw.sender_player_id ?? raw.senderPlayerId, 0),
      senderCharacterId:text(raw.sender_character_id ?? raw.senderCharacterId, ''),
      senderName:text(raw.sender_name ?? raw.senderName, '冒險者'),
      senderBaseLevel:Math.max(1,number(raw.sender_base_level ?? raw.senderBaseLevel,1)),
      senderJobName:text(raw.sender_job_name ?? raw.senderJobName, '初學者'),
      senderRole:text(raw.sender_role ?? raw.senderRole, 'player').toLowerCase(),
      senderIsVip:bool(raw.sender_is_vip ?? raw.senderIsVip),
      senderVipLevel:Math.max(0,number(raw.sender_vip_level ?? raw.senderVipLevel,0)),
      recipientPlayerId:number(raw.recipient_player_id ?? raw.recipientPlayerId,0),
      body:text(raw.body,'').trim(),
      createdAt:raw.created_at ?? raw.createdAt ?? new Date().toISOString()
    };
  }

  function profileFromRow(row){
    return {
      playerId:row.senderPlayerId,
      name:row.senderName,
      baseLevel:row.senderBaseLevel,
      jobName:row.senderJobName,
      role:row.senderRole,
      isVip:row.senderIsVip,
      vipLevel:row.senderVipLevel,
      characterId:row.senderCharacterId
    };
  }

  function buildLine(row){
    const line = document.createElement('div');
    line.className = `player-chat-line chat-${row.type}${isSelf(row) ? ' is-self' : ''}`;
    line.dataset.messageId = String(row.messageId || '');
    line.dataset.playerId = String(row.senderPlayerId || '');

    const time = document.createElement('span');
    time.className = 'player-chat-time';
    time.textContent = formatTime(row.createdAt);

    const channel = document.createElement('span');
    channel.className = `player-chat-channel channel-${row.type}`;
    if (row.type === 'whisper') {
      channel.textContent = isSelf(row) ? '[私信→]' : '[私信]';
    } else if (row.type === 'announcement') {
      channel.textContent = '[公告]';
    } else if (row.type === 'party') {
      channel.textContent = '[組隊]';
    } else if (row.type === 'guild') {
      channel.textContent = '[公會]';
    } else {
      channel.textContent = '[世界]';
    }

    const isGm = row.senderRole === 'gm';
    const isVip = row.senderIsVip === true;
    if (isGm) line.classList.add('is-gm');
    if (isVip) line.classList.add('is-vip');

    line.append(time, channel);

    if (isGm) {
      const gmMark = document.createElement('span');
      gmMark.className = 'player-chat-gm-mark';
      gmMark.textContent = 'GM';
      gmMark.setAttribute('aria-label', '遊戲管理員');
      gmMark.title = '遊戲管理員';
      line.append(gmMark);
    }
    if (isVip) {
      const vipMark = document.createElement('span');
      vipMark.className = 'player-chat-vip-mark';
      vipMark.textContent = 'VIP';
      vipMark.setAttribute('aria-label', 'VIP會員');
      vipMark.title = row.senderVipLevel > 1 ? `VIP會員 Lv.${row.senderVipLevel}` : 'VIP會員';
      line.append(vipMark);
    }

    const name = document.createElement('span');
    name.className = `player-chat-name${isGm ? ' name-gm' : ''}${isVip ? ' name-vip' : ''}`;
    name.textContent = row.senderName;
    name.dataset.name = row.senderName;
    name.title = `查看 ${row.senderName} 的玩家資訊`;
    name.setAttribute('role', 'button');
    name.tabIndex = 0;
    const openSenderProfile = () => openProfile(profileFromRow(row));
    name.addEventListener('click', openSenderProfile);
    name.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openSenderProfile();
      }
    });

    const suffix = document.createElement('span');
    suffix.className = 'player-chat-colon';
    suffix.textContent = row.type === 'whisper' && isSelf(row) && row.recipientPlayerId
      ? ` → #${row.recipientPlayerId}：`
      : '：';

    const body = document.createElement('span');
    body.className = 'player-chat-text';
    body.textContent = row.body;

    line.append(name, suffix, body);
    return line;
  }

  function appendRow(raw, options={}){
    const row = normalizeRow(raw);
    if (!row || !row.messageId || !row.body) return false;
    if (state.seen.has(row.messageId)) return false;
    state.seen.add(row.messageId);
    state.lastId = Math.max(state.lastId, row.messageId);

    const list = $('player-chat-list');
    if (!list) return false;
    const wasNearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 14;
    list.appendChild(buildLine(row));
    while (list.children.length > MAX_RENDERED) list.removeChild(list.firstElementChild);
    if (wasNearBottom || options.forceScroll) requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });

    if (!options.initial && state.activeTab !== 'player') setUnreadDot(true);
    state.lastTrafficAt = nowMs();
    return true;
  }

  function showEmpty(message='目前還沒有玩家聊天。'){
    const list = $('player-chat-list');
    if (!list || list.children.length) return;
    const empty = document.createElement('div');
    empty.className = 'player-chat-empty';
    empty.textContent = message;
    list.appendChild(empty);
  }

  function clearEmpty(){
    $('player-chat-list')?.querySelectorAll('.player-chat-empty').forEach(el => el.remove());
  }

  function setUnreadDot(show){
    $('playerChatUnreadDot')?.classList.toggle('show', show === true);
  }

  function setTab(tab){
    const next = tab === 'system' ? 'system' : 'player';
    state.activeTab = next;
    const panel = $('battle-log');
    if (!panel) return;
    panel.classList.toggle('is-player-chat', next === 'player');
    panel.classList.toggle('is-system-log', next === 'system');
    $('playerChatTab')?.classList.toggle('is-active', next === 'player');
    $('systemLogTab')?.classList.toggle('is-active', next === 'system');
    $('playerChatTab')?.setAttribute('aria-selected', next === 'player' ? 'true' : 'false');
    $('systemLogTab')?.setAttribute('aria-selected', next === 'system' ? 'true' : 'false');
    if (next === 'player') {
      setUnreadDot(false);
      const list = $('player-chat-list');
      if (list) requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
      $('playerChatInput')?.focus?.({ preventScroll:true });
    }
  }

  function setWhisperTarget(profile){
    if (!profile?.playerId || String(profile.playerId) === String(state.account?.player_id || '')) return false;
    state.whisperTarget = { ...profile };
    const chip = $('playerChatTargetChip');
    if (chip) {
      chip.hidden = false;
      chip.querySelector('span').textContent = `私信：${profile.name}`;
    }
    const input = $('playerChatInput');
    if (input) {
      input.placeholder = `私信給 ${profile.name} (#${profile.playerId})`;
      input.focus();
    }
    setTab('player');
    closeProfile();
    return true;
  }

  function clearWhisperTarget(){
    state.whisperTarget = null;
    const chip = $('playerChatTargetChip');
    if (chip) chip.hidden = true;
    const input = $('playerChatInput');
    if (input) input.placeholder = '輸入訊息…';
  }

  async function send(){
    if (state.sending) return false;
    const input = $('playerChatInput');
    const sendButton = $('playerChatSendButton');
    const body = String(input?.value || '').trim().replace(/[\r\n\t]+/g,' ');
    if (!body) return false;
    if (body.length > MAX_MESSAGE_LENGTH) {
      window.ROGoldUI?.alert?.(`訊息最多 ${MAX_MESSAGE_LENGTH} 個字。`, { title:'玩家頻道' });
      return false;
    }
    if (!await ensureContext()) {
      window.ROGoldUI?.alert?.('請先登入雲端遊戲帳號並進入角色。', { title:'玩家頻道' });
      return false;
    }
    const api = client();
    if (!api) return false;
    state.sending = true;
    if (sendButton) { sendButton.disabled = true; sendButton.textContent = '傳送中'; }
    try {
      const whisper = state.whisperTarget;
      const { data, error } = await api.rpc('ro_chat_send', {
        p_account_id:state.account.account_id,
        p_character_id:state.character.characterId,
        p_message_type:whisper ? 'whisper' : 'world',
        p_body:body,
        p_target_player_id:whisper ? whisper.playerId : null
      });
      if (error) throw error;
      clearEmpty();
      appendRow(data, { forceScroll:true });
      input.value = '';
      state.lastTrafficAt = nowMs();
      schedulePoll(1200);
      return true;
    } catch (error) {
      window.ROGoldUI?.alert?.(friendlyError(error), { title:'聊天傳送失敗' });
      return false;
    } finally {
      state.sending = false;
      if (sendButton) { sendButton.disabled = false; sendButton.textContent = '發送'; }
      input?.focus?.();
    }
  }

  function nextPollDelay(){
    if (document.hidden) return HIDDEN_POLL_MS;
    const idle = nowMs() - state.lastTrafficAt;
    if (idle < 60000) return ACTIVE_POLL_MS;
    if (idle < 5 * 60000) return WARM_POLL_MS;
    return IDLE_POLL_MS;
  }

  function schedulePoll(delay){
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(poll, Math.max(500, number(delay, nextPollDelay())));
  }

  async function poll(){
    if (state.polling) return schedulePoll(nextPollDelay());
    if (!await ensureContext()) {
      showEmpty('登入雲端遊戲帳號後即可使用玩家頻道。');
      return schedulePoll(HIDDEN_POLL_MS);
    }
    const api = client();
    if (!api) return schedulePoll(HIDDEN_POLL_MS);
    state.polling = true;
    try {
      const first = !state.initializedRows;
      const { data, error } = await api.rpc('ro_chat_poll', {
        p_account_id:state.account.account_id,
        p_after_id:first ? 0 : state.lastId,
        p_limit:first ? 30 : 20
      });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      if (rows.length) {
        clearEmpty();
        for (const row of rows) appendRow(row, { initial:first });
        const list = $('player-chat-list');
        if (first && list) requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
      } else if (first) {
        showEmpty();
      }
      state.initializedRows = true;
      if (!first && rows.length >= 20) {
        state.polling = false;
        return schedulePoll(650);
      }
    } catch (error) {
      console.warn('V0.9.86G 玩家聊天輪詢暫時失敗：', error);
      if (!state.initializedRows) showEmpty('聊天服務連線中，稍後會自動重試。');
    } finally {
      state.polling = false;
      schedulePoll(nextPollDelay());
    }
  }

  function openProfile(profile){
    if (!profile?.playerId) return false;
    state.popupProfile = { ...profile };
    const modal = $('playerChatProfileModal');
    if (!modal) return false;
    $('playerChatProfileName').textContent = profile.name || '冒險者';
    $('playerChatProfileId').textContent = `#${profile.playerId}`;
    $('playerChatProfileLevel').textContent = `Base Lv.${profile.baseLevel || 1}`;
    $('playerChatProfileJob').textContent = profile.jobName || '初學者';
    const profileName = $('playerChatProfileName');
    if (profileName) {
      profileName.classList.toggle('is-gm', profile.role === 'gm');
      profileName.classList.toggle('is-vip', profile.isVip === true);
    }
    const badgeHost = $('playerChatProfileBadges');
    if (badgeHost) {
      badgeHost.replaceChildren();
      if (profile.role === 'gm') {
        const gm = document.createElement('span'); gm.className = 'player-profile-badge badge-gm'; gm.textContent = '✦ GM'; badgeHost.appendChild(gm);
      }
      if (profile.isVip === true) {
        const vip = document.createElement('span'); vip.className = 'player-profile-badge badge-vip'; vip.textContent = '◆ VIP'; badgeHost.appendChild(vip);
      }
      badgeHost.hidden = !badgeHost.children.length;
    }
    const self = String(profile.playerId) === String(state.account?.player_id || '');
    const whisper = $('playerChatWhisperButton');
    const block = $('playerChatBlockButton');
    if (whisper) whisper.disabled = self;
    if (block) { block.disabled = self; block.textContent = self ? '自己的角色' : '封鎖玩家'; }
    state.popupBlocked = false;
    modal.hidden = false;

    if (!self && state.account?.account_id && client()) {
      client().rpc('ro_chat_is_blocked', {
        p_account_id:state.account.account_id,
        p_target_player_id:profile.playerId
      }).then(({data,error}) => {
        if (error || state.popupProfile?.playerId !== profile.playerId) return;
        state.popupBlocked = data === true;
        if (block) block.textContent = state.popupBlocked ? '解除封鎖' : '封鎖玩家';
      }).catch(()=>{});
    }
    return true;
  }

  function closeProfile(){
    const modal = $('playerChatProfileModal');
    if (modal) modal.hidden = true;
    state.popupProfile = null;
  }

  async function toggleBlock(){
    const profile = state.popupProfile;
    if (!profile?.playerId || !state.account?.account_id || !client()) return false;
    const next = !state.popupBlocked;
    if (next) {
      const ok = window.ROGoldUI?.confirm
        ? await window.ROGoldUI.confirm(`確定封鎖「${profile.name}」嗎？\n封鎖後將隱藏對方世界聊天，並拒收對方私信。`, { title:'封鎖玩家', confirmText:'封鎖', danger:true })
        : window.confirm(`確定封鎖「${profile.name}」嗎？`);
      if (!ok) return false;
    }
    const button = $('playerChatBlockButton');
    if (button) button.disabled = true;
    try {
      const { data, error } = await client().rpc('ro_chat_set_block', {
        p_account_id:state.account.account_id,
        p_target_player_id:profile.playerId,
        p_block:next
      });
      if (error) throw error;
      state.popupBlocked = data === true;
      if (state.popupBlocked) {
        $('player-chat-list')?.querySelectorAll(`[data-player-id="${profile.playerId}"]`).forEach(el => el.remove());
        if (state.whisperTarget?.playerId === profile.playerId) clearWhisperTarget();
      }
      if (button) button.textContent = state.popupBlocked ? '解除封鎖' : '封鎖玩家';
      return true;
    } catch (error) {
      window.ROGoldUI?.alert?.(friendlyError(error), { title:'封鎖設定失敗' });
      return false;
    } finally {
      if (button) button.disabled = false;
    }
  }

  function bindUI(){
    $('playerChatTab')?.addEventListener('click', () => setTab('player'));
    $('systemLogTab')?.addEventListener('click', () => setTab('system'));
    $('playerChatSendButton')?.addEventListener('click', send);
    $('playerChatInput')?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send();
      }
    });
    $('playerChatTargetClear')?.addEventListener('click', clearWhisperTarget);
    $('playerChatProfileClose')?.addEventListener('click', closeProfile);
    $('playerChatProfileModal')?.addEventListener('click', event => { if (event.target === $('playerChatProfileModal')) closeProfile(); });
    $('playerChatWhisperButton')?.addEventListener('click', () => state.popupProfile && setWhisperTarget(state.popupProfile));
    $('playerChatBlockButton')?.addEventListener('click', toggleBlock);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeProfile(); });
    document.addEventListener('visibilitychange', () => schedulePoll(document.hidden ? HIDDEN_POLL_MS : 800));
  }

  async function init(){
    if (state.ready) return true;
    if (!$('battle-log') || !$('player-chat-list')) return false;
    state.ready = true;
    bindUI();
    setTab('player');
    await ensureContext();
    schedulePoll(350);
    return true;
  }

  window.ROWebChatRuntime = Object.freeze({
    version:VERSION,
    init,
    pollNow:() => schedulePoll(0),
    setTab,
    send,
    openProfile,
    setWhisperTarget,
    clearWhisperTarget,
    getState:() => ({
      lastId:state.lastId,
      activeTab:state.activeTab,
      whisperTarget:state.whisperTarget ? { ...state.whisperTarget } : null,
      polling:state.polling
    })
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
  window.addEventListener('ro-web-ready', () => { ensureContext().then(() => schedulePoll(200)); });
})();
