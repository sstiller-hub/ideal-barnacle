"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getWorkoutHistory } from "@/lib/workout-storage"
import { isSetEligibleForStats } from "@/lib/set-validation"
import { BottomNav } from "@/components/bottom-nav"

type MaxWeightRecord = {
  exerciseName: string
  maxWeight: number
  achievedAt: string
  reps: number
  workoutName: string
}

export default function PRsPage() {
  const router = useRouter()
  const [maxWeights, setMaxWeights] = useState<MaxWeightRecord[]>([])

  useEffect(() => {
    const history = getWorkoutHistory()
    const exerciseMaxMap = new Map<string, MaxWeightRecord>()

    history.forEach((workout) => {
      workout.exercises.forEach((exercise) => {
        const completedSets = exercise.sets.filter((s) => isSetEligibleForStats(s))

        completedSets.forEach((set) => {
          const existing = exerciseMaxMap.get(exercise.name)

          const weight = set.weight ?? 0
          const reps = set.reps ?? 0
          if (!existing || weight > existing.maxWeight) {
            exerciseMaxMap.set(exercise.name, {
              exerciseName: exercise.name,
              maxWeight: weight,
              achievedAt: workout.date,
              reps,
              workoutName: workout.name,
            })
          }
        })
      })
    })

    const sorted = Array.from(exerciseMaxMap.values()).sort((a, b) => b.maxWeight - a.maxWeight)
    setMaxWeights(sorted)
  }, [])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return "Today"
    if (diffDays === 1) return "Yesterday"
    if (diffDays < 7) return `${diffDays}d ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  if (maxWeights.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
                <span className="text-xl">‹</span>
              </Button>
              <h1 className="text-lg font-bold text-foreground">Max Weights</h1>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <div className="text-7xl mb-6">💪</div>
          <h2 className="text-2xl font-bold text-foreground mb-3">Start building strength</h2>
          <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
            Complete your first workout to track your heaviest lifts
          </p>
          <Button size="lg" onClick={() => router.push("/workout")} className="font-semibold">
            Start First Workout
          </Button>
        </div>

        <BottomNav />
      </div>
    )
  }

  const totalMaxWeight = maxWeights.reduce((sum, record) => sum + record.maxWeight, 0)

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 bg-gradient-to-b from-background via-background to-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
              <span className="text-xl">‹</span>
            </Button>
            <h1 className="text-lg font-bold text-foreground">Max Weights</h1>
          </div>
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-2xl p-4 border border-primary/10">
            <div className="flex items-end gap-2">
              <div className="text-5xl font-black text-foreground">{totalMaxWeight.toLocaleString()}</div>
              <div className="text-lg font-medium text-muted-foreground pb-1">lbs total max</div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-2">
        {maxWeights.map((record) => (
          <Card
            key={record.exerciseName}
            className="overflow-hidden border-border/40 hover:border-border transition-colors"
          >
            <div className="px-4 py-4 flex items-center justify-between">
              <div className="flex-1 pr-4">
                <h2 className="text-base font-bold text-foreground leading-tight">{record.exerciseName}</h2>
                <p className="text-xs text-muted-foreground/70 mt-1">{formatDate(record.achievedAt)}</p>
              </div>

              <div className="text-right">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-black text-foreground tabular-nums">{record.maxWeight}</span>
                  <span className="text-base font-medium text-muted-foreground">lbs</span>
                </div>
                <p className="text-xs text-muted-foreground/60 mt-1">{record.reps} reps</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <BottomNav />
    </div>
  )
}
