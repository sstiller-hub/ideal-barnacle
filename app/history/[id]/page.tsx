"use client"

import { useParams, useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { getWorkoutHistory, type CompletedWorkout } from "@/lib/workout-storage"

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

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} minutes`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
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
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/history")}>
              <span className="text-xl">‹</span>
            </Button>
            <div>
              <h1 className="text-lg font-bold text-foreground">{workout.name}</h1>
              <p className="text-xs text-muted-foreground">{formatDate(workout.date)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Summary Stats */}
        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3 text-muted-foreground">Workout Summary</h2>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <div className="text-2xl font-bold text-foreground">{formatDuration(workout.duration)}</div>
              <div className="text-xs text-muted-foreground">Duration</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{workout.stats.completedSets}</div>
              <div className="text-xs text-muted-foreground">Sets</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{workout.exercises.length}</div>
              <div className="text-xs text-muted-foreground">Exercises</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{(workout.stats.totalVolume / 1000).toFixed(1)}k</div>
              <div className="text-xs text-muted-foreground">lbs</div>
            </div>
          </div>
        </Card>

        {/* Exercises */}
        <div className="space-y-3">
          {workout.exercises.map((exercise, idx) => {
            const completedSets = exercise.sets.filter((s) => s.completed)
            const maxWeight = Math.max(...completedSets.map((s) => s.weight), 0)
            const totalVolume = completedSets.reduce((sum, s) => sum + s.weight * s.reps, 0)

            return (
              <Card key={idx} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-foreground">{exercise.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {completedSets.length}/{exercise.sets.length} sets completed
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-foreground">{totalVolume.toLocaleString()} lbs</div>
                    <div className="text-xs text-muted-foreground">volume</div>
                  </div>
                </div>

                {/* Sets Table */}
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
                        const isMaxWeight = set.completed && set.weight === maxWeight
                        return (
                          <tr
                            key={setIdx}
                            className={`border-t border-border ${!set.completed ? "opacity-40" : ""} ${isMaxWeight ? "bg-primary/10" : ""}`}
                          >
                            <td className="px-3 py-2 text-foreground">{setIdx + 1}</td>
                            <td className="text-center px-3 py-2 font-medium text-foreground">
                              {set.completed ? `${set.weight} lbs` : "—"}
                            </td>
                            <td className="text-center px-3 py-2 font-medium text-foreground">
                              {set.completed ? set.reps : "—"}
                            </td>
                            <td className="text-right px-3 py-2 text-muted-foreground">
                              {set.completed ? `${(set.weight * set.reps).toLocaleString()} lbs` : "—"}
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
