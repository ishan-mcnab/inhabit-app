-- Stamp the Monday (local week) when weekly daily-mission regeneration last ran.
alter table public.users
  add column if not exists last_mission_reset date;
