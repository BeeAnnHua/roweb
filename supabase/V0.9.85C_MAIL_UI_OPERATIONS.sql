-- ============================================================
-- 彼岸花仙境 / RO_WEB V0.9.85C
-- 信箱操作修正：GM 入口驗證 / 一鍵刪除已讀 / 歡迎信換行修正
-- 前置：已執行 V0.9.85B_MAIL_GM_CENTER.sql
-- 建議：Supabase SQL Editor 新增一個 New query 後執行本檔。
-- ============================================================

-- 1) 前端只透過此 RPC 判斷「目前選中的 RO account」是否真的具有 GM 權限。
create or replace function public.ro_gm_can_access(p_gm_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ro_accounts a
    where a.account_id = p_gm_account_id
      and a.user_id = auth.uid()
      and lower(coalesce(a.account_role,'')) = 'gm'
      and coalesce(a.account_status,'active') = 'active'
  );
$$;

-- 2) 一鍵刪除「已讀且安全可刪」郵件。
--    已讀但仍有尚未領取附件的郵件一律保留，包含已過期但未領取的附件信。
create or replace function public.ro_mail_delete_read(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
  v_skipped integer := 0;
begin
  perform public.ro_mail_assert_account(p_account_id);

  select count(*)::integer
    into v_skipped
  from public.ro_mail_messages m
  where m.recipient_account_id = p_account_id
    and m.is_read = true
    and m.claimed_at is null
    and (
      coalesce(m.zeny,0) > 0
      or coalesce(m.blue_gem,0) > 0
      or coalesce(m.red_gem,0) > 0
      or jsonb_array_length(coalesce(m.attachments,'[]'::jsonb)) > 0
    );

  delete from public.ro_mail_messages m
  where m.recipient_account_id = p_account_id
    and m.is_read = true
    and (
      m.claimed_at is not null
      or (
        coalesce(m.zeny,0) <= 0
        and coalesce(m.blue_gem,0) <= 0
        and coalesce(m.red_gem,0) <= 0
        and jsonb_array_length(coalesce(m.attachments,'[]'::jsonb)) = 0
      )
    );

  get diagnostics v_deleted = row_count;
  return jsonb_build_object(
    'deleted_count', v_deleted,
    'skipped_unclaimed_rewards', v_skipped
  );
end;
$$;

-- 3) 修正 V0.9.85B 歡迎信中顯示成字面「\\n」的換行。
update public.ro_mail_messages
set body = replace(body, E'\\n', E'\n')
where system_key = 'mail_open_welcome_v1'
  and position(E'\\n' in body) > 0;

-- 未來新建立 RO 帳號，也使用真正換行字元。
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
    E'親愛的冒險者您好：\n\n彼岸花仙境的遊戲內信箱已正式開通！往後系統通知、活動獎勵與 GM 補發內容，都可以透過信箱安全送達。\n\n為慶祝信箱開通，我們準備了「紅寶石 ×100」作為開通信箱紀念禮。請使用目前想要領取獎勵的角色開啟本信件，並按下「領取附件」。\n\n感謝你陪伴彼岸花仙境持續成長，祝你冒險愉快！',
    '[]'::jsonb,0,0,100
  )
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.ro_gm_can_access(uuid) from public;
revoke all on function public.ro_mail_delete_read(uuid) from public;
grant execute on function public.ro_gm_can_access(uuid) to authenticated;
grant execute on function public.ro_mail_delete_read(uuid) to authenticated;

comment on function public.ro_gm_can_access(uuid) is 'V0.9.85C verifies GM permission for the currently selected RO account only.';
comment on function public.ro_mail_delete_read(uuid) is 'V0.9.85C deletes read mail while preserving every unclaimed reward mail.';
