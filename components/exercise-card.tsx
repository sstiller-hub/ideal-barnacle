"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import PlateVisualizer from "@/components/plate-visualizer"
import LastTimeCard from "@/components/last-time-card"
import { getLatestPerformance, getMostRecentSetPerformance } from "@/lib/workout-storage"
import Link from "next/link"

type ExerciseCardProps = {
  exercise: {
    id: string
    name: string
    targetSets: number
    targetReps: string
    targetWeight?: string
    restTime: number
    sets: {
      reps: number
      weight: number
      completed: boolean
    }[]
  }
  editable?: boolean
  showPlateCalc?: boolean // Add prop for external control
  onUpdateSet: (setIndex: number, field: "reps" | "weight", value: number) => void
  onCompleteSet: (setIndex: number) => void
  onAddSet: () => void
  onDeleteSet: (setIndex: number) => void
}

export default function ExerciseCard({
  exercise,
  editable = true,
  showPlateCalc = true, // Use prop instead of internal state
  onUpdateSet,
  onCompleteSet,
  onAddSet,
  onDeleteSet,
}: ExerciseCardProps) {
  const [activeSet, setActiveSet] = useState(() => {
    const firstIncomplete = exercise.sets.findIndex((s) => !s.completed)
    return firstIncomplete !== -1 ? firstIncomplete : 0
  })
  const [restingSet, setRestingSet] = useState<number | null>(null)
  const [restTimeRemaining, setRestTimeRemaining] = useState(exercise.restTime)
  const [isHydrated, setIsHydrated] = useState(false)

  const [previousSets, setPreviousSets] = useState<{ reps: number; weight: number }[]>([])
  const [lastPerformed, setLastPerformed] = useState<string>("")
  const [activeRestTimer, setActiveRestTimer] = useState<number | null>(null)
  const [activeRestTime, setActiveRestTime] = useState(0)

  const [debouncedSets, setDebouncedSets] = useState(exercise.sets)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSets(exercise.sets)
    }, 300)
    return () => clearTimeout(timer)
  }, [exercise.sets])

  const lastPerformance = useMemo(() => {
    return getLatestPerformance(exercise.name)
  }, [exercise.name])

  const currentPerformance = useMemo(() => {
    // Placeholder for computeCurrentPerformance logic
    return {}
  }, [debouncedSets])

  useEffect(() => {
    const firstIncomplete = exercise.sets.findIndex((s) => !s.completed)
    if (firstIncomplete !== -1 && activeSet !== firstIncomplete) {
      setActiveSet(firstIncomplete)
    }
  }, [exercise.sets, activeSet])

  useEffect(() => {
    const lastPerformance = getLatestPerformance(exercise.name)
    if (lastPerformance) {
      const completedSets = lastPerformance.sets.filter((s) => s.completed)
      setPreviousSets(completedSets)

      const history = typeof window !== "undefined" ? localStorage.getItem("workout_history") : null
      if (history) {
        const workouts = JSON.parse(history)
        const lastWorkout = workouts.find((w: any) => w.exercises.some((e: any) => e.name === exercise.name))
        if (lastWorkout) {
          const date = new Date(lastWorkout.date)
          setLastPerformed(date.toLocaleDateString("en-US", { month: "short", day: "numeric" }))
        }
      }
    }
  }, [exercise.name])

  useEffect(() => {
    if (activeRestTimer !== null && activeRestTime > 0) {
      const timer = setTimeout(() => {
        setActiveRestTime((prev) => {
          if (prev <= 1) {
            setActiveRestTimer(null)
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [activeRestTimer, activeRestTime])

  useEffect(() => {
    return () => {
      setActiveRestTimer(null)
      setActiveRestTime(0)
    }
  }, [])

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  const handleCompleteSet = useCallback(
    (setIndex: number) => {
      onCompleteSet(setIndex)
      setDebouncedSets(exercise.sets) // Immediate update on complete
    },
    [onCompleteSet, exercise.sets],
  )

  const startRestTimer = (setIndex: number) => {
    handleCompleteSet(setIndex)
    setActiveRestTimer(setIndex)
    setActiveRestTime(exercise.restTime)
  }

  const skipRest = () => {
    setActiveRestTimer(null)
    setActiveRestTime(0)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const allSetsCompleted = exercise.sets.every((s) => s.completed)

  return (
    <div className="space-y-2">
      {editable && <div className="flex items-center justify-start px-1"></div>}

      {activeRestTimer !== null && activeRestTime > 0 && (
        <Card className="p-4 bg-primary/10 border-primary/30">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">Rest Time</p>
            <p className="text-3xl font-bold tabular-nums text-foreground">{formatTime(activeRestTime)}</p>
            <Button variant="outline" size="sm" onClick={skipRest} className="mt-2 bg-transparent">
              Skip Rest
            </Button>
          </div>
        </Card>
      )}

      {/* Sets display */}
      <div className="space-y-2">
        {exercise.sets.map((set, idx) => (
          <Card
            key={idx}
            className={`p-2.5 transition-all ${
              activeSet === idx && !set.completed
                ? "ring-2 ring-primary bg-primary/5"
                : set.completed
                  ? "bg-success/10 border-success/30"
                  : "bg-card"
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {/* Set badge */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                    set.completed ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {set.completed ? "✓" : idx + 1}
                </div>

                {/* Weight control */}
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  {editable && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0 bg-transparent"
                      onClick={() => onUpdateSet(idx, "weight", Math.max(0, set.weight - 5))}
                      disabled={set.completed}
                    >
                      −
                    </Button>
                  )}
                  <div className="flex-1 min-w-[50px]">
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={set.weight === 0 ? "" : set.weight}
                      onChange={(e) => {
                        const val = e.target.value.trim()
                        const parsed = Number(val)
                        if (val === "" || (!isNaN(parsed) && parsed >= 0)) {
                          onUpdateSet(idx, "weight", val === "" ? 0 : parsed)
                        }
                      }}
                      disabled={set.completed || !editable}
                      className="h-8 text-center text-sm font-semibold"
                      placeholder="0"
                    />
                    <p className="text-[9px] text-muted-foreground text-center mt-0.5">lbs</p>
                  </div>
                  {editable && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0 bg-transparent"
                      onClick={() => onUpdateSet(idx, "weight", set.weight + 5)}
                      disabled={set.completed}
                    >
                      +
                    </Button>
                  )}
                </div>

                {/* Reps control */}
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  {editable && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0 bg-transparent"
                      onClick={() => onUpdateSet(idx, "reps", Math.max(0, set.reps - 1))}
                      disabled={set.completed}
                    >
                      −
                    </Button>
                  )}
                  <div className="flex-1 min-w-[50px]">
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={set.reps === 0 ? "" : set.reps}
                      onChange={(e) => {
                        const val = e.target.value.trim()
                        const parsed = Number(val)
                        if (val === "" || (!isNaN(parsed) && parsed >= 0)) {
                          onUpdateSet(idx, "reps", val === "" ? 0 : parsed)
                        }
                      }}
                      disabled={set.completed || !editable}
                      className="h-8 text-center text-sm font-semibold"
                      placeholder="0"
                    />
                    <p className="text-[9px] text-muted-foreground text-center mt-0.5">reps</p>
                  </div>
                  {editable && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0 bg-transparent"
                      onClick={() => onUpdateSet(idx, "reps", set.reps + 1)}
                      disabled={set.completed}
                    >
                      +
                    </Button>
                  )}
                </div>

                {/* Checkmark button inline */}
                {editable && (
                  <Button
                    variant={set.completed ? "outline" : "default"}
                    size="icon"
                    className={`h-8 w-8 flex-shrink-0 ${
                      set.completed ? "hover:bg-destructive hover:text-destructive-foreground" : ""
                    }`}
                    onClick={() => (set.completed ? onCompleteSet(idx) : startRestTimer(idx))}
                  >
                    {set.completed ? "✕" : "✓"}
                  </Button>
                )}
              </div>

              {editable && activeSet === idx && !set.completed && (
                <LastTimeCard
                  lastSetPerformance={getMostRecentSetPerformance(exercise.name, idx)}
                  currentSet={{ weight: set.weight, reps: set.reps }}
                  setIndex={idx}
                />
              )}

              {isHydrated && showPlateCalc && activeSet === idx && !set.completed && editable && set.weight > 0 && (
                <div className="pt-2 mt-2 border-t bg-muted/30 -mx-2.5 px-2.5 pb-1 rounded-b-lg">
                  <PlateVisualizer targetWeight={set.weight} />
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Previous performance link */}
      {previousSets.length > 0 && (
        <div className="pt-1">
          <Link
            href={`/exercise/${encodeURIComponent(exercise.name)}`}
            className="text-xs text-primary hover:underline flex items-center justify-center gap-1.5"
          >
            <span>📊</span>
            View exercise history
            {lastPerformed && <span className="text-muted-foreground">(last: {lastPerformed})</span>}
          </Link>
        </div>
      )}

      {/* All sets complete message */}
      {allSetsCompleted && (
        <div className="bg-success/10 border border-success/30 rounded-lg px-3 py-3 mt-3">
          <div className="flex items-center justify-center gap-2 text-success text-sm font-medium">
            <span>✓</span>
            <span>All sets complete</span>
          </div>
        </div>
      )}
    </div>
  )
}
