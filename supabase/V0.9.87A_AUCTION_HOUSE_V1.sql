-- ============================================================
-- 彼岸花仙境 / RO_WEB V0.9.87A
-- 拍賣場 V1：藍寶石上架費 + 5% Zeny 成交稅 + 信箱安全交付
--
-- 安裝前置：V0.9.85B/C 信箱、V0.9.85L 雲端角色存檔 RPC 已存在。
-- 設計重點：
-- 1. 上架：伺服器先從「已驗證雲端存檔」確認物品與藍寶石，再建立 pending escrow。
-- 2. 前端扣除物品與藍寶石並完成雲端存檔後，finalize 才正式公開商品。
-- 3. 購買：先 reserve；前端扣 Zeny 並完成雲端存檔後，finalize 才成交。
-- 4. 成交商品寄到買家信箱；95% Zeny 寄到賣家信箱。裝備 instance_data 原樣保留。
-- 5. 取消 / 24H 到期商品由信箱退還，上架費不退。
-- 6. 紅寶石本版完全不強制消耗；只預留未來便利功能。
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.ro_auction_listings (
  listing_id uuid primary key default gen_random_uuid(),
  seller_account_id uuid not null references public.ro_accounts(account_id) on delete cascade,
  seller_character_id uuid not null references public.ro_characters(character_id) on delete cascade,
  seller_player_id bigint not null,
  seller_name text not null default '冒險者',
  item_id bigint not null,
  item_name text not null,
  item_type text not null default 'etc',
  category text not null default 'other',
  item_payload jsonb not null default '{}'::jsonb,
  instance_id text null,
  quantity integer not null default 1,
  unit_price bigint not null,
  total_price bigint not null,
  listing_fee_blue_gem integer not null default 1,
  sale_tax_bps integer not null default 500,
  status text not null default 'pending',
  listing_token uuid not null default gen_random_uuid(),
  begin_save_version bigint not null default 0,
  begin_blue_gem bigint not null default 0,
  begin_item_count bigint not null default 0,
  buyer_account_id uuid null references public.ro_accounts(account_id) on delete set null,
  buyer_character_id uuid null references public.ro_characters(character_id) on delete set null,
  buyer_player_id bigint null,
  buyer_name text null,
  purchase_token uuid null,
  purchase_begin_save_version bigint null,
  purchase_begin_zeny bigint null,
  reserved_until timestamptz null,
  created_at timestamptz not null default now(),
  activated_at timestamptz null,
  expires_at timestamptz null,
  sold_at timestamptz null,
  cancelled_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint ro_auction_qty_positive check (quantity between 1 and 999999),
  constraint ro_auction_unit_price_positive check (unit_price between 1 and 9000000000000000),
  constraint ro_auction_total_price_positive check (total_price between 1 and 9000000000000000),
  constraint ro_auction_fee_nonnegative check (listing_fee_blue_gem between 0 and 9999),
  constraint ro_auction_tax_range check (sale_tax_bps between 0 and 5000),
  constraint ro_auction_status_check check (status in ('pending','active','reserved','sold','cancelled','expired','aborted')),
  constraint ro_auction_category_check check (category in ('weapon','armor','card','consume','material','other'))
);

create unique index if not exists ro_auction_listing_token_uq on public.ro_auction_listings(listing_token);
create unique index if not exists ro_auction_purchase_token_uq on public.ro_auction_listings(purchase_token) where purchase_token is not null;
create index if not exists ro_auction_market_idx on public.ro_auction_listings(status, category, activated_at desc);
create index if not exists ro_auction_item_idx on public.ro_auction_listings(status, item_id, unit_price);
create index if not exists ro_auction_seller_idx on public.ro_auction_listings(seller_account_id, created_at desc);
create index if not exists ro_auction_buyer_idx on public.ro_auction_listings(buyer_account_id, sold_at desc);

alter table public.ro_auction_listings enable row level security;
revoke all on public.ro_auction_listings from anon, authenticated;

-- 伺服器限制交易物品。來源為目前 item_index 中 tradeRestricted / NoTrade / NoAuction。
create table if not exists public.ro_auction_restricted_items (
  item_id bigint primary key,
  reason text not null default 'NO_AUCTION'
);
revoke all on public.ro_auction_restricted_items from anon, authenticated;

insert into public.ro_auction_restricted_items(item_id,reason) values
(100043,'NO_AUCTION'),(100341,'NO_AUCTION'),(101423,'NO_AUCTION'),(101455,'NO_AUCTION'),(101538,'NO_AUCTION'),
(450001,'NO_AUCTION'),(450002,'NO_AUCTION'),(450003,'NO_AUCTION'),(450004,'NO_AUCTION'),(450147,'NO_AUCTION'),(450148,'NO_AUCTION'),(450218,'NO_AUCTION'),(450219,'NO_AUCTION'),
(470000,'NO_AUCTION'),(470001,'NO_AUCTION'),(470002,'NO_AUCTION'),(470003,'NO_AUCTION'),(470054,'NO_AUCTION'),(470055,'NO_AUCTION'),(470125,'NO_AUCTION'),(470126,'NO_AUCTION'),
(480000,'NO_AUCTION'),(480001,'NO_AUCTION'),(480002,'NO_AUCTION'),(480003,'NO_AUCTION'),(480062,'NO_AUCTION'),(480063,'NO_AUCTION'),(480185,'NO_AUCTION'),(480186,'NO_AUCTION'),
(490004,'NO_AUCTION'),(490005,'NO_AUCTION'),(490006,'NO_AUCTION'),(490007,'NO_AUCTION'),(490072,'NO_AUCTION'),(490073,'NO_AUCTION'),(490074,'NO_AUCTION'),(490075,'NO_AUCTION'),(490214,'NO_AUCTION'),(490215,'NO_AUCTION'),(490216,'NO_AUCTION'),(490217,'NO_AUCTION'),
(500015,'NO_AUCTION'),(500016,'NO_AUCTION'),(510018,'NO_AUCTION'),(530005,'NO_AUCTION'),(540009,'NO_AUCTION'),(550010,'NO_AUCTION'),(550011,'NO_AUCTION'),(560006,'NO_AUCTION'),(560007,'NO_AUCTION'),(570010,'NO_AUCTION'),(570024,'NO_AUCTION'),(580010,'NO_AUCTION'),(580024,'NO_AUCTION'),(590008,'NO_AUCTION'),(590009,'NO_AUCTION'),(590010,'NO_AUCTION'),(600012,'NO_AUCTION'),(610013,'NO_AUCTION'),(610028,'NO_AUCTION'),(620003,'NO_AUCTION'),(630008,'NO_AUCTION'),(640009,'NO_AUCTION'),(640010,'NO_AUCTION'),(700014,'NO_AUCTION'),(700015,'NO_AUCTION'),(700016,'NO_AUCTION'),
(7621,'TRADE_RESTRICTED'),(12922,'TRADE_RESTRICTED'),(1000253,'NO_AUCTION'),(1000985,'NO_AUCTION'),(1000994,'NO_AUCTION')
on conflict (item_id) do update set reason=excluded.reason;

create or replace function public.ro_auction_fee_blue_gem(p_total_price bigint)
returns integer
language sql
immutable
as $$
  select case
    when coalesce(p_total_price,0) <= 1000000 then 1
    when p_total_price <= 10000000 then 2
    when p_total_price <= 100000000 then 3
    else 5
  end;
$$;
revoke all on function public.ro_auction_fee_blue_gem(bigint) from public;

create or replace function public.ro_auction_json_number(p_value jsonb, p_default bigint default 0)
returns bigint
language plpgsql
immutable
as $$
declare v_text text;
begin
  if p_value is null then return p_default; end if;
  v_text := trim(both '"' from p_value::text);
  if v_text ~ '^-?[0-9]{1,18}$' then return v_text::bigint; end if;
  return p_default;
exception when others then return p_default;
end;
$$;
revoke all on function public.ro_auction_json_number(jsonb,bigint) from public;

create or replace function public.ro_auction_count_item(p_save jsonb, p_item_id bigint)
returns bigint
language plpgsql
immutable
as $$
declare v_row jsonb; v_total bigint:=0; v_id bigint; v_count bigint;
begin
  if jsonb_typeof(p_save #> '{player,inventory}') <> 'array' then return 0; end if;
  for v_row in select value from jsonb_array_elements(p_save #> '{player,inventory}') loop
    v_id := public.ro_auction_json_number(v_row->'id',0);
    if v_id = p_item_id and nullif(coalesce(v_row->>'instanceId',''),'') is null then
      v_count := greatest(0, public.ro_auction_json_number(v_row->'count',1));
      v_total := v_total + v_count;
    end if;
  end loop;
  return v_total;
end;
$$;
revoke all on function public.ro_auction_count_item(jsonb,bigint) from public;

create or replace function public.ro_auction_find_instance(p_save jsonb, p_instance_id text)
returns jsonb
language plpgsql
immutable
as $$
declare v_row jsonb;
begin
  if coalesce(p_instance_id,'')='' or jsonb_typeof(p_save #> '{player,inventory}') <> 'array' then return null; end if;
  for v_row in select value from jsonb_array_elements(p_save #> '{player,inventory}') loop
    if coalesce(v_row->>'instanceId','') = p_instance_id then return v_row; end if;
  end loop;
  return null;
end;
$$;
revoke all on function public.ro_auction_find_instance(jsonb,text) from public;


create or replace function public.ro_auction_has_receipt(p_save jsonb,p_kind text,p_listing_id uuid,p_token uuid)
returns boolean
language plpgsql
immutable
as $$
declare v_row jsonb;
begin
  if jsonb_typeof(p_save #> '{player,auctionReceipts}') <> 'array' then return false; end if;
  for v_row in select value from jsonb_array_elements(p_save #> '{player,auctionReceipts}') loop
    if coalesce(v_row->>'type','')=p_kind
       and coalesce(v_row->>'listingId','')=p_listing_id::text
       and coalesce(v_row->>'token','')=p_token::text then return true; end if;
  end loop;
  return false;
end;
$$;
revoke all on function public.ro_auction_has_receipt(jsonb,text,uuid,uuid) from public;

create or replace function public.ro_auction_assert_character(p_account_id uuid,p_character_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'RO_AUTH_REQUIRED'; end if;
  select jsonb_build_object('player_id',a.player_id,'account_id',a.account_id,'character_id',c.character_id,'character_name',c.name)
    into v_result
    from public.ro_accounts a join public.ro_characters c on c.account_id=a.account_id
   where a.account_id=p_account_id and c.character_id=p_character_id and a.user_id=auth.uid() and coalesce(a.account_status,'active')='active';
  if v_result is null then raise exception 'RO_AUCTION_PERMISSION_DENIED'; end if;
  return v_result;
end;
$$;
revoke all on function public.ro_auction_assert_character(uuid,uuid) from public;

-- 郵件附件：instance_data 存 exact 裝備實例；一般 stack 仍使用 item_id + amount。
create or replace function public.ro_auction_mail_attachment(p_listing public.ro_auction_listings)
returns jsonb
language plpgsql
stable
as $$
begin
  if nullif(coalesce(p_listing.instance_id,''),'') is not null then
    return jsonb_build_array(jsonb_build_object(
      'item_id',p_listing.item_id,
      'amount',1,
      'name',p_listing.item_name,
      'instance_data',p_listing.item_payload
    ));
  end if;
  return jsonb_build_array(jsonb_build_object('item_id',p_listing.item_id,'amount',p_listing.quantity,'name',p_listing.item_name));
end;
$$;
revoke all on function public.ro_auction_mail_attachment(public.ro_auction_listings) from public;

create or replace function public.ro_auction_send_return_mail(p_listing public.ro_auction_listings,p_reason text)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.ro_mail_messages(
    recipient_account_id,recipient_player_id,sender_name,target_mode,target_player_id,category,priority,subject,body,attachments,system_key
  ) values (
    p_listing.seller_account_id,p_listing.seller_player_id,'拍賣交易所','player',p_listing.seller_player_id,'auction',1,
    case when p_reason='expired' then '拍賣商品已到期' else '拍賣商品已取消' end,
    case when p_reason='expired' then '商品 24 小時上架期限已結束，系統已將商品退還。上架藍寶石費用不退還。' else '你已取消拍賣商品，系統已將商品退還。上架藍寶石費用不退還。' end,
    public.ro_auction_mail_attachment(p_listing),
    'auction-return-'||p_listing.listing_id::text
  ) on conflict (recipient_account_id,system_key) where system_key is not null do nothing;
end;
$$;
revoke all on function public.ro_auction_send_return_mail(public.ro_auction_listings,text) from public;

create or replace function public.ro_auction_finish_sale(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_listing public.ro_auction_listings%rowtype; v_net bigint; v_tax bigint;
begin
  select * into v_listing from public.ro_auction_listings where listing_id=p_listing_id for update;
  if not found then raise exception 'RO_AUCTION_LISTING_NOT_FOUND'; end if;
  if v_listing.status='sold' then
    return jsonb_build_object('listing_id',v_listing.listing_id,'status','sold','already_sold',true,'sold_at',v_listing.sold_at);
  end if;
  if v_listing.status<>'reserved' or v_listing.buyer_account_id is null then raise exception 'RO_AUCTION_NOT_RESERVED'; end if;

  v_tax := floor((v_listing.total_price::numeric * v_listing.sale_tax_bps::numeric)/10000)::bigint;
  v_net := greatest(0,v_listing.total_price-v_tax);

  update public.ro_auction_listings set status='sold',sold_at=now(),updated_at=now(),reserved_until=null where listing_id=v_listing.listing_id;

  insert into public.ro_mail_messages(
    recipient_account_id,recipient_player_id,sender_name,target_mode,target_player_id,category,priority,subject,body,attachments,system_key
  ) values (
    v_listing.buyer_account_id,v_listing.buyer_player_id,'拍賣交易所','player',v_listing.buyer_player_id,'auction',2,
    '拍賣商品購買成功',
    '你購買的「'||v_listing.item_name||'」已成交。為確保斷線與裝備實例安全，商品由信箱交付。',
    public.ro_auction_mail_attachment(v_listing),
    'auction-buy-'||v_listing.listing_id::text
  ) on conflict (recipient_account_id,system_key) where system_key is not null do nothing;

  insert into public.ro_mail_messages(
    recipient_account_id,recipient_player_id,sender_name,target_mode,target_player_id,category,priority,subject,body,zeny,system_key
  ) values (
    v_listing.seller_account_id,v_listing.seller_player_id,'拍賣交易所','player',v_listing.seller_player_id,'auction',2,
    '拍賣商品已售出',
    '「'||v_listing.item_name||'」已售出。成交總額 '||v_listing.total_price::text||' Zeny，系統收取 5% 成交稅 '||v_tax::text||' Zeny。',
    v_net,
    'auction-sell-'||v_listing.listing_id::text
  ) on conflict (recipient_account_id,system_key) where system_key is not null do nothing;

  return jsonb_build_object('listing_id',v_listing.listing_id,'status','sold','total_price',v_listing.total_price,'tax_zeny',v_tax,'seller_net_zeny',v_net,'sold_at',now());
end;
$$;
revoke all on function public.ro_auction_finish_sale(uuid) from public;

-- 清理：到期退貨；reservation 超時時，若已付款則自動完成，否則解除保留。
create or replace function public.ro_auction_sweep()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_row public.ro_auction_listings%rowtype; v_count integer:=0; v_save jsonb; v_zeny bigint; v_ver bigint;
begin
  for v_row in select * from public.ro_auction_listings where status='active' and expires_at<=now() order by expires_at limit 50 for update skip locked loop
    perform public.ro_auction_send_return_mail(v_row,'expired');
    update public.ro_auction_listings set status='expired',updated_at=now() where listing_id=v_row.listing_id;
    v_count:=v_count+1;
  end loop;

  for v_row in select * from public.ro_auction_listings where status='reserved' and reserved_until<=now() order by reserved_until limit 50 for update skip locked loop
    select c.save_data into v_save from public.ro_characters c where c.character_id=v_row.buyer_character_id and c.account_id=v_row.buyer_account_id;
    v_zeny:=greatest(0,public.ro_auction_json_number(v_save #> '{player,zeny}',0));
    v_ver:=greatest(0,public.ro_auction_json_number(v_save->'saveVersion',0));
    if public.ro_auction_has_receipt(v_save,'buy',v_row.listing_id,v_row.purchase_token)
       and v_ver>coalesce(v_row.purchase_begin_save_version,0)
       and v_zeny<=greatest(0,coalesce(v_row.purchase_begin_zeny,0)-v_row.total_price) then
      perform public.ro_auction_finish_sale(v_row.listing_id);
    else
      update public.ro_auction_listings set status='active',buyer_account_id=null,buyer_character_id=null,buyer_player_id=null,buyer_name=null,purchase_token=null,purchase_begin_save_version=null,purchase_begin_zeny=null,reserved_until=null,updated_at=now() where listing_id=v_row.listing_id;
    end if;
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.ro_auction_sweep() from public;

create or replace function public.ro_auction_begin_listing(
  p_account_id uuid,
  p_character_id uuid,
  p_item_id bigint,
  p_instance_id text,
  p_quantity integer,
  p_unit_price bigint,
  p_item_name text,
  p_item_type text,
  p_category text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_identity jsonb; v_char public.ro_characters%rowtype; v_account public.ro_accounts%rowtype;
  v_save jsonb; v_inventory jsonb; v_payload jsonb; v_row jsonb; v_item_count bigint:=0; v_blue bigint:=0; v_ver bigint:=0;
  v_total bigint; v_fee integer; v_listing public.ro_auction_listings%rowtype; v_name text; v_category text;
begin
  perform public.ro_auction_sweep();
  v_identity:=public.ro_auction_assert_character(p_account_id,p_character_id);
  select * into v_account from public.ro_accounts where account_id=p_account_id for update;
  select * into v_char from public.ro_characters where character_id=p_character_id and account_id=p_account_id for update;
  v_save:=v_char.save_data;
  if v_save is null or jsonb_typeof(v_save)<>'object' then raise exception 'RO_AUCTION_SAVE_REQUIRED'; end if;
  if exists(select 1 from public.ro_auction_restricted_items r where r.item_id=p_item_id) then raise exception 'RO_AUCTION_ITEM_RESTRICTED'; end if;
  if coalesce(p_quantity,0)<1 then raise exception 'RO_AUCTION_INVALID_QUANTITY'; end if;
  if coalesce(p_unit_price,0)<1 then raise exception 'RO_AUCTION_INVALID_PRICE'; end if;
  if p_unit_price>9000000000000000 then raise exception 'RO_AUCTION_INVALID_PRICE'; end if;
  if p_quantity::numeric*p_unit_price::numeric>9000000000000000 then raise exception 'RO_AUCTION_INVALID_PRICE'; end if;
  v_total:=(p_quantity::numeric*p_unit_price::numeric)::bigint;
  v_fee:=public.ro_auction_fee_blue_gem(v_total);
  v_blue:=greatest(0,public.ro_auction_json_number(v_save #> '{player,blueGem}',0));
  v_ver:=greatest(0,public.ro_auction_json_number(v_save->'saveVersion',0));
  if v_blue<v_fee then raise exception 'RO_AUCTION_BLUE_GEM_NOT_ENOUGH'; end if;
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
    seller_account_id,seller_character_id,seller_player_id,seller_name,item_id,item_name,item_type,category,item_payload,instance_id,quantity,unit_price,total_price,listing_fee_blue_gem,sale_tax_bps,status,begin_save_version,begin_blue_gem,begin_item_count
  ) values (
    p_account_id,p_character_id,v_account.player_id,left(coalesce(v_char.name,'冒險者'),80),p_item_id,v_name,left(coalesce(p_item_type,'etc'),32),v_category,v_payload,nullif(p_instance_id,''),p_quantity,p_unit_price,v_total,v_fee,500,'pending',v_ver,v_blue,v_item_count
  ) returning * into v_listing;

  return jsonb_build_object('listing_id',v_listing.listing_id,'listing_token',v_listing.listing_token,'status',v_listing.status,'fee_blue_gem',v_fee,'total_price',v_total,'begin_save_version',v_ver,'expires_hours',24);
end;
$$;
revoke all on function public.ro_auction_begin_listing(uuid,uuid,bigint,text,integer,bigint,text,text,text) from public;
grant execute on function public.ro_auction_begin_listing(uuid,uuid,bigint,text,integer,bigint,text,text,text) to authenticated;

create or replace function public.ro_auction_finalize_listing(p_account_id uuid,p_character_id uuid,p_listing_id uuid,p_listing_token uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_listing public.ro_auction_listings%rowtype; v_save jsonb; v_ver bigint; v_blue bigint; v_count bigint; v_instance jsonb;
begin
  perform public.ro_auction_assert_character(p_account_id,p_character_id);
  select * into v_listing from public.ro_auction_listings where listing_id=p_listing_id and listing_token=p_listing_token and seller_account_id=p_account_id and seller_character_id=p_character_id for update;
  if not found then raise exception 'RO_AUCTION_LISTING_NOT_FOUND'; end if;
  if v_listing.status='active' then return jsonb_build_object('listing_id',v_listing.listing_id,'status','active','expires_at',v_listing.expires_at,'already_finalized',true); end if;
  if v_listing.status<>'pending' then raise exception 'RO_AUCTION_LISTING_NOT_PENDING'; end if;
  select c.save_data into v_save from public.ro_characters c where c.character_id=p_character_id and c.account_id=p_account_id;
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
  update public.ro_auction_listings set status='active',activated_at=now(),expires_at=now()+interval '24 hours',updated_at=now() where listing_id=v_listing.listing_id
  returning * into v_listing;
  return jsonb_build_object('listing_id',v_listing.listing_id,'status','active','expires_at',v_listing.expires_at,'fee_blue_gem',v_listing.listing_fee_blue_gem,'total_price',v_listing.total_price);
end;
$$;
revoke all on function public.ro_auction_finalize_listing(uuid,uuid,uuid,uuid) from public;
grant execute on function public.ro_auction_finalize_listing(uuid,uuid,uuid,uuid) to authenticated;

create or replace function public.ro_auction_abort_pending(p_account_id uuid,p_character_id uuid,p_listing_id uuid,p_listing_token uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare v_l public.ro_auction_listings%rowtype; v_save jsonb; v_ver bigint; v_blue bigint; v_count bigint;
begin
  perform public.ro_auction_assert_character(p_account_id,p_character_id);
  select * into v_l from public.ro_auction_listings where listing_id=p_listing_id and listing_token=p_listing_token and seller_account_id=p_account_id and seller_character_id=p_character_id for update;
  if not found then return false; end if;
  if v_l.status<>'pending' then return false; end if;
  select save_data into v_save from public.ro_characters where character_id=p_character_id and account_id=p_account_id;
  v_ver:=public.ro_auction_json_number(v_save->'saveVersion',0);
  v_blue:=public.ro_auction_json_number(v_save #> '{player,blueGem}',0);
  if v_l.instance_id is not null then v_count:=case when public.ro_auction_find_instance(v_save,v_l.instance_id) is null then 0 else 1 end;
  else v_count:=public.ro_auction_count_item(v_save,v_l.item_id); end if;
  if public.ro_auction_has_receipt(v_save,'list',v_l.listing_id,v_l.listing_token)
     or (v_ver>v_l.begin_save_version and (v_blue<v_l.begin_blue_gem or v_count<v_l.begin_item_count)) then raise exception 'RO_AUCTION_PENDING_ALREADY_DEDUCTED'; end if;
  update public.ro_auction_listings set status='aborted',cancelled_at=now(),updated_at=now() where listing_id=v_l.listing_id;
  return true;
end;
$$;
revoke all on function public.ro_auction_abort_pending(uuid,uuid,uuid,uuid) from public;
grant execute on function public.ro_auction_abort_pending(uuid,uuid,uuid,uuid) to authenticated;

create or replace function public.ro_auction_cancel_listing(p_account_id uuid,p_character_id uuid,p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_l public.ro_auction_listings%rowtype;
begin
  perform public.ro_auction_assert_character(p_account_id,p_character_id);
  select * into v_l from public.ro_auction_listings where listing_id=p_listing_id and seller_account_id=p_account_id for update;
  if not found then raise exception 'RO_AUCTION_LISTING_NOT_FOUND'; end if;
  if v_l.status not in ('active') then raise exception 'RO_AUCTION_CANNOT_CANCEL'; end if;
  perform public.ro_auction_send_return_mail(v_l,'cancelled');
  update public.ro_auction_listings set status='cancelled',cancelled_at=now(),updated_at=now() where listing_id=v_l.listing_id;
  return jsonb_build_object('listing_id',v_l.listing_id,'status','cancelled','returned_by_mail',true);
end;
$$;
revoke all on function public.ro_auction_cancel_listing(uuid,uuid,uuid) from public;
grant execute on function public.ro_auction_cancel_listing(uuid,uuid,uuid) to authenticated;

create or replace function public.ro_auction_begin_purchase(p_account_id uuid,p_character_id uuid,p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_identity jsonb; v_account public.ro_accounts%rowtype; v_char public.ro_characters%rowtype; v_l public.ro_auction_listings%rowtype; v_save jsonb; v_zeny bigint; v_ver bigint; v_token uuid:=gen_random_uuid();
begin
  perform public.ro_auction_sweep();
  v_identity:=public.ro_auction_assert_character(p_account_id,p_character_id);
  select * into v_account from public.ro_accounts where account_id=p_account_id;
  select * into v_char from public.ro_characters where character_id=p_character_id and account_id=p_account_id;
  select * into v_l from public.ro_auction_listings where listing_id=p_listing_id for update;
  if not found or v_l.status<>'active' or v_l.expires_at<=now() then raise exception 'RO_AUCTION_NOT_AVAILABLE'; end if;
  if v_l.seller_account_id=p_account_id then raise exception 'RO_AUCTION_CANNOT_BUY_OWN'; end if;
  v_save:=v_char.save_data;
  v_zeny:=greatest(0,public.ro_auction_json_number(v_save #> '{player,zeny}',0));
  v_ver:=greatest(0,public.ro_auction_json_number(v_save->'saveVersion',0));
  if v_zeny<v_l.total_price then raise exception 'RO_AUCTION_ZENY_NOT_ENOUGH'; end if;
  update public.ro_auction_listings set status='reserved',buyer_account_id=p_account_id,buyer_character_id=p_character_id,buyer_player_id=v_account.player_id,buyer_name=left(coalesce(v_char.name,'冒險者'),80),purchase_token=v_token,purchase_begin_save_version=v_ver,purchase_begin_zeny=v_zeny,reserved_until=now()+interval '5 minutes',updated_at=now() where listing_id=v_l.listing_id
  returning * into v_l;
  return jsonb_build_object('listing_id',v_l.listing_id,'purchase_token',v_token,'status','reserved','total_price',v_l.total_price,'begin_zeny',v_zeny,'begin_save_version',v_ver,'reserved_until',v_l.reserved_until);
end;
$$;
revoke all on function public.ro_auction_begin_purchase(uuid,uuid,uuid) from public;
grant execute on function public.ro_auction_begin_purchase(uuid,uuid,uuid) to authenticated;

create or replace function public.ro_auction_abort_purchase(p_account_id uuid,p_character_id uuid,p_listing_id uuid,p_purchase_token uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare v_l public.ro_auction_listings%rowtype; v_save jsonb; v_ver bigint; v_zeny bigint;
begin
  perform public.ro_auction_assert_character(p_account_id,p_character_id);
  select * into v_l from public.ro_auction_listings where listing_id=p_listing_id and purchase_token=p_purchase_token and buyer_account_id=p_account_id and buyer_character_id=p_character_id for update;
  if not found or v_l.status<>'reserved' then return false; end if;
  select save_data into v_save from public.ro_characters where character_id=p_character_id and account_id=p_account_id;
  v_ver:=public.ro_auction_json_number(v_save->'saveVersion',0); v_zeny:=public.ro_auction_json_number(v_save #> '{player,zeny}',0);
  if public.ro_auction_has_receipt(v_save,'buy',v_l.listing_id,v_l.purchase_token)
     or (v_ver>coalesce(v_l.purchase_begin_save_version,0) and v_zeny<=greatest(0,coalesce(v_l.purchase_begin_zeny,0)-v_l.total_price)) then raise exception 'RO_AUCTION_PURCHASE_ALREADY_PAID'; end if;
  update public.ro_auction_listings set status='active',buyer_account_id=null,buyer_character_id=null,buyer_player_id=null,buyer_name=null,purchase_token=null,purchase_begin_save_version=null,purchase_begin_zeny=null,reserved_until=null,updated_at=now() where listing_id=v_l.listing_id;
  return true;
end;
$$;
revoke all on function public.ro_auction_abort_purchase(uuid,uuid,uuid,uuid) from public;
grant execute on function public.ro_auction_abort_purchase(uuid,uuid,uuid,uuid) to authenticated;

create or replace function public.ro_auction_finalize_purchase(p_account_id uuid,p_character_id uuid,p_listing_id uuid,p_purchase_token uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_l public.ro_auction_listings%rowtype; v_save jsonb; v_ver bigint; v_zeny bigint;
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
  v_ver:=greatest(0,public.ro_auction_json_number(v_save->'saveVersion',0));
  v_zeny:=greatest(0,public.ro_auction_json_number(v_save #> '{player,zeny}',0));
  if v_ver<=coalesce(v_l.purchase_begin_save_version,0) then raise exception 'RO_AUCTION_SAVE_NOT_SYNCED'; end if;
  if not public.ro_auction_has_receipt(v_save,'buy',v_l.listing_id,v_l.purchase_token) then raise exception 'RO_AUCTION_PAYMENT_RECEIPT_MISSING'; end if;
  if v_zeny>greatest(0,coalesce(v_l.purchase_begin_zeny,0)-v_l.total_price) then raise exception 'RO_AUCTION_PAYMENT_NOT_SAVED'; end if;
  return public.ro_auction_finish_sale(v_l.listing_id);
end;
$$;
revoke all on function public.ro_auction_finalize_purchase(uuid,uuid,uuid,uuid) from public;
grant execute on function public.ro_auction_finalize_purchase(uuid,uuid,uuid,uuid) to authenticated;

create or replace function public.ro_auction_market(
  p_account_id uuid,
  p_search text default '',
  p_category text default 'all',
  p_sort text default 'newest',
  p_limit integer default 60,
  p_offset integer default 0
)
returns table(
  listing_id uuid,item_id bigint,item_name text,item_type text,category text,item_payload jsonb,instance_id text,quantity integer,unit_price bigint,total_price bigint,
  seller_player_id bigint,seller_name text,activated_at timestamptz,expires_at timestamptz
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or not exists(select 1 from public.ro_accounts a where a.account_id=p_account_id and a.user_id=auth.uid() and coalesce(a.account_status,'active')='active') then raise exception 'RO_AUCTION_PERMISSION_DENIED'; end if;
  perform public.ro_auction_sweep();
  return query
  select l.listing_id,l.item_id,l.item_name,l.item_type,l.category,l.item_payload,l.instance_id,l.quantity,l.unit_price,l.total_price,l.seller_player_id,l.seller_name,l.activated_at,l.expires_at
  from public.ro_auction_listings l
  where l.status='active' and l.expires_at>now()
    and (coalesce(p_category,'all')='all' or l.category=p_category)
    and (coalesce(btrim(p_search),'')='' or l.item_name ilike '%'||left(btrim(p_search),80)||'%' or l.item_id::text=left(btrim(p_search),80))
  order by
    case when p_sort='price_asc' then l.unit_price end asc nulls last,
    case when p_sort='price_desc' then l.unit_price end desc nulls last,
    case when p_sort='oldest' then l.activated_at end asc nulls last,
    l.activated_at desc
  limit greatest(1,least(coalesce(p_limit,60),100)) offset greatest(0,coalesce(p_offset,0));
end;
$$;
revoke all on function public.ro_auction_market(uuid,text,text,text,integer,integer) from public;
grant execute on function public.ro_auction_market(uuid,text,text,text,integer,integer) to authenticated;

create or replace function public.ro_auction_my_listings(p_account_id uuid,p_limit integer default 100)
returns setof public.ro_auction_listings
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or not exists(select 1 from public.ro_accounts a where a.account_id=p_account_id and a.user_id=auth.uid()) then raise exception 'RO_AUCTION_PERMISSION_DENIED'; end if;
  perform public.ro_auction_sweep();
  return query select * from public.ro_auction_listings l where l.seller_account_id=p_account_id order by l.created_at desc limit greatest(1,least(coalesce(p_limit,100),200));
end;
$$;
revoke all on function public.ro_auction_my_listings(uuid,integer) from public;
grant execute on function public.ro_auction_my_listings(uuid,integer) to authenticated;

create or replace function public.ro_auction_my_history(p_account_id uuid,p_limit integer default 100)
returns setof public.ro_auction_listings
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or not exists(select 1 from public.ro_accounts a where a.account_id=p_account_id and a.user_id=auth.uid()) then raise exception 'RO_AUCTION_PERMISSION_DENIED'; end if;
  perform public.ro_auction_sweep();
  return query select * from public.ro_auction_listings l where (l.seller_account_id=p_account_id or l.buyer_account_id=p_account_id) and l.status in ('sold','cancelled','expired') order by coalesce(l.sold_at,l.cancelled_at,l.updated_at) desc limit greatest(1,least(coalesce(p_limit,100),200));
end;
$$;
revoke all on function public.ro_auction_my_history(uuid,integer) from public;
grant execute on function public.ro_auction_my_history(uuid,integer) to authenticated;

create or replace function public.ro_auction_pending_purchases(p_account_id uuid,p_character_id uuid)
returns table(listing_id uuid,purchase_token uuid,total_price bigint,reserved_until timestamptz,item_name text)
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.ro_auction_assert_character(p_account_id,p_character_id);
  return query select l.listing_id,l.purchase_token,l.total_price,l.reserved_until,l.item_name from public.ro_auction_listings l where l.buyer_account_id=p_account_id and l.buyer_character_id=p_character_id and l.status='reserved' order by l.updated_at desc;
end;
$$;
revoke all on function public.ro_auction_pending_purchases(uuid,uuid) from public;
grant execute on function public.ro_auction_pending_purchases(uuid,uuid) to authenticated;

create or replace function public.ro_auction_price_stats(p_account_id uuid,p_item_id bigint)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_count bigint; v_avg bigint; v_min bigint; v_max bigint;
begin
  if auth.uid() is null or not exists(select 1 from public.ro_accounts a where a.account_id=p_account_id and a.user_id=auth.uid()) then raise exception 'RO_AUCTION_PERMISSION_DENIED'; end if;
  select count(*),coalesce(round(avg(l.unit_price))::bigint,0),coalesce(min(l.unit_price),0),coalesce(max(l.unit_price),0)
    into v_count,v_avg,v_min,v_max
    from public.ro_auction_listings l
   where l.status='sold' and l.item_id=p_item_id and l.sold_at>=now()-interval '7 days';
  return jsonb_build_object('item_id',p_item_id,'days',7,'count',v_count,'average_unit_price',v_avg,'min_unit_price',v_min,'max_unit_price',v_max);
end;
$$;
revoke all on function public.ro_auction_price_stats(uuid,bigint) from public;
grant execute on function public.ro_auction_price_stats(uuid,bigint) to authenticated;

comment on table public.ro_auction_listings is 'RO_WEB V0.9.87A server-authoritative auction escrow / reservation ledger.';

-- 安裝確認
select 'V0.9.87A_AUCTION_HOUSE_V1_READY' as status,
       (select count(*) from public.ro_auction_restricted_items) as restricted_item_count,
       public.ro_auction_fee_blue_gem(1000000) as fee_1m,
       public.ro_auction_fee_blue_gem(10000000) as fee_10m,
       public.ro_auction_fee_blue_gem(100000000) as fee_100m,
       public.ro_auction_fee_blue_gem(100000001) as fee_over_100m;
