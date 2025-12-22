export type WorkoutSet = {
  reps: number
  weight: number
  completed: boolean
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
  duration: number
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

export function saveWorkout(workout: CompletedWorkout): EvaluatedPR[] {
  if (typeof window === "undefined") {
    console.warn("[v0] saveWorkout called during SSR, skipping")
    return []
  }

  const history = getWorkoutHistory()
  history.unshift(workout)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history))

  // Evaluate PRs for this workout
  const evaluatedPRs = evaluateWorkoutPRs(workout.id, workout.date, workout.exercises)

  // Save the PRs
  savePRs(evaluatedPRs)

  return evaluatedPRs
}

export function getWorkoutHistory(): CompletedWorkout[] {
  if (typeof window === "undefined") return []
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored ? JSON.parse(stored) : []
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
    const maxWeight = Math.max(...exercise.sets.filter((s) => s.completed).map((s) => s.weight))
    const totalVolume = exercise.sets.filter((s) => s.completed).reduce((acc, set) => acc + set.weight * set.reps, 0)
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

  const completedSets = latest.sets.filter((s) => s.completed)
  if (completedSets.length === 0) {
    return {
      status: "first-time",
      message: "No previous data",
    }
  }

  // Calculate best previous performance (max weight × reps)
  const previousBest = completedSets.reduce((best, set) => {
    const volume = set.weight * set.reps
    const bestVolume = best.weight * best.reps
    return volume > bestVolume ? set : best
  }, completedSets[0])

  const currentVolume = currentWeight * currentReps
  const previousVolume = previousBest.weight * previousBest.reps

  if (currentWeight > previousBest.weight) {
    return {
      status: "better",
      message: `+${currentWeight - previousBest.weight} lbs from last time`,
      previousBest,
    }
  }

  if (currentWeight === previousBest.weight && currentReps > previousBest.reps) {
    return {
      status: "better",
      message: `+${currentReps - previousBest.reps} reps from last time`,
      previousBest,
    }
  }

  if (currentVolume > previousVolume) {
    return {
      status: "better",
      message: "Higher volume than last time",
      previousBest,
    }
  }

  if (currentVolume === previousVolume) {
    return {
      status: "same",
      message: "Same as last time",
      previousBest,
    }
  }

  return {
    status: "worse",
    message: "Lower than last time",
    previousBest,
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
      const validSets = exercise.sets.filter((s) => s.completed && s.reps > 0)
      if (validSets.length === 0) continue

      return {
        totalVolume: validSets.reduce((sum, s) => sum + (s.weight || 0) * s.reps, 0),
        totalReps: validSets.reduce((sum, s) => sum + s.reps, 0),
        maxWeight: Math.max(...validSets.map((s) => s.weight || 0)),
        setCount: validSets.length,
      }
    }
  }

  return null
}

export function computeCurrentPerformance(sets: WorkoutSet[]): PerformanceMetrics {
  const validSets = sets.filter((s) => s.completed && s.reps > 0)

  return {
    totalVolume: validSets.reduce((sum, s) => sum + (s.weight || 0) * s.reps, 0),
    totalReps: validSets.reduce((sum, s) => sum + s.reps, 0),
    maxWeight: validSets.length > 0 ? Math.max(...validSets.map((s) => s.weight || 0)) : 0,
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
      const validSets = exercise.sets.filter((s) => s.completed && s.reps > 0)
      if (validSets.length > setIndex) {
        return {
          weight: validSets[setIndex].weight || 0,
          reps: validSets[setIndex].reps,
        }
      }
    }
  }

  return null
}
