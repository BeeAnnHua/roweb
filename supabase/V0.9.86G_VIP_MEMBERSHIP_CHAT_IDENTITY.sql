-- ============================================================
-- 彼岸花仙境 / RO_WEB V0.9.86G
-- VIP 會員骨架 + GM/VIP 聊天身份快照 + GM CENTER 會員設定
--
-- 設計原則：
-- 1. account_role 繼續只代表 player / gm 權限；VIP 是獨立會員狀態。
-- 2. 聊天輪詢不增加額外 request；GM/VIP 身分隨既有 ro_chat_poll 一併返回。
-- 3. VIP 目前只提供身份/聊天視覺，不提供任何能力值或倍率加成。
-- 4. VIP 可由 GM CENTER 暫時手動設定；未來取得方式可再接商城/活動/月卡。
-- ============================================================

alter table public.ro_accounts
  add column if not exists is_vip boolean not null default false,
  add column if not exists vip_level smallint not null default 0,
  add column if not exists vip_started_at timestamptz,
  add column if not exists vip_until timestamptz;

update public.ro_accounts
   set vip_level = case when coalesce(is_vip,false) then greatest(1,least(coalesce(vip_level,1),3)) else 0 end;

comment on column public.ro_accounts.is_vip is 'RO_WEB VIP membership flag. Independent from account_role.';
comment on column public.ro_accounts.vip_level is 'Reserved VIP tier. V0.9.86G uses level 1 only; 0 means non-VIP.';
comment on column public.ro_accounts.vip_started_at is 'VIP membership first activation time.';
comment on column public.ro_accounts.vip_until is 'VIP expiration. NULL while is_vip=true means permanent VIP.';

alter table public.ro_chat_messages
  add column if not exists sender_role text not null default 'player',
  add column if not exists sender_is_vip boolean not null default false,
  add column if not exists sender_vip_level smallint not null default 0;

-- 回填最近既有聊天：GM / VIP 以目前帳號狀態補齊一次。
update public.ro_chat_messages m
   set sender_role = case when lower(coalesce(a.account_role,'player'))='gm' then 'gm' else 'player' end,
       sender_is_vip = (coalesce(a.is_vip,false) and (a.vip_until is null or a.vip_until > now())),
       sender_vip_level = case
         when coalesce(a.is_vip,false) and (a.vip_until is null or a.vip_until > now())
           then greatest(1,least(coalesce(a.vip_level,1),3))
         else 0
       end
  from public.ro_accounts a
 where a.account_id = m.sender_account_id;

create or replace function public.ro_chat_send(
  p_account_id uuid,
  p_character_id uuid,
  p_message_type text,
  p_body text,
  p_target_player_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := lower(btrim(coalesce(p_message_type,'')));
  v_body text := btrim(regexp_replace(coalesce(p_body,''), '[\r\n\t]+', ' ', 'g'));
  v_sender_player_id bigint;
  v_sender_name text;
  v_sender_base integer;
  v_sender_job text;
  v_sender_role text;
  v_sender_is_vip boolean;
  v_sender_vip_level integer;
  v_target_account_id uuid;
  v_target_player_id bigint;
  v_result jsonb;
  v_cooldown interval;
begin
  perform public.ro_chat_assert_account(p_account_id);

  if v_type not in ('world','whisper') then
    raise exception 'RO_CHAT_UNSUPPORTED_MESSAGE_TYPE';
  end if;
  if char_length(v_body) < 1 then
    raise exception 'RO_CHAT_EMPTY_MESSAGE';
  end if;
  if char_length(v_body) > 120 then
    raise exception 'RO_CHAT_MESSAGE_TOO_LONG';
  end if;

  select a.player_id,
         c.name,
         greatest(1,coalesce(c.base_level,1)),
         coalesce(nullif(c.job_name,''),'初學者'),
         case when lower(coalesce(a.account_role,'player'))='gm' then 'gm' else 'player' end,
         (coalesce(a.is_vip,false) and (a.vip_until is null or a.vip_until > now())),
         case
           when coalesce(a.is_vip,false) and (a.vip_until is null or a.vip_until > now())
             then greatest(1,least(coalesce(a.vip_level,1),3))
           else 0
         end
    into v_sender_player_id, v_sender_name, v_sender_base, v_sender_job,
         v_sender_role, v_sender_is_vip, v_sender_vip_level
    from public.ro_accounts a
    join public.ro_characters c on c.account_id = a.account_id
   where a.account_id = p_account_id
     and a.user_id = auth.uid()
     and c.character_id = p_character_id
     and coalesce(a.account_status,'active') = 'active';

  if v_sender_player_id is null or v_sender_name is null then
    raise exception 'RO_CHAT_CHARACTER_PERMISSION_DENIED';
  end if;

  v_cooldown := case when v_type = 'world' then interval '3 seconds' else interval '2 seconds' end;
  if exists (
    select 1 from public.ro_chat_messages m
     where m.sender_account_id = p_account_id
       and m.created_at > now() - v_cooldown
  ) then
    raise exception 'RO_CHAT_RATE_LIMIT';
  end if;

  if v_type = 'whisper' then
    if p_target_player_id is null or p_target_player_id <= 0 then
      raise exception 'RO_CHAT_TARGET_REQUIRED';
    end if;
    if p_target_player_id = v_sender_player_id then
      raise exception 'RO_CHAT_CANNOT_WHISPER_SELF';
    end if;

    select a.account_id, a.player_id
      into v_target_account_id, v_target_player_id
      from public.ro_accounts a
     where a.player_id = p_target_player_id
       and coalesce(a.account_status,'active') = 'active'
     limit 1;

    if v_target_account_id is null then
      raise exception 'RO_CHAT_TARGET_NOT_FOUND';
    end if;

    if exists (
      select 1 from public.ro_chat_blocks b
       where b.blocker_account_id = v_target_account_id
         and b.blocked_account_id = p_account_id
    ) then
      raise exception 'RO_CHAT_WHISPER_BLOCKED';
    end if;
    if exists (
      select 1 from public.ro_chat_blocks b
       where b.blocker_account_id = p_account_id
         and b.blocked_account_id = v_target_account_id
    ) then
      raise exception 'RO_CHAT_TARGET_BLOCKED_BY_YOU';
    end if;
  end if;

  delete from public.ro_chat_messages
   where (message_type in ('world','announcement') and created_at < now() - interval '48 hours')
      or (message_type = 'whisper' and created_at < now() - interval '7 days');

  insert into public.ro_chat_messages (
    message_type,
    sender_account_id, sender_player_id, sender_character_id,
    sender_name, sender_base_level, sender_job_name, sender_role,
    sender_is_vip, sender_vip_level,
    recipient_account_id, recipient_player_id,
    body
  ) values (
    v_type,
    p_account_id, v_sender_player_id, p_character_id,
    left(v_sender_name,24), v_sender_base, left(v_sender_job,80), v_sender_role,
    v_sender_is_vip, v_sender_vip_level,
    case when v_type='whisper' then v_target_account_id else null end,
    case when v_type='whisper' then v_target_player_id else null end,
    v_body
  )
  returning jsonb_build_object(
    'message_id', message_id,
    'message_type', message_type,
    'sender_player_id', sender_player_id,
    'sender_character_id', sender_character_id,
    'sender_name', sender_name,
    'sender_base_level', sender_base_level,
    'sender_job_name', sender_job_name,
    'sender_role', sender_role,
    'sender_is_vip', sender_is_vip,
    'sender_vip_level', sender_vip_level,
    'recipient_player_id', recipient_player_id,
    'body', body,
    'created_at', created_at
  ) into v_result;

  return v_result;
end;
$$;

-- 返回欄位增加 VIP 快照，因此 drop / recreate。
drop function if exists public.ro_chat_poll(uuid,bigint,integer);

create function public.ro_chat_poll(
  p_account_id uuid,
  p_after_id bigint default 0,
  p_limit integer default 20
)
returns table (
  message_id bigint,
  message_type text,
  sender_player_id bigint,
  sender_character_id uuid,
  sender_name text,
  sender_base_level integer,
  sender_job_name text,
  sender_role text,
  sender_is_vip boolean,
  sender_vip_level integer,
  recipient_player_id bigint,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit,20), 30));
begin
  perform public.ro_chat_assert_account(p_account_id);

  if coalesce(p_after_id,0) <= 0 then
    return query
    with visible as (
      select m.message_id,m.message_type,m.sender_player_id,m.sender_character_id,m.sender_name,
             m.sender_base_level,m.sender_job_name,coalesce(m.sender_role,'player') as sender_role,
             coalesce(m.sender_is_vip,false) as sender_is_vip,
             coalesce(m.sender_vip_level,0)::integer as sender_vip_level,
             m.recipient_player_id,m.body,m.created_at
        from public.ro_chat_messages m
       where (
          (m.message_type in ('world','announcement') and m.created_at >= now() - interval '48 hours')
          or
          (m.message_type = 'whisper'
             and m.created_at >= now() - interval '7 days'
             and (m.sender_account_id = p_account_id or m.recipient_account_id = p_account_id))
       )
       and not exists (
         select 1 from public.ro_chat_blocks b
          where b.blocker_account_id = p_account_id
            and b.blocked_account_id = m.sender_account_id
       )
       order by m.message_id desc
       limit v_limit
    )
    select v.message_id,v.message_type,v.sender_player_id,v.sender_character_id,v.sender_name,
           v.sender_base_level,v.sender_job_name,v.sender_role,v.sender_is_vip,v.sender_vip_level,
           v.recipient_player_id,v.body,v.created_at
      from visible v
     order by v.message_id asc;
  else
    return query
    select m.message_id,m.message_type,m.sender_player_id,m.sender_character_id,m.sender_name,
           m.sender_base_level,m.sender_job_name,coalesce(m.sender_role,'player') as sender_role,
           coalesce(m.sender_is_vip,false) as sender_is_vip,
           coalesce(m.sender_vip_level,0)::integer as sender_vip_level,
           m.recipient_player_id,m.body,m.created_at
      from public.ro_chat_messages m
     where m.message_id > p_after_id
       and (
          (m.message_type in ('world','announcement') and m.created_at >= now() - interval '48 hours')
          or
          (m.message_type = 'whisper'
             and m.created_at >= now() - interval '7 days'
             and (m.sender_account_id = p_account_id or m.recipient_account_id = p_account_id))
       )
       and not exists (
         select 1 from public.ro_chat_blocks b
          where b.blocker_account_id = p_account_id
            and b.blocked_account_id = m.sender_account_id
       )
     order by m.message_id asc
     limit v_limit;
  end if;
end;
$$;

-- GM CENTER: 讀取指定 Player ID 的 VIP 狀態。
create or replace function public.ro_gm_get_vip(
  p_gm_account_id uuid,
  p_player_id bigint
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

  select jsonb_build_object(
    'player_id', a.player_id,
    'account_name', a.account_name,
    'is_vip', coalesce(a.is_vip,false),
    'vip_active', (coalesce(a.is_vip,false) and (a.vip_until is null or a.vip_until > now())),
    'vip_level', coalesce(a.vip_level,0),
    'vip_started_at', a.vip_started_at,
    'vip_until', a.vip_until
  )
    into v_result
    from public.ro_accounts a
   where a.player_id = p_player_id
   limit 1;

  if v_result is null then
    raise exception 'RO_GM_VIP_TARGET_NOT_FOUND';
  end if;

  return v_result;
end;
$$;

-- GM CENTER: 暫時手動設定 / 取消 VIP。
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
           when coalesce(p_enabled,false) then coalesce(a.vip_started_at,now())
           else null
         end,
         vip_until = case when coalesce(p_enabled,false) then p_vip_until else null end
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

revoke all on function public.ro_chat_send(uuid,uuid,text,text,bigint) from public;
revoke all on function public.ro_chat_poll(uuid,bigint,integer) from public;
revoke all on function public.ro_gm_get_vip(uuid,bigint) from public;
revoke all on function public.ro_gm_set_vip(uuid,bigint,boolean,integer,timestamptz) from public;

grant execute on function public.ro_chat_send(uuid,uuid,text,text,bigint) to authenticated;
grant execute on function public.ro_chat_poll(uuid,bigint,integer) to authenticated;
grant execute on function public.ro_gm_get_vip(uuid,bigint) to authenticated;
grant execute on function public.ro_gm_set_vip(uuid,bigint,boolean,integer,timestamptz) to authenticated;

comment on column public.ro_chat_messages.sender_role is
  'V0.9.86G server-verified sender authority snapshot used for chat cosmetics.';
comment on column public.ro_chat_messages.sender_is_vip is
  'V0.9.86G server-verified VIP snapshot at message send time.';
comment on column public.ro_chat_messages.sender_vip_level is
  'V0.9.86G reserved VIP tier snapshot. V0.9.86G UI uses VIP level 1.';
comment on function public.ro_chat_poll(uuid,bigint,integer) is
  'V0.9.86G low-traffic incremental chat poll; GM/VIP identity is returned in the same request.';

-- 安裝確認：列出 GM 與目前有效 VIP，方便人工核對。
select
  a.player_id,
  a.account_name,
  a.account_role,
  coalesce(a.is_vip,false) as is_vip,
  a.vip_level,
  a.vip_until
from public.ro_accounts a
where lower(coalesce(a.account_role,''))='gm'
   or (coalesce(a.is_vip,false) and (a.vip_until is null or a.vip_until > now()))
order by a.player_id;
