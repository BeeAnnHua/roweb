-- ============================================================
-- 彼岸花仙境 / RO_WEB V0.9.87F
-- 拍賣交易所 V1.1：Zeny / 藍寶石 / 紅寶石三貨幣 + 同幣種上架費/成交稅 + 12H
-- Baseline: V0.9.87A + V0.9.87D 已安裝；V0.9.87E 可共存。
--
-- 規則：
-- 1. 新上架可選 zeny / blue / red。
-- 2. 上架費沿用 1 / 2 / 3 / 5 級距，但改由「售價幣種」支付。
-- 3. 成交稅固定 5%，亦由售價幣種回收；賣家由信箱收到 95%。
-- 4. 新上架期限 12 小時（43200 秒）。既有 active 商品保留原 expires_at。
-- 5. 舊版商品自動視為 Zeny 售價 + 藍寶石上架費，保持已發生交易的相容性。
-- ============================================================

create table if not exists public.ro_auction_runtime_config (
  config_key text primary key,
  config_value_int bigint not null,
  note text null,
  updated_at timestamptz not null default now()
);

insert into public.ro_auction_runtime_config(config_key,config_value_int,note,updated_at)
values ('listing_duration_seconds',43200,'V0.9.87F: fixed-price listing lifetime = 12 hours',now())
on conflict (config_key) do update
set config_value_int=excluded.config_value_int,note=excluded.note,updated_at=now();

alter table public.ro_auction_listings add column if not exists sale_currency text not null default 'zeny';
alter table public.ro_auction_listings add column if not exists listing_fee_currency text not null default 'blue';
alter table public.ro_auction_listings add column if not exists listing_fee_amount bigint not null default 0;
alter table public.ro_auction_listings add column if not exists begin_currency_balance bigint null;
alter table public.ro_auction_listings add column if not exists purchase_begin_currency_balance bigint null;

-- 舊資料：售價原本只有 Zeny；上架費原本只有藍寶石。
update public.ro_auction_listings
set sale_currency='zeny'
where sale_currency is null or sale_currency not in ('zeny','blue','red');

update public.ro_auction_listings
set listing_fee_currency='blue'
where listing_fee_currency is null or listing_fee_currency not in ('zeny','blue','red');

update public.ro_auction_listings
set listing_fee_amount=greatest(0,coalesce(listing_fee_blue_gem,0))
where coalesce(listing_fee_amount,0)=0 and coalesce(listing_fee_blue_gem,0)>0;

update public.ro_auction_listings
set begin_currency_balance=coalesce(begin_currency_balance,begin_blue_gem),
    purchase_begin_currency_balance=coalesce(purchase_begin_currency_balance,purchase_begin_zeny)
where begin_currency_balance is null or purchase_begin_currency_balance is null;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='ro_auction_sale_currency_check') then
    alter table public.ro_auction_listings add constraint ro_auction_sale_currency_check check (sale_currency in ('zeny','blue','red'));
  end if;
  if not exists(select 1 from pg_constraint where conname='ro_auction_fee_currency_check') then
    alter table public.ro_auction_listings add constraint ro_auction_fee_currency_check check (listing_fee_currency in ('zeny','blue','red'));
  end if;
  if not exists(select 1 from pg_constraint where conname='ro_auction_fee_amount_nonnegative') then
    alter table public.ro_auction_listings add constraint ro_auction_fee_amount_nonnegative check (listing_fee_amount between 0 and 9000000000000000);
  end if;
end $$;

create index if not exists ro_auction_currency_market_idx on public.ro_auction_listings(status,sale_currency,category,activated_at desc);

create or replace function public.ro_auction_currency_label(p_currency text)
returns text language sql immutable as $$
  select case lower(coalesce(p_currency,'zeny')) when 'blue' then '藍寶石' when 'red' then '紅寶石' else 'Zeny' end;
$$;
revoke all on function public.ro_auction_currency_label(text) from public;

create or replace function public.ro_auction_currency_balance(p_save jsonb,p_currency text)
returns bigint
language plpgsql immutable as $$
begin
  case lower(coalesce(p_currency,'zeny'))
    when 'blue' then return greatest(0,public.ro_auction_json_number(p_save #> '{player,blueGem}',0));
    when 'red'  then return greatest(0,public.ro_auction_json_number(p_save #> '{player,redGem}',0));
    else             return greatest(0,public.ro_auction_json_number(p_save #> '{player,zeny}',0));
  end case;
end;
$$;
revoke all on function public.ro_auction_currency_balance(jsonb,text) from public;

-- 沿用原本 1 / 2 / 3 / 5 級距，只改成與售價相同幣種。
create or replace function public.ro_auction_fee_amount(p_total_price bigint)
returns bigint language sql immutable as $$
  select case
    when coalesce(p_total_price,0) <= 1000000 then 1::bigint
    when p_total_price <= 10000000 then 2::bigint
    when p_total_price <= 100000000 then 3::bigint
    else 5::bigint
  end;
$$;
revoke all on function public.ro_auction_fee_amount(bigint) from public;

create or replace function public.ro_auction_listing_duration_seconds()
returns integer
language sql stable security definer set search_path=public as $$
  select greatest(30,least(604800,coalesce((
    select config_value_int::integer from public.ro_auction_runtime_config where config_key='listing_duration_seconds'
  ),43200)));
$$;
revoke all on function public.ro_auction_listing_duration_seconds() from public;

-- 新版 begin listing：多一個 p_sale_currency，舊 9 參數函式保留供舊客戶端相容。
create or replace function public.ro_auction_begin_listing(
  p_account_id uuid,
  p_character_id uuid,
  p_item_id bigint,
  p_instance_id text,
  p_quantity integer,
  p_unit_price bigint,
  p_item_name text,
  p_item_type text,
  p_category text,
  p_sale_currency text
)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_identity jsonb; v_char public.ro_characters%rowtype; v_account public.ro_accounts%rowtype;
  v_save jsonb; v_inventory jsonb; v_payload jsonb; v_row jsonb; v_item_count bigint:=0; v_ver bigint:=0;
  v_total bigint; v_fee bigint; v_balance bigint; v_listing public.ro_auction_listings%rowtype; v_name text; v_category text; v_currency text;
begin
  perform public.ro_auction_sweep();
  v_identity:=public.ro_auction_assert_character(p_account_id,p_character_id);
  select * into v_account from public.ro_accounts where account_id=p_account_id for update;
  select * into v_char from public.ro_characters where character_id=p_character_id and account_id=p_account_id for update;
  v_save:=v_char.save_data;
  if v_save is null or jsonb_typeof(v_save)<>'object' then raise exception 'RO_AUCTION_SAVE_REQUIRED'; end if;
  if exists(select 1 from public.ro_auction_restricted_items r where r.item_id=p_item_id) then raise exception 'RO_AUCTION_ITEM_RESTRICTED'; end if;
  if coalesce(p_quantity,0)<1 then raise exception 'RO_AUCTION_INVALID_QUANTITY'; end if;
  if coalesce(p_unit_price,0)<1 or p_unit_price>9000000000000000 then raise exception 'RO_AUCTION_INVALID_PRICE'; end if;
  if p_quantity::numeric*p_unit_price::numeric>9000000000000000 then raise exception 'RO_AUCTION_INVALID_PRICE'; end if;
  v_currency:=lower(coalesce(p_sale_currency,''));
  if v_currency not in ('zeny','blue','red') then raise exception 'RO_AUCTION_INVALID_CURRENCY'; end if;
  v_total:=(p_quantity::numeric*p_unit_price::numeric)::bigint;
  v_fee:=public.ro_auction_fee_amount(v_total);
  v_balance:=public.ro_auction_currency_balance(v_save,v_currency);
  v_ver:=greatest(0,public.ro_auction_json_number(v_save->'saveVersion',0));
  if v_balance<v_fee then raise exception 'RO_AUCTION_FEE_CURRENCY_NOT_ENOUGH'; end if;
  if (select count(*) from public.ro_auction_listings l where l.seller_account_id=p_account_id and l.status in ('pending','active','reserved'))>=5 then raise exception 'RO_AUCTION_LISTING_LIMIT'; end if;

  v_inventory:=v_save #> '{player,inventory}';
  if jsonb_typeof(v_inventory)<>'array' then raise exception 'RO_AUCTION_ITEM_NOT_FOUND'; end if;
  if nullif(coalesce(p_instance_id,''),'') is not null then
    v_payload:=public.ro_auction_find_instance(v_save,p_instance_id);
    if v_payload is null or public.ro_auction_json_number(v_payload->'id',0)<>p_item_id then raise exception 'RO_AUCTION_ITEM_NOT_FOUND'; end if;
    if lower(coalesce(v_payload->>'locked','false')) in ('true','1','yes') then raise exception 'RO_AUCTION_ITEM_LOCKED'; end if;
    if p_quantity<>1 then raise exception 'RO_AUCTION_INSTANCE_QUANTITY'; end if;
    v_item_count:=1;
  else
    v_item_count:=public.ro_auction_count_item(v_save,p_item_id);
    if v_item_count<p_quantity then raise exception 'RO_AUCTION_ITEM_NOT_ENOUGH'; end if;
    for v_row in select value from jsonb_array_elements(v_inventory) loop
      if public.ro_auction_json_number(v_row->'id',0)=p_item_id and nullif(coalesce(v_row->>'instanceId',''),'') is null then
        if lower(coalesce(v_row->>'locked','false')) in ('true','1','yes') then raise exception 'RO_AUCTION_ITEM_LOCKED'; end if;
        v_payload:=jsonb_set(v_row,'{count}',to_jsonb(p_quantity),true); exit;
      end if;
    end loop;
  end if;

  v_name:=left(coalesce(nullif(btrim(p_item_name),''),nullif(v_payload->>'name',''),'Item '||p_item_id::text),120);
  v_category:=case when p_category in ('weapon','armor','card','consume','material','other') then p_category else 'other' end;

  insert into public.ro_auction_listings(
    seller_account_id,seller_character_id,seller_player_id,seller_name,item_id,item_name,item_type,category,item_payload,instance_id,
    quantity,unit_price,total_price,listing_fee_blue_gem,listing_fee_currency,listing_fee_amount,sale_currency,sale_tax_bps,status,
    begin_save_version,begin_blue_gem,begin_currency_balance,begin_item_count
  ) values (
    p_account_id,p_character_id,v_account.player_id,left(coalesce(v_char.name,'冒險者'),80),p_item_id,v_name,left(coalesce(p_item_type,'etc'),32),v_category,v_payload,nullif(p_instance_id,''),
    p_quantity,p_unit_price,v_total,case when v_currency='blue' then least(v_fee,9999)::integer else 0 end,v_currency,v_fee,v_currency,500,'pending',
    v_ver,public.ro_auction_currency_balance(v_save,'blue'),v_balance,v_item_count
  ) returning * into v_listing;

  return jsonb_build_object(
    'listing_id',v_listing.listing_id,'listing_token',v_listing.listing_token,'status',v_listing.status,
    'sale_currency',v_currency,'fee_currency',v_currency,'fee_amount',v_fee,'total_price',v_total,
    'begin_currency_balance',v_balance,'begin_save_version',v_ver,'duration_seconds',public.ro_auction_listing_duration_seconds()
  );
end;
$$;
revoke all on function public.ro_auction_begin_listing(uuid,uuid,bigint,text,integer,bigint,text,text,text,text) from public;
grant execute on function public.ro_auction_begin_listing(uuid,uuid,bigint,text,integer,bigint,text,text,text,text) to authenticated;

create or replace function public.ro_auction_finalize_listing(p_account_id uuid,p_character_id uuid,p_listing_id uuid,p_listing_token uuid)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_listing public.ro_auction_listings%rowtype;
  v_save jsonb; v_ver bigint; v_balance bigint; v_count bigint; v_instance jsonb;
  v_duration integer:=public.ro_auction_listing_duration_seconds(); v_begin_balance bigint; v_fee bigint;
begin
  perform public.ro_auction_assert_character(p_account_id,p_character_id);
  select * into v_listing from public.ro_auction_listings
   where listing_id=p_listing_id and listing_token=p_listing_token and seller_account_id=p_account_id and seller_character_id=p_character_id for update;
  if not found then raise exception 'RO_AUCTION_LISTING_NOT_FOUND'; end if;
  if v_listing.status='active' then return jsonb_build_object('listing_id',v_listing.listing_id,'status','active','expires_at',v_listing.expires_at,'already_finalized',true); end if;
  if v_listing.status<>'pending' then raise exception 'RO_AUCTION_LISTING_NOT_PENDING'; end if;

  select c.save_data into v_save from public.ro_characters c where c.character_id=p_character_id and c.account_id=p_account_id;
  v_ver:=greatest(0,public.ro_auction_json_number(v_save->'saveVersion',0));
  v_balance:=public.ro_auction_currency_balance(v_save,v_listing.listing_fee_currency);
  v_begin_balance:=coalesce(v_listing.begin_currency_balance,v_listing.begin_blue_gem,0);
  v_fee:=case when coalesce(v_listing.listing_fee_amount,0)>0 then v_listing.listing_fee_amount else coalesce(v_listing.listing_fee_blue_gem,0) end;
  if v_ver<=v_listing.begin_save_version then raise exception 'RO_AUCTION_SAVE_NOT_SYNCED'; end if;
  if not public.ro_auction_has_receipt(v_save,'list',v_listing.listing_id,v_listing.listing_token) then raise exception 'RO_AUCTION_ESCROW_RECEIPT_MISSING'; end if;
  if v_balance>greatest(0,v_begin_balance-v_fee) then raise exception 'RO_AUCTION_FEE_NOT_SAVED'; end if;

  if v_listing.instance_id is not null then
    v_instance:=public.ro_auction_find_instance(v_save,v_listing.instance_id);
    if v_instance is not null then raise exception 'RO_AUCTION_ITEM_NOT_ESCROWED'; end if;
  else
    v_count:=public.ro_auction_count_item(v_save,v_listing.item_id);
    if v_count>greatest(0,v_listing.begin_item_count-v_listing.quantity) then raise exception 'RO_AUCTION_ITEM_NOT_ESCROWED'; end if;
  end if;

  update public.ro_auction_listings
     set status='active',activated_at=now(),expires_at=now()+make_interval(secs=>v_duration),updated_at=now()
   where listing_id=v_listing.listing_id returning * into v_listing;

  return jsonb_build_object('listing_id',v_listing.listing_id,'status','active','expires_at',v_listing.expires_at,
    'duration_seconds',v_duration,'sale_currency',v_listing.sale_currency,'fee_currency',v_listing.listing_fee_currency,
    'fee_amount',v_listing.listing_fee_amount,'total_price',v_listing.total_price);
end;
$$;
revoke all on function public.ro_auction_finalize_listing(uuid,uuid,uuid,uuid) from public;
grant execute on function public.ro_auction_finalize_listing(uuid,uuid,uuid,uuid) to authenticated;

create or replace function public.ro_auction_abort_pending(p_account_id uuid,p_character_id uuid,p_listing_id uuid,p_listing_token uuid)
returns boolean
language plpgsql security definer set search_path=public as $$
declare v_l public.ro_auction_listings%rowtype; v_save jsonb; v_ver bigint; v_balance bigint; v_count bigint; v_begin bigint; v_fee bigint;
begin
  perform public.ro_auction_assert_character(p_account_id,p_character_id);
  select * into v_l from public.ro_auction_listings where listing_id=p_listing_id and listing_token=p_listing_token and seller_account_id=p_account_id and seller_character_id=p_character_id for update;
  if not found or v_l.status<>'pending' then return false; end if;
  select save_data into v_save from public.ro_characters where character_id=p_character_id and account_id=p_account_id;
  v_ver:=public.ro_auction_json_number(v_save->'saveVersion',0);
  v_balance:=public.ro_auction_currency_balance(v_save,v_l.listing_fee_currency);
  v_begin:=coalesce(v_l.begin_currency_balance,v_l.begin_blue_gem,0); v_fee:=case when coalesce(v_l.listing_fee_amount,0)>0 then v_l.listing_fee_amount else coalesce(v_l.listing_fee_blue_gem,0) end;
  if v_l.instance_id is not null then v_count:=case when public.ro_auction_find_instance(v_save,v_l.instance_id) is null then 0 else 1 end;
  else v_count:=public.ro_auction_count_item(v_save,v_l.item_id); end if;
  if public.ro_auction_has_receipt(v_save,'list',v_l.listing_id,v_l.listing_token)
     or (v_ver>v_l.begin_save_version and (v_balance< v_begin or v_count<v_l.begin_item_count)) then raise exception 'RO_AUCTION_PENDING_ALREADY_DEDUCTED'; end if;
  update public.ro_auction_listings set status='aborted',cancelled_at=now(),updated_at=now() where listing_id=v_l.listing_id;
  return true;
end;
$$;
revoke all on function public.ro_auction_abort_pending(uuid,uuid,uuid,uuid) from public;
grant execute on function public.ro_auction_abort_pending(uuid,uuid,uuid,uuid) to authenticated;

create or replace function public.ro_auction_send_return_mail(p_listing public.ro_auction_listings,p_reason text)
returns void
language plpgsql security definer set search_path=public as $$
declare v_secs integer:=public.ro_auction_listing_duration_seconds(); v_label text; v_fee_label text;
begin
  v_label:=case when v_secs<120 then v_secs::text||' 秒' when v_secs<7200 then ceil(v_secs/60.0)::int::text||' 分鐘' else round(v_secs/3600.0,1)::text||' 小時' end;
  v_fee_label:=(case when coalesce(p_listing.listing_fee_amount,0)>0 then p_listing.listing_fee_amount else coalesce(p_listing.listing_fee_blue_gem,0) end)::text||' '||public.ro_auction_currency_label(p_listing.listing_fee_currency);
  insert into public.ro_mail_messages(recipient_account_id,recipient_player_id,sender_name,target_mode,target_player_id,category,priority,subject,body,attachments,system_key)
  values (
    p_listing.seller_account_id,p_listing.seller_player_id,'拍賣交易所','player',p_listing.seller_player_id,'auction',1,
    case when p_reason='expired' then '拍賣商品已到期' else '拍賣商品已取消' end,
    case when p_reason='expired' then '商品 '||v_label||' 上架期限已結束，系統已將商品退還。上架費 '||v_fee_label||' 不退還。'
         else '你已取消拍賣商品，系統已將商品退還。上架費 '||v_fee_label||' 不退還。' end,
    public.ro_auction_mail_attachment(p_listing),'auction-return-'||p_listing.listing_id::text
  ) on conflict (recipient_account_id,system_key) where system_key is not null do nothing;
end;
$$;
revoke all on function public.ro_auction_send_return_mail(public.ro_auction_listings,text) from public;

create or replace function public.ro_auction_finish_sale(p_listing_id uuid)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_listing public.ro_auction_listings%rowtype; v_net bigint; v_tax bigint; v_label text;
begin
  select * into v_listing from public.ro_auction_listings where listing_id=p_listing_id for update;
  if not found then raise exception 'RO_AUCTION_LISTING_NOT_FOUND'; end if;
  if v_listing.status='sold' then return jsonb_build_object('listing_id',v_listing.listing_id,'status','sold','already_sold',true,'sold_at',v_listing.sold_at); end if;
  if v_listing.status<>'reserved' or v_listing.buyer_account_id is null then raise exception 'RO_AUCTION_NOT_RESERVED'; end if;
  v_tax:=floor((v_listing.total_price::numeric*v_listing.sale_tax_bps::numeric)/10000)::bigint;
  v_net:=greatest(0,v_listing.total_price-v_tax); v_label:=public.ro_auction_currency_label(v_listing.sale_currency);
  update public.ro_auction_listings set status='sold',sold_at=now(),updated_at=now(),reserved_until=null where listing_id=v_listing.listing_id;

  insert into public.ro_mail_messages(recipient_account_id,recipient_player_id,sender_name,target_mode,target_player_id,category,priority,subject,body,attachments,system_key)
  values (v_listing.buyer_account_id,v_listing.buyer_player_id,'拍賣交易所','player',v_listing.buyer_player_id,'auction',2,
    '拍賣商品購買成功','你購買的「'||v_listing.item_name||'」已成交。商品由信箱安全交付。',public.ro_auction_mail_attachment(v_listing),'auction-buy-'||v_listing.listing_id::text)
  on conflict (recipient_account_id,system_key) where system_key is not null do nothing;

  insert into public.ro_mail_messages(recipient_account_id,recipient_player_id,sender_name,target_mode,target_player_id,category,priority,subject,body,zeny,blue_gem,red_gem,system_key)
  values (v_listing.seller_account_id,v_listing.seller_player_id,'拍賣交易所','player',v_listing.seller_player_id,'auction',2,
    '拍賣商品已售出','「'||v_listing.item_name||'」已售出。成交總額 '||v_listing.total_price::text||' '||v_label||'，系統收取 5% 成交稅 '||v_tax::text||' '||v_label||'。',
    case when v_listing.sale_currency='zeny' then v_net else 0 end,
    case when v_listing.sale_currency='blue' then v_net else 0 end,
    case when v_listing.sale_currency='red' then v_net else 0 end,
    'auction-sell-'||v_listing.listing_id::text)
  on conflict (recipient_account_id,system_key) where system_key is not null do nothing;

  return jsonb_build_object('listing_id',v_listing.listing_id,'status','sold','sale_currency',v_listing.sale_currency,
    'total_price',v_listing.total_price,'tax_amount',v_tax,'seller_net',v_net,'sold_at',now());
end;
$$;
revoke all on function public.ro_auction_finish_sale(uuid) from public;

create or replace function public.ro_auction_begin_purchase(p_account_id uuid,p_character_id uuid,p_listing_id uuid)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_identity jsonb; v_account public.ro_accounts%rowtype; v_char public.ro_characters%rowtype; v_l public.ro_auction_listings%rowtype;
  v_save jsonb; v_balance bigint; v_ver bigint; v_token uuid:=gen_random_uuid();
begin
  perform public.ro_auction_sweep();
  v_identity:=public.ro_auction_assert_character(p_account_id,p_character_id);
  select * into v_account from public.ro_accounts where account_id=p_account_id;
  select * into v_char from public.ro_characters where character_id=p_character_id and account_id=p_account_id;
  select * into v_l from public.ro_auction_listings where listing_id=p_listing_id for update;
  if not found then raise exception 'RO_AUCTION_NOT_FOUND'; end if;
  if v_l.status='sold' then raise exception 'RO_AUCTION_SOLD'; end if;
  if v_l.status='expired' or v_l.expires_at<=now() then raise exception 'RO_AUCTION_EXPIRED'; end if;
  if v_l.status='reserved' then raise exception 'RO_AUCTION_RESERVED'; end if;
  if v_l.status<>'active' then raise exception 'RO_AUCTION_NOT_AVAILABLE'; end if;
  if v_l.seller_account_id=p_account_id then raise exception 'RO_AUCTION_CANNOT_BUY_OWN'; end if;
  v_save:=v_char.save_data;
  v_balance:=public.ro_auction_currency_balance(v_save,v_l.sale_currency);
  v_ver:=greatest(0,public.ro_auction_json_number(v_save->'saveVersion',0));
  if v_balance<v_l.total_price then raise exception 'RO_AUCTION_CURRENCY_NOT_ENOUGH'; end if;
  update public.ro_auction_listings set status='reserved',buyer_account_id=p_account_id,buyer_character_id=p_character_id,
    buyer_player_id=v_account.player_id,buyer_name=left(coalesce(v_char.name,'冒險者'),80),purchase_token=v_token,
    purchase_begin_save_version=v_ver,purchase_begin_zeny=case when v_l.sale_currency='zeny' then v_balance else null end,
    purchase_begin_currency_balance=v_balance,reserved_until=now()+interval '5 minutes',updated_at=now()
  where listing_id=v_l.listing_id returning * into v_l;
  return jsonb_build_object('listing_id',v_l.listing_id,'purchase_token',v_token,'status','reserved','sale_currency',v_l.sale_currency,
    'total_price',v_l.total_price,'begin_currency_balance',v_balance,'begin_save_version',v_ver,'reserved_until',v_l.reserved_until);
end;
$$;
revoke all on function public.ro_auction_begin_purchase(uuid,uuid,uuid) from public;
grant execute on function public.ro_auction_begin_purchase(uuid,uuid,uuid) to authenticated;

create or replace function public.ro_auction_abort_purchase(p_account_id uuid,p_character_id uuid,p_listing_id uuid,p_purchase_token uuid)
returns boolean
language plpgsql security definer set search_path=public as $$
declare v_l public.ro_auction_listings%rowtype; v_save jsonb; v_ver bigint; v_balance bigint; v_begin bigint;
begin
  perform public.ro_auction_assert_character(p_account_id,p_character_id);
  select * into v_l from public.ro_auction_listings where listing_id=p_listing_id and purchase_token=p_purchase_token and buyer_account_id=p_account_id and buyer_character_id=p_character_id for update;
  if not found or v_l.status<>'reserved' then return false; end if;
  select save_data into v_save from public.ro_characters where character_id=p_character_id and account_id=p_account_id;
  v_ver:=public.ro_auction_json_number(v_save->'saveVersion',0); v_balance:=public.ro_auction_currency_balance(v_save,v_l.sale_currency);
  v_begin:=coalesce(v_l.purchase_begin_currency_balance,v_l.purchase_begin_zeny,0);
  if public.ro_auction_has_receipt(v_save,'buy',v_l.listing_id,v_l.purchase_token)
     or (v_ver>coalesce(v_l.purchase_begin_save_version,0) and v_balance<=greatest(0,v_begin-v_l.total_price)) then raise exception 'RO_AUCTION_PURCHASE_ALREADY_PAID'; end if;
  update public.ro_auction_listings set status='active',buyer_account_id=null,buyer_character_id=null,buyer_player_id=null,buyer_name=null,
    purchase_token=null,purchase_begin_save_version=null,purchase_begin_zeny=null,purchase_begin_currency_balance=null,reserved_until=null,updated_at=now()
  where listing_id=v_l.listing_id;
  return true;
end;
$$;
revoke all on function public.ro_auction_abort_purchase(uuid,uuid,uuid,uuid) from public;
grant execute on function public.ro_auction_abort_purchase(uuid,uuid,uuid,uuid) to authenticated;

create or replace function public.ro_auction_finalize_purchase(p_account_id uuid,p_character_id uuid,p_listing_id uuid,p_purchase_token uuid)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_l public.ro_auction_listings%rowtype; v_save jsonb; v_ver bigint; v_balance bigint; v_begin bigint;
begin
  perform public.ro_auction_assert_character(p_account_id,p_character_id);
  select * into v_l from public.ro_auction_listings where listing_id=p_listing_id and purchase_token=p_purchase_token and buyer_account_id=p_account_id and buyer_character_id=p_character_id for update;
  if not found then
    select * into v_l from public.ro_auction_listings where listing_id=p_listing_id and buyer_account_id=p_account_id and buyer_character_id=p_character_id;
    if found and v_l.status='sold' then return jsonb_build_object('listing_id',v_l.listing_id,'status','sold','already_sold',true,'sold_at',v_l.sold_at); end if;
    raise exception 'RO_AUCTION_PURCHASE_NOT_FOUND';
  end if;
  if v_l.status='sold' then return jsonb_build_object('listing_id',v_l.listing_id,'status','sold','already_sold',true,'sold_at',v_l.sold_at); end if;
  if v_l.status<>'reserved' then raise exception 'RO_AUCTION_NOT_RESERVED'; end if;
  select save_data into v_save from public.ro_characters where character_id=p_character_id and account_id=p_account_id;
  v_ver:=greatest(0,public.ro_auction_json_number(v_save->'saveVersion',0)); v_balance:=public.ro_auction_currency_balance(v_save,v_l.sale_currency);
  v_begin:=coalesce(v_l.purchase_begin_currency_balance,v_l.purchase_begin_zeny,0);
  if v_ver<=coalesce(v_l.purchase_begin_save_version,0) then raise exception 'RO_AUCTION_SAVE_NOT_SYNCED'; end if;
  if not public.ro_auction_has_receipt(v_save,'buy',v_l.listing_id,v_l.purchase_token) then raise exception 'RO_AUCTION_PAYMENT_RECEIPT_MISSING'; end if;
  if v_balance>greatest(0,v_begin-v_l.total_price) then raise exception 'RO_AUCTION_PAYMENT_NOT_SAVED'; end if;
  return public.ro_auction_finish_sale(v_l.listing_id);
end;
$$;
revoke all on function public.ro_auction_finalize_purchase(uuid,uuid,uuid,uuid) from public;
grant execute on function public.ro_auction_finalize_purchase(uuid,uuid,uuid,uuid) to authenticated;

-- 清理：用交易幣種判斷付款是否已寫入雲端。
create or replace function public.ro_auction_sweep()
returns integer
language plpgsql security definer set search_path=public as $$
declare v_row public.ro_auction_listings%rowtype; v_count integer:=0; v_save jsonb; v_balance bigint; v_ver bigint; v_begin bigint;
begin
  for v_row in select * from public.ro_auction_listings where status='active' and expires_at<=now() order by expires_at limit 50 for update skip locked loop
    perform public.ro_auction_send_return_mail(v_row,'expired');
    update public.ro_auction_listings set status='expired',updated_at=now() where listing_id=v_row.listing_id; v_count:=v_count+1;
  end loop;
  for v_row in select * from public.ro_auction_listings where status='reserved' and reserved_until<=now() order by reserved_until limit 50 for update skip locked loop
    select c.save_data into v_save from public.ro_characters c where c.character_id=v_row.buyer_character_id and c.account_id=v_row.buyer_account_id;
    v_balance:=public.ro_auction_currency_balance(v_save,v_row.sale_currency); v_ver:=greatest(0,public.ro_auction_json_number(v_save->'saveVersion',0));
    v_begin:=coalesce(v_row.purchase_begin_currency_balance,v_row.purchase_begin_zeny,0);
    if public.ro_auction_has_receipt(v_save,'buy',v_row.listing_id,v_row.purchase_token)
       and v_ver>coalesce(v_row.purchase_begin_save_version,0)
       and v_balance<=greatest(0,v_begin-v_row.total_price) then
      perform public.ro_auction_finish_sale(v_row.listing_id);
    else
      update public.ro_auction_listings set status='active',buyer_account_id=null,buyer_character_id=null,buyer_player_id=null,buyer_name=null,
        purchase_token=null,purchase_begin_save_version=null,purchase_begin_zeny=null,purchase_begin_currency_balance=null,reserved_until=null,updated_at=now()
      where listing_id=v_row.listing_id;
    end if;
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.ro_auction_sweep() from public;

-- V2 市場：加入幣種篩選、seller_account_id、sale_currency。
create or replace function public.ro_auction_market_v2(
  p_account_id uuid,p_search text default '',p_category text default 'all',p_currency text default 'all',p_sort text default 'newest',p_limit integer default 60,p_offset integer default 0
)
returns table(
  listing_id uuid,seller_account_id uuid,item_id bigint,item_name text,item_type text,category text,item_payload jsonb,instance_id text,quantity integer,
  unit_price bigint,total_price bigint,sale_currency text,seller_player_id bigint,seller_name text,activated_at timestamptz,expires_at timestamptz,status text,reserved_until timestamptz
)
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not exists(select 1 from public.ro_accounts a where a.account_id=p_account_id and a.user_id=auth.uid() and coalesce(a.account_status,'active')='active') then raise exception 'RO_AUCTION_PERMISSION_DENIED'; end if;
  perform public.ro_auction_sweep();
  return query
  select l.listing_id,l.seller_account_id,l.item_id,l.item_name,l.item_type,l.category,l.item_payload,l.instance_id,l.quantity,l.unit_price,l.total_price,
    l.sale_currency,l.seller_player_id,l.seller_name,l.activated_at,l.expires_at,l.status,l.reserved_until
  from public.ro_auction_listings l
  where l.status='active' and l.expires_at>now()
    and (coalesce(p_category,'all')='all' or l.category=p_category)
    and (coalesce(p_currency,'all')='all' or l.sale_currency=p_currency)
    and (coalesce(btrim(p_search),'')='' or l.item_name ilike '%'||left(btrim(p_search),80)||'%' or l.item_id::text=left(btrim(p_search),80))
  order by
    case when p_sort='price_asc' then l.unit_price end asc nulls last,
    case when p_sort='price_desc' then l.unit_price end desc nulls last,
    case when p_sort='oldest' then l.expires_at end asc nulls last,
    l.activated_at desc
  limit greatest(1,least(coalesce(p_limit,60),100)) offset greatest(0,coalesce(p_offset,0));
end;
$$;
revoke all on function public.ro_auction_market_v2(uuid,text,text,text,text,integer,integer) from public;
grant execute on function public.ro_auction_market_v2(uuid,text,text,text,text,integer,integer) to authenticated;

create or replace function public.ro_auction_price_stats_v2(p_account_id uuid,p_item_id bigint,p_currency text)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_count bigint; v_avg bigint; v_min bigint; v_max bigint; v_currency text;
begin
  if auth.uid() is null or not exists(select 1 from public.ro_accounts a where a.account_id=p_account_id and a.user_id=auth.uid()) then raise exception 'RO_AUCTION_PERMISSION_DENIED'; end if;
  v_currency:=lower(coalesce(p_currency,'')); if v_currency not in ('zeny','blue','red') then raise exception 'RO_AUCTION_INVALID_CURRENCY'; end if;
  select count(*),coalesce(round(avg(l.unit_price))::bigint,0),coalesce(min(l.unit_price),0),coalesce(max(l.unit_price),0)
    into v_count,v_avg,v_min,v_max from public.ro_auction_listings l
   where l.status='sold' and l.item_id=p_item_id and l.sale_currency=v_currency and l.sold_at>=now()-interval '7 days';
  return jsonb_build_object('item_id',p_item_id,'currency',v_currency,'days',7,'count',v_count,'average_unit_price',v_avg,'min_unit_price',v_min,'max_unit_price',v_max);
end;
$$;
revoke all on function public.ro_auction_price_stats_v2(uuid,bigint,text) from public;
grant execute on function public.ro_auction_price_stats_v2(uuid,bigint,text) to authenticated;

select
  'V0.9.87F_AUCTION_MULTI_CURRENCY_12H_READY' as status,
  public.ro_auction_listing_duration_seconds() as listing_duration_seconds,
  public.ro_auction_fee_amount(1000000) as fee_tier_1,
  public.ro_auction_fee_amount(10000000) as fee_tier_2,
  public.ro_auction_fee_amount(100000000) as fee_tier_3,
  public.ro_auction_fee_amount(100000001) as fee_tier_4,
  (select count(*) from public.ro_auction_listings where status='active') as existing_active_listings_keep_current_expiry;
