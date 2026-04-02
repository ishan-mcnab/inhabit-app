-- XP / leveling columns on users + xp_logs audit table + RLS.

alter table public.users
  add column if not exists total_xp integer not null default 0,
  add column if not exists level integer not null default 1,
  add column if not exists weekly_xp integer not null default 0,
  add column if not exists rank text not null default 'Recruit',
  add column if not exists grace_passes_remaining integer not null default 1,
  add column if not exists current_streak integer not null default 0,
  add column if not exists longest_streak integer not null default 0,
  add column if not exists last_activity_date date;

create table if not exists public.xp_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  amount integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists xp_logs_user_id_created_at_idx
  on public.xp_logs (user_id, created_at desc);

alter table public.xp_logs enable row level security;

drop policy if exists "Users can read own xp_logs" on public.xp_logs;
create policy "Users can read own xp_logs"
  on public.xp_logs
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own xp_logs" on public.xp_logs;
create policy "Users can insert own xp_logs"
  on public.xp_logs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

comment on table public.xp_logs is 'Audit trail of XP grants/deductions per user.';
