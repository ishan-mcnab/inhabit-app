-- Quest unlock preference: schedule-based vs completion-based.
-- Run manually in Supabase SQL Editor if preferred.

alter table public.users
  add column if not exists quest_progression text not null default 'weekly';

comment on column public.users.quest_progression is
  'weekly: quests unlock by calendar week; completion: previous quest must be done.';
