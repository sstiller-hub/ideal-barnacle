import type { Exercise } from "@/lib/workout-storage"
import { getMostRecentSetPerformance } from "@/lib/workout-storage"

export type SetProgression = "progressed" | "matched" | "regressed"

export function analyzeSetProgression(
  exerciseName: string,
  setIndex: number,
  currentWeight: number,
  currentReps: number,
  sessionId: string,
): SetProgression {
  const lastPerf = getMostRecentSetPerformance(exerciseName, setIndex, sessionId)

  if (!lastPerf) return "progressed"

  const currentVolume = currentWeight * currentReps
  const lastVolume = lastPerf.weight * lastPerf.reps

  const weightIncreased = currentWeight > lastPerf.weight
  const repsIncreased = currentReps > lastPerf.reps

  // Progressed if weight increased OR reps increased (or both)
  if (weightIncreased || repsIncreased) return "progressed"

  // Matched if volume is equal
  if (currentVolume === lastVolume) return "matched"

  // Otherwise regressed
  return "regressed"
}

export function getWorkoutProgressionSummary(exercises: Exercise[], sessionId: string) {
  let progressedSets = 0
  let matchedSets = 0
  let regressedSets = 0
  const biggestWins: Array<{ exerciseName: string; improvement: string }> = []

  exercises.forEach((exercise) => {
    const completedSets = exercise.sets.filter((s) => s.completed && s.reps > 0)

    completedSets.forEach((set, idx) => {
      const status = analyzeSetProgression(exercise.name, idx, set.weight, set.reps, sessionId)

      if (status === "progressed") progressedSets++
      else if (status === "matched") matchedSets++
      else regressedSets++

      const lastPerf = getMostRecentSetPerformance(exercise.name, idx, sessionId)
      if (lastPerf && status === "progressed") {
        const weightDiff = set.weight - lastPerf.weight
        const repsDiff = set.reps - lastPerf.reps

        if (weightDiff >= 10 || repsDiff >= 3) {
          let improvement = ""
          if (weightDiff > 0) improvement = `+${weightDiff} lb`
          if (repsDiff > 0) improvement = improvement ? `${improvement}, +${repsDiff} reps` : `+${repsDiff} reps`

          biggestWins.push({
            exerciseName: exercise.name,
            improvement,
          })
        }
      }
    })
  })

  const totalSets = progressedSets + matchedSets + regressedSets

  let overallStatus: "progressed" | "maintained" | "recovery"
  if (progressedSets > totalSets / 2) {
    overallStatus = "progressed"
  } else if (regressedSets > totalSets / 2) {
    overallStatus = "recovery"
  } else {
    overallStatus = "maintained"
  }

  return {
    progressedSets,
    matchedSets,
    regressedSets,
    totalSets,
    overallStatus,
    biggestWins: biggestWins.slice(0, 3),
  }
}
