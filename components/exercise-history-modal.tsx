"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { getExerciseHistory, calculateExerciseStats } from "@/lib/workout-storage"
import { isSetEligibleForStats } from "@/lib/set-validation"
import { useEffect, useState } from "react"

type ExerciseHistoryModalProps = {
  exerciseName: string
  onClose: () => void
}

export default function ExerciseHistoryModal({ exerciseName, onClose }: ExerciseHistoryModalProps) {
  const [history, setHistory] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    const exerciseHistory = getExerciseHistory(exerciseName)
    const exerciseStats = calculateExerciseStats(exerciseName)
    setHistory(exerciseHistory)
    setStats(exerciseStats)
  }, [exerciseName])

  const displayedHistory = showAll ? history : history.slice(0, 5)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card w-full sm:max-w-lg sm:rounded-lg rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">{exerciseName} History</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <span className="text-xl">✕</span>
          </Button>
        </div>

        <div className="p-4 space-y-4">
          {history.length > 0 && (
            <Card className="p-3 bg-primary/5">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Total Workouts</p>
                  <p className="text-lg font-bold text-foreground">{history.length}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">All-Time Max</p>
                  <p className="text-lg font-bold text-primary">
                    {Math.max(
                      ...history.flatMap(
                        (w) =>
                          w.exercises
                            .find((e: any) => e.name === exerciseName)
                            ?.sets.filter((s: any) => isSetEligibleForStats(s))
                            .map((s: any) => s.weight ?? 0) || [0],
                      ),
                    )}{" "}
                    lbs
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Sets</p>
                  <p className="text-lg font-bold text-foreground">
                    {history.reduce((acc, w) => {
                      const ex = w.exercises.find((e: any) => e.name === exerciseName)
                      return acc + (ex?.sets.filter((s: any) => isSetEligibleForStats(s)).length || 0)
                    }, 0)}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {stats && stats.length > 0 && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Weight Progression</h3>
              <div className="relative h-32">
                <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
                  <line x1="0" y1="0" x2="300" y2="0" stroke="currentColor" className="text-border" strokeWidth="0.5" />
                  <line
                    x1="0"
                    y1="25"
                    x2="300"
                    y2="25"
                    stroke="currentColor"
                    className="text-border"
                    strokeWidth="0.5"
                  />
                  <line
                    x1="0"
                    y1="50"
                    x2="300"
                    y2="50"
                    stroke="currentColor"
                    className="text-border"
                    strokeWidth="0.5"
                  />
                  <line
                    x1="0"
                    y1="75"
                    x2="300"
                    y2="75"
                    stroke="currentColor"
                    className="text-border"
                    strokeWidth="0.5"
                  />
                  <line
                    x1="0"
                    y1="100"
                    x2="300"
                    y2="100"
                    stroke="currentColor"
                    className="text-border"
                    strokeWidth="0.5"
                  />

                  <polyline
                    points={stats
                      .map((point: any, idx: number) => {
                        const x = (idx / (stats.length - 1)) * 300
                        const maxWeight = Math.max(...stats.map((p: any) => p.maxWeight))
                        const y = 100 - (point.maxWeight / maxWeight) * 100
                        return `${x},${y}`
                      })
                      .join(" ")}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="2"
                  />

                  {stats.map((point: any, idx: number) => {
                    const x = (idx / (stats.length - 1)) * 300
                    const maxWeight = Math.max(...stats.map((p: any) => p.maxWeight))
                    const y = 100 - (point.maxWeight / maxWeight) * 100
                    return (
                      <circle
                        key={idx}
                        cx={x}
                        cy={y}
                        r="3"
                        fill="hsl(var(--primary))"
                        className="cursor-pointer hover:r-4"
                      />
                    )
                  })}
                </svg>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                <span>{stats.length} workouts</span>
                <span>Max: {Math.max(...stats.map((p: any) => p.maxWeight))} lbs</span>
              </div>
            </Card>
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              {showAll ? "All Workouts" : "Recent Workouts"} ({history.length})
            </h3>
            {history.length === 0 ? (
              <Card className="p-4 text-center">
                <p className="text-sm text-muted-foreground">No previous workouts found</p>
                <p className="text-xs text-muted-foreground mt-1">This is your first time doing this exercise!</p>
              </Card>
            ) : (
              <>
                {displayedHistory.map((workout) => {
                  const exercise = workout.exercises.find((e: any) => e.name === exerciseName)
                  if (!exercise) return null

                  const completedSets = exercise.sets.filter((s: any) => isSetEligibleForStats(s))
                  const maxWeight = completedSets.length > 0 ? Math.max(...completedSets.map((s: any) => s.weight ?? 0)) : 0
                  const totalVolume = completedSets.reduce(
                    (acc: number, set: any) => acc + (set.weight ?? 0) * (set.reps ?? 0),
                    0,
                  )
                  const date = new Date(workout.date)

                  return (
                    <Card key={workout.id} className="p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-xs font-medium text-foreground">{workout.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-primary">{maxWeight} lbs</p>
                          <p className="text-[10px] text-muted-foreground">max</p>
                        </div>
                      </div>

                      <div className="space-y-1">
                        {completedSets.map((set: any, idx: number) => {
                          const volume = (set.weight ?? 0) * (set.reps ?? 0)
                          const isMaxWeight = (set.weight ?? 0) === maxWeight
                          return (
                            <div
                              key={idx}
                              className={`flex items-center justify-between text-xs py-1 px-2 rounded ${
                                isMaxWeight ? "bg-primary/10" : ""
                              }`}
                            >
                              <span className="text-muted-foreground">Set {idx + 1}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">
                                  {set.weight} lbs × {set.reps}
                                </span>
                                <span className="text-[10px] text-muted-foreground">{volume.toLocaleString()} lbs</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">Total Volume</span>
                        <span className="font-semibold text-foreground">{totalVolume.toLocaleString()} lbs</span>
                      </div>
                    </Card>
                  )
                })}

                {history.length > 5 && (
                  <Button variant="outline" size="sm" onClick={() => setShowAll(!showAll)} className="w-full mt-2">
                    {showAll ? `Show Less` : `Show All ${history.length} Workouts`}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
