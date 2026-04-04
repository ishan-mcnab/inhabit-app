-- Tracks when weekly XP was last reset (client checks vs current week Monday).

alter table public.users
  add column if not exists last_weekly_reset date;
