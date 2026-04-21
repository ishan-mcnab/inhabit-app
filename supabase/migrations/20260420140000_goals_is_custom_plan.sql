alter table public.goals
  add column if not exists is_custom_plan boolean not null default false;
