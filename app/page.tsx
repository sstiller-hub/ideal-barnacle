"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
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
import { getWorkoutHistory, type CompletedWorkout } from "@/lib/workout-storage"
import { getRoutines } from "@/lib/routine-storage"
import {
  deleteSession,
  deleteSetsForSession,
  getCurrentInProgressSession,
  saveCurrentSessionId,
  type WorkoutSession,
} from "@/lib/autosave-workout-storage"
import { clearActiveWorkoutRoute, getActiveWorkoutRoute } from "@/lib/active-workout-route"
import { deleteWorkoutDraft } from "@/lib/workout-draft-storage"
import { GROWTH_V2_ROUTINES, GROWTH_V2_WEEKLY } from "@/lib/growth-v2-plan"
import { formatExerciseName } from "@/lib/format-exercise-name"
import {
  getScheduledWorkoutForDate,
  removeScheduledWorkout,
  setRestDay,
  setScheduledWorkout,
  type ScheduledWorkout,
} from "@/lib/schedule-storage"
import {
  clearScheduleOverride,
  getScheduleOverrideForDate,
  setScheduleOverride,
  type ScheduleOverrideResult,
} from "@/lib/supabase-schedule-overrides"
import { deriveWorkoutType } from "@/lib/workout-type"
import { topSetWithContext } from "@/lib/top-set"
import { computeWeekOverWeek, computeWeeklyPace } from "@/lib/workout-analytics"
import { supabase } from "@/lib/supabase"
import { isSetEligibleForStats, isSetIncomplete } from "@/lib/set-validation"
import { getPrExcludedExercises } from "@/lib/pr-exclusions"
import { Settings, ChevronRight } from "lucide-react"
import { BandHeader } from "@/components/ledger/band-header"
import { DeltaChip } from "@/components/ledger/delta-chip"
import { Sparkline } from "@/components/ledger/sparkline"
import { StatUnit } from "@/components/ledger/stat-unit"
import { plural } from "@/lib/utils"
import { useWorkoutAlerts } from "@/hooks/useWorkoutAlerts"
import WorkoutAlertsSheet from "@/components/workout-alerts-sheet"
import AktProgramMessageLine from "@/components/akt-program-message-line"
import { useDeloadWeek } from "@/hooks/useDeloadWeek"
import { runExerciseRenameMigration } from "@/lib/exercise-rename-migration"

// Helper function for relative date formatting
function getRelativeDate(dateStr: string | null): string {
  if (!dateStr) return ""
  const date = new Date(dateStr)
  const now = new Date()
  const diffTime = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return `${Math.floor(diffDays / 30)}mo ago`
}

// Compressed relative date for DeltaChip context strings: TODAY / 3D / 1W / 2MO.
function getRelativeDateAbbrev(dateStr: string | null): string {
  if (!dateStr) return ""
  const date = new Date(dateStr)
  const now = new Date()
  const diffTime = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays <= 0) return "TODAY"
  if (diffDays < 7) return `${diffDays}D`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}W`
  return `${Math.floor(diffDays / 30)}MO`
}

// Duration a completed workout took, in seconds. Prefer the stored `duration`
// field; fall back to endedAt − startedAt for older records that predate it.
function getWorkoutDurationSeconds(workout: CompletedWorkout): number | null {
  if (typeof workout.duration === "number" && workout.duration > 0) return workout.duration
  if (workout.startedAt && workout.endedAt) {
    const secs = Math.floor(
      (new Date(workout.endedAt).getTime() - new Date(workout.startedAt).getTime()) / 1000
    )
    return secs > 0 ? secs : null
  }
  return null
}

// Split a duration into a StatUnit value/unit pair: "52" MIN under an hour,
// "1H 20" MIN beyond it — the big numeral stays a clean number either way.
function formatDurationStat(seconds: number): { value: string; unit: string } {
  const totalMinutes = Math.max(1, Math.round(seconds / 60))
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h > 0) return { value: `${h}H ${String(m).padStart(2, "0")}`, unit: "MIN" }
  return { value: `${m}`, unit: "MIN" }
}

// The clock window a completed workout ran, e.g. "4:47 PM – 6:07 PM". Mirrors
// the range shown on the workout summary. Null when either endpoint is missing.
function formatWorkoutTimeRange(workout: CompletedWorkout): string | null {
  if (!workout.startedAt || !workout.endedAt) return null
  const format = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  return `${format(workout.startedAt)} – ${format(workout.endedAt)}`
}

type WorkoutRoutine = {
  id: string
  name: string
  exercises: any[]
}

type PersonalRecord = {
  name: string
  weight: number
  reps: number
  workoutId?: string
  workoutName?: string
  achievedAt?: string
  trendPct: number | null
  chartData: number[]
}

type WeeklySummary = {
  volumeLb: number
  sessions: number
  wowPercent: number
  previousVolumeLb: number
}

type LastWorkoutSummary = {
  id: string
  name: string
  performedAt: string
  totalVolumeLb: number
  prCount: number
}

type WorkoutPrEvent = {
  id: string
  exercise_name: string
  pr_type: "e1rm" | "volume" | "weight_for_reps"
  value: number
  previous_value: number | null
}

type DayState = "scheduled" | "rest" | "completed" | "activeSession"

// Workouts whose stored total_volume_lb is 0/null may simply have failed the
// analytics pass at commit time (e.g. a large history query aborted before the
// volume write). Their sets are still in the DB, so we re-run analytics once to
// repair the stored value. This set prevents re-hitting the endpoint for the
// same workout on every focus/refresh of the home screen.
const repairAttemptedWorkoutIds = new Set<string>()

export default function Home() {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [routinePool, setRoutinePool] = useState<WorkoutRoutine[]>([])
  const [workoutHistory, setWorkoutHistory] = useState<CompletedWorkout[]>([])
  const [scheduledRoutine, setScheduledRoutine] = useState<WorkoutRoutine | null>(null)
  const [baseScheduledRoutine, setBaseScheduledRoutine] = useState<WorkoutRoutine | null>(null)
  const [baseIsRestDay, setBaseIsRestDay] = useState(false)
  const [workoutForDate, setWorkoutForDate] = useState<CompletedWorkout | null>(null)
  const [todayPRs, setTodayPRs] = useState<PersonalRecord[]>([])
  const [showConflictDialog, setShowConflictDialog] = useState(false)
  const [pendingRoutineId, setPendingRoutineId] = useState<string | null>(null)
  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [isRestoringSession, setIsRestoringSession] = useState(false)
  const [scheduleOverride, setScheduleOverrideState] = useState<ScheduleOverrideResult | undefined>(undefined)
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [uiStateOverride, setUiStateOverride] = useState<DayState | null>(null)
  const [devModeEnabled, setDevModeEnabled] = useState(false)
  const [prExcludedNames, setPrExcludedNames] = useState<string[]>([])
  const [devModeTapCount, setDevModeTapCount] = useState(0)
  const [devModeTapTimeout, setDevModeTapTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null)
  const [lastWorkoutSummary, setLastWorkoutSummary] = useState<LastWorkoutSummary | null>(null)
  const [lastWorkoutPrs, setLastWorkoutPrs] = useState<WorkoutPrEvent[]>([])
  const selectedDateRef = useRef(selectedDate)
  const userIdRef = useRef(userId)
  const { alerts: workoutAlerts, dismiss: dismissWorkoutAlert } = useWorkoutAlerts()
  const [showAlertsSheet, setShowAlertsSheet] = useState(false)
  const { isDeload, deloadEndsAt, lastCompletedDeloadEndsAt } = useDeloadWeek()
  const [showDeloadCompleteBanner, setShowDeloadCompleteBanner] = useState(false)

  useEffect(() => {
    if (!lastCompletedDeloadEndsAt || isDeload) return
    const seenKey = "deload_completed_banner_seen"
    const seen = typeof window !== "undefined" && localStorage.getItem(seenKey) === lastCompletedDeloadEndsAt.toISOString()
    if (!seen) setShowDeloadCompleteBanner(true)
  }, [isDeload, lastCompletedDeloadEndsAt])

  const dismissDeloadCompleteBanner = () => {
    if (lastCompletedDeloadEndsAt && typeof window !== "undefined") {
      localStorage.setItem("deload_completed_banner_seen", lastCompletedDeloadEndsAt.toISOString())
    }
    setShowDeloadCompleteBanner(false)
  }

  const normalizeExerciseName = useCallback((name: string) => formatExerciseName(name).toLowerCase(), [])
  // The one volume formatter for this screen: "30.6K" at ≥1000, integer below.
  const formatK = (value: number) => {
    const abs = Math.abs(value)
    return abs >= 1000 ? `${(abs / 1000).toFixed(1)}K` : `${Math.round(abs)}`
  }

  const getWeekRange = useCallback((date: Date) => {
    const start = new Date(date)
    start.setHours(0, 0, 0, 0)
    const day = start.getDay()
    const diffToMonday = (day + 6) % 7
    start.setDate(start.getDate() - diffToMonday)
    const end = new Date(start)
    end.setDate(start.getDate() + 7)
    return { start, end }
  }, [])

  const weeklyVolumes = useMemo(() => {
    const endBase = new Date()
    endBase.setHours(23, 59, 59, 999)
    const volumes: number[] = []
    for (let i = 6; i >= 0; i -= 1) {
      const end = new Date(endBase)
      end.setDate(end.getDate() - i * 7)
      const start = new Date(end)
      start.setDate(start.getDate() - 7)
      const total = workoutHistory.reduce((sum, workout) => {
        const dateStr = workout.date
        if (!dateStr) return sum
        const workoutDate = new Date(dateStr)
        if (workoutDate >= start && workoutDate <= end) {
          const exercises = Array.isArray(workout?.exercises) ? workout.exercises : []
          const volume = exercises.reduce((acc: number, ex: any) => {
            const sets = Array.isArray(ex?.sets) ? ex.sets : []
            const exVolume = sets
              .filter((set: any) => isSetEligibleForStats(set))
              .reduce((setSum: number, set: any) => setSum + (set.weight ?? 0) * (set.reps ?? 0), 0)
            return acc + exVolume
          }, 0)
          return sum + volume
        }
        return sum
      }, 0)
      volumes.push(total)
    }
    return volumes
  }, [workoutHistory])

  const currentWeekVolume = weeklyVolumes[weeklyVolumes.length - 1] ?? 0
  const previousWeekVolume = weeklyVolumes[weeklyVolumes.length - 2] ?? 0

  const inProgressSessionVolume = useMemo(() => {
    if (!session?.exercises) return 0
    return session.exercises.reduce((sum: number, exercise: any) => {
      const sets = Array.isArray(exercise?.sets) ? exercise.sets : []
      const exerciseVolume = sets
        .filter((set: any) => isSetEligibleForStats(set))
        .reduce((setSum: number, set: any) => setSum + (set.weight ?? 0) * (set.reps ?? 0), 0)
      return sum + exerciseVolume
    }, 0)
  }, [session?.exercises])

  const isSessionInProgress = Boolean(session && session.status !== "completed" && !session.endedAt)
  const isInProgressSessionInCurrentWeek = useMemo(() => {
    if (!isSessionInProgress || !session?.startedAt) return false
    const startedAt = new Date(session.startedAt)
    if (Number.isNaN(startedAt.getTime())) return false
    const { start, end } = getWeekRange(new Date())
    return startedAt >= start && startedAt < end
  }, [isSessionInProgress, session?.startedAt, getWeekRange])

  const currentWeekVolumeSoFar =
    currentWeekVolume + (isInProgressSessionInCurrentWeek ? inProgressSessionVolume : 0)
  const weeklyVolumesForCard = useMemo(() => {
    if (!weeklyVolumes.length || !isInProgressSessionInCurrentWeek) return weeklyVolumes
    const next = [...weeklyVolumes]
    next[next.length - 1] = currentWeekVolumeSoFar
    return next
  }, [weeklyVolumes, isInProgressSessionInCurrentWeek, currentWeekVolumeSoFar])
  const canCompareWeekOverWeek = !isInProgressSessionInCurrentWeek
  useEffect(() => {
    runExerciseRenameMigration()
    const currentSession = getCurrentInProgressSession()
    setSession(currentSession)
    setPrExcludedNames(getPrExcludedExercises())
  }, [])

  // Restore the user's place in an active workout after a cold start. The PWA
  // relaunches at start_url ("/"), so a workout screen that gets evicted from
  // memory while the app is backgrounded comes back as the home screen. When a
  // breadcrumb from the session screen is still set and the workout really is
  // still in progress, send the user back where they were. The breadcrumb is
  // consumed either way, so a later visit to home stays on home and browsing
  // other days mid-workout never bounces.
  useEffect(() => {
    const restoreRoute = getActiveWorkoutRoute()
    if (!restoreRoute) return
    clearActiveWorkoutRoute()
    if (!getCurrentInProgressSession()) return
    setIsRestoringSession(true)
    router.replace(restoreRoute)
  }, [router])

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow
    const previousBodyOverscroll = document.body.style.overscrollBehavior
    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior

    document.body.style.overflow = "hidden"
    document.body.style.overscrollBehavior = "none"
    document.documentElement.style.overflow = "hidden"
    document.documentElement.style.overscrollBehavior = "none"

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.body.style.overscrollBehavior = previousBodyOverscroll
      document.documentElement.style.overflow = previousHtmlOverflow
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll
    }
  }, [])

  useEffect(() => {
    const handleUpdate = () => {
      setPrExcludedNames(getPrExcludedExercises())
    }
    window.addEventListener("pr-exclusions:updated", handleUpdate)
    return () => window.removeEventListener("pr-exclusions:updated", handleUpdate)
  }, [])

  const refreshSession = useCallback(() => {
    const currentSession = getCurrentInProgressSession()
    setSession(currentSession)
  }, [])

  const handleDiscardActiveWorkout = async () => {
    if (!session) return
    const confirmed = window.confirm("Discard this workout? This will delete the active workout from this device.")
    if (!confirmed) return
    const workoutId = session.workoutId || (session.id && /^[0-9a-f-]{36}$/i.test(session.id) ? session.id : null)
    deleteSetsForSession(session.id)
    deleteSession(session.id)
    saveCurrentSessionId(null)
    if (workoutId) {
      await deleteWorkoutDraft(workoutId)
    }
    setSession(null)
    loadDataForDate(selectedDate)
  }

  useEffect(() => {
    selectedDateRef.current = selectedDate
  }, [selectedDate])

  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  useEffect(() => {
    if (!session?.startedAt) return
    const sessionDate = new Date(session.startedAt)
    sessionDate.setHours(0, 0, 0, 0)
    setSelectedDate((prev) => {
      const next = new Date(prev)
      next.setHours(0, 0, 0, 0)
      if (next.getTime() === sessionDate.getTime()) return prev
      return sessionDate
    })
  }, [session?.id, session?.startedAt])

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const handleScheduleUpdated = () => {
      loadDataForDate(selectedDate)
    }
    window.addEventListener("schedule:updated", handleScheduleUpdated)
    return () => window.removeEventListener("schedule:updated", handleScheduleUpdated)
  }, [selectedDate])

  useEffect(() => {
    loadDataForDate(selectedDate)
  }, [selectedDate])

  useEffect(() => {
    const handleFocus = () => {
      const currentDate = selectedDateRef.current
      const currentUserId = userIdRef.current
      loadDataForDate(currentDate)
      if (currentUserId) {
        void loadHomeAnalytics(currentUserId)
      }
      refreshSession()
    }
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        const currentDate = selectedDateRef.current
        const currentUserId = userIdRef.current
        loadDataForDate(currentDate)
        if (currentUserId) {
          void loadHomeAnalytics(currentUserId)
        }
        refreshSession()
      }
    }
    window.addEventListener("focus", handleFocus)
    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      window.removeEventListener("focus", handleFocus)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [refreshSession])

  useEffect(() => {
    let active = true
    if (!userId) {
      setScheduleOverrideState(undefined)
      return
    }
    getScheduleOverrideForDate(selectedDate).then((result) => {
      if (!active) return
      setScheduleOverrideState(result)
    })
    return () => {
      active = false
    }
  }, [selectedDate, userId])

  const repairWorkoutAnalytics = useCallback(async (workoutIds: string[]): Promise<boolean> => {
    if (!supabase || workoutIds.length === 0) return false
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) return false

    const results = await Promise.all(
      workoutIds.map(async (workoutId) => {
        try {
          const response = await fetch(`/api/workouts/${workoutId}/complete`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          })
          return response.ok
        } catch {
          return false
        }
      })
    )
    return results.some(Boolean)
  }, [])

  const loadHomeAnalytics = useCallback(async (targetUserId: string, allowRepair = true) => {
    if (!supabase) return
    const now = new Date()
    const { start, end } = getWeekRange(now)
    const previousStart = new Date(start)
    previousStart.setDate(previousStart.getDate() - 7)
    const previousEnd = new Date(start)

    const { data: currentWeek, error: currentWeekError } = await supabase
      .from("workouts")
      .select("id, total_volume_lb")
      .eq("user_id", targetUserId)
      .gte("performed_at", start.toISOString())
      .lt("performed_at", end.toISOString())

    if (currentWeekError) return

    const { data: previousWeek, error: previousWeekError } = await supabase
      .from("workouts")
      .select("id, total_volume_lb")
      .eq("user_id", targetUserId)
      .gte("performed_at", previousStart.toISOString())
      .lt("performed_at", previousEnd.toISOString())

    if (previousWeekError) return

    const currentVolume =
      currentWeek?.reduce((sum, row) => sum + (row.total_volume_lb ?? 0), 0) ?? 0
    const previousVolume =
      previousWeek?.reduce((sum, row) => sum + (row.total_volume_lb ?? 0), 0) ?? 0
    const { percent: wowPercent } = computeWeekOverWeek(currentVolume, previousVolume)

    setWeeklySummary({
      volumeLb: currentVolume,
      sessions: currentWeek?.length ?? 0,
      wowPercent,
      previousVolumeLb: previousVolume,
    })

    const { data: lastWorkoutData, error: lastWorkoutError } = await supabase
      .from("workouts")
      .select("id, name, performed_at, total_volume_lb, pr_count")
      .eq("user_id", targetUserId)
      .order("performed_at", { ascending: false })
      .limit(1)

    if (lastWorkoutError) return

    const lastWorkout = lastWorkoutData?.[0]
    if (!lastWorkout) {
      setLastWorkoutSummary(null)
      setLastWorkoutPrs([])
      return
    }

    setLastWorkoutSummary({
      id: lastWorkout.id,
      name: lastWorkout.name,
      performedAt: lastWorkout.performed_at,
      totalVolumeLb: lastWorkout.total_volume_lb ?? 0,
      prCount: lastWorkout.pr_count ?? 0,
    })

    const { data: prsData, error: prsError } = await supabase
      .from("workout_prs")
      .select("id, exercise_name, pr_type, value, previous_value")
      .eq("workout_id", lastWorkout.id)
      .order("created_at", { ascending: true })
      .limit(3)

    if (prsError) return

    setLastWorkoutPrs((prsData || []) as WorkoutPrEvent[])

    // Self-heal workouts whose analytics never wrote a volume. We only retry
    // each workout once per session to avoid hammering the endpoint for those
    // that are legitimately zero (e.g. no completed sets).
    if (allowRepair) {
      const zeroVolumeIds = [
        ...(currentWeek ?? []),
        ...(previousWeek ?? []),
        { id: lastWorkout.id, total_volume_lb: lastWorkout.total_volume_lb },
      ]
        .filter((row) => row?.id && !row.total_volume_lb)
        .map((row) => row.id as string)

      const idsToRepair = Array.from(new Set(zeroVolumeIds)).filter(
        (id) => !repairAttemptedWorkoutIds.has(id)
      )

      if (idsToRepair.length > 0) {
        idsToRepair.forEach((id) => repairAttemptedWorkoutIds.add(id))
        const repaired = await repairWorkoutAnalytics(idsToRepair)
        if (repaired) {
          await loadHomeAnalytics(targetUserId, false)
        }
      }
    }
  }, [getWeekRange, repairWorkoutAnalytics])

  useEffect(() => {
    if (!userId) {
      setWeeklySummary(null)
      setLastWorkoutSummary(null)
      setLastWorkoutPrs([])
      return
    }
    void loadHomeAnalytics(userId)
  }, [userId, loadHomeAnalytics])

  useEffect(() => {
    if (routinePool.length === 0) return
    const effectiveRoutine = scheduleOverride?.workout
      ? resolveRoutine(scheduleOverride.workout)
      : scheduleOverride?.workout === null
        ? null
        : baseScheduledRoutine

    setScheduledRoutine(effectiveRoutine)
  }, [routinePool, scheduleOverride, baseScheduledRoutine])

  useEffect(() => {
    if (workoutHistory.length === 0) {
      setTodayPRs([])
      return
    }

    const prByExerciseName = new Map<
      string,
      {
        name: string
        weight: number
        reps: number
        workoutId?: string
        workoutName?: string
        achievedAt?: string
      }
    >()
    const prTimelineByExercise = new Map<string, Array<{ weight: number; achievedAt: string }>>()
    const volumeTimelineByExercise = new Map<string, Array<{ volume: number; achievedAt: string }>>()

    const sortedHistory = [...workoutHistory].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    sortedHistory.forEach((workout) => {
      workout.exercises.forEach((exercise) => {
        const completedSets = exercise.sets.filter((s: any) => s.completed && s.weight > 0 && s.reps > 0)
        completedSets.forEach((set: any) => {
          const key = normalizeExerciseName(exercise.name)
          const existing = prByExerciseName.get(key)
          const existingTime = existing?.achievedAt ? new Date(existing.achievedAt).getTime() : 0
          const currentTime = workout.date ? new Date(workout.date).getTime() : 0
          const shouldReplace =
            !existing ||
            set.weight > existing.weight ||
            (set.weight === existing.weight && set.reps > existing.reps) ||
            (set.weight === existing.weight && set.reps === existing.reps && currentTime > existingTime)
          if (shouldReplace) {
            prByExerciseName.set(key, {
              name: exercise.name,
              weight: set.weight,
              reps: set.reps,
              workoutId: workout.id,
              workoutName: workout.name,
              achievedAt: workout.date,
            })
          }
        })

        const key = normalizeExerciseName(exercise.name)
        const maxWeight = completedSets.reduce((max: number, set: any) => Math.max(max, set.weight ?? 0), 0)
        if (!maxWeight) return
        const currentTimeline = prTimelineByExercise.get(key) ?? []
        const lastEntry = currentTimeline[currentTimeline.length - 1]
        if (!lastEntry || maxWeight > lastEntry.weight) {
          prTimelineByExercise.set(key, [
            ...currentTimeline,
            { weight: maxWeight, achievedAt: workout.date },
          ])
        }

        const volume = exercise.sets
          .filter((s: any) => s.completed && s.weight > 0 && s.reps > 0)
          .reduce((sum: number, s: any) => sum + s.weight * s.reps, 0)
        if (volume > 0) {
          const volumeTimeline = volumeTimelineByExercise.get(key) ?? []
          volumeTimelineByExercise.set(key, [
            ...volumeTimeline,
            { volume, achievedAt: workout.date },
          ])
        }
      })
    })

    const growthV2Names = new Set(
      GROWTH_V2_ROUTINES.flatMap((routine) =>
        routine.exercises.map((exercise: any) => normalizeExerciseName(exercise.name))
      )
    )
    const excludedPrExercises = new Set(
      ["side crunch", "decline bench knee raise", ...prExcludedNames].map(normalizeExerciseName)
    )
    const rawSourceNames = Array.from(prByExerciseName.keys())
    const sourceNames: string[] = rawSourceNames.filter(
      (name): name is string =>
        typeof name === "string" &&
        growthV2Names.has(name) &&
        !excludedPrExercises.has(name) &&
        !name.includes("side crunch") &&
        !name.includes("decline bench knee raise")
    )

    const filteredPRs = sourceNames
      .map((name: string) => {
        const pr = prByExerciseName.get(name)
        if (!pr) return null
        const volumeTimeline = volumeTimelineByExercise.get(name) ?? []
        const last = volumeTimeline[volumeTimeline.length - 1]
        const prev = volumeTimeline[volumeTimeline.length - 2]
        const trendPct =
          prev && prev.volume > 0 ? Math.round(((last.volume - prev.volume) / prev.volume) * 100) : null

        const chartData = volumeTimeline.slice(-7).map((entry) => entry.volume)

        return { ...pr, trendPct, chartData }
      })
      .filter((pr): pr is PersonalRecord => {
        if (!pr) return false
        const normalized = normalizeExerciseName(pr.name)
        return (
          !normalized.includes("side crunch") &&
          !normalized.includes("decline bench knee raise")
        )
      })

    const sortedPRs = [...filteredPRs].sort((a, b) => {
      const aTime = a.achievedAt ? new Date(a.achievedAt).getTime() : 0
      const bTime = b.achievedAt ? new Date(b.achievedAt).getTime() : 0
      return bTime - aTime
    })

    setTodayPRs(sortedPRs)
  }, [workoutHistory, prExcludedNames, normalizeExerciseName])

  const resolveRoutine = useCallback((entry: ScheduledWorkout | null | undefined): WorkoutRoutine | null => {
    if (!entry) return null
    const byId = routinePool.find((routine) => routine.id === entry.routineId)
    if (byId) return byId
    const byName = routinePool.find((routine) => routine.name === entry.routineName)
    if (byName) return byName
    return null
  }, [routinePool])

  const loadDataForDate = useCallback((date: Date) => {
    const history = getWorkoutHistory()
    setWorkoutHistory(history)

    const allRoutines = getRoutines()
    const pool = allRoutines.length > 0 ? allRoutines : GROWTH_V2_ROUTINES
    setRoutinePool(pool)

    const routineById = new Map(pool.map((routine) => [routine.id, routine]))
    const growthById = new Map(GROWTH_V2_ROUTINES.map((routine) => [routine.id, routine]))
    const resolveRoutineEntry = (entry: { routineId: string; routineName: string } | null | undefined) => {
      if (!entry) return null
      return (
        routineById.get(entry.routineId) ||
        growthById.get(entry.routineId) ||
        pool.find((routine) => routine.name === entry.routineName) ||
        GROWTH_V2_ROUTINES.find((routine) => routine.name === entry.routineName) ||
        null
      )
    }

    const targetDate = new Date(date)
    targetDate.setHours(0, 0, 0, 0)

    const completedWorkout = history.find((w) => {
      const workoutDate = new Date(w.date)
      workoutDate.setHours(0, 0, 0, 0)
      return workoutDate.getTime() === targetDate.getTime()
    })

    setWorkoutForDate(completedWorkout || null)

    const manualSchedule = getScheduledWorkoutForDate(date)
    const weeklySchedule = GROWTH_V2_WEEKLY[targetDate.getDay()] ?? null

    let nextRoutine: WorkoutRoutine | null = null
    let restDay = false

    const resolvedSchedule = manualSchedule !== undefined ? manualSchedule : weeklySchedule

    if (resolvedSchedule === null) {
      restDay = true
    } else if (resolvedSchedule) {
      nextRoutine = resolveRoutineEntry(resolvedSchedule)
    } else {
      nextRoutine = pool[0] ?? null
    }

    const resolvedRestDay = restDay || !nextRoutine
    setBaseScheduledRoutine(nextRoutine)
    setBaseIsRestDay(resolvedRestDay)
  }, [])

  const handleStartWorkout = (routineId: string) => {
    if (session) {
      setPendingRoutineId(routineId)
      setShowConflictDialog(true)
    } else {
      router.push(`/workout/session?routineId=${routineId}`)
    }
  }

  const handleResumeExisting = () => {
    setShowConflictDialog(false)
    setPendingRoutineId(null)
    if (session?.routineId) {
      router.push(`/workout/session?routineId=${session.routineId}`)
    }
  }

  const handleDiscardExisting = () => {
    if (session?.id) {
      deleteSetsForSession(session.id)
      deleteSession(session.id)
    }
    saveCurrentSessionId(null)
    setSession(null)

    setShowConflictDialog(false)
    if (pendingRoutineId) {
      router.push(`/workout/session?routineId=${pendingRoutineId}`)
    }
    setPendingRoutineId(null)
  }

  const handleSelectWorkoutType = async (routineId: string | null) => {
    if (isPastDay) return
    const baseRoutineId = baseScheduledRoutine?.id ?? null
    const baseRestDay = baseIsRestDay
    const resolvedRoutine = routineId ? routinePool.find((routine) => routine.id === routineId) ?? null : null

    if ((routineId === null && baseRestDay) || (routineId && routineId === baseRoutineId)) {
      if (userId) {
        const cleared = await clearScheduleOverride(selectedDate)
        if (cleared) {
          setScheduleOverrideState(undefined)
        }
      } else {
        removeScheduledWorkout(selectedDate)
        loadDataForDate(selectedDate)
        window.dispatchEvent(new Event("schedule:updated"))
      }
      loadDataForDate(selectedDate)
      setShowWorkoutPicker(false)
      return
    }

    const routineName = routineId ? routineNameById.get(routineId) ?? null : null
    const workout = routineId && routineName ? { routineId, routineName } : null
    setBaseScheduledRoutine(resolvedRoutine)
    setBaseIsRestDay(routineId === null)
    setScheduledRoutine(resolvedRoutine)
    if (userId) {
      const updated = await setScheduleOverride(selectedDate, workout)
      if (updated) {
        setScheduleOverrideState({
          workout,
          isOverride: true,
          workoutType: deriveWorkoutType(routineName),
        })
        loadDataForDate(selectedDate)
        window.dispatchEvent(new Event("schedule:updated"))
      }
    } else {
      if (workout) {
        setScheduledWorkout(selectedDate, workout)
      } else {
        setRestDay(selectedDate)
      }
      loadDataForDate(selectedDate)
      window.dispatchEvent(new Event("schedule:updated"))
    }
    setShowWorkoutPicker(false)
  }

  const goToPreviousDay = () => {
    setSelectedDate((prev) => {
      const next = new Date(prev)
      next.setDate(next.getDate() - 1)
      return next
    })
  }

  const goToNextDay = () => {
    setSelectedDate((prev) => {
      const next = new Date(prev)
      next.setDate(next.getDate() + 1)
      return next
    })
  }

  const goToSessionDay = () => {
    if (!session) return
    const target = session.startedAt ? new Date(session.startedAt) : new Date()
    target.setHours(0, 0, 0, 0)
    setSelectedDate(target)
  }

  const handleDevModeActivation = () => {
    const newCount = devModeTapCount + 1
    setDevModeTapCount(newCount)

    if (devModeTapTimeout) {
      clearTimeout(devModeTapTimeout)
    }

    if (newCount >= 5) {
      setDevModeEnabled((prev) => !prev)
      setDevModeTapCount(0)
      setDevModeTapTimeout(null)
      return
    }

    const timeout = setTimeout(() => {
      setDevModeTapCount(0)
    }, 1000)
    setDevModeTapTimeout(timeout)
  }

  const isToday = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const selected = new Date(selectedDate)
    selected.setHours(0, 0, 0, 0)
    return today.getTime() === selected.getTime()
  }

  const isPastDay = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const selected = new Date(selectedDate)
    selected.setHours(0, 0, 0, 0)
    return selected.getTime() < today.getTime()
  }, [selectedDate])
  const isTomorrow = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const selected = new Date(selectedDate)
    selected.setHours(0, 0, 0, 0)
    return selected.getTime() === tomorrow.getTime()
  }
  const isYesterday = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const selected = new Date(selectedDate)
    selected.setHours(0, 0, 0, 0)
    return selected.getTime() === yesterday.getTime()
  }

  const sessionDayLabel = (() => {
    if (!session?.startedAt) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const sessionDate = new Date(session.startedAt)
    sessionDate.setHours(0, 0, 0, 0)
    const dayDiff = Math.round((sessionDate.getTime() - today.getTime()) / 86400000)
    if (dayDiff === 0) return "TODAY"
    if (dayDiff === -1) return "YESTERDAY"
    return sessionDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase()
  })()

  const effectiveRestDay = scheduleOverride?.workout === null ? true : scheduleOverride ? false : baseIsRestDay
  const scheduledWorkoutType = effectiveRestDay
    ? "Rest"
    : scheduleOverride?.workoutType || deriveWorkoutType(scheduledRoutine?.name)
  const activeWorkoutType =
    session?.routineName ? deriveWorkoutType(session.routineName) : scheduledWorkoutType
  const isSelectedDateSessionDate = (() => {
    if (!session?.startedAt) return false
    const sessionDate = new Date(session.startedAt)
    sessionDate.setHours(0, 0, 0, 0)
    const selected = new Date(selectedDate)
    selected.setHours(0, 0, 0, 0)
    return sessionDate.getTime() === selected.getTime()
  })()
  // An active session belongs to the day it was started on. Any other day shows
  // that day's own schedule, so the week stays browsable mid-workout.
  const isSessionDay = session ? (session.startedAt ? isSelectedDateSessionDate : isToday()) : false
  const actualState =
    uiStateOverride ||
    (workoutForDate
      ? "completed"
      : isSessionDay
        ? "activeSession"
        : effectiveRestDay
          ? "rest"
          : "scheduled")

  const routineNameById = useMemo(() => new Map(routinePool.map((routine) => [routine.id, routine.name])), [routinePool])

  const workoutOptions = routinePool.map((routine) => ({ id: routine.id, name: routine.name }))

  const getExerciseLabel = (name: string) => {
    const lower = name.trim().toLowerCase()
    if (lower === "leg extension (light)") {
      return "Single-Leg Leg Extension"
    }
    return name
  }

  const selectedTitle = actualState === "activeSession" ? activeWorkoutType : scheduledWorkoutType
  const displayExercises =
    actualState === "activeSession" && session?.exercises
      ? session.exercises
      : workoutForDate?.exercises || scheduledRoutine?.exercises
  const isCompactExerciseList = (displayExercises?.length ?? 0) >= 9
  const prRows = useMemo(() => {
    const splitEvenly = (prs: PersonalRecord[]) => {
      const splitIndex = Math.ceil(prs.length / 2)
      return {
        firstRow: prs.slice(0, splitIndex),
        secondRow: prs.slice(splitIndex),
      }
    }

    if (actualState === "rest") {
      return splitEvenly(todayPRs)
    }

    const todayExerciseNames = new Set(
      (displayExercises ?? [])
        .map((exercise: any) => (typeof exercise?.name === "string" ? normalizeExerciseName(exercise.name) : ""))
        .filter(Boolean)
    )

    if (todayExerciseNames.size === 0) {
      return splitEvenly(todayPRs)
    }

    const firstRow: PersonalRecord[] = []
    const secondRow: PersonalRecord[] = []

    todayPRs.forEach((pr) => {
      if (todayExerciseNames.has(normalizeExerciseName(pr.name))) {
        firstRow.push(pr)
      } else {
        secondRow.push(pr)
      }
    })

    return { firstRow, secondRow }
  }, [todayPRs, actualState, displayExercises, normalizeExerciseName])
  const activeSessionProgress = useMemo(() => {
    if (!session?.exercises) return null
    let totalSets = 0
    let remainingSets = 0
    session.exercises.forEach((exercise: any) => {
      const sets = Array.isArray(exercise?.sets) ? exercise.sets : []
      totalSets += sets.length
      sets.forEach((set: any) => {
        if (!set?.completed || isSetIncomplete(set)) {
          remainingSets += 1
        }
      })
    })
    return { totalSets, remainingSets }
  }, [session?.exercises])

  // Presentational aggregate for the TODAY band's SETS PLANNED stat.
  const plannedSets = useMemo(() => {
    return (displayExercises ?? []).reduce((sum: number, exercise: any) => {
      if (typeof exercise?.targetSets === "number") return sum + exercise.targetSets
      if (Array.isArray(exercise?.sets)) return sum + exercise.sets.length
      if (typeof exercise?.sets === "number") return sum + exercise.sets
      return sum
    }, 0)
  }, [displayExercises])

  // --- Progressive-overload context for the home screen ---

  // Most recent top set (by e1RM) for each exercise, excluding the selected
  // day's own workout. Powers the "what to beat" hint next to today's plan.
  const lastPerformanceByExercise = useMemo(() => {
    const map = new Map<
      string,
      { weight: number; reps: number; date: string; ordinal: number; total: number; standsOut: boolean }
    >()
    const selected = new Date(selectedDate)
    selected.setHours(0, 0, 0, 0)
    const sorted = [...workoutHistory].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    for (const workout of sorted) {
      const workoutDate = new Date(workout.date)
      workoutDate.setHours(0, 0, 0, 0)
      if (workoutDate.getTime() === selected.getTime()) continue
      for (const exercise of workout.exercises ?? []) {
        const key = normalizeExerciseName(exercise.name)
        if (map.has(key)) continue
        const top = topSetWithContext(exercise.sets)
        if (top) {
          map.set(key, {
            weight: top.weight,
            reps: top.reps,
            date: workout.date,
            ordinal: top.ordinal,
            total: top.total,
            standsOut: top.standsOut,
          })
        }
      }
    }
    return map
  }, [workoutHistory, selectedDate, normalizeExerciseName])

  // The last time this same workout was trained (matched by routine name, else
  // by Upper/Lower type). Gives the day full context: what you hit, what to beat.
  const lastSameWorkout = useMemo(() => {
    if (actualState !== "scheduled" && actualState !== "activeSession") return null
    const routineName =
      (actualState === "activeSession" ? session?.routineName : scheduledRoutine?.name) ?? null
    const selected = new Date(selectedDate)
    selected.setHours(0, 0, 0, 0)
    const notSelectedDay = (workout: CompletedWorkout) => {
      const workoutDate = new Date(workout.date)
      workoutDate.setHours(0, 0, 0, 0)
      return workoutDate.getTime() !== selected.getTime()
    }
    const sorted = [...workoutHistory].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    const match =
      (routineName ? sorted.find((w) => notSelectedDay(w) && w.name === routineName) : undefined) ??
      sorted.find((w) => notSelectedDay(w) && deriveWorkoutType(w.name) === selectedTitle)
    if (!match) return null

    const topExercises = (match.exercises ?? [])
      .map((exercise: any) => {
        const top = topSetWithContext(exercise.sets)
        return top
          ? {
              name: exercise.name,
              weight: top.weight,
              reps: top.reps,
              ordinal: top.ordinal,
              total: top.total,
              standsOut: top.standsOut,
              product: top.weight * top.reps,
            }
          : null
      })
      .filter(
        (
          exercise
        ): exercise is {
          name: string
          weight: number
          reps: number
          ordinal: number
          total: number
          standsOut: boolean
          product: number
        } => Boolean(exercise)
      )
      .sort((a, b) => b.product - a.product)
      .slice(0, 3)

    return {
      id: match.id,
      date: match.date,
      totalVolume: match.stats?.totalVolume ?? 0,
      topExercises,
    }
  }, [actualState, session?.routineName, scheduledRoutine?.name, selectedDate, workoutHistory, selectedTitle])

  // How long the scheduled/active workout usually takes: the mean recorded
  // duration across every past session of the same routine (matched by name,
  // else by Upper/Lower type — mirroring lastSameWorkout). Sets a "this workout
  // typically runs ~N min" expectation before you train. Null until there's at
  // least one prior session with usable timing data.
  const averageWorkoutDuration = useMemo(() => {
    if (actualState !== "scheduled" && actualState !== "activeSession") return null
    const routineName =
      (actualState === "activeSession" ? session?.routineName : scheduledRoutine?.name) ?? null
    const selected = new Date(selectedDate)
    selected.setHours(0, 0, 0, 0)
    const notSelectedDay = (workout: CompletedWorkout) => {
      const workoutDate = new Date(workout.date)
      workoutDate.setHours(0, 0, 0, 0)
      return workoutDate.getTime() !== selected.getTime()
    }
    const byName = routineName
      ? workoutHistory.filter((w) => notSelectedDay(w) && w.name === routineName)
      : []
    const matches =
      byName.length > 0
        ? byName
        : workoutHistory.filter((w) => notSelectedDay(w) && deriveWorkoutType(w.name) === selectedTitle)
    const durations = matches
      .map((w) => getWorkoutDurationSeconds(w))
      .filter((secs): secs is number => secs !== null && secs > 0)
    if (durations.length === 0) return null
    const avgSeconds = durations.reduce((sum, secs) => sum + secs, 0) / durations.length
    return { seconds: avgSeconds, count: durations.length }
  }, [actualState, session?.routineName, scheduledRoutine?.name, selectedDate, workoutHistory, selectedTitle])

  // Overall progression signal: how many tracked exercises are trending up vs down.
  const progression = useMemo(() => {
    let up = 0
    let down = 0
    for (const pr of todayPRs) {
      if (pr.trendPct === null) continue
      if (pr.trendPct > 0) up += 1
      else if (pr.trendPct < 0) down += 1
    }
    return { up, down, tracked: up + down }
  }, [todayPRs])

  // For a completed day: compare it against the previous time the same workout
  // was trained (by routine name, else Upper/Lower type) so the finished day
  // answers "did I beat last time" — volume delta and exercises beaten.
  const completedComparison = useMemo(() => {
    if (actualState !== "completed" || !workoutForDate) return null
    const current = workoutForDate
    const currentDay = new Date(current.date)
    currentDay.setHours(0, 0, 0, 0)
    const earlier = [...workoutHistory]
      .filter((w) => w.id !== current.id)
      .filter((w) => {
        const d = new Date(w.date)
        d.setHours(0, 0, 0, 0)
        return d.getTime() < currentDay.getTime()
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    // Only compare against the most recent prior session of the SAME routine
    // (matched by name). We intentionally do NOT fall back to the Upper/Lower
    // type: two different Lower routines (e.g. "Legs 1 – Quad Dominant" vs
    // "Legs 2 – Glutes + Hamstrings") have largely different exercise lists, so
    // a cross-routine volume delta would be apples-to-oranges. If there's no
    // prior session of this exact routine, the comparison is hidden.
    const prev = earlier.find((w) => w.name === current.name)
    if (!prev) return null

    const bestE1rm = (workout: CompletedWorkout, name: string) => {
      const key = normalizeExerciseName(name)
      let best = 0
      for (const exercise of workout.exercises ?? []) {
        if (normalizeExerciseName(exercise.name) !== key) continue
        for (const set of exercise.sets ?? []) {
          if (!set?.completed || !((set.weight ?? 0) > 0) || !((set.reps ?? 0) > 0)) continue
          best = Math.max(best, (set.weight as number) * (1 + (set.reps as number) / 30))
        }
      }
      return best
    }

    let beaten = 0
    let compared = 0
    for (const exercise of current.exercises ?? []) {
      const todayBest = bestE1rm(current, exercise.name)
      const prevBest = bestE1rm(prev, exercise.name)
      if (todayBest > 0 && prevBest > 0) {
        compared += 1
        if (todayBest > prevBest + 1e-6) beaten += 1
      }
    }

    const currentVolume = current.stats?.totalVolume ?? 0
    const prevVolume = prev.stats?.totalVolume ?? 0
    const delta = currentVolume - prevVolume
    const percent = prevVolume > 0 ? (delta / prevVolume) * 100 : 0
    return { prevId: prev.id, prevDate: prev.date, delta, percent, beaten, compared }
  }, [actualState, workoutForDate, workoutHistory, normalizeExerciseName])

  // Contextual rest-day summary. The Growth V2 plan rests on Sunday (end of the
  // Mon–Sun week) and Wednesday (mid-week), so those two rest days get a recap:
  // Sunday = "week in review" (the week is behind you), Wednesday = "week so
  // far" (a mid-week check-in). All numbers come from local history, so this
  // works without auth.
  const weeklyReview = useMemo(() => {
    if (actualState !== "rest") return null
    const day = selectedDate.getDay()
    const variant: "review" | "midweek" | null =
      day === 0 ? "review" : day === 3 ? "midweek" : null
    if (!variant) return null

    const { start, end } = getWeekRange(selectedDate)

    // Reduce each workout to a single dated volume, then let computeWeeklyPace
    // handle the like-for-like windowing: both weeks are capped at the same
    // point in the week so a partial week-to-date total is measured against
    // last week through the same day ("vs last week's pace") instead of against
    // last week's full total. On the Sunday review the cutoff lands at the end
    // of the week, so it naturally becomes a full-week comparison.
    const datedVolumes = workoutHistory.map((workout) => {
      let volume = 0
      for (const exercise of workout.exercises ?? []) {
        for (const set of exercise.sets ?? []) {
          if (isSetEligibleForStats(set)) {
            volume += (set.weight ?? 0) * (set.reps ?? 0)
          }
        }
      }
      return { date: workout.date, volume }
    })

    const pace = computeWeeklyPace(datedVolumes, selectedDate)

    const prCount = todayPRs.reduce((count, pr) => {
      if (!pr.achievedAt) return count
      const achieved = new Date(pr.achievedAt)
      return achieved >= start && achieved < end ? count + 1 : count
    }, 0)

    return {
      variant,
      sessions: pace.currentSessions,
      volume: pace.currentVolume,
      previousVolume: pace.previousVolume,
      wowPercent: pace.percent,
      prCount,
    }
  }, [actualState, selectedDate, workoutHistory, getWeekRange, todayPRs])

  // On a rest day the middle of the screen — normally the exercise list — is
  // empty, so surface the next scheduled training day's plan there. We walk
  // forward from the rest day until we hit a day that resolves to a workout,
  // honoring manual overrides before falling back to the Growth V2 plan.
  const nextWorkout = useMemo(() => {
    if (actualState !== "rest") return null

    const pool = routinePool.length > 0 ? routinePool : GROWTH_V2_ROUTINES
    const routineById = new Map(pool.map((routine) => [routine.id, routine]))
    const growthById = new Map(GROWTH_V2_ROUTINES.map((routine) => [routine.id, routine]))
    const resolveEntry = (entry: ScheduledWorkout | null | undefined) => {
      if (!entry) return null
      return (
        routineById.get(entry.routineId) ||
        growthById.get(entry.routineId) ||
        pool.find((routine) => routine.name === entry.routineName) ||
        GROWTH_V2_ROUTINES.find((routine) => routine.name === entry.routineName) ||
        null
      )
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let offset = 1; offset <= 7; offset += 1) {
      const date = new Date(selectedDate)
      date.setHours(0, 0, 0, 0)
      date.setDate(date.getDate() + offset)

      const manual = getScheduledWorkoutForDate(date)
      const resolved = manual !== undefined ? manual : GROWTH_V2_WEEKLY[date.getDay()] ?? null
      if (resolved === null) continue

      const routine = resolveEntry(resolved)
      if (!routine) continue

      const dayDiff = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      const label =
        dayDiff === 1
          ? "TOMORROW"
          : date.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase()

      return { routine, label }
    }

    return null
  }, [actualState, selectedDate, routinePool])

  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const swipeDeltaRef = useRef<{ x: number; y: number } | null>(null)

  const handleDaySwipeStart = (event: React.TouchEvent) => {
    if (showWorkoutPicker) return
    if (event.touches.length !== 1) return
    swipeStartRef.current = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
    }
    swipeDeltaRef.current = null
  }

  const handleDaySwipeMove = (event: React.TouchEvent) => {
    if (!swipeStartRef.current || event.touches.length !== 1) return
    const dx = event.touches[0].clientX - swipeStartRef.current.x
    const dy = event.touches[0].clientY - swipeStartRef.current.y
    swipeDeltaRef.current = { x: dx, y: dy }
  }

  const handleDaySwipeEnd = () => {
    if (!swipeStartRef.current || !swipeDeltaRef.current) {
      swipeStartRef.current = null
      swipeDeltaRef.current = null
      return
    }
    const { x: dx, y: dy } = swipeDeltaRef.current
    swipeStartRef.current = null
    swipeDeltaRef.current = null
    if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) return
    setShowWorkoutPicker(false)
    if (dx > 0) {
      goToPreviousDay()
    } else {
      goToNextDay()
    }
  }

  const relativeDayLabel = isToday()
    ? "TODAY"
    : isTomorrow()
      ? "TOMORROW"
      : isYesterday()
        ? "YESTERDAY"
        : isPastDay
          ? "PAST"
          : "UPCOMING"
  const weekDelta = currentWeekVolumeSoFar - previousWeekVolume
  const weekPercent = previousWeekVolume > 0 ? (weekDelta / previousWeekVolume) * 100 : 0
  const weekOfLabel = getWeekRange(new Date())
    .start.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toUpperCase()

  // A cold start that is being redirected back into the active workout paints
  // the session screen next; showing the home screen for those few frames would
  // be the same jarring "replaced my place" flash the redirect exists to fix.
  if (isRestoringSession) {
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
    <>
      <button
        onClick={() => router.push("/settings")}
        className="fixed z-[60] text-ink-25 hover:text-ink-50 transition-colors duration-base"
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 10px)",
          right: "calc(18px + env(safe-area-inset-right, 0px))",
          background: "transparent",
          border: "none",
          padding: "8px",
          cursor: "pointer",
          pointerEvents: "auto",
        }}
        aria-label="Open settings"
        type="button"
      >
        <Settings size={16} strokeWidth={1.5} />
      </button>
      {workoutAlerts.length > 0 && (
        <button
          onClick={() => setShowAlertsSheet(true)}
          className="fixed z-[60]"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 14px)",
            right: "calc(50px + env(safe-area-inset-right, 0px))",
            background: "transparent",
            border: "none",
            padding: "8px",
            cursor: "pointer",
            pointerEvents: "auto",
          }}
          aria-label={`${workoutAlerts.length} flagged ${plural(workoutAlerts.length, "exercise", "exercises")}`}
          type="button"
        >
          <div
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: workoutAlerts.some((a) => a.tier === 1) ? "#EF4444" : "#F59E0B",
              boxShadow: workoutAlerts.some((a) => a.tier === 1)
                ? "0 0 6px rgba(239, 68, 68, 0.6)"
                : "0 0 6px rgba(245, 158, 11, 0.6)",
            }}
          />
        </button>
      )}
      <WorkoutAlertsSheet
        alerts={showAlertsSheet ? workoutAlerts : []}
        onDismiss={dismissWorkoutAlert}
        onClose={() => setShowAlertsSheet(false)}
      />
      <main
        className="relative flex flex-col overflow-hidden"
        style={{
          height: "var(--app-vh)",
          paddingTop: "max(env(safe-area-inset-top, 0px), 8px)",
          paddingBottom: "env(safe-area-inset-bottom, 100px)",
          background: "#0D0D0F",
          boxShadow: "inset 0 0 200px rgba(255, 255, 255, 0.01)",
        }}
      >
        {devModeEnabled && (
          <div className="px-5 pb-4 flex-shrink-0">
            <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
              {(["scheduled", "rest", "completed", "activeSession"] as DayState[]).map((state) => (
                <button
                  key={state}
                  onClick={() => setUiStateOverride(uiStateOverride === state ? null : state)}
                  className="flex-shrink-0 transition-all duration-base"
                  style={{
                    background: uiStateOverride === state ? "var(--ink-06)" : "var(--ink-02)",
                    border: uiStateOverride === state ? "1px solid var(--ink-15)" : "1px solid var(--ink-08)",
                    borderRadius: "var(--radius-flat)",
                    padding: "6px 10px",
                  }}
                  type="button"
                >
                  <span
                    className={uiStateOverride === state ? "text-ink-70" : "text-ink-30"}
                    style={{ fontSize: "8px", fontWeight: 600, letterSpacing: "0.05em", fontFamily: "var(--font-label)" }}
                  >
                    {state.toUpperCase()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div
          className="relative z-50 flex-shrink-0"
          style={{
            background: "#0D0D0F",
            boxShadow: "0 8px 30px rgba(0, 0, 0, 0.35)",
            touchAction: "pan-x",
          }}
          onTouchStart={handleDaySwipeStart}
          onTouchMove={handleDaySwipeMove}
          onTouchEnd={handleDaySwipeEnd}
        >
        <div
          className="px-5 pb-4"
          style={{
            paddingRight: "60px",
          }}
        >
        <div className="band-enter">
          <button
            onClick={handleDevModeActivation}
            className="select-none text-left"
            style={{
              fontSize: "9px",
              fontWeight: 600,
              letterSpacing: "0.2em",
              fontFamily: "var(--font-label)",
              color: "var(--ink-35)",
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "default",
            }}
            type="button"
          >
            <span style={{ color: "var(--ink-70)" }}>
              {selectedDate.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase()}
            </span>
            {"  "}
            {selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}
            {" · "}
            <span data-testid="selected-day-label">{relativeDayLabel}</span>
          </button>
          <div className="flex items-end justify-between gap-3">
            <button
              onClick={() => !isPastDay && setShowWorkoutPicker(!showWorkoutPicker)}
              disabled={isPastDay}
              className="text-left transition-opacity duration-base hover:opacity-80 flex items-center gap-2 disabled:opacity-100 disabled:cursor-default"
            >
              <h1
                className="text-white"
                style={{
                  fontSize: "var(--text-marquee)",
                  fontWeight: 400,
                  letterSpacing: "-0.01em",
                  lineHeight: "0.92",
                  marginTop: "10px",
                  fontFamily: "var(--font-display)",
                }}
              >
                {selectedTitle}
              </h1>
              {!isPastDay && (
                <ChevronRight
                  size={20}
                  strokeWidth={1.5}
                  className="text-ink-30 mt-2 transition-transform duration-base"
                  style={{
                    transform: showWorkoutPicker ? "rotate(90deg)" : "rotate(0deg)",
                  }}
                />
              )}
            </button>
            <div className="flex items-center gap-1.5 flex-shrink-0" style={{ marginBottom: "8px" }}>
              {actualState === "completed" && (
                <div
                  style={{
                    width: "5px",
                    height: "5px",
                    borderRadius: "50%",
                    background: "var(--good)",
                    boxShadow: "0 0 6px rgba(52, 211, 153, 0.5)",
                  }}
                />
              )}
              {actualState === "activeSession" && (
                <div
                  style={{
                    width: "5px",
                    height: "5px",
                    borderRadius: "50%",
                    background: "var(--ink-50)",
                  }}
                />
              )}
              <span
                style={{
                  fontSize: "9.5px",
                  fontWeight: 600,
                  letterSpacing: "0.16em",
                  fontFamily: "var(--font-label)",
                  color: "var(--ink-50)",
                  whiteSpace: "nowrap",
                }}
              >
                {actualState === "completed"
                  ? "COMPLETE"
                  : actualState === "activeSession"
                    ? `IN PROGRESS${activeSessionProgress ? ` · ${activeSessionProgress.remainingSets} ${plural(activeSessionProgress.remainingSets, "SET LEFT", "SETS LEFT")}` : ""}`
                    : actualState === "rest"
                      ? "REST DAY"
                      : "SCHEDULED"}
              </span>
            </div>
          </div>
        </div>

        {showWorkoutPicker && !isPastDay && (
          <div className="mt-6 -mx-5">
            <div className="fixed inset-0 z-40" onClick={() => setShowWorkoutPicker(false)} style={{ background: "transparent" }} />
            <div
              className="relative z-50 flex gap-3 overflow-x-auto px-5 pb-1"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                WebkitOverflowScrolling: "touch",
                animation: "slideInDown var(--duration-slow) var(--ease-theatre) forwards",
              }}
            >
              <button
                onClick={() => handleSelectWorkoutType(null)}
                className="flex-shrink-0 transition-all duration-base"
                style={{
                  background: effectiveRestDay ? "var(--ink-04)" : "var(--ink-02)",
                  border: effectiveRestDay ? "1px solid var(--ink-12)" : "1px solid var(--ink-08)",
                  borderRadius: "var(--radius-flat)",
                  padding: "12px 18px",
                  minWidth: "100px",
                }}
                onMouseEnter={(e) => {
                  if (!effectiveRestDay) {
                    e.currentTarget.style.background = "var(--ink-04)"
                    e.currentTarget.style.borderColor = "var(--ink-12)"
                  }
                }}
                onMouseLeave={(e) => {
                  if (!effectiveRestDay) {
                    e.currentTarget.style.background = "var(--ink-02)"
                    e.currentTarget.style.borderColor = "var(--ink-08)"
                  }
                }}
                type="button"
              >
                <div
                  className={effectiveRestDay ? "text-ink-95" : "text-ink-70"}
                  style={{ fontSize: "13px", fontWeight: 400, letterSpacing: "0.02em", fontFamily: "var(--font-label)" }}
                >
                  Rest
                </div>
              </button>
              {workoutOptions.map((routine, index) => {
                const isSelected = scheduledRoutine?.id === routine.id
                return (
                  <button
                    key={routine.id}
                    onClick={() => handleSelectWorkoutType(routine.id)}
                    className="flex-shrink-0 transition-all duration-base"
                    style={{
                      background: isSelected ? "var(--ink-04)" : "var(--ink-02)",
                      border: isSelected ? "1px solid var(--ink-12)" : "1px solid var(--ink-08)",
                      borderRadius: "var(--radius-flat)",
                      padding: "12px 18px",
                      minWidth: "100px",
                      animation: `slideInItem var(--duration-entry) var(--ease-theatre) ${index * 0.03}s backwards`,
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = "var(--ink-04)"
                        e.currentTarget.style.borderColor = "var(--ink-12)"
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = "var(--ink-02)"
                        e.currentTarget.style.borderColor = "var(--ink-08)"
                      }
                    }}
                    type="button"
                  >
                    <div
                      className={isSelected ? "text-ink-95" : "text-ink-70"}
                      style={{ fontSize: "13px", fontWeight: 400, letterSpacing: "0.02em", fontFamily: "var(--font-label)" }}
                    >
                      {routine.name}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="overflow-hidden" style={{ paddingBottom: "0px" }}>
        {/* Program-message slot — one line hosts every program state (active
            deload, deload complete, and future states) via AktProgramMessageLine.
            The slot reserves its space in all states so nothing reflows. */}
        {isDeload && deloadEndsAt ? (
          <AktProgramMessageLine
            tone="warn"
            messageKey={`deload-active:${deloadEndsAt.toISOString()}`}
            message={`Deload week active · ends ${deloadEndsAt.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}`}
          />
        ) : showDeloadCompleteBanner ? (
          <AktProgramMessageLine
            tone="neutral"
            messageKey="deload-complete"
            message="Deload complete — back to full training"
            onDismiss={dismissDeloadCompleteBanner}
          />
        ) : (
          <AktProgramMessageLine message={null} />
        )}

        {/* Band 1 — the day itself. One flat band; the identical BandHeader
            anatomy carries the comparison chip for every state. */}
        <div className="px-5 mb-6 band-enter" style={{ animationDelay: "70ms" }}>
          <BandHeader label={relativeDayLabel}>
            {actualState === "completed" && workoutForDate && completedComparison ? (
              <DeltaChip
                tone={completedComparison.delta > 0 ? "good" : "neutral"}
                arrow={completedComparison.delta > 0 ? "up" : "down"}
                value={
                  completedComparison.delta > 0
                    ? `+${formatK(completedComparison.delta)}`
                    : formatK(completedComparison.delta)
                }
                pct={`${Math.abs(completedComparison.percent).toFixed(0)}%`}
                context={`VS LAST ${deriveWorkoutType(workoutForDate.name).toUpperCase()} · ${getRelativeDateAbbrev(completedComparison.prevDate)}`}
              />
            ) : (actualState === "scheduled" || actualState === "activeSession") && lastSameWorkout ? (
              <button
                onClick={() => router.push(`/history/${lastSameWorkout.id}`)}
                style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
                type="button"
              >
                <DeltaChip
                  tone="neutral"
                  value={formatK(lastSameWorkout.totalVolume)}
                  context={`LAST ${selectedTitle.toUpperCase()} · TO BEAT · ${getRelativeDateAbbrev(lastSameWorkout.date)}`}
                />
              </button>
            ) : null}
          </BandHeader>

          {actualState === "completed" && workoutForDate && (
            <>
              <div
                className="flex items-baseline"
                style={{ gap: "28px", marginBottom: isCompactExerciseList ? "12px" : "16px" }}
              >
                <StatUnit value={formatK(workoutForDate.stats.totalVolume)} unit="LB" label="VOLUME" />
                <StatUnit
                  value={`${workoutForDate.exercises?.length ?? 0}`}
                  label={plural(workoutForDate.exercises?.length ?? 0, "EXERCISE", "EXERCISES")}
                />
                {(() => {
                  const durationSecs = getWorkoutDurationSeconds(workoutForDate)
                  if (durationSecs === null) return null
                  const { value, unit } = formatDurationStat(durationSecs)
                  return <StatUnit value={value} unit={unit} label="DURATION" />
                })()}
                {completedComparison && completedComparison.compared > 0 && (
                  <StatUnit
                    value={`${completedComparison.beaten}`}
                    unit={`OF ${completedComparison.compared}`}
                    label="BEATEN"
                  />
                )}
              </div>

              {(() => {
                const timeRange = formatWorkoutTimeRange(workoutForDate)
                if (!timeRange) return null
                return (
                  <div
                    style={{
                      fontFamily: "var(--font-label)",
                      fontSize: "10px",
                      fontWeight: 400,
                      letterSpacing: "0.06em",
                      color: "var(--ink-30)",
                      marginBottom: isCompactExerciseList ? "12px" : "16px",
                    }}
                  >
                    {timeRange}
                  </div>
                )
              })()}

              {displayExercises && displayExercises.length > 0 && (
                <div style={{ marginBottom: "14px" }}>
                  {displayExercises.map((exercise: any, index: number) => (
                    <ReceiptRow
                      key={exercise.id ?? `${exercise.name}-${index}`}
                      index={index}
                      name={getExerciseLabel(exercise.name)}
                      right={`${exercise.targetSets ?? exercise.sets?.length ?? 0} ${plural(exercise.targetSets ?? exercise.sets?.length ?? 0, "set", "sets")}`}
                      compact={isCompactExerciseList}
                    />
                  ))}
                </div>
              )}

              <button
                className="w-full transition-all duration-base"
                style={{
                  background: "var(--ink-02)",
                  border: "1px solid var(--ink-08)",
                  borderRadius: "var(--radius-flat)",
                  padding: isCompactExerciseList ? "9px" : "11px",
                  color: "var(--ink-70)",
                }}
                onClick={() => router.push(`/history/${workoutForDate.id}`)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--ink-04)"
                  e.currentTarget.style.borderColor = "var(--ink-12)"
                  e.currentTarget.style.color = "var(--ink-95)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--ink-02)"
                  e.currentTarget.style.borderColor = "var(--ink-08)"
                  e.currentTarget.style.color = "var(--ink-70)"
                }}
              >
                <span style={{ fontSize: "11px", fontWeight: 400, color: "inherit" }}>View session</span>
              </button>
            </>
          )}

          {actualState === "rest" && !weeklyReview && (
            <div
              className="text-center"
              style={{ fontSize: "11px", fontWeight: 400, letterSpacing: "0.01em", color: "var(--ink-20)", padding: "24px 0" }}
            >
              Rest day — no workout scheduled
            </div>
          )}

          {actualState === "rest" && weeklyReview && (
            <div style={{ marginBottom: "20px" }}>
              <div
                style={{
                  fontSize: "9px",
                  fontWeight: 600,
                  letterSpacing: "0.16em",
                  fontFamily: "var(--font-label)",
                  color: "var(--ink-35)",
                  marginBottom: "4px",
                }}
              >
                {weeklyReview.variant === "review" ? "WEEK IN REVIEW" : "WEEK SO FAR"}
              </div>
              <div style={{ fontSize: "11px", fontWeight: 400, color: "var(--ink-50)", marginBottom: "14px" }}>
                {weeklyReview.variant === "review"
                  ? "How the week went"
                  : "How the week is going so far"}
              </div>

              <div className="flex items-baseline" style={{ gap: "28px" }}>
                <StatUnit value={`${weeklyReview.sessions}`} label="SESSIONS" />
                <StatUnit
                  value={formatK(weeklyReview.volume)}
                  unit="LB"
                  label={weeklyReview.variant === "review" ? "VOLUME" : "VOLUME SO FAR"}
                />
                {weeklyReview.variant === "review" && (
                  <StatUnit value={`${weeklyReview.prCount}`} label="PRS" />
                )}
              </div>

              {weeklyReview.previousVolume > 0 && (
                <div style={{ marginTop: "14px" }}>
                  <DeltaChip
                    tone={weeklyReview.wowPercent > 0 ? "good" : "neutral"}
                    arrow={weeklyReview.wowPercent >= 0 ? "up" : "down"}
                    value={`${Math.abs(Math.round(weeklyReview.wowPercent))}%`}
                    context={weeklyReview.variant === "review" ? "VS LAST WEEK" : "VS LAST WEEK'S PACE"}
                  />
                </div>
              )}
            </div>
          )}

          {actualState === "rest" && nextWorkout && (() => {
            const exercises = nextWorkout.routine.exercises ?? []
            const compact = exercises.length >= 9
            return (
              <div>
                <BandHeader label={`UP NEXT · ${nextWorkout.label}`}>
                  <span style={{ fontSize: "10px", fontWeight: 400, color: "var(--ink-40)", whiteSpace: "nowrap" }}>
                    {deriveWorkoutType(nextWorkout.routine.name)}
                  </span>
                </BandHeader>
                <div>
                  {exercises.map((exercise: any, index: number) => {
                    const last = lastPerformanceByExercise.get(normalizeExerciseName(exercise.name))
                    return (
                      <ReceiptRow
                        key={exercise.id ?? `${exercise.name}-${index}`}
                        index={index}
                        name={getExerciseLabel(exercise.name)}
                        right={`${exercise.targetSets ?? exercise.sets ?? 0} × ${exercise.targetReps ?? exercise.reps ?? "-"}`}
                        hint={
                          last
                            ? `last ${last.weight}×${last.reps}${last.standsOut ? ` · set ${last.ordinal}` : ""}`
                            : null
                        }
                        compact={compact}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {(actualState === "scheduled" || actualState === "activeSession") && displayExercises && (
            <>
              <div
                className="flex items-baseline"
                style={{ gap: "28px", marginBottom: isCompactExerciseList ? "12px" : "16px" }}
              >
                <StatUnit
                  value={`${displayExercises.length}`}
                  label={plural(displayExercises.length, "EXERCISE", "EXERCISES")}
                />
                {(() => {
                  const setsPlanned =
                    actualState === "activeSession" && activeSessionProgress
                      ? activeSessionProgress.totalSets
                      : plannedSets
                  return (
                    <StatUnit
                      value={`${setsPlanned}`}
                      label={plural(setsPlanned, "SET PLANNED", "SETS PLANNED")}
                    />
                  )
                })()}
                {actualState === "activeSession" && activeSessionProgress && (
                  <StatUnit
                    value={`${activeSessionProgress.remainingSets}`}
                    label={plural(activeSessionProgress.remainingSets, "SET LEFT", "SETS LEFT")}
                  />
                )}
                {averageWorkoutDuration && (() => {
                  const { value, unit } = formatDurationStat(averageWorkoutDuration.seconds)
                  return <StatUnit value={value} unit={unit} label="AVG TIME" />
                })()}
              </div>

              <div style={{ marginBottom: "14px" }}>
                {displayExercises.map((exercise: any, index: number) => {
                  const last = lastPerformanceByExercise.get(normalizeExerciseName(exercise.name))
                  return (
                    <ReceiptRow
                      key={exercise.id ?? `${exercise.name}-${index}`}
                      index={index}
                      name={getExerciseLabel(exercise.name)}
                      right={`${exercise.targetSets ?? exercise.sets ?? 0} × ${exercise.targetReps ?? exercise.reps ?? "-"}`}
                      hint={
                        last
                          ? `last ${last.weight}×${last.reps}${last.standsOut ? ` · set ${last.ordinal}` : ""}`
                          : null
                      }
                      compact={isCompactExerciseList}
                    />
                  )
                })}
              </div>

              <button
                className="w-full transition-all duration-base"
                style={{
                  background: actualState === "activeSession" ? "var(--ink-04)" : "var(--ink-02)",
                  border: actualState === "activeSession" ? "1px solid var(--ink-12)" : "1px solid var(--ink-08)",
                  borderRadius: "var(--radius-flat)",
                  padding: "14px",
                  color: actualState === "activeSession" ? "var(--ink-95)" : "var(--ink-70)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--ink-06)"
                  e.currentTarget.style.borderColor = "var(--ink-12)"
                  e.currentTarget.style.color = "var(--ink-95)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = actualState === "activeSession" ? "var(--ink-04)" : "var(--ink-02)"
                  e.currentTarget.style.borderColor = actualState === "activeSession" ? "var(--ink-12)" : "var(--ink-08)"
                  e.currentTarget.style.color = actualState === "activeSession" ? "var(--ink-95)" : "var(--ink-70)"
                }}
                onClick={() => {
                  if (actualState === "activeSession") {
                    handleResumeExisting()
                    return
                  }
                  if (scheduledRoutine?.id) {
                    handleStartWorkout(scheduledRoutine.id)
                  }
                }}
              >
                <span style={{ fontSize: "13px", fontWeight: 400, letterSpacing: "0.02em", color: "inherit" }}>
                  {actualState === "activeSession" ? "Resume Workout" : "Start Workout"}
                </span>
              </button>

              {actualState === "activeSession" && (
                <button
                  className="w-full mt-3 transition-all duration-base"
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: "12px",
                    color: "var(--ink-40)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--ink-70)"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--ink-40)"
                  }}
                  onClick={handleDiscardActiveWorkout}
                >
                  <span style={{ fontSize: "11px", fontWeight: 400, letterSpacing: "0.02em", color: "inherit" }}>
                    Discard Active Workout
                  </span>
                </button>
              )}
            </>
          )}
        </div>

      </div>
      </div>

      <div
        className="px-5 mt-0 flex-shrink-0 band-enter"
        style={{ animationDelay: "140ms" }}
        onTouchStart={(event) => event.stopPropagation()}
        onTouchMove={(event) => event.stopPropagation()}
        onTouchEnd={(event) => event.stopPropagation()}
        onTouchStartCapture={(event) => event.stopPropagation()}
        onTouchMoveCapture={(event) => event.stopPropagation()}
        onTouchEndCapture={(event) => event.stopPropagation()}
      >
        <BandHeader label="THIS WEEK">
          {canCompareWeekOverWeek && currentWeekVolumeSoFar > 0 && previousWeekVolume > 0 ? (
            <DeltaChip
              tone={weekDelta > 0 ? "good" : "neutral"}
              arrow={weekDelta > 0 ? "up" : "down"}
              value={formatK(weekDelta)}
              pct={`${Math.abs(weekPercent).toFixed(0)}%`}
              context="WK/WK"
            />
          ) : !canCompareWeekOverWeek ? (
            <DeltaChip tone="neutral" value={formatK(previousWeekVolume)} context="PREV 7D" />
          ) : null}
        </BandHeader>
        <button
          className="w-full text-left transition-opacity duration-base"
          onClick={() => router.push("/volume")}
          style={{ background: "transparent", border: "none", padding: 0 }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.85"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1"
          }}
          type="button"
        >
          <div style={{ marginBottom: "10px" }}>
            <StatUnit
              value={formatK(currentWeekVolumeSoFar)}
              unit="LB"
              label={`VOLUME · WK OF ${weekOfLabel}`}
            />
          </div>
          <Sparkline data={weeklyVolumesForCard} height={56} live domainPadding={5000} />
        </button>
      </div>

      {todayPRs.length > 0 && (
        <div
          className="flex-shrink-0 pb-4 band-enter"
          style={{ animationDelay: "210ms" }}
          data-testid="pr-section"
          onTouchStart={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
          onTouchEnd={(event) => event.stopPropagation()}
          onTouchStartCapture={(event) => event.stopPropagation()}
          onTouchMoveCapture={(event) => event.stopPropagation()}
          onTouchEndCapture={(event) => event.stopPropagation()}
        >
          <div className="px-5">
            <BandHeader label="ALL-TIME">
              {progression.tracked > 0 && (
                <DeltaChip
                  tone={progression.up >= progression.down ? "good" : "neutral"}
                  arrow={progression.up >= progression.down ? "up" : "down"}
                  value={`${progression.up} OF ${progression.tracked}`}
                  context="EXERCISES UP"
                />
              )}
            </BandHeader>
          </div>

          <div
            className="flex gap-3 overflow-x-auto"
            data-scroll-x="pr-cards-row-1"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
          >
            {[...prRows.firstRow, ...prRows.secondRow].map((pr) => (
              <AllTimePRCard
                key={`pr-${pr.name}`}
                exercise={pr.name}
                reps={pr.reps}
                weight={pr.weight}
                details={pr.achievedAt ? getRelativeDate(pr.achievedAt) : ""}
                chartData={pr.chartData || []}
                trendPct={pr.trendPct}
                onClick={() => router.push(`/exercise/${encodeURIComponent(pr.name)}`)}
              />
            ))}
          </div>
        </div>
      )}

      {session && !isSessionDay && (
        <div
          className="fixed left-0 right-0 z-[70] px-5"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
        >
          <div
            className="flex items-center gap-3"
            style={{
              background: "var(--card)",
              border: "1px solid var(--ink-12)",
              borderRadius: "var(--radius-flat)",
              padding: "12px 14px",
              boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
            }}
          >
            <div className="flex-1 min-w-0 text-left">
              <div
                style={{
                  fontSize: "9.5px",
                  fontWeight: 600,
                  letterSpacing: "0.16em",
                  fontFamily: "var(--font-label)",
                  color: "var(--ink-50)",
                  whiteSpace: "nowrap",
                }}
              >
                IN PROGRESS
                {sessionDayLabel ? ` · ${sessionDayLabel}` : ""}
              </div>
              <div
                className="truncate"
                style={{ fontSize: "12px", fontWeight: 400, letterSpacing: "0.01em", marginTop: "2px", color: "var(--ink-90)" }}
              >
                {session.routineName || "Workout"}
              </div>
            </div>
            <button
              onClick={goToSessionDay}
              className="flex-shrink-0 transition-colors duration-base"
              style={{ background: "transparent", border: "none", padding: "6px 4px", fontSize: "10px", fontWeight: 400, color: "var(--ink-40)" }}
              type="button"
            >
              View day
            </button>
            <button
              onClick={handleResumeExisting}
              className="flex-shrink-0 transition-all duration-base"
              style={{
                background: "var(--ink-08)",
                border: "1px solid var(--ink-15)",
                borderRadius: "var(--radius-flat)",
                padding: "8px 14px",
              }}
              type="button"
            >
              <span style={{ fontSize: "11px", fontWeight: 500, letterSpacing: "0.02em", color: "var(--ink-90)" }}>
                Resume
              </span>
            </button>
          </div>
        </div>
      )}

      <AlertDialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <AlertDialogContent
          className="border-0"
          style={{
            background: "rgba(10, 10, 12, 0.96)",
            borderRadius: "18px",
            boxShadow: "0 30px 80px rgba(0, 0, 0, 0.45)",
            padding: "24px",
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle
              className="text-white"
              style={{ fontSize: "18px", fontWeight: 500, letterSpacing: "-0.01em" }}
            >
              Active Workout Detected
            </AlertDialogTitle>
            <AlertDialogDescription
              className="text-ink-40"
              style={{ fontSize: "12px", fontWeight: 400, letterSpacing: "0.01em", lineHeight: "1.5" }}
            >
              You have an active workout in progress ({session?.routineName || "Workout"}). Would you like to resume it
              or start a new workout? Starting a new workout will discard your current progress.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col sm:space-x-0">
            <AlertDialogAction
              onClick={handleResumeExisting}
              className="w-full"
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: "8px",
                padding: "12px",
              }}
            >
              <span className="text-ink-90" style={{ fontSize: "12px", fontWeight: 500, letterSpacing: "0.02em" }}>
                Resume Existing
              </span>
            </AlertDialogAction>
            <AlertDialogAction
              onClick={handleDiscardExisting}
              className="w-full"
              style={{
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "8px",
                padding: "12px",
              }}
            >
              <span className="text-ink-50" style={{ fontSize: "12px", fontWeight: 400, letterSpacing: "0.02em" }}>
                Discard & Start New
              </span>
            </AlertDialogAction>
            <AlertDialogCancel
              onClick={() => setShowConflictDialog(false)}
              className="w-full"
              style={{
                background: "transparent",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                borderRadius: "8px",
                padding: "10px",
              }}
            >
              <span className="text-ink-40" style={{ fontSize: "11px", fontWeight: 400 }}>
                Cancel
              </span>
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

        <style>{`
        [data-scroll-x]::-webkit-scrollbar {
          display: none;
        }

        @keyframes slideUpSheet {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideInDown {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideInItem {
          from {
            opacity: 0;
            transform: translateY(-4px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes bandEnter {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .band-enter {
          animation: bandEnter 500ms var(--ease-theatre) both;
        }

        @media (prefers-reduced-motion: reduce) {
          .band-enter {
            animation: none;
          }
        }
        `}</style>
      </main>
    </>
  )
}

// One receipt row: two-digit index, name, tabular right column with an
// optional "last WxR" hint. Compact density shrinks row padding only, never
// the fonts.
function ReceiptRow({
  index,
  name,
  right,
  hint,
  compact,
}: {
  index: number
  name: string
  right?: string
  hint?: string | null
  compact?: boolean
}) {
  return (
    <div className="flex items-center gap-3" style={{ padding: compact ? "3px 0" : "4.5px 0" }}>
      <div
        style={{
          fontSize: "8.5px",
          fontWeight: 500,
          color: "var(--ink-30)",
          fontVariantNumeric: "tabular-nums",
          minWidth: "14px",
        }}
      >
        {String(index + 1).padStart(2, "0")}
      </div>
      <div
        className="flex-1"
        style={{ fontSize: "11px", fontWeight: 400, color: "var(--ink-85)", letterSpacing: "0.005em" }}
      >
        {name}
      </div>
      <div className="flex flex-col items-end" style={{ gap: "1px" }}>
        {right && (
          <div
            style={{ fontSize: "8.5px", fontWeight: 400, color: "var(--ink-35)", fontVariantNumeric: "tabular-nums" }}
          >
            {right}
          </div>
        )}
        {hint && (
          <div
            style={{ fontSize: "8.5px", fontWeight: 400, color: "var(--ink-35)", fontVariantNumeric: "tabular-nums" }}
          >
            {hint}
          </div>
        )}
      </div>
    </div>
  )
}

function AllTimePRCard({
  exercise,
  reps,
  weight,
  details,
  chartData,
  trendPct,
  onClick,
}: {
  exercise: string
  reps: number
  weight: number
  details: string
  chartData: number[]
  trendPct?: number | null
  onClick?: () => void
}) {
  const cardWidth = "clamp(172px, calc((100vw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px) - 12px) / 2), 260px)"

  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 text-left"
      style={{ width: cardWidth, minWidth: cardWidth, padding: "0" }}
      type="button"
    >
      <div
        style={{
          fontSize: "9.5px",
          fontWeight: 400,
          lineHeight: "1.3",
          letterSpacing: "0.005em",
          color: "var(--ink-50)",
          minHeight: "25px",
          marginBottom: "8px",
          paddingRight: "8px",
        }}
      >
        {exercise}
      </div>

      <div className="flex items-baseline" style={{ gap: "6px", marginBottom: "10px" }}>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "30px",
            lineHeight: 1,
            color: "var(--ink-95)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {reps}
        </span>
        <span style={{ fontSize: "10px", color: "var(--ink-25)" }}>&times;</span>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "30px",
            lineHeight: 1,
            color: "var(--ink-95)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {weight}
        </span>
        <span style={{ fontSize: "10px", color: "var(--ink-25)", letterSpacing: "0.06em" }}>LB</span>
      </div>

      <div style={{ marginBottom: "8px" }}>
        <Sparkline data={chartData.length > 0 ? chartData : [weight]} height={34} domainPadding={15} />
      </div>

      <div className="flex items-center justify-between">
        <span style={{ fontSize: "8px", fontWeight: 400, color: "var(--ink-25)" }}>{details}</span>
        {typeof trendPct === "number" && trendPct !== 0 && (
          <DeltaChip
            tone={trendPct > 0 ? "good" : "neutral"}
            arrow={trendPct > 0 ? "up" : "down"}
            value={`${Math.abs(trendPct)}%`}
            size="sm"
          />
        )}
      </div>
    </button>
  )
}
