-- Progressive-overload stall alerts.
-- Codifies the workout_alerts table (already present in prod, created ad hoc as
-- "create_workout_alerts_table") so the repo migrations are the source of truth,
-- tightens the insert policy to service_role only, and adds the indexes used by
-- the weekly-nudge dedupe lookup in /api/workouts/[id]/complete.

create table if not exists public.workout_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid references public.workouts(id) on delete set null,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  exercise_name text not null,
  flag text not null,
  tier integer not null check (tier in (1, 2, 3)),
  message text not null,
  action text not null,
  context jsonb not null default '{}'::jsonb
);

alter table public.workout_alerts enable row level security;

drop policy if exists "Users can read their own alerts" on public.workout_alerts;
create policy "Users can read their own alerts"
  on public.workout_alerts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can mark their own alerts as seen" on public.workout_alerts;
create policy "Users can mark their own alerts as seen"
  on public.workout_alerts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Alerts are produced server-side only; the previous policy allowed any
-- authenticated user to insert, so scope it to service_role.
drop policy if exists "Service role can insert alerts" on public.workout_alerts;
create policy "Service role can insert alerts"
  on public.workout_alerts for insert
  to service_role
  with check (true);

create index if not exists workout_alerts_user_unseen_idx
  on public.workout_alerts (user_id, created_at desc)
  where seen_at is null;

create index if not exists workout_alerts_user_flag_created_idx
  on public.workout_alerts (user_id, flag, created_at desc);
