"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { WorkoutRoutine } from "@/lib/routine-storage"
import { getLatestPerformance, saveWorkout } from "@/lib/workout-storage"
import {
  getCurrentInProgressSession,
  type WorkoutSession,
  saveSession,
  saveCurrentSessionId,
} from "@/lib/autosave-workout-storage"
import BottomNav from "@/components/bottom-nav"
import { ChevronLeft, Check, Pause, Play } from "lucide-react"
import ExerciseCard from "@/components/exercise-card"

type Exercise = {
  id: string
  name: string
  targetSets: number
  targetReps: string
  targetWeight?: string
  restTime: number
  completed: boolean
  sets: {
    reps: number
    weight: number
    completed: boolean
  }[]
  previousPerformance?: {
    weight: number
    avgReps: number
    progress: string
  }
}

function extractRestSeconds(notes?: string): number {
  if (!notes) return 90
  const minutes = notes.match(/rest\s*(\d+)\s*m/i)
  const seconds = notes.match(/rest\s*(\d+)\s*s/i)
  if (minutes) return Number(minutes[1]) * 60
  if (seconds) return Number(seconds[1])
  return 90
}

export default function WorkoutSessionComponent({ routine }: { routine: WorkoutRoutine }) {
  const router = useRouter()
  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [exercises, setExercises] = useState<any[]>([])
  const [elapsedMs, setElapsedMs] = useState(0)
  const [isHydrated, setIsHydrated] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [restState, setRestState] = useState<WorkoutSession["restTimer"]>(undefined)
  const lastTickRef = useRef<number | null>(null)
  const [showPlateCalc, setShowPlateCalc] = useState(() => {
    if (typeof window === "undefined") return true
    const savedPref = localStorage.getItem(`plate_viz_${routine.exercises[0]?.name}`)
    return savedPref !== null ? JSON.parse(savedPref) : true
  })

  useEffect(() => {
    const buildExercises = (seed?: any[]) => {
      if (seed && seed.length > 0) return seed
      return routine.exercises.map((exercise: any) => {
        const lastPerformance = getLatestPerformance(exercise.name)

        let previousPerformance = {
          weight: 0,
          avgReps: 0,
          progress: "First time",
        }

        if (lastPerformance) {
          const completedSets = lastPerformance.sets.filter((s: any) => s.completed)
          if (completedSets.length > 0) {
            const maxWeight = Math.max(...completedSets.map((s: any) => s.weight))
            const avgReps = Math.round(
              completedSets.reduce((acc: any, s: any) => acc + s.reps, 0) / completedSets.length
            )
            previousPerformance = {
              weight: maxWeight,
              avgReps,
              progress: "View history →",
            }
          }
        }

        const targetSets = exercise.targetSets ?? 3
        const targetReps = exercise.targetReps ?? "8-10"
        const restTime = extractRestSeconds(exercise.notes)

        return {
          id: exercise.id,
          name: exercise.name,
          targetSets,
          targetReps,
          targetWeight: exercise.targetWeight,
          restTime,
          completed: false,
          sets: Array.from({ length: targetSets }, () => ({
            reps: 0,
            weight: 0,
            completed: false,
          })),
          previousPerformance,
        }
      })
    }

    const initSession = async () => {
      const currentSession = getCurrentInProgressSession()
      if (currentSession) {
        const normalizedStatus =
          (currentSession as any).status === "active"
            ? "in_progress"
            : currentSession.status

        const normalizedSession: WorkoutSession = {
          ...currentSession,
          id: currentSession.id || (currentSession as any).sessionId || Date.now().toString(),
          status: normalizedStatus,
          activeDurationSeconds:
            currentSession.activeDurationSeconds ??
            Math.max(
              0,
              Math.floor(
                (Date.now() - new Date(currentSession.startedAt).getTime()) / 1000
              )
            ),
        }

        saveCurrentSessionId(normalizedSession.id)

        const now = Date.now()
        const lastActiveAt = normalizedSession.lastActiveAt
          ? new Date(normalizedSession.lastActiveAt).getTime()
          : null
        const additionalSeconds =
          normalizedSession.status === "in_progress" && lastActiveAt
            ? Math.floor((now - lastActiveAt) / 1000)
            : 0

        const updatedSession: WorkoutSession = {
          ...normalizedSession,
          activeDurationSeconds: Math.max(
            0,
            (normalizedSession.activeDurationSeconds || 0) + additionalSeconds
          ),
          lastActiveAt:
            normalizedSession.status === "in_progress" ? new Date().toISOString() : null,
        }

        setSession(updatedSession)
        setExercises(buildExercises(updatedSession.exercises))
        setRestState(updatedSession.restTimer)
        setElapsedMs((updatedSession.activeDurationSeconds || 0) * 1000)
        await saveSession(updatedSession)
        setIsHydrated(true)
      } else {
        const newSessionId = Date.now().toString()
        const newExercises = buildExercises()
        const newSession: WorkoutSession = {
          id: newSessionId,
          routineId: routine.id,
          routineName: routine.name,
          status: "in_progress",
          startedAt: new Date().toISOString(),
          activeDurationSeconds: 0,
          currentExerciseIndex: 0,
          exercises: newExercises,
          restTimer: undefined,
          lastActiveAt: new Date().toISOString(),
        }

        saveCurrentSessionId(newSessionId)
        setSession(newSession)
        setExercises(newExercises)
        setRestState(undefined)
        setElapsedMs(0)
        await saveSession(newSession)
        setIsHydrated(true)
      }
    }

    initSession()
  }, [routine])

  useEffect(() => {
    if (!isHydrated) return

    if (!session?.id) {
      // startSession(routine.id, routine.name)
    } else if (session.routineId !== routine.id) {
      // User is trying to start different workout - should handle via confirmation
      console.warn("[v0] Different routine detected, session mismatch")
    }
  }, [isHydrated, session?.id, session?.routineId, routine.id, routine.name])

  useEffect(() => {
    if (session?.status !== "in_progress") {
      lastTickRef.current = null
      return
    }

    lastTickRef.current = Date.now()

    const interval = setInterval(() => {
      const now = Date.now()
      const lastTick = lastTickRef.current ?? now
      const deltaSeconds = Math.max(0, Math.floor((now - lastTick) / 1000))
      if (deltaSeconds === 0) return

      lastTickRef.current = now
      setElapsedMs((prev) => prev + deltaSeconds * 1000)

      setSession((prev) => {
        if (!prev) return prev
        const updated = {
          ...prev,
          activeDurationSeconds: (prev.activeDurationSeconds || 0) + deltaSeconds,
          lastActiveAt: new Date().toISOString(),
        }
        saveSession(updated)
        return updated
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [session?.status])

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const currentExerciseIndex = session?.currentExerciseIndex || 0
  const currentExercise = exercises[currentExerciseIndex]
  const completedExercises = exercises.filter((e: any) => e.completed).length
  const totalExercises = exercises.length
  const progressPercentage = (completedExercises / totalExercises) * 100

  useEffect(() => {
    if (currentExercise?.name && typeof window !== "undefined") {
      const savedPref = localStorage.getItem(`plate_viz_${currentExercise.name}`)
      setShowPlateCalc(savedPref !== null ? JSON.parse(savedPref) : true)
    }
  }, [currentExercise?.name])

  const updateSetData = async (setIndex: number, field: "reps" | "weight", value: number) => {
    const newExercises = exercises.map((exercise: any, exerciseIdx: number) => {
      if (exerciseIdx !== currentExerciseIndex) {
        return exercise
      }

      const newSets = exercise.sets.map((set: any, idx: number) => {
        if (idx !== setIndex) {
          return set
        }

        const newSet = {
          ...set,
          [field]: value,
        }

        return newSet
      })

      return {
        ...exercise,
        sets: newSets,
      }
    })

    setExercises(newExercises)

    const updatedSession: WorkoutSession = {
      ...session,
      exercises: newExercises,
    }

    setSession(updatedSession)
    await saveSession(updatedSession)
  }

  const completeSet = async (setIndex: number) => {
    const newExercises = exercises.map((exercise: any, exerciseIdx: number) => {
      if (exerciseIdx !== currentExerciseIndex) {
        return exercise
      }

      const newSets = exercise.sets.map((set: any, idx: number) => {
        if (idx !== setIndex) {
          return set
        }

        const isCompleted = !set.completed

        return { ...set, completed: isCompleted }
      })

      const allSetsCompleted = newSets.every((set: any) => set.completed)

      return {
        ...exercise,
        sets: newSets,
        completed: allSetsCompleted,
      }
    })

    setExercises(newExercises)

    const updatedSession: WorkoutSession = {
      ...session,
      exercises: newExercises,
    }

    setSession(updatedSession)
    await saveSession(updatedSession)
  }

  const addSetToExercise = async () => {
    const exercise = exercises[currentExerciseIndex]
    const newSets = [
      ...exercise.sets,
      {
        reps: 0,
        weight: 0,
        completed: false,
      },
    ]

    const newExercises = exercises.map((exercise: any, exerciseIdx: number) => {
      if (exerciseIdx !== currentExerciseIndex) {
        return exercise
      }

      return {
        ...exercise,
        sets: newSets,
      }
    })

    setExercises(newExercises)

    const updatedSession: WorkoutSession = {
      ...session,
      exercises: newExercises,
    }

    setSession(updatedSession)
    await saveSession(updatedSession)
  }

  const deleteSetFromExercise = async (setIndex: number) => {
    const exercise = exercises[currentExerciseIndex]
    const newSets = exercise.sets.filter((_: any, idx: number) => idx !== setIndex)

    const newExercises = exercises.map((exercise: any, exerciseIdx: number) => {
      if (exerciseIdx !== currentExerciseIndex) {
        return exercise
      }

      return {
        ...exercise,
        sets: newSets,
      }
    })

    setExercises(newExercises)

    const updatedSession: WorkoutSession = {
      ...session,
      exercises: newExercises,
    }

    setSession(updatedSession)
    await saveSession(updatedSession)
  }

  const goToNextExercise = async () => {
    if (currentExerciseIndex < exercises.length - 1) {
      const newIndex = currentExerciseIndex + 1
      const updatedSession: WorkoutSession = {
        ...session,
        currentExerciseIndex: newIndex,
      }

      setSession(updatedSession)
      await saveSession(updatedSession)
    } else {
      finishWorkout()
    }
  }

  const goToPreviousExercise = async () => {
    if (currentExerciseIndex > 0) {
      const newIndex = currentExerciseIndex - 1
      const updatedSession: WorkoutSession = {
        ...session,
        currentExerciseIndex: newIndex,
      }

      setSession(updatedSession)
      await saveSession(updatedSession)
    }
  }

  const finishWorkout = async () => {
    const completedSets = exercises.reduce((total: number, ex: any) => {
      return total + ex.sets.filter((s: any) => s.completed).length
    }, 0)

    const totalSets = exercises.reduce((total: number, ex: any) => total + ex.sets.length, 0)

    const totalVolume = exercises.reduce((vol: number, ex: any) => {
      return (
        vol +
        ex.sets
          .filter((s: any) => s.completed)
          .reduce((sum: number, set: any) => {
            return sum + set.weight * set.reps
          }, 0)
      )
    }, 0)

    const totalReps = exercises.reduce((reps: number, ex: any) => {
      return reps + ex.sets.filter((s: any) => s.completed).reduce((sum: number, set: any) => sum + set.reps, 0)
    }, 0)

    const durationSeconds = Math.floor(elapsedMs / 1000)

    const completedWorkout = {
      id: session?.id!,
      name: routine.name,
      date: new Date(session?.startedAt!).toISOString(),
      duration: durationSeconds,
      exercises: exercises.map((ex: any) => ({
        id: ex.id,
        name: ex.name,
        targetSets: ex.targetSets,
        targetReps: ex.targetReps,
        targetWeight: ex.targetWeight,
        restTime: ex.restTime,
        completed: ex.completed,
        sets: ex.sets,
        previousPerformance: ex.previousPerformance,
      })),
      stats: {
        totalSets,
        completedSets,
        totalVolume,
        totalReps,
      },
    }

    await saveWorkout(completedWorkout)

    if (session) {
      const completedSession: WorkoutSession = {
        ...session,
        status: "completed",
        endedAt: new Date().toISOString(),
        restTimer: undefined,
        lastActiveAt: null,
        exercises,
      }
      await saveSession(completedSession)
    }

    saveCurrentSessionId(null)
    setSession(null)
    router.push(`/workout-summary?id=${completedWorkout.id}`)
  }

  const handleExit = async () => {
    if (session?.status === "in_progress") {
      const updatedSession: WorkoutSession = {
        ...session,
        status: "paused",
        lastActiveAt: null,
      }

      setSession(updatedSession)
      await saveSession(updatedSession)
    }
    router.push("/")
  }

  const togglePause = async () => {
    if (session?.status === "in_progress") {
      const updatedSession: WorkoutSession = {
        ...session,
        status: "paused",
        lastActiveAt: null,
      }

      setSession(updatedSession)
      await saveSession(updatedSession)
    } else if (session?.status === "paused") {
      const updatedSession: WorkoutSession = {
        ...session,
        status: "in_progress",
        lastActiveAt: new Date().toISOString(),
      }

      setSession(updatedSession)
      await saveSession(updatedSession)
    }
  }

  const handleTogglePlateCalc = () => {
    const newValue = !showPlateCalc
    setShowPlateCalc(newValue)
    if (currentExercise?.name && typeof window !== "undefined") {
      localStorage.setItem(`plate_viz_${currentExercise.name}`, JSON.stringify(newValue))
    }
  }

  if (!isHydrated || exercises.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading workout...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-[100dvh] overflow-hidden bg-background">
      {/* Minimal Header */}
      <div className="flex-shrink-0 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <Button variant="ghost" size="icon" className="h-10 w-10 -ml-2" onClick={handleExit}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="text-center flex-1">
              <h1 className="text-base font-semibold text-foreground">{routine.name}</h1>
              <div className="flex items-center justify-center gap-2 mt-0.5">
                <p className="text-sm text-muted-foreground tabular-nums">{formatTime(elapsedMs)}</p>
                {isSaving && <span className="text-xs text-muted-foreground">Saving...</span>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-10 w-10" onClick={togglePause}>
                {session?.status === "in_progress" ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-10 w-10 -mr-2" onClick={finishWorkout}>
                <Check className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <Progress value={progressPercentage} className="h-1" />
        </div>
      </div>

      <style jsx global>{`
        :root {
          --workout-footer-h: 80px;
          --bottom-nav-h: 68px;
        }
      `}</style>

      <div
        className="flex-1 overflow-y-auto"
        style={{
          paddingBottom:
            "calc(var(--workout-footer-h) + var(--bottom-nav-h) + env(safe-area-inset-bottom, 0px) + 16px)",
        }}
      >
        <div className="max-w-2xl mx-auto px-4 py-4">
          {/* Exercise Title */}
          <div className="mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Exercise {currentExerciseIndex + 1} of {totalExercises}
            </p>
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="text-xl font-bold text-foreground leading-tight">{currentExercise.name}</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleTogglePlateCalc}
                className="text-xs h-7 px-2 flex-shrink-0"
              >
                <span className="mr-1">🏋️</span>
                {showPlateCalc ? "Hide" : "Show"} plates
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {currentExercise.targetSets} sets × {currentExercise.targetReps} reps
            </p>
          </div>

          <ExerciseCard
            exercise={currentExercise}
            exerciseIndex={currentExerciseIndex}
            editable={true}
            showPlateCalc={showPlateCalc}
            restState={restState}
            onRestStateChange={async (nextState) => {
              setRestState(nextState || undefined)
              if (session) {
                const updatedSession: WorkoutSession = {
                  ...session,
                  restTimer: nextState || undefined,
                }
                setSession(updatedSession)
                await saveSession(updatedSession)
              }
            }}
            onUpdateSet={updateSetData}
            onCompleteSet={completeSet}
            onAddSet={addSetToExercise}
            onDeleteSet={deleteSetFromExercise}
          />
        </div>
      </div>

      {/* Workout Footer Buttons */}
      <div className="fixed bottom-0 left-0 right-0 z-50">
        <div className="bg-background border-t border-border" style={{ height: "var(--workout-footer-h)" }}>
          <div className="max-w-2xl mx-auto px-4 py-3 h-full flex items-center">
            <div className="flex gap-3 w-full">
              <Button
                variant="outline"
                className="flex-1 h-12 bg-transparent"
                onClick={goToPreviousExercise}
                disabled={currentExerciseIndex === 0}
              >
                Previous
              </Button>
              <Button
                className="flex-1 h-12 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={goToNextExercise}
              >
                {currentExerciseIndex === exercises.length - 1 ? "Finish" : "Next Exercise"}
              </Button>
            </div>
          </div>
        </div>

        {/* Bottom Navigation */}
        <div style={{ height: "var(--bottom-nav-h)" }} className="bg-background">
          <BottomNav fixed={false} />
        </div>
      </div>
    </div>
  )
}
