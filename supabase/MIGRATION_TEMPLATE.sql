-- Template for new migrations. Copy to supabase/migrations/NNN_<name>.sql.
--
-- Context: Starting Oct 30, tables created in "public" do NOT get Data API
-- access by default. Without the GRANT block below, supabase-js / PostgREST
-- (/rest/v1/) / GraphQL (/graphql/v1/) cannot reach the table. Existing
-- tables (migrations 001-013) are unaffected; this applies to NEW tables.

create table if not exists public.example (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_at timestamptz not null default now()
);

-- Data API access. Required for supabase-js .from("example") to work.
-- Drop the `anon` line if the table should only be reachable when signed in.
grant select, insert, update, delete on public.example to authenticated;
grant select on public.example to anon;

-- RLS. Always enable for user-scoped tables.
alter table public.example enable row level security;

drop policy if exists "example_select_own" on public.example;
drop policy if exists "example_insert_own" on public.example;
drop policy if exists "example_update_own" on public.example;
drop policy if exists "example_delete_own" on public.example;

create policy "example_select_own"
  on public.example for select
  using (user_id = auth.uid());

create policy "example_insert_own"
  on public.example for insert
  with check (user_id = auth.uid());

create policy "example_update_own"
  on public.example for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "example_delete_own"
  on public.example for delete
  using (user_id = auth.uid());
