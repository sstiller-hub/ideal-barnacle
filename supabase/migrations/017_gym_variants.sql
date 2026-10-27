-- Two gyms, one program: SoWa (Boston, default) and BodyStrong (Cape).
--
-- At BodyStrong a machine exercise is logged as "<SoWa name> [Cape]" so its
-- history stays on its own load scale. exercise_variants maps each movement
-- (lower(trim(SoWa name))) to its Cape machine; v_gym_calibration compares
-- each Cape session's best e1RM to the most recent SoWa session before it.

alter table public.workouts
  add column if not exists gym text not null default 'sowa'
  check (gym in ('sowa', 'bodystrong'));

create table if not exists public.exercise_variants (
  user_id uuid not null default auth.uid() references auth.users(id),
  movement text not null,
  gym text not null check (gym in ('sowa', 'bodystrong')),
  machine_name text,
  shares_history boolean not null default false,
  calibration_status text not null default 'needs_calibration'
    check (calibration_status in ('calibrated', 'needs_calibration', 'tbd')),
  notes text,
  updated_at timestamptz not null default now(),
  primary key (user_id, movement, gym)
);

comment on table public.exercise_variants is
  'Per-gym machine for each movement. movement = lower(trim(SoWa exercise name)). shares_history=true means same load scale at both gyms (free weights, bodyweight). Cape loads compared via v_gym_calibration.ratio.';

alter table public.exercise_variants enable row level security;

drop policy if exists "own variants" on public.exercise_variants;
create policy "own variants" on public.exercise_variants
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace view public.v_gym_calibration with (security_invoker = true) as
with sess as (
  select
    w.user_id,
    w.gym,
    w.performed_at,
    regexp_replace(lower(trim(we.name)), '\s*\[cape\]$', '') as movement,
    max(ws.weight * (1 + ws.reps / 30.0)) as e1
  from workouts w
  join workout_exercises we on we.workout_id = w.id
  join workout_sets ws on ws.workout_exercise_id = we.id
  where not we.is_warmup and ws.completed and ws.reps > 0 and ws.weight > 0
  group by 1, 2, 3, 4
), pair as (
  select
    c.user_id,
    c.movement,
    c.performed_at,
    c.e1 as cape_e1,
    (
      select s.e1 from sess s
      where s.user_id = c.user_id and s.movement = c.movement
        and s.gym = 'sowa' and s.performed_at < c.performed_at
      order by s.performed_at desc
      limit 1
    ) as sowa_e1
  from sess c
  where c.gym = 'bodystrong'
)
select
  user_id,
  movement,
  count(*) as cape_sessions,
  round(avg(cape_e1 / sowa_e1), 3) as ratio,
  max(performed_at) as last_cape_session
from pair
where sowa_e1 is not null
group by 1, 2;
