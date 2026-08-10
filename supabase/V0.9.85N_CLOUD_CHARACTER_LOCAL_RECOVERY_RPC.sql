-- ============================================================
-- 彼岸花仙境 / RO_WEB V0.9.85N
-- 雲端角色誤刪救援：受控本機備份復原 RPC
--
-- 用途：
-- 1. 只有 auth.uid() 自己擁有的 RO account 可以呼叫。
-- 2. 本機 save_data 必須明確帶有相同 accountId + characterId。
-- 3. 只接受已建立角色（Base/Job > 1 或非初學者），拒絕 Lv1 暫存。
-- 4. character_id 必須目前不存在，目標 slot 也必須為空。
-- 5. 以原 character_id 重建完整 save_data，讓其他瀏覽器/手機重新從雲端取得。
-- ============================================================

create or replace function public.ro_restore_character_from_local(
  p_account_id uuid,
  p_character_id uuid,
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
  v_account_text text;
  v_character_text text;
  v_name text;
  v_job_name text;
  v_map_name text;
  v_job_id bigint;
  v_base_level bigint;
  v_job_level bigint;
  v_save_version bigint;
  v_slot_limit integer;
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
     and coalesce(a.account_status, 'active') = 'active';

  if v_slot_limit is null then
    raise exception 'RO_ACCOUNT_PERMISSION_DENIED';
  end if;

  if p_slot_index < 1 or p_slot_index > v_slot_limit then
    raise exception 'RO_INVALID_TARGET_SLOT';
  end if;

  -- Deleted-row recovery is intentionally stricter than normal migration:
  -- explicit identity is mandatory. Identity-less old saves may not recreate a cloud row.
  v_account_text := coalesce(nullif(p_save_data ->> 'accountId', ''), nullif(v_player ->> 'accountId', ''), '');
  v_character_text := coalesce(nullif(p_save_data ->> 'characterId', ''), nullif(v_player ->> 'characterId', ''), '');
  if v_account_text <> p_account_id::text or v_character_text <> p_character_id::text then
    raise exception 'RO_RESTORE_IDENTITY_MISMATCH';
  end if;

  if exists (select 1 from public.ro_characters c where c.character_id = p_character_id) then
    raise exception 'RO_RESTORE_CHARACTER_ALREADY_EXISTS';
  end if;

  if exists (
    select 1 from public.ro_characters c
     where c.account_id = p_account_id
       and c.slot_index = p_slot_index
  ) then
    raise exception 'RO_RESTORE_SLOT_OCCUPIED';
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

  insert into public.ro_characters (
    character_id, account_id, slot_index,
    name, job_id, job_name, base_level, job_level, map_name,
    save_data, revision
  ) values (
    p_character_id, p_account_id, p_slot_index,
    v_name, v_job_id, v_job_name, v_base_level, v_job_level, v_map_name,
    p_save_data, v_save_version
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
    raise exception 'RO_RESTORE_CHARACTER_FAILED';
  end if;

  return v_result;
end;
$$;

revoke all on function public.ro_restore_character_from_local(uuid,uuid,integer,jsonb) from public;
grant execute on function public.ro_restore_character_from_local(uuid,uuid,integer,jsonb) to authenticated;

comment on function public.ro_restore_character_from_local(uuid,uuid,integer,jsonb) is
  'RO_WEB V0.9.85N controlled recovery of a deleted cloud character from an identity-bound established local save.';
