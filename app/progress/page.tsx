"use client"

import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { getWorkoutHistory, calculateExerciseStats } from "@/lib/workout-storage"
import ExerciseProgressChart from "@/components/exercise-progress-chart"

export default function ProgressPage() {
  const router = useRouter()
  const [exercises, setExercises] = useState<string[]>([])
  const [stats, setStats] = useState<Record<string, any>>({})

  useEffect(() => {
    const history = getWorkoutHistory()

    // Get unique exercise names from history
    const uniqueExercises = new Set<string>()
    history.forEach((workout) => {
      workout.exercises.forEach((ex) => {
        uniqueExercises.add(ex.name)
      })
    })

    const exerciseList = Array.from(uniqueExercises)
    setExercises(exerciseList)

    // Calculate stats for each exercise
    const exerciseStats: Record<string, any> = {}
    exerciseList.forEach((exerciseName) => {
      exerciseStats[exerciseName] = calculateExerciseStats(exerciseName)
    })
    setStats(exerciseStats)
  }, [])

  // Calculate overall stats
  const history = getWorkoutHistory()
  const totalWorkouts = history.length
  const totalVolume = history.reduce((acc, w) => acc + w.stats.totalVolume, 0)
  const avgWorkoutsPerWeek = totalWorkouts > 0 ? Math.round((totalWorkouts / 4) * 10) / 10 : 0

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
              <h1 className="text-lg font-bold text-foreground">Progress Analytics</h1>
              <p className="text-xs text-muted-foreground">Track your strength gains</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Overall Stats Summary */}
        <div className="grid grid-cols-3 gap-2">
          <Card className="p-3 text-center">
            <div className="text-2xl font-bold text-foreground">{totalWorkouts}</div>
            <div className="text-xs text-muted-foreground">Total Workouts</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-2xl font-bold text-foreground">{totalVolume.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Total Volume (lbs)</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-2xl font-bold text-foreground">{avgWorkoutsPerWeek}</div>
            <div className="text-xs text-muted-foreground">Workouts/Week</div>
          </Card>
        </div>

        {/* Exercise Progress Charts */}
        <div>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <span>Exercise Progress</span>
            <span className="text-xs font-normal text-muted-foreground">({exercises.length} exercises)</span>
          </h2>

          {exercises.length === 0 ? (
            <Card className="p-8 text-center">
              <span className="text-4xl mb-4 block">📈</span>
              <h3 className="text-lg font-semibold mb-2">No progress data yet</h3>
              <p className="text-sm text-muted-foreground mb-4">Complete workouts to see your progress charts</p>
              <Button onClick={() => router.push("/workout")}>Start a Workout</Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {exercises.map((exerciseName) => (
                <ExerciseProgressChart
                  key={exerciseName}
                  exerciseName={exerciseName}
                  data={stats[exerciseName] || []}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-8 py-2 flex items-center justify-around">
        <button onClick={() => router.push("/")} className="flex flex-col items-center gap-1 text-muted-foreground">
          <span className="text-xl">🏠</span>
          <span className="text-xs">Home</span>
        </button>
        <button
          onClick={() => router.push("/workout")}
          className="flex flex-col items-center gap-1 text-muted-foreground"
        >
          <span className="text-xl">💪</span>
          <span className="text-xs">Workouts</span>
        </button>
        <button
          onClick={() => router.push("/history")}
          className="flex flex-col items-center gap-1 text-muted-foreground"
        >
          <span className="text-xl">📊</span>
          <span className="text-xs">History</span>
        </button>
        <button onClick={() => router.push("/prs")} className="flex flex-col items-center gap-1 text-muted-foreground">
          <span className="text-xl">🏆</span>
          <span className="text-xs">PRs</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-primary">
          <span className="text-xl">📈</span>
          <span className="text-xs font-medium">Progress</span>
        </button>
      </nav>
      {/* </CHANGE> */}
    </div>
  )
}
