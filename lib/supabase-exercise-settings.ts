import { supabase } from "@/lib/supabase"

export interface ExerciseSettings {
  seat?: string
  barWeight?: number
  plateDisplayMode?: "per-side" | "total"
}

export async function loadExerciseSettings(
  userId: string,
  exerciseName: string
): Promise<ExerciseSettings | null> {
  const { data, error } = await supabase
    .from("user_exercise_settings")
    .select("seat, bar_weight, plate_display_mode")
    .eq("user_id", userId)
    .eq("exercise_name", exerciseName.toLowerCase().trim())
    .maybeSingle()

  if (error) {
    console.warn("[exercise-settings] load failed", error)
    return null
  }
  if (!data) return null

  return {
    seat: data.seat ?? undefined,
    barWeight: data.bar_weight ?? undefined,
    plateDisplayMode: (data.plate_display_mode as "per-side" | "total") ?? undefined,
  }
}

export async function saveExerciseSettings(
  userId: string,
  exerciseName: string,
  settings: ExerciseSettings
): Promise<void> {
  const { error } = await supabase.from("user_exercise_settings").upsert(
    {
      user_id: userId,
      exercise_name: exerciseName.toLowerCase().trim(),
      seat: settings.seat ?? null,
      bar_weight: settings.barWeight ?? null,
      plate_display_mode: settings.plateDisplayMode ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,exercise_name" }
  )

  if (error) {
    console.warn("[exercise-settings] save failed", error)
  }
}
