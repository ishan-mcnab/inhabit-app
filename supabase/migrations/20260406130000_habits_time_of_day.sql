-- Add label-only time_of_day field for habits UI.
alter table public.habits
  add column if not exists time_of_day text;

comment on column public.habits.time_of_day is
  'UI label for when the habit is typically done (morning/afternoon/evening).';

