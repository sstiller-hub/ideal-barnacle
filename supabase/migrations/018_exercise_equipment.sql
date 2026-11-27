-- The piece of equipment used for an exercise, identified from a photo.
--
-- Every photo the user confirms becomes one row; rows are never updated or
-- deleted by the app, so the table is the audit trail of what was used when.
--
--   scope = 'standing'  : the equipment from now on, until another standing
--                         row is saved for the same exercise.
--   scope = 'today'     : only for valid_on (the user's local date). The next
--                         day the exercise falls back to its standing row.
--
-- exercise_name = lower(trim(exercise name)), the same key as
-- user_exercise_settings, so a Cape machine ("... [cape]") has its own row.

create table if not exists public.exercise_equipment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exercise_name text not null,
  equipment_name text not null check (length(trim(equipment_name)) > 0),
  brand text,
  equipment_type text,
  notes text,
  scope text not null check (scope in ('standing', 'today')),
  valid_on date,
  identified_by text not null default 'claude' check (identified_by in ('claude', 'manual')),
  created_at timestamptz not null default now(),
  check ((scope = 'today') = (valid_on is not null))
);

comment on table public.exercise_equipment is
  'Equipment per exercise, from a confirmed photo. Current equipment = latest scope=today row with valid_on = local today, else latest scope=standing row. Append-only.';

create index if not exists exercise_equipment_lookup
  on public.exercise_equipment (user_id, exercise_name, created_at desc);

alter table public.exercise_equipment enable row level security;

drop policy if exists "exercise_equipment_select_own" on public.exercise_equipment;
create policy "exercise_equipment_select_own"
  on public.exercise_equipment for select
  using (user_id = auth.uid());

drop policy if exists "exercise_equipment_insert_own" on public.exercise_equipment;
create policy "exercise_equipment_insert_own"
  on public.exercise_equipment for insert
  with check (user_id = auth.uid());
