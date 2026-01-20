import { supabase } from "@/lib/supabase"

type WorkoutSessionRow = {
  id: string
  user_id: string
  status: "active" | "completed" | "abandoned" | "scheduled"
  started_at: string
  ended_at: string | null
  active_duration_seconds: number
  last_resumed_at: string | null
  paused_at: string | null
  updated_at: string
}

function uuid(): string {
  const c: Crypto | undefined = typeof globalThis !== "undefined" ? globalThis.crypto : undefined
  return c?.randomUUID ? c.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function requireUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data?.user?.id ?? null
}

export async function resolveMultipleActiveSessions(userId: string): Promise<WorkoutSessionRow | null> {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("started_at", { ascending: false })

  if (error) {
    console.warn("resolveMultipleActiveSessions failed", error)
    return null
  }
  if (!data || data.length === 0) return null
  if (data.length === 1) return data[0] as WorkoutSessionRow

  const [keep, ...rest] = data as WorkoutSessionRow[]
  const restIds = rest.map((s) => s.id)
  if (restIds.length > 0) {
    await supabase
      .from("workout_sessions")
      .update({ status: "abandoned", ended_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in("id", restIds)
      .eq("user_id", userId)
  }

  return keep
}

export async function getOrCreateActiveSession(): Promise<WorkoutSessionRow | null> {
  const userId = await requireUserId()
  if (!userId) return null

  const existing = await resolveMultipleActiveSessions(userId)
  if (existing) return existing

  const now = new Date().toISOString()
  const insertRow = {
    user_id: userId,
    status: "active",
    started_at: now,
    active_duration_seconds: 0,
    updated_at: now,
  }

  const { data, error } = await supabase
    .from("workout_sessions")
    .insert(insertRow)
    .select("*")
    .single()

  if (error) {
    console.warn("getOrCreateActiveSession insert failed", error)
    return null
  }

  return data as WorkoutSessionRow
}

export async function upsertSet(params: {
  sessionId: string
  setId?: string
  exerciseId: string
  setIndex: number
  reps: number | null
  weight: number | null
  completed: boolean
  validationFlags?: string[]
}): Promise<string | null> {
  const userId = await requireUserId()
  if (!userId) return null

  const setId = params.setId || uuid()
  const now = new Date().toISOString()

  const row = {
    id: setId,
    user_id: userId,
    session_id: params.sessionId,
    exercise_id: params.exerciseId,
    set_index: params.setIndex,
    reps: params.reps,
    weight: params.weight,
    completed: params.completed,
    validation_flags: params.validationFlags ?? null,
    updated_at: now,
  }

  const { error } = await supabase.from("workout_sets").upsert(row, { onConflict: "id" })
  if (error) {
    console.warn("upsertSet failed", error)
  }

  return setId
}
