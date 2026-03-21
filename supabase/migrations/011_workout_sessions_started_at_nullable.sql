-- scheduled override rows have no start time; make the column nullable
alter table public.workout_sessions
  alter column started_at drop not null;
