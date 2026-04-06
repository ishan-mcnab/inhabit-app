-- ISO week-year for reflections (week_number is ISO week 1–53) + optional stats + dedupe.

alter table public.reflections
  add column if not exists iso_week_year integer;

update public.reflections
set iso_week_year = extract(isoyear from created_at)::integer
where iso_week_year is null;

alter table public.reflections
  alter column iso_week_year set not null;

alter table public.reflections
  add column if not exists mission_completion_rate integer;

create unique index if not exists reflections_user_iso_week_unique
  on public.reflections (user_id, iso_week_year, week_number);
