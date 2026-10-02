"use client"

import { useParams, useRouter } from "next/navigation"
import { plural } from "@/lib/utils"
import { Share } from "lucide-react"
import { IosNavPage } from "@/components/ios/nav-bar"
import { IosCard } from "@/components/ios/grouped"
import { IosStat } from "@/components/ios/stat"
import { useState, useEffect, useMemo } from "react"
import { getWorkoutHistory, normalizeExerciseName, type CompletedWorkout } from "@/lib/workout-storage"
import { isSetEligibleForStats } from "@/lib/set-validation"
import { copyWorkoutToClipboard } from "@/lib/workout-export"
import { toast } from "sonner"

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

function formatWeightDelta(weightDelta: number | null) {
  if (typeof weightDelta !== "number" || weightDelta === 0) return null
  return `${weightDelta > 0 ? "+" : ""}${weightDelta} lb${Math.abs(weightDelta) === 1 ? "" : "s"}`
}

function formatRepsDelta(repsDelta: number | null) {
  if (typeof repsDelta !== "number" || repsDelta === 0) return null
  return `${repsDelta > 0 ? "+" : ""}${repsDelta} rep${Math.abs(repsDelta) === 1 ? "" : "s"}`
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
    })
  }

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m} min`
  }

  const durationSeconds =
    workout?.duration ??
    (workout?.startedAt && workout?.endedAt
      ? Math.floor((new Date(workout.endedAt).getTime() - new Date(workout.startedAt).getTime()) / 1000)
      : null)

  const timeRangeLabel =
    workout?.startedAt && workout?.endedAt
      ? `${formatTime(workout.startedAt)} – ${formatTime(workout.endedAt)}`
      : null

  // Use startedAt for accurate time display; date is noon-normalized for grouping
  const headerDateLabel = workout
    ? formatDate(workout.startedAt ?? workout.date)
    : ""

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

  const baselineByExercise = useMemo(() => {
    if (!workout) return new Map<string, CompletedWorkout["exercises"][number]>()
    const history = getWorkoutHistory()
    const baselineWorkout = history
      .filter((w) => w.id !== workout.id && w.name === workout.name)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
    const map = new Map<string, CompletedWorkout["exercises"][number]>()
    baselineWorkout?.exercises?.forEach((exercise) => {
      map.set(normalizeExerciseName(exercise.name), exercise)
    })
    return map
  }, [workout])

  if (loading) {
    return <div className="min-h-screen" style={{ background: "#000" }} />
  }

  if (!workout) {
    return (
      <div className="min-h-screen pb-20" style={{ background: "#000" }}>
        <IosNavPage backLabel="History" onBack={() => router.push("/history")} title="Workout not found">
          <div className="ios-gft">This workout may have been deleted.</div>
        </IosNavPage>
      </div>
    )
  }

  const formatVolumeK = (volume: number) =>
    volume >= 1000 ? `${(volume / 1000).toFixed(1)}K` : `${Math.round(volume)}`

  return (
    <div className="min-h-screen pb-20" style={{ background: "#000" }}>
      <IosNavPage
        backLabel="History"
        onBack={() => router.push("/history")}
        title={workout.name}
        longTitle
        subtitle={headerDateLabel}
        action={
          <button
            type="button"
            className="ios-navbar__action"
            aria-label="Copy workout"
            onClick={async () => {
              try {
                await copyWorkoutToClipboard(workout)
                toast.success("Workout copied to clipboard")
              } catch {
                toast.error("Failed to copy workout")
              }
            }}
          >
            <Share size={22} strokeWidth={1.8} />
          </button>
        }
      >
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Same session band as the summary screen. */}
          <IosCard>
            <div className="grid grid-cols-4" style={{ gap: "8px" }}>
              <IosStat value={formatVolumeK(safeStats.totalVolume)} label="Volume" />
              <IosStat
                value={
                  durationSeconds !== null
                    ? formatDuration(durationSeconds)
                    : new Date(workout.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                }
                label={durationSeconds !== null ? "Duration" : "Workout date"}
              />
              <IosStat value={`${safeStats.completedSets}`} label="Sets" />
              <IosStat value={`${workout.exercises.length}`} label="Exercises" />
            </div>
            {timeRangeLabel && (
              <div
                style={{
                  marginTop: "16px",
                  paddingTop: "14px",
                  borderTop: "0.5px solid var(--ios-hairline)",
                  fontSize: "13px",
                  color: "var(--ink-50)",
                }}
              >
                {timeRangeLabel}
              </div>
            )}
          </IosCard>

          <div className="space-y-3">
            {workout.exercises.map((exercise, idx) => {
              const sets = exercise.sets ?? []
              const completedSets = sets.filter((s) => isSetEligibleForStats(s))
              const maxWeight = Math.max(...completedSets.map((s) => s.weight ?? 0), 0)
              const totalVolume = completedSets.reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0)
              const baselineExercise = baselineByExercise.get(normalizeExerciseName(exercise.name))

              return (
                <IosCard key={idx}>
                  <div className="flex items-start justify-between gap-3">
                    <div style={{ minWidth: 0 }}>
                      <button
                        type="button"
                        onClick={() => router.push(`/exercise/${encodeURIComponent(exercise.name)}`)}
                        className="text-left"
                        style={{
                          fontSize: "17px",
                          fontWeight: 600,
                          color: "#fff",
                          background: "transparent",
                          border: "none",
                          padding: "10px 0",
                          margin: "-10px 0",
                          cursor: "pointer",
                        }}
                      >
                        {exercise.name}
                      </button>
                      <p style={{ fontSize: "13px", color: "var(--ink-50)", marginTop: "2px" }}>
                        {completedSets.length}/{sets.length} sets
                        {exercise.rating ? (exercise.rating === "thumbs_up" ? " · Felt good" : " · Felt rough") : ""}
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
                        {formatVolumeK(totalVolume)}
                      </div>
                      <div style={{ fontSize: "11px", marginTop: "4px", color: "var(--ink-50)" }}>
                        {plural(totalVolume, "lb", "lbs")} volume
                      </div>
                    </div>
                  </div>

                  {/* Hairline-ruled set rows, matching the summary screen. */}
                  <div style={{ marginTop: "14px" }}>
                    <div
                      className="flex items-center"
                      style={{
                        fontSize: "13px",
                        color: "var(--ink-50)",
                        paddingBottom: "6px",
                        borderBottom: "0.5px solid var(--ios-hairline)",
                      }}
                    >
                      <span style={{ width: "36px" }}>Set</span>
                      <span style={{ flex: "1 1 auto" }}>Weight × Reps</span>
                      <span style={{ textAlign: "right" }}>Volume</span>
                    </div>
                    {sets.map((set, setIdx) => {
                      const baselineSet = baselineExercise?.sets?.[setIdx]
                      const canCompare =
                        set.completed &&
                        baselineSet?.completed &&
                        typeof set.weight === "number" &&
                        typeof set.reps === "number" &&
                        typeof baselineSet.weight === "number" &&
                        typeof baselineSet.reps === "number"
                      const weightDeltaLabel = canCompare
                        ? formatWeightDelta((set.weight ?? 0) - (baselineSet?.weight ?? 0))
                        : null
                      const repsDeltaLabel = canCompare
                        ? formatRepsDelta((set.reps ?? 0) - (baselineSet?.reps ?? 0))
                        : null
                      const deltaLabel = [weightDeltaLabel, repsDeltaLabel].filter(Boolean).join(" · ")
                      const isTopSet = set.completed && (set.weight ?? 0) === maxWeight && maxWeight > 0
                      const logged = set.completed && set.weight != null && set.reps != null

                      return (
                        <div
                          key={setIdx}
                          className="flex items-center"
                          style={{
                            fontSize: "15px",
                            padding: "7px 0",
                            borderBottom: "0.5px solid var(--ios-hairline)",
                            fontVariantNumeric: "tabular-nums",
                            opacity: set.completed ? 1 : 0.4,
                          }}
                        >
                          <span style={{ width: "36px", color: "var(--ink-50)" }}>{setIdx + 1}</span>
                          <span style={{ flex: "1 1 auto", color: isTopSet ? "#fff" : "var(--ink-85)" }}>
                            {logged ? `${set.weight} × ${set.reps}` : "—"}
                            {deltaLabel ? (
                              <span style={{ fontSize: "12px", color: "var(--ink-50)", marginLeft: "8px" }}>
                                {deltaLabel}
                              </span>
                            ) : null}
                          </span>
                          <span style={{ textAlign: "right", color: "var(--ink-70)" }}>
                            {logged ? ((set.weight ?? 0) * (set.reps ?? 0)).toLocaleString() : "—"}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </IosCard>
              )
            })}
          </div>
        </div>
      </IosNavPage>
    </div>
  )
}
