-- ============================================================
-- 彼岸花仙境 / RO_WEB V0.9.87E
-- VIP 離線掛機：需先開啟自動掛機 + 綁定角色 / 地圖
-- 前端結算速率由 vip_runtime.js 控制：15 秒 / 1 虛擬擊殺，8H 最多 1920 隻。
--
-- 安全原則：
-- 1. 普通下線不累積 VIP 離線收益；只有伺服器已 armed 的角色可以領。
-- 2. armed 狀態在玩家「開始自動掛機」時透過一次 RPC 設定；停止掛機時解除。
-- 3. 關閉頁面時不額外送背景心跳，沿用 ro_characters.updated_at 當離線起點。
-- 4. 同一 Player ID 同時間只允許一個 armed 角色；收益只能由該角色領取。
-- 5. 正確角色領取後立即 one-shot disarm，避免重複領取。
-- ============================================================

alter table public.ro_accounts
  add column if not exists vip_offline_armed boolean not null default false,
  add column if not exists vip_offline_armed_at timestamptz,
  add column if not exists vip_offline_armed_character_id uuid,
  add column if not exists vip_offline_armed_map_id text;

comment on column public.ro_accounts.vip_offline_armed is
  'RO_WEB V0.9.87E: true only after the player explicitly starts auto battle while VIP is active.';
comment on column public.ro_accounts.vip_offline_armed_at is
  'RO_WEB V0.9.87E: server timestamp when VIP offline farming was armed.';
comment on column public.ro_accounts.vip_offline_armed_character_id is
  'RO_WEB V0.9.87E: character that armed VIP offline farming; only this character may claim.';
comment on column public.ro_accounts.vip_offline_armed_map_id is
  'RO_WEB V0.9.87E: field map captured when auto battle was armed.';

create or replace function public.ro_vip_set_offline_arm(
  p_account_id uuid,
  p_character_id uuid,
  p_enabled boolean,
  p_map_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_account public.ro_accounts%rowtype;
  v_vip_active boolean := false;
  v_map_id text := nullif(btrim(coalesce(p_map_id,'')), '');
begin
  if auth.uid() is null then
    raise exception 'RO_AUTH_REQUIRED';
  end if;

  select * into v_account
    from public.ro_accounts a
   where a.account_id = p_account_id
     and a.user_id = auth.uid()
     and coalesce(a.account_status,'active') = 'active'
   for update;

  if not found then
    raise exception 'RO_ACCOUNT_PERMISSION_DENIED';
  end if;

  if not exists (
    select 1 from public.ro_characters c
     where c.character_id = p_character_id
       and c.account_id = p_account_id
  ) then
    raise exception 'RO_CHARACTER_NOT_FOUND';
  end if;

  v_vip_active := coalesce(v_account.is_vip,false)
    and (v_account.vip_until is null or v_account.vip_until > v_now);

  if coalesce(p_enabled,false) then
    if not v_vip_active then
      raise exception 'RO_VIP_REQUIRED';
    end if;
    if v_map_id is null then
      raise exception 'RO_VIP_OFFLINE_MAP_REQUIRED';
    end if;

    update public.ro_accounts a
       set vip_offline_armed = true,
           vip_offline_armed_at = v_now,
           vip_offline_armed_character_id = p_character_id,
           vip_offline_armed_map_id = v_map_id,
           -- Cut off all time before the user explicitly armed auto battle.
           vip_offline_claimed_at = v_now
     where a.account_id = p_account_id
       and a.user_id = auth.uid();
  else
    update public.ro_accounts a
       set vip_offline_armed = false,
           vip_offline_armed_at = null,
           vip_offline_armed_character_id = null,
           vip_offline_armed_map_id = null,
           -- Normal/manual stop must not leave an offline-reward backlog.
           vip_offline_claimed_at = v_now
     where a.account_id = p_account_id
       and a.user_id = auth.uid();
  end if;

  return jsonb_build_object(
    'player_id', v_account.player_id,
    'character_id', p_character_id,
    'vip_active', v_vip_active,
    'armed', coalesce(p_enabled,false) and v_vip_active,
    'armed_at', case when coalesce(p_enabled,false) and v_vip_active then v_now else null end,
    'map_id', case when coalesce(p_enabled,false) and v_vip_active then v_map_id else null end,
    'seconds_per_virtual_kill', 15,
    'max_seconds', 28800,
    'max_virtual_kills', 1920
  );
end;
$$;

revoke all on function public.ro_vip_set_offline_arm(uuid,uuid,boolean,text) from public;
grant execute on function public.ro_vip_set_offline_arm(uuid,uuid,boolean,text) to authenticated;

comment on function public.ro_vip_set_offline_arm(uuid,uuid,boolean,text) is
  'RO_WEB V0.9.87E: one-shot server arm/disarm for VIP offline farming; no background heartbeat.';

create or replace function public.ro_vip_claim_offline_window(
  p_account_id uuid,
  p_character_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_account public.ro_accounts%rowtype;
  v_vip_active boolean := false;
  v_last_character_activity timestamptz;
  v_anchor timestamptz;
  v_seconds bigint := 0;
  v_map_id text;
  v_armed boolean := false;
  v_claim_allowed boolean := false;
  v_reason text := 'NOT_ARMED';
begin
  if auth.uid() is null then
    raise exception 'RO_AUTH_REQUIRED';
  end if;

  select * into v_account
    from public.ro_accounts a
   where a.account_id = p_account_id
     and a.user_id = auth.uid()
     and coalesce(a.account_status,'active') = 'active'
   for update;

  if not found then
    raise exception 'RO_ACCOUNT_PERMISSION_DENIED';
  end if;

  if not exists (
    select 1 from public.ro_characters c
     where c.character_id = p_character_id
       and c.account_id = p_account_id
  ) then
    raise exception 'RO_CHARACTER_NOT_FOUND';
  end if;

  v_vip_active := coalesce(v_account.is_vip,false)
    and (v_account.vip_until is null or v_account.vip_until > v_now);
  v_armed := coalesce(v_account.vip_offline_armed,false);
  v_map_id := nullif(btrim(coalesce(v_account.vip_offline_armed_map_id,'')), '');

  -- Expired / disabled VIP cannot keep a stale arm across a future reactivation.
  if not v_vip_active then
    update public.ro_accounts a
       set vip_offline_armed = false,
           vip_offline_armed_at = null,
           vip_offline_armed_character_id = null,
           vip_offline_armed_map_id = null,
           vip_offline_claimed_at = v_now
     where a.account_id = p_account_id
       and a.user_id = auth.uid();
    return jsonb_build_object(
      'player_id', v_account.player_id,
      'character_id', p_character_id,
      'vip_active', false,
      'offline_armed', false,
      'claim_allowed', false,
      'claim_reason', 'VIP_INACTIVE',
      'offline_seconds', 0,
      'max_seconds', 28800,
      'seconds_per_virtual_kill', 15,
      'max_virtual_kills', 1920,
      'account_wide', true
    );
  end if;

  -- Normal login without an explicit auto-battle arm never earns offline rewards.
  if not v_armed or v_account.vip_offline_armed_character_id is null then
    update public.ro_accounts a
       set vip_offline_claimed_at = v_now
     where a.account_id = p_account_id
       and a.user_id = auth.uid();
    return jsonb_build_object(
      'player_id', v_account.player_id,
      'character_id', p_character_id,
      'vip_active', true,
      'offline_armed', false,
      'claim_allowed', false,
      'claim_reason', 'NOT_ARMED',
      'offline_seconds', 0,
      'max_seconds', 28800,
      'seconds_per_virtual_kill', 15,
      'max_virtual_kills', 1920,
      'account_wide', true
    );
  end if;

  -- The character that was actually farming must receive its own settlement.
  if v_account.vip_offline_armed_character_id <> p_character_id then
    return jsonb_build_object(
      'player_id', v_account.player_id,
      'character_id', p_character_id,
      'eligible_character_id', v_account.vip_offline_armed_character_id,
      'vip_active', true,
      'offline_armed', true,
      'claim_allowed', false,
      'claim_reason', 'WRONG_CHARACTER',
      'map_id', v_map_id,
      'offline_seconds', 0,
      'max_seconds', 28800,
      'seconds_per_virtual_kill', 15,
      'max_virtual_kills', 1920,
      'account_wide', true
    );
  end if;

  select c.updated_at
    into v_last_character_activity
    from public.ro_characters c
   where c.character_id = p_character_id
     and c.account_id = p_account_id
   limit 1;

  v_anchor := greatest(
    coalesce(v_last_character_activity, v_now),
    coalesce(v_account.vip_offline_claimed_at, v_last_character_activity, v_now),
    coalesce(v_account.vip_started_at, v_last_character_activity, v_now),
    coalesce(v_account.vip_offline_armed_at, v_last_character_activity, v_now)
  );

  v_seconds := greatest(0, floor(extract(epoch from (v_now - v_anchor)))::bigint);
  v_seconds := least(28800, v_seconds);
  v_claim_allowed := true;
  v_reason := 'OK';

  -- One-shot claim: consume the arm only when the correct character claims it.
  update public.ro_accounts a
     set vip_offline_claimed_at = v_now,
         vip_offline_armed = false,
         vip_offline_armed_at = null,
         vip_offline_armed_character_id = null,
         vip_offline_armed_map_id = null
   where a.account_id = p_account_id
     and a.user_id = auth.uid();

  return jsonb_build_object(
    'player_id', v_account.player_id,
    'character_id', p_character_id,
    'vip_active', true,
    'vip_level', greatest(1,coalesce(v_account.vip_level,1)),
    'vip_until', v_account.vip_until,
    'server_now', v_now,
    'anchor_at', v_anchor,
    'offline_armed', true,
    'claim_allowed', v_claim_allowed,
    'claim_reason', v_reason,
    'map_id', v_map_id,
    'offline_seconds', v_seconds,
    'max_seconds', 28800,
    'seconds_per_virtual_kill', 15,
    'max_virtual_kills', 1920,
    'account_wide', true
  );
end;
$$;

revoke all on function public.ro_vip_claim_offline_window(uuid,uuid) from public;
grant execute on function public.ro_vip_claim_offline_window(uuid,uuid) to authenticated;

comment on function public.ro_vip_claim_offline_window(uuid,uuid) is
  'RO_WEB V0.9.87E: VIP offline settlement requires explicit auto-battle arm and the same character; max 8h.';

-- Keep GM VIP lifecycle safe with the new arm state.
create or replace function public.ro_gm_set_vip(
  p_gm_account_id uuid,
  p_player_id bigint,
  p_enabled boolean,
  p_vip_level integer default 1,
  p_vip_until timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public.ro_mail_assert_gm(p_gm_account_id);

  if coalesce(p_player_id,0) <= 0 then
    raise exception 'RO_GM_VIP_TARGET_NOT_FOUND';
  end if;

  if coalesce(p_enabled,false) and p_vip_until is not null and p_vip_until <= now() then
    raise exception 'RO_GM_VIP_INVALID_EXPIRY';
  end if;

  update public.ro_accounts a
     set is_vip = coalesce(p_enabled,false),
         vip_level = case when coalesce(p_enabled,false) then greatest(1,least(coalesce(p_vip_level,1),3)) else 0 end,
         vip_started_at = case
           when coalesce(p_enabled,false) then
             case
               when coalesce(a.is_vip,false) = false
                 or (a.vip_until is not null and a.vip_until <= now())
                 then now()
               else coalesce(a.vip_started_at,now())
             end
           else null
         end,
         vip_until = case when coalesce(p_enabled,false) then p_vip_until else null end,
         vip_offline_claimed_at = case
           when coalesce(p_enabled,false)
             and coalesce(a.is_vip,false)
             and (a.vip_until is null or a.vip_until > now())
             then a.vip_offline_claimed_at
           else now()
         end,
         vip_offline_armed = case
           when coalesce(p_enabled,false)
             and coalesce(a.is_vip,false)
             and (a.vip_until is null or a.vip_until > now())
             then coalesce(a.vip_offline_armed,false)
           else false
         end,
         vip_offline_armed_at = case
           when coalesce(p_enabled,false)
             and coalesce(a.is_vip,false)
             and (a.vip_until is null or a.vip_until > now())
             then a.vip_offline_armed_at
           else null
         end,
         vip_offline_armed_character_id = case
           when coalesce(p_enabled,false)
             and coalesce(a.is_vip,false)
             and (a.vip_until is null or a.vip_until > now())
             then a.vip_offline_armed_character_id
           else null
         end,
         vip_offline_armed_map_id = case
           when coalesce(p_enabled,false)
             and coalesce(a.is_vip,false)
             and (a.vip_until is null or a.vip_until > now())
             then a.vip_offline_armed_map_id
           else null
         end
   where a.player_id = p_player_id
  returning jsonb_build_object(
    'player_id', a.player_id,
    'account_name', a.account_name,
    'is_vip', coalesce(a.is_vip,false),
    'vip_active', (coalesce(a.is_vip,false) and (a.vip_until is null or a.vip_until > now())),
    'vip_level', coalesce(a.vip_level,0),
    'vip_started_at', a.vip_started_at,
    'vip_until', a.vip_until,
    'vip_offline_armed', coalesce(a.vip_offline_armed,false)
  ) into v_result;

  if v_result is null then
    raise exception 'RO_GM_VIP_TARGET_NOT_FOUND';
  end if;

  return v_result;
end;
$$;

revoke all on function public.ro_gm_set_vip(uuid,bigint,boolean,integer,timestamptz) from public;
grant execute on function public.ro_gm_set_vip(uuid,bigint,boolean,integer,timestamptz) to authenticated;

-- Installation verification.
select
  'V0.9.87E_VIP_OFFLINE_ARM_15S_READY' as status,
  15::integer as seconds_per_virtual_kill,
  1920::integer as max_virtual_kills_8h,
  count(*) filter (where coalesce(vip_offline_armed,false)) as currently_armed_accounts
from public.ro_accounts;
