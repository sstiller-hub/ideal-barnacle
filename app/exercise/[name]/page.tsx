"use client"

import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getExerciseHistory, calculateExerciseStats } from "@/lib/workout-storage"

export default function ExerciseHistoryPage({ params }: { params: { name: string } }) {
  const router = useRouter()
  const exerciseName = decodeURIComponent(params.name)
  const history = getExerciseHistory(exerciseName)
  const stats = calculateExerciseStats(exerciseName)

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              ‹
            </Button>
            <div>
              <h1 className="text-lg font-bold">History: {exerciseName}</h1>
              <p className="text-xs text-muted-foreground">{history.length} workouts logged</p>
            </div>
          </div>
        </div>
      </div>

      {/* Trend Chart */}
      {stats && stats.length > 0 && (
        <div className="max-w-2xl mx-auto px-4 py-4">
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">Top Set Progression</h3>
            <div className="relative h-32">
              <svg className="w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
                {stats.length > 1 ? (
                  <>
                    <polyline
                      points={stats
                        .map((point, idx) => {
                          const x = (idx / (stats.length - 1)) * 400
                          const maxWeight = Math.max(...stats.map((s) => s.maxWeight))
                          const y = 100 - (point.maxWeight / maxWeight) * 90
                          return `${x},${y}`
                        })
                        .join(" ")}
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="2"
                    />
                    {stats.map((point, idx) => {
                      const x = (idx / (stats.length - 1)) * 400
                      const maxWeight = Math.max(...stats.map((s) => s.maxWeight))
                      const y = 100 - (point.maxWeight / maxWeight) * 90
                      return <circle key={idx} cx={x} cy={y} r="3" fill="hsl(var(--primary))" />
                    })}
                  </>
                ) : (
                  // Single data point: render centered circle
                  <circle cx={200} cy={50} r="4" fill="hsl(var(--primary))" />
                )}
              </svg>
            </div>
          </Card>
        </div>
      )}

      {/* Workout History Feed */}
      <div className="max-w-2xl mx-auto px-4 space-y-3 pb-4">
        {history.map((workout) => {
          const exercise = workout.exercises.find((e) => e.name === exerciseName)!
          const date = new Date(workout.date)
          const formattedDate = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

          return (
            <Card key={workout.id} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">{formattedDate}</h3>
                <span className="text-xs text-muted-foreground">{workout.name}</span>
              </div>
              <div className="space-y-1.5">
                {exercise.sets
                  .filter((s) => s.completed)
                  .map((set, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Set {idx + 1}</span>
                      <span className="font-medium">
                        {set.weight} lbs × {set.reps} reps
                      </span>
                    </div>
                  ))}
              </div>
            </Card>
          )
        })}

        {history.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No history for this exercise yet</p>
          </div>
        )}
      </div>
    </div>
  )
}
