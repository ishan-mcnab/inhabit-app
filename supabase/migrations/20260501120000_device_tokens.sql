-- Push device tokens for native clients (Capacitor). One row per user + device token.

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

alter table public.device_tokens enable row level security;

drop policy if exists "device_tokens_select_own" on public.device_tokens;
create policy "device_tokens_select_own"
  on public.device_tokens
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "device_tokens_insert_own" on public.device_tokens;
create policy "device_tokens_insert_own"
  on public.device_tokens
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "device_tokens_update_own" on public.device_tokens;
create policy "device_tokens_update_own"
  on public.device_tokens
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "device_tokens_delete_own" on public.device_tokens;
create policy "device_tokens_delete_own"
  on public.device_tokens
  for delete
  to authenticated
  using (user_id = auth.uid());
