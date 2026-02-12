"use client"

import { useParams, useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useState, useEffect, useMemo } from "react"
import { getWorkoutHistory, type CompletedWorkout } from "@/lib/workout-storage"
import { isSetEligibleForStats } from "@/lib/set-validation"
import { isWarmupExercise } from "@/lib/exercise-heuristics"

function normalizeExerciseName(name: string) {
  return name.toLowerCase().trim().replace(/\s+/g, " ")
}

function getMaxRepsAtWeight(sets: { weight?: number | null; reps?: number | null }[], weight: number) {
  return Math.max(
    ...sets.filter((s) => (s.weight ?? 0) === weight).map((s) => s.reps ?? 0),
    0
  )
}

function getWorkoutStats(workout: CompletedWorkout) {
  const exercises = workout.exercises ?? []
  const completedSets = exercises
    .flatMap((exercise) => exercise.sets ?? [])
    .filter((set) => isSetEligibleForStats(set)).length
  const totalVolume = exercises
    .flatMap((exercise) => exercise.sets ?? [])
    .filter((set) => isSetEligibleForStats(set))
    .reduce((sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0), 0)
  return {
    completedSets,
    totalVolume,
  }
}

export default function WorkoutDetailPage() {
  const params = useParams()
  const router = useRouter()
  const workoutId = params.id as string
  const [workout, setWorkout] = useState<CompletedWorkout | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const history = getWorkoutHistory()
    const found = history.find((w) => w.id === workoutId)
    setWorkout(found || null)
    setLoading(false)
  }, [workoutId])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  const performanceSummary = useMemo<{
    excludedSets: number
    improvedCount: number
    nonWarmupExerciseCount: number
    biggestJump: { name: string; delta: number } | null
  } | null>(() => {
    if (!workout) return null

    const history = getWorkoutHistory()
    const baselineWorkout = history
      .filter((w) => w.id !== workout.id && w.name === workout.name)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]

    const baselineByKey = new Map<string, CompletedWorkout["exercises"][number]>()
    baselineWorkout?.exercises?.forEach((ex) => {
      baselineByKey.set(normalizeExerciseName(ex.name), ex)
    })

    let excludedSets = 0
    let improvedCount = 0
    let warmupExerciseCount = 0
    let biggestJump: { name: string; delta: number } | null = null

    workout.exercises.forEach((exercise) => {
      const isWarmup = isWarmupExercise(exercise.name)
      if (isWarmup) warmupExerciseCount += 1

      const validSets = (exercise.sets ?? []).filter((set) =>
        isSetEligibleForStats({
          reps: set.reps,
          weight: set.weight,
          completed: set.completed,
          validationFlags: (set as any).validationFlags ?? undefined,
        })
      )
      const excluded = (exercise.sets ?? []).filter((set) => set.completed && !validSets.includes(set)).length
      excludedSets += excluded

      const volume = validSets.reduce((sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0), 0)

      const baseline = baselineByKey.get(normalizeExerciseName(exercise.name))
      const baselineValidSets = baseline
        ? baseline.sets.filter((set) =>
            isSetEligibleForStats({
              reps: set.reps,
              weight: set.weight,
              completed: set.completed,
              validationFlags: (set as any).validationFlags ?? undefined,
            })
          )
        : []
      const baselineVolume = baselineValidSets.reduce(
        (sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0),
        0
      )
      const baselineHasData = baselineValidSets.length > 0
      const volumeDelta = baselineHasData ? volume - baselineVolume : 0

      const maxWeight = Math.max(...validSets.map((s) => s.weight ?? 0), 0)
      const baselineMaxWeight = Math.max(...baselineValidSets.map((s) => s.weight ?? 0), 0)
      const weightPR = baselineHasData && !isWarmup && maxWeight >= baselineMaxWeight + 1

      const repsAtBestWeight = getMaxRepsAtWeight(validSets, maxWeight)
      const baselineWeightForReps = baselineValidSets.some((s) => (s.weight ?? 0) === maxWeight)
        ? maxWeight
        : baselineMaxWeight
      const baselineRepsAtWeight = getMaxRepsAtWeight(baselineValidSets, baselineWeightForReps)
      const repsPR = baselineHasData && !isWarmup && repsAtBestWeight >= baselineRepsAtWeight + 1

      const volumePR =
        baselineHasData && !isWarmup && baselineVolume > 0 && volume >= baselineVolume * 1.01

      const prCount = [weightPR, repsPR, volumePR].filter(Boolean).length
      const improved = !isWarmup && (prCount > 0 || volumeDelta > 0)
      if (improved) improvedCount += 1

      if (!isWarmup && baselineHasData && volumeDelta > 0) {
        if (!biggestJump || volumeDelta > biggestJump.delta) {
          biggestJump = { name: exercise.name, delta: volumeDelta }
        }
      }
    })

    return {
      excludedSets,
      improvedCount,
      nonWarmupExerciseCount: workout.exercises.length - warmupExerciseCount,
      biggestJump,
    }
  }, [workout])

  const safeStats = useMemo(() => {
    if (!workout) return { completedSets: 0, totalVolume: 0 }
    if (workout.stats?.totalVolume !== undefined && workout.stats?.completedSets !== undefined) {
      return {
        completedSets: workout.stats.completedSets,
        totalVolume: workout.stats.totalVolume,
      }
    }
    return getWorkoutStats(workout)
  }, [workout])

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20 flex items-center justify-center">
        <p className="text-muted-foreground">Loading workout...</p>
      </div>
    )
  }

  if (!workout) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Card className="p-8 text-center">
            <h2 className="text-lg font-semibold mb-2">Workout not found</h2>
            <p className="text-sm text-muted-foreground mb-4">This workout may have been deleted</p>
            <Button onClick={() => router.push("/history")}>Back to History</Button>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div
        className="sticky top-0 z-10"
        style={{ background: "rgba(10, 10, 12, 0.92)", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}
      >
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/history")}>
            <span className="text-xl">‹</span>
          </Button>
          <div>
            <p className="text-xs text-muted-foreground">Workout Summary</p>
            <h1 className="text-lg font-bold text-foreground">{workout.name}</h1>
            <p className="text-xs text-muted-foreground">{formatDate(workout.date)}</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Total Volume</div>
              <div className="text-3xl font-bold text-foreground tabular-nums">
                {(safeStats.totalVolume / 1000).toFixed(1)}k lbs
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Workout date</div>
              <div className="text-sm font-medium text-foreground">
                {new Date(workout.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground pt-2 border-t border-border">
            <div>
              <div className="text-lg font-semibold text-foreground">{safeStats.completedSets}</div>
              <div>Sets</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-foreground">{workout.exercises.length}</div>
              <div>Exercises</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-foreground">
                {Math.round(safeStats.totalVolume).toLocaleString()}
              </div>
              <div>lbs</div>
            </div>
          </div>
        </Card>

        {performanceSummary && (
          <Card className="p-4 space-y-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Performance</div>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-foreground bg-muted px-2 py-1 rounded-full">
                Improved on {performanceSummary.improvedCount}/{performanceSummary.nonWarmupExerciseCount} exercises
              </span>
              {performanceSummary.biggestJump && (
                <span className="text-xs text-foreground bg-muted px-2 py-1 rounded-full">
                  Biggest jump: {performanceSummary.biggestJump.name} +
                  {Math.round(performanceSummary.biggestJump.delta).toLocaleString()} lb
                </span>
              )}
              {performanceSummary.excludedSets > 0 && (
                <span className="text-xs text-amber-700 bg-amber-500/10 px-2 py-1 rounded-full">
                  ⚠️ {performanceSummary.excludedSets} sets excluded
                </span>
              )}
            </div>
          </Card>
        )}

        <div className="space-y-3">
          {workout.exercises.map((exercise, idx) => {
            const completedSets = (exercise.sets ?? []).filter((s) => isSetEligibleForStats(s))
            const maxWeight = Math.max(...completedSets.map((s) => s.weight ?? 0), 0)
            const totalVolume = completedSets.reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0)

            return (
              <Card key={idx} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <button
                      type="button"
                      onClick={() => router.push(`/exercise/${encodeURIComponent(exercise.name)}`)}
                      className="text-base font-semibold text-foreground hover:underline"
                    >
                      {exercise.name}
                    </button>
                    <p className="text-xs text-muted-foreground">
                      {completedSets.length}/{(exercise.sets ?? []).length} sets completed
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-foreground">{totalVolume.toLocaleString()} lbs</div>
                    <div className="text-xs text-muted-foreground">volume</div>
                  </div>
                </div>

                <div className="border border-border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Set</th>
                        <th className="text-center px-3 py-2 font-medium text-muted-foreground">Weight</th>
                        <th className="text-center px-3 py-2 font-medium text-muted-foreground">Reps</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Volume</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(exercise.sets ?? []).map((set, setIdx) => {
                        const isMaxWeight = set.completed && (set.weight ?? 0) === maxWeight
                        return (
                          <tr
                            key={setIdx}
                            className={`border-t border-border ${!set.completed ? "opacity-40" : ""} ${isMaxWeight ? "bg-primary/10" : ""}`}
                          >
                            <td className="px-3 py-2 text-foreground">{setIdx + 1}</td>
                            <td className="text-center px-3 py-2 font-medium text-foreground">
                              {set.completed && set.weight !== null && set.weight !== undefined ? `${set.weight} lbs` : "—"}
                            </td>
                            <td className="text-center px-3 py-2 font-medium text-foreground">
                              {set.completed && set.reps !== null && set.reps !== undefined ? set.reps : "—"}
                            </td>
                            <td className="text-right px-3 py-2 text-muted-foreground">
                              {set.completed && set.weight !== null && set.reps !== null
                                ? `${((set.weight ?? 0) * (set.reps ?? 0)).toLocaleString()} lbs`
                                : "—"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
