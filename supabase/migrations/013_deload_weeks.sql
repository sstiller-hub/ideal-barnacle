-- Deload week tracking: one active row per user during a deload period.
-- is_active is computed at query time (now() is volatile, can't be a generated column).
create table if not exists public.deload_weeks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz default now()
);

alter table public.deload_weeks enable row level security;

drop policy if exists "deload_weeks_all_own" on public.deload_weeks;
create policy "deload_weeks_all_own"
  on public.deload_weeks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
