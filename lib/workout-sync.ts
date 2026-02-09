import { supabase } from "@/lib/supabase"
import {
  getWorkoutDraft,
  listErroredWorkouts,
  listPendingWorkouts,
  markWorkoutError,
  markWorkoutPending,
  markWorkoutSynced,
  markWorkoutSyncing,
  type ActiveWorkoutDraft,
  type SyncState,
} from "@/lib/workout-draft-storage"

type SyncResult = {
  status: SyncState
  message?: string
  syncedAt?: string
}

const RETRY_BACKOFF_MS = [2000, 5000, 15000, 60000]
const attemptCounts = new Map<string, number>()
let listenerRegistered = false

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function postCommit(draft: ActiveWorkoutDraft, token: string) {
  const response = await fetch("/api/workouts/commit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
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
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    let message = `Commit failed (${response.status})`
    try {
      const payload = JSON.parse(text)
      message = payload?.error || payload?.message || message
    } catch {
      if (text) message = `${message}: ${text.slice(0, 160)}`
    }
    throw new Error(message)
  }

  return response.json().catch(() => ({}))
}

async function runAnalytics(workoutId: string, token: string) {
  try {
    await fetch(`/api/workouts/${workoutId}/complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
  } catch {
    // analytics failures should not block sync status
  }
}

function scheduleRetry(workoutId: string) {
  const attempts = attemptCounts.get(workoutId) ?? 0
  const delay = RETRY_BACKOFF_MS[Math.min(attempts, RETRY_BACKOFF_MS.length - 1)]
  window.setTimeout(() => {
    void attemptWorkoutSync({ workoutId })
  }, delay)
}

export async function attemptWorkoutSync(options?: {
  workoutId?: string
}): Promise<SyncResult> {
  const workoutId = options?.workoutId
  if (typeof window !== "undefined" && !navigator.onLine) {
    if (workoutId) {
      await markWorkoutPending(workoutId)
    }
    return { status: "pending", message: "Offline" }
  }

  const drafts: ActiveWorkoutDraft[] = []
  if (workoutId) {
    const draft = await getWorkoutDraft(workoutId)
    if (draft) drafts.push(draft)
  } else {
    const pending = await listPendingWorkouts()
    const errored = await listErroredWorkouts()
    drafts.push(...pending, ...errored)
  }

  if (drafts.length === 0) {
    return { status: "synced", message: "Nothing to sync" }
  }

  const token = await getAccessToken()
  if (!token) {
    if (workoutId) {
      await markWorkoutError(workoutId, "Missing auth session")
    }
    return { status: "error", message: "Missing auth session" }
  }

  for (const draft of drafts) {
    try {
      await markWorkoutSyncing(draft.workout_id)
      await postCommit(draft, token)
      await runAnalytics(draft.workout_id, token)
      await markWorkoutSynced(draft.workout_id)
      attemptCounts.delete(draft.workout_id)
      if (workoutId) {
        return { status: "synced", syncedAt: new Date().toISOString() }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed"
      const attempts = (attemptCounts.get(draft.workout_id) ?? 0) + 1
      attemptCounts.set(draft.workout_id, attempts)
      if (attempts >= RETRY_BACKOFF_MS.length) {
        await markWorkoutError(draft.workout_id, message)
        if (workoutId) {
          return { status: "error", message }
        }
      } else {
        await markWorkoutPending(draft.workout_id)
        if (typeof window !== "undefined") {
          scheduleRetry(draft.workout_id)
        }
        if (workoutId) {
          return { status: "pending", message }
        }
      }
    }
  }

  return { status: "synced" }
}

export function ensureWorkoutSync() {
  if (listenerRegistered || typeof window === "undefined") return
  listenerRegistered = true
  window.addEventListener("online", () => {
    void attemptWorkoutSync()
  })
  window.addEventListener("focus", () => {
    void attemptWorkoutSync()
  })
  void attemptWorkoutSync()
}
