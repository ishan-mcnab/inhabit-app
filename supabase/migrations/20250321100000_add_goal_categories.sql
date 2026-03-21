-- Adds multi-select goal category tags from onboarding (text array).
-- Apply in Supabase SQL Editor if you already ran the initial users migration.

alter table public.users
  add column if not exists goal_categories text[] not null default '{}';

comment on column public.users.goal_categories is
  'Goal areas selected during onboarding; stable slug values.';
