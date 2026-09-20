# Kova Fit Docs

## Product Philosophy: System of Record
- Explicit data entry only. No inference.
- High data integrity and trustworthiness.
- Missing data remains missing and is shown as missing or Not logged.
- All data mutations are user initiated and auditable.
- Historical records are immutable unless explicitly edited.
- Edit first UX. Avoid accidental set creation or deletion.
- Sessions and history are the authoritative record.

## Known Gaps
- Some existing features use smart defaults and progressive autofill. These should be reviewed to ensure they remain explicit and user initiated.

## Working with Codex
- Codex standing instructions: /docs/codex-standing-instructions.md

## Coach Notes

Feedback from a check-in, written straight into `public.coach_notes` and read by
the app. Nothing in the app writes a note — it only shows them, dismisses them,
and resolves them.

Where a note appears is decided by `scope`:

| `scope` | `target` | Where it shows |
| --- | --- | --- |
| `exercise` | `lower(trim(exercise name))` | On that exercise's page in the active workout, above the set list |
| `workout` | `lower(trim(workout name))` | Once at the top of the session it belongs to |
| `global` | `null` | The pre-workout (Home) screen only — never inside a session |

`kind` is one of `target`, `change`, `flag`, `reminder` and only sets the pill.
`body` is the line you read at a glance; `detail` is the optional expansion
behind a tap.

Matching is case-insensitive and trimmed on both sides, and nothing more: an
exercise called `"  Belt Squat RDL "` matches the target `belt squat rdl`. Alias
folding (the thing that unifies renamed machines for the stats views) is
deliberately NOT applied here, so a target always means exactly the name it
spells.

### resolve_rule shapes

`resolve_rule` says what clears the note. It is evaluated when a workout is
completed, against the sets that workout just logged:

| Shape | Clears when |
| --- | --- |
| `{"type":"set_at_least","weight":N,"reps":N}` | Any completed set of the target hits **both** `weight >= N` and `reps >= N` |
| `{"type":"weight_at_least","weight":N}` | Any completed set of the target hits `weight >= N` |
| `{"type":"sessions_seen","n":N}` | `N` completed workouts containing the target since the note was written |
| `{"type":"manual"}` | Never automatically — it stays until swiped away |

Examples:

```json
{"type":"set_at_least","weight":305,"reps":8}
{"type":"weight_at_least","weight":300}
{"type":"sessions_seen","n":2}
{"type":"manual"}
```

A rule that is missing a number, or has a non-number where one belongs, never
resolves — it will not raise and will not fail the workout that finished. The
same shapes are on the table comment in Postgres, so authoring a note needs
neither this file nor the code.

### Lifecycle

- **Open** — `resolved_at is null and dismissed_at is null`. This is what the
  `coach_notes_open` view returns and what the app queries, once, at workout start.
- **Resolved** — set by `public.resolve_coach_notes_for_workout(workout_id)`,
  which runs inside the workout-commit request (see
  `supabase/migrations/016_coach_notes_auto_resolve.sql`). It writes
  `resolved_at = now(), resolved_by = 'auto'` and returns what it cleared; the
  summary screen lists those as `Cleared: Belt Squat RDL 305x8`.
- **Dismissed** — swipe a card left. `dismissed_at` is stamped and the note never
  comes back.

## Next Session Notes
- Purpose: Explicit user authored notes for the next routine or exercise session.
- UI: Routine note appears at the top of the session. Exercise note appears inside each exercise section.
- Storage: localStorage key `next_session_notes_v1` with routine and exercise entries keyed by ID when available and name fallback only when IDs are missing.
- Integrity: Notes are created, edited, or cleared only by explicit user actions. No auto clearing or inference.
