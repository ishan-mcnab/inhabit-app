-- JSON object keyed by category slug with onboarding follow-up answers.
alter table public.users
  add column if not exists goal_context jsonb not null default '{}'::jsonb;

comment on column public.users.goal_context is
  'Per-category onboarding context (fitness level, habits, etc.).';
