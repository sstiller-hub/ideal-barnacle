import type { getSupabaseAdmin } from "@/lib/supabase-admin"

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>

export type ResolvedCoachNoteRow = {
  id: string
  user_id: string
  scope: string
  target: string | null
  kind: string
  body: string
  detail: string | null
  resolve_rule: Record<string, unknown>
  resolved_at: string
}

/**
 * Auto-resolves the coach notes this workout cleared.
 *
 * All of the evaluation lives in the Postgres function (see
 * supabase/migrations/016_coach_notes_auto_resolve.sql) — it reads the sets and
 * the session history the same transaction just wrote, so there is no window in
 * which the app and the database disagree about what was lifted.
 *
 * Called from the commit request, the one path that flips workouts.status to
 * 'completed' and the one that always runs to completion server-side. It is
 * idempotent, so a sync retry re-committing the same workout is harmless.
 */
export async function resolveCoachNotesForWorkout(
  supabase: SupabaseAdminClient,
  workoutId: string
): Promise<ResolvedCoachNoteRow[]> {
  const { data, error } = await supabase.rpc("resolve_coach_notes_for_workout", {
    p_workout_id: workoutId,
  })

  if (error) {
    throw new Error(error.message)
  }
  return (data || []) as ResolvedCoachNoteRow[]
}
