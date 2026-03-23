-- Per-user, per-exercise settings (bar weight, plate display mode, seat height)
create table if not exists public.user_exercise_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_name text not null,
  seat text,
  bar_weight numeric,
  plate_display_mode text check (plate_display_mode in ('per-side', 'total')),
  updated_at timestamptz default now(),
  primary key (user_id, exercise_name)
);

alter table public.user_exercise_settings enable row level security;

drop policy if exists "user_exercise_settings_select_own" on public.user_exercise_settings;
create policy "user_exercise_settings_select_own"
  on public.user_exercise_settings for select
  using (user_id = auth.uid());

drop policy if exists "user_exercise_settings_insert_own" on public.user_exercise_settings;
create policy "user_exercise_settings_insert_own"
  on public.user_exercise_settings for insert
  with check (user_id = auth.uid());

drop policy if exists "user_exercise_settings_update_own" on public.user_exercise_settings;
create policy "user_exercise_settings_update_own"
  on public.user_exercise_settings for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "user_exercise_settings_delete_own" on public.user_exercise_settings;
create policy "user_exercise_settings_delete_own"
  on public.user_exercise_settings for delete
  using (user_id = auth.uid());
