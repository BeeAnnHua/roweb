-- ============================================================
-- 彼岸花仙境 / RO_WEB V0.9.86F
-- 玩家聊天 GM 身分快照 + 金色名稱特效資料支援
--
-- 重點：
-- 1. 不增加任何額外輪詢/查詢；sender_role 隨既有聊天資料一併返回。
-- 2. GM 身分由 ro_accounts.account_role 在「發言當下」由伺服器判定，前端不可偽造。
-- 3. 舊聊天紀錄會依目前帳號 role 回填一次，既有 GM 訊息也可立即顯示。
-- ============================================================

alter table public.ro_chat_messages
  add column if not exists sender_role text not null default 'player';

update public.ro_chat_messages m
   set sender_role = case
     when lower(coalesce(a.account_role,'player')) = 'gm' then 'gm'
     else 'player'
   end
  from public.ro_accounts a
 where a.account_id = m.sender_account_id
   and coalesce(m.sender_role,'player') is distinct from case
     when lower(coalesce(a.account_role,'player')) = 'gm' then 'gm'
     else 'player'
   end;

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
         case when lower(coalesce(a.account_role,'player'))='gm' then 'gm' else 'player' end
    into v_sender_player_id, v_sender_name, v_sender_base, v_sender_job, v_sender_role
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
    recipient_account_id, recipient_player_id,
    body
  ) values (
    v_type,
    p_account_id, v_sender_player_id, p_character_id,
    left(v_sender_name,24), v_sender_base, left(v_sender_job,80), v_sender_role,
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
    'recipient_player_id', recipient_player_id,
    'body', body,
    'created_at', created_at
  ) into v_result;

  return v_result;
end;
$$;

-- RETURNS TABLE 增加 sender_role，因此需先 drop 再建。
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
           v.sender_base_level,v.sender_job_name,v.sender_role,
           v.recipient_player_id,v.body,v.created_at
      from visible v
     order by v.message_id asc;
  else
    return query
    select m.message_id,m.message_type,m.sender_player_id,m.sender_character_id,m.sender_name,
           m.sender_base_level,m.sender_job_name,coalesce(m.sender_role,'player') as sender_role,
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

revoke all on function public.ro_chat_send(uuid,uuid,text,text,bigint) from public;
revoke all on function public.ro_chat_poll(uuid,bigint,integer) from public;
grant execute on function public.ro_chat_send(uuid,uuid,text,text,bigint) to authenticated;
grant execute on function public.ro_chat_poll(uuid,bigint,integer) to authenticated;

comment on column public.ro_chat_messages.sender_role is
  'V0.9.86F server-verified sender identity snapshot used only for chat cosmetics; currently player/gm.';
comment on function public.ro_chat_poll(uuid,bigint,integer) is
  'V0.9.86F low-traffic incremental chat poll; includes sender_role without extra requests.';


-- 安裝完成後，最後結果應列出目前 account_role='gm' 的遊戲帳號。
-- 若真正 GM 帳號沒有出現在這裡，請先修正 ro_accounts.account_role，而不是靠 Player ID 猜測 GM。
select
  a.player_id,
  a.account_name,
  a.account_role,
  (select count(*) from public.ro_chat_messages m
    where m.sender_account_id = a.account_id and lower(coalesce(m.sender_role,'player'))='gm') as gm_chat_rows
from public.ro_accounts a
where lower(coalesce(a.account_role,''))='gm'
order by a.player_id;
