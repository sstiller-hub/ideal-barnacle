alter table public.workouts
  add column if not exists total_volume_lb numeric not null default 0,
  add column if not exists pr_count integer not null default 0;

create table if not exists public.workout_prs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id text not null,
  exercise_name text not null,
  pr_type text not null check (pr_type in ('e1rm', 'volume', 'weight_for_reps')),
  value numeric not null,
  previous_value numeric,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workout_prs_user_created_at_idx
  on public.workout_prs (user_id, created_at desc);
create index if not exists workout_prs_workout_id_idx
  on public.workout_prs (workout_id);
create index if not exists workout_prs_user_exercise_type_idx
  on public.workout_prs (user_id, exercise_id, pr_type);

alter table public.workout_prs enable row level security;
alter table public.workouts enable row level security;

drop policy if exists "workout_prs_select_own" on public.workout_prs;
create policy "workout_prs_select_own"
  on public.workout_prs
  for select
  using (auth.uid() = user_id);

drop policy if exists "workout_prs_insert_own" on public.workout_prs;
create policy "workout_prs_insert_own"
  on public.workout_prs
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "workout_prs_delete_own" on public.workout_prs;
create policy "workout_prs_delete_own"
  on public.workout_prs
  for delete
  using (auth.uid() = user_id);

drop policy if exists "workouts_select_own" on public.workouts;
create policy "workouts_select_own"
  on public.workouts
  for select
  using (auth.uid() = user_id);

drop policy if exists "workouts_update_own" on public.workouts;
create policy "workouts_update_own"
  on public.workouts
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
