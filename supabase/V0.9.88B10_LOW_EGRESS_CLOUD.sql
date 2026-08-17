-- ============================================================
-- 彼岸花仙境 / RO_WEB V0.9.88B10
-- Supabase 低流量雲端同步
--
-- 1. 選角／傭兵名單只回傳必要摘要，不回傳背包、貨幣與完整存檔。
-- 2. 正常存檔以 revision 在同一列鎖內原子比對，回應不再 echo save_data。
-- 3. 存檔驗證在資料庫內比較版本／時間／checksum，只回傳數十 bytes。
-- 4. 信箱背景只查未讀數，不每分鐘下載最多 100 封完整郵件。
--
-- 部署順序：先在 Supabase SQL Editor 執行本檔，再覆蓋 B10 前端 Patch。
-- 可重複執行。
-- ============================================================

create or replace function public.ro_list_character_summaries(
  p_account_id uuid
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'RO_AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
      from public.ro_accounts a
     where a.account_id = p_account_id
       and a.user_id = auth.uid()
       and coalesce(a.account_status, 'active') = 'active'
  ) then
    raise exception 'RO_ACCOUNT_PERMISSION_DENIED';
  end if;

  return query
  select jsonb_strip_nulls(jsonb_build_object(
    'character_id', c.character_id,
    'account_id', c.account_id,
    'slot_index', c.slot_index,
    'name', c.name,
    'job_id', c.job_id,
    'job_name', c.job_name,
    'base_level', c.base_level,
    'job_level', c.job_level,
    'map_name', c.map_name,
    'revision', coalesce(c.revision, 0),
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'save_data', jsonb_strip_nulls(jsonb_build_object(
      'saveVersion', coalesce(c.revision, 0),
      'savedAt', floor(extract(epoch from c.updated_at) * 1000)::bigint,
      'seed', jsonb_strip_nulls(jsonb_build_object(
        'name', c.name,
        'gender', coalesce(nullif(x.p ->> 'gender', ''), nullif(c.save_data -> 'seed' ->> 'gender', ''))
      )),
      'player', case
        when jsonb_typeof(c.save_data -> 'player') = 'object' and x.p <> '{}'::jsonb then
          jsonb_strip_nulls(jsonb_build_object(
        'name', coalesce(nullif(x.p ->> 'name', ''), c.name),
        'job', coalesce(nullif(x.p ->> 'job', ''), c.job_name),
        'jobName', coalesce(nullif(x.p ->> 'jobName', ''), c.job_name),
        'jobKey', x.p ->> 'jobKey',
        'jobId', coalesce(x.p -> 'jobId', to_jsonb(c.job_id)),
        'gender', coalesce(nullif(x.p ->> 'gender', ''), nullif(c.save_data -> 'seed' ->> 'gender', ''), 'male'),
        'sex', x.p ->> 'sex',
        'bodyGender', x.p ->> 'bodyGender',
        'baseLevel', coalesce(x.p -> 'baseLevel', to_jsonb(c.base_level)),
        'jobLevel', coalesce(x.p -> 'jobLevel', to_jsonb(c.job_level)),
        'currentCity', x.p ->> 'currentCity',
        'map', coalesce(nullif(x.p ->> 'map', ''), c.map_name),
        'characterAtlas', x.p ->> 'characterAtlas',
        'portraitSrc', x.p ->> 'portraitSrc',
        'stats', x.p -> 'stats',
        'maxHp', x.p -> 'maxHp',
        'baseMaxHp', x.p -> 'baseMaxHp',
        'maxSp', x.p -> 'maxSp',
        'baseMaxSp', x.p -> 'baseMaxSp',
        'atk', x.p -> 'atk',
        'baseAtk', x.p -> 'baseAtk',
        'matk', x.p -> 'matk',
        'def', x.p -> 'def',
        'baseDef', x.p -> 'baseDef',
        'mdef', x.p -> 'mdef',
        'aspd', x.p -> 'aspd',
        'weaponType', x.p ->> 'weaponType',
        'weaponCategory', x.p ->> 'weaponCategory',
        'learnedSkills', x.p -> 'learnedSkills',
        'extraSkills', x.p -> 'extraSkills',
        'traits', x.p -> 'traits',
        'hit', x.p -> 'hit',
        'flee', x.p -> 'flee',
        'crit', x.p -> 'crit',
        'perfectDodge', x.p -> 'perfectDodge',
        'attackRange', x.p -> 'attackRange',
        'hasShield', (
          lower(coalesce(x.p ->> 'hasShield', 'false')) = 'true'
          or (x.p -> 'equipment' -> 'shield') is not null
        ),
        'hasFalcon', lower(coalesce(x.p ->> 'hasFalcon', 'false')) = 'true',
        'hasWarg', lower(coalesce(x.p ->> 'hasWarg', 'false')) = 'true',
        'mountState', x.p -> 'mountState',
        'appearanceGroup', x.p ->> 'appearanceGroup'
          ))
        else null
      end
    ))
  ))
  from public.ro_characters c
  cross join lateral (
    select case
      when jsonb_typeof(c.save_data -> 'player') = 'object' then c.save_data -> 'player'
      else '{}'::jsonb
    end as p
  ) x
  where c.account_id = p_account_id
  order by c.slot_index asc;
end;
$$;


create or replace function public.ro_save_character_low_egress(
  p_account_id uuid,
  p_character_id uuid,
  p_expected_revision bigint,
  p_save_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player jsonb;
  v_remote_save jsonb;
  v_remote_player jsonb;
  v_current_revision bigint;
  v_name text;
  v_job_name text;
  v_map_name text;
  v_job_id bigint;
  v_base_level bigint;
  v_job_level bigint;
  v_save_version bigint;
  v_local_established boolean;
  v_remote_default_like boolean;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'RO_AUTH_REQUIRED';
  end if;
  if p_save_data is null or jsonb_typeof(p_save_data) <> 'object' then
    raise exception 'RO_INVALID_SAVE_DATA';
  end if;

  v_player := coalesce(p_save_data -> 'player', '{}'::jsonb);
  if jsonb_typeof(v_player) <> 'object' then
    raise exception 'RO_INVALID_SAVE_DATA';
  end if;

  if not exists (
    select 1 from public.ro_accounts a
     where a.account_id = p_account_id
       and a.user_id = auth.uid()
       and coalesce(a.account_status, 'active') = 'active'
  ) then
    raise exception 'RO_ACCOUNT_PERMISSION_DENIED';
  end if;

  select coalesce(c.revision, 0), coalesce(c.save_data, '{}'::jsonb)
    into v_current_revision, v_remote_save
    from public.ro_characters c
   where c.character_id = p_character_id
     and c.account_id = p_account_id
   for update;

  if not found then
    raise exception 'RO_CHARACTER_NOT_FOUND';
  end if;

  if v_current_revision <> greatest(0, coalesce(p_expected_revision, 0)) then
    raise exception 'RO_CLOUD_CONFLICT_NEWER_REMOTE expected=% cloud=%',
      greatest(0, coalesce(p_expected_revision, 0)), v_current_revision;
  end if;

  v_save_version := case
    when coalesce(p_save_data ->> 'saveVersion', '') ~ '^[0-9]{1,18}$'
      then (p_save_data ->> 'saveVersion')::bigint
    else 0
  end;

  v_remote_player := case
    when jsonb_typeof(v_remote_save -> 'player') = 'object' then v_remote_save -> 'player'
    else '{}'::jsonb
  end;
  v_local_established := (
    case when coalesce(v_player ->> 'baseLevel', '') ~ '^[0-9]{1,9}$'
      then (v_player ->> 'baseLevel')::bigint else 1 end > 1
    or case when coalesce(v_player ->> 'jobLevel', '') ~ '^[0-9]{1,9}$'
      then (v_player ->> 'jobLevel')::bigint else 1 end > 1
    or lower(coalesce(nullif(btrim(v_player ->> 'job'), ''), 'novice'))
      not in ('novice', '初學者', '初心者')
  );
  v_remote_default_like := (
    case when coalesce(v_remote_player ->> 'baseLevel', '') ~ '^[0-9]{1,9}$'
      then (v_remote_player ->> 'baseLevel')::bigint else 1 end <= 1
    and case when coalesce(v_remote_player ->> 'jobLevel', '') ~ '^[0-9]{1,9}$'
      then (v_remote_player ->> 'jobLevel')::bigint else 1 end <= 1
    and lower(coalesce(nullif(btrim(v_remote_player ->> 'job'), ''), 'novice'))
      in ('novice', '初學者', '初心者')
  );

  -- Preserve the old B9 repair escape hatch for the known "new revision but
  -- default Lv1 snapshot" incident, without downloading that snapshot first.
  if v_save_version < v_current_revision and not (v_local_established and v_remote_default_like) then
    raise exception 'RO_CLOUD_SAVE_OLDER_THAN_REMOTE local=% cloud=%', v_save_version, v_current_revision;
  end if;

  v_name := left(coalesce(nullif(btrim(v_player ->> 'name'), ''), '冒險者'), 24);
  v_job_name := left(coalesce(nullif(btrim(v_player ->> 'job'), ''), '初學者'), 80);
  v_map_name := nullif(left(coalesce(v_player ->> 'map', ''), 120), '');
  v_job_id := case when coalesce(v_player ->> 'jobId', '') ~ '^-?[0-9]{1,9}$'
    then (v_player ->> 'jobId')::bigint else null end;
  v_base_level := case when coalesce(v_player ->> 'baseLevel', '') ~ '^[0-9]{1,9}$'
    then greatest(1, (v_player ->> 'baseLevel')::bigint) else 1 end;
  v_job_level := case when coalesce(v_player ->> 'jobLevel', '') ~ '^[0-9]{1,9}$'
    then greatest(1, (v_player ->> 'jobLevel')::bigint) else 1 end;

  update public.ro_characters c
     set name       = v_name,
         job_id     = v_job_id,
         job_name   = v_job_name,
         base_level = v_base_level,
         job_level  = v_job_level,
         map_name   = v_map_name,
         save_data  = p_save_data,
         revision   = greatest(v_current_revision + 1, v_save_version),
         updated_at = now()
   where c.character_id = p_character_id
     and c.account_id = p_account_id
  returning jsonb_build_object(
    'character_id', c.character_id,
    'account_id', c.account_id,
    'slot_index', c.slot_index,
    'name', c.name,
    'job_id', c.job_id,
    'job_name', c.job_name,
    'base_level', c.base_level,
    'job_level', c.job_level,
    'map_name', c.map_name,
    'revision', c.revision,
    'save_version', v_save_version,
    'saved_at', p_save_data ->> 'savedAt',
    'checksum', p_save_data ->> 'checksum',
    'updated_at', c.updated_at
  ) into v_result;

  if v_result is null then
    raise exception 'RO_CHARACTER_SAVE_FAILED';
  end if;
  return v_result;
end;
$$;


-- Keep already-open B9 tabs low-egress too: the legacy signature now delegates
-- to the atomic writer and also returns metadata only.
create or replace function public.ro_save_character(
  p_account_id uuid,
  p_character_id uuid,
  p_save_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected_revision bigint;
begin
  if auth.uid() is null then
    raise exception 'RO_AUTH_REQUIRED';
  end if;
  select coalesce(c.revision, 0)
    into v_expected_revision
    from public.ro_characters c
   where c.character_id = p_character_id
     and c.account_id = p_account_id;
  if not found then
    raise exception 'RO_CHARACTER_NOT_FOUND';
  end if;
  return public.ro_save_character_low_egress(
    p_account_id,
    p_character_id,
    v_expected_revision,
    p_save_data
  );
end;
$$;


create or replace function public.ro_verify_character_save(
  p_account_id uuid,
  p_character_id uuid,
  p_save_version bigint,
  p_saved_at bigint,
  p_checksum text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_remote_version bigint;
  v_remote_saved_at bigint;
  v_ok boolean;
begin
  if auth.uid() is null then
    raise exception 'RO_AUTH_REQUIRED';
  end if;
  if not exists (
    select 1 from public.ro_accounts a
     where a.account_id = p_account_id
       and a.user_id = auth.uid()
       and coalesce(a.account_status, 'active') = 'active'
  ) then
    raise exception 'RO_ACCOUNT_PERMISSION_DENIED';
  end if;

  select c.revision, c.updated_at, c.save_data
    into v_row
    from public.ro_characters c
   where c.character_id = p_character_id
     and c.account_id = p_account_id;
  if not found then
    raise exception 'RO_CHARACTER_NOT_FOUND';
  end if;

  v_remote_version := case
    when coalesce(v_row.save_data ->> 'saveVersion', '') ~ '^[0-9]{1,18}$'
      then (v_row.save_data ->> 'saveVersion')::bigint else 0 end;
  v_remote_saved_at := case
    when coalesce(v_row.save_data ->> 'savedAt', '') ~ '^[0-9]{1,18}$'
      then (v_row.save_data ->> 'savedAt')::bigint else 0 end;
  v_ok := v_remote_version = greatest(0, coalesce(p_save_version, 0))
    and v_remote_saved_at = greatest(0, coalesce(p_saved_at, 0))
    and coalesce(v_row.save_data ->> 'checksum', '') = coalesce(p_checksum, '');

  return jsonb_build_object(
    'ok', v_ok,
    'revision', coalesce(v_row.revision, 0),
    'updated_at', v_row.updated_at
  );
end;
$$;


create or replace function public.ro_mail_unread_count(
  p_account_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint;
begin
  if auth.uid() is null then
    raise exception 'RO_AUTH_REQUIRED';
  end if;
  if not exists (
    select 1 from public.ro_accounts a
     where a.account_id = p_account_id
       and a.user_id = auth.uid()
       and coalesce(a.account_status, 'active') = 'active'
  ) then
    raise exception 'RO_ACCOUNT_PERMISSION_DENIED';
  end if;
  select count(*) into v_count
    from public.ro_mail_messages m
   where m.recipient_account_id = p_account_id
     and m.is_read = false;
  return coalesce(v_count, 0);
end;
$$;


revoke all on function public.ro_list_character_summaries(uuid) from public;
revoke all on function public.ro_save_character_low_egress(uuid,uuid,bigint,jsonb) from public;
revoke all on function public.ro_save_character(uuid,uuid,jsonb) from public;
revoke all on function public.ro_verify_character_save(uuid,uuid,bigint,bigint,text) from public;
revoke all on function public.ro_mail_unread_count(uuid) from public;

grant execute on function public.ro_list_character_summaries(uuid) to authenticated;
grant execute on function public.ro_save_character_low_egress(uuid,uuid,bigint,jsonb) to authenticated;
grant execute on function public.ro_save_character(uuid,uuid,jsonb) to authenticated;
grant execute on function public.ro_verify_character_save(uuid,uuid,bigint,bigint,text) to authenticated;
grant execute on function public.ro_mail_unread_count(uuid) to authenticated;

comment on function public.ro_list_character_summaries(uuid) is
  'RO_WEB V0.9.88B10 low-egress selector/mercenary summaries; excludes inventory, currencies and full saves.';
comment on function public.ro_save_character_low_egress(uuid,uuid,bigint,jsonb) is
  'RO_WEB V0.9.88B10 atomic revision-protected cloud save; returns metadata only.';
comment on function public.ro_verify_character_save(uuid,uuid,bigint,bigint,text) is
  'RO_WEB V0.9.88B10 server-side save verification; never returns save_data.';
comment on function public.ro_mail_unread_count(uuid) is
  'RO_WEB V0.9.88B10 tiny background mailbox badge query.';
