-- ============================================================
-- 彼岸花仙境 / RO_WEB V0.9.85L
-- 跨裝置雲端角色存檔：受控 RPC
--
-- 目的：
-- 1. ro_characters 保持禁止 authenticated 直接 UPDATE。
-- 2. 玩家只能透過本 RPC 更新「auth.uid() 自己擁有的 RO account」中的角色。
-- 3. character_id 必須真的屬於傳入的 account_id。
-- 4. 解決新瀏覽器 / 新裝置沒有 localStorage 時，正確角色進度無法同步到雲端的問題。
-- ============================================================

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
  v_player jsonb;
  v_name text;
  v_job_name text;
  v_map_name text;
  v_job_id bigint;
  v_base_level bigint;
  v_job_level bigint;
  v_save_version bigint;
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

  -- account_id 必須是目前登入 Email / Auth UID 自己的遊戲帳號。
  if not exists (
    select 1
      from public.ro_accounts a
     where a.account_id = p_account_id
       and a.user_id = auth.uid()
       and coalesce(a.account_status, 'active') = 'active'
  ) then
    raise exception 'RO_ACCOUNT_PERMISSION_DENIED';
  end if;

  -- character_id 必須隸屬目前指定的 account_id。
  if not exists (
    select 1
      from public.ro_characters c
     where c.character_id = p_character_id
       and c.account_id = p_account_id
  ) then
    raise exception 'RO_CHARACTER_NOT_FOUND';
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

  update public.ro_characters c
     set name       = v_name,
         job_id     = v_job_id,
         job_name   = v_job_name,
         base_level = v_base_level,
         job_level  = v_job_level,
         map_name   = v_map_name,
         save_data  = p_save_data,
         revision   = greatest(coalesce(c.revision, 0), v_save_version),
         updated_at = now()
   where c.character_id = p_character_id
     and c.account_id = p_account_id
  returning jsonb_build_object(
    'character_id', c.character_id,
    'slot_index', c.slot_index,
    'name', c.name,
    'job_id', c.job_id,
    'job_name', c.job_name,
    'base_level', c.base_level,
    'job_level', c.job_level,
    'map_name', c.map_name,
    'save_data', c.save_data,
    'revision', c.revision,
    'updated_at', c.updated_at
  ) into v_result;

  if v_result is null then
    raise exception 'RO_CHARACTER_SAVE_FAILED';
  end if;

  return v_result;
end;
$$;

revoke all on function public.ro_save_character(uuid,uuid,jsonb) from public;
grant execute on function public.ro_save_character(uuid,uuid,jsonb) to authenticated;

comment on function public.ro_save_character(uuid,uuid,jsonb) is
  'RO_WEB V0.9.85L secure cloud character save RPC. auth.uid() may update only characters owned by its RO account.';
