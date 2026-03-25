-- InHabit core schema: goals, quests, missions, habits, reflections.
-- Requires public.users (id uuid PK referencing auth.users) from earlier migration.
-- Run in Supabase SQL Editor as one script.

-- ---------------------------------------------------------------------------
-- 1. goals
-- ---------------------------------------------------------------------------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  category text,
  description text,
  target_date date,
  progress_percent int not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create index if not exists goals_user_id_idx on public.goals (user_id);

alter table public.goals enable row level security;

drop policy if exists "goals_select_own" on public.goals;
create policy "goals_select_own"
  on public.goals for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "goals_insert_own" on public.goals;
create policy "goals_insert_own"
  on public.goals for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "goals_update_own" on public.goals;
create policy "goals_update_own"
  on public.goals for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "goals_delete_own" on public.goals;
create policy "goals_delete_own"
  on public.goals for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.goals to authenticated;
grant all on public.goals to service_role;

-- ---------------------------------------------------------------------------
-- 2. weekly_quests
-- ---------------------------------------------------------------------------
create table if not exists public.weekly_quests (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  week_number int not null,
  completed boolean not null default false,
  xp_reward int not null default 150,
  created_at timestamptz not null default now()
);

create index if not exists weekly_quests_user_id_idx on public.weekly_quests (user_id);
create index if not exists weekly_quests_goal_id_idx on public.weekly_quests (goal_id);

alter table public.weekly_quests enable row level security;

drop policy if exists "weekly_quests_select_own" on public.weekly_quests;
create policy "weekly_quests_select_own"
  on public.weekly_quests for select to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.goals g
      where g.id = goal_id and g.user_id = auth.uid()
    )
  );

drop policy if exists "weekly_quests_insert_own" on public.weekly_quests;
create policy "weekly_quests_insert_own"
  on public.weekly_quests for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.goals g
      where g.id = goal_id and g.user_id = auth.uid()
    )
  );

drop policy if exists "weekly_quests_update_own" on public.weekly_quests;
create policy "weekly_quests_update_own"
  on public.weekly_quests for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.goals g
      where g.id = goal_id and g.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.goals g
      where g.id = goal_id and g.user_id = auth.uid()
    )
  );

drop policy if exists "weekly_quests_delete_own" on public.weekly_quests;
create policy "weekly_quests_delete_own"
  on public.weekly_quests for delete to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.goals g
      where g.id = goal_id and g.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.weekly_quests to authenticated;
grant all on public.weekly_quests to service_role;

-- ---------------------------------------------------------------------------
-- 3. daily_missions
-- ---------------------------------------------------------------------------
create table if not exists public.daily_missions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  xp_reward int not null default 25,
  due_date date,
  created_at timestamptz not null default now()
);

create index if not exists daily_missions_user_id_idx on public.daily_missions (user_id);
create index if not exists daily_missions_goal_id_idx on public.daily_missions (goal_id);

alter table public.daily_missions enable row level security;

drop policy if exists "daily_missions_select_own" on public.daily_missions;
create policy "daily_missions_select_own"
  on public.daily_missions for select to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.goals g
      where g.id = goal_id and g.user_id = auth.uid()
    )
  );

drop policy if exists "daily_missions_insert_own" on public.daily_missions;
create policy "daily_missions_insert_own"
  on public.daily_missions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.goals g
      where g.id = goal_id and g.user_id = auth.uid()
    )
  );

drop policy if exists "daily_missions_update_own" on public.daily_missions;
create policy "daily_missions_update_own"
  on public.daily_missions for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.goals g
      where g.id = goal_id and g.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.goals g
      where g.id = goal_id and g.user_id = auth.uid()
    )
  );

drop policy if exists "daily_missions_delete_own" on public.daily_missions;
create policy "daily_missions_delete_own"
  on public.daily_missions for delete to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.goals g
      where g.id = goal_id and g.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.daily_missions to authenticated;
grant all on public.daily_missions to service_role;

-- ---------------------------------------------------------------------------
-- 4. habits
-- ---------------------------------------------------------------------------
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  category text,
  frequency text,
  current_streak int not null default 0,
  last_completed date,
  created_at timestamptz not null default now()
);

create index if not exists habits_user_id_idx on public.habits (user_id);

alter table public.habits enable row level security;

drop policy if exists "habits_select_own" on public.habits;
create policy "habits_select_own"
  on public.habits for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "habits_insert_own" on public.habits;
create policy "habits_insert_own"
  on public.habits for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "habits_update_own" on public.habits;
create policy "habits_update_own"
  on public.habits for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "habits_delete_own" on public.habits;
create policy "habits_delete_own"
  on public.habits for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.habits to authenticated;
grant all on public.habits to service_role;

-- ---------------------------------------------------------------------------
-- 5. habit_logs
-- ---------------------------------------------------------------------------
create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  completed_at timestamptz not null default now()
);

create index if not exists habit_logs_user_id_idx on public.habit_logs (user_id);
create index if not exists habit_logs_habit_id_idx on public.habit_logs (habit_id);

alter table public.habit_logs enable row level security;

drop policy if exists "habit_logs_select_own" on public.habit_logs;
create policy "habit_logs_select_own"
  on public.habit_logs for select to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.habits h
      where h.id = habit_id and h.user_id = auth.uid()
    )
  );

drop policy if exists "habit_logs_insert_own" on public.habit_logs;
create policy "habit_logs_insert_own"
  on public.habit_logs for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.habits h
      where h.id = habit_id and h.user_id = auth.uid()
    )
  );

drop policy if exists "habit_logs_update_own" on public.habit_logs;
create policy "habit_logs_update_own"
  on public.habit_logs for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.habits h
      where h.id = habit_id and h.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.habits h
      where h.id = habit_id and h.user_id = auth.uid()
    )
  );

drop policy if exists "habit_logs_delete_own" on public.habit_logs;
create policy "habit_logs_delete_own"
  on public.habit_logs for delete to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.habits h
      where h.id = habit_id and h.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.habit_logs to authenticated;
grant all on public.habit_logs to service_role;

-- ---------------------------------------------------------------------------
-- 6. reflections
-- ---------------------------------------------------------------------------
create table if not exists public.reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  week_number int not null,
  win_answer text,
  miss_answer text,
  improve_answer text,
  ai_insight text,
  xp_earned int not null default 75,
  created_at timestamptz not null default now()
);

create index if not exists reflections_user_id_idx on public.reflections (user_id);

alter table public.reflections enable row level security;

drop policy if exists "reflections_select_own" on public.reflections;
create policy "reflections_select_own"
  on public.reflections for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "reflections_insert_own" on public.reflections;
create policy "reflections_insert_own"
  on public.reflections for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "reflections_update_own" on public.reflections;
create policy "reflections_update_own"
  on public.reflections for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "reflections_delete_own" on public.reflections;
create policy "reflections_delete_own"
  on public.reflections for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.reflections to authenticated;
grant all on public.reflections to service_role;
