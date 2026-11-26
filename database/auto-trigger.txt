-- ============================================================
-- Auto-link auth.users -> public.users + public.wallets
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- ============================================================
-- Description: Whenever a new user is created in auth.users, this trigger
-- automatically creates a corresponding row in public.users and public.wallets.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer   -- runs with elevated privileges so it can write
set search_path = public   -- to public.users/wallets even though the
as $$                       -- trigger lives on the auth schema
begin
  -- Create the profile row. Reads optional metadata passed at signup
  -- (username, birth_date); falls back to the email prefix as a
  -- username if none was provided, so this never fails on a bare signup.
  insert into public.users (user_id, username, email, birth_date)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.email,
    nullif(new.raw_user_meta_data->>'birth_date', '')::date
  );

  -- Create the starting wallet. balance/starting_balance use the
  -- table's own defaults (100000.00), so nothing else to pass here.
  insert into public.wallets (user_id)
  values (new.id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Optional but recommended: keep public.users.email in sync if a
-- user ever changes their email through Supabase Auth.
-- ============================================================

create or replace function public.handle_user_email_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set email = new.email
  where user_id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.handle_user_email_update();