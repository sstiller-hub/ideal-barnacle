"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { WorkoutRoutine } from "@/lib/routine-storage"
import {
  getExerciseHistory,
  getLatestPerformance,
  getMostRecentCompletedSetPerformance,
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
import {
  createWorkoutDraft,
  markWorkoutError,
  markWorkoutPending,
  updateWorkoutDraft,
  upsertSet as upsertSetDraft,
  getWorkoutDraft,
  deleteSet as deleteSetDraft,
  deleteWorkoutDraft,
  type SyncState,
} from "@/lib/workout-draft-storage"
import { attemptWorkoutSync, ensureWorkoutSync } from "@/lib/workout-sync"
import { ArrowLeft, AlertCircle, Check } from "lucide-react"

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
  if (!notes) return 120
  const minutes = notes.match(/rest\s*(\d+)\s*m/i)
  const seconds = notes.match(/rest\s*(\d+)\s*s/i)
  if (minutes) return Number(minutes[1]) * 60
  if (seconds) return Number(seconds[1])
  return 120
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
  const scrollRafRef = useRef<number | null>(null)
  const scrollSettleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [repCapErrors, setRepCapErrors] = useState<Record<string, boolean>>({})
  const [recentlySaved, setRecentlySaved] = useState(false)
  const recentlySavedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const NOTE_CHAR_LIMIT = 360
  const weightInputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map())
  const repsInputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map())
  const restNotificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restNotificationEndsAtRef = useRef<number | null>(null)
  const [plateDisplayMode, setPlateDisplayMode] = useState<"per-side" | "total">("per-side")
  const [plateStartingWeight, setPlateStartingWeight] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  const [syncState, setSyncState] = useState<SyncState>("draft")
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const hasSyncedDraftRef = useRef(false)
  const sessionRef = useRef<WorkoutSession | null>(null)
  const exercisesRef = useRef<any[]>([])
  const [uiExerciseIndex, setUiExerciseIndex] = useState(0)
  const currentExerciseIndexRef = useRef(0)

  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = localStorage.getItem("progressive_autofill_enabled")
    if (stored === null) return
    setProgressiveAutofillEnabled(stored === "true")
  }, [])

  useEffect(() => {
    ensureWorkoutSync()
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  useEffect(() => {
    hasSyncedDraftRef.current = false
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
            : Array.from({ length: targetSets }, (_, setIndex) => {
                const lastSet = getMostRecentCompletedSetPerformance(exercise.name, setIndex, session?.id)
                const nextReps = lastSet?.reps ?? defaults.reps
                const nextWeight = lastSet?.weight ?? defaults.weight
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
  const totalExercises = exercises.length
  const firstIncompleteIndex =
    currentExercise?.sets?.findIndex((set: any) => !set.completed) ?? -1
  const currentSetIndex = firstIncompleteIndex === -1 ? 0 : firstIncompleteIndex
  const isResting = Boolean(restState) && typeof restState?.remainingSeconds === "number"
  const allSetsCompleted =
    currentExercise?.sets?.every((set: any) => set.completed && !isSetIncomplete(set)) ?? false
  const allExercisesCompleted = exercises.every(
    (exercise) => exercise.sets?.every((set: any) => set.completed && !isSetIncomplete(set))
  )
  const syncTimeLabel = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null
  const syncStatusText =
    syncState === "syncing"
      ? "Syncing..."
      : syncState === "synced"
        ? syncTimeLabel
          ? `Saved ${syncTimeLabel}`
          : "Saved"
        : syncState === "pending" || syncState === "error"
          ? "Not synced"
          : "Saved locally"

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
        await registration.showNotification("Rest complete", {
          body: "Time to start your next set.",
        })
        return
      } catch {
        // fall back to in-page notification
      }
    }
    try {
      new Notification("Rest complete", {
        body: "Time to start your next set.",
      })
    } catch {
      // ignore notification errors
    }
  }

  const scheduleRestNotification = (seconds: number) => {
    if (typeof window === "undefined") return
    if (restNotificationTimeoutRef.current) {
      window.clearTimeout(restNotificationTimeoutRef.current)
      restNotificationTimeoutRef.current = null
    }
    restNotificationEndsAtRef.current = Date.now() + seconds * 1000
    if (!("Notification" in window)) return
    if (Notification.permission === "default") {
      void Notification.requestPermission()
      return
    }
    if (Notification.permission !== "granted") return
    restNotificationTimeoutRef.current = window.setTimeout(() => {
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
          startedAt: new Date().toISOString(),
        }
      : null

    restStartAtRef.current = nextWithStart?.startedAt
      ? new Date(nextWithStart.startedAt).getTime()
      : null
    setRestState(nextWithStart || undefined)
    setUiNow(Date.now())
    if (!nextWithStart && restNotificationTimeoutRef.current) {
      window.clearTimeout(restNotificationTimeoutRef.current)
      restNotificationTimeoutRef.current = null
    }
    if (!nextWithStart) {
      restNotificationEndsAtRef.current = null
    }
    if (session) {
      const updatedSession: WorkoutSession = {
        ...session,
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
        window.clearTimeout(restNotificationTimeoutRef.current)
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
    }, 400)

    return () => window.clearTimeout(timeout)
  }, [currentExerciseIndex])

  useEffect(() => {
    setInlineNoteDraft(currentExercise?.sessionNote ?? "")
  }, [currentExerciseIndex, currentExercise?.sessionNote])

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

  const updateSetData = async (setIndex: number, field: "reps" | "weight", value: number | null) => {
    return updateSetDataForExercise(currentExerciseIndex, setIndex, field, value)
  }

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
        if (workoutId) {
          void persistSetDraft(workoutId, exercise, updatedSet, idx)
          void touchDraft(workoutId)
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
    const newExercises = exercises.map((exercise: any, exerciseIdx: number) => {
      if (exerciseIdx !== targetExerciseIndex) {
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
        if (workoutId) {
          void persistSetDraft(workoutId, exercise, updatedSet, idx)
          void touchDraft(workoutId)
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
    signalAutoSaved()

    if (shouldAutoRest && shouldStartRest) {
      const restSeconds =
        exercises[currentExerciseIndex]?.restTime ??
        extractRestSeconds(exercises[currentExerciseIndex]?.notes)
      await setRestStateAndPersist({
        exerciseIndex: currentExerciseIndex,
        setIndex,
        remainingSeconds: restSeconds,
      })
      scheduleRestNotification(restSeconds)
    }
  }

  const addSetToExercise = async (exerciseIndex = currentExerciseIndex) => {
    if (!session) return
    const workoutId = session.workoutId
    const exercise = exercises[exerciseIndex]
    if (!exercise) return
    const defaults = getDefaultSetValues({
      sets: exercise.sets,
      targetReps: exercise.targetReps,
      targetWeight: exercise.targetWeight,
    })
    const prevSet = exercise.sets[exercise.sets.length - 1]
    let nextReps = prevSet?.reps ?? defaults.reps
    const nextWeight = prevSet?.weight ?? defaults.weight
    if (nextReps === null && nextWeight === 0) {
      nextReps = REP_MIN
    }
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
    if (workoutId) {
      void syncExerciseDraft(workoutId, { ...exercise, sets: newSets }, newSets)
      void touchDraft(workoutId)
    }
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
    const workoutId = session.workoutId
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
    if (workoutId && removedSet?.id) {
      void deleteSetDraft(workoutId, removedSet.id)
      void syncExerciseDraft(workoutId, { ...exercise, sets: newSets }, newSets)
      void touchDraft(workoutId)
    }
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
    const workoutId = session.workoutId
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
    if (workoutId) {
      void syncExerciseDraft(workoutId, { ...exercise, sets: newSets }, newSets)
      void touchDraft(workoutId)
    }
  }

  const removeGhostSetsForExercise = async (exerciseIndex: number) => {
    if (!session) return
    const workoutId = session.workoutId
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
    if (workoutId) {
      void syncExerciseDraft(workoutId, { ...exercise, sets: cleanedSets }, cleanedSets)
      void touchDraft(workoutId)
    }
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
      scrollSettleTimeoutRef.current = window.setTimeout(() => {
        if (nextIndex !== currentExerciseIndexRef.current) {
          void setExerciseIndex(nextIndex)
        }
      }, 120)
    })
  }

  const retryWorkoutSync = async () => {
    if (!session?.workoutId) return
    setSyncState("syncing")
    const result = await attemptWorkoutSync({ workoutId: session.workoutId })
    setSyncState(result.status)
    if (result.status === "synced") {
      setLastSyncedAt(result.syncedAt ?? new Date().toISOString())
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

    const completedWorkoutId =
      session.workoutId ?? (isUuid(session.id) ? session.id : generateWorkoutId())
    const completedAtDate = new Date()
    const completedAt = completedAtDate.toISOString()
    const localDateForDisplay = new Date(completedAtDate)
    localDateForDisplay.setHours(12, 0, 0, 0)
    const completedWorkout = {
      id: completedWorkoutId,
      name: routine.name,
      date: localDateForDisplay.toISOString(),
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
        const syncTasks: Promise<void>[] = []
        cleanedExercises.forEach((exercise: any) => {
          if (!exercise?.sets) return
          syncTasks.push(syncExerciseDraft(completedWorkoutId, exercise, exercise.sets))
        })
        await Promise.all(syncTasks)
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

  const renderExerciseContent = (exercise: Exercise, exerciseIndex: number) => {
    const isCurrentExercise = exerciseIndex === currentExerciseIndex
    const canEditExercise = isCurrentExercise || exerciseIndex < currentExerciseIndex
    const exerciseCurrentSetIndex = exercise.sets.findIndex((set) => !set.completed)
    const activeSetIndex = exerciseCurrentSetIndex === -1 ? 0 : exerciseCurrentSetIndex
    const allSetsRecorded = exercise.sets.every((set) => set.completed && !isSetIncomplete(set))
    const isCompactSets = showPlateCalc && exercise.sets.length >= 4

    return (
      <div
        key={exercise.id}
        className="flex-shrink-0"
        style={{
          width: "100%",
          paddingLeft: "20px",
          paddingRight: "20px",
          paddingTop: "12px",
          paddingBottom: "120px",
        }}
      >
        <div className="mb-3">
          <div className="flex items-center justify-between gap-3 mb-1">
            <div
              className="text-white/25 tracking-widest"
              style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.15em", fontFamily: "'Archivo Narrow', sans-serif" }}
            >
              EXERCISE {exerciseIndex + 1} • {routine.name.toUpperCase()} • {formatSeconds(elapsedSeconds)}
            </div>
            <button
              onClick={() => {
                if (!isCurrentExercise) return
                handleTogglePlateCalc()
              }}
              className="transition-all duration-200"
              style={{
                background: showPlateCalc ? "rgba(255, 255, 255, 0.04)" : "transparent",
                border: `1px solid rgba(255, 255, 255, ${showPlateCalc ? "0.12" : "0.06"})`,
                borderRadius: "2px",
                padding: "2px 6px",
              }}
              type="button"
              aria-pressed={showPlateCalc}
            >
              <span
                className={showPlateCalc ? "text-white/70" : "text-white/30"}
                style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.08em" }}
              >
                PLATES
              </span>
            </button>
          </div>

          <h1
            className="text-white/95"
            style={{ fontSize: "32px", fontWeight: 400, letterSpacing: "-0.02em", lineHeight: "1", fontFamily: "'Bebas Neue', sans-serif" }}
          >
            {exercise.name}
          </h1>

          {exercise.targetReps && (
            <div
              className="text-white/20 mt-1.5"
              style={{ fontSize: "8px", fontWeight: 400, letterSpacing: "0.08em", fontFamily: "'Archivo Narrow', sans-serif" }}
            >
              REP RANGE {exercise.targetReps}
            </div>
          )}

          <div
            className="text-white/20"
            style={{ fontSize: "8px", fontWeight: 400, letterSpacing: "0.08em", fontFamily: "'Archivo Narrow', sans-serif", marginTop: exercise.targetReps ? "4px" : "6px" }}
          >
            {exercise.sets.length} SET{exercise.sets.length !== 1 ? "S" : ""} • NOW: SET {activeSetIndex + 1}/{exercise.sets.length}
          </div>

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

        <div
          className="flex flex-col"
          style={{ gap: isResting ? (isCompactSets ? "12px" : "16px") : isCompactSets ? "16px" : "24px" }}
        >
          {exercise.sets.map((set, index) => {
            const setKey = set.id ?? `${exercise.id}-${index}`
            const isCurrentSet = isCurrentExercise && index === activeSetIndex
            const repCapError = repCapErrors[setKey] || set.validationFlags?.includes("reps_hard_invalid")
            const missingWeight = isMissingWeight(set.weight)
            const missingReps = isMissingReps(set.reps)
            const showMissing = Boolean(validationTrigger) && isCurrentExercise && (missingWeight || missingReps)
            const isBlocked = (!set.completed && (isSetIncomplete(set) || repCapError)) || !canEditExercise
            const isCompactCompleted = set.completed
            const lastSet = getMostRecentCompletedSetPerformance(exercise.name, index, session?.id)
            const comparison = getSetComparison(set, lastSet)
            const plates =
              typeof set.weight === "number"
                ? calculatePlates(set.weight, plateStartingWeight, plateDisplayMode)
                : []

            const ariaLabel =
              isCurrentSet && canEditExercise
                ? set.completed
                  ? "Mark Set Incomplete"
                  : "Complete Set"
                : `Toggle Set ${index + 1}`

            return (
              <div key={setKey}>
                <div
                  className="text-white/30 tracking-widest mb-3"
                  style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.12em", fontFamily: "'Archivo Narrow', sans-serif" }}
                >
                  SET {index + 1}/{exercise.sets.length}
                </div>

                <div
                  className="flex items-center gap-3 mb-3"
                  style={{ marginBottom: isResting ? (isCompactSets ? "6px" : "10px") : isCompactSets ? "8px" : "12px" }}
                >
                  <div className="flex-1">
                    <input
                      type="number"
                      value={set.weight ?? ""}
                      onChange={(e) => {
                        if (!canEditExercise) return
                        const raw = e.target.value
                        if (!raw.trim()) {
          void updateSetDataForExercise(exerciseIndex, index, "weight", null)
          return
        }
        const parsed = parseNumber(raw)
        if (parsed === null || parsed < 0) return
        void updateSetDataForExercise(exerciseIndex, index, "weight", parsed)
      }}
                      onFocus={(e) => {
                        if (set.id) handleSetFieldFocus(set.id, "weight")
                        handleInputAutoSelect(e)
                      }}
                      onBlur={() => set.id && handleSetFieldBlur(set.id, "weight")}
                      ref={(node) => {
                        if (set.id) {
                          weightInputRefs.current.set(set.id, node)
                        }
                      }}
                      disabled={!canEditExercise}
      placeholder="—"
                      className="w-full transition-all duration-200"
                      style={{
                        background: set.completed ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.03)",
                        border: `1px solid rgba(255, 255, 255, ${
                          showMissing && missingWeight && !set.completed ? "0.25" : set.completed ? "0.06" : "0.1"
                        })`,
                        borderRadius: "2px",
                        padding: isCompactCompleted
                          ? isResting
                            ? isCompactSets
                              ? "6px"
                              : "8px"
                            : isCompactSets
                              ? "7px"
                              : "10px"
                          : isResting
                            ? isCompactSets
                              ? "8px"
                              : "12px"
                            : isCompactSets
                              ? "10px"
                              : "16px",
                        fontSize: isCompactCompleted
                          ? isResting
                            ? isCompactSets
                              ? "14px"
                              : "16px"
                            : isCompactSets
                              ? "15px"
                              : "18px"
                          : isResting
                            ? isCompactSets
                              ? "18px"
                              : "22px"
                            : isCompactSets
                              ? "20px"
                              : "24px",
                        fontWeight: 500,
                        letterSpacing: "-0.02em",
                        color: set.completed ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.95)",
                        fontVariantNumeric: "tabular-nums",
                        outline: "none",
                        textAlign: "center",
                      }}
                    />
                    <div
                      className="text-white/25 mt-1.5 text-center"
                      style={{
                        fontSize: isCompactCompleted ? (isCompactSets ? "6px" : "7px") : isCompactSets ? "7px" : "8px",
                        fontWeight: 400,
                        letterSpacing: "0.04em",
                        marginTop: isCompactCompleted ? "4px" : "6px",
                      }}
                    >
                      lbs
                    </div>
                  </div>

                  <div className="flex-1">
                    <input
                      type="number"
                      value={set.reps ?? ""}
                      onChange={(e) => {
                        if (!canEditExercise) return
                        const raw = e.target.value
                        if (!raw.trim()) {
          setRepCapErrors((prev) => {
            if (!setKey) return prev
            return { ...prev, [setKey]: false }
          })
          void updateSetDataForExercise(exerciseIndex, index, "reps", null)
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
        void updateSetDataForExercise(exerciseIndex, index, "reps", clamped)
      }}
                      onFocus={(e) => {
                        if (set.id) handleSetFieldFocus(set.id, "reps")
                        handleInputAutoSelect(e)
                      }}
                      onBlur={() => set.id && handleSetFieldBlur(set.id, "reps")}
                      ref={(node) => {
                        if (set.id) {
                          repsInputRefs.current.set(set.id, node)
                        }
                      }}
                      disabled={!canEditExercise}
      placeholder="—"
                      className="w-full transition-all duration-200"
                      style={{
                        background: set.completed ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.03)",
                        border: `1px solid rgba(255, 255, 255, ${
                          (repCapError || (showMissing && missingReps)) && !set.completed ? "0.25" : set.completed ? "0.06" : "0.1"
                        })`,
                        borderRadius: "2px",
                        padding: isCompactCompleted
                          ? isResting
                            ? isCompactSets
                              ? "6px"
                              : "8px"
                            : isCompactSets
                              ? "7px"
                              : "10px"
                          : isResting
                            ? isCompactSets
                              ? "8px"
                              : "12px"
                            : isCompactSets
                              ? "10px"
                              : "16px",
                        fontSize: isCompactCompleted
                          ? isResting
                            ? isCompactSets
                              ? "14px"
                              : "16px"
                            : isCompactSets
                              ? "15px"
                              : "18px"
                          : isResting
                            ? isCompactSets
                              ? "18px"
                              : "22px"
                            : isCompactSets
                              ? "20px"
                              : "24px",
                        fontWeight: 500,
                        letterSpacing: "-0.02em",
                        color: set.completed ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.95)",
                        fontVariantNumeric: "tabular-nums",
                        outline: "none",
                        textAlign: "center",
                      }}
                    />
                    <div
                      className="text-white/25 mt-1.5 text-center"
                      style={{
                        fontSize: isCompactCompleted ? (isCompactSets ? "6px" : "7px") : isCompactSets ? "7px" : "8px",
                        fontWeight: 400,
                        letterSpacing: "0.04em",
                        marginTop: isCompactCompleted ? "4px" : "6px",
                      }}
                    >
                      reps
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
                        void completeSet(index, { exerciseIndex, startRest: isCurrentExercise })
                      }}
                      disabled={!canEditExercise || (!set.completed && (isSetIncomplete(set) || repCapError))}
                      className="flex items-center justify-center transition-all duration-200"
                      style={{
                        width: "28px",
                        height: "28px",
                        background: set.completed ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.02)",
                        border: `1px solid rgba(255, 255, 255, ${set.completed ? "0.2" : "0.08"})`,
                        borderRadius: "2px",
                        opacity: !canEditExercise || (!set.completed && (isSetIncomplete(set) || repCapError)) ? 0.2 : 1,
                      }}
                      type="button"
                      aria-label={ariaLabel}
                    >
                      <Check size={12} strokeWidth={2} style={{ color: set.completed ? "rgba(255, 255, 255, 0.6)" : "rgba(255, 255, 255, 0.3)" }} />
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

                {lastSet && typeof set.weight === "number" && typeof set.reps === "number" && (
                  <div className="flex items-center gap-2 mb-3" style={{ marginBottom: isCompactSets ? "8px" : "12px" }}>
                    <div
                      className="text-white/20"
                      style={{ fontSize: isCompactSets ? "8px" : "9px", fontWeight: 400, fontVariantNumeric: "tabular-nums" }}
                    >
                      Last: {lastSet.weight} × {lastSet.reps}
                    </div>
                    {comparison?.status !== "no-history" && (
                      <div
                        className="flex items-center gap-1.5"
                        style={{
                          fontSize: "9px",
                          fontWeight: comparison?.status === "pr" ? 600 : 400,
                          color:
                            comparison?.status === "pr"
                              ? "rgba(255, 87, 51, 0.9)"
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

                {showPlateCalc && isCurrentSet && !set.completed && plates.length > 0 && (
                  <div className="mb-3" style={{ marginBottom: isCompactSets ? "6px" : "12px" }}>
                    <div
                      className="flex items-center justify-between mb-2"
                      style={{ marginBottom: isCompactSets ? "4px" : "8px" }}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          className="transition-all duration-200"
                          style={{
                            background: plateDisplayMode === "per-side" ? "rgba(255, 255, 255, 0.04)" : "transparent",
                            border: `1px solid rgba(255, 255, 255, ${plateDisplayMode === "per-side" ? "0.12" : "0.06"})`,
                            borderRadius: "2px",
                            padding: "3px 6px",
                          }}
                          onClick={() => {
                            setPlateDisplayMode("per-side")
                            if (currentExercise?.name) {
                              localStorage.setItem(`plate_mode_${currentExercise.name}`, "per-side")
                            }
                          }}
                          type="button"
                        >
                          <span
                            className={plateDisplayMode === "per-side" ? "text-white/70" : "text-white/30"}
                            style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.06em" }}
                          >
                            PER SIDE
                          </span>
                        </button>
                        <button
                          className="transition-all duration-200"
                          style={{
                            background: plateDisplayMode === "total" ? "rgba(255, 255, 255, 0.04)" : "transparent",
                            border: `1px solid rgba(255, 255, 255, ${plateDisplayMode === "total" ? "0.12" : "0.06"})`,
                            borderRadius: "2px",
                            padding: "3px 6px",
                          }}
                          onClick={() => {
                            setPlateDisplayMode("total")
                            if (currentExercise?.name) {
                              localStorage.setItem(`plate_mode_${currentExercise.name}`, "total")
                            }
                          }}
                          type="button"
                        >
                          <span
                            className={plateDisplayMode === "total" ? "text-white/70" : "text-white/30"}
                            style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.06em" }}
                          >
                            TOTAL
                          </span>
                        </button>
                        <span className="text-white/30" style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.06em" }}>
                          START
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
                            }
                          }}
                          onFocus={handleInputAutoSelect}
                          className="transition-all duration-200"
                          style={{
                            width: isCompactSets ? "40px" : "48px",
                            background: "rgba(255, 255, 255, 0.04)",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            borderRadius: "2px",
                            padding: "2px 6px",
                            fontSize: isCompactSets ? "14px" : "16px",
                            color: "rgba(255, 255, 255, 0.7)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        />
                      </div>
                      <div />
                    </div>
                    <div
                      className="flex items-center gap-1 mb-2"
                      style={{ marginBottom: isCompactSets ? "4px" : "8px" }}
                    >
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
                              if (plate.plate === 45) return isCompactSets ? 20 : 32
                              if (plate.plate === 35) return isCompactSets ? 18 : 28
                              if (plate.plate === 25) return isCompactSets ? 16 : 24
                              if (plate.plate === 10) return isCompactSets ? 12 : 18
                              if (plate.plate === 5) return isCompactSets ? 10 : 14
                              return isCompactSets ? 8 : 10
                            }

                            return (
                              <div
                                key={`${setKey}-${plateIndex}-${countIndex}`}
                                style={{
                                  width: isCompactSets ? "5px" : "6px",
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
                          width: isCompactSets ? "24px" : "32px",
                          height: isCompactSets ? "3px" : "4px",
                          background: "rgba(160, 160, 160, 0.4)",
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          borderRadius: "1px",
                          marginLeft: "2px",
                        }}
                      />
                    </div>

                    <div
                      className="text-white/20"
                      style={{ fontSize: isCompactSets ? "7px" : "8px", fontWeight: 400, fontVariantNumeric: "tabular-nums" }}
                    >
                      {plates.map((plate, plateIndex) => (
                        <span key={`${setKey}-plate-${plateIndex}`}>
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
      </div>
    )
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

  const handleDiscardWorkout = async () => {
    if (!session) return
    const confirmed = window.confirm("Discard this workout? This will delete the active workout from this device.")
    if (!confirmed) return
    const workoutId = session.workoutId ?? (isUuid(session.id) ? session.id : null)
    deleteSetsForSession(session.id)
    deleteSession(session.id)
    saveCurrentSessionId(null)
    setRestState(undefined)
    setSession(null)
    setExercises([])
    if (workoutId) {
      await deleteWorkoutDraft(workoutId)
    }
    router.push("/")
  }

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
      window.clearTimeout(recentlySavedTimeoutRef.current)
    }
    recentlySavedTimeoutRef.current = window.setTimeout(() => {
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

  const getSetComparison = (set: Exercise["sets"][number], last: { weight: number; reps: number } | null) => {
    if (!last) return null
    if (typeof set.weight !== "number" || typeof set.reps !== "number") {
      return { status: "no-history", message: `Last: ${last.weight} × ${last.reps}` }
    }

    const weightIncrease = set.weight - last.weight
    const repIncrease = set.reps - last.reps
    if (weightIncrease >= 10 || (weightIncrease === 0 && repIncrease >= 1)) {
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
      className="flex flex-col"
      style={{
        height: "100dvh",
        background: "#0D0D0F",
        boxShadow: "inset 0 0 200px rgba(255, 255, 255, 0.01)",
        position: "relative",
        paddingLeft: "20px",
        paddingRight: "20px",
        paddingTop: "20px",
      }}
    >
      {recentlySaved && (
        <div
          className="flex items-center gap-1.5"
          style={{
            position: "absolute",
            top: "16px",
            right: "20px",
          }}
        >
          <div
            style={{
              width: "4px",
              height: "4px",
              borderRadius: "50%",
              background: "rgba(80, 200, 120, 0.6)",
              animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            }}
          />
          <span
            style={{
              fontSize: "7px",
              fontWeight: 400,
              letterSpacing: "0.08em",
              color: "rgba(80, 200, 120, 0.6)",
              fontFamily: "'Archivo Narrow', sans-serif",
            }}
          >
            AUTO-SAVED
          </span>
        </div>
      )}
      <div
        className="absolute left-5 right-5"
        style={{
          top: "0px",
          marginLeft: "-24px",
          marginRight: "-24px",
          background: "rgba(10, 10, 12, 0.92)",
          border: "1px solid rgba(255, 87, 51, 0.3)",
          borderRadius: "6px",
          padding: "8px 12px",
          backdropFilter: "blur(12px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          zIndex: 20,
          opacity: isResting ? 1 : 0,
          transform: isResting ? "translateY(0)" : "translateY(-8px)",
          transition: "opacity 0.3s ease, transform 0.3s ease",
          pointerEvents: isResting ? "auto" : "none",
        }}
        aria-hidden={!isResting}
      >
        <div className="flex items-center gap-3">
          <div
            className="text-white/40"
            style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.15em", fontFamily: "'Archivo Narrow', sans-serif" }}
          >
            REST
          </div>
          <div
            className="text-white/90"
            style={{
              fontSize: "28px",
              fontWeight: 400,
              letterSpacing: "-0.03em",
              fontVariantNumeric: "tabular-nums",
              fontFamily: "'Bebas Neue', sans-serif",
            }}
          >
            {formatSeconds(restRemainingSeconds)}
          </div>
        </div>
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
            className="transition-all duration-200"
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "2px",
              padding: "6px 10px",
            }}
            type="button"
          >
            <span className="text-white/90" style={{ fontSize: "10px", fontWeight: 400, letterSpacing: "0.04em" }}>
              +30s
            </span>
          </button>
          <button
            onClick={() => void setRestStateAndPersist(null)}
            className="transition-all duration-200"
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "2px",
              padding: "6px 16px",
            }}
            type="button"
          >
            <span className="text-white/90" style={{ fontSize: "11px", fontWeight: 400, letterSpacing: "0.04em" }}>
              Skip
            </span>
          </button>
        </div>
      </div>

      <div
        className="flex-shrink-0 pt-2 pb-2"
        style={{
          paddingBottom: "12px",
          marginTop: isResting ? "48px" : "0px",
          transition: "margin-top 0.3s ease",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <button onClick={handleExit} className="text-white/30 hover:text-white/60 transition-colors" type="button">
            <ArrowLeft size={16} strokeWidth={1.5} />
          </button>

          <div className="flex items-center justify-center gap-1.5 flex-1">
            {exercises.map((exercise, index) => {
              const isComplete = exercise.sets.every((set: any) => set.completed && !isSetIncomplete(set))
              const isCurrent = index === uiExerciseIndex
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

          <div className="flex items-center gap-2">
            {(syncState === "error" || syncState === "pending") && (
              <button
                onClick={retryWorkoutSync}
                className="text-white/40 hover:text-white/70 transition-colors"
                style={{ fontSize: "8px", fontWeight: 500, letterSpacing: "0.04em" }}
                type="button"
              >
                Retry
              </button>
            )}
            <button
              onClick={() => {
                if (!allExercisesCompleted) return
                void finishWorkout()
              }}
              className="text-white/50 hover:text-white/80 transition-colors"
              style={{ fontSize: "8px", fontWeight: 600, letterSpacing: "0.08em" }}
              type="button"
              disabled={!allExercisesCompleted}
            >
              FINISH
            </button>
          </div>
        </div>

        <div style={{ marginTop: "12px", display: "flex", justifyContent: "center" }}>
          <div
            style={{
              height: "1px",
              background: "rgba(255, 255, 255, 0.04)",
              width: "160px",
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
          overflowY: "hidden",
        }}
      >
        {exercises.map((exercise, index) => (
          <div
            key={exercise.id}
            style={{
              scrollSnapAlign: "start",
              width: "100%",
              flexShrink: 0,
              overflowY: "hidden",
            }}
          >
            {renderExerciseContent(exercise, index)}
          </div>
        ))}
      </div>

      <div className="flex-shrink-0" style={{ height: 0 }} />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
