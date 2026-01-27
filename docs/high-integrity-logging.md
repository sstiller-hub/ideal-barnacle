# High Integrity Logging

Local-first workout logging with one-shot commit on Finish.

## Local draft storage
- IndexedDB database: `akt-workout-drafts`
- Object store: `workouts`
- Each draft stores the full workout payload plus sets and sync state.

Reset local drafts (dev):
- Chrome DevTools -> Application -> IndexedDB -> delete `akt-workout-drafts`

## Manual QA checklist
1. Start a workout, edit sets, refresh the page; verify edits persist.
2. Toggle offline in DevTools, finish a workout; verify sync state shows pending.
3. Go online; verify sync completes and state becomes Saved.
4. Finish twice or retry sync; ensure no duplicate rows.

## Supabase verification
Queries (SQL editor):
```
select id, user_id, name, performed_at, started_at, completed_at, status
from workouts
order by performed_at desc
limit 5;

select workout_id, exercise_id, exercise_name, set_index, reps, weight, completed
from workout_sets
where workout_id = '<workout_id>'
order by exercise_id, set_index;
```

## Local dev notes
- `POST /api/workouts/commit` expects the full draft payload from IndexedDB.
- Analytics still runs after commit via `/api/workouts/{id}/complete`.
