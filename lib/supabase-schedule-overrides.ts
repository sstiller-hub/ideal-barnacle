import { supabase } from "@/lib/supabase"
import type { ScheduledWorkout } from "@/lib/schedule-storage"
import { deriveWorkoutType, type WorkoutType } from "@/lib/workout-type"

export type ScheduleOverrideResult = {
  workout: ScheduledWorkout | null
  isOverride: boolean
  workoutType: WorkoutType
}

function getDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

async function requireUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data?.user?.id ?? null
}

export async function getScheduleOverrideForDate(date: Date): Promise<ScheduleOverrideResult | undefined> {
  const userId = await requireUserId()
  if (!userId) return undefined

  const dateKey = getDateKey(date)
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("routine_id,routine_name,is_override,workout_type")
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .eq("scheduled_date", dateKey)
    .limit(1)
    .maybeSingle()

  if (error || !data) return undefined

  const workout = data.routine_id && data.routine_name
    ? { routineId: data.routine_id, routineName: data.routine_name }
    : null

  return {
    workout,
    isOverride: Boolean(data.is_override),
    workoutType: data.workout_type as WorkoutType || deriveWorkoutType(workout?.routineName),
  }
}

export async function setScheduleOverride(date: Date, workout: ScheduledWorkout | null): Promise<boolean> {
  const userId = await requireUserId()
  if (!userId) return false

  const dateKey = getDateKey(date)
  const now = new Date().toISOString()

  const row = {
    user_id: userId,
    status: "scheduled",
    scheduled_date: dateKey,
    routine_id: workout?.routineId ?? null,
    routine_name: workout?.routineName ?? null,
    is_override: true,
    workout_type: deriveWorkoutType(workout?.routineName),
    updated_at: now,
  }

  const { error } = await supabase
    .from("workout_sessions")
    .upsert(row, { onConflict: "user_id,scheduled_date,status" })

  if (error) {
    console.warn("setScheduleOverride failed", error)
    return false
  }

  return true
}

export async function clearScheduleOverride(date: Date): Promise<boolean> {
  const userId = await requireUserId()
  if (!userId) return false

  const dateKey = getDateKey(date)
  const { error } = await supabase
    .from("workout_sessions")
    .delete()
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .eq("scheduled_date", dateKey)

  if (error) {
    console.warn("clearScheduleOverride failed", error)
    return false
  }

  return true
}
