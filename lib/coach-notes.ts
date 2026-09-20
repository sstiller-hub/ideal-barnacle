import { supabase } from "@/lib/supabase"

/**
 * Coach notes — the check-in feedback that rides along with a workout.
 *
 * The table and the `coach_notes_open` view are authored outside this repo (see
 * supabase/migrations/016_coach_notes_auto_resolve.sql for the contract); this
 * module is the only place the app touches them.
 */

export type CoachNoteScope = "exercise" | "workout" | "global"
export type CoachNoteKind = "target" | "change" | "flag" | "reminder"

export type CoachNoteResolveRule =
  | { type: "set_at_least"; weight: number; reps: number }
  | { type: "weight_at_least"; weight: number }
  | { type: "sessions_seen"; n: number }
  | { type: "manual" }

export type CoachNote = {
  id: string
  user_id: string
  created_at: string
  source_date: string
  scope: CoachNoteScope
  /** lower(trim(exercise name)) or workout name; null for scope="global". */
  target: string | null
  kind: CoachNoteKind
  body: string
  detail: string | null
  resolve_rule: CoachNoteResolveRule | Record<string, unknown>
}

export type ResolvedCoachNote = CoachNote & {
  resolved_at: string
  resolved_by: "auto" | "user" | null
}

const OPEN_NOTE_COLUMNS =
  "id, user_id, created_at, source_date, scope, target, kind, body, detail, resolve_rule"

/**
 * The signed-in user's id, read from the stored session rather than validated
 * against the auth server: the very next request carries that same token and
 * the database decides on it, so a round trip here would only delay the query.
 */
async function getUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id ?? null
}

/**
 * The one definition of how an exercise or workout name becomes a note target.
 * Mirrors the SQL side exactly (`lower(trim(name))`) — matching is
 * case-insensitive and trimmed everywhere, and nowhere else does anything more
 * (no alias folding, no whitespace collapsing), so the two never drift.
 */
export function coachNoteTarget(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase()
}

/**
 * Every open note for the signed-in athlete, newest first.
 *
 * Queried once at workout start — notes are written between sessions, so
 * re-reading them mid-workout would only cost requests.
 *
 * The user_id filter is deliberate and not redundant: `coach_notes_open` is a
 * plain view owned by `postgres`, so it runs with the owner's rights and does
 * not inherit the RLS on `coach_notes`. Scoping the read here is what keeps a
 * client from ever seeing another athlete's notes.
 */
export async function fetchOpenCoachNotes(): Promise<CoachNote[]> {
  if (!supabase) return []

  const userId = await getUserId()
  if (!userId) return []

  const { data, error } = await supabase
    .from("coach_notes_open")
    .select(OPEN_NOTE_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Failed to fetch coach notes:", error)
    return []
  }
  return (data || []) as CoachNote[]
}

/** Swipe-to-dismiss. A dismissed note never comes back — the view filters it out. */
export async function dismissCoachNote(noteId: string): Promise<boolean> {
  if (!supabase) return false

  const { error } = await supabase
    .from("coach_notes")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", noteId)
    .is("dismissed_at", null)

  if (error) {
    console.error("Failed to dismiss coach note:", error)
    return false
  }
  return true
}

/**
 * Notes that auto-resolved during the session that just finished, for the
 * summary screen's "Cleared:" lines.
 *
 * Resolution happens server-side inside the commit request, so there is no
 * per-workout stamp on the note to key off (the schema is fixed). Bounding on
 * "resolved since this session started, and targeting something this session
 * touched" is what identifies them.
 */
export async function fetchAutoResolvedCoachNotes(params: {
  since: string
  targets: string[]
}): Promise<ResolvedCoachNote[]> {
  if (!supabase) return []

  const userId = await getUserId()
  if (!userId) return []

  const wanted = new Set(params.targets.map(coachNoteTarget).filter(Boolean))
  if (wanted.size === 0) return []

  const { data, error } = await supabase
    .from("coach_notes")
    .select(`${OPEN_NOTE_COLUMNS}, resolved_at, resolved_by`)
    .eq("user_id", userId)
    .eq("resolved_by", "auto")
    .gte("resolved_at", params.since)
    .order("resolved_at", { ascending: true })

  if (error) {
    console.error("Failed to fetch resolved coach notes:", error)
    return []
  }

  return ((data || []) as ResolvedCoachNote[]).filter((note) =>
    wanted.has(coachNoteTarget(note.target))
  )
}

/** Groups exercise-scoped notes by their target, ready for per-exercise lookup. */
export function groupExerciseNotes(notes: CoachNote[]): Map<string, CoachNote[]> {
  const byTarget = new Map<string, CoachNote[]>()
  notes.forEach((note) => {
    if (note.scope !== "exercise") return
    const key = coachNoteTarget(note.target)
    if (!key) return
    const bucket = byTarget.get(key)
    if (bucket) bucket.push(note)
    else byTarget.set(key, [note])
  })
  return byTarget
}

/** Workout-scoped notes for one workout name (rendered once per session). */
export function selectWorkoutNotes(notes: CoachNote[], workoutName: string): CoachNote[] {
  const key = coachNoteTarget(workoutName)
  if (!key) return []
  return notes.filter((note) => note.scope === "workout" && coachNoteTarget(note.target) === key)
}

/** Global notes — the pre-workout screen only, never inside a session. */
export function selectGlobalNotes(notes: CoachNote[]): CoachNote[] {
  return notes.filter((note) => note.scope === "global")
}

/**
 * The threshold a rule cleared, in the note's own vocabulary — the tail of a
 * summary line like "Cleared: Belt Squat RDL 305x8".
 */
export function describeResolveThreshold(rule: CoachNote["resolve_rule"]): string | null {
  const type = (rule as { type?: unknown })?.type
  const num = (key: string): number | null => {
    const value = (rule as Record<string, unknown>)?.[key]
    return typeof value === "number" && Number.isFinite(value) ? value : null
  }

  if (type === "set_at_least") {
    const weight = num("weight")
    const reps = num("reps")
    return weight !== null && reps !== null ? `${weight}x${reps}` : null
  }
  if (type === "weight_at_least") {
    const weight = num("weight")
    return weight !== null ? `${weight} lb` : null
  }
  if (type === "sessions_seen") {
    const n = num("n")
    return n !== null ? `${n} ${n === 1 ? "session" : "sessions"}` : null
  }
  return null
}

/**
 * One summary line per cleared note, e.g. "Belt Squat RDL 305x8".
 *
 * `displayNames` maps a target back to the casing the exercise was logged
 * under, so the line reads like the set list rather than like the database.
 */
export function formatClearedNoteLine(
  note: CoachNote,
  displayNames?: Map<string, string>
): string {
  const key = coachNoteTarget(note.target)
  const name = displayNames?.get(key) ?? note.target ?? ""
  const threshold = describeResolveThreshold(note.resolve_rule)
  return threshold ? `${name} ${threshold}` : name
}
