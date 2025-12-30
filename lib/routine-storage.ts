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

import { REAL_WORKOUTS } from "@/lib/real-routines"
import { GROWTH_V2_ROUTINES } from "@/lib/growth-v2-plan"
import { formatExerciseName } from "@/lib/format-exercise-name"

const ROUTINES_KEY = "workout_routines_v2"

export function getRoutines(): WorkoutRoutine[] {
  if (typeof window === "undefined") return REAL_WORKOUTS
  const stored = localStorage.getItem(ROUTINES_KEY)
  if (!stored) return REAL_WORKOUTS
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
    return REAL_WORKOUTS
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
