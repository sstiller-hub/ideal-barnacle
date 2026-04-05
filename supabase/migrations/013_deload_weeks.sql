-- Deload week tracking: one active row per user during a deload period.
-- is_active is a generated column — expires automatically when ends_at passes.
create table if not exists public.deload_weeks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  is_active boolean generated always as (now() between started_at and ends_at) stored,
  created_at timestamptz default now()
);

alter table public.deload_weeks enable row level security;

drop policy if exists "deload_weeks_all_own" on public.deload_weeks;
create policy "deload_weeks_all_own"
  on public.deload_weeks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
