"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { getWorkoutHistory, type CompletedWorkout } from "@/lib/workout-storage"
import { isSetEligibleForStats } from "@/lib/set-validation"
import { isWarmupExercise } from "@/lib/exercise-heuristics"

type WorkoutRow = {
  id: string
  name: string
  performed_at?: string
  date?: string
  routine_id?: string | null
  routineId?: string | null
}

type WorkoutExerciseRow = {
  id: string
  workout_id: string
  exercise_id: string
  name: string
  sort_index: number
}

type WorkoutSetRow = {
  id: string
  workout_exercise_id: string
  set_index: number
  reps: number | null
  weight: number | null
  completed: boolean
  validation_flags?: string[] | null
}

type SummaryExercise = WorkoutExerciseRow & {
  sets: WorkoutSetRow[]
}

function toPerformedAt(workout: WorkoutRow) {
  return workout.performed_at || workout.date || new Date().toISOString()
}

function getBestSet(sets: WorkoutSetRow[]) {
  return sets.reduce(
    (best, set) => {
      const volume = (set.weight ?? 0) * (set.reps ?? 0)
      const bestVolume = (best.weight ?? 0) * (best.reps ?? 0)
      if (volume > bestVolume) return set
      if (volume === bestVolume) {
        if ((set.weight ?? 0) > (best.weight ?? 0)) return set
        if ((set.weight ?? 0) === (best.weight ?? 0) && (set.reps ?? 0) > (best.reps ?? 0)) return set
      }
      return best
    },
    sets[0],
  )
}

function getMaxRepsAtWeight(sets: WorkoutSetRow[], weight: number) {
  return Math.max(
    ...sets.filter((s) => (s.weight ?? 0) === weight).map((s) => s.reps ?? 0),
    0,
  )
}

function normalizeExerciseName(name: string) {
  return name.toLowerCase().trim().replace(/\s+/g, " ")
}

export default function WorkoutSummaryPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const workoutId = searchParams.get("workoutId") ?? searchParams.get("id")

  const [workout, setWorkout] = useState<WorkoutRow | null>(null)
  const [exercises, setExercises] = useState<SummaryExercise[]>([])
  const [baselineExercises, setBaselineExercises] = useState<SummaryExercise[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const buildSummaryExercises = (workoutRecord: CompletedWorkout): SummaryExercise[] => {
    return workoutRecord.exercises.map((exercise, idx) => {
      const workoutExerciseId = `${workoutRecord.id}-${idx}`
      return {
        id: workoutExerciseId,
        workout_id: workoutRecord.id,
        exercise_id: exercise.id || exercise.name,
        name: exercise.name,
        sort_index: idx,
        sets: exercise.sets.map((set, setIndex) => ({
          id: `${workoutExerciseId}-${setIndex}`,
          workout_exercise_id: workoutExerciseId,
          set_index: setIndex,
          reps: set.reps ?? null,
          weight: set.weight ?? null,
          completed: set.completed,
          validation_flags: set.validationFlags ?? undefined,
        })),
      }
    })
  }

  useEffect(() => {
    if (!workoutId) {
      router.push("/")
      return
    }

    let cancelled = false
    const maxAttempts = 5

    const loadSummary = (attempt: number) => {
      const history = getWorkoutHistory()
      const workoutRecord = history.find((w) => w.id === workoutId) || null

      if (!workoutRecord) {
        if (attempt < maxAttempts - 1) {
          setTimeout(() => {
            if (!cancelled) loadSummary(attempt + 1)
          }, 250)
          return
        }
        if (!cancelled) {
          setLoading(false)
          setNotFound(true)
        }
        return
      }

      const workoutRow: WorkoutRow = {
        id: workoutRecord.id,
        name: workoutRecord.name,
        performed_at: workoutRecord.date,
        date: workoutRecord.date,
      }

      const assembledExercises = buildSummaryExercises(workoutRecord)
      const baselineWorkout = history
        .filter((w) => w.id !== workoutRecord.id && w.name === workoutRecord.name)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]

      setWorkout(workoutRow)
      setExercises(assembledExercises)
      setBaselineExercises(baselineWorkout ? buildSummaryExercises(baselineWorkout) : null)
      setLoading(false)
      setNotFound(false)
    }

    loadSummary(0)

    return () => {
      cancelled = true
    }
  }, [router, workoutId])

  const summary = useMemo<{
    totalVolume: number
    totalValidSets: number
    excludedSets: number
    exercisesCount: number
    prCount: number
    improvedCount: number
    warmupExerciseCount: number
    nonWarmupExerciseCount: number
    biggestJump: { name: string; delta: number } | null
    exerciseSummaries: {
      exercise: SummaryExercise
      volume: number
      volumeDelta: number
      bestSet: WorkoutSetRow | null
      excluded: number
      prBadges: string[]
      improved: boolean
      isWarmup: boolean
      baselineHasData: boolean
    }[]
    baselineTotalVolume: number
  } | null>(() => {
    if (!workout) return null

    const exercisesByKey = new Map<string, SummaryExercise>()
    exercises.forEach((ex) => {
      exercisesByKey.set(normalizeExerciseName(ex.name), ex)
    })

    const baselineByKey = new Map<string, SummaryExercise>()
    baselineExercises?.forEach((ex) => {
      baselineByKey.set(normalizeExerciseName(ex.name), ex)
    })

    let totalVolume = 0
    let totalValidSets = 0
    let excludedSets = 0
    let prCount = 0
    let improvedCount = 0
    let warmupExerciseCount = 0
    let biggestJump: { name: string; delta: number } | null = null

    const exerciseSummaries = Array.from(exercisesByKey.values()).map((exercise) => {
      const isWarmup = isWarmupExercise(exercise.name)
      if (isWarmup) warmupExerciseCount += 1
      const validSets = exercise.sets.filter((set) =>
        isSetEligibleForStats({
          reps: set.reps,
          weight: set.weight,
          completed: set.completed,
          validationFlags: set.validation_flags ?? undefined,
        })
      )
      const excluded = exercise.sets.filter((set) => set.completed && !validSets.includes(set)).length
      excludedSets += excluded
      totalValidSets += validSets.length

      const volume = validSets.reduce((sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0), 0)
      totalVolume += volume

      const bestSet = validSets.length > 0 ? getBestSet(validSets) : null

      const baseline = baselineByKey.get(normalizeExerciseName(exercise.name))
      const baselineValidSets = baseline
        ? baseline.sets.filter((set) =>
            isSetEligibleForStats({
              reps: set.reps,
              weight: set.weight,
              completed: set.completed,
              validationFlags: set.validation_flags ?? undefined,
            })
          )
        : []
      const baselineVolume = baselineValidSets.reduce(
        (sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0),
        0,
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

      const prBadges = [
        weightPR ? "Weight PR" : null,
        repsPR ? "Rep PR" : null,
        volumePR ? "Volume PR" : null,
      ].filter(Boolean) as string[]

      if (!isWarmup) prCount += prBadges.length
      const improved = !isWarmup && (prBadges.length > 0 || volumeDelta > 0)
      if (improved) improvedCount += 1
      if (!isWarmup && baselineHasData && volumeDelta > 0) {
        if (!biggestJump || volumeDelta > biggestJump.delta) {
          biggestJump = { name: exercise.name, delta: volumeDelta }
        }
      }

      return {
        exercise,
        volume,
        volumeDelta,
        bestSet,
        excluded,
        prBadges,
        improved,
        isWarmup,
        baselineHasData,
      }
    })

    const baselineTotalVolume = baselineExercises
      ? baselineExercises
          .flatMap((ex) => ex.sets)
          .filter((set) =>
            isSetEligibleForStats({
              reps: set.reps,
              weight: set.weight,
              completed: set.completed,
              validationFlags: set.validation_flags ?? undefined,
            })
          )
          .reduce((sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0), 0)
      : 0

    return {
      totalVolume,
      totalValidSets,
      excludedSets,
      exercisesCount: exercises.length,
      prCount,
      improvedCount,
      warmupExerciseCount,
      nonWarmupExerciseCount: exercises.length - warmupExerciseCount,
      biggestJump,
      exerciseSummaries,
      baselineTotalVolume,
    }
  }, [workout, exercises, baselineExercises])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading summary...</p>
      </div>
    )
  }

  if (notFound || !workout || !summary) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Workout summary not found.</p>
          <Button onClick={() => router.push("/")}>Back to Home</Button>
        </div>
      </div>
    )
  }

  const performedAt = toPerformedAt(workout)
  const dateLabel = new Date(performedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })

  const deltaLabel =
    summary.baselineTotalVolume > 0
      ? `${summary.totalVolume >= summary.baselineTotalVolume ? "+" : ""}${Math.round(
          ((summary.totalVolume - summary.baselineTotalVolume) / summary.baselineTotalVolume) * 100
        )}%`
      : "Baseline set"

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-bold text-foreground">Workout Complete</h1>
          <p className="text-sm text-muted-foreground">
            {workout.name} • {dateLabel}
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div className="text-sm text-muted-foreground uppercase tracking-wide">Total Volume</div>
          <div className="text-4xl font-bold text-foreground tabular-nums">
            {summary.totalVolume.toLocaleString()} lbs
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={`px-2 py-0.5 rounded-full ${
                summary.baselineTotalVolume > 0
                  ? "bg-emerald-500/10 text-emerald-700"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {deltaLabel}
            </span>
            {summary.baselineTotalVolume > 0 && <span>vs last time</span>}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
            <span>{summary.exercisesCount} exercises</span>
            <span>{summary.totalValidSets} sets</span>
            <span>{summary.prCount} PRs</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-foreground bg-muted px-2 py-1 rounded-full">
            Improved on {summary.improvedCount}/{summary.nonWarmupExerciseCount} exercises
          </span>
          {summary.biggestJump && (
            <span className="text-xs text-foreground bg-muted px-2 py-1 rounded-full">
              Biggest jump: {summary.biggestJump.name} +{Math.round(summary.biggestJump.delta).toLocaleString()} lb
            </span>
          )}
          {summary.excludedSets > 0 && (
            <span className="text-xs text-amber-700 bg-amber-500/10 px-2 py-1 rounded-full">
              ⚠️ {summary.excludedSets} sets excluded
            </span>
          )}
        </div>

        <div className="space-y-3">
          {summary.exerciseSummaries.map(
            ({ exercise, volume, volumeDelta, bestSet, excluded, prBadges, isWarmup, baselineHasData }) => {
              const visibleBadges = isWarmup ? [] : prBadges.slice(0, 2)
              const overflowCount = isWarmup ? 0 : Math.max(prBadges.length - visibleBadges.length, 0)
              const delta =
                baselineHasData && !isWarmup
                  ? `${volumeDelta >= 0 ? "+" : ""}${Math.round(volumeDelta).toLocaleString()} lb`
                  : null

            return (
                <div
                  key={exercise.id}
                  className={`bg-card border border-border rounded-2xl p-4 space-y-3 ${
                    isWarmup ? "opacity-75" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-foreground">{exercise.name}</div>
                    </div>
                    {!isWarmup && visibleBadges.length > 0 && (
                      <div className="flex flex-wrap gap-2 justify-end">
                        {visibleBadges.map((badge) => (
                          <span
                            key={badge}
                            className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700"
                          >
                            {badge}
                          </span>
                        ))}
                        {overflowCount > 0 && (
                          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700">
                            +{overflowCount}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Volume: <span className="text-foreground">{volume.toLocaleString()} lbs</span>
                    </span>
                    {delta && (
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {delta}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Best set: {bestSet ? `${bestSet.weight ?? 0} × ${bestSet.reps ?? 0}` : "—"}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {excluded > 0 && (
                      <span className="text-xs text-amber-700 bg-amber-500/10 px-2 py-0.5 rounded-full">
                        ⚠️ {excluded} sets excluded
                      </span>
                    )}
                    {isWarmup && (
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        Warm-up
                      </span>
                    )}
                  </div>
                </div>
              )
            },
          )}
        </div>

        <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t border-border py-4">
          <Button onClick={() => router.push("/")} className="w-full h-12 text-base">
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
