# Supabase Migrations

Migrations live in `supabase/migrations/NNN_<name>.sql` and run in numeric order. Template: `supabase/MIGRATION_TEMPLATE.sql`.

## Data API access change (Oct 30)

Tables created in the `public` schema after Oct 30 do **not** receive Data API access by default. Without explicit GRANTs, the table is invisible to:

- `supabase-js` (`supabase.from("...")`, `.rpc(...)`)
- PostgREST (`/rest/v1/`)
- GraphQL (`/graphql/v1/`)

Existing tables (migrations 001–013) keep their grants — this only affects **new** `create table` statements going forward.

## Checklist for any new migration that creates a public table

- [ ] `create table public.<name> (...)`
- [ ] `grant select, insert, update, delete on public.<name> to authenticated;`
- [ ] `grant select on public.<name> to anon;` — only if anon needs read access; omit otherwise
- [ ] `alter table public.<name> enable row level security;`
- [ ] RLS policies for select / insert / update / delete scoped to `auth.uid()`
- [ ] Verify with `supabase.from("<name>").select(...)` from a signed-in client after applying

If a migration only alters an existing table, no new GRANTs are needed — grants persist on the table.

## Tables that should NOT be exposed to the Data API

If a table is server-only (accessed solely via `lib/supabase-admin.ts` with the service role key), omit the `grant ... to authenticated/anon` lines. The service role bypasses both grants and RLS.
