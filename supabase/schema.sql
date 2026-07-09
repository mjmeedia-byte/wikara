-- ============================================================
-- Wikara database schema
-- Safe to re-run: uses "if not exists" / "or replace".
-- ============================================================

-- 1. Profiles: one row per user, extends Supabase's built-in auth.users.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free',            -- 'free' | 'pro' | 'team'
  plan_expires_at timestamptz,
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

-- Automatically create a profile row whenever a new user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Usage counters: monthly AI-feature usage per user.
create table if not exists usage_counters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  month text not null,                          -- e.g. '2026-07'
  tldr_count int not null default 0,
  takeaways_count int not null default 0,
  explain_count int not null default 0,
  verify_count int not null default 0,
  chat_message_count int not null default 0,
  timeline_count int not null default 0,
  language_compare_count int not null default 0,
  pdf_export_count int not null default 0,
  unique (user_id, month)
);

-- 3. Annotations: highlights + notes.
create table if not exists annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  article_url text not null,
  article_title text,
  selected_text text,
  note text,
  color text default 'default',
  created_at timestamptz not null default now()
);

-- 4. Reading lists.
create table if not exists reading_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- 5. Items saved into reading lists.
create table if not exists reading_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references reading_lists(id) on delete cascade,
  article_url text not null,
  article_title text,
  thumbnail text,
  saved_at timestamptz not null default now()
);

-- 6. Reading history.
create table if not exists reading_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  article_url text not null,
  article_title text,
  visited_at timestamptz not null default now(),
  session_id text
);

-- 7. TL;DR cache (shared across users, keyed by article + last edit).
create table if not exists tldr_cache (
  id uuid primary key default gen_random_uuid(),
  article_url text unique not null,
  last_edited_timestamp text,
  summary text,
  created_at timestamptz not null default now()
);
