create extension if not exists "pgcrypto";

create table if not exists public.body_weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  measured_at timestamptz not null,
  weight_kg numeric not null,
  source text not null,
  source_row_id text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists body_weight_entries_unique_source_row
  on public.body_weight_entries (user_id, source, source_row_id);

alter table public.body_weight_entries enable row level security;

drop policy if exists "body_weight_entries_select_own" on public.body_weight_entries;
drop policy if exists "body_weight_entries_insert_own" on public.body_weight_entries;
drop policy if exists "body_weight_entries_update_own" on public.body_weight_entries;
drop policy if exists "body_weight_entries_delete_own" on public.body_weight_entries;

create policy "body_weight_entries_select_own"
  on public.body_weight_entries for select
  using (user_id = auth.uid());

create policy "body_weight_entries_insert_own"
  on public.body_weight_entries for insert
  with check (user_id = auth.uid());

create policy "body_weight_entries_update_own"
  on public.body_weight_entries for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "body_weight_entries_delete_own"
  on public.body_weight_entries for delete
  using (user_id = auth.uid());
