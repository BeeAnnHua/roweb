-- ============================================================
-- 彼岸花仙境 / RO_WEB V0.9.86I
-- Legacy 瀏覽器角色深度救援 RPC
--
-- 用途：
-- 1. 只允許 auth.uid() 自己擁有、active 的 RO account。
-- 2. 必須額外確認 Player ID，避免帳號切換時誤復原。
-- 3. 僅接受已有實際進度的角色，拒絕預設 Lv1 初學者暫存。
-- 4. 若來源 accountId 是「另一個 Supabase UUID」，直接拒絕；
--    只允許目前 account UUID、舊 acct_* / 非 UUID 本機識別或未帶 identity 的舊存檔。
-- 5. 伺服器建立新的 character UUID，並把 save_data / player 內 accountId、characterId
--    重綁到目前帳號。舊 checksum 移除，後續正常存檔會重新產生。
-- ============================================================

create or replace function public.ro_restore_legacy_character_from_browser(
  p_account_id uuid,
  p_confirm_player_id bigint,
  p_slot_index integer,
  p_save_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player jsonb;
  v_source_account_text text;
  v_name text;
  v_job_name text;
  v_map_name text;
  v_job_id bigint;
  v_base_level bigint;
  v_job_level bigint;
  v_save_version bigint;
  v_slot_limit integer;
  v_new_character_id uuid;
  v_normalized_save jsonb;
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

  select greatest(1, least(12, coalesce(a.slot_limit, 12)))
    into v_slot_limit
    from public.ro_accounts a
   where a.account_id = p_account_id
     and a.user_id = auth.uid()
     and a.player_id = p_confirm_player_id
     and coalesce(a.account_status, 'active') = 'active';

  if v_slot_limit is null then
    raise exception 'RO_ACCOUNT_PERMISSION_DENIED';
  end if;

  if p_slot_index < 1 or p_slot_index > v_slot_limit then
    raise exception 'RO_INVALID_TARGET_SLOT';
  end if;

  if exists (
    select 1 from public.ro_characters c
     where c.account_id = p_account_id
       and c.slot_index = p_slot_index
  ) then
    raise exception 'RO_RESTORE_SLOT_OCCUPIED';
  end if;

  v_source_account_text := coalesce(
    nullif(p_save_data ->> 'accountId', ''),
    nullif(v_player ->> 'accountId', ''),
    ''
  );

  -- 不允許拿另一個雲端 account UUID 的角色跨帳號復原。
  if v_source_account_text <> ''
     and v_source_account_text <> p_account_id::text
     and v_source_account_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'RO_LEGACY_RESTORE_CROSS_CLOUD_ACCOUNT_BLOCKED';
  end if;

  v_name := left(coalesce(nullif(btrim(v_player ->> 'name'), ''), '冒險者'), 24);
  v_job_name := left(coalesce(nullif(btrim(v_player ->> 'job'), ''), '初學者'), 80);
  v_map_name := nullif(left(coalesce(v_player ->> 'map', ''), 120), '');

  v_job_id := case
    when coalesce(v_player ->> 'jobId', '') ~ '^-?[0-9]{1,9}$'
      then (v_player ->> 'jobId')::bigint
    else null
  end;

  v_base_level := case
    when coalesce(v_player ->> 'baseLevel', '') ~ '^[0-9]{1,9}$'
      then greatest(1, (v_player ->> 'baseLevel')::bigint)
    else 1
  end;

  v_job_level := case
    when coalesce(v_player ->> 'jobLevel', '') ~ '^[0-9]{1,9}$'
      then greatest(1, (v_player ->> 'jobLevel')::bigint)
    else 1
  end;

  v_save_version := case
    when coalesce(p_save_data ->> 'saveVersion', '') ~ '^[0-9]{1,18}$'
      then (p_save_data ->> 'saveVersion')::bigint
    else 0
  end;

  if v_base_level <= 1
     and v_job_level <= 1
     and lower(btrim(v_job_name)) in ('', '初學者', '初心者', 'novice') then
    raise exception 'RO_RESTORE_SAVE_NOT_ESTABLISHED';
  end if;

  v_new_character_id := gen_random_uuid();

  -- 重新綁定新雲端 identity，並移除舊 checksum；下一次正常 save 會重新生成。
  v_player := jsonb_set(v_player, '{accountId}', to_jsonb(p_account_id::text), true);
  v_player := jsonb_set(v_player, '{characterId}', to_jsonb(v_new_character_id::text), true);
  v_normalized_save := p_save_data - 'checksum' - 'checksumVersion';
  v_normalized_save := jsonb_set(v_normalized_save, '{accountId}', to_jsonb(p_account_id::text), true);
  v_normalized_save := jsonb_set(v_normalized_save, '{characterId}', to_jsonb(v_new_character_id::text), true);
  v_normalized_save := jsonb_set(v_normalized_save, '{player}', v_player, true);
  v_normalized_save := jsonb_set(v_normalized_save, '{reason}', to_jsonb('legacy-browser-rescue'::text), true);

  insert into public.ro_characters (
    character_id, account_id, slot_index,
    name, job_id, job_name, base_level, job_level, map_name,
    save_data, revision
  ) values (
    v_new_character_id, p_account_id, p_slot_index,
    v_name, v_job_id, v_job_name, v_base_level, v_job_level, v_map_name,
    v_normalized_save, v_save_version
  )
  returning jsonb_build_object(
    'character_id', character_id,
    'account_id', account_id,
    'slot_index', slot_index,
    'name', name,
    'job_id', job_id,
    'job_name', job_name,
    'base_level', base_level,
    'job_level', job_level,
    'map_name', map_name,
    'save_data', save_data,
    'revision', revision,
    'created_at', created_at,
    'updated_at', updated_at
  ) into v_result;

  if v_result is null then
    raise exception 'RO_LEGACY_RESTORE_FAILED';
  end if;

  return v_result;
end;
$$;

revoke all on function public.ro_restore_legacy_character_from_browser(uuid,bigint,integer,jsonb) from public;
grant execute on function public.ro_restore_legacy_character_from_browser(uuid,bigint,integer,jsonb) to authenticated;

comment on function public.ro_restore_legacy_character_from_browser(uuid,bigint,integer,jsonb) is
  'RO_WEB V0.9.86I explicit-confirmation rescue for established legacy browser saves (acct_* / identity-less), rebinding them to a new UUID under the authenticated Player ID.';

-- 安裝確認：只列出函式名稱，不修改任何角色。
select
  p.proname as installed_function,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ro_restore_legacy_character_from_browser';
