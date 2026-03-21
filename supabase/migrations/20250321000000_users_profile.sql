-- Profile row per auth user. Run in Supabase SQL Editor or via CLI.
-- id matches auth.users; onboarded gates the post-signup onboarding UI.

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  onboarded boolean not null default false
);

alter table public.users enable row level security;

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
  on public.users
  for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own"
  on public.users
  for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
  on public.users
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
