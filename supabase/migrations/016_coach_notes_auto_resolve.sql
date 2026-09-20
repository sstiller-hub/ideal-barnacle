-- Coach-notes auto-resolve.
--
-- public.coach_notes / public.coach_notes_open already exist in prod (authored
-- by hand alongside the check-in workflow) and are deliberately NOT recreated
-- here — this migration only adds the function the app calls when a workout is
-- completed. The table comment is the authoring contract for resolve_rule; see
-- docs/index.md → Coach Notes for the same shapes in prose.
--
-- Called from the commit path (app/api/workouts/commit/route.ts) in the same
-- request that flips workouts.status to 'completed'. No scheduler, no edge
-- function: resolution is a side effect of finishing a workout, so it runs
-- exactly where that happens and nowhere else.
--
-- SECURITY INVOKER on purpose. The server calls it with the service-role key
-- (which bypasses RLS), and an end user calling it over PostgREST is bounded by
-- the coach_notes RLS policy (auth.uid() = user_id) — so it can never resolve
-- another athlete's notes.

create or replace function public.resolve_coach_notes_for_workout(p_workout_id uuid)
returns table (
  id uuid,
  user_id uuid,
  scope text,
  target text,
  kind text,
  body text,
  detail text,
  resolve_rule jsonb,
  resolved_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid;
  v_workout_target text;
begin
  -- Only a completed workout resolves anything. A draft commit (autosave) runs
  -- through the same route and must be inert here.
  select w.user_id, lower(trim(w.name))
    into v_user_id, v_workout_target
    from public.workouts w
   where w.id = p_workout_id
     and w.status = 'completed';

  if v_user_id is null then
    return;
  end if;

  return query
  with workout_targets as (
    -- Exercise-name matching is case-insensitive and trimmed everywhere; this
    -- is the one definition of "the targets this workout touched".
    select distinct lower(trim(we.name)) as target
      from public.workout_exercises we
     where we.workout_id = p_workout_id
       and we.name is not null
  ),
  candidates as (
    select
      n.id,
      n.scope,
      lower(trim(n.target)) as target,
      n.created_at,
      n.resolve_rule ->> 'type' as rule_type,
      -- Cast only what is actually a JSON number, so a malformed rule resolves
      -- to NULL (never matches) instead of raising and failing the commit.
      case when jsonb_typeof(n.resolve_rule -> 'weight') = 'number'
           then (n.resolve_rule ->> 'weight')::numeric end as rule_weight,
      case when jsonb_typeof(n.resolve_rule -> 'reps') = 'number'
           then (n.resolve_rule ->> 'reps')::numeric end as rule_reps,
      case when jsonb_typeof(n.resolve_rule -> 'n') = 'number'
           then (n.resolve_rule ->> 'n')::numeric end as rule_n
      from public.coach_notes n
     where n.user_id = v_user_id
       and n.resolved_at is null
       and n.dismissed_at is null
       and n.target is not null
       -- scope='global' notes carry no target and are manual by construction.
       and (
         (n.scope = 'exercise' and lower(trim(n.target)) in (select wt.target from workout_targets wt))
         or (n.scope = 'workout' and lower(trim(n.target)) = v_workout_target)
       )
  ),
  cleared as (
    select c.id
      from candidates c
     where case c.rule_type
       -- any completed set with weight >= N and reps >= N
       when 'set_at_least' then exists (
         select 1
           from public.workout_sets s
           join public.workout_exercises we on we.id = s.workout_exercise_id
          where we.workout_id = p_workout_id
            and s.completed
            and (c.scope = 'workout' or lower(trim(we.name)) = c.target)
            and s.weight >= c.rule_weight
            and s.reps >= c.rule_reps
       )
       -- any completed set with weight >= N
       when 'weight_at_least' then exists (
         select 1
           from public.workout_sets s
           join public.workout_exercises we on we.id = s.workout_exercise_id
          where we.workout_id = p_workout_id
            and s.completed
            and (c.scope = 'workout' or lower(trim(we.name)) = c.target)
            and s.weight >= c.rule_weight
       )
       -- completed workouts since the note was written that contain the target
       when 'sessions_seen' then c.rule_n is not null and (
         select count(*)
           from public.workouts w2
          where w2.user_id = v_user_id
            and w2.status = 'completed'
            and coalesce(w2.completed_at, w2.performed_at) >= c.created_at
            and (
              case c.scope
                when 'workout' then lower(trim(w2.name)) = c.target
                else exists (
                  select 1
                    from public.workout_exercises we2
                   where we2.workout_id = w2.id
                     and lower(trim(we2.name)) = c.target
                )
              end
            )
       ) >= c.rule_n
       -- 'manual' (and anything unrecognised) never auto-resolves.
       else false
     end
  ),
  resolved as (
    update public.coach_notes n
       set resolved_at = now(),
           resolved_by = 'auto'
     where n.id in (select cleared.id from cleared)
       and n.resolved_at is null
    returning n.id, n.user_id, n.scope, n.target, n.kind, n.body, n.detail, n.resolve_rule, n.resolved_at
  )
  select * from resolved;
end;
$$;

comment on function public.resolve_coach_notes_for_workout(uuid) is
  'Resolves open coach_notes whose target appeared in the given completed workout, per the note''s resolve_rule. Sets resolved_at = now(), resolved_by = ''auto'' and returns the rows it cleared. Idempotent: already-resolved or dismissed notes are never touched.';

grant execute on function public.resolve_coach_notes_for_workout(uuid) to authenticated, service_role;
