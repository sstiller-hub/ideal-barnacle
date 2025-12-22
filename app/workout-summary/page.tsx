"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { getWorkoutHistory, type CompletedWorkout } from "@/lib/workout-storage"
import { getWorkoutProgressionSummary } from "@/lib/workout-summary-helpers"
import { ChevronRight, TrendingUp, Weight, Zap, Target } from "lucide-react"

export default function WorkoutSummaryPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const workoutId = searchParams.get("id")

  const [workout, setWorkout] = useState<CompletedWorkout | null>(null)
  const [progression, setProgression] = useState<any>(null)

  useEffect(() => {
    if (!workoutId) {
      router.push("/")
      return
    }

    if (typeof window === "undefined") return

    const history = getWorkoutHistory()
    const found = history.find((w) => w.id === workoutId)

    if (!found) {
      router.push("/")
      return
    }

    setWorkout(found)

    const progressionData = getWorkoutProgressionSummary(found.exercises, found.id)
    setProgression(progressionData)
  }, [workoutId, router])

  if (!workout || !progression) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading summary...</p>
      </div>
    )
  }

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} minutes`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Workout Complete</h1>
          <p className="text-lg text-muted-foreground">{workout.name}</p>
          <p className="text-sm text-muted-foreground tabular-nums">{formatDuration(workout.duration)}</p>
        </div>

        {/* Primary Highlight */}
        <div className="bg-accent/30 border border-border rounded-2xl p-6 text-center space-y-3">
          {progression.overallStatus === "progressed" && (
            <>
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 mb-2">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
              <h2 className="text-2xl font-semibold text-foreground">
                You progressed on {progression.progressedSets} set{progression.progressedSets !== 1 ? "s" : ""}
              </h2>
              <p className="text-sm text-muted-foreground">
                Out of {progression.totalSets} total set{progression.totalSets !== 1 ? "s" : ""}
              </p>
            </>
          )}

          {progression.overallStatus === "maintained" && (
            <>
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/10 mb-2">
                <Target className="w-6 h-6 text-blue-600" />
              </div>
              <h2 className="text-2xl font-semibold text-foreground">Consistent performance</h2>
              <p className="text-sm text-muted-foreground">Strength maintained — progress coming soon</p>
            </>
          )}

          {progression.overallStatus === "recovery" && (
            <>
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-500/10 mb-2">
                <Zap className="w-6 h-6 text-orange-600" />
              </div>
              <h2 className="text-2xl font-semibold text-foreground">Recovery session</h2>
              <p className="text-sm text-muted-foreground">Rest and rebuild — you'll come back stronger</p>
            </>
          )}
        </div>

        {/* Key Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Weight className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Volume</p>
            </div>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {workout.stats.totalVolume.toLocaleString()} lb
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sets</p>
            </div>
            <p className="text-2xl font-bold text-foreground tabular-nums">{workout.stats.completedSets}</p>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Progressed</p>
            </div>
            <p className="text-2xl font-bold text-foreground tabular-nums">{progression.progressedSets}</p>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Exercises</p>
            </div>
            <p className="text-2xl font-bold text-foreground tabular-nums">{workout.exercises.length}</p>
          </div>
        </div>

        {/* Biggest Wins */}
        {progression.biggestWins.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Biggest wins today</h3>
            <div className="space-y-2">
              {progression.biggestWins.map((win: any, idx: number) => (
                <div
                  key={idx}
                  className="bg-card border border-border rounded-xl p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-foreground">{win.exerciseName}</p>
                    <p className="text-sm text-green-600 font-medium">{win.improvement}</p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="space-y-3 pt-4">
          <Button onClick={() => router.push("/")} className="w-full h-12 text-base">
            Finish Workout
          </Button>
          <Button
            variant="ghost"
            onClick={() => router.push("/history")}
            className="w-full h-12 text-base text-muted-foreground"
          >
            View workout details
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  )
}
