-- ============================================================
-- 彼岸花仙境 / RO_WEB V0.9.85B
-- 遊戲內信箱 + GM CENTER：紅/藍寶石附件、歡迎信、GM 權限修正
-- 可直接覆蓋 V0.9.85A；也可作為第一次安裝信箱時執行。
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
  blue_gem bigint not null default 0,
  red_gem bigint not null default 0,
  system_key text null,
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

alter table public.ro_mail_messages add column if not exists blue_gem bigint not null default 0;
alter table public.ro_mail_messages add column if not exists red_gem bigint not null default 0;
alter table public.ro_mail_messages add column if not exists system_key text null;

do $$ begin
  alter table public.ro_mail_messages add constraint ro_mail_blue_gem_nonnegative check (blue_gem >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.ro_mail_messages add constraint ro_mail_red_gem_nonnegative check (red_gem >= 0);
exception when duplicate_object then null; end $$;

create index if not exists ro_mail_recipient_created_idx
  on public.ro_mail_messages(recipient_account_id, created_at desc);
create index if not exists ro_mail_recipient_unread_idx
  on public.ro_mail_messages(recipient_account_id, is_read, created_at desc);
create index if not exists ro_mail_batch_idx
  on public.ro_mail_messages(batch_id);
create unique index if not exists ro_mail_recipient_system_key_uq
  on public.ro_mail_messages(recipient_account_id, system_key)
  where system_key is not null;

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
revoke select on public.ro_mail_messages from authenticated;

-- 僅允許「目前指定的 RO account」本身是 GM；
-- 不再因為同一 Email 底下另有 GM 帳號，就讓一般 Player account 取得 GM 權限。
create or replace function public.ro_mail_assert_gm(p_account_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.ro_accounts a
    where a.account_id = p_account_id
      and a.user_id = auth.uid()
      and lower(coalesce(a.account_role,'')) = 'gm'
      and coalesce(a.account_status,'active') = 'active'
  ) then
    raise exception 'RO_GM_PERMISSION_DENIED';
  end if;
  return p_account_id;
end;
$$;

-- 帳號信箱也綁定目前選中的 RO account，避免同 Email 的其他帳號讀取/領取指定 Player ID 的附件。
create or replace function public.ro_mail_assert_account(p_account_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.ro_accounts a
    where a.account_id = p_account_id
      and a.user_id = auth.uid()
      and coalesce(a.account_status,'active') = 'active'
  ) then
    raise exception 'RO_ACCOUNT_PERMISSION_DENIED';
  end if;
  return p_account_id;
end;
$$;

drop function if exists public.ro_mail_mark_read(uuid);
drop function if exists public.ro_mail_begin_claim(uuid);
drop function if exists public.ro_mail_finalize_claim(uuid,uuid);
drop function if exists public.ro_mail_list(uuid,integer);

create or replace function public.ro_mail_list(
  p_account_id uuid,
  p_limit integer default 100
)
returns table (
  mail_id uuid,
  batch_id uuid,
  sender_name text,
  subject text,
  body text,
  attachments jsonb,
  zeny bigint,
  blue_gem bigint,
  red_gem bigint,
  is_read boolean,
  read_at timestamptz,
  claimed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ro_mail_assert_account(p_account_id);
  return query
  select m.mail_id,m.batch_id,m.sender_name,m.subject,m.body,m.attachments,
         m.zeny,m.blue_gem,m.red_gem,m.is_read,m.read_at,m.claimed_at,m.expires_at,m.created_at
  from public.ro_mail_messages m
  where m.recipient_account_id = p_account_id
  order by m.created_at desc
  limit greatest(1,least(coalesce(p_limit,100),200));
end;
$$;

create or replace function public.ro_mail_mark_read(p_account_id uuid, p_mail_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ro_mail_assert_account(p_account_id);
  update public.ro_mail_messages m
     set is_read = true,
         read_at = coalesce(m.read_at, now())
   where m.mail_id = p_mail_id
     and m.recipient_account_id = p_account_id;
  return found;
end;
$$;

create or replace function public.ro_mail_begin_claim(p_account_id uuid, p_mail_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mail public.ro_mail_messages%rowtype;
  v_token uuid;
begin
  perform public.ro_mail_assert_account(p_account_id);
  select m.* into v_mail
  from public.ro_mail_messages m
  where m.mail_id = p_mail_id
    and m.recipient_account_id = p_account_id
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
  if v_mail.zeny <= 0
     and coalesce(v_mail.blue_gem,0) <= 0
     and coalesce(v_mail.red_gem,0) <= 0
     and jsonb_array_length(v_mail.attachments) = 0 then
    raise exception 'RO_MAIL_NO_REWARD';
  end if;

  v_token := coalesce(v_mail.claim_token, gen_random_uuid());
  update public.ro_mail_messages
     set claim_token = v_token,
         claim_started_at = coalesce(claim_started_at, now()),
         is_read = true,
         read_at = coalesce(read_at, now())
   where mail_id = p_mail_id
     and recipient_account_id = p_account_id;

  return jsonb_build_object(
    'mail_id', v_mail.mail_id,
    'batch_id', v_mail.batch_id,
    'claim_token', v_token,
    'attachments', v_mail.attachments,
    'zeny', v_mail.zeny,
    'blue_gem', coalesce(v_mail.blue_gem,0),
    'red_gem', coalesce(v_mail.red_gem,0),
    'already_claimed', false
  );
end;
$$;

create or replace function public.ro_mail_finalize_claim(p_account_id uuid, p_mail_id uuid, p_claim_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ro_mail_assert_account(p_account_id);
  update public.ro_mail_messages m
     set claimed_at = coalesce(m.claimed_at, now()),
         is_read = true,
         read_at = coalesce(m.read_at, now())
   where m.mail_id = p_mail_id
     and m.recipient_account_id = p_account_id
     and m.claim_token = p_claim_token
     and m.claimed_at is null;
  if found then return true; end if;
  return exists (
    select 1
    from public.ro_mail_messages m
    where m.mail_id = p_mail_id
      and m.recipient_account_id = p_account_id
      and m.claim_token = p_claim_token
      and m.claimed_at is not null
  );
end;
$$;

-- 先移除 V0.9.85A 舊版 GM RPC，避免留下「同 Email 任一 GM 即可操作」的舊入口。
drop function if exists public.ro_gm_find_players(text,integer);
drop function if exists public.ro_gm_send_mail(text,bigint,text,text,jsonb,bigint,timestamptz);
drop function if exists public.ro_gm_recent_mail(integer);
drop function if exists public.ro_mail_assert_gm();

create or replace function public.ro_gm_find_players(
  p_gm_account_id uuid,
  p_query text default '',
  p_limit integer default 30
)
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
  v_limit integer := greatest(1, least(coalesce(p_limit,30),100));
begin
  perform public.ro_mail_assert_gm(p_gm_account_id);
  return query
  select a.player_id, a.account_name, a.account_status, a.is_test, a.account_role
  from public.ro_accounts a
  where v_q = ''
     or a.player_id::text = v_q
     or a.account_name ilike '%' || v_q || '%'
  order by a.player_id asc
  limit v_limit;
end;
$$;

create or replace function public.ro_gm_send_mail(
  p_gm_account_id uuid,
  p_target_mode text,
  p_player_id bigint,
  p_subject text,
  p_body text default '',
  p_attachments jsonb default '[]'::jsonb,
  p_zeny bigint default 0,
  p_blue_gem bigint default 0,
  p_red_gem bigint default 0,
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
  v_blue_gem bigint := greatest(0, coalesce(p_blue_gem,0));
  v_red_gem bigint := greatest(0, coalesce(p_red_gem,0));
  v_batch uuid := gen_random_uuid();
  v_count integer := 0;
  v_bad integer := 0;
begin
  v_sender_account := public.ro_mail_assert_gm(p_gm_account_id);
  select a.player_id into v_sender_player
  from public.ro_accounts a where a.account_id = v_sender_account;

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
  if v_zeny > 999999999999 or v_blue_gem > 999999999999 or v_red_gem > 999999999999 then
    raise exception 'RO_GM_CURRENCY_TOO_LARGE';
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
    subject,body,attachments,zeny,blue_gem,red_gem,expires_at
  )
  select
    gen_random_uuid(),v_batch,a.account_id,a.player_id,
    v_sender_account,v_sender_player,'GM CENTER',v_mode,
    case when v_mode='player' then p_player_id else null end,
    v_subject,v_body,v_attachments,v_zeny,v_blue_gem,v_red_gem,p_expires_at
  from public.ro_accounts a
  where a.account_status = 'active'
    and (
      (v_mode='player' and a.player_id = p_player_id)
      or (v_mode='all')
      or (v_mode='all_normal' and coalesce(a.is_test,false)=false and lower(coalesce(a.account_role,'player')) <> 'gm')
      or (v_mode='all_test' and (coalesce(a.is_test,false)=true or lower(coalesce(a.account_role,''))='gm'))
    );

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'RO_GM_NO_RECIPIENT';
  end if;

  return jsonb_build_object('batch_id',v_batch,'recipient_count',v_count);
end;
$$;

create or replace function public.ro_gm_recent_mail(
  p_gm_account_id uuid,
  p_limit integer default 20
)
returns table (
  batch_id uuid,
  created_at timestamptz,
  target_mode text,
  target_player_id bigint,
  subject text,
  recipient_count bigint,
  attachment_count integer,
  zeny bigint,
  blue_gem bigint,
  red_gem bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ro_mail_assert_gm(p_gm_account_id);
  return query
  select m.batch_id,
         min(m.created_at) as created_at,
         min(m.target_mode) as target_mode,
         min(m.target_player_id) as target_player_id,
         min(m.subject) as subject,
         count(*) as recipient_count,
         max(jsonb_array_length(m.attachments)) as attachment_count,
         max(m.zeny) as zeny,
         max(m.blue_gem) as blue_gem,
         max(m.red_gem) as red_gem
  from public.ro_mail_messages m
  where m.sender_account_id = p_gm_account_id
  group by m.batch_id
  order by min(m.created_at) desc
  limit greatest(1,least(coalesce(p_limit,20),50));
end;
$$;

-- 信箱開通歡迎信：現有帳號補發一次；未來新 RO 帳號建立時自動發一次。
create or replace function public.ro_mail_create_account_welcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ro_mail_messages (
    recipient_account_id,recipient_player_id,sender_name,target_mode,target_player_id,
    category,priority,system_key,subject,body,attachments,zeny,blue_gem,red_gem
  ) values (
    new.account_id,new.player_id,'彼岸花仙境營運團隊','player',new.player_id,
    'system',10,'mail_open_welcome_v1',
    '信箱系統正式開通！',
    '親愛的冒險者您好：\n\n彼岸花仙境的遊戲內信箱已正式開通！往後系統通知、活動獎勵與 GM 補發內容，都可以透過信箱安全送達。\n\n為慶祝信箱開通，我們準備了「紅寶石 ×100」作為開通信箱紀念禮。請使用目前想要領取獎勵的角色開啟本信件，並按下「領取附件」。\n\n感謝你陪伴彼岸花仙境持續成長，祝你冒險愉快！',
    '[]'::jsonb,0,0,100
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists ro_mail_account_welcome_trigger on public.ro_accounts;
create trigger ro_mail_account_welcome_trigger
after insert on public.ro_accounts
for each row execute function public.ro_mail_create_account_welcome();

insert into public.ro_mail_messages (
  recipient_account_id,recipient_player_id,sender_name,target_mode,target_player_id,
  category,priority,system_key,subject,body,attachments,zeny,blue_gem,red_gem
)
select
  a.account_id,a.player_id,'彼岸花仙境營運團隊','player',a.player_id,
  'system',10,'mail_open_welcome_v1',
  '信箱系統正式開通！',
  '親愛的冒險者您好：\n\n彼岸花仙境的遊戲內信箱已正式開通！往後系統通知、活動獎勵與 GM 補發內容，都可以透過信箱安全送達。\n\n為慶祝信箱開通，我們準備了「紅寶石 ×100」作為開通信箱紀念禮。請使用目前想要領取獎勵的角色開啟本信件，並按下「領取附件」。\n\n感謝你陪伴彼岸花仙境持續成長，祝你冒險愉快！',
  '[]'::jsonb,0,0,100
from public.ro_accounts a
where coalesce(a.account_status,'active') = 'active'
on conflict do nothing;

revoke all on function public.ro_mail_assert_gm(uuid) from public;
revoke all on function public.ro_mail_assert_account(uuid) from public;
revoke all on function public.ro_mail_list(uuid,integer) from public;
revoke all on function public.ro_mail_mark_read(uuid,uuid) from public;
revoke all on function public.ro_mail_begin_claim(uuid,uuid) from public;
revoke all on function public.ro_mail_finalize_claim(uuid,uuid,uuid) from public;
revoke all on function public.ro_gm_find_players(uuid,text,integer) from public;
revoke all on function public.ro_gm_send_mail(uuid,text,bigint,text,text,jsonb,bigint,bigint,bigint,timestamptz) from public;
revoke all on function public.ro_gm_recent_mail(uuid,integer) from public;

-- 玩家只能透過目前 account_id 讀取/領取自己的信箱；GM RPC 也再次核對目前 GM account_id。
grant execute on function public.ro_mail_list(uuid,integer) to authenticated;
grant execute on function public.ro_mail_mark_read(uuid,uuid) to authenticated;
grant execute on function public.ro_mail_begin_claim(uuid,uuid) to authenticated;
grant execute on function public.ro_mail_finalize_claim(uuid,uuid,uuid) to authenticated;
grant execute on function public.ro_gm_find_players(uuid,text,integer) to authenticated;
grant execute on function public.ro_gm_send_mail(uuid,text,bigint,text,text,jsonb,bigint,bigint,bigint,timestamptz) to authenticated;
grant execute on function public.ro_gm_recent_mail(uuid,integer) to authenticated;

comment on table public.ro_mail_messages is 'RO_WEB account-level mailbox. V0.9.85B adds Zeny/Blue Gem/Red Gem attachments and system welcome mail.';
