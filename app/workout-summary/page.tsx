"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { plural } from "@/lib/utils"
import { Share } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IosNavPage } from "@/components/ios/nav-bar"
import { IosCard } from "@/components/ios/grouped"
import { getWorkoutHistory, normalizeExerciseName, type CompletedWorkout } from "@/lib/workout-storage"
import { isSetEligibleForStats } from "@/lib/set-validation"
import { isWarmupExercise } from "@/lib/exercise-heuristics"
import { copyWorkoutToClipboard } from "@/lib/workout-export"
import { toast } from "sonner"
import { useWorkoutAlerts } from "@/hooks/useWorkoutAlerts"
import WorkoutAlertsBanner from "@/components/workout-alerts-banner"
import AktIndicatorChip from "@/components/akt-indicator-chip"
import {
  coachNoteTarget,
  fetchAutoResolvedCoachNotes,
  formatClearedNoteLine,
  type ResolvedCoachNote,
} from "@/lib/coach-notes"

type WorkoutRow = {
  id: string
  name: string
  performed_at?: string
  date?: string
  routine_id?: string | null
  routineId?: string | null
  startedAt?: string
  endedAt?: string
  duration?: number
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

export default function WorkoutSummaryPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const workoutId = searchParams.get("workoutId") ?? searchParams.get("id")

  const { alerts: workoutAlerts, dismiss: dismissWorkoutAlert } = useWorkoutAlerts()
  const [workout, setWorkout] = useState<WorkoutRow | null>(null)
  const [rawWorkout, setRawWorkout] = useState<CompletedWorkout | null>(null)
  const [exercises, setExercises] = useState<SummaryExercise[]>([])
  const [baselineExercises, setBaselineExercises] = useState<SummaryExercise[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [clearedNotes, setClearedNotes] = useState<ResolvedCoachNote[]>([])

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
        startedAt: workoutRecord.startedAt,
        endedAt: workoutRecord.endedAt,
        duration: workoutRecord.duration,
      }

      const assembledExercises = buildSummaryExercises(workoutRecord)
      const baselineWorkout = history
        .filter((w) => w.id !== workoutRecord.id && w.name === workoutRecord.name)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]

      setWorkout(workoutRow)
      setRawWorkout(workoutRecord)
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

  // Notes this session cleared. Resolution happens server-side inside the
  // commit request, which the finish handler fires just before routing here —
  // so the rows may not exist yet on first paint. Poll a few times, back off,
  // and stop the moment something lands (or nothing ever does).
  useEffect(() => {
    if (!rawWorkout) return

    const since = rawWorkout.startedAt ?? rawWorkout.date
    if (!since) return

    const targets = [
      ...rawWorkout.exercises.map((exercise) => exercise.name),
      rawWorkout.name,
    ]

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const delays = [0, 2000, 4500]

    const poll = (attempt: number) => {
      void fetchAutoResolvedCoachNotes({ since, targets }).then((notes) => {
        if (cancelled) return
        if (notes.length > 0) {
          setClearedNotes(notes)
          return
        }
        const next = delays[attempt + 1]
        if (next === undefined) return
        timer = setTimeout(() => poll(attempt + 1), next)
      })
    }

    poll(0)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [rawWorkout])

  // The casing the exercise was actually logged under, so a cleared line reads
  // like the set list instead of like the note's lowercased target.
  const clearedDisplayNames = useMemo(() => {
    const names = new Map<string, string>()
    exercises.forEach((exercise) => {
      names.set(coachNoteTarget(exercise.name), exercise.name)
    })
    if (workout?.name) names.set(coachNoteTarget(workout.name), workout.name)
    return names
  }, [exercises, workout])

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
  // Use startedAt for the actual time display (date is noon-normalized for grouping only)
  const headerTimeSource = workout.startedAt ?? performedAt
  const fullDateLabel = new Date(headerTimeSource).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m} min`
  }

  // Display numerals want a short form — 44.1K reads at 34pt, 44,120 does not.
  const formatVolumeK = (lb: number) =>
    lb >= 1000 ? `${(lb / 1000).toFixed(1)}K` : `${Math.round(lb)}`

  const durationSeconds =
    workout.duration ??
    (workout.startedAt && workout.endedAt
      ? Math.floor((new Date(workout.endedAt).getTime() - new Date(workout.startedAt).getTime()) / 1000)
      : null)

  const timeRangeLabel =
    workout.startedAt && workout.endedAt
      ? `${formatTime(workout.startedAt)} – ${formatTime(workout.endedAt)}`
      : null

  const deltaLabel =
    summary.baselineTotalVolume > 0
      ? `${summary.totalVolume >= summary.baselineTotalVolume ? "+" : ""}${Math.round(
          ((summary.totalVolume - summary.baselineTotalVolume) / summary.baselineTotalVolume) * 100
        )}%`
      : "Baseline set"

  return (
    <div className="min-h-screen pb-20" style={{ background: "#000" }}>
      <IosNavPage
        backLabel="Home"
        onBack={() => router.push("/history")}
        title={workout.name}
        longTitle
        subtitle={fullDateLabel}
        action={
          rawWorkout ? (
            <button
              type="button"
              className="ios-navbar__action"
              aria-label="Copy workout"
              onClick={async () => {
                try {
                  await copyWorkoutToClipboard(rawWorkout)
                  toast.success("Workout copied to clipboard")
                } catch {
                  toast.error("Failed to copy workout")
                }
              }}
            >
              <Share size={22} strokeWidth={1.8} />
            </button>
          ) : null
        }
      >
      <div className="max-w-2xl mx-auto space-y-6">
        {workoutAlerts.length > 0 && (
          <WorkoutAlertsBanner alerts={workoutAlerts} onDismiss={dismissWorkoutAlert} className="" />
        )}

        {/* One "Session" band: the four numbers that describe the workout,
            as display numerals over their labels. */}
        <IosCard>
          <div className="grid grid-cols-4" style={{ gap: "8px" }}>
            <SummaryStat value={formatVolumeK(summary.totalVolume)} label="Volume" />
            <SummaryStat
              value={durationSeconds !== null ? formatDuration(durationSeconds) : dateLabel}
              label={durationSeconds !== null ? "Duration" : "Workout date"}
            />
            <SummaryStat value={`${summary.totalValidSets}`} label="Sets" />
            <SummaryStat value={`${summary.exercisesCount}`} label="Exercises" />
          </div>
          <div
            className="flex items-center gap-2"
            style={{ marginTop: "16px", paddingTop: "14px", borderTop: "0.5px solid var(--ios-hairline)" }}
          >
            {summary.baselineTotalVolume > 0 ? (
              <Badge tone="good" className="normal-case tracking-normal">{deltaLabel}</Badge>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">{deltaLabel}</span>
            )}
            {summary.baselineTotalVolume > 0 && (
              <span style={{ fontSize: "13px", color: "var(--ink-40)" }}>vs last time</span>
            )}
            {timeRangeLabel && (
              <span style={{ fontSize: "13px", color: "var(--ink-40)", marginLeft: "auto" }}>{timeRangeLabel}</span>
            )}
          </div>
        </IosCard>

        <IosCard>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Performance</div>
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
              <Badge tone="warn" className="normal-case tracking-normal text-xs py-1">
                ⚠️ {summary.excludedSets} {plural(summary.excludedSets, "set", "sets")} excluded
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push(`/workout-summary/transcribe?workoutId=${workout.id}`)}
            >
              Log to Whoop
            </Button>
            <Button variant="secondary" size="sm" onClick={() => router.push(`/history/${workout.id}`)}>
              View workout details
            </Button>
            {rawWorkout && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                    await copyWorkoutToClipboard(rawWorkout)
                    toast.success("Workout copied to clipboard")
                  } catch {
                    toast.error("Failed to copy workout")
                  }
                }}
              >
                Copy workout
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => router.push("/history")}>
              All workouts
            </Button>
            <Button variant="ghost" size="sm" onClick={() => router.push("/workout")}>
              Start another workout
            </Button>
          </div>
        </IosCard>

        {clearedNotes.length > 0 && (
          <IosCard>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Coach notes cleared
            </div>
            <div className="flex flex-col" style={{ gap: "6px", marginTop: "10px" }}>
              {clearedNotes.map((note) => (
                <div
                  key={note.id}
                  style={{ fontSize: "13px", color: "var(--ink-70)", lineHeight: 1.35 }}
                >
                  <span style={{ color: "var(--good-ink)" }}>Cleared:</span>{" "}
                  {formatClearedNoteLine(note, clearedDisplayNames)}
                </div>
              ))}
            </div>
          </IosCard>
        )}

        <div className="space-y-3">
          {summary.exerciseSummaries.map(
            ({ exercise, volume, volumeDelta, bestSet, excluded, prBadges, isWarmup, baselineHasData }, idx) => {
              const visibleBadges = isWarmup ? [] : prBadges.slice(0, 2)
              const overflowCount = isWarmup ? 0 : Math.max(prBadges.length - visibleBadges.length, 0)
              const delta =
                baselineHasData && !isWarmup
                  ? `${volumeDelta >= 0 ? "+" : ""}${Math.round(volumeDelta).toLocaleString()} lb`
                  : null
              const exerciseRating = rawWorkout?.exercises?.[idx]?.rating ?? null

              const completedSets = exercise.sets.filter((s) => s.completed).length

              return (
                <IosCard key={exercise.id} style={isWarmup ? { opacity: 0.75 } : undefined}>
                  <div className="flex items-start justify-between gap-3">
                    <div style={{ minWidth: 0 }}>
                      <button
                        type="button"
                        onClick={() => router.push(`/exercise/${encodeURIComponent(exercise.name)}`)}
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          textAlign: "left",
                          fontSize: "17px",
                          fontWeight: 600,
                          color: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        {exercise.name}
                      </button>
                      <p style={{ fontSize: "13px", color: "var(--ink-40)", marginTop: "2px" }}>
                        {completedSets}/{exercise.sets.length} sets
                        {exerciseRating
                          ? exerciseRating === "thumbs_up"
                            ? " · Felt good"
                            : " · Felt rough"
                          : ""}
                      </p>
                    </div>
                    <div className="text-right" style={{ flexShrink: 0 }}>
                      <div
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: "26px",
                          lineHeight: 1,
                          color: "#fff",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {formatVolumeK(volume)}
                      </div>
                      {delta && (
                        <div
                          style={{
                            fontSize: "11px",
                            marginTop: "4px",
                            color: volumeDelta > 0 ? "var(--good)" : "var(--ink-30)",
                          }}
                        >
                          {delta}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2" style={{ marginTop: "10px" }}>
                    {!isWarmup &&
                      visibleBadges.map((badge) => (
                        <AktIndicatorChip
                          key={badge}
                          indicatorId={`${workout.id}:${exercise.id}:${badge}`}
                          tone="good"
                          label={badge}
                        />
                      ))}
                    {!isWarmup && overflowCount > 0 && (
                      <AktIndicatorChip
                        indicatorId={`${workout.id}:${exercise.id}:overflow`}
                        tone="good"
                        label={`+${overflowCount}`}
                      />
                    )}
                    {excluded > 0 && (
                      <Badge tone="warn" className="normal-case tracking-normal text-xs">
                        ⚠️ {excluded} {plural(excluded, "set", "sets")} excluded
                      </Badge>
                    )}
                    {isWarmup && (
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Warm-up</span>
                    )}
                  </div>

                  {/* Set table: hairline-ruled, 15pt cells. */}
                  <div style={{ marginTop: "14px" }}>
                    <div
                      className="flex items-center"
                      style={{
                        fontSize: "13px",
                        color: "var(--ink-40)",
                        paddingBottom: "6px",
                        borderBottom: "0.5px solid var(--ios-hairline)",
                      }}
                    >
                      <span style={{ flex: "1 1 auto" }}>Set</span>
                      <span style={{ width: "88px", textAlign: "right" }}>Weight × Reps</span>
                    </div>
                    {exercise.sets
                      .filter((s) => s.completed)
                      .map((set, setIdx) => (
                        <div
                          key={setIdx}
                          className="flex items-center"
                          style={{
                            fontSize: "15px",
                            padding: "7px 0",
                            borderBottom: "0.5px solid var(--ios-hairline)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          <span style={{ flex: "1 1 auto", color: "var(--ink-40)" }}>{setIdx + 1}</span>
                          <span style={{ width: "88px", textAlign: "right", color: "#fff" }}>
                            {set.weight ?? 0} × {set.reps ?? 0}
                          </span>
                        </div>
                      ))}
                    <div style={{ fontSize: "13px", color: "var(--ink-40)", paddingTop: "8px" }}>
                      Best set: {bestSet ? `${bestSet.weight ?? 0} × ${bestSet.reps ?? 0}` : "—"}
                    </div>
                  </div>
                </IosCard>
              )
            },
          )}
        </div>

        <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t border-border py-4 px-4">
          <Button onClick={() => router.push("/")} className="w-full text-base">
            Done
          </Button>
        </div>
      </div>
      </IosNavPage>
    </div>
  )
}

/** Display numeral over a 13pt label, for the Session band. */
function SummaryStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "34px",
          lineHeight: 1,
          color: "#fff",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: "13px", color: "var(--ink-40)", marginTop: "6px" }}>{label}</div>
    </div>
  )
}
