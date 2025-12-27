import type { Exercise, WorkoutSet } from "./workout-storage"
import type { EvaluatedPR, PRMetric } from "./pr-types"
import { getPRByExerciseAndMetric } from "./pr-storage"
import { isSetEligibleForStats } from "./set-validation"

// Get the best set from an exercise for a given metric
function getBestSet(exercise: Exercise, metric: PRMetric): { set: WorkoutSet; setIndex: number; value: number } | null {
  const completedSets = exercise.sets
    .map((set, index) => ({ set, index }))
    .filter(({ set }) => isSetEligibleForStats(set))

  if (completedSets.length === 0) return null

  let bestSet = completedSets[0]
  let bestValue = 0

  switch (metric) {
    case "weight":
      // Find the set with the highest weight
      bestValue = completedSets.reduce((max, current) => {
        return (current.set.weight ?? 0) > max ? (current.set.weight ?? 0) : max
      }, 0)
      bestSet = completedSets.find(({ set }) => (set.weight ?? 0) === bestValue)!
      break

    case "reps":
      // Find the set with the most reps
      bestValue = completedSets.reduce((max, current) => {
        return (current.set.reps ?? 0) > max ? (current.set.reps ?? 0) : max
      }, 0)
      bestSet = completedSets.find(({ set }) => (set.reps ?? 0) === bestValue)!
      break

    case "volume":
      // Find the set with the highest volume (weight × reps)
      bestValue = completedSets.reduce((max, current) => {
        const volume = (current.set.weight ?? 0) * (current.set.reps ?? 0)
        return volume > max ? volume : max
      }, 0)
      bestSet = completedSets.find(({ set }) => (set.weight ?? 0) * (set.reps ?? 0) === bestValue)!
      break
  }

  return { set: bestSet.set, setIndex: bestSet.index, value: bestValue }
}

// Evaluate a single exercise for a specific metric
function evaluateExerciseMetric(
  exercise: Exercise,
  metric: PRMetric,
  workoutId: string,
  workoutDate: string,
): EvaluatedPR | null {
  const bestPerformance = getBestSet(exercise, metric)
  if (!bestPerformance) return null

  const { set, setIndex, value } = bestPerformance

  // Get existing PR for this exercise and metric
  const existingPR = getPRByExerciseAndMetric(exercise.id, metric)

  // Determine status
  let status: EvaluatedPR["status"]
  if (!existingPR) {
    status = "first_pr"
  } else if (value > existingPR.valueNumber) {
    status = "new_pr"
  } else if (value === existingPR.valueNumber) {
    status = "tied_pr"
  } else {
    // Not a PR, don't return anything
    return null
  }

  // Calculate the value based on metric
  let valueNumber: number
  let unit: string

  switch (metric) {
    case "weight":
      valueNumber = set.weight ?? 0
      unit = "lbs"
      break
    case "reps":
      valueNumber = set.reps ?? 0
      unit = "reps"
      break
    case "volume":
      valueNumber = (set.weight ?? 0) * (set.reps ?? 0)
      unit = "lbs"
      break
  }

  return {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    metric,
    status,
    previousRecord: existingPR,
    newRecord: {
      valueNumber,
      unit,
      achievedAt: workoutDate,
      context: {
        reps: set.reps ?? 0,
        weight: set.weight ?? 0,
        setIndex,
        workoutId,
      },
    },
  }
}

// Main function to evaluate all PRs for a workout
export function evaluateWorkoutPRs(workoutId: string, workoutDate: string, exercises: Exercise[]): EvaluatedPR[] {
  const evaluatedPRs: EvaluatedPR[] = []
  const metricsToCheck: PRMetric[] = ["weight", "reps", "volume"]

  for (const exercise of exercises) {
    // Only check exercises with completed sets
    const hasCompletedSets = exercise.sets.some((set) => isSetEligibleForStats(set))
    if (!hasCompletedSets) continue

    // Check each metric
    for (const metric of metricsToCheck) {
      const evaluation = evaluateExerciseMetric(exercise, metric, workoutId, workoutDate)
      if (evaluation) {
        evaluatedPRs.push(evaluation)
      }
    }
  }

  return evaluatedPRs
}

// Helper to format PR display text
export function formatPRText(pr: EvaluatedPR): string {
  const { exerciseName, metric, newRecord, status } = pr

  const metricLabel = metric === "weight" ? "Heaviest set" : metric === "reps" ? "Most reps" : "Best volume"

  const value =
    metric === "volume"
      ? `${newRecord.valueNumber.toLocaleString()} ${newRecord.unit}`
      : `${newRecord.valueNumber} ${newRecord.unit}`

  const statusText = status === "first_pr" ? "First PR" : status === "tied_pr" ? "Tied PR" : "New PR"

  return `${statusText}: ${exerciseName} - ${metricLabel} (${value})`
}
