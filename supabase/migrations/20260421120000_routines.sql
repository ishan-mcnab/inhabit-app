-- Routines: morning/evening checklists, items, daily completion logs.

-- ---------------------------------------------------------------------------
-- routines
-- ---------------------------------------------------------------------------
create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  type text not null,
  created_at timestamptz not null default now(),
  constraint routines_type_check check (type in ('morning', 'evening'))
);

create unique index if not exists routines_user_id_type_uid
  on public.routines (user_id, type);

create index if not exists routines_user_id_idx on public.routines (user_id);

alter table public.routines enable row level security;

drop policy if exists "routines_select_own" on public.routines;
create policy "routines_select_own"
  on public.routines for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "routines_insert_own" on public.routines;
create policy "routines_insert_own"
  on public.routines for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "routines_update_own" on public.routines;
create policy "routines_update_own"
  on public.routines for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "routines_delete_own" on public.routines;
create policy "routines_delete_own"
  on public.routines for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.routines to authenticated;
grant all on public.routines to service_role;

-- ---------------------------------------------------------------------------
-- routine_items
-- ---------------------------------------------------------------------------
create table if not exists public.routine_items (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists routine_items_routine_id_idx
  on public.routine_items (routine_id);
create index if not exists routine_items_user_id_idx
  on public.routine_items (user_id);

alter table public.routine_items enable row level security;

drop policy if exists "routine_items_select_own" on public.routine_items;
create policy "routine_items_select_own"
  on public.routine_items for select to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.routines r
      where r.id = routine_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "routine_items_insert_own" on public.routine_items;
create policy "routine_items_insert_own"
  on public.routine_items for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.routines r
      where r.id = routine_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "routine_items_update_own" on public.routine_items;
create policy "routine_items_update_own"
  on public.routine_items for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.routines r
      where r.id = routine_id and r.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.routines r
      where r.id = routine_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "routine_items_delete_own" on public.routine_items;
create policy "routine_items_delete_own"
  on public.routine_items for delete to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.routines r
      where r.id = routine_id and r.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.routine_items to authenticated;
grant all on public.routine_items to service_role;

-- ---------------------------------------------------------------------------
-- routine_logs
-- ---------------------------------------------------------------------------
create table if not exists public.routine_logs (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  completed_at date not null,
  items_completed integer not null default 0,
  items_total integer not null default 0,
  xp_earned integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists routine_logs_one_completion_per_day
  on public.routine_logs (routine_id, completed_at);

create index if not exists routine_logs_user_routine_idx
  on public.routine_logs (user_id, routine_id, completed_at desc);

alter table public.routine_logs enable row level security;

drop policy if exists "routine_logs_select_own" on public.routine_logs;
create policy "routine_logs_select_own"
  on public.routine_logs for select to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.routines r
      where r.id = routine_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "routine_logs_insert_own" on public.routine_logs;
create policy "routine_logs_insert_own"
  on public.routine_logs for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.routines r
      where r.id = routine_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "routine_logs_update_own" on public.routine_logs;
create policy "routine_logs_update_own"
  on public.routine_logs for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.routines r
      where r.id = routine_id and r.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.routines r
      where r.id = routine_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "routine_logs_delete_own" on public.routine_logs;
create policy "routine_logs_delete_own"
  on public.routine_logs for delete to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.routines r
      where r.id = routine_id and r.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.routine_logs to authenticated;
grant all on public.routine_logs to service_role;
