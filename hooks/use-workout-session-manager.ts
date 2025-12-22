"use client"

import { useState, useEffect, useCallback } from "react"
import {
  type WorkoutSession,
  type WorkoutSet,
  saveSession,
  saveSet,
  deleteSet,
  saveCurrentSessionId,
  getCurrentInProgressSession,
  getSetsForSession,
} from "@/lib/autosave-workout-storage"

export function useWorkoutSessionManager() {
  const [currentSession, setCurrentSession] = useState<WorkoutSession | null>(null)
  const [sets, setSets] = useState<WorkoutSet[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Load existing in-progress session on mount
  useEffect(() => {
    const existingSession = getCurrentInProgressSession()
    if (existingSession) {
      setCurrentSession(existingSession)
      const sessionSets = getSetsForSession(existingSession.id)
      setSets(sessionSets)
    }
    setIsLoading(false)
  }, [])

  // Start new workout session
  const startWorkout = useCallback((routineId?: string, routineName?: string) => {
    const newSession: WorkoutSession = {
      id: `session-${Date.now()}`,
      startedAt: new Date().toISOString(),
      status: "in_progress",
      routineId,
      routineName,
      activeDurationSeconds: 0,
    }

    saveSession(newSession)
    saveCurrentSessionId(newSession.id)
    setCurrentSession(newSession)
    setSets([])
  }, [])

  // Add a new set
  const addSet = useCallback(
    (exerciseName: string) => {
      if (!currentSession) return

      const exerciseSets = sets.filter((s) => s.exerciseName === exerciseName)
      const setNumber = exerciseSets.length + 1

      const newSet: WorkoutSet = {
        id: `set-${Date.now()}-${Math.random()}`,
        sessionId: currentSession.id,
        exerciseName,
        setNumber,
        weight: null,
        reps: null,
        rpe: null,
        isCompleted: false,
      }

      saveSet(newSet)
      setSets((prev) => [...prev, newSet])
    },
    [currentSession, sets],
  )

  // Update a set
  const updateSet = useCallback((setId: string, updates: Partial<WorkoutSet>) => {
    setSets((prev) => {
      const updated = prev.map((s) => (s.id === setId ? { ...s, ...updates } : s))

      // Save to localStorage
      const setToSave = updated.find((s) => s.id === setId)
      if (setToSave) {
        saveSet(setToSave)
      }

      return updated
    })
  }, [])

  // Remove a set
  const removeSet = useCallback((setId: string) => {
    deleteSet(setId)
    setSets((prev) => prev.filter((s) => s.id !== setId))
  }, [])

  // Update session duration
  const updateDuration = useCallback(
    (durationSeconds: number) => {
      if (!currentSession) return

      const updatedSession: WorkoutSession = {
        ...currentSession,
        activeDurationSeconds: durationSeconds,
      }

      saveSession(updatedSession)
      setCurrentSession(updatedSession)
    },
    [currentSession],
  )

  // Finish workout
  const finishWorkout = useCallback(() => {
    if (!currentSession) return

    const completedSession: WorkoutSession = {
      ...currentSession,
      status: "completed",
      endedAt: new Date().toISOString(),
    }

    saveSession(completedSession)
    saveCurrentSessionId(null)
    setCurrentSession(null)
    setSets([])
  }, [currentSession])

  // Cancel workout
  const cancelWorkout = useCallback(() => {
    if (!currentSession) return

    saveCurrentSessionId(null)
    setCurrentSession(null)
    setSets([])
  }, [currentSession])

  // Get sets grouped by exercise
  const getSetsByExercise = useCallback(() => {
    const grouped = new Map<string, WorkoutSet[]>()

    sets.forEach((set) => {
      const existing = grouped.get(set.exerciseName) || []
      grouped.set(set.exerciseName, [...existing, set])
    })

    return grouped
  }, [sets])

  const updateExerciseIndex = useCallback(
    (exerciseIndex: number) => {
      if (!currentSession) return

      const updatedSession: WorkoutSession = {
        ...currentSession,
        currentExerciseIndex: exerciseIndex,
      }

      saveSession(updatedSession)
      setCurrentSession(updatedSession)
    },
    [currentSession],
  )

  return {
    currentSession,
    sets,
    isLoading,
    startWorkout,
    addSet,
    updateSet,
    removeSet,
    finishWorkout,
    cancelWorkout,
    getSetsByExercise,
    updateDuration,
    updateExerciseIndex,
  }
}
