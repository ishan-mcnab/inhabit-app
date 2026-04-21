-- Allow multiple times of day per habit (e.g. morning + evening).
alter table public.habits
  alter column time_of_day
  type text[] using
  case
    when time_of_day is null then null
    else array[time_of_day]
  end;

comment on column public.habits.time_of_day is
  'When the habit applies: one or more of morning, afternoon, evening.';
