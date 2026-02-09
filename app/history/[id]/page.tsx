"use client"

import { useParams, useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { getWorkoutHistory, type CompletedWorkout } from "@/lib/workout-storage"
import { isSetEligibleForStats } from "@/lib/set-validation"

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
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border">
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
                {(workout.stats.totalVolume / 1000).toFixed(1)}k lbs
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
              <div className="text-lg font-semibold text-foreground">{workout.stats.completedSets}</div>
              <div>Sets</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-foreground">{workout.exercises.length}</div>
              <div>Exercises</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-foreground">
                {Math.round(workout.stats.totalVolume).toLocaleString()}
              </div>
              <div>lbs</div>
            </div>
          </div>
        </Card>

        <div className="space-y-3">
          {workout.exercises.map((exercise, idx) => {
            const completedSets = exercise.sets.filter((s) => isSetEligibleForStats(s))
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
                      {completedSets.length}/{exercise.sets.length} sets completed
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
                      {exercise.sets.map((set, setIdx) => {
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
