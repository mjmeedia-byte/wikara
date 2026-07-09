-- ============================================================
-- Wikara Row Level Security (RLS)
-- Each user can only read/write their own rows.
-- Safe to re-run: drops each policy before recreating it.
-- ============================================================

-- Turn RLS on for every table.
alter table profiles           enable row level security;
alter table usage_counters     enable row level security;
alter table annotations        enable row level security;
alter table reading_lists      enable row level security;
alter table reading_list_items enable row level security;
alter table reading_history    enable row level security;
alter table tldr_cache         enable row level security;

-- profiles: see and update only your own profile.
drop policy if exists "own profile - select" on profiles;
create policy "own profile - select" on profiles
  for select using (auth.uid() = id);
drop policy if exists "own profile - update" on profiles;
create policy "own profile - update" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- usage_counters: manage only your own counters.
drop policy if exists "own usage - select" on usage_counters;
create policy "own usage - select" on usage_counters
  for select using (auth.uid() = user_id);
drop policy if exists "own usage - insert" on usage_counters;
create policy "own usage - insert" on usage_counters
  for insert with check (auth.uid() = user_id);
drop policy if exists "own usage - update" on usage_counters;
create policy "own usage - update" on usage_counters
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- annotations: full control over your own annotations.
drop policy if exists "own annotations - all" on annotations;
create policy "own annotations - all" on annotations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- reading_lists: full control over your own lists.
drop policy if exists "own lists - all" on reading_lists;
create policy "own lists - all" on reading_lists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- reading_list_items: control items in lists you own.
drop policy if exists "own list items - all" on reading_list_items;
create policy "own list items - all" on reading_list_items
  for all
  using (exists (select 1 from reading_lists l where l.id = list_id and l.user_id = auth.uid()))
  with check (exists (select 1 from reading_lists l where l.id = list_id and l.user_id = auth.uid()));

-- reading_history: full control over your own history.
drop policy if exists "own history - all" on reading_history;
create policy "own history - all" on reading_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- tldr_cache: a shared cache — any logged-in user can read it and fill it.
drop policy if exists "tldr cache - select" on tldr_cache;
create policy "tldr cache - select" on tldr_cache
  for select using (auth.role() = 'authenticated');
drop policy if exists "tldr cache - insert" on tldr_cache;
create policy "tldr cache - insert" on tldr_cache
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "tldr cache - update" on tldr_cache;
create policy "tldr cache - update" on tldr_cache
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
