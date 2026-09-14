"use client"

import { ChevronRight } from "lucide-react"
import { plural } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useState, useEffect, useMemo } from "react"
import { getWorkoutHistory, deleteWorkout, normalizeExerciseName, type CompletedWorkout } from "@/lib/workout-storage"
import { IosTabBar } from "@/components/ios/tab-bar"
import { IosLargeTitleHeader } from "@/components/ios/nav-bar"
import { IosCard, IosSectionHeader } from "@/components/ios/grouped"
import { IosSwipeToDelete } from "@/components/ios/swipe-to-delete"

export default function HistoryPage() {
  const router = useRouter()
  const [workouts, setWorkouts] = useState<CompletedWorkout[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const history = getWorkoutHistory()
    setWorkouts(history)
    setLoading(false)
  }, [])

  const ratingSummary = useMemo(() => {
    const byExercise = new Map<string, { name: string; good: number; rough: number }>()
    workouts.forEach((workout) => {
      workout.exercises.forEach((exercise) => {
        if (exercise.rating !== "thumbs_up" && exercise.rating !== "thumbs_down") return
        const key = normalizeExerciseName(exercise.name)
        const entry = byExercise.get(key) ?? { name: exercise.name, good: 0, rough: 0 }
        if (exercise.rating === "thumbs_up") entry.good += 1
        else entry.rough += 1
        byExercise.set(key, entry)
      })
    })
    const all = Array.from(byExercise.values()).map((entry) => {
      const total = entry.good + entry.rough
      return { ...entry, total, pctGood: Math.round((entry.good / total) * 100) }
    })
    const rough = all
      .filter((entry) => entry.total >= 2 && entry.pctGood <= 50)
      .sort((a, b) => a.pctGood - b.pctGood || b.rough - a.rough)
      .slice(0, 5)
    return { hasAny: all.length > 0, rough }
  }, [workouts])

  const handleDelete = (workoutId: string) => {
    if (!confirm("Delete this workout? This cannot be undone.")) return
    deleteWorkout(workoutId)
    setWorkouts((previous) => previous.filter((w) => w.id !== workoutId))
  }

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m} min`
  }

  const getWorkoutDurationSeconds = (workout: CompletedWorkout): number | null => {
    if (typeof workout.duration === "number") return workout.duration
    if (workout.startedAt && workout.endedAt) {
      return Math.floor((new Date(workout.endedAt).getTime() - new Date(workout.startedAt).getTime()) / 1000)
    }
    return null
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) return "Today"
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday"

    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: "#000",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + var(--ios-tabbar-clearance))",
      }}
    >
      {/* Tab root: large title, no back button. */}
      <IosLargeTitleHeader title="History" />

      {loading ? (
        <IosCard>
          <p className="text-muted-foreground">Loading workouts...</p>
        </IosCard>
      ) : workouts.length === 0 ? (
        <IosCard style={{ textAlign: "center" }}>
          <span className="text-4xl mb-4 block">💪</span>
          <h2 className="text-lg font-semibold mb-2">No workouts yet</h2>
          <p className="text-sm text-muted-foreground mb-4">Complete your first workout to see it here</p>
          <Button onClick={() => router.push("/workout")}>Start Workout</Button>
        </IosCard>
      ) : (
        <>
          {ratingSummary.hasAny && (
            <>
              <IosSectionHeader>Felt ratings</IosSectionHeader>
              <IosCard>
                {ratingSummary.rough.length > 0 ? (
                  <>
                    <p style={{ fontSize: "13px", color: "var(--ink-40)", marginBottom: "12px" }}>
                      Exercises that tend to feel rough
                    </p>
                    <div className="space-y-3">
                      {ratingSummary.rough.map((entry) => (
                        <div key={entry.name}>
                          <div className="flex items-center justify-between mb-1">
                            <span style={{ fontSize: "15px", color: "#fff" }}>{entry.name}</span>
                            <span style={{ fontSize: "13px", color: "var(--ink-40)" }}>
                              {entry.pctGood}% good · {entry.rough} rough of {entry.total}
                            </span>
                          </div>
                          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className="bg-good-ink" style={{ width: `${entry.pctGood}%` }} />
                            <div className="bg-warn-ink" style={{ width: `${100 - entry.pctGood}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p style={{ fontSize: "13px", color: "var(--ink-40)" }}>
                    No exercises consistently feel rough — nice work.
                  </p>
                )}
              </IosCard>
            </>
          )}

          {/* The count is context, not a stat — it belongs in the header. */}
          <IosSectionHeader>
            {workouts.length} {plural(workouts.length, "workout", "workouts")}
          </IosSectionHeader>

          <div className="flex flex-col" style={{ gap: "12px" }}>
            {workouts.map((workout) => (
              <IosSwipeToDelete key={workout.id} onDelete={() => handleDelete(workout.id)}>
                <IosCard
                  style={{ cursor: "pointer" }}
                  // The card is the row: tapping anywhere opens the session.
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/history/${workout.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") router.push(`/history/${workout.id}`)
                    }}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div style={{ minWidth: 0 }}>
                        <h3 style={{ fontSize: "17px", fontWeight: 600, color: "#fff" }}>{workout.name}</h3>
                        <p style={{ fontSize: "13px", color: "var(--ink-40)", marginTop: "2px" }}>
                          {formatDate(workout.date)}
                          {" · "}
                          {(() => {
                            const secs = getWorkoutDurationSeconds(workout)
                            return <span>{secs !== null ? `${formatDuration(secs)} duration` : "completed"}</span>
                          })()}
                        </p>
                      </div>
                      <ChevronRight size={18} strokeWidth={2} className="ios-row__chevron" style={{ marginTop: "2px" }} />
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <HistoryStat value={`${workout.stats.completedSets}`} label="Sets" />
                      <HistoryStat value={`${workout.exercises.length}`} label="Exercises" />
                      <HistoryStat value={`${(workout.stats.totalVolume / 1000).toFixed(1)}k`} label="lbs" />
                    </div>

                    <div className="space-y-1 pt-2" style={{ borderTop: `0.5px solid var(--ios-hairline)` }}>
                      {workout.exercises.map((exercise, idx) => {
                        const completedSets = exercise.sets.filter((s) => s.completed).length
                        return (
                          <div key={idx} className="flex items-center justify-between" style={{ fontSize: "13px" }}>
                            <span style={{ color: "var(--ink-40)" }}>{exercise.name}</span>
                            <span style={{ color: "#fff", fontWeight: 500 }}>
                              {completedSets}/{exercise.sets.length} sets
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </IosCard>
              </IosSwipeToDelete>
            ))}
          </div>
        </>
      )}

      <IosTabBar active="history" />
    </div>
  )
}

/** Display numeral over a 13pt label — the app's ledger stat, iOS-sized. */
function HistoryStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "30px",
          fontWeight: 400,
          lineHeight: 1,
          color: "#fff",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: "13px", color: "var(--ink-40)", marginTop: "4px" }}>{label}</div>
    </div>
  )
}
