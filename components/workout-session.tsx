"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { WorkoutRoutine } from "@/lib/routine-storage"
import {
  getExerciseHistory,
  getLatestPerformance,
  getMostRecentSetPerformance,
  getWorkoutHistory,
  saveWorkout,
} from "@/lib/workout-storage"
import { toast } from "sonner"
import {
  getDefaultSetValues,
  getSetFlags,
  isIncomplete,
  isMissingReps,
  isMissingWeight,
  parseNumber,
  isSetEligibleForStats,
  isSetIncomplete,
  REP_MAX,
  REP_MIN,
} from "@/lib/set-validation"
import { getOrCreateActiveSession, upsertSet } from "@/lib/supabase-session-sync"
import { supabase } from "@/lib/supabase"
import { isWarmupExercise } from "@/lib/exercise-heuristics"
import {
  clearExerciseNextNote,
  getExerciseNextNote,
  markExerciseNextNoteDone,
  setExerciseNextNote,
  type NextSessionNote,
} from "@/lib/next-session-notes"
import {
  getCurrentInProgressSession,
  deleteSession,
  deleteSetsForSession,
  type WorkoutSession,
  saveSession,
  saveCurrentSessionId,
} from "@/lib/autosave-workout-storage"
import { ArrowLeft, AlertCircle, Check, Pause, Play } from "lucide-react"

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

function normalizeExerciseName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ")
}

function getRecentPerformanceSnapshots(
  exerciseName: string,
  history: any[],
  count = 3,
): Array<{ reps: number; weight: number }> {
  const normalizedName = normalizeExerciseName(exerciseName)
  const snapshots: Array<{ reps: number; weight: number }> = []

  for (const workout of history) {
    const exercise = workout.exercises?.find(
      (ex: any) => normalizeExerciseName(ex.name) === normalizedName,
    )
    if (!exercise?.sets) continue
    const validSets = exercise.sets.filter((set: any) => isSetEligibleForStats(set))
    if (validSets.length === 0) continue
    const firstSet = validSets[0]
    if (typeof firstSet.reps !== "number" || typeof firstSet.weight !== "number") continue
    snapshots.push({ reps: firstSet.reps, weight: firstSet.weight })
    if (snapshots.length >= count) break
  }

  return snapshots
}

function applyProgressiveOverload(
  snapshots: Array<{ reps: number; weight: number }>,
): { reps: number | null; weight: number | null; mode: "reps" | "weight" | null } {
  const latest = snapshots[0]
  if (!latest) return { reps: null, weight: null, mode: null }
  if (snapshots.length < 3) {
    return { reps: latest.reps, weight: latest.weight, mode: null }
  }

  const chronological = [...snapshots].reverse()
  const weightSteps = chronological.slice(1).map((set, idx) => set.weight - chronological[idx].weight)
  const repSteps = chronological.slice(1).map((set, idx) => set.reps - chronological[idx].reps)
  const repsStable = chronological.every((set) => set.reps === chronological[0].reps)
  const weightStable = chronological.every((set) => Math.abs(set.weight - chronological[0].weight) <= 0.5)

  const weightPattern = repsStable && weightSteps.every((step) => Math.abs(step - 5) <= 0.5)
  const repsPattern = weightStable && repSteps.every((step) => step === 1)

  if (weightPattern) {
    return { reps: latest.reps, weight: Math.max(0, latest.weight + 5), mode: "weight" }
  }

  if (repsPattern) {
    const nextReps = Math.min(REP_MAX, Math.max(REP_MIN, latest.reps + 1))
    return { reps: nextReps, weight: latest.weight, mode: "reps" }
  }

  return { reps: latest.reps, weight: latest.weight, mode: null }
}

export default function WorkoutSessionComponent({ routine }: { routine: WorkoutRoutine }) {
  const router = useRouter()
  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [exercises, setExercises] = useState<any[]>([])
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
  const [exerciseNextNote, setExerciseNextNoteState] = useState<NextSessionNote | null>(null)
  const [exerciseNoteDraft, setExerciseNoteDraft] = useState("")
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
  const [progressiveAutofillEnabled, setProgressiveAutofillEnabled] = useState(true)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isScrollingProgrammatically = useRef(false)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [repCapErrors, setRepCapErrors] = useState<Record<string, boolean>>({})
  const NOTE_CHAR_LIMIT = 360

  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = localStorage.getItem("progressive_autofill_enabled")
    if (stored === null) return
    setProgressiveAutofillEnabled(stored === "true")
  }, [])

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
          restTime: exercise.restTime ?? extractRestSeconds(exercise.notes),
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
        const baseDefaults = getDefaultSetValues({
          sets: [],
          targetReps,
          targetWeight: exercise.targetWeight,
        })
        const progressiveDefaults =
          progressiveAutofillEnabled && !isWarmup
            ? applyProgressiveOverload(getRecentPerformanceSnapshots(exercise.name, normalizedHistory, 3))
            : { reps: null, weight: null, mode: null }
        const defaults = {
          reps: progressiveDefaults.reps ?? baseDefaults.reps,
          weight: progressiveDefaults.weight ?? baseDefaults.weight,
        }

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
      let currentSession = getCurrentInProgressSession()
      if (currentSession) {
        if (currentSession.status === "paused") {
          const resumedSession: WorkoutSession = {
            ...currentSession,
            status: "in_progress",
          }
          currentSession = resumedSession
          setSession(resumedSession)
          await saveSession(resumedSession)
        }
        const normalizedStatus =
          (currentSession as any).status === "active"
            ? "in_progress"
            : currentSession.status

        const normalizedSession: WorkoutSession = {
          ...currentSession,
          id: currentSession.id || (currentSession as any).sessionId || Date.now().toString(),
          status: normalizedStatus,
          activeDurationSeconds: currentSession.activeDurationSeconds ?? 0,
        }

        saveCurrentSessionId(normalizedSession.id)

        const restTimer =
          normalizedSession.restTimer && !normalizedSession.restTimer.startedAt
            ? { ...normalizedSession.restTimer, startedAt: new Date().toISOString() }
            : normalizedSession.restTimer
        const hydratedSession = restTimer ? { ...normalizedSession, restTimer } : normalizedSession

        setSession(hydratedSession)
        setExercises(buildExercises(hydratedSession.exercises))
        setRestState(restTimer)
        restStartAtRef.current = restTimer?.startedAt
          ? new Date(restTimer.startedAt).getTime()
          : restTimer
            ? Date.now()
            : null
        await saveSession(hydratedSession)
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
        }

        saveCurrentSessionId(newSessionId)
        setSession(newSession)
        setExercises(newExercises)
        setRestState(undefined)
        restStartAtRef.current = null
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

  const resolvedExerciseIndex = Number.isFinite(Number(session?.currentExerciseIndex))
    ? Number(session?.currentExerciseIndex)
    : 0
  const currentExerciseIndex = resolvedExerciseIndex
  const currentExercise = exercises[currentExerciseIndex]
  const totalExercises = exercises.length
  const firstIncompleteIndex =
    currentExercise?.sets?.findIndex((set: any) => !set.completed) ?? -1
  const currentSetIndex = firstIncompleteIndex === -1 ? 0 : firstIncompleteIndex
  const isResting =
    Boolean(restState) &&
    restState?.exerciseIndex === currentExerciseIndex &&
    typeof restState?.remainingSeconds === "number"
  const allSetsCompleted =
    currentExercise?.sets?.every((set: any) => set.completed && !isSetIncomplete(set)) ?? false

  const formatSeconds = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const restRemainingSeconds = (() => {
    if (!isResting || !restState) return 0
    const startAt = restState.startedAt
      ? new Date(restState.startedAt).getTime()
      : restStartAtRef.current ?? uiNow
    const elapsed = Math.floor((uiNow - startAt) / 1000)
    return Math.max(0, restState.remainingSeconds - elapsed)
  })()

  useEffect(() => {
    if (!currentExercise) {
      setExerciseNextNoteState(null)
      setExerciseNoteDraft("")
      return
    }
    const note = getExerciseNextNote(
      routine.id,
      routine.name,
      currentExercise.id,
      currentExercise.name,
    )
    setExerciseNextNoteState(note)
    setExerciseNoteDraft(note?.text ?? "")
  }, [routine.id, routine.name, currentExercise?.id, currentExercise?.name])

  const saveExerciseNextNote = () => {
    if (!currentExercise) return
    const next = setExerciseNextNote(
      routine.id,
      routine.name,
      currentExercise.id,
      currentExercise.name,
      exerciseNoteDraft,
    )
    setExerciseNextNoteState(next)
    setExerciseNoteDraft(next?.text ?? "")
  }

  const clearExerciseNote = () => {
    if (!currentExercise) return
    clearExerciseNextNote(routine.id, routine.name, currentExercise.id, currentExercise.name)
    setExerciseNextNoteState(null)
    setExerciseNoteDraft("")
  }

  const markExerciseNoteDone = () => {
    if (!currentExercise) return
    markExerciseNextNoteDone(routine.id, routine.name, currentExercise.id, currentExercise.name)
    setExerciseNextNoteState(null)
    setExerciseNoteDraft("")
  }

  const setRestStateAndPersist = async (
    nextState: WorkoutSession["restTimer"] | null
  ) => {
    const nextWithStart = nextState
      ? {
          ...nextState,
          startedAt: nextState.startedAt ?? new Date().toISOString(),
        }
      : null

    restStartAtRef.current = nextWithStart?.startedAt
      ? new Date(nextWithStart.startedAt).getTime()
      : null
    setRestState(nextWithStart || undefined)
    if (session) {
      const updatedSession: WorkoutSession = {
        ...session,
        restTimer: nextWithStart || undefined,
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
    await completeSet(currentSetIndex, { startRest: false })
    const restSeconds = currentExercise.restTime ?? extractRestSeconds(currentExercise.notes)
    if (restSeconds > 0) {
      await setRestStateAndPersist({
        exerciseIndex: currentExerciseIndex,
        setIndex: currentSetIndex,
        remainingSeconds: restSeconds,
      })
    }
  }

  useEffect(() => {
    if (!isResting) return
    if (!restStartAtRef.current) {
      restStartAtRef.current = restState?.startedAt
        ? new Date(restState.startedAt).getTime()
        : Date.now()
    }
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
    setRepCapErrors({})
  }, [currentExercise?.id, currentExercise?.sets?.length])

  useEffect(() => {
    cancelAddHold()
  }, [currentExerciseIndex])

  useEffect(() => {
    if (!scrollContainerRef.current || isScrollingProgrammatically.current) return
    isScrollingProgrammatically.current = true
    const container = scrollContainerRef.current
    const scrollLeft = currentExerciseIndex * container.offsetWidth
    container.scrollTo({ left: scrollLeft, behavior: "smooth" })

    const timeout = window.setTimeout(() => {
      isScrollingProgrammatically.current = false
    }, 500)

    return () => window.clearTimeout(timeout)
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

  const completeSet = async (
    setIndex: number,
    options?: {
      startRest?: boolean
    }
  ) => {
    if (!session) return
    const shouldAutoRest = options?.startRest ?? true
    let shouldStartRest = false
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

        if (
          shouldAutoRest &&
          isCompleted &&
          exerciseIdx === currentExerciseIndex &&
          idx === currentSetIndex &&
          exercise.restTime > 0
        ) {
          shouldStartRest = true
        }

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

      const allSetsCompleted = newSets.every((set: any) => set.completed && !isSetIncomplete(set))

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

    if (shouldAutoRest && shouldStartRest) {
      const restSeconds =
        exercises[currentExerciseIndex]?.restTime ??
        extractRestSeconds(exercises[currentExerciseIndex]?.notes)
      await setRestStateAndPersist({
        exerciseIndex: currentExerciseIndex,
        setIndex,
        remainingSeconds: restSeconds,
      })
    }
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

  const setExerciseIndex = async (nextIndex: number) => {
    if (!session) return
    if (nextIndex < 0 || nextIndex >= exercises.length) return
    if (nextIndex === currentExerciseIndex) return

    const updatedSession: WorkoutSession = {
      ...session,
      currentExerciseIndex: nextIndex,
    }
    setSession(updatedSession)
    await saveSession(updatedSession)
    setValidationTrigger(0)
  }

  const handleScroll = () => {
    if (isScrollingProgrammatically.current) return

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }

    scrollTimeoutRef.current = setTimeout(() => {
      const container = scrollContainerRef.current
      if (!container) return
      const pageWidth = container.offsetWidth || 1
      const newIndex = Math.round(container.scrollLeft / pageWidth)
      if (newIndex === currentExerciseIndex) return

      void setExerciseIndex(newIndex)
    }, 100)
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

    const completedWorkoutId = isUuid(session.id) ? session.id : generateWorkoutId()
    const completedWorkout = {
      id: completedWorkoutId,
      name: routine.name,
      date: new Date(session?.startedAt!).toISOString(),
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
        activeDurationSeconds: 0,
        restTimer: undefined,
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
      }

      setSession(updatedSession)
      await saveSession(updatedSession)
    }
    router.push("/")
  }

  const renderExerciseContent = (exercise: Exercise, exerciseIndex: number) => {
    const isCurrentExercise = exerciseIndex === currentExerciseIndex
    const exerciseCurrentSetIndex = exercise.sets.findIndex((set) => !set.completed)
    const activeSetIndex = exerciseCurrentSetIndex === -1 ? 0 : exerciseCurrentSetIndex
    const allSetsRecorded = exercise.sets.every((set) => set.completed && !isSetIncomplete(set))

    return (
      <div
        key={exercise.id}
        className="flex-shrink-0"
        style={{
          width: "100%",
          paddingLeft: "20px",
          paddingRight: "20px",
          paddingTop: "20px",
          paddingBottom: "128px",
        }}
      >
        <div className="mb-5">
          <div
            className="text-white/25 tracking-widest mb-2"
            style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.15em", fontFamily: "'Archivo Narrow', sans-serif" }}
          >
            EXERCISE {exerciseIndex + 1} OF {totalExercises} • {routine.name.toUpperCase()}
          </div>

          <h1
            className="text-white/95"
            style={{ fontSize: "28px", fontWeight: 400, letterSpacing: "-0.02em", lineHeight: "1", fontFamily: "'Bebas Neue', sans-serif" }}
          >
            {exercise.name}
          </h1>

          {isCurrentExercise && allSetsRecorded && (
            <div
              className="mt-4 flex items-center gap-2"
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "2px",
                padding: "10px 14px",
              }}
            >
              <Check size={12} strokeWidth={1.5} style={{ color: "rgba(255, 255, 255, 0.3)" }} />
              <div className="text-white/30" style={{ fontSize: "9px", fontWeight: 400, letterSpacing: "0.02em" }}>
                All sets recorded
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {exercise.sets.map((set, index) => {
            const setKey = set.id ?? `${exercise.id}-${index}`
            const isCurrentSet = isCurrentExercise && index === activeSetIndex
            const repCapError = repCapErrors[setKey] || set.validationFlags?.includes("reps_hard_invalid")
            const missingWeight = isMissingWeight(set.weight)
            const missingReps = isMissingReps(set.reps)
            const showMissing = Boolean(validationTrigger) && isCurrentExercise && (missingWeight || missingReps)
            const isBlocked = (!set.completed && (isSetIncomplete(set) || repCapError)) || !isCurrentExercise
            const lastSet = getMostRecentSetPerformance(exercise.name, index, session?.id)
            const comparison = getSetComparison(set, lastSet)
            const plates = typeof set.weight === "number" ? calculatePlates(set.weight) : []

            return (
              <div key={setKey}>
                <div
                  className="text-white/30 tracking-widest mb-3"
                  style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.12em", fontFamily: "'Archivo Narrow', sans-serif" }}
                >
                  SET {index + 1} OF {exercise.sets.length}
                </div>

                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1">
                    <input
                      type="number"
                      value={set.weight ?? ""}
                      onChange={(e) => {
                        if (!isCurrentExercise) return
                        const raw = e.target.value
                        if (!raw.trim()) {
                          void updateSetData(index, "weight", null)
                          return
                        }
                        const parsed = parseNumber(raw)
                        if (parsed === null || parsed < 0) return
                        void updateSetData(index, "weight", parsed)
                      }}
                      onFocus={() => set.id && handleSetFieldFocus(set.id, "weight")}
                      onBlur={() => set.id && handleSetFieldBlur(set.id, "weight")}
                      disabled={set.completed || !isCurrentExercise}
                      placeholder="—"
                      className="w-full transition-all duration-200"
                      style={{
                        background: set.completed ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.03)",
                        border: `1px solid rgba(255, 255, 255, ${
                          showMissing && missingWeight && !set.completed ? "0.25" : set.completed ? "0.06" : "0.1"
                        })`,
                        borderRadius: "2px",
                        padding: "16px",
                        fontSize: "24px",
                        fontWeight: 500,
                        letterSpacing: "-0.02em",
                        color: set.completed ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.95)",
                        fontVariantNumeric: "tabular-nums",
                        outline: "none",
                        textAlign: "center",
                      }}
                    />
                    <div className="text-white/25 mt-1.5 text-center" style={{ fontSize: "8px", fontWeight: 400, letterSpacing: "0.04em" }}>
                      lbs
                    </div>
                  </div>

                  <div className="flex-1">
                    <input
                      type="number"
                      value={set.reps ?? ""}
                      onChange={(e) => {
                        if (!isCurrentExercise) return
                        const raw = e.target.value
                        if (!raw.trim()) {
                          setRepCapErrors((prev) => {
                            if (!setKey) return prev
                            return { ...prev, [setKey]: false }
                          })
                          void updateSetData(index, "reps", null)
                          return
                        }
                        const parsed = parseNumber(raw)
                        if (parsed === null) return
                        if (parsed > REP_MAX) {
                          setRepCapErrors((prev) => ({ ...prev, [setKey]: true }))
                          return
                        }
                        setRepCapErrors((prev) => ({ ...prev, [setKey]: false }))
                        const clamped = Math.max(REP_MIN, parsed)
                        void updateSetData(index, "reps", clamped)
                      }}
                      onFocus={() => set.id && handleSetFieldFocus(set.id, "reps")}
                      onBlur={() => set.id && handleSetFieldBlur(set.id, "reps")}
                      disabled={set.completed || !isCurrentExercise}
                      placeholder="—"
                      className="w-full transition-all duration-200"
                      style={{
                        background: set.completed ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.03)",
                        border: `1px solid rgba(255, 255, 255, ${
                          (repCapError || (showMissing && missingReps)) && !set.completed ? "0.25" : set.completed ? "0.06" : "0.1"
                        })`,
                        borderRadius: "2px",
                        padding: "16px",
                        fontSize: "24px",
                        fontWeight: 500,
                        letterSpacing: "-0.02em",
                        color: set.completed ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.95)",
                        fontVariantNumeric: "tabular-nums",
                        outline: "none",
                        textAlign: "center",
                      }}
                    />
                    <div className="text-white/25 mt-1.5 text-center" style={{ fontSize: "8px", fontWeight: 400, letterSpacing: "0.04em" }}>
                      reps
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (!isCurrentExercise) return
                      if (!set.completed && (isSetIncomplete(set) || repCapError)) {
                        setValidationTrigger(Date.now())
                        return
                      }
                      void completeSet(index)
                    }}
                    disabled={isBlocked}
                    className="flex-shrink-0 flex items-center justify-center transition-all duration-200"
                    style={{
                      width: "56px",
                      height: "56px",
                      background: set.completed ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.03)",
                      border: `1px solid rgba(255, 255, 255, ${set.completed ? "0.15" : "0.1"})`,
                      borderRadius: "2px",
                      opacity: isBlocked ? 0.2 : 1,
                    }}
                    type="button"
                  >
                    <Check size={16} strokeWidth={1.5} style={{ color: set.completed ? "rgba(255, 255, 255, 0.5)" : "rgba(255, 255, 255, 0.3)" }} />
                  </button>
                </div>

                {(repCapError || showMissing) && (
                  <div className="mb-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={10} strokeWidth={2} style={{ color: "rgba(255, 255, 255, 0.3)" }} />
                      <div style={{ fontSize: "9px", fontWeight: 400, color: "rgba(255, 255, 255, 0.3)" }}>
                        {repCapError && `Reps cannot exceed ${REP_MAX}`}
                        {!repCapError && missingWeight && "Enter weight"}
                        {!repCapError && !missingWeight && missingReps && "Enter reps"}
                      </div>
                    </div>
                  </div>
                )}

                {lastSet && typeof set.weight === "number" && typeof set.reps === "number" && (
                  <div className="flex items-center gap-2 mb-3">
                    <div className="text-white/20" style={{ fontSize: "9px", fontWeight: 400, fontVariantNumeric: "tabular-nums" }}>
                      Last: {lastSet.weight} × {lastSet.reps}
                    </div>
                    {comparison?.status !== "no-history" && (
                      <div
                        style={{
                          fontSize: "9px",
                          fontWeight: 400,
                          color:
                            comparison?.status === "progressed"
                              ? "rgba(255, 255, 255, 0.5)"
                              : comparison?.status === "recovery"
                                ? "rgba(255, 255, 255, 0.25)"
                                : "rgba(255, 255, 255, 0.3)",
                        }}
                      >
                        {comparison?.message}
                      </div>
                    )}
                  </div>
                )}

                {showPlateCalc && isCurrentSet && !set.completed && plates.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center gap-1 mb-2">
                      {plates.map((plate, plateIndex) => (
                        <div key={`${setKey}-${plateIndex}`} className="flex items-center gap-1">
                          {Array.from({ length: plate.count }).map((_, countIndex) => {
                            const getPlateColor = () => {
                              if (plate.plate === 45) return "rgba(220, 80, 80, 0.5)"
                              if (plate.plate === 35) return "rgba(80, 120, 220, 0.5)"
                              if (plate.plate === 25) return "rgba(80, 200, 120, 0.5)"
                              if (plate.plate === 10) return "rgba(230, 180, 80, 0.5)"
                              if (plate.plate === 5) return "rgba(220, 220, 220, 0.5)"
                              return "rgba(120, 120, 120, 0.5)"
                            }

                            const getPlateHeight = () => {
                              if (plate.plate === 45) return 32
                              if (plate.plate === 35) return 28
                              if (plate.plate === 25) return 24
                              if (plate.plate === 10) return 18
                              if (plate.plate === 5) return 14
                              return 10
                            }

                            return (
                              <div
                                key={`${setKey}-${plateIndex}-${countIndex}`}
                                style={{
                                  width: "6px",
                                  height: `${getPlateHeight()}px`,
                                  background: getPlateColor(),
                                  border: "1px solid rgba(255, 255, 255, 0.12)",
                                  borderRadius: "1px",
                                }}
                              />
                            )
                          })}
                        </div>
                      ))}
                      <div
                        style={{
                          width: "32px",
                          height: "4px",
                          background: "rgba(160, 160, 160, 0.4)",
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          borderRadius: "1px",
                          marginLeft: "2px",
                        }}
                      />
                    </div>

                    <div className="text-white/20" style={{ fontSize: "8px", fontWeight: 400, fontVariantNumeric: "tabular-nums" }}>
                      {plates.map((plate, plateIndex) => (
                        <span key={`${setKey}-plate-${plateIndex}`}>
                          {plateIndex > 0 && " + "}
                          {plate.count > 1 ? `${plate.count}×` : ""}{plate.plate}
                        </span>
                      ))} per side
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const togglePause = async () => {
    if (session?.status === "in_progress") {
      const updatedSession: WorkoutSession = {
        ...session,
        status: "paused",
      }

      setSession(updatedSession)
      await saveSession(updatedSession)
    } else if (session?.status === "paused") {
      const updatedSession: WorkoutSession = {
        ...session,
        status: "in_progress",
      }

      setSession(updatedSession)
      await saveSession(updatedSession)
    }
  }

  const pauseSession = async () => {
    if (session?.status !== "in_progress") return
    const persistedRestTimer = session.restTimer ?? restState ?? undefined
    const updatedSession: WorkoutSession = {
      ...session,
      status: "paused",
      restTimer: persistedRestTimer,
    }
    setSession(updatedSession)
    await saveSession(updatedSession)
  }

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void pauseSession()
      }
    }
    const handlePageHide = () => {
      void pauseSession()
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("pagehide", handlePageHide)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("pagehide", handlePageHide)
    }
  }, [session?.id, session?.status, restState])

  const handleTogglePlateCalc = () => {
    const newValue = !showPlateCalc
    setShowPlateCalc(newValue)
    if (currentExercise?.name && typeof window !== "undefined") {
      localStorage.setItem(`plate_viz_${currentExercise.name}`, JSON.stringify(newValue))
    }
  }

  const handleSetFieldFocus = (setId: string, field: "reps" | "weight") => {
    setEditingSetId(setId)
    setEditingField(field)
    editingSetIdRef.current = setId
    editingFieldRef.current = field
  }

  const handleSetFieldBlur = (setId: string, field: "reps" | "weight") => {
    if (editingSetId === setId && editingField === field) {
      setEditingSetId(null)
      setEditingField(null)
    }
    if (editingSetIdRef.current === setId && editingFieldRef.current === field) {
      editingSetIdRef.current = null
      editingFieldRef.current = null
    }
  }

  const calculatePlates = (weight: number): { plate: number; count: number }[] => {
    const weightPerSide = weight / 2

    if (weightPerSide <= 0) return []

    const availablePlates = [45, 35, 25, 10, 5, 2.5]
    const plates: { plate: number; count: number }[] = []
    let remaining = weightPerSide

    for (const plate of availablePlates) {
      const count = Math.floor(remaining / plate)
      if (count > 0) {
        plates.push({ plate, count })
        remaining -= plate * count
      }
    }

    return plates
  }

  const getSetComparison = (set: Exercise["sets"][number], last: { weight: number; reps: number } | null) => {
    if (!last) return null
    if (typeof set.weight !== "number" || typeof set.reps !== "number") {
      return { status: "no-history", message: `Last: ${last.weight} × ${last.reps}` }
    }

    if (set.weight > last.weight || (set.weight === last.weight && set.reps > last.reps)) {
      const delta = set.weight > last.weight ? `${set.weight - last.weight} lbs` : `${set.reps - last.reps} reps`
      return { status: "progressed", message: `+${delta}` }
    }

    if (set.weight === last.weight && set.reps === last.reps) {
      return { status: "matched", message: "Matched last time" }
    }

    return { status: "recovery", message: "Recovery set" }
  }

  if (!isHydrated || exercises.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading workout...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: "100dvh", background: "#0A0A0C" }}>
      <div className="flex-shrink-0 px-5 pt-4 pb-3" style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
        <div className="flex items-center justify-between mb-3">
          <button onClick={handleExit} className="text-white/30 hover:text-white/60 transition-colors" type="button">
            <ArrowLeft size={16} strokeWidth={1.5} />
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={togglePause}
              className="text-white/30 hover:text-white/60 transition-colors"
              type="button"
              aria-label={session?.status === "in_progress" ? "Pause workout" : "Resume workout"}
            >
              {session?.status === "in_progress" ? <Pause size={16} strokeWidth={1.5} /> : <Play size={16} strokeWidth={1.5} />}
            </button>
            <button
              onClick={handleExit}
              className="text-white/30 hover:text-white/60 transition-colors"
              style={{ fontSize: "9px", fontWeight: 400, letterSpacing: "0.04em" }}
              type="button"
            >
              Exit Workout
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-1.5">
          {exercises.map((exercise, index) => {
            const isComplete = exercise.sets.every((set: any) => set.completed && !isSetIncomplete(set))
            const isCurrent = index === currentExerciseIndex
            return (
              <button
                key={exercise.id}
                onClick={() => void setExerciseIndex(index)}
                className="relative"
                style={{
                  width: isCurrent ? "16px" : "4px",
                  height: "4px",
                  background: isCurrent
                    ? "rgba(255, 255, 255, 0.4)"
                    : isComplete
                      ? "rgba(255, 255, 255, 0.25)"
                      : "rgba(255, 255, 255, 0.12)",
                  borderRadius: "2px",
                  transition: "all 0.3s ease",
                }}
                type="button"
              >
                {isComplete && !isCurrent && (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ transform: "scale(0.6)" }}>
                    <Check size={4} strokeWidth={2} style={{ color: "rgba(255, 255, 255, 0.4)" }} />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 flex overflow-x-auto overflow-y-hidden"
        style={{ scrollSnapType: "x mandatory", scrollBehavior: "smooth", WebkitOverflowScrolling: "touch" }}
      >
        {exercises.map((exercise, index) => (
          <div
            key={exercise.id}
            style={{
              scrollSnapAlign: "start",
              width: "100%",
              flexShrink: 0,
              overflowY: "auto",
            }}
          >
            {renderExerciseContent(exercise, index)}
          </div>
        ))}
      </div>

      <div
        className="flex-shrink-0"
        style={{
          position: "fixed",
          bottom: "80px",
          left: 0,
          right: 0,
          maxWidth: "448px",
          margin: "0 auto",
          background: "#0A0A0C",
          borderTop: "1px solid rgba(255, 255, 255, 0.06)",
          padding: "16px 20px",
        }}
      >
        {isResting ? (
          <div className="mb-4">
            <div className="flex items-baseline justify-center gap-3 mb-3">
              <div className="text-white/20 tracking-widest" style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.15em", fontFamily: "'Archivo Narrow', sans-serif" }}>
                REST
              </div>
              <div className="text-white/90" style={{ fontSize: "36px", fontWeight: 400, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", fontFamily: "'Bebas Neue', sans-serif" }}>
                {formatSeconds(restRemainingSeconds)}
              </div>
            </div>
            <button
              onClick={() => void setRestStateAndPersist(null)}
              className="w-full transition-all duration-200"
              style={{
                background: "transparent",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "2px",
                padding: "10px",
              }}
              type="button"
            >
              <span className="text-white/40" style={{ fontSize: "10px", fontWeight: 400 }}>
                Skip rest
              </span>
            </button>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            onClick={() => void goToPreviousExercise()}
            disabled={currentExerciseIndex === 0}
            className="transition-all duration-200"
            style={{
              background: "transparent",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: "2px",
              padding: "13px 16px",
              opacity: currentExerciseIndex === 0 ? 0.2 : 1,
            }}
            type="button"
          >
            <span className="text-white/30" style={{ fontSize: "10px", fontWeight: 400 }}>
              Previous
            </span>
          </button>

          <button
            onClick={() => void (allSetsCompleted ? goToNextExercise() : handlePrimaryAction())}
            disabled={!allSetsCompleted && currentSetIndex >= 0 && isSetIncomplete(currentExercise.sets[currentSetIndex])}
            className="flex-1 transition-all duration-200"
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "2px",
              padding: "13px",
              opacity:
                !allSetsCompleted && currentSetIndex >= 0 && isSetIncomplete(currentExercise.sets[currentSetIndex]) ? 0.2 : 1,
            }}
            type="button"
          >
            <span className="text-white/90" style={{ fontSize: "12px", fontWeight: 500, letterSpacing: "0.01em" }}>
              {allSetsCompleted ? (currentExerciseIndex === exercises.length - 1 ? "Finish Workout" : "Next Exercise") : "Complete Set"}
            </span>
          </button>

          <button
            onClick={() => void goToNextExercise()}
            disabled={currentExerciseIndex === totalExercises - 1}
            className="transition-all duration-200"
            style={{
              background: "transparent",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: "2px",
              padding: "13px 16px",
              opacity: currentExerciseIndex === totalExercises - 1 ? 0.2 : 1,
            }}
            type="button"
          >
            <span className="text-white/30" style={{ fontSize: "10px", fontWeight: 400 }}>
              Next
            </span>
          </button>
        </div>
      </div>

      <div
        className="flex-shrink-0"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: "80px",
          background: "#0A0A0C",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      />
    </div>
  )
}
