-- ============================================================
-- 彼岸花仙境 / RO_WEB V0.9.86Q
-- VIP V1：伺服器驗證離線掛機時間窗（Player ID / 帳號共用）
--
-- 功能：
-- 1. VIP 身分沿用 V0.9.86G：ro_accounts.is_vip / vip_level / vip_until。
-- 2. 不背景跑怪；登入角色時只做一次 RPC。
-- 3. 離線時間以 Supabase now() 與該 Player ID 最近角色雲端存檔 updated_at 為準。
-- 4. 單次最多 8 小時（28800 秒）。同一 Player ID 的全部角色共用一次離線時間窗，
--    防止 12 個角色各領 8 小時造成 12 倍收益。
-- 5. vip_started_at 阻止 VIP 開通前的時間被倒算。
-- ============================================================

alter table public.ro_accounts
  add column if not exists vip_offline_claimed_at timestamptz;

comment on column public.ro_accounts.vip_offline_claimed_at is
  'RO_WEB V0.9.86Q account-wide VIP offline settlement anti-replay anchor. Shared by every character slot under the Player ID.';

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
begin
  if auth.uid() is null then
    raise exception 'RO_AUTH_REQUIRED';
  end if;

  select * into v_account
    from public.ro_accounts a
   where a.account_id = p_account_id
     and a.user_id = auth.uid()
     and coalesce(a.account_status,'active') = 'active'
   limit 1;

  if not found then
    raise exception 'RO_ACCOUNT_PERMISSION_DENIED';
  end if;

  if not exists (
    select 1
      from public.ro_characters c
     where c.character_id = p_character_id
       and c.account_id = p_account_id
  ) then
    raise exception 'RO_CHARACTER_NOT_FOUND';
  end if;

  select max(c.updated_at)
    into v_last_character_activity
    from public.ro_characters c
   where c.account_id = p_account_id;

  v_vip_active := coalesce(v_account.is_vip,false)
    and (v_account.vip_until is null or v_account.vip_until > v_now);

  -- 既有角色每分鐘／離開前雲端存檔已自然更新 updated_at，
  -- 因此不新增任何常駐 VIP 心跳 request。
  v_anchor := greatest(
    coalesce(v_last_character_activity, v_now),
    coalesce(v_account.vip_offline_claimed_at, v_last_character_activity, v_now),
    coalesce(v_account.vip_started_at, v_last_character_activity, v_now)
  );

  if v_vip_active then
    v_seconds := greatest(0, floor(extract(epoch from (v_now - v_anchor)))::bigint);
    v_seconds := least(28800, v_seconds);
  else
    v_seconds := 0;
  end if;

  -- 帳號共用 one-shot anchor：第一隻角色領完後，其他角色立即切換不會重領。
  update public.ro_accounts a
     set vip_offline_claimed_at = v_now
   where a.account_id = p_account_id
     and a.user_id = auth.uid();

  return jsonb_build_object(
    'player_id', v_account.player_id,
    'character_id', p_character_id,
    'vip_active', v_vip_active,
    'vip_level', case when v_vip_active then greatest(1,coalesce(v_account.vip_level,1)) else 0 end,
    'vip_until', v_account.vip_until,
    'server_now', v_now,
    'anchor_at', v_anchor,
    'offline_seconds', v_seconds,
    'max_seconds', 28800,
    'account_wide', true
  );
end;
$$;

revoke all on function public.ro_vip_claim_offline_window(uuid,uuid) from public;
grant execute on function public.ro_vip_claim_offline_window(uuid,uuid) to authenticated;

comment on function public.ro_vip_claim_offline_window(uuid,uuid) is
  'RO_WEB V0.9.86Q VIP V1: secure account-wide one-shot offline duration claim, max 8h, no background battle traffic.';

-- V0.9.86Q：若 GM 對「已到期但 is_vip 仍為 true」的帳號重新啟用／延長 VIP，
-- vip_started_at 必須重設為本次重新啟用時間，避免把過期期間倒算成離線收益。
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
           when coalesce(p_enabled,false) then a.vip_offline_claimed_at
           else now()
         end
   where a.player_id = p_player_id
  returning jsonb_build_object(
    'player_id', a.player_id,
    'account_name', a.account_name,
    'is_vip', coalesce(a.is_vip,false),
    'vip_active', (coalesce(a.is_vip,false) and (a.vip_until is null or a.vip_until > now())),
    'vip_level', coalesce(a.vip_level,0),
    'vip_started_at', a.vip_started_at,
    'vip_until', a.vip_until
  ) into v_result;

  if v_result is null then
    raise exception 'RO_GM_VIP_TARGET_NOT_FOUND';
  end if;

  return v_result;
end;
$$;

revoke all on function public.ro_gm_set_vip(uuid,bigint,boolean,integer,timestamptz) from public;
grant execute on function public.ro_gm_set_vip(uuid,bigint,boolean,integer,timestamptz) to authenticated;

-- 安裝確認
select
  a.player_id,
  a.account_name,
  coalesce(a.is_vip,false) as is_vip,
  a.vip_level,
  a.vip_until,
  a.vip_offline_claimed_at,
  count(c.character_id) as character_count
from public.ro_accounts a
left join public.ro_characters c on c.account_id = a.account_id
where coalesce(a.is_vip,false) = true
group by a.player_id,a.account_name,a.is_vip,a.vip_level,a.vip_until,a.vip_offline_claimed_at
order by a.player_id;
