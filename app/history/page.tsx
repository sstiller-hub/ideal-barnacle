"use client"

import type React from "react"
import { ChevronLeft, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useState, useEffect, useMemo } from "react"
import { getWorkoutHistory, deleteWorkout, normalizeExerciseName, type CompletedWorkout } from "@/lib/workout-storage"

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

  const handleDelete = (workoutId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm("Delete this workout? This cannot be undone.")) {
      deleteWorkout(workoutId)
      const updatedWorkouts = workouts.filter((w) => w.id !== workoutId)
      setWorkouts(updatedWorkouts)
    }
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div
        className="sticky top-0 z-10"
        style={{ background: "rgba(10, 10, 12, 0.92)", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}
      >
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="flex items-center gap-2 text-ink-40 hover:text-ink-70 transition-colors duration-base"
              style={{
                background: "transparent",
                border: "none",
                padding: "0",
                cursor: "pointer",
              }}
              aria-label="Back to home"
            >
              <ChevronLeft size={16} strokeWidth={2} />
              <span style={{ fontSize: "11px", fontWeight: 400, letterSpacing: "0.01em" }}>
                Back
              </span>
            </button>
            <div>
              <h1 className="text-lg font-bold text-foreground">Workout History</h1>
              <p className="text-xs text-muted-foreground">{workouts.length} workouts completed</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4">
        {loading ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Loading workouts...</p>
          </Card>
        ) : workouts.length === 0 ? (
          <Card className="p-8 text-center">
            <span className="text-4xl mb-4 block">💪</span>
            <h2 className="text-lg font-semibold mb-2">No workouts yet</h2>
            <p className="text-sm text-muted-foreground mb-4">Complete your first workout to see it here</p>
            <Button onClick={() => router.push("/workout")}>Start Workout</Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {ratingSummary.hasAny && (
              <Card className="p-4">
                <h2 className="font-semibold text-foreground mb-1">Felt ratings</h2>
                {ratingSummary.rough.length > 0 ? (
                  <>
                    <p className="text-xs text-muted-foreground mb-3">
                      Exercises that tend to feel rough
                    </p>
                    <div className="space-y-3">
                      {ratingSummary.rough.map((entry) => (
                        <div key={entry.name}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-foreground">{entry.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {entry.pctGood}% good · {entry.rough} rough of {entry.total}
                            </span>
                          </div>
                          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              style={{ width: `${entry.pctGood}%`, background: "rgba(52, 211, 153, 0.7)" }}
                            />
                            <div
                              style={{ width: `${100 - entry.pctGood}%`, background: "rgba(251, 191, 36, 0.7)" }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No exercises consistently feel rough — nice work.
                  </p>
                )}
              </Card>
            )}
            {workouts.map((workout) => (
              <Card key={workout.id} className="p-4 relative hover:bg-accent/50 transition-colors">
                <button
                  onClick={(e) => handleDelete(workout.id, e)}
                  className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors z-10"
                  aria-label="Delete workout"
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="flex items-start justify-between mb-3 pr-8">
                  <div>
                    <h3 className="font-semibold text-foreground">{workout.name}</h3>
                    <p className="text-xs text-muted-foreground">{formatDate(workout.date)}</p>
                  </div>
                  <div className="text-right">
                    {(() => {
                      const secs = getWorkoutDurationSeconds(workout)
                      return secs !== null ? (
                        <>
                          <div className="text-sm font-medium text-foreground">{formatDuration(secs)}</div>
                          <div className="text-xs text-muted-foreground">duration</div>
                        </>
                      ) : (
                        <div className="text-xs text-muted-foreground">completed</div>
                      )
                    })()}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <div className="text-lg font-bold text-foreground">{workout.stats.completedSets}</div>
                    <div className="text-xs text-muted-foreground">Sets</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-foreground">{workout.exercises.length}</div>
                    <div className="text-xs text-muted-foreground">Exercises</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-foreground">
                      {(workout.stats.totalVolume / 1000).toFixed(1)}k
                    </div>
                    <div className="text-xs text-muted-foreground">lbs</div>
                  </div>
                </div>

                <div className="space-y-1 pt-2 border-t border-border">
                  {workout.exercises.map((exercise, idx) => {
                    const completedSets = exercise.sets.filter((s) => s.completed).length
                    return (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{exercise.name}</span>
                        <span className="text-foreground font-medium">
                          {completedSets}/{exercise.sets.length} sets
                        </span>
                      </div>
                    )
                  })}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
