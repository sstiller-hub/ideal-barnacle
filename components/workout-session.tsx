"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { WorkoutRoutine } from "@/lib/routine-storage"
import { getLatestPerformance, saveWorkout } from "@/lib/workout-storage"
import {
  getCurrentInProgressSession,
  saveSession,
  saveCurrentSessionId,
  getSetsForSession,
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
  const [session, setSession] = useState<any | null>(null)
  const [exercises, setExercises] = useState<any[]>([])
  const [elapsedMs, setElapsedMs] = useState(0)
  const [isHydrated, setIsHydrated] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showPlateCalc, setShowPlateCalc] = useState(() => {
    if (typeof window === "undefined") return true
    const savedPref = localStorage.getItem(`plate_viz_${routine.exercises[0]?.name}`)
    return savedPref !== null ? JSON.parse(savedPref) : true
  })

  useEffect(() => {
    const initSession = async () => {
      const currentSession = await getCurrentInProgressSession()
      if (currentSession) {
        setSession(currentSession)
        // Load exercises from session if they exist
        if (currentSession.exercises) {
          setExercises(currentSession.exercises)
        }
        setIsHydrated(true)
      } else {
        const newSessionId = Date.now().toString()
        saveCurrentSessionId(newSessionId)
        const newSession = {
          sessionId: newSessionId,
          routineId: routine.id,
          status: "active",
          startedAt: new Date().toISOString(),
          currentExerciseIndex: 0,
          exercises: [], // Initialize exercises array
        }
        setSession(newSession)
        await saveSession(newSession)
        setIsHydrated(true)
      }
    }

    initSession()
  }, [routine])

  useEffect(() => {
    if (!isHydrated) return

    if (!session?.sessionId) {
      // startSession(routine.id, routine.name)
    } else if (session.routineId !== routine.id) {
      // User is trying to start different workout - should handle via confirmation
      console.warn("[v0] Different routine detected, session mismatch")
    }
  }, [isHydrated, session?.sessionId, session?.routineId, routine.id, routine.name])

  useEffect(() => {
    if (session?.status !== "active") {
      return
    }

    const startTime = new Date(session.startedAt).getTime()

    const interval = setInterval(() => {
      const now = Date.now()
      const elapsed = now - startTime
      setElapsedMs(elapsed)
    }, 100)

    return () => clearInterval(interval)
  }, [session?.status, session?.startedAt])

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  useEffect(() => {
    const initialExercises: any[] = routine.exercises.map((exercise: any) => {
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
          const avgReps = Math.round(completedSets.reduce((acc: any, s: any) => acc + s.reps, 0) / completedSets.length)
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

      const sessionSets = getSetsForSession(session?.sessionId || "")

      return {
        id: exercise.id,
        name: exercise.name,
        targetSets,
        targetReps,
        targetWeight: exercise.targetWeight,
        restTime,
        completed: false,
        sets:
          sessionSets.length > 0
            ? sessionSets.map((s: any) => ({
                reps: s.reps ?? 0,
                weight: s.weight ?? 0,
                completed: s.isCompleted,
              }))
            : Array.from({ length: targetSets }, () => ({
                reps: 0,
                weight: 0,
                completed: false,
              })),
        previousPerformance,
      }
    })
    setExercises(initialExercises)
  }, [routine, session?.sessionId])

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

    const updatedSession = {
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

    const updatedSession = {
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

    const updatedSession = {
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

    const updatedSession = {
      ...session,
      exercises: newExercises,
    }

    setSession(updatedSession)
    await saveSession(updatedSession)
  }

  const goToNextExercise = async () => {
    if (currentExerciseIndex < exercises.length - 1) {
      const newIndex = currentExerciseIndex + 1
      const updatedSession = {
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
      const updatedSession = {
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

    const durationMinutes = Math.floor(elapsedMs / 60000)

    const completedWorkout = {
      id: session?.sessionId!,
      name: routine.name,
      date: new Date(session?.startedAt!).toISOString(),
      duration: durationMinutes,
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

    saveCurrentSessionId(null)
    setSession(null)
    router.push(`/workout-summary?id=${completedWorkout.id}`)
  }

  const handleExit = async () => {
    if (session?.status === "active") {
      const updatedSession = {
        ...session,
        status: "paused",
      }

      setSession(updatedSession)
      await saveSession(updatedSession)
    }
    router.push("/")
  }

  const togglePause = async () => {
    if (session?.status === "active") {
      const updatedSession = {
        ...session,
        status: "paused",
      }

      setSession(updatedSession)
      await saveSession(updatedSession)
    } else if (session?.status === "paused") {
      const updatedSession = {
        ...session,
        status: "active",
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
                {session?.status === "active" ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
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
            editable={true}
            showPlateCalc={showPlateCalc}
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
