import { openDB, type IDBPDatabase } from "idb"

export type SyncState = "draft" | "pending" | "syncing" | "synced" | "error"

export interface WorkoutSetDraft {
  set_id: string
  workout_id: string
  exercise_id: string
  exercise_name: string
  set_index: number
  reps: number | null
  weight: number | null
  notes?: string | null
  completed: boolean
  updated_at_client: number
}

export interface ActiveWorkoutDraft {
  workout_id: string
  user_id: string
  routine_id?: string | null
  routine_name?: string | null
  started_at: string
  completed_at?: string | null
  updated_at_client: number
  schema_version: number
  sync_state: SyncState
  last_sync_error?: string | null
  sets: WorkoutSetDraft[]
}

const DB_NAME = "akt-workout-drafts"
const DB_VERSION = 1
const WORKOUT_STORE = "workouts"

let dbPromise: Promise<IDBPDatabase> | null = null

function isBrowser() {
  return typeof window !== "undefined"
}

async function getDb() {
  if (!isBrowser()) return null
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(WORKOUT_STORE)) {
          const store = db.createObjectStore(WORKOUT_STORE, { keyPath: "workout_id" })
          store.createIndex("sync_state", "sync_state")
        }
      },
    })
  }
  return dbPromise
}

function nowClient() {
  return Date.now()
}

export async function createWorkoutDraft(payload: {
  workout_id: string
  user_id: string
  started_at: string
  routine_id?: string | null
  routine_name?: string | null
}): Promise<ActiveWorkoutDraft | null> {
  const db = await getDb()
  if (!db) return null

  const existing = await db.get(WORKOUT_STORE, payload.workout_id)
  if (existing) return existing as ActiveWorkoutDraft

  const draft: ActiveWorkoutDraft = {
    workout_id: payload.workout_id,
    user_id: payload.user_id,
    routine_id: payload.routine_id ?? null,
    routine_name: payload.routine_name ?? null,
    started_at: payload.started_at,
    completed_at: null,
    updated_at_client: nowClient(),
    schema_version: 1,
    sync_state: "draft",
    last_sync_error: null,
    sets: [],
  }

  await db.put(WORKOUT_STORE, draft)
  return draft
}

export async function getWorkoutDraft(workoutId: string): Promise<ActiveWorkoutDraft | null> {
  const db = await getDb()
  if (!db) return null
  const draft = await db.get(WORKOUT_STORE, workoutId)
  return (draft as ActiveWorkoutDraft) || null
}

export async function updateWorkoutDraft(
  workoutId: string,
  patch: Partial<ActiveWorkoutDraft>
): Promise<ActiveWorkoutDraft | null> {
  const db = await getDb()
  if (!db) return null
  const current = (await db.get(WORKOUT_STORE, workoutId)) as ActiveWorkoutDraft | undefined
  if (!current) return null
  const updated: ActiveWorkoutDraft = {
    ...current,
    ...patch,
    updated_at_client: patch.updated_at_client ?? nowClient(),
  }
  await db.put(WORKOUT_STORE, updated)
  return updated
}

export async function upsertSet(workoutId: string, setDraft: WorkoutSetDraft): Promise<void> {
  const db = await getDb()
  if (!db) return
  const current = (await db.get(WORKOUT_STORE, workoutId)) as ActiveWorkoutDraft | undefined
  if (!current) return

  const nextSet: WorkoutSetDraft = {
    ...setDraft,
    workout_id: workoutId,
    updated_at_client: setDraft.updated_at_client ?? nowClient(),
  }
  const sets = Array.isArray(current.sets) ? [...current.sets] : []
  const index = sets.findIndex((s) => s.set_id === nextSet.set_id)
  if (index >= 0) {
    sets[index] = { ...sets[index], ...nextSet }
  } else {
    sets.push(nextSet)
  }

  const updated: ActiveWorkoutDraft = {
    ...current,
    sets,
    updated_at_client: nowClient(),
  }
  await db.put(WORKOUT_STORE, updated)
}

export async function deleteSet(workoutId: string, setId: string): Promise<void> {
  const db = await getDb()
  if (!db) return
  const current = (await db.get(WORKOUT_STORE, workoutId)) as ActiveWorkoutDraft | undefined
  if (!current) return
  const sets = (current.sets || []).filter((set) => set.set_id !== setId)
  await db.put(WORKOUT_STORE, {
    ...current,
    sets,
    updated_at_client: nowClient(),
  })
}

export async function markWorkoutPending(workoutId: string): Promise<ActiveWorkoutDraft | null> {
  return updateWorkoutDraft(workoutId, {
    sync_state: "pending",
    last_sync_error: null,
  })
}

export async function markWorkoutSyncing(workoutId: string): Promise<ActiveWorkoutDraft | null> {
  return updateWorkoutDraft(workoutId, {
    sync_state: "syncing",
    last_sync_error: null,
  })
}

export async function markWorkoutSynced(workoutId: string): Promise<ActiveWorkoutDraft | null> {
  return updateWorkoutDraft(workoutId, {
    sync_state: "synced",
    last_sync_error: null,
  })
}

export async function markWorkoutError(
  workoutId: string,
  errorMessage: string
): Promise<ActiveWorkoutDraft | null> {
  return updateWorkoutDraft(workoutId, {
    sync_state: "error",
    last_sync_error: errorMessage,
  })
}

export async function listPendingWorkouts(): Promise<ActiveWorkoutDraft[]> {
  const db = await getDb()
  if (!db) return []
  const all = (await db.getAll(WORKOUT_STORE)) as ActiveWorkoutDraft[]
  return all.filter((draft) => draft.sync_state === "pending")
}

export async function listErroredWorkouts(): Promise<ActiveWorkoutDraft[]> {
  const db = await getDb()
  if (!db) return []
  const all = (await db.getAll(WORKOUT_STORE)) as ActiveWorkoutDraft[]
  return all.filter((draft) => draft.sync_state === "error")
}

export async function listAllWorkouts(): Promise<ActiveWorkoutDraft[]> {
  const db = await getDb()
  if (!db) return []
  return (await db.getAll(WORKOUT_STORE)) as ActiveWorkoutDraft[]
}
