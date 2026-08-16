import type { CompletedWorkout } from "./workout-storage"
import { isStatInvalid, isValidNumber } from "./set-validation"
import { isWarmupExercise } from "./exercise-heuristics"
import { plural } from "./utils"

/**
 * Read-only projection of a completed workout, shaped for hand-entry into
 * Whoop's Strength Trainer (exercise first, then set by set).
 *
 * Set inclusion here is deliberately looser than isSetEligibleForStats: a set
 * that was performed but got flagged as an outlier still happened, so it still
 * belongs in Whoop. Flagged sets are marked, never dropped.
 */

export type TranscriptionSet = {
  /** Stable across reloads — checked-off progress is keyed on this. */
  id: string
  weight: number
  reps: number
  flagged: boolean
}

export type TranscriptionExercise = {
  index: number
  aktName: string
  /** Mapped Whoop library name, or null when it hasn't been mapped yet. */
  whoopName: string | null
  isWarmup: boolean
  sets: TranscriptionSet[]
}

export type TranscriptionPlan = {
  workoutId: string
  workoutName: string
  performedAt: string
  /** Warm-ups included; callers filter for display. */
  exercises: TranscriptionExercise[]
  totalSets: number
}

export type AliasMap = Record<string, string>

export function normalizeExerciseName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ")
}

export function buildTranscriptionPlan(
  workout: CompletedWorkout,
  aliases: AliasMap = {},
): TranscriptionPlan {
  let totalSets = 0

  const exercises = (workout.exercises ?? []).map((exercise, exerciseIndex) => {
    const sets: TranscriptionSet[] = []

    ;(exercise.sets ?? []).forEach((set, setIndex) => {
      if (!set.completed) return
      if (!isValidNumber(set.reps) || !isValidNumber(set.weight)) return
      sets.push({
        id: `${exerciseIndex}-${setIndex}`,
        weight: set.weight,
        reps: set.reps,
        flagged: Boolean(set.validationFlags && isStatInvalid(set.validationFlags)),
      })
    })

    totalSets += sets.length

    return {
      index: exerciseIndex,
      aktName: exercise.name,
      whoopName: aliases[normalizeExerciseName(exercise.name)] ?? null,
      isWarmup: isWarmupExercise(exercise.name),
      sets,
    }
  })

  return {
    workoutId: workout.id,
    workoutName: workout.name,
    performedAt: workout.startedAt ?? workout.date,
    exercises,
    totalSets,
  }
}

/**
 * Exercises worth showing: anything with sets to enter, minus warm-ups unless
 * asked for. Warm-ups are whole exercises in Akt, not per-set flags.
 */
export function visibleExercises(
  plan: TranscriptionPlan,
  showWarmups: boolean,
): TranscriptionExercise[] {
  return plan.exercises.filter(
    (exercise) => exercise.sets.length > 0 && (showWarmups || !exercise.isWarmup),
  )
}

export function countVisibleSets(exercises: TranscriptionExercise[]): number {
  return exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)
}

export function formatExerciseAsText(exercise: TranscriptionExercise): string {
  const lines = [exercise.whoopName ?? exercise.aktName]
  exercise.sets.forEach((set, i) => {
    lines.push(`  Set ${i + 1}: ${set.weight} ${plural(set.weight, "lb", "lbs")} × ${set.reps}`)
  })
  return lines.join("\n")
}
