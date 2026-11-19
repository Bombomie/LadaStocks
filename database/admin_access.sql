begin;

-- Link administrator records to verified Supabase Auth accounts by UUID.
alter table public.admins
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null,
  alter column password_hash drop not null;

revoke all on public.admins from public, anon, authenticated;

create schema if not exists ladastocks_private;
revoke all on schema ladastocks_private from public, anon, authenticated;
grant usage on schema ladastocks_private to authenticated;

create table if not exists ladastocks_private.suspended_accounts (
  user_id uuid primary key references public.users(user_id) on delete cascade
);
alter table ladastocks_private.suspended_accounts enable row level security;
revoke all on ladastocks_private.suspended_accounts from public, anon, authenticated;

create or replace function ladastocks_private.account_is_suspended()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from ladastocks_private.suspended_accounts where user_id = auth.uid()
  );
$$;

create or replace function ladastocks_private.current_admin_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select admin_id from public.admins
  where auth_user_id = auth.uid() and role = 'admin'
    and not ladastocks_private.account_is_suspended();
$$;

revoke all on function ladastocks_private.account_is_suspended() from public, anon, authenticated;
grant execute on function ladastocks_private.account_is_suspended() to authenticated;
revoke all on function ladastocks_private.current_admin_id() from public, anon, authenticated;

-- Apply suspension to existing user-owned data, including direct Data API access.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['users', 'wallets', 'holdings', 'transactions',
      'watchlist_items', 'bonuses', 'wallet_transactions']
  loop
    if pg_catalog.to_regclass('public.' || table_name) is not null then
      execute format('drop policy if exists "Active account required" on public.%I', table_name);
      execute format(
        'create policy "Active account required" on public.%I as restrictive for all to authenticated
         using (not (select ladastocks_private.account_is_suspended()))
         with check (not (select ladastocks_private.account_is_suspended()))', table_name
      );
    end if;
  end loop;
end;
$$;

create or replace function public.lada_account_access()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'isAdmin', ladastocks_private.current_admin_id() is not null,
    'suspended', ladastocks_private.account_is_suspended()
  );
$$;

create or replace function public.lada_admin_users()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if ladastocks_private.current_admin_id() is null then
    raise insufficient_privilege using message = 'Administrator access required.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', u.user_id, 'username', u.username, 'email', u.email,
      'created_at', u.created_at, 'last_login', u.last_login,
      'status', case when a.user_id is null then 'active' else 'suspended' end,
      'isAdmin', exists (select 1 from public.admins where auth_user_id = u.user_id and role = 'admin'),
      'wallet', case when w.user_id is not null then
        jsonb_build_object('balance', w.balance, 'starting_balance', w.starting_balance) end,
      'holdings', coalesce(h.items, '[]'::jsonb)
    ) order by u.username, u.user_id)
    from public.users u
    left join public.wallets w on w.user_id = u.user_id
    left join ladastocks_private.suspended_accounts a on a.user_id = u.user_id
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'symbol', s.symbol, 'quantity', h.quantity,
        'price', coalesce(p.close_price, h.avg_buy_price)
      ) order by s.symbol) as items
      from public.holdings h
      join public.stocks s on s.stock_id = h.stock_id
      left join lateral (
        select close_price from public.stock_prices
        where stock_id = h.stock_id and close_price > 0
        order by recorded_at desc, price_id desc limit 1
      ) p on true
      where h.user_id = u.user_id and h.quantity > 0
    ) h on true
  ), '[]'::jsonb);
end;
$$;

create or replace function public.lada_admin_set_status(target_user_id uuid, new_status text)
returns text
language plpgsql security definer set search_path = ''
as $$
begin
  if ladastocks_private.current_admin_id() is null then
    raise insufficient_privilege using message = 'Administrator access required.';
  end if;
  if new_status is null or new_status not in ('active', 'suspended') then
    raise sqlstate 'PT400' using message = 'Invalid account status.';
  end if;
  -- Serialize updates for this account and keep its profile alive during the change.
  perform 1 from public.users where user_id = target_user_id for no key update;
  if not found then
    raise sqlstate 'PT404' using message = 'User not found.';
  end if;
  if new_status = 'suspended' then
    if exists (select 1 from public.admins where auth_user_id = target_user_id and role = 'admin') then
      raise sqlstate 'PT409' using message = 'Administrator accounts cannot be suspended from the dashboard.';
    end if;
    insert into ladastocks_private.suspended_accounts (user_id) values (target_user_id)
    on conflict (user_id) do nothing;
  else
    delete from ladastocks_private.suspended_accounts where user_id = target_user_id;
  end if;
  return new_status;
end;
$$;

create or replace function public.lada_admin_adjust_wallet(target_user_id uuid, delta numeric, request_id uuid)
returns numeric
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := ladastocks_private.current_admin_id();
  old_balance numeric;
  new_balance numeric;
begin
  if actor_id is null then
    raise insufficient_privilege using message = 'Administrator access required.';
  end if;
  if request_id is null or delta is null or delta = 0 or
      abs(delta) > 999999999999.99 or delta <> round(delta, 2) then
    raise sqlstate 'PT400' using message = 'Enter a valid amount with up to two decimal places.';
  end if;

  select balance into old_balance from public.wallets where user_id = target_user_id for update;
  if not found then
    raise sqlstate 'PT404' using message = 'Wallet not found.';
  end if;

  -- Record the signed adjustment in the same transaction as the balance update.
  -- Retrying a request with the same ID must not apply the adjustment twice.
  insert into public.bonuses (bonus_id, user_id, admin_id, bonus_type, amount, reason)
    values (request_id, target_user_id, actor_id, 'admin_wallet_adjustment', delta, 'Admin dashboard')
    on conflict (bonus_id) do nothing;
  if not found then
    if exists (select 1 from public.bonuses where bonus_id = request_id
      and user_id = target_user_id and admin_id = actor_id and amount = delta
      and bonus_type = 'admin_wallet_adjustment') then
      return old_balance;
    end if;
    raise sqlstate 'PT409' using message = 'Request ID is already in use.';
  end if;

  new_balance := old_balance + delta;
  if new_balance < 0 then
    raise sqlstate 'PT409' using message = 'Debit exceeds the available cash balance.';
  end if;
  if new_balance > 999999999999.99 then
    raise sqlstate 'PT409' using message = 'Credit exceeds the maximum cash balance.';
  end if;

  update public.wallets set balance = new_balance, updated_at = now() where user_id = target_user_id;
  return new_balance;
end;
$$;

revoke all on function public.lada_account_access() from public, anon, authenticated;
revoke all on function public.lada_admin_users() from public, anon, authenticated;
revoke all on function public.lada_admin_set_status(uuid, text) from public, anon, authenticated;
revoke all on function public.lada_admin_adjust_wallet(uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.lada_account_access() to authenticated;
grant execute on function public.lada_admin_users() to authenticated;
grant execute on function public.lada_admin_set_status(uuid, text) to authenticated;
grant execute on function public.lada_admin_adjust_wallet(uuid, numeric, uuid) to authenticated;

commit;
