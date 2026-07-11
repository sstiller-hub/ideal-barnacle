"use client"

import { useParams, useRouter } from "next/navigation"
import { plural } from "@/lib/utils"
import { ChevronLeft } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useState, useEffect, useMemo } from "react"
import { getWorkoutHistory, type CompletedWorkout } from "@/lib/workout-storage"
import { isSetEligibleForStats } from "@/lib/set-validation"
import { copyWorkoutToClipboard } from "@/lib/workout-export"
import { toast } from "sonner"

function normalizeExerciseName(name: string) {
  return name.toLowerCase().trim().replace(/\s+/g, " ")
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
          <button
            type="button"
            onClick={() => router.push("/history")}
            className="flex items-center gap-2 text-ink-40 hover:text-ink-70 transition-colors duration-base"
            style={{ background: "transparent", border: "none", padding: "0", cursor: "pointer" }}
            aria-label="Back to workout history"
          >
            <ChevronLeft size={16} strokeWidth={2} />
            <span style={{ fontSize: "11px", fontWeight: 400, letterSpacing: "0.01em" }}>Back</span>
          </button>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Workout Summary</p>
            <h1 className="text-lg font-bold text-foreground">{workout.name}</h1>
            <p className="text-xs text-muted-foreground">{headerDateLabel}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              try {
                await copyWorkoutToClipboard(workout)
                toast.success("Workout copied to clipboard")
              } catch {
                toast.error("Failed to copy workout")
              }
            }}
          >
            Copy
          </Button>
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
              {durationSeconds !== null && (
                <>
                  <div className="text-xs text-muted-foreground">Duration</div>
                  <div className="text-sm font-medium text-foreground">{formatDuration(durationSeconds)}</div>
                </>
              )}
              {timeRangeLabel && (
                <div className="text-xs text-muted-foreground mt-0.5">{timeRangeLabel}</div>
              )}
              {durationSeconds === null && (
                <>
                  <div className="text-xs text-muted-foreground">Workout date</div>
                  <div className="text-sm font-medium text-foreground">
                    {new Date(workout.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </>
              )}
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

        <div className="space-y-3">
          {workout.exercises.map((exercise, idx) => {
            const completedSets = (exercise.sets ?? []).filter((s) => isSetEligibleForStats(s))
            const maxWeight = Math.max(...completedSets.map((s) => s.weight ?? 0), 0)
            const totalVolume = completedSets.reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0)
            const baselineExercise = baselineByExercise.get(normalizeExerciseName(exercise.name))

            return (
              <Card key={idx} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/exercise/${encodeURIComponent(exercise.name)}`)}
                        className="text-base font-semibold text-foreground hover:underline"
                      >
                        {exercise.name}
                      </button>
                      {exercise.rating && (
                        <Badge tone={exercise.rating === "thumbs_up" ? "good" : "warn"}>
                          {exercise.rating === "thumbs_up" ? "Felt good" : "Felt rough"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {completedSets.length}/{(exercise.sets ?? []).length} sets completed
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-foreground">{totalVolume.toLocaleString()} {plural(totalVolume, "lb", "lbs")}</div>
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
                        const baselineSet = baselineExercise?.sets?.[setIdx]
                        const canCompare =
                          set.completed &&
                          baselineSet?.completed &&
                          typeof set.weight === "number" &&
                          typeof set.reps === "number" &&
                          typeof baselineSet.weight === "number" &&
                          typeof baselineSet.reps === "number"
                        const weightDelta = canCompare ? (set.weight ?? 0) - (baselineSet?.weight ?? 0) : null
                        const repsDelta = canCompare ? (set.reps ?? 0) - (baselineSet?.reps ?? 0) : null
                        const weightDeltaLabel = canCompare ? formatWeightDelta(weightDelta) : null
                        const repsDeltaLabel = canCompare ? formatRepsDelta(repsDelta) : null
                        return (
                          <tr
                            key={setIdx}
                            className={`border-t border-border ${!set.completed ? "opacity-40" : ""} ${isMaxWeight ? "bg-primary/10" : ""}`}
                          >
                            <td className="px-3 py-2 text-foreground">{setIdx + 1}</td>
                            <td className="px-3 py-2 font-medium text-foreground">
                              <div className="flex items-center justify-between gap-2">
                                <span className="mx-auto">
                                  {set.completed && set.weight !== null && set.weight !== undefined ? `${set.weight} ${plural(set.weight, "lb", "lbs")}` : "—"}
                                </span>
                                {weightDeltaLabel && (
                                  <span className="text-[10px] text-ink-40" style={{ fontWeight: 400 }}>
                                    {weightDeltaLabel}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 font-medium text-foreground">
                              <div className="flex items-center justify-between gap-2">
                                <span className="mx-auto">
                                  {set.completed && set.reps !== null && set.reps !== undefined ? set.reps : "—"}
                                </span>
                                {repsDeltaLabel && (
                                  <span className="text-[10px] text-ink-40" style={{ fontWeight: 400 }}>
                                    {repsDeltaLabel}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="text-right px-3 py-2 text-muted-foreground">
                              {set.completed && set.weight !== null && set.reps !== null
                                ? `${((set.weight ?? 0) * (set.reps ?? 0)).toLocaleString()} ${plural((set.weight ?? 0) * (set.reps ?? 0), "lb", "lbs")}`
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
