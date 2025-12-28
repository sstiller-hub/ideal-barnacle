create extension if not exists "pgcrypto";

-- Sessions table for active workout continuity
create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status text not null check (status in ('active', 'completed', 'abandoned')),
  started_at timestamptz not null,
  ended_at timestamptz null,
  active_duration_seconds int not null default 0,
  last_resumed_at timestamptz null,
  paused_at timestamptz null,
  updated_at timestamptz not null default now()
);

-- Enforce single active session per user
create unique index if not exists workout_sessions_one_active_per_user
  on public.workout_sessions (user_id)
  where status = 'active';

-- Extend existing workout_sets table to support in-progress sessions
alter table public.workout_sets
  add column if not exists user_id uuid,
  add column if not exists session_id uuid,
  add column if not exists exercise_id text,
  add column if not exists set_index int,
  add column if not exists validation_flags text[],
  add column if not exists updated_at timestamptz default now();

-- Prevent duplicates within a session by id
create unique index if not exists workout_sets_session_id_id_unique
  on public.workout_sets (session_id, id)
  where session_id is not null;

-- RLS
alter table public.workout_sessions enable row level security;
alter table public.workout_sets enable row level security;

-- Policies: users can only access their own rows
drop policy if exists "workout_sessions_select_own" on public.workout_sessions;
drop policy if exists "workout_sessions_insert_own" on public.workout_sessions;
drop policy if exists "workout_sessions_update_own" on public.workout_sessions;
drop policy if exists "workout_sessions_delete_own" on public.workout_sessions;

create policy "workout_sessions_select_own"
  on public.workout_sessions for select
  using (user_id = auth.uid());

create policy "workout_sessions_insert_own"
  on public.workout_sessions for insert
  with check (user_id = auth.uid());

create policy "workout_sessions_update_own"
  on public.workout_sessions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "workout_sessions_delete_own"
  on public.workout_sessions for delete
  using (user_id = auth.uid());

drop policy if exists "workout_sets_select_own" on public.workout_sets;
drop policy if exists "workout_sets_insert_own" on public.workout_sets;
drop policy if exists "workout_sets_update_own" on public.workout_sets;
drop policy if exists "workout_sets_delete_own" on public.workout_sets;

create policy "workout_sets_select_own"
  on public.workout_sets for select
  using (user_id = auth.uid());

create policy "workout_sets_insert_own"
  on public.workout_sets for insert
  with check (user_id = auth.uid());

create policy "workout_sets_update_own"
  on public.workout_sets for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "workout_sets_delete_own"
  on public.workout_sets for delete
  using (user_id = auth.uid());
