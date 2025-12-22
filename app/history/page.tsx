"use client"

import type React from "react"
import { X } from "lucide-react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { getWorkoutHistory, deleteWorkout, type CompletedWorkout } from "@/lib/workout-storage"
import { BottomNav } from "@/components/bottom-nav"

export default function HistoryPage() {
  const router = useRouter()
  const [workouts, setWorkouts] = useState<CompletedWorkout[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const history = getWorkoutHistory()
    setWorkouts(history)
    setLoading(false)
  }, [])

  const handleDelete = (workoutId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm("Delete this workout? This cannot be undone.")) {
      deleteWorkout(workoutId)
      const updatedWorkouts = workouts.filter((w) => w.id !== workoutId)
      setWorkouts(updatedWorkouts)
    }
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

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/")}>
              <span className="text-xl">‹</span>
            </Button>
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
                    <div className="text-sm font-medium text-foreground">{formatDuration(workout.duration)}</div>
                    <div className="text-xs text-muted-foreground">duration</div>
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

      <BottomNav />
    </div>
  )
}
