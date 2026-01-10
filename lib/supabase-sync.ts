// lib/supabase-sync.ts
import { supabase } from "@/lib/supabase"
import { getWorkoutHistory, type CompletedWorkout } from "@/lib/workout-storage"

// Local outbox for offline-first sync
const OUTBOX_KEY = "sync_outbox_v1"

type OutboxItem = {
  id: string
  type: "workout_upsert"
  createdAt: string
  workout: WorkoutPayload
}

type WorkoutSet = {
  setIndex?: number
  set_index?: number
  reps?: number | null
  weight?: number | null
  completed?: boolean
}

type WorkoutExercise = {
  id?: string
  exerciseId?: string
  exercise_id?: string
  name?: string
  targetSets?: number
  target_sets?: number
  targetReps?: number | string
  target_reps?: number | string
  targetWeight?: number | string
  target_weight?: number | string
  sets?: WorkoutSet[]
}

type WorkoutPayload = {
  id?: string
  name?: string
  routineName?: string
  performed_at?: string
  date?: string
  durationSeconds?: number
  duration_seconds?: number
  duration?: number
  stats?: Record<string, unknown>
  clientId?: string
  client_id?: string
  exercises?: WorkoutExercise[]
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function uuid() {
  // Support older browsers
  const c = globalThis.crypto as Crypto | undefined
  return c?.randomUUID
    ? c.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isUuid(value: string | undefined | null): boolean {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

function ensureWorkoutUuid(workout: WorkoutPayload): string {
  const currentId = workout?.id
  if (isUuid(currentId)) return currentId

  const newId = uuid()
  workout.id = newId

  if (typeof window !== "undefined") {
    const history = getWorkoutHistory() as CompletedWorkout[]
    const idx = history.findIndex((w) => w.id === currentId)
    if (idx >= 0) {
      history[idx] = { ...history[idx], id: newId }
      localStorage.setItem("workout_history", JSON.stringify(history))
    }
  }

  return newId
}

function getOutbox(): OutboxItem[] {
  if (typeof window === "undefined") return []
  return safeParse<OutboxItem[]>(localStorage.getItem(OUTBOX_KEY), [])
}

function setOutbox(items: OutboxItem[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(items))
}

export function getOutboxCount() {
  return getOutbox().length
}

export function enqueueWorkoutForSync(workout: WorkoutPayload) {
  if (typeof window === "undefined") return

  const items = getOutbox()
  const wid = ensureWorkoutUuid(workout)

  // De-dupe by workout id (keep latest payload)
  const idx = items.findIndex(
    (i) => i.type === "workout_upsert" && i.workout?.id === wid
  )
  const next: OutboxItem = {
    id: `${wid}::${Date.now()}`,
    type: "workout_upsert",
    createdAt: new Date().toISOString(),
    workout: { ...workout, id: wid },
  }

  if (idx >= 0) {
    items[idx] = next
    setOutbox(items)
  } else {
    setOutbox([next, ...items])
  }
}

function toPerformedAt(workout: WorkoutPayload): string {
  return workout?.performed_at || workout?.date || new Date().toISOString()
}

function toDurationSeconds(workout: WorkoutPayload): number {
  return (
    Number(
      workout?.durationSeconds ?? workout?.duration_seconds ?? workout?.duration ?? 0
    ) || 0
  )
}

function toStatsJson(workout: WorkoutPayload): Record<string, unknown> {
  return workout?.stats || {}
}

function toClientId(workout: WorkoutPayload): string {
  return workout?.clientId || workout?.client_id || workout?.id || uuid()
}

async function ensureAuthed() {
  const { data } = await supabase.auth.getUser()
  return data?.user ?? null
}

async function upsertWorkoutGraph(workout: WorkoutPayload, userId: string) {
  // Upsert workout
  const workoutId = ensureWorkoutUuid(workout)
  const workoutRow = {
    id: workoutId,
    user_id: userId,
    name: workout?.name || workout?.routineName || "Workout",
    performed_at: toPerformedAt(workout),
    duration_seconds: toDurationSeconds(workout),
    stats: toStatsJson(workout),
    client_id: toClientId(workout),
    updated_at: new Date().toISOString(),
  }

  const { data: wData, error: wErr } = await supabase
    .from("workouts")
    .upsert(workoutRow, { onConflict: "id" })
    .select("id")
    .single()

  if (wErr) throw wErr
  const persistedWorkoutId = wData?.id || workoutRow.id

  // Replace exercise graph for simplicity (personal app)
  await supabase
    .from("workout_exercises")
    .delete()
    .eq("workout_id", persistedWorkoutId)

  const exercises: WorkoutExercise[] = Array.isArray(workout?.exercises)
    ? workout.exercises
    : []
  if (exercises.length === 0) return

  const exerciseRows = exercises.map((ex, idx) => ({
    workout_id: persistedWorkoutId,
    exercise_id:
      ex?.id ||
      ex?.exerciseId ||
      ex?.exercise_id ||
      ex?.name ||
      `exercise-${idx}`,
    name: ex?.name || "Exercise",
    target_sets: ex?.targetSets ?? ex?.target_sets ?? null,
    target_reps: ex?.targetReps ?? ex?.target_reps ?? null,
    target_weight: ex?.targetWeight ?? ex?.target_weight ?? null,
    sort_index: idx,
    updated_at: new Date().toISOString(),
  }))

  const { data: insertedExercises, error: exErr } = await supabase
    .from("workout_exercises")
    .insert(exerciseRows)
    .select("id, sort_index")

  if (exErr) throw exErr

  const exIdByIndex = new Map<number, string>()
  ;(insertedExercises || []).forEach((row) => {
    if (row?.id && typeof row.sort_index === "number") {
      exIdByIndex.set(row.sort_index, row.id)
    }
  })

  const setsRows: Array<{
    workout_exercise_id: string
    set_index: number
    reps: number | null
    weight: number | null
    completed: boolean
    updated_at: string
  }> = []
  exercises.forEach((ex, idx) => {
    const workoutExerciseId = exIdByIndex.get(idx)
    if (!workoutExerciseId) return

    const sets: WorkoutSet[] = Array.isArray(ex?.sets) ? ex.sets : []
    sets.forEach((s, setIndex) => {
      setsRows.push({
        workout_exercise_id: workoutExerciseId,
        set_index: s?.setIndex ?? s?.set_index ?? setIndex,
        reps: s?.reps ?? null,
        weight: s?.weight ?? null,
        completed: s?.completed ?? true,
        updated_at: new Date().toISOString(),
      })
    })
  })

  if (setsRows.length > 0) {
    const { error: sErr } = await supabase.from("workout_sets").insert(setsRows)
    if (sErr) throw sErr
  }
}

type SyncProgress = {
  total: number
  synced: number
  failed: number
  pending: number
}

type PushOptions = {
  onProgress?: (progress: SyncProgress) => void
  limit?: number
}

export async function pushLocalChangesToSupabase(options?: PushOptions) {
  const user = await ensureAuthed()
  if (!user) return { success: false, message: "Not signed in" }

  const outbox = getOutbox()
  if (outbox.length === 0) return { success: true, message: "Nothing to sync" }

  const ordered = [...outbox].reverse()
  const limit = Math.max(
    0,
    Math.min(typeof options?.limit === "number" ? options.limit : ordered.length, ordered.length)
  )
  const toProcess = ordered.slice(0, limit)

  const successIds = new Set<string>()
  let synced = 0
  let failed = 0
  const total = toProcess.length

  for (const item of toProcess) {
    try {
      await upsertWorkoutGraph(item.workout, user.id)
      successIds.add(item.id)
      synced += 1
    } catch (e) {
      console.error("Sync failed for outbox item", item, e)
      failed += 1
    }

    options?.onProgress?.({
      total,
      synced,
      failed,
      pending: Math.max(0, total - synced - failed),
    })
  }

  const remaining = outbox.filter((item) => !successIds.has(item.id))
  setOutbox(remaining)
  return {
    success: remaining.length === 0,
    message:
      remaining.length === 0
        ? `Synced ${synced} item(s)`
        : `Synced ${synced} item(s), ${remaining.length} pending`,
    synced,
    pending: remaining.length,
  }
}

export async function pullSupabaseToLocal() {
  const user = await ensureAuthed()
  if (!user) return { success: false, message: "Not signed in" }

  const { data: workouts, error: wErr } = await supabase
    .from("workouts")
    .select("id, name, performed_at, duration_seconds, stats")
    .eq("user_id", user.id)
    .order("performed_at", { ascending: false })

  if (wErr) return { success: false, message: wErr.message }
  const cloud = workouts || []
  if (cloud.length === 0) return { success: true, message: "No cloud workouts" }

  const cloudWorkouts: WorkoutPayload[] = []

  for (const w of cloud) {
    const { data: ex, error: exErr } = await supabase
      .from("workout_exercises")
      .select(
        "id, exercise_id, name, target_sets, target_reps, target_weight, sort_index"
      )
      .eq("workout_id", w.id)
      .order("sort_index", { ascending: true })

    if (exErr) throw exErr

    const exercises = ex || []
    const exerciseIds = exercises.map((e) => e.id)

    const setsByExerciseId = new Map<
      string,
      Array<{ setIndex: number; reps: number | null; weight: number | null; completed: boolean }>
    >()

    if (exerciseIds.length > 0) {
      const { data: sets, error: sErr } = await supabase
        .from("workout_sets")
        .select("workout_exercise_id, set_index, reps, weight, completed")
        .in("workout_exercise_id", exerciseIds)
        .order("set_index", { ascending: true })

      if (sErr) throw sErr

      ;(sets || []).forEach((s) => {
        const list = setsByExerciseId.get(s.workout_exercise_id) || []
        list.push({
          setIndex: s.set_index,
          reps: s.reps,
          weight: s.weight,
          completed: s.completed,
        })
        setsByExerciseId.set(s.workout_exercise_id, list)
      })
    }

    cloudWorkouts.push({
      id: w.id,
      name: w.name,
      date: w.performed_at,
      durationSeconds: w.duration_seconds,
      stats: w.stats || {},
      exercises: exercises.map((e: any) => ({
        id: e.exercise_id,
        name: e.name,
        targetSets: e.target_sets ?? undefined,
        targetReps: e.target_reps ?? undefined,
        targetWeight: e.target_weight ?? undefined,
        sets: setsByExerciseId.get(e.id) || [],
        completed: true,
      })),
    })
  }

  // Merge cloud into local (cloud wins by id)
  if (typeof window !== "undefined") {
    const local = getWorkoutHistory() as CompletedWorkout[]
    const byId = new Map<string, CompletedWorkout | WorkoutPayload>()
    local.forEach((w) => byId.set(w.id, w))
    cloudWorkouts.forEach((w) => byId.set(w.id, w))

    const merged = Array.from(byId.values()).sort((a, b) => {
      const ad = new Date(a.date || a.performed_at || 0).getTime()
      const bd = new Date(b.date || b.performed_at || 0).getTime()
      return bd - ad
    })

    localStorage.setItem("workout_history", JSON.stringify(merged))
  }

  return { success: true, message: `Pulled ${cloudWorkouts.length} workout(s)` }
}

export async function syncNow(options?: PushOptions) {
  const push = await pushLocalChangesToSupabase(options)
  const pull = await pullSupabaseToLocal()
  return { push, pull }
}

export function trySyncSoon() {
  if (typeof window === "undefined") return
  setTimeout(() => {
    pushLocalChangesToSupabase().catch((e) =>
      console.error("Background sync failed", e)
    )
  }, 0)
}
