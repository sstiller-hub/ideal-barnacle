export type WorkoutRoutine = {
  id: string
  name: string
  description: string
  exercises: RoutineExercise[]
  estimatedTime: string
  category: string
  createdAt: string
  updatedAt: string
}

export type RoutineExercise = {
  id: string
  name: string
  type: "strength" | "cardio" | "other"
  targetSets?: number
  targetReps?: string // e.g. "8-10"
  targetWeight?: number
  notes?: string
}

import { GROWTH_V2_ROUTINES } from "@/lib/growth-v2-plan"
import { runGrowthV2TemplateMigration } from "@/lib/growth-v2-template-migration"
import { formatExerciseName } from "@/lib/format-exercise-name"

const ROUTINES_KEY = "workout_routines_v2"

// With nothing stored yet, the current program is the routine library. The
// old REAL_WORKOUTS fallback listed the pre-Growth-V2 templates, so on a fresh
// install (or after storage was cleared) the home picker offered the legacy
// routines with their old exercise lists while the schedule itself resolved to
// Growth V2 through a separate hard-coded fallback.
export function getRoutines(): WorkoutRoutine[] {
  if (typeof window === "undefined") return GROWTH_V2_ROUTINES
  // Runs on the read path rather than only at app start, so a deep link
  // straight into a session gets the current template too. Self-guarded by a
  // localStorage key, so it costs one getItem after the first run.
  runGrowthV2TemplateMigration()
  const stored = localStorage.getItem(ROUTINES_KEY)
  if (!stored) return GROWTH_V2_ROUTINES
  try {
    const routines = JSON.parse(stored) as WorkoutRoutine[]
    return routines.map((routine) => ({
      ...routine,
      exercises: routine.exercises.map((exercise) => ({
        ...exercise,
        name: formatExerciseName(exercise.name),
      })),
    }))
  } catch {
    return GROWTH_V2_ROUTINES
  }
}

export function saveRoutine(routine: WorkoutRoutine): void {
  const routines = getRoutines()
  const index = routines.findIndex((r) => r.id === routine.id)
  if (index >= 0) {
    routines[index] = { ...routine, updatedAt: new Date().toISOString() }
  } else {
    routines.push(routine)
  }
  localStorage.setItem(ROUTINES_KEY, JSON.stringify(routines))
}

export function deleteRoutine(id: string): void {
  const routines = getRoutines().filter((r) => r.id !== id)
  localStorage.setItem(ROUTINES_KEY, JSON.stringify(routines))
}

export function getRoutineById(id: string): WorkoutRoutine | null {
  return getRoutines().find((r) => r.id === id) || null
}

export function resetRoutinesToGrowthV2(): void {
  if (typeof window === "undefined") return
  localStorage.setItem(ROUTINES_KEY, JSON.stringify(GROWTH_V2_ROUTINES))
}
