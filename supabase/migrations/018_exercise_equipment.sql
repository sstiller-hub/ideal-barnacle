-- Equipment photos: the machine an exercise is done on.
--
-- user_exercise_settings.equipment holds the sticky ("from now on") choice:
-- { name, brand, kind, photo (small JPEG data URL), setAt }. Today-only
-- choices never reach this table; they live on the session.
--
-- workout_exercises.equipment records the name of the equipment actually used
-- in a logged workout (sticky or today-only), so history says which machine.

alter table public.user_exercise_settings
  add column if not exists equipment jsonb;

alter table public.workout_exercises
  add column if not exists equipment text;

comment on column public.user_exercise_settings.equipment is
  'Sticky equipment for this exercise, confirmed by the user from a photo. Null when none.';
comment on column public.workout_exercises.equipment is
  'Equipment name the user confirmed for this exercise in this workout. Null when not logged.';
