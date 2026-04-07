"use client"

import type React from "react"

import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useRouter } from "next/navigation"
import type { WorkoutRoutine } from "@/lib/routine-storage"
import {
  getExerciseHistory,
  getLatestPerformance,
  getMostRecentCompletedSetPerformance,
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
  getCurrentInProgressSession,
  deleteSession,
  deleteSetsForSession,
  type WorkoutSession,
  saveSession,
  saveCurrentSessionId,
} from "@/lib/autosave-workout-storage"
import {
  createWorkoutDraft,
  markWorkoutError,
  markWorkoutPending,
  updateWorkoutDraft,
  upsertSet as upsertSetDraft,
  upsertAllSets,
  getWorkoutDraft,
  type WorkoutSetDraft,
  type SyncState,
} from "@/lib/workout-draft-storage"
import { attemptWorkoutSync, ensureWorkoutSync } from "@/lib/workout-sync"
import { getMachineSettings, saveMachineSettings } from "@/lib/machine-settings-storage"
import { loadExerciseSettings, saveExerciseSettings } from "@/lib/supabase-exercise-settings"
import { ArrowLeft, AlertCircle, Check, ThumbsUp, ThumbsDown } from "lucide-react"

type ExerciseRating = "thumbs_up" | "thumbs_down" | null

type Exercise = {
  id: string
  name: string
  targetSets: number
  targetReps: string
  targetWeight?: string
  restTime: number
  completed: boolean
  rating?: ExerciseRating
  machineSettings?: {
    seat?: string
  }
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

function getExerciseLabel(name: string): string {
  const lower = name.trim().toLowerCase()
  if (lower === "leg extension (light)") {
    return "Single-Leg Leg Extension"
  }
  return name
}

function parseRepRange(targetReps: string): { low: number; high: number } | null {
  const match = targetReps.match(/^(\d+)\s*[-–]\s*(\d+)$/)
  if (!match) return null
  return { low: parseInt(match[1], 10), high: parseInt(match[2], 10) }
}

function isMachineExercise(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    lower.includes("machine") ||
    lower.includes("cable") ||
    lower.includes("smith") ||
    lower.includes("lever") ||
    lower.includes("hack") ||
    lower.includes("pendulum")
  )
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

export default function WorkoutSessionComponent({ routine, isDeload = false }: { routine: WorkoutRoutine; isDeload?: boolean }) {
  const router = useRouter()
  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [exercises, setExercises] = useState<any[]>([])
  const [isHydrated, setIsHydrated] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)
  const [restState, setRestState] = useState<WorkoutSession["restTimer"]>(undefined)
  const [validationTrigger, setValidationTrigger] = useState(0)
  const [focusedInput, setFocusedInput] = useState<string | null>(null)
  const [uiNow, setUiNow] = useState(() => Date.now())
  const restStartAtRef = useRef<number | null>(null)
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
  const [, setPendingRemoteUpdates] = useState<Record<string, boolean>>({})
  const [progressiveAutofillEnabled, setProgressiveAutofillEnabled] = useState(true)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isScrollingProgrammatically = useRef(false)
  const scrollRafRef = useRef<number | null>(null)
  const scrollSettleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [repCapErrors, setRepCapErrors] = useState<Record<string, boolean>>({})
  const [, setRecentlySaved] = useState(false)
  const recentlySavedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const weightInputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map())
  const repsInputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map())
  const restNotificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restNotificationEndsAtRef = useRef<number | null>(null)
  const [plateDisplayMode, setPlateDisplayMode] = useState<"per-side" | "total">("per-side")
  const [plateStartingWeight, setPlateStartingWeight] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  const [, setSyncState] = useState<SyncState>("draft")
  const [, setLastSyncedAt] = useState<string | null>(null)
  const hasSyncedDraftRef = useRef(false)
  const sessionRef = useRef<WorkoutSession | null>(null)
  const exercisesRef = useRef<any[]>([])
  const [uiExerciseIndex, setUiExerciseIndex] = useState(0)
  const currentExerciseIndexRef = useRef(0)
  const historyRepsCacheRef = useRef<Map<string, number[]>>(new Map())
  const maxSetVolumeByExercise = useMemo(() => {
    const history = getWorkoutHistory()
    const map = new Map<string, number>()
    history.forEach((workout) => {
      workout.exercises?.forEach((exercise: any) => {
        const key = normalizeExerciseName(exercise.name)
        const maxForExercise = map.get(key) ?? 0
        const maxForWorkout = (exercise.sets || [])
          .filter((set: any) => isSetEligibleForStats(set))
          .reduce((max: number, set: any) => {
            const volume = (set.weight ?? 0) * (set.reps ?? 0)
            return volume > max ? volume : max
          }, 0)
        if (maxForWorkout > maxForExercise) {
          map.set(key, maxForWorkout)
        }
      })
    })
    return map
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = localStorage.getItem("progressive_autofill_enabled")
    if (stored === null) return
    setProgressiveAutofillEnabled(stored === "true")
  }, [])

  useEffect(() => {
    ensureWorkoutSync()
    if (supabase) {
      supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
    }
  }, [])

  useEffect(() => {
    hasSyncedDraftRef.current = false
  }, [session?.id])

  useEffect(() => {
    historyRepsCacheRef.current.clear()
  }, [session?.id])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    exercisesRef.current = exercises
  }, [exercises])

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

  const resolveWorkoutId = (currentSession: WorkoutSession) => {
    if (currentSession.workoutId && isUuid(currentSession.workoutId)) return currentSession.workoutId
    if (isUuid(currentSession.id)) return currentSession.id
    return generateWorkoutId()
  }

  const touchDraft = async (workoutId: string) => {
    await updateWorkoutDraft(workoutId, {
      updated_at_client: Date.now(),
      sync_state: "draft",
      last_sync_error: null,
    })
  }

  const persistSetDraft = async (
    workoutId: string,
    exercise: Exercise,
    set: Exercise["sets"][number],
    setIndex: number
  ) => {
    if (!set?.id) return
    await upsertSetDraft(workoutId, {
      set_id: set.id,
      workout_id: workoutId,
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      set_index: setIndex,
      reps: set.reps ?? null,
      weight: set.weight ?? null,
      completed: Boolean(set.completed),
      updated_at_client: Date.now(),
    })
  }

  const syncExerciseDraft = async (
    workoutId: string,
    exercise: Exercise,
    sets: Exercise["sets"]
  ) => {
    const tasks = sets.map((set, idx) => persistSetDraft(workoutId, exercise, set, idx))
    await Promise.all(tasks)
  }

  const isGhostSet = (set: any) => {
    const repsEmpty = set.reps === null || set.reps === undefined || set.reps === 0
    const weightEmpty = set.weight === null || set.weight === undefined
    return !set.completed && repsEmpty && weightEmpty
  }

  const canCutOffFinalSet = (exercise: any) => {
    const sets = Array.isArray(exercise?.sets) ? exercise.sets : []
    if (sets.length === 0) return false
    const lastSet = sets[sets.length - 1]
    return Boolean(lastSet) && !lastSet.completed
  }

  const canExerciseBeFinished = (exercise: any) => {
    const sets = Array.isArray(exercise?.sets) ? exercise.sets : []
    if (sets.length === 0) return true
    const lastSetIndex = sets.length - 1
    return sets.every((set: any, index: number) => {
      if (set.completed) {
        return !isSetIncomplete(set)
      }
      return index === lastSetIndex
    })
  }

  const getCachedHistoryReps = (exerciseName: string) => {
    const key = normalizeExerciseName(exerciseName)
    const cached = historyRepsCacheRef.current.get(key)
    if (cached) return cached
    const reps = getExerciseHistory(exerciseName).flatMap((workout) =>
      workout.exercises
        .filter((ex: any) => ex.name === exerciseName)
        .flatMap((ex: any) =>
          ex.sets.filter((set: any) => isSetEligibleForStats(set)).map((set: any) => set.reps ?? 0)
        )
    )
    historyRepsCacheRef.current.set(key, reps)
    return reps
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
        // Deload: reduce sets by ~50% (round up so minimum is 1)
        const effectiveSets = isDeload ? Math.max(1, Math.ceil(targetSets / 2)) : targetSets
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
        if (defaults.reps === null && defaults.weight === 0) {
          defaults.reps = REP_MIN
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

        const warmupSets: Array<{
          id: string
          reps: number | null
          weight: number | null
          completed: boolean
          isOutlier: boolean
          validationFlags: string[]
          isIncomplete: boolean
        }> = []
        for (let idx = 0; idx < effectiveSets; idx += 1) {
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

        const savedMachineSettings = getMachineSettings(exercise.name)
        return {
          id: exercise.id,
          name: exercise.name,
          targetSets,
          targetReps,
          targetWeight: exercise.targetWeight,
          restTime,
          completed: false,
          machineSettings: Object.keys(savedMachineSettings).length > 0 ? savedMachineSettings : undefined,
          sets: isWarmup
            ? warmupSets
            : Array.from({ length: effectiveSets }, (_, setIndex) => {
                const lastSet = getMostRecentCompletedSetPerformance(exercise.name, setIndex, session?.id)
                const nextReps = lastSet?.reps ?? defaults.reps
                const rawWeight = lastSet?.weight ?? defaults.weight
                // Deload: scale weight to 72.5% of working weight, rounded to nearest 5 lbs.
                // Only applied when there is an actual previous weight to scale from.
                const nextWeight =
                  isDeload && rawWeight
                    ? Math.round((rawWeight * 0.725) / 5) * 5
                    : rawWeight
                const flagsResult = getSetFlags({
                  reps: nextReps,
                  weight: nextWeight,
                  targetReps,
                  historyReps,
                })
                return {
                  id: generateSetId(),
                  reps: nextReps,
                  weight: nextWeight,
                  completed: false,
                  isOutlier: flagsResult.flags.includes("rep_outlier"),
                  validationFlags: flagsResult.flags,
                  isIncomplete: flagsResult.isIncomplete,
                }
              }),
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
          workoutId: currentSession.workoutId,
        }

        const ensuredWorkoutId = resolveWorkoutId(normalizedSession)
        const sessionWithWorkoutId =
          normalizedSession.workoutId === ensuredWorkoutId
            ? normalizedSession
            : { ...normalizedSession, workoutId: ensuredWorkoutId }

        saveCurrentSessionId(normalizedSession.id)

        const restTimer =
          sessionWithWorkoutId.restTimer && !sessionWithWorkoutId.restTimer.startedAt
            ? { ...sessionWithWorkoutId.restTimer, startedAt: new Date().toISOString() }
            : sessionWithWorkoutId.restTimer
        const hydratedSession = restTimer ? { ...sessionWithWorkoutId, restTimer } : sessionWithWorkoutId

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
        const workoutId = generateWorkoutId()
        const newSession: WorkoutSession = {
          id: newSessionId,
          workoutId,
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

  useEffect(() => {
    if (!isHydrated || !session || !userId) return
    const workoutId = resolveWorkoutId(session)
    if (session.workoutId !== workoutId) {
      const updatedSession: WorkoutSession = {
        ...session,
        workoutId,
      }
      setSession(updatedSession)
      void saveSession(updatedSession)
    }

    if (hasSyncedDraftRef.current) return
    hasSyncedDraftRef.current = true

    const hydrateDraft = async () => {
      const existing = await getWorkoutDraft(workoutId)
      if (!existing) {
        await createWorkoutDraft({
          workout_id: workoutId,
          user_id: userId,
          started_at: session.startedAt,
          routine_id: routine.id,
          routine_name: routine.name,
        })
      } else {
        await updateWorkoutDraft(workoutId, {
          routine_id: routine.id,
          routine_name: routine.name,
        })
      }

      const exercisesToSync = exercises.length > 0 ? exercises : session.exercises || []
      const syncTasks: Promise<void>[] = []
      exercisesToSync.forEach((exercise: any) => {
        if (!exercise?.sets) return
        syncTasks.push(syncExerciseDraft(workoutId, exercise, exercise.sets))
      })
      await Promise.all(syncTasks)

      const draft = await getWorkoutDraft(workoutId)
      if (draft) {
        setSyncState(draft.sync_state)
      }
    }

    void hydrateDraft()
  }, [isHydrated, session, userId, exercises, routine.id, routine.name])

  const resolvedExerciseIndex = Number.isFinite(Number(session?.currentExerciseIndex))
    ? Number(session?.currentExerciseIndex)
    : 0
  const currentExerciseIndex = Math.min(
    Math.max(resolvedExerciseIndex, 0),
    Math.max(0, exercises.length - 1)
  )
  useEffect(() => {
    currentExerciseIndexRef.current = currentExerciseIndex
    setUiExerciseIndex(currentExerciseIndex)
  }, [currentExerciseIndex])
  const currentExercise = exercises[currentExerciseIndex]
  const firstIncompleteIndex =
    currentExercise?.sets?.findIndex((set: any) => !set.completed) ?? -1
  const currentSetIndex = firstIncompleteIndex === -1 ? 0 : firstIncompleteIndex
  const isResting = Boolean(restState) && typeof restState?.remainingSeconds === "number"
  const canFinishWorkout = exercises.every((exercise) => canExerciseBeFinished(exercise))

  const totalVolume = exercises.reduce((sum: number, exercise: any) => {
    const sets = Array.isArray(exercise?.sets) ? exercise.sets : []
    const volume = sets.reduce((acc: number, set: any) => {
      if (!set?.completed) return acc
      if (typeof set.weight !== "number" || typeof set.reps !== "number") return acc
      return acc + set.weight * set.reps
    }, 0)
    return sum + volume
  }, 0)

  const totalSetsCompleted = exercises.reduce((sum: number, exercise: any) => {
    const sets = Array.isArray(exercise?.sets) ? exercise.sets : []
    return sum + sets.filter((set: any) => set?.completed).length
  }, 0)

  const totalSets = exercises.reduce((sum: number, exercise: any) => {
    const count = typeof exercise?.targetSets === "number" ? exercise.targetSets : exercise?.sets?.length ?? 0
    return sum + count
  }, 0)

  const formatSeconds = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const fireRestNotification = async () => {
    if (typeof window === "undefined") return
    if (!("Notification" in window)) return
    if (Notification.permission !== "granted") return
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready
        await registration.showNotification("Akt", {
          body: "Rest is over. Start your next set.",
        })
        return
      } catch {
        // fall back to in-page notification
      }
    }
    try {
      new Notification("Akt", {
        body: "Rest is over. Start your next set.",
      })
    } catch {
      // ignore notification errors
    }
  }

  const scheduleRestNotification = (seconds: number) => {
    if (typeof window === "undefined") return
    if (restNotificationTimeoutRef.current) {
      clearTimeout(restNotificationTimeoutRef.current)
      restNotificationTimeoutRef.current = null
    }
    restNotificationEndsAtRef.current = Date.now() + seconds * 1000
    if (!("Notification" in window)) return
    if (Notification.permission === "default") {
      void Notification.requestPermission()
      return
    }
    if (Notification.permission !== "granted") return
    restNotificationTimeoutRef.current = setTimeout(() => {
      void fireRestNotification()
    }, seconds * 1000)
  }

  const restRemainingSeconds = (() => {
    if (!isResting || !restState) return 0
    const startAt = restState.startedAt
      ? new Date(restState.startedAt).getTime()
      : restStartAtRef.current ?? uiNow
    const elapsed = Math.floor((uiNow - startAt) / 1000)
    return Math.max(0, restState.remainingSeconds - elapsed)
  })()

  const setRestStateAndPersist = async (
    nextState: WorkoutSession["restTimer"] | null,
    latestExercises?: any[]
  ) => {
    const nextWithStart = nextState
      ? {
          ...nextState,
          startedAt: new Date().toISOString(),
        }
      : null

    restStartAtRef.current = nextWithStart?.startedAt
      ? new Date(nextWithStart.startedAt).getTime()
      : null
    setRestState(nextWithStart || undefined)
    setUiNow(Date.now())
    if (!nextWithStart && restNotificationTimeoutRef.current) {
      clearTimeout(restNotificationTimeoutRef.current)
      restNotificationTimeoutRef.current = null
    }
    if (!nextWithStart) {
      restNotificationEndsAtRef.current = null
    }
    if (session) {
      const updatedSession: WorkoutSession = {
        ...session,
        ...(latestExercises !== undefined ? { exercises: latestExercises } : {}),
        restTimer: nextWithStart || undefined,
      }
      setSession(updatedSession)
      await saveSession(updatedSession)
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
      if (restNotificationTimeoutRef.current) {
        clearTimeout(restNotificationTimeoutRef.current)
        restNotificationTimeoutRef.current = null
      }
      restNotificationEndsAtRef.current = null
    }
  }, [isResting, restRemainingSeconds])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return
      const endsAt = restNotificationEndsAtRef.current
      if (!endsAt) return
      if (Date.now() >= endsAt) {
        void fireRestNotification()
        restNotificationEndsAtRef.current = null
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener("focus", handleVisibility)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("focus", handleVisibility)
    }
  }, [])

  useEffect(() => {
    if (currentExercise?.name && typeof window !== "undefined") {
      const savedPref = localStorage.getItem(`plate_viz_${currentExercise.name}`)
      setShowPlateCalc(savedPref !== null ? JSON.parse(savedPref) : true)
      // Apply localStorage values first (instant), then overlay with Supabase values
      const savedMode = localStorage.getItem(`plate_mode_${currentExercise.name}`)
      if (savedMode === "total" || savedMode === "per-side") {
        setPlateDisplayMode(savedMode)
      }
      const savedStarting = localStorage.getItem(`plate_start_${currentExercise.name}`)
      if (savedStarting) {
        const parsed = Number(savedStarting)
        if (!Number.isNaN(parsed) && parsed >= 0) {
          setPlateStartingWeight(parsed)
        }
      } else {
        setPlateStartingWeight(0)
      }
      if (userId) {
        void loadExerciseSettings(userId, currentExercise.name).then((remote) => {
          if (!remote) return
          if (remote.barWeight !== undefined) {
            setPlateStartingWeight(remote.barWeight)
            localStorage.setItem(`plate_start_${currentExercise.name}`, String(remote.barWeight))
          }
          if (remote.plateDisplayMode) {
            setPlateDisplayMode(remote.plateDisplayMode)
            localStorage.setItem(`plate_mode_${currentExercise.name}`, remote.plateDisplayMode)
          }
          if (remote.seat !== undefined) {
            const machineSeat = remote.seat
            setExercises((prev: any[]) =>
              prev.map((ex: any) =>
                ex.name === currentExercise.name
                  ? { ...ex, machineSettings: { ...(ex.machineSettings ?? {}), seat: machineSeat } }
                  : ex
              )
            )
            saveMachineSettings(currentExercise.name, { seat: machineSeat })
          }
        })
      }
    }
  }, [currentExercise?.name, userId])

  useEffect(() => {
    setRepCapErrors({})
  }, [currentExercise?.id, currentExercise?.sets?.length])

  useEffect(() => {
    if (!scrollContainerRef.current || isScrollingProgrammatically.current) return
    isScrollingProgrammatically.current = true
    const container = scrollContainerRef.current
    const scrollLeft = currentExerciseIndex * container.offsetWidth
    container.scrollTo({ left: scrollLeft, behavior: "smooth" })

    const timeout = window.setTimeout(() => {
      isScrollingProgrammatically.current = false
    }, 400)

    return () => window.clearTimeout(timeout)
  }, [currentExerciseIndex])

  useEffect(() => {
    if (!session?.startedAt) return
    const start = new Date(session.startedAt).getTime()
    const update = () => {
      const next = Math.max(0, Math.floor((Date.now() - start) / 1000))
      setElapsedSeconds(next)
    }
    update()
    const interval = window.setInterval(update, 1000)
    return () => window.clearInterval(interval)
  }, [session?.startedAt])

  useEffect(() => {
    if (!currentExercise) return
    if (isResting) return
    const activeSet = currentExercise.sets[currentSetIndex]
    if (!activeSet?.id) return
    const weightNode = weightInputRefs.current.get(activeSet.id)
    const repsNode = repsInputRefs.current.get(activeSet.id)
    const shouldFocusReps =
      typeof activeSet.weight === "number" && activeSet.weight > 0 && (!activeSet.reps || activeSet.reps <= 0)
    const target = shouldFocusReps ? repsNode : weightNode
    if (!target) return
    const timeout = window.setTimeout(() => {
      try {
        target.focus()
        target.select()
      } catch {
        // ignore focus errors
      }
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [currentExerciseIndex, currentSetIndex, isResting, currentExercise?.id])

  useEffect(() => {
    if (!session?.remoteSessionId) return
    if (!supabase) return

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
                  historyReps: getCachedHistoryReps(exercise.name),
                })

            const resolvedCompleted = row.completed ?? existingSet?.completed ?? false
            const nextSet = {
              ...(existingSet ?? {}),
              id: row.id,
              reps: mergedReps,
              weight: mergedWeight,
              completed: resolvedCompleted,
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

  const updateSetDataForExercise = async (
    exerciseIndex: number,
    setIndex: number,
    field: "reps" | "weight",
    value: number | null
  ) => {
    if (!session) return
    const workoutId = session.workoutId
    const newExercises = exercises.map((exercise: any, exerciseIdx: number) => {
      if (exerciseIdx !== exerciseIndex) {
        return exercise
      }

      const historyReps = getCachedHistoryReps(exercise.name)

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
        if (workoutId) {
          void persistSetDraft(workoutId, exercise, updatedSet, idx)
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

    exercisesRef.current = newExercises
    setExercises(newExercises)

    const updatedSession: WorkoutSession = {
      ...session,
      exercises: newExercises,
    }

    sessionRef.current = updatedSession
    setSession(updatedSession)
    await saveSession(updatedSession)
    signalAutoSaved()
  }

  const applyProgressiveOverload = async (exerciseIndex: number) => {
    if (!session) return
    const exercise = exercises[exerciseIndex]
    if (!exercise) return

    const repRange = parseRepRange(exercise.targetReps ?? "")
    if (!repRange) return

    const workoutId = session.workoutId
    const historyReps = getCachedHistoryReps(exercise.name)

    const newExercises = exercises.map((ex: any, idx: number) => {
      if (idx !== exerciseIndex) return ex

      const newSets = ex.sets.map((set: any, setIdx: number) => {
        const newWeight = typeof set.weight === "number" ? set.weight + 5 : 5
        const newReps = repRange.low

        const newSet = { ...set, weight: newWeight, reps: newReps, completed: false }

        const flagsResult = getSetFlags({
          reps: newSet.reps,
          weight: newSet.weight,
          targetReps: ex.targetReps,
          historyReps,
        })

        const updatedSet = {
          ...newSet,
          isOutlier: flagsResult.flags.includes("rep_outlier"),
          validationFlags: flagsResult.flags,
          isIncomplete: flagsResult.isIncomplete,
        }

        if (workoutId) {
          void persistSetDraft(workoutId, ex, updatedSet, setIdx)
        }
        if (session?.remoteSessionId) {
          void upsertSet({
            sessionId: session.remoteSessionId,
            setId: updatedSet.id,
            exerciseId: ex.id,
            setIndex: setIdx,
            reps: updatedSet.reps,
            weight: updatedSet.weight,
            completed: updatedSet.completed,
            validationFlags: updatedSet.validationFlags,
          })
        }

        return updatedSet
      })

      return { ...ex, sets: newSets, completed: false }
    })

    exercisesRef.current = newExercises
    setExercises(newExercises)

    const updatedSession: WorkoutSession = {
      ...session,
      exercises: newExercises,
    }

    sessionRef.current = updatedSession
    setSession(updatedSession)
    await saveSession(updatedSession)
    signalAutoSaved()

    toast.success("+5 lbs applied", { duration: 2000 })
  }

  const updateExerciseMachineSetting = async (
    exerciseIndex: number,
    field: "seat",
    value: string
  ) => {
    if (!session) return
    const normalizedValue = field === "seat" ? value.replace(/\D/g, "") : value
    const newExercises = exercises.map((exercise: any, exerciseIdx: number) => {
      if (exerciseIdx !== exerciseIndex) {
        return exercise
      }
      const nextSettings = {
        ...(exercise.machineSettings || {}),
        [field]: normalizedValue,
      }
      saveMachineSettings(exercise.name, nextSettings)
      if (userId && field === "seat") {
        void saveExerciseSettings(userId, exercise.name, { seat: normalizedValue })
      }
      return { ...exercise, machineSettings: nextSettings }
    })

    exercisesRef.current = newExercises
    setExercises(newExercises)

    const updatedSession: WorkoutSession = {
      ...session,
      exercises: newExercises,
    }

    sessionRef.current = updatedSession
    setSession(updatedSession)
    await saveSession(updatedSession)
    signalAutoSaved()
  }

  const completeSet = async (
    setIndex: number,
    options?: {
      startRest?: boolean
      exerciseIndex?: number
    }
  ) => {
    if (!session) return
    const workoutId = session.workoutId
    const targetExerciseIndex = options?.exerciseIndex ?? currentExerciseIndex
    const shouldAutoRest = options?.startRest ?? targetExerciseIndex === currentExerciseIndex
    let shouldStartRest = false
    let restSecondsToStart: number | null = null
    const newExercises = exercises.map((exercise: any, exerciseIdx: number) => {
      if (exerciseIdx !== targetExerciseIndex) {
        return exercise
      }

      const historyReps = getCachedHistoryReps(exercise.name)

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
          exercise.restTime > 0
        ) {
          shouldStartRest = true
          restSecondsToStart = exercise.restTime
        }

        const updatedSet = {
          ...set,
          completed: isCompleted,
          validationFlags: flagsResult.flags,
          isOutlier: flagsResult.flags.includes("rep_outlier"),
          isIncomplete: flagsResult.isIncomplete,
        }
        if (workoutId) {
          void persistSetDraft(workoutId, exercise, updatedSet, idx)
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

    exercisesRef.current = newExercises
    setExercises(newExercises)

    const updatedSession: WorkoutSession = {
      ...session,
      exercises: newExercises,
    }

    sessionRef.current = updatedSession
    setSession(updatedSession)
    await saveSession(updatedSession)
    signalAutoSaved()

    if (shouldAutoRest && shouldStartRest) {
      const restSeconds =
        restSecondsToStart ??
        exercises[targetExerciseIndex]?.restTime ??
        extractRestSeconds(exercises[targetExerciseIndex]?.notes)
      await setRestStateAndPersist({
        exerciseIndex: targetExerciseIndex,
        setIndex,
        remainingSeconds: restSeconds,
      }, newExercises)
      scheduleRestNotification(restSeconds)
    }
  }

  const rateExercise = async (exerciseIndex: number, rating: ExerciseRating) => {
    if (!session) return
    const newExercises = exercises.map((exercise: any, idx: number) => {
      if (idx !== exerciseIndex) return exercise
      return { ...exercise, rating: exercise.rating === rating ? null : rating }
    })
    exercisesRef.current = newExercises
    setExercises(newExercises)
    const updatedSession: WorkoutSession = { ...session, exercises: newExercises }
    sessionRef.current = updatedSession
    setSession(updatedSession)
    await saveSession(updatedSession)
    signalAutoSaved()
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
    const container = scrollContainerRef.current
    if (!container) return

    if (isScrollingProgrammatically.current) {
      isScrollingProgrammatically.current = false
    }

    if (scrollRafRef.current) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      const pageWidth = container.offsetWidth || 1
      const nextIndex = Math.round(container.scrollLeft / pageWidth)
      if (nextIndex !== uiExerciseIndex) {
        setUiExerciseIndex(nextIndex)
      }

      if (scrollSettleTimeoutRef.current) {
        clearTimeout(scrollSettleTimeoutRef.current)
      }
      scrollSettleTimeoutRef.current = setTimeout(() => {
        if (nextIndex !== currentExerciseIndexRef.current) {
          void setExerciseIndex(nextIndex)
        }
      }, 120)
    })
  }

  const finishWorkout = async () => {
    if (!session) return
    if (isFinishing) return
    setIsFinishing(true)
    const cleanedExercises = exercises.map((exercise: any) => {
      const nonGhostSets = exercise.sets.filter((set: any) => !isGhostSet(set))
      const trimmedSets = canCutOffFinalSet({ ...exercise, sets: nonGhostSets })
        ? nonGhostSets.slice(0, -1)
        : nonGhostSets
      const allCompleted = trimmedSets.every((set: any) => set.completed && !isSetIncomplete(set))
      return {
        ...exercise,
        sets: trimmedSets,
        completed: allCompleted,
      }
    })
    const firstInvalidExerciseIndex = cleanedExercises.findIndex(
      (exercise: any) => !canExerciseBeFinished(exercise)
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

    const completedWorkoutId =
      session.workoutId ?? (isUuid(session.id) ? session.id : generateWorkoutId())
    const completedAtDate = new Date()
    const completedAt = completedAtDate.toISOString()
    const localDateForDisplay = new Date(completedAtDate)
    localDateForDisplay.setHours(12, 0, 0, 0)
    const durationSeconds = Math.floor(
      (completedAtDate.getTime() - new Date(session.startedAt).getTime()) / 1000
    )
    const completedWorkout = {
      id: completedWorkoutId,
      name: routine.name,
      date: localDateForDisplay.toISOString(),
      startedAt: session.startedAt,
      endedAt: completedAt,
      duration: durationSeconds,
      durationUnit: "seconds" as const,
      exercises: cleanedExercises.map((ex: any) => ({
        id: ex.id,
        name: ex.name,
        targetSets: ex.targetSets,
        targetReps: ex.targetReps,
        targetWeight: ex.targetWeight,
        restTime: ex.restTime,
        completed: ex.completed,
        rating: ex.rating ?? null,
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

    try {
      if (userId) {
        const existingDraft = await getWorkoutDraft(completedWorkoutId)
        if (!existingDraft) {
          await createWorkoutDraft({
            workout_id: completedWorkoutId,
            user_id: userId,
            started_at: session.startedAt,
            routine_id: routine.id,
            routine_name: routine.name,
          })
        }
        await updateWorkoutDraft(completedWorkoutId, {
          completed_at: completedAt,
          routine_id: routine.id,
          routine_name: routine.name,
        })
        await markWorkoutPending(completedWorkoutId)
        const allSetDrafts: WorkoutSetDraft[] = []
        cleanedExercises.forEach((exercise: any) => {
          if (!exercise?.sets) return
          exercise.sets.forEach((set: any, idx: number) => {
            if (!set?.id) return
            allSetDrafts.push({
              set_id: set.id,
              workout_id: completedWorkoutId,
              exercise_id: exercise.id,
              exercise_name: exercise.name,
              set_index: idx,
              reps: set.reps ?? null,
              weight: set.weight ?? null,
              completed: Boolean(set.completed),
              updated_at_client: Date.now(),
            })
          })
        })
        await upsertAllSets(completedWorkoutId, allSetDrafts)
        setSyncState("syncing")
        const result = await attemptWorkoutSync({ workoutId: completedWorkoutId })
        setSyncState(result.status)
        if (result.status === "synced") {
          setLastSyncedAt(result.syncedAt ?? new Date().toISOString())
        }
      }
    } catch (error) {
      console.warn("Workout commit failed", error)
      await markWorkoutError(completedWorkoutId, "Commit failed")
      setSyncState("error")
    }

    if (session) {
      const completedSession: WorkoutSession = {
        ...session,
        status: "completed",
        endedAt: completedAt,
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


  const pauseSession = async () => {
    const baseSession = sessionRef.current
    if (baseSession?.status !== "in_progress") return
    const persistedRestTimer = baseSession.restTimer ?? restState ?? undefined
    const updatedSession: WorkoutSession = {
      ...baseSession,
      status: "paused",
      restTimer: persistedRestTimer,
      exercises: exercisesRef.current.length > 0 ? exercisesRef.current : baseSession.exercises,
    }
    setSession(updatedSession)
    await saveSession(updatedSession)
    signalAutoSaved()
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

  const handleInputAutoSelect = (event: React.FocusEvent<HTMLInputElement>) => {
    const target = event.currentTarget
    window.setTimeout(() => {
      try {
        target.select()
      } catch {
        // ignore selection errors
      }
    }, 0)
  }

  const signalAutoSaved = () => {
    setRecentlySaved(true)
    if (recentlySavedTimeoutRef.current) {
      clearTimeout(recentlySavedTimeoutRef.current)
    }
    recentlySavedTimeoutRef.current = setTimeout(() => {
      setRecentlySaved(false)
      recentlySavedTimeoutRef.current = null
    }, 2000)
  }

  const calculatePlates = (
    weight: number,
    startingWeight: number,
    mode: "per-side" | "total"
  ): { plate: number; count: number }[] => {
    const adjusted = Math.max(0, weight - startingWeight)
    const plateWeight = mode === "per-side" ? adjusted / 2 : adjusted

    if (plateWeight <= 0) return []

    const availablePlates = [45, 35, 25, 10, 5, 2.5]
    const plates: { plate: number; count: number }[] = []
    let remaining = plateWeight

    for (const plate of availablePlates) {
      const count = Math.floor(remaining / plate)
      if (count > 0) {
        plates.push({ plate, count })
        remaining -= plate * count
      }
    }

    return plates
  }

  const getSetComparison = (
    set: Exercise["sets"][number],
    last: { weight: number; reps: number } | null,
    maxHistoricalVolume: number
  ) => {
    if (!last) return null
    if (typeof set.weight !== "number" || typeof set.reps !== "number") {
      return { status: "no-history", message: `Last: ${last.weight} × ${last.reps}` }
    }

    const volume = set.weight * set.reps
    if (volume > maxHistoricalVolume) {
      return { status: "pr", message: "NEW PR!" }
    }

    if (set.weight > last.weight || (set.weight === last.weight && set.reps > last.reps)) {
      const weightDelta = set.weight - last.weight
      const repsDelta = set.reps - last.reps
      const delta =
        weightDelta > 0
          ? `${weightDelta} lb${weightDelta === 1 ? "" : "s"}`
          : `${repsDelta} rep${repsDelta === 1 ? "" : "s"}`
      return { status: "progressed", message: `+${delta}` }
    }

    if (set.weight === last.weight && set.reps === last.reps) {
      return { status: "matched", message: "Matched last time" }
    }

    return { status: "recovery", message: "Recovery set" }
  }

  if (!isHydrated || exercises.length === 0) {
    return (
      <div
        className="min-h-screen"
        style={{
          background: "#0D0D0F",
          boxShadow: "inset 0 0 200px rgba(255, 255, 255, 0.01)",
        }}
      />
    )
  }

  return (
    <div
      className="flex flex-col relative overflow-hidden"
      style={{
        height: "100dvh",
        background: "#0D0D0F",
      }}
    >
      <div className="relative z-10" style={{ paddingLeft: "20px", paddingRight: "20px", paddingTop: "20px" }}>
        <AnimatePresence>
          {isResting && restState ? (
            <motion.div
              key="rest-dock"
              className="fixed z-[70] flex items-center justify-between gap-3 border"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: 8,
                transition: { duration: 0.2, ease: "easeOut" },
              }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              style={{
                left: "calc(16px + env(safe-area-inset-left, 0px))",
                right: "calc(16px + env(safe-area-inset-right, 0px))",
                bottom: "calc(20px + env(safe-area-inset-bottom))",
                borderColor:
                  restRemainingSeconds <= 10
                    ? "rgba(255, 255, 255, 0.35)"
                    : "rgba(255, 255, 255, 0.15)",
                background: "rgba(0, 0, 0, 0.55)",
                borderRadius: "14px",
                padding: "8px 10px",
                pointerEvents: "auto",
              }}
            >
              <motion.div
                className="flex items-end gap-3"
                animate={{
                  opacity: restRemainingSeconds <= 10 ? [0.8, 1, 0.8] : 1,
                }}
                transition={
                  restRemainingSeconds <= 10
                    ? { duration: 1, repeat: Infinity, ease: "easeInOut" }
                    : { duration: 0.2, ease: "linear" }
                }
              >
                <div
                  className="text-white/35"
                  style={{
                    fontSize: "8px",
                    fontWeight: 600,
                    letterSpacing: "0.12em",
                    lineHeight: 1,
                    paddingBottom: "5px",
                  }}
                >
                  REST
                </div>
                <div
                  className="text-white leading-none"
                  style={{
                    fontSize: "44px",
                    fontWeight: 400,
                    letterSpacing: "-0.03em",
                    fontVariantNumeric: "tabular-nums",
                    fontFamily: "'Bebas Neue', sans-serif",
                  }}
                >
                  {formatSeconds(restRemainingSeconds)}
                </div>
              </motion.div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (!isResting || !restState) return
                    const next = restRemainingSeconds + 30
                    void setRestStateAndPersist({
                      ...restState,
                      remainingSeconds: next,
                    })
                    scheduleRestNotification(next)
                  }}
                  className="transition-colors duration-150 hover:bg-white/10"
                  style={{
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "none",
                    borderRadius: "2px",
                    padding: "6px 10px",
                  }}
                  type="button"
                >
                  <span className="text-white/90" style={{ fontSize: "10px", fontWeight: 500, letterSpacing: "0.04em" }}>
                    +30s
                  </span>
                </button>
                <button
                  onClick={() => void setRestStateAndPersist(null)}
                  className="transition-colors duration-150 hover:bg-[rgba(255,255,255,0.1)]"
                  style={{
                    background: "rgba(255, 255, 255, 0.08)",
                    border: "none",
                    borderRadius: "2px",
                    padding: "6px 12px",
                  }}
                  type="button"
                >
                  <span className="text-white/95" style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.06em" }}>
                    SKIP
                  </span>
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div
          className="flex-shrink-0 pt-2 pb-2"
          style={{
            paddingBottom: "12px",
            marginTop: "0px",
          }}
        >
          <div className="flex items-center justify-between gap-3 mb-4">
            <button onClick={handleExit} className="text-white/30 hover:text-white/60 transition-colors" type="button">
              <ArrowLeft size={18} strokeWidth={1.5} />
            </button>

            <div className="flex items-center gap-3 flex-1 justify-center">
              <div className="text-center">
                <div className="text-white/30" style={{ fontSize: "6px", fontWeight: 500, letterSpacing: "0.12em", marginBottom: "2px" }}>
                  VOLUME
                </div>
                <div
                  className="text-white/70"
                  style={{ fontSize: "13px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                >
                  {Math.round(totalVolume).toLocaleString()}
                </div>
              </div>

              <div style={{ width: "1px", height: "20px", background: "rgba(255, 255, 255, 0.06)" }} />

              <div className="text-center">
                <div className="text-white/30" style={{ fontSize: "6px", fontWeight: 500, letterSpacing: "0.12em", marginBottom: "2px" }}>
                  SETS
                </div>
                <div
                  className="text-white/70"
                  style={{ fontSize: "13px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                >
                  {totalSetsCompleted}/{totalSets}
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                if (!canFinishWorkout) return
                void finishWorkout()
              }}
              className="transition-colors"
              style={{
                fontSize: "9px",
                fontWeight: 600,
                letterSpacing: "0.08em",
                color: canFinishWorkout ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.25)",
              }}
              type="button"
              disabled={!canFinishWorkout}
            >
              FINISH
            </button>
          </div>

          <div className="flex items-center justify-center gap-1.5 mb-4">
            {exercises.map((exercise, index) => {
              const isComplete = exercise.sets.every((set: any) => set.completed && !isSetIncomplete(set))
              const isCurrent = index === uiExerciseIndex
              return (
                <button
                  key={exercise.id}
                  onClick={() => void setExerciseIndex(index)}
                  className="transition-all duration-200"
                  style={{
                    width: isCurrent ? "20px" : "5px",
                    height: "5px",
                    background: isCurrent
                      ? "rgba(255, 255, 255, 0.5)"
                      : isComplete
                        ? "rgba(255, 255, 255, 0.3)"
                        : "rgba(255, 255, 255, 0.1)",
                    borderRadius: "3px",
                  }}
                  type="button"
                />
              )
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "center" }}>
            <div
              style={{
                height: "1px",
                background: "linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.06), transparent)",
                width: "200px",
              }}
            />
          </div>

        </div>

        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 flex overflow-x-auto overflow-y-hidden"
          style={{
            scrollSnapType: "x mandatory",
            scrollBehavior: "smooth",
            WebkitOverflowScrolling: "touch",
            height: "calc(100dvh - 160px)",
          }}
        >
          {exercises.map((exercise: any, exerciseIndex: number) => {
            const exerciseCurrentSetIndex = exercise.sets.findIndex((set: any) => !set.completed)
            const activeSetIndex = exerciseCurrentSetIndex === -1 ? 0 : exerciseCurrentSetIndex
            const isCompactSets = showPlateCalc && exercise.sets.length >= 4
            const canEditExercise = exerciseIndex === currentExerciseIndex || exerciseIndex < currentExerciseIndex
            const exerciseRepRange = parseRepRange(exercise.targetReps ?? "")
            const showProgressiveOverload =
              exerciseIndex === currentExerciseIndex &&
              exerciseRepRange !== null &&
              exercise.sets.length > 0 &&
              exercise.sets.every(
                (set: any) =>
                  set.completed && typeof set.reps === "number" && set.reps >= exerciseRepRange.high
              )

            return (
              <div
                key={exercise.id}
                style={{
                  scrollSnapAlign: "start",
                  width: "100%",
                  flexShrink: 0,
                  paddingBottom: "120px",
                  opacity: exerciseIndex === currentExerciseIndex ? 1 : 0.3,
                  transition: "opacity 0.2s ease",
                }}
              >
                <div className="mb-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div
                      className="text-white/30 tracking-widest"
                      style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.15em", fontFamily: "'Archivo Narrow', sans-serif" }}
                    >
                      EXERCISE {exerciseIndex + 1} • {formatSeconds(elapsedSeconds)}
                    </div>
                    <div className="flex items-center gap-2">
                      {exerciseIndex === currentExerciseIndex && isMachineExercise(exercise.name) && (
                        <input
                          type="number"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={exercise.machineSettings?.seat ?? ""}
                          onChange={(e) => void updateExerciseMachineSetting(exerciseIndex, "seat", e.target.value)}
                          placeholder="Seat"
                          className="transition-all duration-150"
                          style={{
                            background: "rgba(255, 255, 255, 0.02)",
                            border: "1px solid rgba(255, 255, 255, 0.06)",
                            borderRadius: "2px",
                            padding: "4px 8px",
                            fontSize: "8px",
                            color: "rgba(255, 255, 255, 0.7)",
                            width: "48px",
                            height: "22px",
                          }}
                        />
                      )}
                      <button
                        onClick={() => {
                          if (exerciseIndex !== currentExerciseIndex) return
                          handleTogglePlateCalc()
                        }}
                        className="transition-all duration-150"
                        style={{
                          background: showPlateCalc ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.02)",
                          border: "none",
                          borderRadius: "2px",
                          padding: "4px 8px",
                          height: "22px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        type="button"
                      >
                        <span
                          className={showPlateCalc ? "text-white/80" : "text-white/30"}
                          style={{ fontSize: "7px", fontWeight: 600, letterSpacing: "0.08em" }}
                        >
                          PLATES
                        </span>
                      </button>
                    </div>
                  </div>

                  {isDeload && (
                    <div
                      style={{
                        display: "inline-block",
                        marginBottom: "6px",
                        background: "rgba(255, 255, 255, 0.04)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "3px",
                        padding: "3px 8px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "8px",
                          fontWeight: 500,
                          letterSpacing: "0.12em",
                          color: "rgba(255, 255, 255, 0.28)",
                          fontFamily: "'Archivo Narrow', sans-serif",
                          textTransform: "uppercase",
                        }}
                      >
                        Deload Week
                      </span>
                    </div>
                  )}

                  <h1
                    className="text-white/95"
                    style={{
                      fontSize: "36px",
                      fontWeight: 400,
                      letterSpacing: "-0.02em",
                      lineHeight: "0.95",
                      fontFamily: "'Bebas Neue', sans-serif",
                      cursor: "pointer",
                    }}
                    onClick={() => router.push(`/exercise/${encodeURIComponent(exercise.name)}?from=session`)}
                  >
                    {getExerciseLabel(exercise.name)}
                  </h1>

                  {exercise.targetReps && (
                    <div
                      className="text-white/25 mt-2"
                      style={{ fontSize: "8px", fontWeight: 400, letterSpacing: "0.08em", fontFamily: "'Archivo Narrow', sans-serif" }}
                    >
                      TARGET {exercise.targetReps} REPS
                    </div>
                  )}

                  <div
                    className="text-white/20 flex items-center gap-2"
                    style={{ fontSize: "8px", fontWeight: 400, letterSpacing: "0.08em", fontFamily: "'Archivo Narrow', sans-serif", marginTop: "6px" }}
                  >
                    <span>{exercise.sets.length} SET{exercise.sets.length !== 1 ? "S" : ""}</span>
                    <span>•</span>
                    <span>NOW: SET {activeSetIndex + 1}/{exercise.sets.length}</span>
                  </div>
                </div>

                <div className="flex flex-col" style={{ gap: isCompactSets ? "16px" : "28px" }}>
                  {exercise.sets.map((set: any, setIndex: number) => {
                    const setKey = set.id ?? `${exercise.id}-${setIndex}`
                    const isActiveExercise = exerciseIndex === currentExerciseIndex
                    const isCurrentSet = isActiveExercise && setIndex === activeSetIndex
                    const isCompactCompleted = isActiveExercise && set.completed
                    const isCompressedCompletedSet = isCompactSets && isCompactCompleted && !isCurrentSet
                    const repCapError = repCapErrors[setKey] || set.validationFlags?.includes("reps_hard_invalid")
                    const missingWeight = isMissingWeight(set.weight)
                    const missingReps = isMissingReps(set.reps)
                    const showMissing = Boolean(validationTrigger) && isCurrentSet && (missingWeight || missingReps)
                    const lastSet = getMostRecentCompletedSetPerformance(exercise.name, setIndex, session?.id)
                    const comparison = getSetComparison(
                      set,
                      lastSet,
                      maxSetVolumeByExercise.get(normalizeExerciseName(exercise.name)) ?? 0
                    )
                    const plates =
                      typeof set.weight === "number"
                        ? calculatePlates(set.weight, plateStartingWeight, plateDisplayMode)
                        : []
                    const isPlateSetActive =
                      exerciseIndex === currentExerciseIndex &&
                      !set.completed &&
                      plates.length > 0 &&
                      (isCurrentSet ||
                        focusedInput === `${setKey}-weight` ||
                        focusedInput === `${setKey}-reps`)

                    return (
                      <div key={setKey}>
                        <div
                          className="text-white/30 tracking-widest"
                          style={{
                            fontSize: "7px",
                            fontWeight: 500,
                            letterSpacing: "0.12em",
                            fontFamily: "'Archivo Narrow', sans-serif",
                            marginBottom: isCompressedCompletedSet ? "4px" : "12px",
                          }}
                        >
                          SET {setIndex + 1}
                        </div>

                        <div
                          className="flex items-center gap-3"
                          style={{ marginBottom: isCompressedCompletedSet ? "4px" : "12px" }}
                        >
                          <div className="flex-1 relative">
                            <input
                              type="number"
                              value={set.weight ?? ""}
                              onChange={(e) => {
                                if (!canEditExercise) return
                                const raw = e.target.value
                                if (!raw.trim()) {
                                  void updateSetDataForExercise(exerciseIndex, setIndex, "weight", null)
                                  return
                                }
                                const parsed = parseNumber(raw)
                                if (parsed === null || parsed < 0) return
                                void updateSetDataForExercise(exerciseIndex, setIndex, "weight", parsed)
                              }}
                              onFocus={(e) => {
                                if (set.id) handleSetFieldFocus(set.id, "weight")
                                handleInputAutoSelect(e)
                                setFocusedInput(`${setKey}-weight`)
                              }}
                              onBlur={() => {
                                if (set.id) handleSetFieldBlur(set.id, "weight")
                                setFocusedInput(null)
                              }}
                              placeholder="—"
                              className="w-full transition-all duration-150"
                              disabled={!canEditExercise}
                              style={{
                                background: set.completed
                                  ? "rgba(255, 255, 255, 0.02)"
                                  : focusedInput === `${setKey}-weight`
                                    ? "rgba(255, 255, 255, 0.06)"
                                    : "rgba(255, 255, 255, 0.03)",
                                border: `1px solid ${
                                  showMissing && missingWeight
                                    ? "rgba(255, 255, 255, 0.4)"
                                    : focusedInput === `${setKey}-weight`
                                      ? "rgba(255, 255, 255, 0.2)"
                                      : "transparent"
                                }`,
                                borderRadius: "2px",
                                padding: isCompressedCompletedSet
                                  ? "5px"
                                  : isCompactCompleted
                                    ? (isCompactSets ? "8px" : "12px")
                                    : isCompactSets ? "12px" : "18px",
                                fontSize: isCompressedCompletedSet
                                  ? "16px"
                                  : isCompactCompleted
                                    ? (isCompactSets ? "18px" : "22px")
                                    : isCompactSets ? "22px" : "28px",
                                fontWeight: 600,
                                letterSpacing: "-0.02em",
                                color: set.completed ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.95)",
                                fontVariantNumeric: "tabular-nums",
                                outline: "none",
                                textAlign: "center",
                              }}
                            />
                            <div
                              className="text-white/25 text-center transition-colors duration-150"
                              style={{
                                marginTop: isCompressedCompletedSet ? "2px" : "6px",
                                fontSize: isCompactCompleted ? (isCompactSets ? "6px" : "7px") : isCompactSets ? "7px" : "8px",
                                fontWeight: 500,
                                letterSpacing: "0.06em",
                                color: focusedInput === `${setKey}-weight` ? "rgba(255, 255, 255, 0.5)" : "rgba(255, 255, 255, 0.25)",
                              }}
                            >
                              LBS
                            </div>
                          </div>

                          <div className="flex-1 relative">
                            <input
                              type="number"
                              value={set.reps ?? ""}
                              onChange={(e) => {
                                if (!canEditExercise) return
                                const raw = e.target.value
                                if (!raw.trim()) {
                                  setRepCapErrors((prev) => ({ ...prev, [setKey]: false }))
                                  void updateSetDataForExercise(exerciseIndex, setIndex, "reps", null)
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
                                void updateSetDataForExercise(exerciseIndex, setIndex, "reps", clamped)
                              }}
                              onFocus={(e) => {
                                if (set.id) handleSetFieldFocus(set.id, "reps")
                                handleInputAutoSelect(e)
                                setFocusedInput(`${setKey}-reps`)
                              }}
                              onBlur={() => {
                                if (set.id) handleSetFieldBlur(set.id, "reps")
                                setFocusedInput(null)
                              }}
                              placeholder="—"
                              className="w-full transition-all duration-150"
                              disabled={!canEditExercise}
                              style={{
                                background: set.completed
                                  ? "rgba(255, 255, 255, 0.02)"
                                  : focusedInput === `${setKey}-reps`
                                    ? "rgba(255, 255, 255, 0.06)"
                                    : "rgba(255, 255, 255, 0.03)",
                                border: `1px solid ${
                                  (repCapError || (showMissing && missingReps))
                                    ? "rgba(255, 255, 255, 0.4)"
                                    : focusedInput === `${setKey}-reps`
                                      ? "rgba(255, 255, 255, 0.2)"
                                      : "transparent"
                                }`,
                                borderRadius: "2px",
                                padding: isCompressedCompletedSet
                                  ? "5px"
                                  : isCompactCompleted
                                    ? (isCompactSets ? "8px" : "12px")
                                    : isCompactSets ? "12px" : "18px",
                                fontSize: isCompressedCompletedSet
                                  ? "16px"
                                  : isCompactCompleted
                                    ? (isCompactSets ? "18px" : "22px")
                                    : isCompactSets ? "22px" : "28px",
                                fontWeight: 600,
                                letterSpacing: "-0.02em",
                                color: set.completed ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.95)",
                                fontVariantNumeric: "tabular-nums",
                                outline: "none",
                                textAlign: "center",
                              }}
                            />
                            <div
                              className="text-white/25 text-center transition-colors duration-150"
                              style={{
                                marginTop: isCompressedCompletedSet ? "2px" : "6px",
                                fontSize: isCompactCompleted ? (isCompactSets ? "6px" : "7px") : isCompactSets ? "7px" : "8px",
                                fontWeight: 500,
                                letterSpacing: "0.06em",
                                color: focusedInput === `${setKey}-reps` ? "rgba(255, 255, 255, 0.5)" : "rgba(255, 255, 255, 0.25)",
                              }}
                            >
                              REPS
                            </div>
                          </div>

                          <div className="flex items-center justify-center">
                            <button
                              onClick={() => {
                                if (!canEditExercise) return
                                if (!set.completed && (isSetIncomplete(set) || repCapError)) {
                                  setValidationTrigger(Date.now())
                                  return
                                }
                                void completeSet(setIndex, { exerciseIndex, startRest: isCurrentSet })
                              }}
                              disabled={!canEditExercise || (!set.completed && (isSetIncomplete(set) || repCapError))}
                              className="flex items-center justify-center transition-all duration-150"
                              style={{
                                width: isCompressedCompletedSet ? "30px" : "36px",
                                height: isCompressedCompletedSet ? "30px" : "36px",
                                background: set.completed
                                  ? "rgba(255, 255, 255, 0.08)"
                                  : "rgba(255, 255, 255, 0.03)",
                                border: "none",
                                borderRadius: "2px",
                                opacity: !canEditExercise || (!set.completed && (isSetIncomplete(set) || repCapError)) ? 0.35 : 1,
                              }}
                              type="button"
                              aria-label={set.completed ? "Mark Set Incomplete" : "Complete Set"}
                            >
                              {set.completed ? (
                                <Check
                                  size={isCompressedCompletedSet ? 13 : 16}
                                  strokeWidth={2}
                                  style={{ color: "rgba(255, 255, 255, 0.8)" }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: "12px",
                                    height: "12px",
                                    borderRadius: "1px",
                                    border: "1px solid rgba(255, 255, 255, 0.35)",
                                    background: "transparent",
                                    boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.05)",
                                  }}
                                />
                              )}
                            </button>
                          </div>

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

                        {isActiveExercise &&
                          lastSet &&
                          typeof set.weight === "number" &&
                          typeof set.reps === "number" && (
                          <div
                            className="flex items-center gap-2"
                            style={{ marginBottom: isCompressedCompletedSet ? "4px" : isCompactSets ? "8px" : "12px" }}
                          >
                            <div
                              className="text-white/20"
                              style={{
                                fontSize: isCompressedCompletedSet ? "7px" : isCompactSets ? "8px" : "9px",
                                fontWeight: 400,
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              Last: {lastSet.weight} × {lastSet.reps}
                            </div>
                            {comparison?.status !== "no-history" && (
                              <div
                                className="flex items-center gap-1.5"
                                style={{
                                  fontSize: isCompressedCompletedSet ? "7px" : "9px",
                                  fontWeight: comparison?.status === "pr" ? 600 : 400,
                                  color:
                                    comparison?.status === "pr"
                                      ? "rgba(255, 255, 255, 0.9)"
                                      : comparison?.status === "progressed"
                                        ? "rgba(255, 255, 255, 0.5)"
                                        : comparison?.status === "recovery"
                                          ? "rgba(255, 255, 255, 0.25)"
                                          : "rgba(255, 255, 255, 0.3)",
                                  letterSpacing: comparison?.status === "pr" ? "0.06em" : "0",
                                }}
                              >
                                {comparison?.message}
                              </div>
                            )}
                          </div>
                        )}

                        {showPlateCalc && isPlateSetActive && (
                          <div className="mb-3">
                            <div className="flex items-center gap-2 mb-3">
                              <button
                                className="transition-colors duration-150"
                                style={{
                                  background: "rgba(255, 255, 255, 0.08)",
                                  border: "none",
                                  borderRadius: "2px",
                                  padding: "4px 8px",
                                }}
                                onClick={() => {
                                  const nextMode = plateDisplayMode === "per-side" ? "total" : "per-side"
                                  setPlateDisplayMode(nextMode)
                                  if (currentExercise?.name) {
                                    localStorage.setItem(`plate_mode_${currentExercise.name}`, nextMode)
                                    if (userId) {
                                      void saveExerciseSettings(userId, currentExercise.name, { plateDisplayMode: nextMode })
                                    }
                                  }
                                }}
                                type="button"
                              >
                                <span
                                  className="text-white/80"
                                  style={{ fontSize: "7px", fontWeight: 600, letterSpacing: "0.06em" }}
                                >
                                  {plateDisplayMode === "per-side" ? "PER SIDE" : "TOTAL"}
                                </span>
                              </button>
                              <span className="text-white/30" style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.06em" }}>
                                BAR
                              </span>
                              <input
                                type="number"
                                value={plateStartingWeight || ""}
                                onChange={(e) => {
                                  const value = Number(e.target.value)
                                  const nextValue = Number.isNaN(value) ? 0 : Math.max(0, value)
                                  setPlateStartingWeight(nextValue)
                                  if (currentExercise?.name) {
                                    localStorage.setItem(`plate_start_${currentExercise.name}`, String(nextValue))
                                    if (userId) {
                                      void saveExerciseSettings(userId, currentExercise.name, { barWeight: nextValue })
                                    }
                                  }
                                }}
                                onFocus={handleInputAutoSelect}
                                className="transition-colors duration-150"
                                style={{
                                  width: "52px",
                                  background: "rgba(255, 255, 255, 0.04)",
                                  border: "none",
                                  borderRadius: "2px",
                                  padding: "4px 8px",
                                  fontSize: "13px",
                                  color: "rgba(255, 255, 255, 0.8)",
                                  fontVariantNumeric: "tabular-nums",
                                  fontWeight: 600,
                                  textAlign: "center",
                                }}
                              />
                            </div>

                            <div className="flex items-center gap-1.5 mb-3">
                              {plates.map((plate, plateIndex) => (
                                <div key={plateIndex} className="flex items-center gap-1">
                                  {Array.from({ length: plate.count }).map((_, countIndex) => {
                                    const getPlateColor = () => {
                                      if (plate.plate === 45) return "rgba(180, 60, 60, 0.6)"
                                      if (plate.plate === 35) return "rgba(60, 100, 180, 0.6)"
                                      if (plate.plate === 25) return "rgba(60, 160, 100, 0.6)"
                                      if (plate.plate === 10) return "rgba(200, 160, 70, 0.6)"
                                      if (plate.plate === 5) return "rgba(200, 200, 200, 0.6)"
                                      return "rgba(100, 100, 100, 0.6)"
                                    }

                                    const getPlateHeight = () => {
                                      if (plate.plate === 45) return 40
                                      if (plate.plate === 35) return 34
                                      if (plate.plate === 25) return 28
                                      if (plate.plate === 10) return 20
                                      if (plate.plate === 5) return 16
                                      return 12
                                    }

                                    return (
                                      <div
                                        key={countIndex}
                                        style={{
                                          width: "7px",
                                          height: `${getPlateHeight()}px`,
                                          background: getPlateColor(),
                                          border: "1px solid rgba(255, 255, 255, 0.1)",
                                          borderRadius: "1px",
                                        }}
                                      />
                                    )
                                  })}
                                </div>
                              ))}
                              <div
                                style={{
                                  width: "40px",
                                  height: "5px",
                                  background: "rgba(160, 160, 160, 0.4)",
                                  border: "1px solid rgba(255, 255, 255, 0.1)",
                                  borderRadius: "1px",
                                  marginLeft: "4px",
                                }}
                              />
                            </div>

                            <div
                              className="text-white/30"
                              style={{ fontSize: "8px", fontWeight: 500, fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em" }}
                            >
                              {plates.map((plate, plateIndex) => (
                                <span key={plateIndex}>
                                  {plateIndex > 0 && " + "}
                                  {plate.count > 1 ? `${plate.count}×` : ""}{plate.plate}
                                </span>
                              ))} {plateDisplayMode === "per-side" ? "per side" : "total"}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <AnimatePresence>
                  {exerciseIndex === currentExerciseIndex &&
                    exercise.completed &&
                    !exercise.rating && (
                    <motion.div
                      key="exercise-rating"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      style={{ marginTop: "24px" }}
                    >
                      <div
                        className="text-white/25 text-center"
                        style={{ fontSize: "8px", fontWeight: 500, letterSpacing: "0.12em", fontFamily: "'Archivo Narrow', sans-serif", marginBottom: "12px" }}
                      >
                        HOW DID THIS FEEL?
                      </div>
                      <div className="flex items-center justify-center gap-4">
                        <button
                          onClick={() => void rateExercise(exerciseIndex, "thumbs_down")}
                          type="button"
                          style={{
                            background: "rgba(255, 255, 255, 0.03)",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            borderRadius: "3px",
                            padding: "10px 20px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <ThumbsDown size={14} strokeWidth={1.5} style={{ color: "rgba(255, 255, 255, 0.4)" }} />
                          <span style={{ fontSize: "8px", fontWeight: 600, letterSpacing: "0.08em", color: "rgba(255, 255, 255, 0.35)", fontFamily: "'Archivo Narrow', sans-serif" }}>
                            ROUGH
                          </span>
                        </button>
                        <button
                          onClick={() => void rateExercise(exerciseIndex, "thumbs_up")}
                          type="button"
                          style={{
                            background: "rgba(255, 255, 255, 0.03)",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            borderRadius: "3px",
                            padding: "10px 20px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <ThumbsUp size={14} strokeWidth={1.5} style={{ color: "rgba(255, 255, 255, 0.4)" }} />
                          <span style={{ fontSize: "8px", fontWeight: 600, letterSpacing: "0.08em", color: "rgba(255, 255, 255, 0.35)", fontFamily: "'Archivo Narrow', sans-serif" }}>
                            GOOD
                          </span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {exerciseIndex === currentExerciseIndex &&
                    exercise.completed &&
                    exercise.rating && (
                    <motion.div
                      key="exercise-rating-confirmed"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                      style={{ marginTop: "24px" }}
                    >
                      <div className="flex items-center justify-center gap-2">
                        {exercise.rating === "thumbs_up" ? (
                          <ThumbsUp size={12} strokeWidth={1.5} style={{ color: "rgba(255, 255, 255, 0.3)" }} />
                        ) : (
                          <ThumbsDown size={12} strokeWidth={1.5} style={{ color: "rgba(255, 255, 255, 0.3)" }} />
                        )}
                        <span
                          className="text-white/25"
                          style={{ fontSize: "8px", fontWeight: 500, letterSpacing: "0.1em", fontFamily: "'Archivo Narrow', sans-serif" }}
                        >
                          {exercise.rating === "thumbs_up" ? "FELT GOOD" : "FELT ROUGH"}
                        </span>
                        <button
                          onClick={() => void rateExercise(exerciseIndex, exercise.rating!)}
                          type="button"
                          style={{
                            background: "none",
                            border: "none",
                            padding: "2px 4px",
                            cursor: "pointer",
                            fontSize: "8px",
                            color: "rgba(255, 255, 255, 0.2)",
                            fontFamily: "'Archivo Narrow', sans-serif",
                            letterSpacing: "0.08em",
                          }}
                        >
                          UNDO
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {showProgressiveOverload && (
                    <motion.div
                      key="progressive-overload"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      style={{ display: "flex", justifyContent: "center", marginTop: "28px" }}
                    >
                      <button
                        onClick={() => void applyProgressiveOverload(exerciseIndex)}
                        type="button"
                        style={{
                          background: "rgba(255, 255, 255, 0.04)",
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                          borderRadius: "3px",
                          padding: "7px 16px",
                          fontSize: "8px",
                          fontWeight: 600,
                          letterSpacing: "0.1em",
                          color: "rgba(255, 255, 255, 0.4)",
                          boxShadow: "0 0 14px rgba(255, 255, 255, 0.05)",
                          cursor: "pointer",
                          fontFamily: "'Archivo Narrow', sans-serif",
                        }}
                      >
                        PROGRESSIVE OVERLOAD ↑
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>

      <style>{`
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        input[type="number"] {
          -moz-appearance: textfield;
        }
      `}</style>
    </div>
  )
}
