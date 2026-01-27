-- High integrity logging support
alter table public.workouts
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists status text,
  add column if not exists updated_at timestamptz default now();

alter table public.workout_sets
  add column if not exists workout_id uuid,
  add column if not exists completed boolean not null default true,
  add column if not exists exercise_name text,
  add column if not exists updated_at timestamptz default now();

create index if not exists workout_sets_workout_id_idx
  on public.workout_sets (workout_id);

create index if not exists workouts_user_id_performed_at_idx
  on public.workouts (user_id, performed_at desc);

-- Ensure users can insert/delete their own workouts
drop policy if exists "workouts_insert_own" on public.workouts;
create policy "workouts_insert_own"
  on public.workouts for insert
  with check (user_id = auth.uid());

drop policy if exists "workouts_delete_own" on public.workouts;
create policy "workouts_delete_own"
  on public.workouts for delete
  using (user_id = auth.uid());
