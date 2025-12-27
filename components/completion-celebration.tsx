"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { saveWorkout, type Exercise } from "@/lib/workout-storage"
import { isSetEligibleForStats } from "@/lib/set-validation"
import type { EvaluatedPR } from "@/lib/pr-types"
import PRBadge from "@/components/pr-badge"

type CompletionCelebrationProps = {
  exercises: Exercise[]
  onRestart: () => void
  workoutName?: string
  duration?: number // duration in minutes
}

export default function CompletionCelebration({
  exercises,
  onRestart,
  workoutName = "Workout",
  duration = 30, // Default to 30 minutes
}: CompletionCelebrationProps) {
  const router = useRouter()
  const [showCelebration, setShowCelebration] = useState(true)
  const [prs, setPRs] = useState<EvaluatedPR[]>([])
  const [saving, setSaving] = useState(true)

  const totalSets = exercises.reduce((acc, ex) => acc + ex.sets.length, 0)
  const completedSets = exercises.reduce(
    (acc, ex) => acc + ex.sets.filter((s) => isSetEligibleForStats(s)).length,
    0,
  )
  const totalVolume = exercises.reduce(
    (acc, ex) =>
      acc +
      ex.sets
        .filter((set) => isSetEligibleForStats(set))
        .reduce((sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0), 0),
    0,
  )
  const totalReps = exercises.reduce(
    (acc, ex) =>
      acc + ex.sets.filter((set) => isSetEligibleForStats(set)).reduce((sum, set) => sum + (set.reps ?? 0), 0),
    0,
  )

  useEffect(() => {
    const timer = setTimeout(() => setShowCelebration(false), 3000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const autoSave = async () => {
      try {
        const workout = {
          id: Date.now().toString(),
          name: workoutName,
          date: new Date().toISOString(),
          duration: duration * 60,
          exercises,
          stats: {
            totalSets,
            completedSets,
            totalVolume,
            totalReps,
          },
        }

        const evaluatedPRs = saveWorkout(workout)
        setPRs(evaluatedPRs)

        setSaving(false)
      } catch (error) {
        console.error("Error auto-saving workout:", error)
        setSaving(false)
      }
    }

    autoSave()
  }, [exercises, workoutName, totalSets, completedSets, totalVolume, totalReps, duration]) // Add duration to deps

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background flex items-center justify-center p-4">
      {showCelebration && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-primary rounded-full animate-fall"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${3 + Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="max-w-md w-full space-y-6 animate-in fade-in zoom-in duration-500">
        {/* Trophy Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground animate-in zoom-in duration-700">
            <span className="text-6xl">🏆</span>
          </div>
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">Workout Complete!</h1>
            <p className="text-muted-foreground">{saving ? "Saving workout..." : "Workout saved successfully"}</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4 text-center bg-gradient-to-br from-card to-primary/5 border-primary/20">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary mb-2">
              <span className="text-xl">🎯</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{completedSets}</p>
            <p className="text-xs text-muted-foreground">Sets Completed</p>
          </Card>

          <Card className="p-4 text-center bg-gradient-to-br from-card to-success/5 border-success/20">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-success/10 text-success mb-2">
              <span className="text-xl">📈</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{totalReps}</p>
            <p className="text-xs text-muted-foreground">Total Reps</p>
          </Card>

          <Card className="p-4 text-center bg-gradient-to-br from-card to-accent/5 border-accent/20">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-accent/10 text-accent mb-2">
              <span className="text-xl">🔥</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{totalVolume.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">lbs Volume</p>
          </Card>

          <Card className="p-4 text-center bg-gradient-to-br from-card to-chart-3/5 border-chart-3/20">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-chart-3/10 text-chart-3 mb-2">
              <span className="text-xl">🏆</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{exercises.length}</p>
            <p className="text-xs text-muted-foreground">Exercises</p>
          </Card>
        </div>

        {/* Exercise Summary */}
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-foreground">Exercise Summary</h3>
          <div className="space-y-2">
            {exercises.map((exercise, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{exercise.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {exercise.sets.filter((s) => isSetEligibleForStats(s)).length}/{exercise.sets.length} sets
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {exercise.sets
                      .filter((set) => isSetEligibleForStats(set))
                      .reduce((acc, set) => acc + (set.weight ?? 0) * (set.reps ?? 0), 0)}{" "}
                    lbs
                  </p>
                  <p className="text-xs text-muted-foreground">volume</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {!saving && prs.length > 0 && (
          <Card className="p-4 space-y-3 animate-in fade-in slide-in-from-bottom duration-500 bg-gradient-to-br from-success/10 to-success/5 border-success/30">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎉</span>
              <h3 className="font-bold text-foreground">
                {prs.length === 1 ? "New Personal Record!" : `${prs.length} Personal Records!`}
              </h3>
            </div>
            <div className="space-y-2">
              {prs.map((pr, idx) => (
                <PRBadge key={idx} pr={pr} compact />
              ))}
            </div>
          </Card>
        )}

        {!saving && prs.length === 0 && (
          <Card className="p-3 text-center bg-muted/50">
            <p className="text-sm text-muted-foreground">No new PRs today, but every rep counts!</p>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            size="lg"
            onClick={() => router.push("/")}
            disabled={saving}
          >
            {saving ? "Saving..." : "Return to Home"}
          </Button>
        </div>
      </div>
    </div>
  )
}
