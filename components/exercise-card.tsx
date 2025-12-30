"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import PlateVisualizer from "@/components/plate-visualizer"
import LastTimeCard from "@/components/last-time-card"
import { getExerciseHistory, getMostRecentSetPerformance } from "@/lib/workout-storage"
import {
  REP_MAX,
  REP_MIN,
  getSetFlags,
  isMissingReps,
  isMissingWeight,
  isSetEligibleForStats,
  isSetIncomplete,
} from "@/lib/set-validation"
import { Check, Trash2, X } from "lucide-react"

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
  editMode?: boolean
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
  editMode = false,
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
  const [isHydrated, setIsHydrated] = useState(false)
  const [repCapErrors, setRepCapErrors] = useState<Record<number, boolean>>({})
  const [showMissingForSet, setShowMissingForSet] = useState<Record<number, boolean>>({})
  const lastValidationTriggerRef = useRef<number | undefined>(undefined)

  const [activeRestTimer, setActiveRestTimer] = useState<number | null>(null)
  const [activeRestTime, setActiveRestTime] = useState(0)
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null)

  const [debouncedSets, setDebouncedSets] = useState(exercise.sets)
  const weightRefs = useRef<(HTMLInputElement | null)[]>([])
  const repsRefs = useRef<(HTMLInputElement | null)[]>([])
  const setCardRefs = useRef<(HTMLDivElement | null)[]>([])

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

  const currentSetIndex = activeSet

  useEffect(() => {
    const target = setCardRefs.current[currentSetIndex]
    if (target) {
      target.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }
  }, [currentSetIndex])


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

  const allSetsCompleted = exercise.sets.every((s) => s.completed)
  const mostRecentSet = getMostRecentSetPerformance(exercise.name, currentSetIndex)

  return (
    <div className="space-y-2">
      {editable && <div className="flex items-center justify-start px-1"></div>}

      {/* Sets display */}
      <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
        {exercise.sets.map((set, idx) => {
          const isCurrent = idx === currentSetIndex
          const isContext = Math.abs(idx - currentSetIndex) <= 1
          return (
            <div
              key={idx}
              ref={(el) => {
                setCardRefs.current[idx] = el
              }}
            >
              <Card
                className={`transition-all ${
                  isCurrent
                    ? "bg-card border border-border shadow-sm"
                    : set.completed
                      ? "bg-muted/20 border border-border/50"
                      : "bg-muted/30 border border-border/40"
                } ${isCurrent ? "p-4" : "p-3"} ${isContext ? "" : "opacity-60"}`}
              >
                <div className={`${isCurrent ? "space-y-3" : "space-y-2"}`}>
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
                  <div className="flex-1 min-w-[50px]">
                    <Input
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*[.]?[0-9]*"
                      value={set.weight ?? ""}
                      onChange={(e) => {
                        const val = e.target.value.trim()
                        const parsed = Number(val)
                        if (val === "" || (!isNaN(parsed) && parsed >= 0)) {
                          onUpdateSet(idx, "weight", val === "" ? null : parsed)
                        }
                      }}
                      onFocus={(e) => {
                        e.currentTarget.select()
                        if (set.id) onSetFieldFocus?.(set.id, "weight")
                      }}
                      onClick={(e) => e.currentTarget.select()}
                      onBlur={() => set.id && onSetFieldBlur?.(set.id, "weight")}
                      aria-invalid={showMissingForSet[idx] && isMissingWeight(set.weight)}
                      disabled={set.completed || !editable}
                      className={`${isCurrent ? "h-12 text-lg" : "h-10 text-sm"} text-center font-semibold`}
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
                </div>

                {/* Reps control */}
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <div className="flex-1 min-w-[50px]">
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
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
                      onFocus={(e) => {
                        e.currentTarget.select()
                        if (set.id) onSetFieldFocus?.(set.id, "reps")
                      }}
                      onClick={(e) => e.currentTarget.select()}
                      onBlur={() => set.id && onSetFieldBlur?.(set.id, "reps")}
                      aria-invalid={(showMissingForSet[idx] && isMissingReps(set.reps)) || repCapErrors[idx]}
                      disabled={set.completed || !editable}
                      className={`${isCurrent ? "h-12 text-lg" : "h-10 text-sm"} text-center font-semibold`}
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
                </div>

                {editable && (
                  <Button
                    variant={set.completed ? "outline" : "default"}
                    size="icon"
                    className={`h-8 w-8 flex-shrink-0 ${
                      set.completed ? "hover:bg-destructive hover:text-destructive-foreground" : ""
                    }`}
                    onClick={() => onCompleteSet(idx)}
                  >
                    {set.completed ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  </Button>
                )}

                {editable && editMode && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (set.completed) {
                        setConfirmDeleteIndex(idx)
                        return
                      }
                      onDeleteSet(idx)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
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

              {editable && isCurrent && (
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
            </div>
          )
        })}
      </div>

      {/* Last workout details removed per active session spec */}

      {/* All sets complete message */}
      {allSetsCompleted && (
        <div className="bg-success/10 border border-success/30 rounded-lg px-3 py-3 mt-3">
          <div className="flex items-center justify-center gap-2 text-success text-sm font-medium">
            <span>✓</span>
            <span>All sets complete</span>
          </div>
        </div>
      )}

      <AlertDialog open={confirmDeleteIndex !== null} onOpenChange={() => setConfirmDeleteIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete completed set?</AlertDialogTitle>
            <AlertDialogDescription>This will affect workout stats.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteIndex === null) return
                onDeleteSet(confirmDeleteIndex)
                setConfirmDeleteIndex(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
