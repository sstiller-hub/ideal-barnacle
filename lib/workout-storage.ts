export type WorkoutSet = {
  reps: number | null
  weight: number | null
  completed: boolean
  validationFlags?: string[]
  isOutlier?: boolean
  isIncomplete?: boolean
}

export type Exercise = {
  id: string
  name: string
  targetSets: number
  targetReps: string
  targetWeight?: string
  restTime: number
  completed: boolean
  sets: WorkoutSet[]
  previousPerformance?: {
    weight: number
    avgReps: number
    progress: string
  }
}

export type CompletedWorkout = {
  id: string
  name: string
  date: string
  duration?: number
  durationUnit?: "seconds" | "minutes"
  exercises: Exercise[]
  stats: {
    totalSets: number
    completedSets: number
    totalVolume: number
    totalReps: number
  }
}

const STORAGE_KEY = "workout_history"

import { evaluateWorkoutPRs } from "./pr-evaluation"
import { savePRs } from "./pr-storage"
import type { EvaluatedPR } from "./pr-types"
import { isSetEligibleForStats } from "./set-validation"
import { formatExerciseName } from "./format-exercise-name"

export function saveWorkout(workout: CompletedWorkout): EvaluatedPR[] {
  if (typeof window === "undefined") {
    console.warn("[v0] saveWorkout called during SSR, skipping")
    return []
  }

  const history = getWorkoutHistory()
  const normalizedWorkout =
    typeof workout.duration === "number"
      ? { ...workout, durationUnit: workout.durationUnit ?? "seconds" }
      : workout
  history.unshift(normalizedWorkout)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history))

  // Evaluate PRs for this workout
  const evaluatedPRs = evaluateWorkoutPRs(workout.id, workout.date, workout.exercises)

  // Save the PRs
  savePRs(evaluatedPRs)

  // Queue for cross-device sync (best-effort)
  import("@/lib/supabase-sync")
    .then(({ enqueueWorkoutForSync, trySyncSoon }) => {
      enqueueWorkoutForSync(workout)
      trySyncSoon()
    })
    .catch((e) => {
      // Ignore if supabase sync isn't available in this build
      console.warn("Sync enqueue failed", e)
    })

  return evaluatedPRs
}

export function getWorkoutHistory(): CompletedWorkout[] {
  if (typeof window === "undefined") return []
  const stored = localStorage.getItem(STORAGE_KEY)
  let history: CompletedWorkout[] = []
  if (stored) {
    try {
      history = JSON.parse(stored) as CompletedWorkout[]
    } catch {
      history = []
    }
  }
  let didMigrate = false

  const normalized = history.map((workout) => {
    if (
      workout.durationUnit === "minutes" &&
      typeof workout.duration === "number" &&
      workout.duration > 0
    ) {
      didMigrate = true
      return { ...workout, duration: workout.duration * 60, durationUnit: "seconds" }
    }
    return workout
  })

  if (didMigrate) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  }

  return normalized.map((workout) => ({
    ...workout,
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      name: formatExerciseName(exercise.name),
    })),
  }))
}

export function deleteWorkout(workoutId: string): void {
  if (typeof window === "undefined") return

  const history = getWorkoutHistory()
  const filtered = history.filter((w) => w.id !== workoutId)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
}

export function getExerciseHistory(exerciseName: string): CompletedWorkout[] {
  const history = getWorkoutHistory()
  return history.filter((workout) => workout.exercises.some((ex) => ex.name === exerciseName))
}

export function getLatestPerformance(exerciseName: string): Exercise | null {
  const exerciseHistory = getExerciseHistory(exerciseName)
  if (exerciseHistory.length === 0) return null

  const latestWorkout = exerciseHistory[0]
  const exercise = latestWorkout.exercises.find((ex) => ex.name === exerciseName)
  return exercise || null
}

export function calculateExerciseStats(exerciseName: string) {
  const history = getExerciseHistory(exerciseName).slice(0, 10)
  if (history.length === 0) return null

  const dataPoints = history.map((workout) => {
    const exercise = workout.exercises.find((ex) => ex.name === exerciseName)!
    const validSets = exercise.sets.filter((s) => isSetEligibleForStats(s))
    const maxWeight = validSets.length > 0 ? Math.max(...validSets.map((s) => s.weight ?? 0)) : 0
    const totalVolume = validSets.reduce((acc, set) => acc + (set.weight ?? 0) * (set.reps ?? 0), 0)
    return {
      date: workout.date,
      maxWeight,
      totalVolume,
    }
  })

  return dataPoints.reverse()
}

export function comparePerformance(
  exerciseName: string,
  currentWeight: number,
  currentReps: number,
): {
  status: "better" | "same" | "worse" | "first-time"
  message: string
  previousBest?: { weight: number; reps: number }
} {
  const latest = getLatestPerformance(exerciseName)

  if (!latest) {
    return {
      status: "first-time",
      message: "First time tracking this exercise",
    }
  }

  const completedSets = latest.sets.filter((s) => isSetEligibleForStats(s))
  if (completedSets.length === 0) {
    return {
      status: "first-time",
      message: "No previous data",
    }
  }

  // Calculate best previous performance (max weight × reps)
  const previousBest = completedSets.reduce((best, set) => {
    const volume = (set.weight ?? 0) * (set.reps ?? 0)
    const bestVolume = (best.weight ?? 0) * (best.reps ?? 0)
    return volume > bestVolume ? set : best
  }, completedSets[0])
  const previousBestNormalized = {
    weight: previousBest.weight ?? 0,
    reps: previousBest.reps ?? 0,
  }

  const currentVolume = currentWeight * currentReps
  const previousVolume = previousBestNormalized.weight * previousBestNormalized.reps

  if (currentWeight > previousBestNormalized.weight) {
    return {
      status: "better",
      message: `+${currentWeight - previousBestNormalized.weight} lbs from last time`,
      previousBest: previousBestNormalized,
    }
  }

  if (currentWeight === previousBestNormalized.weight && currentReps > previousBestNormalized.reps) {
    return {
      status: "better",
      message: `+${currentReps - previousBestNormalized.reps} reps from last time`,
      previousBest: previousBestNormalized,
    }
  }

  if (currentVolume > previousVolume) {
    return {
      status: "better",
      message: "Higher volume than last time",
      previousBest: previousBestNormalized,
    }
  }

  if (currentVolume === previousVolume) {
    return {
      status: "same",
      message: "Same as last time",
      previousBest: previousBestNormalized,
    }
  }

  return {
    status: "worse",
    message: "Lower than last time",
    previousBest: previousBestNormalized,
  }
}

export type PerformanceMetrics = {
  totalVolume: number
  totalReps: number
  maxWeight: number
  setCount: number
}

function normalizeExerciseName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ")
}

export function getMostRecentExercisePerformance(
  exerciseName: string,
  excludeSessionId?: string,
): PerformanceMetrics | null {
  const history = getWorkoutHistory()
  const normalizedName = normalizeExerciseName(exerciseName)

  for (const workout of history) {
    if (excludeSessionId && workout.id === excludeSessionId) continue

    const exercise = workout.exercises.find((ex) => normalizeExerciseName(ex.name) === normalizedName)

    if (exercise) {
      const validSets = exercise.sets.filter((s) => isSetEligibleForStats(s))
      if (validSets.length === 0) continue

      return {
        totalVolume: validSets.reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0),
        totalReps: validSets.reduce((sum, s) => sum + (s.reps ?? 0), 0),
        maxWeight: Math.max(...validSets.map((s) => s.weight ?? 0)),
        setCount: validSets.length,
      }
    }
  }

  return null
}

export function computeCurrentPerformance(sets: WorkoutSet[]): PerformanceMetrics {
  const validSets = sets.filter((s) => isSetEligibleForStats(s))

  return {
    totalVolume: validSets.reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0),
    totalReps: validSets.reduce((sum, s) => sum + (s.reps ?? 0), 0),
    maxWeight: validSets.length > 0 ? Math.max(...validSets.map((s) => s.weight ?? 0)) : 0,
    setCount: validSets.length,
  }
}

export function getMostRecentSetPerformance(
  exerciseName: string,
  setIndex: number,
  excludeSessionId?: string,
): { weight: number; reps: number } | null {
  const history = getWorkoutHistory()
  const normalizedName = normalizeExerciseName(exerciseName)

  for (const workout of history) {
    if (excludeSessionId && workout.id === excludeSessionId) continue

    const exercise = workout.exercises.find((ex) => normalizeExerciseName(ex.name) === normalizedName)

    if (exercise) {
      const validSets = exercise.sets.filter((s) => isSetEligibleForStats(s))
      if (validSets.length > 0) {
        const bestSet = validSets.reduce((best, current) => {
          const bestVolume = (best.weight ?? 0) * (best.reps ?? 0)
          const currentVolume = (current.weight ?? 0) * (current.reps ?? 0)
          return currentVolume >= bestVolume ? current : best
        }, validSets[0])
        return {
          weight: bestSet.weight ?? 0,
          reps: bestSet.reps ?? 0,
        }
      }
    }
  }

  return null
}
