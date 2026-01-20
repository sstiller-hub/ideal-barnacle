alter table public.workout_sessions
  add column if not exists scheduled_date date,
  add column if not exists routine_id text,
  add column if not exists routine_name text,
  add column if not exists is_override boolean not null default false;

alter table public.workout_sessions
  drop constraint if exists workout_sessions_status_check;

alter table public.workout_sessions
  add constraint workout_sessions_status_check
  check (status in ('active', 'completed', 'abandoned', 'scheduled'));

create unique index if not exists workout_sessions_schedule_date_unique
  on public.workout_sessions (user_id, scheduled_date)
  where status = 'scheduled' and scheduled_date is not null;
