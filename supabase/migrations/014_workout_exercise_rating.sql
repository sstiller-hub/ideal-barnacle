-- Persist the per-exercise "felt" rating (thumbs up / thumbs down) captured
-- during a workout. These columns already exist on the live database; this
-- migration records them so fresh environments stay in sync.
alter table public.workout_exercises
  add column if not exists rating text
    check (rating in ('thumbs_up', 'thumbs_down'));

alter table public.workout_exercises
  add column if not exists rating_at timestamptz;

comment on column public.workout_exercises.rating is
  'Optional post-set felt rating: thumbs_up = felt good, thumbs_down = felt rough';
comment on column public.workout_exercises.rating_at is
  'Timestamp when rating was last set or changed';
