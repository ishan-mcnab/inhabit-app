-- Record when a goal was fully completed (100% weekly quests).
alter table public.goals add column if not exists completed_at timestamptz;

comment on column public.goals.completed_at is
  'Set when status becomes completed (all weekly quests done).';
