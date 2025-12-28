"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import PlateVisualizer from "@/components/plate-visualizer"
import LastTimeCard from "@/components/last-time-card"
import {
  getExerciseHistory,
  getLatestPerformance,
  getMostRecentSetPerformance,
  getWorkoutHistory,
} from "@/lib/workout-storage"
import {
  REP_MAX,
  REP_MIN,
  getSetFlags,
  isMissingReps,
  isMissingWeight,
  isSetEligibleForStats,
  isSetIncomplete,
} from "@/lib/set-validation"
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
      id?: string
      reps: number | null
      weight: number | null
      completed: boolean
      validationFlags?: string[]
      isOutlier?: boolean
      isIncomplete?: boolean
    }[]
  }
  exerciseIndex: number
  editable?: boolean
  showPlateCalc?: boolean // Add prop for external control
  restState?: {
    exerciseIndex: number
    setIndex: number
    remainingSeconds: number
  }
  validationTrigger?: number
  pendingRemoteUpdates?: Record<string, boolean>
  onSetFieldFocus?: (setId: string, field: "reps" | "weight") => void
  onSetFieldBlur?: (setId: string, field: "reps" | "weight") => void
  onRestStateChange?: (nextState: ExerciseCardProps["restState"] | null) => void
  onUpdateSet: (setIndex: number, field: "reps" | "weight", value: number | null) => void
  onCompleteSet: (setIndex: number) => void
  onAddSet: () => void
  onDeleteSet: (setIndex: number) => void
}

export default function ExerciseCard({
  exercise,
  exerciseIndex,
  editable = true,
  showPlateCalc = true, // Use prop instead of internal state
  restState,
  validationTrigger,
  pendingRemoteUpdates,
  onSetFieldFocus,
  onSetFieldBlur,
  onRestStateChange,
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
  const [repCapErrors, setRepCapErrors] = useState<Record<number, boolean>>({})
  const [showMissingForSet, setShowMissingForSet] = useState<Record<number, boolean>>({})
  const lastValidationTriggerRef = useRef<number | undefined>(undefined)

  const [previousSets, setPreviousSets] = useState<{ reps: number; weight: number }[]>([])
  const [lastPerformed, setLastPerformed] = useState<string>("")
  const [activeRestTimer, setActiveRestTimer] = useState<number | null>(null)
  const [activeRestTime, setActiveRestTime] = useState(0)

  const [debouncedSets, setDebouncedSets] = useState(exercise.sets)
  const weightRefs = useRef<(HTMLInputElement | null)[]>([])
  const repsRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSets(exercise.sets)
    }, 300)
    return () => clearTimeout(timer)
  }, [exercise.sets])

  useEffect(() => {
    setRepCapErrors({})
    setShowMissingForSet({})
  }, [exercise.sets.length, exercise.name])

  useEffect(() => {
    setShowMissingForSet((prev) => {
      const next = { ...prev }
      exercise.sets.forEach((set, idx) => {
        if (!isSetIncomplete(set)) {
          delete next[idx]
        }
      })
      return next
    })
  }, [exercise.sets])

  const lastPerformance = useMemo(() => {
    return getLatestPerformance(exercise.name)
  }, [exercise.name])

  const lastWorkout = useMemo(() => {
    const normalizeName = (name: string) => name.toLowerCase().trim().replace(/\s+/g, " ")
    const history = getWorkoutHistory()
    const normalized = normalizeName(exercise.name)
    return (
      history.find((workout) =>
        workout.exercises.some((ex: any) => normalizeName(ex.name) === normalized)
      ) || null
    )
  }, [exercise.name])

  const currentPerformance = useMemo(() => {
    // Placeholder for computeCurrentPerformance logic
    return {}
  }, [debouncedSets])

  const historyReps = useMemo(() => {
    return getExerciseHistory(exercise.name).flatMap((workout) =>
      workout.exercises
        .filter((ex: any) => ex.name === exercise.name)
        .flatMap((ex: any) =>
          ex.sets.filter((set: any) => isSetEligibleForStats(set)).map((set: any) => set.reps ?? 0)
        )
    )
  }, [exercise.name])

  useEffect(() => {
    const firstIncomplete = exercise.sets.findIndex((s) => !s.completed)
    if (firstIncomplete !== -1 && activeSet !== firstIncomplete) {
      setActiveSet(firstIncomplete)
    }
  }, [exercise.sets, activeSet])

  useEffect(() => {
    const lastPerformance = getLatestPerformance(exercise.name)
    if (lastPerformance) {
      const completedSets = lastPerformance.sets.filter((s) => isSetEligibleForStats(s))
      setPreviousSets(
        completedSets.map((set) => ({
          reps: set.reps ?? 0,
          weight: set.weight ?? 0,
        })),
      )

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
        const next = activeRestTime - 1
        if (next <= 0) {
          setActiveRestTimer(null)
          setActiveRestTime(0)
          onRestStateChange?.(null)
          return
        }
        setActiveRestTime(next)
        onRestStateChange?.({
          exerciseIndex,
          setIndex: activeRestTimer,
          remainingSeconds: next,
        })
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [activeRestTimer, activeRestTime, exerciseIndex, onRestStateChange])

  useEffect(() => {
    return () => {
      setActiveRestTimer(null)
      setActiveRestTime(0)
    }
  }, [])

  useEffect(() => {
    if (!restState || restState.exerciseIndex !== exerciseIndex) {
      setActiveRestTimer(null)
      setActiveRestTime(0)
      return
    }
    setActiveRestTimer(restState.setIndex)
    setActiveRestTime(restState.remainingSeconds)
  }, [restState, exerciseIndex])

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

  const focusMissingFieldForSet = useCallback(
    (setIndex: number) => {
      const targetSet = exercise.sets[setIndex]
      if (!targetSet) return false
      if (isMissingReps(targetSet.reps)) {
        repsRefs.current[setIndex]?.focus()
        return true
      }
      if (isMissingWeight(targetSet.weight)) {
        weightRefs.current[setIndex]?.focus()
        return true
      }
      return false
    },
    [exercise.sets],
  )

  const focusFirstMissingField = useCallback(() => {
    const firstMissingIndex = exercise.sets.findIndex((set) => isSetIncomplete(set))
    if (firstMissingIndex === -1) return false
    return focusMissingFieldForSet(firstMissingIndex)
  }, [exercise.sets, focusMissingFieldForSet])

  const guardIncomplete = useCallback(
    (setIndex?: number) => {
      if (typeof setIndex === "number") {
        if (!isSetIncomplete(exercise.sets[setIndex])) return false
        setShowMissingForSet((prev) => ({ ...prev, [setIndex]: true }))
        focusMissingFieldForSet(setIndex)
        return true
      }
      const hasIncomplete = exercise.sets.some((set) => isSetIncomplete(set))
      if (!hasIncomplete) return false
      const nextMissing: Record<number, boolean> = {}
      exercise.sets.forEach((set, idx) => {
        if (isSetIncomplete(set)) {
          nextMissing[idx] = true
        }
      })
      setShowMissingForSet((prev) => ({ ...prev, ...nextMissing }))
      focusFirstMissingField()
      return true
    },
    [exercise.sets, focusFirstMissingField, focusMissingFieldForSet],
  )

  useEffect(() => {
    if (!validationTrigger) return
    if (lastValidationTriggerRef.current === validationTrigger) return
    lastValidationTriggerRef.current = validationTrigger
    const nextMissing: Record<number, boolean> = {}
    exercise.sets.forEach((set, idx) => {
      if (isSetIncomplete(set)) {
        nextMissing[idx] = true
      }
    })
    setShowMissingForSet((prev) => ({ ...prev, ...nextMissing }))
    focusFirstMissingField()
  }, [validationTrigger, focusFirstMissingField])

  const startRestTimer = (setIndex: number) => {
    if (guardIncomplete(setIndex)) return
    handleCompleteSet(setIndex)
    setActiveRestTimer(setIndex)
    setActiveRestTime(exercise.restTime)
    onRestStateChange?.({
      exerciseIndex,
      setIndex,
      remainingSeconds: exercise.restTime,
    })
  }

  const skipRest = () => {
    if (guardIncomplete(activeRestTimer ?? activeSet)) return
    setActiveRestTimer(null)
    setActiveRestTime(0)
    onRestStateChange?.(null)
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
                      onClick={() => onUpdateSet(idx, "weight", Math.max(0, (set.weight ?? 0) - 5))}
                      disabled={set.completed}
                    >
                      −
                    </Button>
                  )}
                  <div className="flex-1 min-w-[50px]">
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={set.weight ?? ""}
                      onChange={(e) => {
                        const val = e.target.value.trim()
                        const parsed = Number(val)
                        if (val === "" || (!isNaN(parsed) && parsed >= 0)) {
                          onUpdateSet(idx, "weight", val === "" ? null : parsed)
                        }
                      }}
                      onFocus={() => set.id && onSetFieldFocus?.(set.id, "weight")}
                      onBlur={() => set.id && onSetFieldBlur?.(set.id, "weight")}
                      aria-invalid={showMissingForSet[idx] && isMissingWeight(set.weight)}
                      disabled={set.completed || !editable}
                      className="h-8 text-center text-sm font-semibold"
                      placeholder="0"
                      ref={(el) => {
                        weightRefs.current[idx] = el
                      }}
                    />
                    <div className="mt-0.5 text-center">
                      <p className="text-[9px] text-muted-foreground">lbs</p>
                      {showMissingForSet[idx] && isMissingWeight(set.weight) && (
                        <p className="text-[9px] text-destructive">Missing weight</p>
                      )}
                    </div>
                  </div>
                  {editable && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0 bg-transparent"
                      onClick={() => onUpdateSet(idx, "weight", (set.weight ?? 0) + 5)}
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
                      onClick={() => {
                        const base = set.reps ?? REP_MIN
                        onUpdateSet(idx, "reps", Math.max(REP_MIN, base - 1))
                        setRepCapErrors((prev) => ({ ...prev, [idx]: false }))
                      }}
                      disabled={set.completed}
                    >
                      −
                    </Button>
                  )}
                  <div className="flex-1 min-w-[50px]">
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={set.reps ?? ""}
                      onChange={(e) => {
                        const val = e.target.value.trim()
                        const parsed = Number(val)
                        if (val === "") {
                          onUpdateSet(idx, "reps", null)
                          setRepCapErrors((prev) => ({ ...prev, [idx]: false }))
                          return
                        }
                        if (!Number.isNaN(parsed)) {
                          if (parsed > REP_MAX) {
                            setRepCapErrors((prev) => ({ ...prev, [idx]: true }))
                            return
                          }
                          const clamped = Math.max(REP_MIN, parsed)
                          onUpdateSet(idx, "reps", clamped)
                          setRepCapErrors((prev) => ({ ...prev, [idx]: false }))
                        }
                      }}
                      onFocus={() => set.id && onSetFieldFocus?.(set.id, "reps")}
                      onBlur={() => set.id && onSetFieldBlur?.(set.id, "reps")}
                      aria-invalid={(showMissingForSet[idx] && isMissingReps(set.reps)) || repCapErrors[idx]}
                      disabled={set.completed || !editable}
                      className="h-8 text-center text-sm font-semibold"
                      placeholder="0"
                      ref={(el) => {
                        repsRefs.current[idx] = el
                      }}
                    />
                    <div className="mt-0.5 text-center">
                      <p className="text-[9px] text-muted-foreground">reps</p>
                      {(repCapErrors[idx] || set.validationFlags?.includes("reps_hard_invalid")) && (
                        <p className="text-[9px] text-destructive">Max 40 reps</p>
                      )}
                      {!repCapErrors[idx] &&
                        !set.validationFlags?.includes("reps_hard_invalid") &&
                        showMissingForSet[idx] &&
                        isMissingReps(set.reps) && (
                        <p className="text-[9px] text-destructive">Missing reps</p>
                      )}
                    </div>
                  </div>
                  {editable && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0 bg-transparent"
                      onClick={() => {
                        const base = set.reps ?? REP_MIN - 1
                        onUpdateSet(idx, "reps", Math.min(REP_MAX, base + 1))
                        setRepCapErrors((prev) => ({ ...prev, [idx]: false }))
                      }}
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

              {(() => {
                const flagsResult = getSetFlags({
                  reps: set.reps,
                  weight: set.weight,
                  targetReps: exercise.targetReps,
                  historyReps,
                })
                const repOutlier =
                  set.isOutlier || set.validationFlags?.includes("rep_outlier") || flagsResult.flags.includes("rep_outlier")
                if (!repOutlier) return null
                const suggestedReps = flagsResult.suggestedReps
                const clampedSuggestion =
                  suggestedReps !== undefined ? Math.min(REP_MAX, Math.max(REP_MIN, suggestedReps)) : undefined
                return (
                  <div className="flex items-center justify-center gap-2 text-[10px] text-amber-600">
                    <span>⚠︎</span>
                    <span>Unusual reps</span>
                    {clampedSuggestion !== undefined && clampedSuggestion !== set.reps && (
                      <button
                        type="button"
                        className="px-1.5 py-0.5 rounded border border-amber-300 text-amber-700 bg-amber-50"
                        onClick={() => onUpdateSet(idx, "reps", clampedSuggestion)}
                      >
                        Use {clampedSuggestion}
                      </button>
                    )}
                  </div>
                )
              })()}

              {set.id && pendingRemoteUpdates?.[set.id] && (
                <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                  <span>↺</span>
                  <span>Updated on another device</span>
                </div>
              )}

              {editable && activeSet === idx && !set.completed && (
                <LastTimeCard
                  lastSetPerformance={getMostRecentSetPerformance(exercise.name, idx)}
                  currentSet={{ weight: set.weight ?? 0, reps: set.reps ?? 0 }}
                  setIndex={idx}
                />
              )}

              {isHydrated &&
                showPlateCalc &&
                activeSet === idx &&
                !set.completed &&
                editable &&
                typeof set.weight === "number" &&
                set.weight > 0 && (
                <div className="pt-2 mt-2 border-t bg-muted/30 -mx-2.5 px-2.5 pb-1 rounded-b-lg">
                  <PlateVisualizer targetWeight={set.weight} />
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Last workout details (full sets) */}
      {lastWorkout && (
        <Card className="p-3 bg-muted/30 border-muted/40">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Last workout
            </div>
            <div className="text-[10px] text-muted-foreground">
              {new Date(lastWorkout.date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </div>
          </div>
          <div className="space-y-1">
            {lastWorkout.exercises
              .find(
                (e: any) =>
                  e.name.toLowerCase().trim().replace(/\s+/g, " ") ===
                  exercise.name.toLowerCase().trim().replace(/\s+/g, " ")
              )
              ?.sets.filter((s: any) => isSetEligibleForStats(s))
              .map((set: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Set {idx + 1}</span>
                  <span className="font-medium text-foreground">
                    {set.weight} lbs × {set.reps}
                  </span>
                </div>
              ))}
          </div>
        </Card>
      )}

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
