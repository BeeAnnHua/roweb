-- ============================================================
-- 彼岸花仙境 / RO_WEB V0.9.87J
-- Offline Continuity V1 - atomic revision protected resume RPC
--
-- Safety rule:
--   Offline client may upload ONLY when the cloud character revision is
--   exactly the revision that was verified before entering OFFLINE mode.
--   Any other device/tab save changes the revision and blocks auto merge.
-- ============================================================

create or replace function public.ro_resume_offline_character(
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
  v_current_revision bigint;
  v_player jsonb;
  v_name text;
  v_job_name text;
  v_map_name text;
  v_job_id bigint;
  v_base_level bigint;
  v_job_level bigint;
  v_save_version bigint;
  v_envelope_account text;
  v_envelope_character text;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'RO_AUTH_REQUIRED';
  end if;

  if p_save_data is null or jsonb_typeof(p_save_data) <> 'object' then
    raise exception 'RO_INVALID_SAVE_DATA';
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

  -- Lock the exact character row so revision compare + update is atomic.
  select coalesce(c.revision, 0)
    into v_current_revision
    from public.ro_characters c
   where c.character_id = p_character_id
     and c.account_id = p_account_id
   for update;

  if not found then
    raise exception 'RO_CHARACTER_NOT_FOUND';
  end if;

  if v_current_revision <> greatest(0, coalesce(p_expected_revision, 0)) then
    raise exception 'RO_OFFLINE_REVISION_CONFLICT expected=% current=%',
      greatest(0, coalesce(p_expected_revision, 0)), v_current_revision;
  end if;

  v_player := coalesce(p_save_data -> 'player', '{}'::jsonb);
  if jsonb_typeof(v_player) <> 'object' then
    raise exception 'RO_INVALID_SAVE_DATA';
  end if;

  -- Browser envelope identity must not claim a different account/character.
  v_envelope_account := coalesce(nullif(p_save_data ->> 'accountId', ''), nullif(v_player ->> 'accountId', ''), '');
  v_envelope_character := coalesce(nullif(p_save_data ->> 'characterId', ''), nullif(v_player ->> 'characterId', ''), '');
  if v_envelope_account <> '' and v_envelope_account <> p_account_id::text then
    raise exception 'RO_CROSS_ACCOUNT_SAVE_BLOCKED';
  end if;
  if v_envelope_character <> '' and v_envelope_character <> p_character_id::text then
    raise exception 'RO_CROSS_CHARACTER_SAVE_BLOCKED';
  end if;

  v_save_version := case
    when coalesce(p_save_data ->> 'saveVersion', '') ~ '^[0-9]{1,18}$'
      then (p_save_data ->> 'saveVersion')::bigint
    else 0
  end;

  if v_save_version < v_current_revision then
    raise exception 'RO_OFFLINE_SAVE_OLDER_THAN_BASE local=% cloud=%', v_save_version, v_current_revision;
  end if;

  v_name := left(coalesce(nullif(btrim(v_player ->> 'name'), ''), '冒險者'), 24);
  v_job_name := left(coalesce(nullif(btrim(v_player ->> 'job'), ''), '初學者'), 80);
  v_map_name := nullif(left(coalesce(v_player ->> 'map', ''), 120), '');
  v_job_id := case when coalesce(v_player ->> 'jobId', '') ~ '^-?[0-9]{1,9}$' then (v_player ->> 'jobId')::bigint else null end;
  v_base_level := case when coalesce(v_player ->> 'baseLevel', '') ~ '^[0-9]{1,9}$' then greatest(1,(v_player ->> 'baseLevel')::bigint) else 1 end;
  v_job_level := case when coalesce(v_player ->> 'jobLevel', '') ~ '^[0-9]{1,9}$' then greatest(1,(v_player ->> 'jobLevel')::bigint) else 1 end;

  update public.ro_characters c
     set name       = v_name,
         job_id     = v_job_id,
         job_name   = v_job_name,
         base_level = v_base_level,
         job_level  = v_job_level,
         map_name   = v_map_name,
         save_data  = p_save_data,
         revision   = greatest(v_current_revision, v_save_version),
         updated_at = now()
   where c.character_id = p_character_id
     and c.account_id = p_account_id
  returning jsonb_build_object(
    'character_id', c.character_id,
    'account_id', c.account_id,
    'revision', c.revision,
    'save_version', v_save_version,
    'updated_at', c.updated_at
  ) into v_result;

  if v_result is null then
    raise exception 'RO_OFFLINE_RESUME_FAILED';
  end if;

  return v_result;
end;
$$;

revoke all on function public.ro_resume_offline_character(uuid,uuid,bigint,jsonb) from public;
grant execute on function public.ro_resume_offline_character(uuid,uuid,bigint,jsonb) to authenticated;

comment on function public.ro_resume_offline_character(uuid,uuid,bigint,jsonb) is
  'RO_WEB V0.9.87J: atomically resumes an OFFLINE local character only when cloud revision still equals the pre-offline verified revision.';

select
  'V0.9.87J_OFFLINE_CONTINUITY_V1_READY' as status,
  to_regprocedure('public.ro_resume_offline_character(uuid,uuid,bigint,jsonb)') is not null as resume_rpc_ready;
