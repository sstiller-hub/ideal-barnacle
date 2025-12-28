"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import type { WorkoutRoutine } from "@/lib/routine-storage"
import { getExerciseHistory, getLatestPerformance, getWorkoutHistory, saveWorkout } from "@/lib/workout-storage"
import { toast } from "sonner"
import {
  getDefaultSetValues,
  getSetFlags,
  isIncomplete,
  isSetEligibleForStats,
  isSetIncomplete,
} from "@/lib/set-validation"
import { getOrCreateActiveSession, upsertSet } from "@/lib/supabase-session-sync"
import { supabase } from "@/lib/supabase"
import { isWarmupExercise } from "@/lib/exercise-heuristics"
import {
  getCurrentInProgressSession,
  deleteSession,
  deleteSetsForSession,
  type WorkoutSession,
  saveSession,
  saveCurrentSessionId,
} from "@/lib/autosave-workout-storage"
import BottomNav from "@/components/bottom-nav"
import { ChevronLeft, Check, Pause, Play, PencilLine, Plus } from "lucide-react"
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
    id: string
    reps: number | null
    weight: number | null
    completed: boolean
    validationFlags?: string[]
    isOutlier?: boolean
    isIncomplete?: boolean
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
  const [isFinishing, setIsFinishing] = useState(false)
  const [restState, setRestState] = useState<WorkoutSession["restTimer"]>(undefined)
  const [validationTrigger, setValidationTrigger] = useState(0)
  const [editSetsByExerciseId, setEditSetsByExerciseId] = useState<Record<string, boolean>>({})
  const [addHoldProgress, setAddHoldProgress] = useState(0)
  const addHoldTimeoutRef = useRef<number | null>(null)
  const addHoldRafRef = useRef<number | null>(null)
  const addHoldStartRef = useRef<number | null>(null)
  const [uiNow, setUiNow] = useState(() => Date.now())
  const restStartAtRef = useRef<number | null>(null)
  const [inlineNoteDraft, setInlineNoteDraft] = useState("")
  const [showPlateCalc, setShowPlateCalc] = useState(() => {
    if (typeof window === "undefined") return true
    const savedPref = localStorage.getItem(`plate_viz_${routine.exercises[0]?.name}`)
    return savedPref !== null ? JSON.parse(savedPref) : true
  })
  const lastSeenSetUpdatedAtRef = useRef<Map<string, string>>(new Map())
  const lastSeenSessionUpdatedAtRef = useRef<Map<string, string>>(new Map())
  const [editingSetId, setEditingSetId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<"reps" | "weight" | null>(null)
  const editingSetIdRef = useRef<string | null>(null)
  const editingFieldRef = useRef<"reps" | "weight" | null>(null)
  const [pendingRemoteUpdates, setPendingRemoteUpdates] = useState<Record<string, boolean>>({})

  const generateSetId = () => {
    const c: Crypto | undefined = typeof globalThis !== "undefined" ? globalThis.crypto : undefined
    return c?.randomUUID ? c.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )

  const generateWorkoutId = () => {
    const c: Crypto | undefined = typeof globalThis !== "undefined" ? globalThis.crypto : undefined
    return c?.randomUUID ? c.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  const getElapsedMs = (targetSession: WorkoutSession | null, now = Date.now()) => {
    if (!targetSession) return 0
    const baseMs = (targetSession.activeDurationSeconds || 0) * 1000
    if (targetSession.status !== "in_progress") return baseMs
    if (!targetSession.lastActiveAt) return baseMs
    const lastActiveAtMs = new Date(targetSession.lastActiveAt).getTime()
    const deltaMs = Math.max(0, now - lastActiveAtMs)
    return baseMs + deltaMs
  }

  const commitActiveDuration = (targetSession: WorkoutSession): number => {
    return Math.floor(getElapsedMs(targetSession) / 1000)
  }

  const isGhostSet = (set: any) => {
    const repsEmpty = set.reps === null || set.reps === undefined || set.reps === 0
    const weightEmpty = set.weight === null || set.weight === undefined || set.weight === 0
    return !set.completed && repsEmpty && weightEmpty
  }

  useEffect(() => {
    const buildExercises = (seed?: any[]) => {
      if (seed && seed.length > 0) {
        return seed.map((exercise: any) => ({
          ...exercise,
          sets: Array.isArray(exercise.sets)
            ? exercise.sets.map((set: any) => ({
                ...set,
                id: set.id || generateSetId(),
              }))
            : [],
        }))
      }
      return routine.exercises.map((exercise: any) => {
        const lastPerformance = getLatestPerformance(exercise.name)

        let previousPerformance = {
          weight: 0,
          avgReps: 0,
          progress: "First time",
        }

        if (lastPerformance) {
          const completedSets = lastPerformance.sets.filter((s: any) => isSetEligibleForStats(s))
          if (completedSets.length > 0) {
            const maxWeight = Math.max(...completedSets.map((s: any) => s.weight ?? 0))
            const avgReps = Math.round(
              completedSets.reduce((acc: any, s: any) => acc + (s.reps ?? 0), 0) / completedSets.length
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

        const isWarmup = isWarmupExercise(exercise.name)
        const normalizeName = (name: string) => name.toLowerCase().trim().replace(/\s+/g, " ")
        const exerciseHistory = getExerciseHistory(exercise.name)
        const normalizedHistory =
          exerciseHistory.length > 0
            ? exerciseHistory
            : getWorkoutHistory().filter((workout) =>
                workout.exercises.some(
                  (ex: any) => normalizeName(ex.name) === normalizeName(exercise.name)
                )
              )

        const historyReps = normalizedHistory.flatMap((workout) =>
          workout.exercises
            .filter((ex: any) => normalizeName(ex.name) === normalizeName(exercise.name))
            .flatMap((ex: any) =>
              ex.sets
                .filter((set: any) => isSetEligibleForStats(set))
                .map((set: any) => set.reps)
                .filter((reps: any) => typeof reps === "number")
            )
        )
        const defaults = getDefaultSetValues({
          sets: [],
          targetReps,
          targetWeight: exercise.targetWeight,
        })

        const warmupDefaults = (() => {
          const lastWorkout = normalizedHistory.find((workout) =>
            workout.exercises.some(
              (ex: any) => normalizeName(ex.name) === normalizeName(exercise.name)
            )
          )
          if (!lastWorkout) return defaults
          const lastExercise = lastWorkout.exercises.find(
            (ex: any) => normalizeName(ex.name) === normalizeName(exercise.name)
          )
          if (!lastExercise?.sets) return defaults
          const firstEligible = lastExercise.sets.find(
            (set: any) =>
              isSetEligibleForStats(set) && set.reps !== null && set.reps !== undefined && set.weight !== null && set.weight !== undefined
          )
          if (!firstEligible) return defaults
          return { reps: firstEligible.reps, weight: firstEligible.weight }
        })()

        const defaultFlags = getSetFlags({
          reps: defaults.reps,
          weight: defaults.weight,
          targetReps,
          historyReps,
        })

        const warmupSets: Array<{
          id: string
          reps: number | null
          weight: number | null
          completed: boolean
          isOutlier: boolean
          validationFlags: string[]
          isIncomplete: boolean
        }> = []
        for (let idx = 0; idx < targetSets; idx += 1) {
          const prev = warmupSets[idx - 1]
          const reps = prev?.reps ?? warmupDefaults.reps ?? null
          const weight = prev?.weight ?? warmupDefaults.weight ?? null
          const warmupFlags = getSetFlags({
            reps,
            weight,
            targetReps,
            historyReps,
          }).flags.filter((flag) => flag !== "rep_outlier")
          warmupSets.push({
            id: generateSetId(),
            reps,
            weight,
            completed: false,
            isOutlier: false,
            validationFlags: warmupFlags,
            isIncomplete: isIncomplete(warmupFlags),
          })
        }

        return {
          id: exercise.id,
          name: exercise.name,
          targetSets,
          targetReps,
          targetWeight: exercise.targetWeight,
          restTime,
          completed: false,
          sets: isWarmup
            ? warmupSets
            : Array.from({ length: targetSets }, () => ({
                id: generateSetId(),
                reps: defaults.reps,
                weight: defaults.weight,
                completed: false,
                isOutlier: defaultFlags.flags.includes("rep_outlier"),
                validationFlags: defaultFlags.flags,
                isIncomplete: defaultFlags.isIncomplete,
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
            normalizedSession.status === "in_progress" ? new Date().toISOString() : undefined,
        }

        setSession(updatedSession)
        setExercises(buildExercises(updatedSession.exercises))
        setRestState(updatedSession.restTimer)
        setElapsedMs(getElapsedMs(updatedSession))
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
        setElapsedMs(getElapsedMs(newSession))
        await saveSession(newSession)
        setIsHydrated(true)
      }

      const remote = await getOrCreateActiveSession()
      if (remote) {
        setSession((prev) => {
          if (!prev) return prev
          const updated = { ...prev, remoteSessionId: remote.id }
          saveSession(updated)
          return updated
        })
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
    if (!session) {
      setElapsedMs(0)
      return
    }

    setElapsedMs(getElapsedMs(session))

    if (session.status !== "in_progress") {
      return
    }

    const interval = setInterval(() => {
      setElapsedMs(getElapsedMs(session))
    }, 1000)

    return () => clearInterval(interval)
  }, [session?.id, session?.status, session?.lastActiveAt, session?.activeDurationSeconds])

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
  const isEditMode = currentExercise ? Boolean(editSetsByExerciseId[currentExercise.id]) : false
  const firstIncompleteIndex =
    currentExercise?.sets?.findIndex((set: any) => !set.completed) ?? -1
  const currentSetIndex = firstIncompleteIndex === -1 ? 0 : firstIncompleteIndex
  const isResting =
    Boolean(restState) &&
    restState?.exerciseIndex === currentExerciseIndex &&
    typeof restState?.remainingSeconds === "number"
  const allSetsCompleted = currentExercise?.sets?.every((set: any) => set.completed) ?? false

  const formatSeconds = (seconds: number) => formatTime(seconds * 1000)

  const restRemainingSeconds = (() => {
    if (!isResting || !restState) return 0
    const startAt = restStartAtRef.current ?? uiNow
    const elapsed = Math.floor((uiNow - startAt) / 1000)
    return Math.max(0, restState.remainingSeconds - elapsed)
  })()

  const setRestStateAndPersist = async (
    nextState: WorkoutSession["restTimer"] | null
  ) => {
    restStartAtRef.current = nextState ? Date.now() : null
    setRestState(nextState || undefined)
    if (session) {
      const updatedSession: WorkoutSession = {
        ...session,
        restTimer: nextState || undefined,
      }
      setSession(updatedSession)
      await saveSession(updatedSession)
    }
  }

  const handlePrimaryAction = async () => {
    if (!session || !currentExercise) return
    if (currentSetIndex < 0 || currentSetIndex >= currentExercise.sets.length) return
    if (isSetIncomplete(currentExercise.sets[currentSetIndex])) {
      setValidationTrigger(Date.now())
      return
    }
    await completeSet(currentSetIndex)
    if (currentExercise.restTime > 0) {
      await setRestStateAndPersist({
        exerciseIndex: currentExerciseIndex,
        setIndex: currentSetIndex,
        remainingSeconds: currentExercise.restTime,
      })
    }
  }

  useEffect(() => {
    if (!isResting) return
    const interval = setInterval(() => {
      setUiNow(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [isResting])

  useEffect(() => {
    if (!isResting) return
    if (restRemainingSeconds <= 0) {
      void setRestStateAndPersist(null)
    }
  }, [isResting, restRemainingSeconds])

  useEffect(() => {
    if (currentExercise?.name && typeof window !== "undefined") {
      const savedPref = localStorage.getItem(`plate_viz_${currentExercise.name}`)
      setShowPlateCalc(savedPref !== null ? JSON.parse(savedPref) : true)
    }
  }, [currentExercise?.name])

  useEffect(() => {
    cancelAddHold()
  }, [currentExerciseIndex])

  useEffect(() => {
    setInlineNoteDraft(currentExercise?.sessionNote ?? "")
  }, [currentExerciseIndex, currentExercise?.sessionNote])

  useEffect(() => {
    if (!session?.remoteSessionId) return

    const channel = supabase.channel(`workout-session-${session.remoteSessionId}`)

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "workout_sets",
        filter: `session_id=eq.${session.remoteSessionId}`,
      },
      (payload) => {
        const row = payload.new as any
        if (!row?.id || !row.updated_at) return
        const lastSeen = lastSeenSetUpdatedAtRef.current.get(row.id)
        if (lastSeen && new Date(row.updated_at).getTime() <= new Date(lastSeen).getTime()) {
          return
        }
        lastSeenSetUpdatedAtRef.current.set(row.id, row.updated_at)

        setExercises((prev) => {
          const next = prev.map((exercise) => {
            if (exercise.id !== row.exercise_id) return exercise
            const updatedSets = [...exercise.sets]
            const existingIndex = updatedSets.findIndex((set: any) => set.id === row.id)
            const existingSet = existingIndex >= 0 ? updatedSets[existingIndex] : null
            const incomingReps = row.reps
            const incomingWeight = row.weight
            const isEditingSame = editingSetIdRef.current === row.id && editingFieldRef.current
            let mergedReps = incomingReps
            let mergedWeight = incomingWeight
            if (existingSet && isEditingSame) {
              if (editingFieldRef.current === "reps" && incomingReps !== existingSet.reps) {
                mergedReps = existingSet.reps
                setPendingRemoteUpdates((prevPending) => ({ ...prevPending, [row.id]: true }))
              }
              if (editingFieldRef.current === "weight" && incomingWeight !== existingSet.weight) {
                mergedWeight = existingSet.weight
                setPendingRemoteUpdates((prevPending) => ({ ...prevPending, [row.id]: true }))
              }
            }

            const flagsResult = row.validation_flags
              ? { flags: row.validation_flags, isIncomplete: isIncomplete(row.validation_flags) }
              : getSetFlags({
                  reps: mergedReps,
                  weight: mergedWeight,
                  targetReps: exercise.targetReps,
                  historyReps: getExerciseHistory(exercise.name).flatMap((workout) =>
                    workout.exercises
                      .filter((ex: any) => ex.name === exercise.name)
                      .flatMap((ex: any) =>
                        ex.sets.filter((set: any) => isSetEligibleForStats(set)).map((set: any) => set.reps ?? 0)
                      )
                  ),
                })

            const nextSet = {
              ...(existingSet ?? {}),
              id: row.id,
              reps: mergedReps,
              weight: mergedWeight,
              completed: row.completed,
              validationFlags: row.validation_flags ?? flagsResult.flags,
              isIncomplete: flagsResult.isIncomplete ?? false,
              isOutlier: (row.validation_flags ?? flagsResult.flags)?.includes?.("rep_outlier"),
            }
            if (existingIndex >= 0) {
              updatedSets[existingIndex] = { ...updatedSets[existingIndex], ...nextSet }
            } else if (typeof row.set_index === "number" && row.set_index >= 0) {
              updatedSets.splice(row.set_index, 0, nextSet)
            } else {
              updatedSets.push(nextSet)
            }
            return { ...exercise, sets: updatedSets }
          })
          return next
        })
      }
    )

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "workout_sessions",
        filter: `id=eq.${session.remoteSessionId}`,
      },
      (payload) => {
        const row = payload.new as any
        if (!row?.id || !row.updated_at) return
        const lastSeen = lastSeenSessionUpdatedAtRef.current.get(row.id)
        if (lastSeen && new Date(row.updated_at).getTime() <= new Date(lastSeen).getTime()) {
          return
        }
        lastSeenSessionUpdatedAtRef.current.set(row.id, row.updated_at)
        setSession((prev) => {
          if (!prev) return prev
          if (row.status && row.status !== prev.status) {
            const updated = {
              ...prev,
              status: row.status === "active" ? "in_progress" : row.status,
            }
            saveSession(updated)
            return updated
          }
          return prev
        })
      }
    )

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session?.remoteSessionId])

  const updateSetData = async (setIndex: number, field: "reps" | "weight", value: number | null) => {
    if (!session) return
    const newExercises = exercises.map((exercise: any, exerciseIdx: number) => {
      if (exerciseIdx !== currentExerciseIndex) {
        return exercise
      }

      const historyReps = getExerciseHistory(exercise.name).flatMap((workout) =>
        workout.exercises
          .filter((ex: any) => ex.name === exercise.name)
          .flatMap((ex: any) =>
            ex.sets.filter((set: any) => isSetEligibleForStats(set)).map((set: any) => set.reps ?? 0)
          )
      )

      const newSets = exercise.sets.map((set: any, idx: number) => {
        if (idx !== setIndex) {
          return set
        }

        const newSet = {
          ...set,
          [field]: value,
        }

        const flagsResult = getSetFlags({
          reps: newSet.reps,
          weight: newSet.weight,
          targetReps: exercise.targetReps,
          historyReps,
        })

        const updatedSet = {
          ...newSet,
          isOutlier: flagsResult.flags.includes("rep_outlier"),
          validationFlags: flagsResult.flags,
          isIncomplete: flagsResult.isIncomplete,
        }
        if (session?.remoteSessionId) {
          void upsertSet({
            sessionId: session.remoteSessionId,
            setId: updatedSet.id,
            exerciseId: exercise.id,
            setIndex: idx,
            reps: updatedSet.reps,
            weight: updatedSet.weight,
            completed: updatedSet.completed,
            validationFlags: updatedSet.validationFlags,
          }).then(() => {
            setPendingRemoteUpdates((prev) => {
              if (!prev[updatedSet.id]) return prev
              const next = { ...prev }
              delete next[updatedSet.id]
              return next
            })
          })
        }
        return updatedSet
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
    if (!session) return
    const newExercises = exercises.map((exercise: any, exerciseIdx: number) => {
      if (exerciseIdx !== currentExerciseIndex) {
        return exercise
      }

      const historyReps = getExerciseHistory(exercise.name).flatMap((workout) =>
        workout.exercises
          .filter((ex: any) => ex.name === exercise.name)
          .flatMap((ex: any) => ex.sets.filter((set: any) => isSetEligibleForStats(set)).map((set: any) => set.reps ?? 0))
      )

      const newSets = exercise.sets.map((set: any, idx: number) => {
        if (idx !== setIndex) {
          return set
        }

        const isCompleted = !set.completed
        const flagsResult = getSetFlags({
          reps: set.reps,
          weight: set.weight,
          targetReps: exercise.targetReps,
          historyReps,
        })

        const updatedSet = {
          ...set,
          completed: isCompleted,
          validationFlags: flagsResult.flags,
          isOutlier: flagsResult.flags.includes("rep_outlier"),
          isIncomplete: flagsResult.isIncomplete,
        }
        if (session?.remoteSessionId) {
          void upsertSet({
            sessionId: session.remoteSessionId,
            setId: updatedSet.id,
            exerciseId: exercise.id,
            setIndex: idx,
            reps: updatedSet.reps,
            weight: updatedSet.weight,
            completed: updatedSet.completed,
            validationFlags: updatedSet.validationFlags,
          }).then(() => {
            setPendingRemoteUpdates((prev) => {
              if (!prev[updatedSet.id]) return prev
              const next = { ...prev }
              delete next[updatedSet.id]
              return next
            })
          })
        }
        return updatedSet
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

  const addSetToExercise = async (exerciseIndex = currentExerciseIndex) => {
    if (!session) return
    const exercise = exercises[exerciseIndex]
    if (!exercise) return
    const defaults = getDefaultSetValues({
      sets: exercise.sets,
      targetReps: exercise.targetReps,
      targetWeight: exercise.targetWeight,
    })
    const prevSet = exercise.sets[exercise.sets.length - 1]
    const nextReps = prevSet?.reps ?? defaults.reps
    const nextWeight = prevSet?.weight ?? defaults.weight
    const historyReps = getExerciseHistory(exercise.name).flatMap((workout) =>
      workout.exercises
        .filter((ex: any) => ex.name === exercise.name)
        .flatMap((ex: any) =>
          ex.sets.filter((set: any) => isSetEligibleForStats(set)).map((set: any) => set.reps ?? 0)
        )
    )
    const outlierInfo = getSetFlags({
      reps: nextReps,
      weight: nextWeight,
      targetReps: exercise.targetReps,
      historyReps,
    })
    const newSet = {
      id: generateSetId(),
      reps: nextReps,
      weight: nextWeight,
      completed: false,
      isOutlier: outlierInfo.flags.includes("rep_outlier"),
      validationFlags: outlierInfo.flags,
      isIncomplete: outlierInfo.isIncomplete,
    }
    const newSets = [
      ...exercise.sets,
      newSet,
    ]

    const newExercises = exercises.map((exercise: any, exerciseIdx: number) => {
      if (exerciseIdx !== exerciseIndex) {
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
    toast("Set added", {
      action: {
        label: "Undo",
        onClick: () => {
          void deleteSetById(exerciseIndex, newSet.id)
        },
      },
    })
  }

  const deleteSetById = async (exerciseIndex: number, setId: string) => {
    if (!session) return
    const exercise = exercises[exerciseIndex]
    if (!exercise) return
    const deleteIndex = exercise.sets.findIndex((set: any) => set.id === setId)
    if (deleteIndex === -1) return
    await deleteSetFromExercise(deleteIndex, exerciseIndex, true)
  }

  const deleteSetFromExercise = async (
    setIndex: number,
    exerciseIndex = currentExerciseIndex,
    silent = false,
  ) => {
    if (!session) return
    const exercise = exercises[exerciseIndex]
    if (!exercise) return
    const removedSet = exercise.sets[setIndex]
    const newSets = exercise.sets.filter((_: any, idx: number) => idx !== setIndex)

    const newExercises = exercises.map((exercise: any, exerciseIdx: number) => {
      if (exerciseIdx !== exerciseIndex) {
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
    if (!silent && removedSet) {
      toast("Set removed", {
        action: {
          label: "Undo",
          onClick: () => {
            void restoreSetAtIndex(exerciseIndex, setIndex, removedSet)
          },
        },
      })
    }
  }

  const restoreSetAtIndex = async (exerciseIndex: number, setIndex: number, setData: any) => {
    if (!session) return
    const exercise = exercises[exerciseIndex]
    if (!exercise) return
    const newSets = [
      ...exercise.sets.slice(0, setIndex),
      setData,
      ...exercise.sets.slice(setIndex),
    ]

    const newExercises = exercises.map((exercise: any, exerciseIdx: number) => {
      if (exerciseIdx !== exerciseIndex) return exercise
      return { ...exercise, sets: newSets }
    })

    setExercises(newExercises)

    const updatedSession: WorkoutSession = {
      ...session,
      exercises: newExercises,
    }

    setSession(updatedSession)
    await saveSession(updatedSession)
  }

  const removeGhostSetsForExercise = async (exerciseIndex: number) => {
    if (!session) return
    const exercise = exercises[exerciseIndex]
    if (!exercise) return
    const cleanedSets = exercise.sets.filter((set: any) => !isGhostSet(set))
    if (cleanedSets.length === exercise.sets.length) return
    const newExercises = exercises.map((exercise: any, exerciseIdx: number) => {
      if (exerciseIdx !== exerciseIndex) return exercise
      return { ...exercise, sets: cleanedSets }
    })
    setExercises(newExercises)
    const updatedSession: WorkoutSession = {
      ...session,
      exercises: newExercises,
    }
    setSession(updatedSession)
    await saveSession(updatedSession)
  }

  const toggleEditSetsForExercise = async (exerciseIndex: number, nextValue?: boolean) => {
    const exercise = exercises[exerciseIndex]
    if (!exercise) return
    const nextState =
      typeof nextValue === "boolean" ? nextValue : !editSetsByExerciseId[exercise.id]
    setEditSetsByExerciseId((prev) => ({ ...prev, [exercise.id]: nextState }))
    if (!nextState) {
      cancelAddHold()
      await removeGhostSetsForExercise(exerciseIndex)
    }
  }


  const startAddHold = (exerciseIndex: number) => {
    if (!editSetsByExerciseId[exercises[exerciseIndex]?.id]) return
    if (addHoldTimeoutRef.current) return
    const start = Date.now()
    addHoldStartRef.current = start
    setAddHoldProgress(0)
    addHoldTimeoutRef.current = window.setTimeout(() => {
      addHoldTimeoutRef.current = null
      addHoldStartRef.current = null
      setAddHoldProgress(0)
      void addSetToExercise(exerciseIndex)
    }, 500)

    const tick = () => {
      if (!addHoldStartRef.current) return
      const elapsed = Date.now() - addHoldStartRef.current
      setAddHoldProgress(Math.min(1, elapsed / 500))
      if (elapsed < 500) {
        addHoldRafRef.current = requestAnimationFrame(tick)
      }
    }
    addHoldRafRef.current = requestAnimationFrame(tick)
  }

  const cancelAddHold = () => {
    if (addHoldTimeoutRef.current) {
      window.clearTimeout(addHoldTimeoutRef.current)
      addHoldTimeoutRef.current = null
    }
    if (addHoldRafRef.current) {
      cancelAnimationFrame(addHoldRafRef.current)
      addHoldRafRef.current = null
    }
    addHoldStartRef.current = null
    setAddHoldProgress(0)
  }

  const goToNextExercise = async () => {
    if (!session) return
    if (currentExercise?.sets?.some((set: any) => isSetIncomplete(set))) {
      setValidationTrigger(Date.now())
      return
    }
    if (currentExerciseIndex < exercises.length - 1) {
      const newIndex = currentExerciseIndex + 1
      const updatedSession: WorkoutSession = {
        ...session,
        currentExerciseIndex: newIndex,
      }

      setSession(updatedSession)
      await saveSession(updatedSession)
      setValidationTrigger(0)
    } else {
      finishWorkout()
    }
  }

  const goToPreviousExercise = async () => {
    if (!session) return
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
    if (!session) return
    if (isFinishing) return
    setIsFinishing(true)
    const cleanedExercises = exercises.map((exercise: any) => ({
      ...exercise,
      sets: exercise.sets.filter((set: any) => !isGhostSet(set)),
    }))
    const firstInvalidExerciseIndex = cleanedExercises.findIndex((exercise: any) =>
      exercise.sets?.some((set: any) => isSetIncomplete(set))
    )
    if (firstInvalidExerciseIndex !== -1) {
      if (firstInvalidExerciseIndex !== currentExerciseIndex) {
        const updatedSession: WorkoutSession = {
          ...session,
          currentExerciseIndex: firstInvalidExerciseIndex,
        }
        setSession(updatedSession)
        await saveSession(updatedSession)
      }
      setValidationTrigger(Date.now())
      setIsFinishing(false)
      return
    }
    const completedSets = cleanedExercises.reduce((total: number, ex: any) => {
      return total + ex.sets.filter((s: any) => isSetEligibleForStats(s)).length
    }, 0)

    const totalSets = cleanedExercises.reduce((total: number, ex: any) => total + ex.sets.length, 0)

    const totalVolume = cleanedExercises.reduce((vol: number, ex: any) => {
      return (
        vol +
        ex.sets.filter((s: any) => isSetEligibleForStats(s)).reduce((sum: number, set: any) => {
          return sum + (set.weight ?? 0) * (set.reps ?? 0)
        }, 0)
      )
    }, 0)

    const totalReps = cleanedExercises.reduce((reps: number, ex: any) => {
      return (
        reps +
        ex.sets
          .filter((s: any) => isSetEligibleForStats(s))
          .reduce((sum: number, set: any) => sum + (set.reps ?? 0), 0)
      )
    }, 0)

    const durationSeconds = session ? commitActiveDuration(session) : Math.floor(elapsedMs / 1000)

    const completedWorkoutId = isUuid(session.id) ? session.id : generateWorkoutId()
    const completedWorkout = {
      id: completedWorkoutId,
      name: routine.name,
      date: new Date(session?.startedAt!).toISOString(),
      duration: durationSeconds,
      exercises: cleanedExercises.map((ex: any) => ({
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

    try {
      await Promise.resolve(saveWorkout(completedWorkout))
    } catch (error) {
      console.error("Failed to save workout", error)
      toast.error("Couldn't save workout. Please try again.")
      setIsFinishing(false)
      return
    }

    if (session) {
      const completedSession: WorkoutSession = {
        ...session,
        status: "completed",
        endedAt: new Date().toISOString(),
        activeDurationSeconds: commitActiveDuration(session),
        restTimer: undefined,
        lastActiveAt: undefined,
        exercises: cleanedExercises,
      }
      await saveSession(completedSession)
    }

    deleteSetsForSession(session.id)
    deleteSession(session.id)
    saveCurrentSessionId(null)
    setSession(null)
    setValidationTrigger(0)
    router.push(`/workout-summary?workoutId=${completedWorkoutId}`)
  }

  const handleExit = async () => {
    if (session?.status === "in_progress") {
      const updatedSession: WorkoutSession = {
        ...session,
        status: "paused",
        activeDurationSeconds: commitActiveDuration(session),
        lastActiveAt: undefined,
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
        activeDurationSeconds: commitActiveDuration(session),
        lastActiveAt: undefined,
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
            </div>
            <div className="flex items-center gap-2">
              {!isResting && (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold text-muted-foreground bg-muted tabular-nums">
                  {formatTime(elapsedMs)}
                </span>
              )}
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
              Exercise {currentExerciseIndex + 1} of {totalExercises} · {currentExercise.sets.length} sets
            </p>
            <div className="flex items-start justify-between gap-2 mb-1">
              <div>
                <h2 className="text-xl font-bold text-foreground leading-tight">{currentExercise.name}</h2>
                {isEditMode && (
                  <div className="mt-1">
                    <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      Editing sets (session only)
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {isEditMode && (
                  <div className="relative">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 px-2"
                      onPointerDown={() => startAddHold(currentExerciseIndex)}
                      onPointerUp={cancelAddHold}
                      onPointerLeave={cancelAddHold}
                      onPointerCancel={cancelAddHold}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Hold to add
                    </Button>
                    {addHoldProgress > 0 && (
                      <div className="absolute left-0 right-0 -bottom-0.5 h-0.5 bg-primary/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${Math.round(addHoldProgress * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {isEditMode && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => toggleEditSetsForExercise(currentExerciseIndex, false)}
                  >
                    Done
                  </Button>
                )}

                {!isEditMode && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => toggleEditSetsForExercise(currentExerciseIndex, true)}
                  >
                    <PencilLine className="h-4 w-4" />
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleTogglePlateCalc}
                  className="text-xs h-7 px-2"
                >
                  <span className="mr-1">🏋️</span>
                  {showPlateCalc ? "Hide" : "Show"} plates
                </Button>
              </div>
            </div>
          </div>

          <ExerciseCard
            exercise={currentExercise}
            exerciseIndex={currentExerciseIndex}
            editable={true}
            editMode={isEditMode}
            showPlateCalc={showPlateCalc}
            restState={restState}
            validationTrigger={validationTrigger}
            pendingRemoteUpdates={pendingRemoteUpdates}
            onSetFieldFocus={(setId, field) => {
              setEditingSetId(setId)
              setEditingField(field)
              editingSetIdRef.current = setId
              editingFieldRef.current = field
            }}
            onSetFieldBlur={(setId, field) => {
              if (editingSetId === setId && editingField === field) {
                setEditingSetId(null)
                setEditingField(null)
              }
              if (editingSetIdRef.current === setId && editingFieldRef.current === field) {
                editingSetIdRef.current = null
                editingFieldRef.current = null
              }
            }}
            onRestStateChange={async (nextState) => {
              await setRestStateAndPersist(nextState || null)
            }}
            onUpdateSet={updateSetData}
            onCompleteSet={completeSet}
            onAddSet={() => addSetToExercise(currentExerciseIndex)}
            onDeleteSet={(setIndex) => deleteSetFromExercise(setIndex, currentExerciseIndex)}
          />

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Note</span>
              <span className="text-[10px] text-muted-foreground">Session only</span>
            </div>
            <Input
              value={inlineNoteDraft}
              placeholder="Add a quick note (optional)"
              onChange={(e) => setInlineNoteDraft(e.target.value)}
              onBlur={async () => {
                if (!session || !currentExercise) return
                const trimmed = inlineNoteDraft.trim()
                if ((currentExercise.sessionNote ?? "") === trimmed) return
                const newExercises = exercises.map((exercise: any, idx: number) => {
                  if (idx !== currentExerciseIndex) return exercise
                  return {
                    ...exercise,
                    sessionNote: trimmed,
                  }
                })
                setExercises(newExercises)
                const updatedSession: WorkoutSession = {
                  ...session,
                  exercises: newExercises,
                }
                setSession(updatedSession)
                await saveSession(updatedSession)
              }}
              className="h-10"
            />
          </div>
        </div>
      </div>

      {/* Workout Footer Buttons */}
      <div className="fixed bottom-0 left-0 right-0 z-50">
        <div className="bg-background border-t border-border" style={{ height: "var(--workout-footer-h)" }}>
          <div className="max-w-2xl mx-auto px-4 py-3 h-full flex items-center">
            {isResting ? (
              <div className="flex flex-col items-center justify-center w-full gap-1">
                <div className="px-4 py-2 rounded-full text-base font-semibold text-foreground bg-muted tabular-nums">
                  {formatSeconds(restRemainingSeconds)}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => setRestStateAndPersist(null)}
                >
                  Skip Rest
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 w-full">
                <Button
                  variant="ghost"
                  className="h-10 px-3 text-muted-foreground"
                  onClick={goToPreviousExercise}
                  disabled={currentExerciseIndex === 0}
                >
                  Previous
                </Button>
                <Button
                  className="flex-1 h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={allSetsCompleted ? goToNextExercise : handlePrimaryAction}
                >
                  {allSetsCompleted
                    ? currentExerciseIndex === exercises.length - 1
                      ? "Finish"
                      : "Next Exercise"
                    : "Complete Set"}
                </Button>
                {!allSetsCompleted && (
                  <Button
                    variant="outline"
                    className="h-10 px-4 bg-transparent text-muted-foreground"
                    onClick={goToNextExercise}
                  >
                    {currentExerciseIndex === exercises.length - 1 ? "Finish" : "Next Exercise"}
                  </Button>
                )}
              </div>
            )}
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
