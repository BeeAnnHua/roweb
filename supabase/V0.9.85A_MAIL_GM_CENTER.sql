-- ============================================================
-- 彼岸花仙境 / RO_WEB V0.9.85A
-- 遊戲內信箱 + GM CENTER Phase 1
-- Supabase migration (run once in SQL Editor)
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.ro_mail_messages (
  mail_id uuid primary key default gen_random_uuid(),
  batch_id uuid not null default gen_random_uuid(),
  recipient_account_id uuid not null references public.ro_accounts(account_id) on delete cascade,
  recipient_player_id bigint not null,
  sender_account_id uuid null references public.ro_accounts(account_id) on delete set null,
  sender_player_id bigint null,
  sender_name text not null default 'GM CENTER',
  target_mode text not null default 'player',
  target_player_id bigint null,
  category text not null default 'system',
  priority smallint not null default 0,
  subject text not null,
  body text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  zeny bigint not null default 0,
  is_read boolean not null default false,
  read_at timestamptz null,
  claim_token uuid null,
  claim_started_at timestamptz null,
  claimed_at timestamptz null,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint ro_mail_subject_len check (char_length(subject) between 1 and 80),
  constraint ro_mail_body_len check (char_length(body) <= 4000),
  constraint ro_mail_zeny_nonnegative check (zeny >= 0),
  constraint ro_mail_attachments_array check (jsonb_typeof(attachments) = 'array'),
  constraint ro_mail_target_mode_check check (target_mode in ('player','all','all_normal','all_test'))
);

create index if not exists ro_mail_recipient_created_idx
  on public.ro_mail_messages(recipient_account_id, created_at desc);
create index if not exists ro_mail_recipient_unread_idx
  on public.ro_mail_messages(recipient_account_id, is_read, created_at desc);
create index if not exists ro_mail_batch_idx
  on public.ro_mail_messages(batch_id);

alter table public.ro_mail_messages enable row level security;

drop policy if exists ro_mail_select_own on public.ro_mail_messages;
create policy ro_mail_select_own
on public.ro_mail_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.ro_accounts a
    where a.account_id = ro_mail_messages.recipient_account_id
      and a.user_id = auth.uid()
  )
);

revoke all on public.ro_mail_messages from anon;
revoke insert, update, delete on public.ro_mail_messages from authenticated;
grant select on public.ro_mail_messages to authenticated;

create or replace function public.ro_mail_assert_gm()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  select a.account_id
    into v_account_id
  from public.ro_accounts a
  where a.user_id = auth.uid()
    and a.account_role = 'gm'
    and a.account_status = 'active'
  order by a.player_id asc
  limit 1;

  if v_account_id is null then
    raise exception 'RO_GM_PERMISSION_DENIED';
  end if;
  return v_account_id;
end;
$$;

create or replace function public.ro_mail_mark_read(p_mail_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ro_mail_messages m
     set is_read = true,
         read_at = coalesce(m.read_at, now())
   where m.mail_id = p_mail_id
     and exists (
       select 1 from public.ro_accounts a
       where a.account_id = m.recipient_account_id
         and a.user_id = auth.uid()
     );
  return found;
end;
$$;

create or replace function public.ro_mail_begin_claim(p_mail_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mail public.ro_mail_messages%rowtype;
  v_token uuid;
begin
  select m.* into v_mail
  from public.ro_mail_messages m
  where m.mail_id = p_mail_id
    and exists (
      select 1 from public.ro_accounts a
      where a.account_id = m.recipient_account_id
        and a.user_id = auth.uid()
    )
  for update;

  if not found then
    raise exception 'RO_MAIL_NOT_FOUND';
  end if;

  if v_mail.expires_at is not null and v_mail.expires_at <= now() then
    raise exception 'RO_MAIL_EXPIRED';
  end if;

  if v_mail.claimed_at is not null then
    return jsonb_build_object(
      'mail_id', v_mail.mail_id,
      'already_claimed', true,
      'claimed_at', v_mail.claimed_at
    );
  end if;

  if v_mail.zeny <= 0 and jsonb_array_length(v_mail.attachments) = 0 then
    raise exception 'RO_MAIL_NO_REWARD';
  end if;

  v_token := coalesce(v_mail.claim_token, gen_random_uuid());
  update public.ro_mail_messages
     set claim_token = v_token,
         claim_started_at = coalesce(claim_started_at, now()),
         is_read = true,
         read_at = coalesce(read_at, now())
   where mail_id = p_mail_id;

  return jsonb_build_object(
    'mail_id', v_mail.mail_id,
    'batch_id', v_mail.batch_id,
    'claim_token', v_token,
    'attachments', v_mail.attachments,
    'zeny', v_mail.zeny,
    'already_claimed', false
  );
end;
$$;

create or replace function public.ro_mail_finalize_claim(p_mail_id uuid, p_claim_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ro_mail_messages m
     set claimed_at = coalesce(m.claimed_at, now()),
         is_read = true,
         read_at = coalesce(m.read_at, now())
   where m.mail_id = p_mail_id
     and m.claimed_at is null
     and m.claim_token = p_claim_token
     and exists (
       select 1 from public.ro_accounts a
       where a.account_id = m.recipient_account_id
         and a.user_id = auth.uid()
     );
  return found;
end;
$$;

create or replace function public.ro_gm_find_players(p_query text default '', p_limit integer default 20)
returns table (
  player_id bigint,
  account_name text,
  account_status text,
  is_test boolean,
  account_role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q text := trim(coalesce(p_query,''));
  v_limit integer := greatest(1, least(coalesce(p_limit,20), 50));
begin
  perform public.ro_mail_assert_gm();
  return query
  select a.player_id, a.account_name, a.account_status, a.is_test, a.account_role
  from public.ro_accounts a
  where v_q = ''
     or a.player_id::text ilike '%' || v_q || '%'
     or a.account_name ilike '%' || v_q || '%'
  order by a.player_id asc
  limit v_limit;
end;
$$;

create or replace function public.ro_gm_send_mail(
  p_target_mode text,
  p_player_id bigint,
  p_subject text,
  p_body text default '',
  p_attachments jsonb default '[]'::jsonb,
  p_zeny bigint default 0,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_account uuid;
  v_sender_player bigint;
  v_mode text := lower(trim(coalesce(p_target_mode,'player')));
  v_subject text := trim(coalesce(p_subject,''));
  v_body text := coalesce(p_body,'');
  v_attachments jsonb := coalesce(p_attachments,'[]'::jsonb);
  v_zeny bigint := greatest(0, coalesce(p_zeny,0));
  v_batch uuid := gen_random_uuid();
  v_count integer := 0;
  v_bad integer := 0;
begin
  v_sender_account := public.ro_mail_assert_gm();
  select a.player_id into v_sender_player from public.ro_accounts a where a.account_id = v_sender_account;

  if v_mode not in ('player','all','all_normal','all_test') then
    raise exception 'RO_GM_INVALID_TARGET_MODE';
  end if;
  if char_length(v_subject) < 1 or char_length(v_subject) > 80 then
    raise exception 'RO_GM_INVALID_SUBJECT';
  end if;
  if char_length(v_body) > 4000 then
    raise exception 'RO_GM_BODY_TOO_LONG';
  end if;
  if jsonb_typeof(v_attachments) <> 'array' or jsonb_array_length(v_attachments) > 5 then
    raise exception 'RO_GM_INVALID_ATTACHMENTS';
  end if;
  if v_zeny > 999999999999 then
    raise exception 'RO_GM_ZENY_TOO_LARGE';
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(v_attachments) e
  where jsonb_typeof(e) <> 'object'
     or coalesce((e->>'item_id')::bigint,0) <= 0
     or coalesce((e->>'amount')::bigint,0) <= 0
     or coalesce((e->>'amount')::bigint,0) > 999999999;
  if v_bad > 0 then
    raise exception 'RO_GM_INVALID_ATTACHMENT_ROW';
  end if;

  insert into public.ro_mail_messages (
    mail_id,batch_id,recipient_account_id,recipient_player_id,
    sender_account_id,sender_player_id,sender_name,target_mode,target_player_id,
    subject,body,attachments,zeny,expires_at
  )
  select
    gen_random_uuid(),v_batch,a.account_id,a.player_id,
    v_sender_account,v_sender_player,'GM CENTER',v_mode,
    case when v_mode='player' then p_player_id else null end,
    v_subject,v_body,v_attachments,v_zeny,p_expires_at
  from public.ro_accounts a
  where a.account_status = 'active'
    and (
      (v_mode='player' and a.player_id = p_player_id)
      or (v_mode='all')
      or (v_mode='all_normal' and coalesce(a.is_test,false)=false)
      or (v_mode='all_test' and coalesce(a.is_test,false)=true)
    );

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'RO_GM_NO_RECIPIENT';
  end if;

  return jsonb_build_object('batch_id',v_batch,'recipient_count',v_count);
end;
$$;

create or replace function public.ro_gm_recent_mail(p_limit integer default 20)
returns table (
  batch_id uuid,
  created_at timestamptz,
  target_mode text,
  target_player_id bigint,
  subject text,
  recipient_count bigint,
  attachment_count integer,
  zeny bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ro_mail_assert_gm();
  return query
  select m.batch_id,
         min(m.created_at) as created_at,
         min(m.target_mode) as target_mode,
         min(m.target_player_id) as target_player_id,
         min(m.subject) as subject,
         count(*) as recipient_count,
         max(jsonb_array_length(m.attachments)) as attachment_count,
         max(m.zeny) as zeny
  from public.ro_mail_messages m
  group by m.batch_id
  order by min(m.created_at) desc
  limit greatest(1,least(coalesce(p_limit,20),50));
end;
$$;

revoke all on function public.ro_mail_assert_gm() from public;
revoke all on function public.ro_mail_mark_read(uuid) from public;
revoke all on function public.ro_mail_begin_claim(uuid) from public;
revoke all on function public.ro_mail_finalize_claim(uuid,uuid) from public;
revoke all on function public.ro_gm_find_players(text,integer) from public;
revoke all on function public.ro_gm_send_mail(text,bigint,text,text,jsonb,bigint,timestamptz) from public;
revoke all on function public.ro_gm_recent_mail(integer) from public;

grant execute on function public.ro_mail_mark_read(uuid) to authenticated;
grant execute on function public.ro_mail_begin_claim(uuid) to authenticated;
grant execute on function public.ro_mail_finalize_claim(uuid,uuid) to authenticated;
grant execute on function public.ro_gm_find_players(text,integer) to authenticated;
grant execute on function public.ro_gm_send_mail(text,bigint,text,text,jsonb,bigint,timestamptz) to authenticated;
grant execute on function public.ro_gm_recent_mail(integer) to authenticated;

comment on table public.ro_mail_messages is 'RO_WEB account-level mailbox. Attachments are delivered to the active character and finalized only after cloud save verification.';
