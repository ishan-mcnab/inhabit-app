-- Track when a weekly quest was marked complete (local anti-cheat / weekly XP alignment).
alter table public.weekly_quests
  add column if not exists completed_at timestamptz;

comment on column public.weekly_quests.completed_at is
  'Set when completed becomes true; cleared when reverted. Used for weekly XP duplicate checks.';
