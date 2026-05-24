import { supabase } from "@/lib/supabase"
import { getWorkoutHistory, type CompletedWorkout, type ExerciseRating } from "@/lib/workout-storage"
import {
  listAllWorkouts,
  markWorkoutError,
  markWorkoutSynced,
  type ActiveWorkoutDraft,
  type WorkoutSetDraft,
} from "@/lib/workout-draft-storage"

type ManualSyncStatus = "synced" | "skipped" | "conflict" | "error" | "dry_run"

export type ManualSyncItemResult = {
  workout_id: string
  started_at: string | null
  completed_at: string | null
  status: ManualSyncStatus
  message?: string
  error?: string
}

export type ManualSyncReport = {
  startedAt: string
  finishedAt: string
  dryRun: boolean
  total: number
  attempted: number
  synced: number
  skipped: number
  conflicts: number
  errors: number
  results: ManualSyncItemResult[]
}

type ManualSyncOptions = {
  dryRun?: boolean
  includeSynced?: boolean
  forceOverwrite?: boolean
  retryFailedOnly?: boolean
  includeCompletedHistory?: boolean
  onProgress?: (payload: {
    current: number
    total: number
    currentWorkoutId?: string
    synced: number
    skipped: number
    conflicts: number
    errors: number
  }) => void
}

const ID_MAP_KEY = "manual_sync_id_map_v1"

type ManualIdMap = {
  workouts: Record<string, string>
  sets: Record<string, Record<string, string>>
}

type ServerMeta = {
  id: string
  updated_at: string | null
  completed_at: string | null
}

function loadIdMap(): ManualIdMap {
  if (typeof window === "undefined") return { workouts: {}, sets: {} }
  const raw = localStorage.getItem(ID_MAP_KEY)
  if (!raw) return { workouts: {}, sets: {} }
  try {
    return JSON.parse(raw) as ManualIdMap
  } catch {
    return { workouts: {}, sets: {} }
  }
}

function saveIdMap(map: ManualIdMap) {
  if (typeof window === "undefined") return
  localStorage.setItem(ID_MAP_KEY, JSON.stringify(map))
}

function uuid() {
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

function ensureWorkoutUuid(workoutId: string, map: ManualIdMap): string {
  if (isUuid(workoutId)) return workoutId
  if (map.workouts[workoutId]) return map.workouts[workoutId]
  const newId = uuid()
  map.workouts[workoutId] = newId
  saveIdMap(map)
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("workout_history")
    if (stored) {
      try {
        const history = JSON.parse(stored) as CompletedWorkout[]
        const idx = history.findIndex((w) => w.id === workoutId)
        if (idx >= 0) {
          history[idx] = { ...history[idx], id: newId }
          localStorage.setItem("workout_history", JSON.stringify(history))
        }
      } catch {
        // ignore local history update errors
      }
    }
  }
  return newId
}

function ensureSetUuid(
  workoutId: string,
  setKey: string,
  map: ManualIdMap
): string {
  if (!map.sets[workoutId]) {
    map.sets[workoutId] = {}
  }
  const existing = map.sets[workoutId][setKey]
  if (existing) return existing
  const newId = uuid()
  map.sets[workoutId][setKey] = newId
  saveIdMap(map)
  return newId
}

async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function fetchServerMeta(ids: string[], token: string): Promise<ServerMeta[]> {
  if (ids.length === 0) return []
  const params = new URLSearchParams()
  params.set("ids", ids.join(","))
  const response = await fetch(`/api/workouts/meta?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!response.ok) {
    return []
  }
  const payload = await response.json().catch(() => ({ data: [] }))
  return (payload?.data || []) as ServerMeta[]
}

function asPayloadFromDraft(draft: ActiveWorkoutDraft) {
  return {
    workout: {
      workout_id: draft.workout_id,
      started_at: draft.started_at,
      completed_at: draft.completed_at ?? null,
      routine_id: draft.routine_id ?? null,
      routine_name: draft.routine_name ?? null,
      updated_at_client: draft.updated_at_client,
      schema_version: draft.schema_version,
    },
    sets: draft.sets,
    exercises: draft.exercise_ratings
      ? Object.entries(draft.exercise_ratings).map(([exercise_id, rating]) => ({
          exercise_id,
          rating,
        }))
      : undefined,
  }
}

function asPayloadFromCompleted(
  workout: CompletedWorkout,
  map: ManualIdMap
): { workout: any; sets: WorkoutSetDraft[]; exercises: Array<{ exercise_id: string; rating: ExerciseRating }> } {
  const resolvedWorkoutId = ensureWorkoutUuid(workout.id, map)
  const coerceToDatetime = (value: string): string => {
    if (!value) return value
    // Plain calendar date (YYYY-MM-DD) → midnight UTC.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00.000Z`
    // Normalize anything parseable (ISO with Z or offset, "YYYY-MM-DD HH:mm:ss",
    // US m/d/Y, etc.) to a strict UTC instant the commit validator accepts.
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
    const reparsed = new Date(value.includes(" ") ? value.replace(" ", "T") : value)
    if (!Number.isNaN(reparsed.getTime())) return reparsed.toISOString()
    return value
  }
  const startedAt = coerceToDatetime(workout.startedAt ?? workout.date)
  const completedAt = coerceToDatetime(workout.endedAt ?? workout.date)
  const updatedAtClient = Date.parse(completedAt) || Date.now()

  const sets: WorkoutSetDraft[] = []
  const exercises: Array<{ exercise_id: string; rating: ExerciseRating }> = []
  workout.exercises.forEach((exercise) => {
    const exerciseId = exercise.id || exercise.name
    exercises.push({ exercise_id: exerciseId, rating: exercise.rating ?? null })
    exercise.sets.forEach((set, index) => {
      const setKey = `${exerciseId}::${index}`
      const setId = ensureSetUuid(resolvedWorkoutId, setKey, map)
      sets.push({
        set_id: setId,
        workout_id: resolvedWorkoutId,
        exercise_id: exerciseId,
        exercise_name: exercise.name,
        set_index: index,
        reps: set.reps ?? null,
        weight: set.weight ?? null,
        completed: Boolean(set.completed),
        updated_at_client: updatedAtClient,
      })
    })
  })

  return {
    workout: {
      workout_id: resolvedWorkoutId,
      started_at: startedAt,
      completed_at: completedAt,
      routine_id: null,
      routine_name: workout.name,
      updated_at_client: updatedAtClient,
      schema_version: 1,
    },
    sets,
    exercises,
  }
}

function getLocalUpdatedAt(payload: { workout: any }): number {
  const updated = payload.workout.updated_at_client
  if (typeof updated === "number") return updated
  const completedAt = payload.workout.completed_at
  const startedAt = payload.workout.started_at
  const candidate = completedAt || startedAt
  const parsed = candidate ? Date.parse(candidate) : NaN
  return Number.isFinite(parsed) ? parsed : Date.now()
}

function getServerUpdatedAt(server?: ServerMeta): number | null {
  if (!server) return null
  const candidate = server.updated_at || server.completed_at
  if (!candidate) return null
  const parsed = Date.parse(candidate)
  return Number.isFinite(parsed) ? parsed : null
}

async function commitPayload(payload: { workout: any; sets: WorkoutSetDraft[] }, token: string) {
  const maxAttempts = 6
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch("/api/workouts/commit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })

    // The commit endpoint is rate limited per user; bulk syncs hit it quickly.
    // Respect Retry-After and back off instead of failing the workout.
    if (response.status === 429 && attempt < maxAttempts) {
      const retryAfter = Number(response.headers.get("Retry-After"))
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(2000 * attempt, 15000)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
      continue
    }

    if (!response.ok) {
      const text = await response.text()
      let message = `Commit failed (${response.status})`
      try {
        const error = JSON.parse(text)
        message = error?.error || error?.message || message
      } catch {
        if (text) message = `${message}: ${text.slice(0, 160)}`
      }
      throw new Error(message)
    }
    return response.json().catch(() => ({}))
  }
}

export async function runManualSync(options: ManualSyncOptions = {}): Promise<ManualSyncReport> {
  const startedAt = new Date().toISOString()
  const {
    dryRun = false,
    includeSynced = false,
    forceOverwrite = false,
    retryFailedOnly = false,
    includeCompletedHistory = true,
    onProgress,
  } = options

  const token = await getAccessToken()
  if (!token) {
    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      dryRun,
      total: 0,
      attempted: 0,
      synced: 0,
      skipped: 0,
      conflicts: 0,
      errors: 1,
      results: [
        {
          workout_id: "unknown",
          started_at: null,
          completed_at: null,
          status: "error",
          error: "You must be signed in to sync.",
        },
      ],
    }
  }

  const drafts = await listAllWorkouts()
  const draftMap = new Map<string, ActiveWorkoutDraft>()
  drafts.forEach((draft) => {
    if (draft.sets.length === 0) return
    if (retryFailedOnly && draft.sync_state !== "error" && draft.sync_state !== "pending") {
      return
    }
    if (!includeSynced && draft.sync_state === "synced") {
      return
    }
    draftMap.set(draft.workout_id, draft)
  })

  const map = loadIdMap()
  const completedHistory = includeCompletedHistory ? getWorkoutHistory() : []
  const completedPayloads = completedHistory
    .map((workout) => asPayloadFromCompleted(workout, map))
    .filter((payload) => payload.sets.length > 0)

  const payloadById = new Map<string, { payload: any; draft?: ActiveWorkoutDraft }>()
  for (const draft of draftMap.values()) {
    payloadById.set(draft.workout_id, { payload: asPayloadFromDraft(draft), draft })
  }
  completedPayloads.forEach((payload) => {
    if (!payloadById.has(payload.workout.workout_id)) {
      payloadById.set(payload.workout.workout_id, { payload })
    }
  })

  const payloads = Array.from(payloadById.values())
  const ids = payloads.map((entry) => entry.payload.workout.workout_id)
  const serverMetaList = await fetchServerMeta(ids, token)
  const serverMetaMap = new Map(serverMetaList.map((meta) => [meta.id, meta]))

  let synced = 0
  let skipped = 0
  let conflicts = 0
  let errors = 0
  const results: ManualSyncItemResult[] = []

  for (let i = 0; i < payloads.length; i += 1) {
    const { payload, draft } = payloads[i]
    const workoutId = payload.workout.workout_id
    const serverMeta = serverMetaMap.get(workoutId)
    const localUpdated = getLocalUpdatedAt(payload)
    const serverUpdated = getServerUpdatedAt(serverMeta)
    const localCompletedAt = payload.workout.completed_at ?? null
    const serverCompletedAt = serverMeta?.completed_at ?? null

    onProgress?.({
      current: i + 1,
      total: payloads.length,
      currentWorkoutId: workoutId,
      synced,
      skipped,
      conflicts,
      errors,
    })

    const shouldForceCompletedOverwrite = Boolean(localCompletedAt) && !serverCompletedAt

    if (serverUpdated !== null && serverUpdated >= localUpdated && !forceOverwrite && !shouldForceCompletedOverwrite) {
      conflicts += 1
      results.push({
        workout_id: workoutId,
        started_at: payload.workout.started_at ?? null,
        completed_at: payload.workout.completed_at ?? null,
        status: "conflict",
        message: "Skipped because server version is newer.",
      })
      continue
    }

    if (dryRun) {
      skipped += 1
      results.push({
        workout_id: workoutId,
        started_at: payload.workout.started_at ?? null,
        completed_at: payload.workout.completed_at ?? null,
        status: "dry_run",
        message: "Dry run only. No data sent.",
      })
      continue
    }

    try {
      await commitPayload(payload, token)
      if (draft) {
        await markWorkoutSynced(draft.workout_id)
      }
      synced += 1
      results.push({
        workout_id: workoutId,
        started_at: payload.workout.started_at ?? null,
        completed_at: payload.workout.completed_at ?? null,
        status: "synced",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed"
      if (draft) {
        await markWorkoutError(draft.workout_id, message)
      }
      errors += 1
      results.push({
        workout_id: workoutId,
        started_at: payload.workout.started_at ?? null,
        completed_at: payload.workout.completed_at ?? null,
        status: "error",
        error: message,
      })
    }
  }

  const finishedAt = new Date().toISOString()
  return {
    startedAt,
    finishedAt,
    dryRun,
    total: payloads.length,
    attempted: payloads.length,
    synced,
    skipped,
    conflicts,
    errors,
    results,
  }
}
