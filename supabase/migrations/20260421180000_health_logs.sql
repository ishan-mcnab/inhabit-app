-- Lifestyle health trackers: sleep, water, mood/energy (one row per user per local calendar day).

-- ---------------------------------------------------------------------------
-- sleep_logs
-- ---------------------------------------------------------------------------
create table if not exists public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  log_date date not null default (current_date),
  bedtime text,
  wake_time text,
  rest_rating integer,
  notes text,
  created_at timestamptz not null default now(),
  constraint sleep_logs_rest_rating_check check (
    rest_rating is null or (rest_rating between 1 and 5)
  )
);

create unique index if not exists sleep_logs_user_id_log_date_uid
  on public.sleep_logs (user_id, log_date);

create index if not exists sleep_logs_user_id_log_date_idx
  on public.sleep_logs (user_id, log_date desc);

alter table public.sleep_logs enable row level security;

drop policy if exists "sleep_logs_select_own" on public.sleep_logs;
create policy "sleep_logs_select_own"
  on public.sleep_logs for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "sleep_logs_insert_own" on public.sleep_logs;
create policy "sleep_logs_insert_own"
  on public.sleep_logs for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "sleep_logs_update_own" on public.sleep_logs;
create policy "sleep_logs_update_own"
  on public.sleep_logs for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "sleep_logs_delete_own" on public.sleep_logs;
create policy "sleep_logs_delete_own"
  on public.sleep_logs for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.sleep_logs to authenticated;
grant all on public.sleep_logs to service_role;

-- ---------------------------------------------------------------------------
-- water_logs
-- ---------------------------------------------------------------------------
create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  log_date date not null default (current_date),
  glasses_count integer not null default 0,
  daily_target integer not null default 8,
  created_at timestamptz not null default now(),
  constraint water_logs_glasses_nonneg check (glasses_count >= 0),
  constraint water_logs_target_pos check (daily_target > 0)
);

create unique index if not exists water_logs_user_id_log_date_uid
  on public.water_logs (user_id, log_date);

create index if not exists water_logs_user_id_log_date_idx
  on public.water_logs (user_id, log_date desc);

alter table public.water_logs enable row level security;

drop policy if exists "water_logs_select_own" on public.water_logs;
create policy "water_logs_select_own"
  on public.water_logs for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "water_logs_insert_own" on public.water_logs;
create policy "water_logs_insert_own"
  on public.water_logs for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "water_logs_update_own" on public.water_logs;
create policy "water_logs_update_own"
  on public.water_logs for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "water_logs_delete_own" on public.water_logs;
create policy "water_logs_delete_own"
  on public.water_logs for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.water_logs to authenticated;
grant all on public.water_logs to service_role;

-- ---------------------------------------------------------------------------
-- mood_logs
-- ---------------------------------------------------------------------------
create table if not exists public.mood_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  log_date date not null default (current_date),
  mood_rating integer,
  energy_rating integer,
  notes text,
  created_at timestamptz not null default now(),
  constraint mood_logs_mood_check check (
    mood_rating is null or (mood_rating between 1 and 5)
  ),
  constraint mood_logs_energy_check check (
    energy_rating is null or (energy_rating between 1 and 5)
  )
);

create unique index if not exists mood_logs_user_id_log_date_uid
  on public.mood_logs (user_id, log_date);

create index if not exists mood_logs_user_id_log_date_idx
  on public.mood_logs (user_id, log_date desc);

alter table public.mood_logs enable row level security;

drop policy if exists "mood_logs_select_own" on public.mood_logs;
create policy "mood_logs_select_own"
  on public.mood_logs for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "mood_logs_insert_own" on public.mood_logs;
create policy "mood_logs_insert_own"
  on public.mood_logs for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "mood_logs_update_own" on public.mood_logs;
create policy "mood_logs_update_own"
  on public.mood_logs for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "mood_logs_delete_own" on public.mood_logs;
create policy "mood_logs_delete_own"
  on public.mood_logs for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.mood_logs to authenticated;
grant all on public.mood_logs to service_role;
