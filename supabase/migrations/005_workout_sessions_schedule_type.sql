alter table public.workout_sessions
  add column if not exists workout_type text not null default 'Rest';

alter table public.workout_sessions
  drop constraint if exists workout_sessions_workout_type_check;

alter table public.workout_sessions
  add constraint workout_sessions_workout_type_check
  check (workout_type in ('Upper', 'Lower', 'Rest'));

drop index if exists workout_sessions_schedule_date_unique;

create unique index if not exists workout_sessions_schedule_date_status_unique
  on public.workout_sessions (user_id, scheduled_date, status)
  where scheduled_date is not null;
