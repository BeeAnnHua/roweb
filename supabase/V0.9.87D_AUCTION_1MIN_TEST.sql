-- ============================================================
-- 彼岸花仙境 RO_WEB V0.9.87D
-- Auction House 1-minute closed-loop TEST migration
-- Baseline: V0.9.87A auction SQL already installed.
-- Idempotent. New listings use 60 seconds until config is restored.
-- ============================================================

create table if not exists public.ro_auction_runtime_config (
  config_key text primary key,
  config_value_int bigint not null,
  note text null,
  updated_at timestamptz not null default now()
);

insert into public.ro_auction_runtime_config(config_key,config_value_int,note,updated_at)
values ('listing_duration_seconds',60,'V0.9.87D TEST: 1 minute listing lifetime',now())
on conflict (config_key) do update
set config_value_int=excluded.config_value_int,note=excluded.note,updated_at=now();

revoke all on table public.ro_auction_runtime_config from anon, authenticated;

create or replace function public.ro_auction_listing_duration_seconds()
returns integer
language sql
stable
security definer
set search_path=public
as $$
  select greatest(30, least(604800, coalesce((
    select config_value_int::integer
    from public.ro_auction_runtime_config
    where config_key='listing_duration_seconds'
  ),86400)));
$$;
revoke all on function public.ro_auction_listing_duration_seconds() from public;

create or replace function public.ro_auction_send_return_mail(p_listing public.ro_auction_listings,p_reason text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_secs integer:=public.ro_auction_listing_duration_seconds(); v_label text;
begin
  v_label:=case
    when v_secs<120 then v_secs::text||' 秒'
    when v_secs<7200 then ceil(v_secs/60.0)::int::text||' 分鐘'
    else round(v_secs/3600.0,1)::text||' 小時'
  end;
  insert into public.ro_mail_messages(
    recipient_account_id,recipient_player_id,sender_name,target_mode,target_player_id,category,priority,subject,body,attachments,system_key
  ) values (
    p_listing.seller_account_id,p_listing.seller_player_id,'拍賣交易所','player',p_listing.seller_player_id,'auction',1,
    case when p_reason='expired' then '拍賣商品已到期' else '拍賣商品已取消' end,
    case when p_reason='expired' then '商品 '||v_label||' 上架期限已結束，系統已將商品退還。上架藍寶石費用不退還。' else '你已取消拍賣商品，系統已將商品退還。上架藍寶石費用不退還。' end,
    public.ro_auction_mail_attachment(p_listing),
    'auction-return-'||p_listing.listing_id::text
  ) on conflict (recipient_account_id,system_key) where system_key is not null do nothing;
end;
$$;
revoke all on function public.ro_auction_send_return_mail(public.ro_auction_listings,text) from public;

create or replace function public.ro_auction_finalize_listing(p_account_id uuid,p_character_id uuid,p_listing_id uuid,p_listing_token uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_listing public.ro_auction_listings%rowtype;
  v_save jsonb; v_ver bigint; v_blue bigint; v_count bigint; v_instance jsonb;
  v_duration integer:=public.ro_auction_listing_duration_seconds();
begin
  perform public.ro_auction_assert_character(p_account_id,p_character_id);
  select * into v_listing from public.ro_auction_listings
   where listing_id=p_listing_id and listing_token=p_listing_token
     and seller_account_id=p_account_id and seller_character_id=p_character_id
   for update;
  if not found then raise exception 'RO_AUCTION_LISTING_NOT_FOUND'; end if;
  if v_listing.status='active' then
    return jsonb_build_object('listing_id',v_listing.listing_id,'status','active','expires_at',v_listing.expires_at,'already_finalized',true);
  end if;
  if v_listing.status<>'pending' then raise exception 'RO_AUCTION_LISTING_NOT_PENDING'; end if;

  select c.save_data into v_save from public.ro_characters c
   where c.character_id=p_character_id and c.account_id=p_account_id;
  v_ver:=greatest(0,public.ro_auction_json_number(v_save->'saveVersion',0));
  v_blue:=greatest(0,public.ro_auction_json_number(v_save #> '{player,blueGem}',0));
  if v_ver<=v_listing.begin_save_version then raise exception 'RO_AUCTION_SAVE_NOT_SYNCED'; end if;
  if not public.ro_auction_has_receipt(v_save,'list',v_listing.listing_id,v_listing.listing_token) then raise exception 'RO_AUCTION_ESCROW_RECEIPT_MISSING'; end if;
  if v_blue>greatest(0,v_listing.begin_blue_gem-v_listing.listing_fee_blue_gem) then raise exception 'RO_AUCTION_FEE_NOT_SAVED'; end if;

  if v_listing.instance_id is not null then
    v_instance:=public.ro_auction_find_instance(v_save,v_listing.instance_id);
    if v_instance is not null then raise exception 'RO_AUCTION_ITEM_NOT_ESCROWED'; end if;
  else
    v_count:=public.ro_auction_count_item(v_save,v_listing.item_id);
    if v_count>greatest(0,v_listing.begin_item_count-v_listing.quantity) then raise exception 'RO_AUCTION_ITEM_NOT_ESCROWED'; end if;
  end if;

  update public.ro_auction_listings
     set status='active',activated_at=now(),expires_at=now()+make_interval(secs=>v_duration),updated_at=now()
   where listing_id=v_listing.listing_id
  returning * into v_listing;

  return jsonb_build_object(
    'listing_id',v_listing.listing_id,'status','active','expires_at',v_listing.expires_at,
    'duration_seconds',v_duration,'fee_blue_gem',v_listing.listing_fee_blue_gem,'total_price',v_listing.total_price
  );
end;
$$;
revoke all on function public.ro_auction_finalize_listing(uuid,uuid,uuid,uuid) from public;
grant execute on function public.ro_auction_finalize_listing(uuid,uuid,uuid,uuid) to authenticated;

-- Lightweight authenticated tick used only while the auction test UI is open.
create or replace function public.ro_auction_tick(p_account_id uuid)
returns integer
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or not exists(
    select 1 from public.ro_accounts a
    where a.account_id=p_account_id and a.user_id=auth.uid() and coalesce(a.account_status,'active')='active'
  ) then raise exception 'RO_AUCTION_PERMISSION_DENIED'; end if;
  return public.ro_auction_sweep();
end;
$$;
revoke all on function public.ro_auction_tick(uuid) from public;
grant execute on function public.ro_auction_tick(uuid) to authenticated;

-- Verification row for SQL Editor.
select
  'V0.9.87D_AUCTION_1MIN_TEST_READY' as status,
  public.ro_auction_listing_duration_seconds() as listing_duration_seconds,
  'new listings only; existing active listings keep their current expires_at' as note;
