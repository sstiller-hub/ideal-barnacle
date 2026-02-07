"use client"

import { useEffect, useMemo, useState } from "react"
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
import { getWorkoutHistory } from "@/lib/workout-storage"
import { getRoutines } from "@/lib/routine-storage"
import {
  deleteSession,
  deleteSetsForSession,
  getCurrentInProgressSession,
  saveCurrentSessionId,
  type WorkoutSession,
} from "@/lib/autosave-workout-storage"
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
import { computeWeekOverWeek } from "@/lib/workout-analytics"
import { supabase } from "@/lib/supabase"
import { isSetEligibleForStats } from "@/lib/set-validation"
import { getPrExcludedExercises } from "@/lib/pr-exclusions"
import {
  ArrowDown,
  ArrowUp,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightSmall,
} from "lucide-react"
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts"

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

type WorkoutRoutine = {
  id: string
  name: string
  exercises: any[]
}

type CompletedWorkout = {
  id: string
  name: string
  date: string
  stats: {
    totalVolume: number
    completedSets: number
  }
  exercises: any[]
}

type PersonalRecord = {
  name: string
  weight: number
  reps: number
  workoutId?: string
  workoutName?: string
  achievedAt?: string
  trendPct?: number | null
  chartData?: number[]
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

export default function Home() {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [routines, setRoutines] = useState<WorkoutRoutine[]>([])
  const [routinePool, setRoutinePool] = useState<WorkoutRoutine[]>([])
  const [workoutHistory, setWorkoutHistory] = useState<any[]>([])
  const [scheduledRoutine, setScheduledRoutine] = useState<WorkoutRoutine | null>(null)
  const [baseScheduledRoutine, setBaseScheduledRoutine] = useState<WorkoutRoutine | null>(null)
  const [baseIsRestDay, setBaseIsRestDay] = useState(false)
  const [workoutForDate, setWorkoutForDate] = useState<CompletedWorkout | null>(null)
  const [todayPRs, setTodayPRs] = useState<PersonalRecord[]>([])
  const [showConflictDialog, setShowConflictDialog] = useState(false)
  const [pendingRoutineId, setPendingRoutineId] = useState<string | null>(null)
  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [scheduleOverride, setScheduleOverrideState] = useState<ScheduleOverrideResult | undefined>(undefined)
  const [localOverride, setLocalOverride] = useState(false)
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

  const normalizeExerciseName = (name: string) => formatExerciseName(name).toLowerCase()
  const formatShortDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" })
  const formatVolume = (value: number) => Math.round(value).toLocaleString()

  const getWeekRange = (date: Date) => {
    const start = new Date(date)
    start.setHours(0, 0, 0, 0)
    const day = start.getDay()
    const diffToMonday = (day + 6) % 7
    start.setDate(start.getDate() - diffToMonday)
    const end = new Date(start)
    end.setDate(start.getDate() + 7)
    return { start, end }
  }

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
        const dateStr = workout?.performed_at ?? workout?.date ?? workout?.performedAt
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

  useEffect(() => {
    setRoutines(getRoutines())
    const currentSession = getCurrentInProgressSession()
    setSession(currentSession)
    setPrExcludedNames(getPrExcludedExercises())
  }, [])

  useEffect(() => {
    const handleUpdate = () => {
      setPrExcludedNames(getPrExcludedExercises())
    }
    window.addEventListener("pr-exclusions:updated", handleUpdate)
    return () => window.removeEventListener("pr-exclusions:updated", handleUpdate)
  }, [])

  const refreshSession = () => {
    const currentSession = getCurrentInProgressSession()
    setSession(currentSession)
  }

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
    if (!session?.startedAt) return
    const sessionDate = new Date(session.startedAt)
    sessionDate.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (sessionDate.getTime() !== today.getTime()) return
    setSelectedDate((prev) => {
      const next = new Date(prev)
      next.setHours(0, 0, 0, 0)
      if (next.getTime() === sessionDate.getTime()) return prev
      return sessionDate
    })
  }, [session?.id, session?.startedAt])

  useEffect(() => {
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
      loadDataForDate(selectedDate)
      if (userId) {
        void loadHomeAnalytics(userId)
      }
      refreshSession()
    }
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadDataForDate(selectedDate)
        if (userId) {
          void loadHomeAnalytics(userId)
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
  }, [selectedDate, userId])

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

  const loadHomeAnalytics = async (targetUserId: string) => {
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
  }

  useEffect(() => {
    if (!userId) {
      setWeeklySummary(null)
      setLastWorkoutSummary(null)
      setLastWorkoutPrs([])
      return
    }
    void loadHomeAnalytics(userId)
  }, [userId])

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
        const completedSets = exercise.sets.filter((s: any) => s.completed && s.weight > 0)
        completedSets.forEach((set: any) => {
          const key = normalizeExerciseName(exercise.name)
          const existing = prByExerciseName.get(key)
          if (!existing || set.weight > existing.weight) {
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
    const prSourceExercises =
      scheduledRoutine?.exercises || workoutForDate?.exercises || workoutHistory[0]?.exercises || []
    const exerciseNames = prSourceExercises.map((e: any) => normalizeExerciseName(e.name))
    const rawSourceNames = userId ? exerciseNames : Array.from(prByExerciseName.keys())
    const sourceNames = rawSourceNames.filter(
      (name) =>
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
      .filter(
        (pr) =>
          pr &&
          !normalizeExerciseName(pr.name).includes("side crunch") &&
          !normalizeExerciseName(pr.name).includes("decline bench knee raise")
      ) as PersonalRecord[]

    const sortedPRs = [...filteredPRs].sort((a, b) => {
      const aTime = a.achievedAt ? new Date(a.achievedAt).getTime() : 0
      const bTime = b.achievedAt ? new Date(b.achievedAt).getTime() : 0
      return bTime - aTime
    })

    setTodayPRs(sortedPRs)
  }, [workoutHistory, scheduledRoutine, workoutForDate, userId])

  const resolveRoutine = (entry: ScheduledWorkout | null | undefined): WorkoutRoutine | null => {
    if (!entry) return null
    const byId = routinePool.find((routine) => routine.id === entry.routineId)
    if (byId) return byId
    const byName = routinePool.find((routine) => routine.name === entry.routineName)
    if (byName) return byName
    return null
  }

  const loadDataForDate = (date: Date) => {
    const history = getWorkoutHistory()
    setWorkoutHistory(history)

    const allRoutines = getRoutines()
    setRoutines(allRoutines)
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
    setLocalOverride(manualSchedule !== undefined)
  }

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
          setLocalOverride(false)
        }
      } else {
        removeScheduledWorkout(selectedDate)
        setLocalOverride(false)
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
        setLocalOverride(false)
      }
    } else {
      if (workout) {
        setScheduledWorkout(selectedDate, workout)
      } else {
        setRestDay(selectedDate)
      }
      setLocalOverride(true)
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

  const effectiveRestDay = scheduleOverride?.workout === null ? true : scheduleOverride ? false : baseIsRestDay
  const scheduledWorkoutType = effectiveRestDay
    ? "Rest"
    : scheduleOverride?.workoutType || deriveWorkoutType(scheduledRoutine?.name)
  const activeWorkoutType =
    session?.routineName ? deriveWorkoutType(session.routineName) : scheduledWorkoutType
  const actualState =
    uiStateOverride ||
    (workoutForDate
      ? "completed"
      : session && isToday()
        ? "activeSession"
        : effectiveRestDay
          ? "rest"
          : "scheduled")

  const routineNameById = useMemo(() => new Map(routinePool.map((routine) => [routine.id, routine.name])), [routinePool])

  const workoutOptions = routinePool.map((routine) => ({ id: routine.id, name: routine.name }))

  const selectedTitle = actualState === "activeSession" ? activeWorkoutType : scheduledWorkoutType
  const displayExercises =
    actualState === "activeSession" && session?.exercises
      ? session.exercises
      : workoutForDate?.exercises || scheduledRoutine?.exercises

  return (
    <>
      <button
        onClick={() => router.push("/settings")}
        className="fixed z-[60] text-white/25 hover:text-white/50 transition-colors duration-200"
        style={{
          top: "24px",
          right: "12px",
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
      <main
        className="relative flex flex-col overflow-hidden"
        style={{
          height: "100dvh",
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
                  className="flex-shrink-0 transition-all duration-200"
                  style={{
                    background: uiStateOverride === state ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.02)",
                    border: uiStateOverride === state ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid rgba(255, 255, 255, 0.06)",
                    borderRadius: "1px",
                    padding: "6px 10px",
                  }}
                  type="button"
                >
                  <span
                    className={uiStateOverride === state ? "text-white/70" : "text-white/30"}
                    style={{ fontSize: "8px", fontWeight: 500, letterSpacing: "0.05em", fontFamily: "'Archivo Narrow', sans-serif" }}
                  >
                    {state.toUpperCase()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="relative z-50 px-5 pb-8 flex-shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="relative flex-shrink-0">
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={handleDevModeActivation}
                className="text-white/25 tracking-widest select-none"
                style={{
                  fontSize: "7px",
                  fontWeight: 500,
                  letterSpacing: "0.18em",
                  fontFamily: "'Archivo Narrow', sans-serif",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "default",
                }}
                type="button"
              >
                SCHEDULED
              </button>
              {actualState === "activeSession" && (
                <div className="flex items-center gap-1.5">
                  <div
                    style={{
                      width: "4px",
                      height: "4px",
                      borderRadius: "50%",
                      background: "rgba(255, 255, 255, 0.5)",
                      animation: "pulse 2s ease-in-out infinite",
                    }}
                  />
                  <span
                    className="text-white/40"
                    style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.05em", fontFamily: "'Archivo Narrow', sans-serif" }}
                  >
                    IN PROGRESS
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() => !isPastDay && setShowWorkoutPicker(!showWorkoutPicker)}
              disabled={isPastDay}
              className="text-left transition-opacity duration-200 hover:opacity-80 flex items-center gap-2 disabled:opacity-100 disabled:cursor-default"
            >
              <h1
                className="text-white"
                style={{
                  fontSize: "48px",
                  fontWeight: 400,
                  letterSpacing: "-0.01em",
                  lineHeight: "0.92",
                  marginTop: "10px",
                  fontFamily: "'Bebas Neue', sans-serif",
                }}
              >
                {selectedTitle}
              </h1>
              {!isPastDay && (
                <ChevronRight
                  size={20}
                  strokeWidth={1.5}
                  className="text-white/30 mt-2 transition-transform duration-200"
                  style={{
                    transform: showWorkoutPicker ? "rotate(90deg)" : "rotate(0deg)",
                  }}
                />
              )}
            </button>
          </div>

          <div className="flex items-start gap-4" style={{ marginTop: "20px" }}>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setShowWorkoutPicker(false)
                  goToPreviousDay()
                }}
                aria-label="Previous day"
                className="text-white/40 hover:text-white/70 transition-colors"
              >
                <ChevronLeft size={16} strokeWidth={2} />
              </button>

              <div>
                <div
                  className="text-white/25 tracking-widest mb-1"
                  style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.18em", fontFamily: "'Archivo Narrow', sans-serif" }}
                >
                  {isToday() ? "TODAY" : isPastDay ? "PAST" : "UPCOMING"}
                </div>
                <div className="text-white/95" style={{ fontSize: "14px", fontWeight: 500, letterSpacing: "-0.01em", textAlign: "left" }}>
                  {selectedDate.toLocaleDateString("en-US", { weekday: "long" })}
                </div>
                <div className="text-white/30 mt-0.5" style={{ fontSize: "9px", fontWeight: 400, letterSpacing: "0.01em" }}>
                  {selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
              </div>

              <button
                onClick={() => {
                  setShowWorkoutPicker(false)
                  goToNextDay()
                }}
                aria-label="Next day"
                className="text-white/40 hover:text-white/70 transition-colors"
              >
                <ChevronRight size={16} strokeWidth={2} />
              </button>
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
                animation: "slideInDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
              }}
            >
              <button
                onClick={() => handleSelectWorkoutType(null)}
                className="flex-shrink-0 transition-all duration-200"
                style={{
                  background: effectiveRestDay ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.02)",
                  border: effectiveRestDay ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(255, 255, 255, 0.06)",
                  borderRadius: "1px",
                  padding: "12px 18px",
                  minWidth: "100px",
                }}
                onMouseEnter={(e) => {
                  if (!effectiveRestDay) {
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)"
                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.10)"
                  }
                }}
                onMouseLeave={(e) => {
                  if (!effectiveRestDay) {
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)"
                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.06)"
                  }
                }}
                type="button"
              >
                <div
                  className={effectiveRestDay ? "text-white/90" : "text-white/50"}
                  style={{ fontSize: "13px", fontWeight: 400, letterSpacing: "0.02em", fontFamily: "'Archivo Narrow', sans-serif" }}
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
                    className="flex-shrink-0 transition-all duration-200"
                    style={{
                      background: isSelected ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.02)",
                      border: isSelected ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(255, 255, 255, 0.06)",
                      borderRadius: "1px",
                      padding: "12px 18px",
                      minWidth: "100px",
                      animation: `slideInItem 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${index * 0.03}s backwards`,
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)"
                        e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.10)"
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)"
                        e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.06)"
                      }
                    }}
                    type="button"
                  >
                    <div
                      className={isSelected ? "text-white/90" : "text-white/50"}
                      style={{ fontSize: "13px", fontWeight: 400, letterSpacing: "0.02em", fontFamily: "'Archivo Narrow', sans-serif" }}
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

      <div className="flex-1 overflow-hidden" style={{ paddingBottom: "20px" }}>
        {weeklySummary && (
          <div className="px-5 mb-6">
            <div
              className="text-white/25 tracking-widest mb-3"
              style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.18em", fontFamily: "'Archivo Narrow', sans-serif" }}
            >
              THIS WEEK
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div
                  className="text-white/20 mb-1"
                  style={{ fontSize: "7px", fontWeight: 400, letterSpacing: "0.05em", fontFamily: "'Archivo Narrow', sans-serif" }}
                >
                  VOLUME
                </div>
                <div
                  className="text-white/90"
                  style={{ fontSize: "16px", fontWeight: 500, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}
                >
                  {formatVolume(weeklySummary.volumeLb)}
                </div>
                <div className="text-white/15" style={{ fontSize: "7px", fontWeight: 400 }}>
                  lb
                </div>
              </div>
              <div>
                <div
                  className="text-white/20 mb-1"
                  style={{ fontSize: "7px", fontWeight: 400, letterSpacing: "0.05em", fontFamily: "'Archivo Narrow', sans-serif" }}
                >
                  SESSIONS
                </div>
                <div
                  className="text-white/90"
                  style={{ fontSize: "16px", fontWeight: 500, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}
                >
                  {weeklySummary.sessions}
                </div>
              </div>
              <div>
                <div
                  className="text-white/20 mb-1"
                  style={{ fontSize: "7px", fontWeight: 400, letterSpacing: "0.05em", fontFamily: "'Archivo Narrow', sans-serif" }}
                >
                  WEEK/WEEK
                </div>
                <div
                  className="text-white/90"
                  style={{ fontSize: "16px", fontWeight: 500, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}
                >
                  {weeklySummary.wowPercent >= 0 ? "+" : "-"}
                  {Math.abs(weeklySummary.wowPercent).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        )}

        {lastWorkoutSummary && (
          <div className="px-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div
                className="text-white/25 tracking-widest"
                style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.18em", fontFamily: "'Archivo Narrow', sans-serif" }}
              >
                LAST WORKOUT
              </div>
              <div className="text-white/25" style={{ fontSize: "9px", fontWeight: 400 }}>
                {formatShortDate(lastWorkoutSummary.performedAt)}
              </div>
            </div>
            <div className="text-white/90" style={{ fontSize: "14px", fontWeight: 500, letterSpacing: "-0.01em" }}>
              {lastWorkoutSummary.name}
            </div>
            <div className="flex items-center gap-3 mt-3">
              <div
                className="text-white/20"
                style={{ fontSize: "7px", fontWeight: 400, letterSpacing: "0.05em", fontFamily: "'Archivo Narrow', sans-serif" }}
              >
                VOLUME
              </div>
              <div
                className="text-white/90"
                style={{ fontSize: "12px", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}
              >
                {formatVolume(lastWorkoutSummary.totalVolumeLb)} lb
              </div>
              {lastWorkoutSummary.prCount > 0 && (
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "999px",
                    padding: "2px 8px",
                  }}
                >
                  <span className="text-white/60" style={{ fontSize: "9px", fontWeight: 500 }}>
                    {lastWorkoutSummary.prCount} PRs
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {lastWorkoutSummary && lastWorkoutPrs.length > 0 && (
          <div className="px-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div
                className="text-white/25 tracking-widest"
                style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.18em", fontFamily: "'Archivo Narrow', sans-serif" }}
              >
                PRS FROM LAST WORKOUT
              </div>
              <button
                className="flex items-center gap-1 text-white/30 hover:text-white/50 transition-colors duration-200"
                onClick={() => router.push(`/history/${lastWorkoutSummary.id}`)}
              >
                <span style={{ fontSize: "10px", fontWeight: 400 }}>View all PRs</span>
                <ChevronRightSmall size={11} strokeWidth={1.5} />
              </button>
            </div>
            <div className="space-y-2">
              {lastWorkoutPrs.map((pr) => {
                const label =
                  pr.pr_type === "e1rm" ? "e1RM" : pr.pr_type === "volume" ? "Volume" : "Weight"
                const delta =
                  pr.previous_value !== null ? pr.value - pr.previous_value : null
                const displayValue =
                  pr.pr_type === "volume" ? formatVolume(pr.value) : Math.round(pr.value).toLocaleString()
                return (
                  <div key={pr.id} className="flex items-center justify-between">
                    <div className="text-white/70" style={{ fontSize: "11px", fontWeight: 400 }}>
                      {pr.exercise_name} • {label} {displayValue} lb
                    </div>
                    {delta !== null && (
                      <div className="text-white/25" style={{ fontSize: "9px", fontWeight: 400, fontVariantNumeric: "tabular-nums" }}>
                        {delta >= 0 ? "+" : "-"}
                        {Math.abs(Math.round(delta))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {actualState === "completed" && workoutForDate && (
          <div className="px-5 mb-12">
            <div
              className="mb-6"
              style={{
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "1px",
                padding: "16px",
              }}
            >
              <div
                className="text-white/25 tracking-widest mb-4"
                style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.18em", fontFamily: "'Archivo Narrow', sans-serif" }}
              >
                {isPastDay ? "COMPLETED" : "COMPLETED TODAY"}
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <div
                    className="text-white/20 mb-1"
                    style={{ fontSize: "7px", fontWeight: 400, letterSpacing: "0.05em", fontFamily: "'Archivo Narrow', sans-serif" }}
                  >
                    EXERCISES
                  </div>
                  <div
                    className="text-white/90"
                    style={{ fontSize: "16px", fontWeight: 500, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}
                  >
                    {workoutForDate.exercises?.length ?? 0}
                  </div>
                </div>
                <div>
                  <div
                    className="text-white/20 mb-1"
                    style={{ fontSize: "7px", fontWeight: 400, letterSpacing: "0.05em", fontFamily: "'Archivo Narrow', sans-serif" }}
                  >
                    VOLUME
                  </div>
                  <div
                    className="text-white/90"
                    style={{ fontSize: "16px", fontWeight: 500, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}
                  >
                    {Math.round(workoutForDate.stats.totalVolume / 100) / 10}k
                  </div>
                  <div className="text-white/15" style={{ fontSize: "7px", fontWeight: 400 }}>
                    lbs
                  </div>
                </div>
              </div>

              <button
                className="w-full transition-all duration-200"
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "1px",
                  padding: "11px",
                }}
                onClick={() => router.push(`/history/${workoutForDate.id}`)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.12)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)"
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)"
                }}
              >
                <span className="text-white/60" style={{ fontSize: "11px", fontWeight: 400 }}>
                  View Details
                </span>
              </button>
            </div>

            {displayExercises && displayExercises.length > 0 && (
              <div className="mb-6 space-y-2.5">
                {displayExercises.map((exercise: any, index: number) => (
                  <div key={exercise.id ?? `${exercise.name}-${index}`} className="flex items-center gap-3" style={{ opacity: 0.6 }}>
                    <div
                      className="text-white/40"
                      style={{ fontSize: "9px", fontWeight: 500, fontVariantNumeric: "tabular-nums", minWidth: "12px" }}
                    >
                      {index + 1}
                    </div>
                    <div
                      className="text-white/90 flex-1"
                      style={{ fontSize: "11px", fontWeight: 400, letterSpacing: "0.005em" }}
                    >
                      {exercise.name}
                    </div>
                    <div
                      className="text-white/30"
                      style={{ fontSize: "9px", fontWeight: 400, letterSpacing: "0.01em" }}
                    >
                      {exercise.targetSets ?? exercise.sets?.length ?? 0} sets
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {actualState === "rest" && (
          <div className="px-5 mb-12">
            <div className="text-white/20 text-center" style={{ fontSize: "11px", fontWeight: 400, letterSpacing: "0.01em", padding: "32px 0" }}>
              Rest day — no workout scheduled
            </div>
          </div>
        )}

        {(actualState === "scheduled" || actualState === "activeSession") && displayExercises && (
          <div className="px-5 mb-12">
            <div className="mb-6 space-y-2.5">
              {displayExercises.map((exercise: any, index: number) => (
                <div key={exercise.id ?? `${exercise.name}-${index}`} className="flex items-center gap-3" style={{ opacity: 0.35 }}>
                  <div
                    className="text-white/40"
                    style={{ fontSize: "9px", fontWeight: 500, fontVariantNumeric: "tabular-nums", minWidth: "12px" }}
                  >
                    {index + 1}
                  </div>
                  <div
                    className="text-white/90 flex-1"
                    style={{ fontSize: "11px", fontWeight: 400, letterSpacing: "0.005em" }}
                  >
                    {exercise.name}
                  </div>
                  <div
                    className="text-white/30"
                    style={{ fontSize: "9px", fontWeight: 400, fontVariantNumeric: "tabular-nums" }}
                  >
                    {exercise.targetSets ?? exercise.sets ?? 0} × {exercise.targetReps ?? exercise.reps ?? "-"}
                  </div>
                </div>
              ))}
            </div>

            <button
              className="w-full transition-all duration-200"
              style={{
                background: actualState === "activeSession" ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.03)",
                border: actualState === "activeSession" ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "1px",
                padding: "14px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)"
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.16)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = actualState === "activeSession" ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.03)"
                e.currentTarget.style.borderColor = actualState === "activeSession" ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.08)"
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
              <div className="flex items-center justify-center gap-2">
                {actualState === "activeSession" && (
                  <div
                    style={{
                      width: "5px",
                      height: "5px",
                      borderRadius: "50%",
                      background: "rgba(255, 255, 255, 0.6)",
                      animation: "pulse 2s ease-in-out infinite",
                    }}
                  />
                )}
                <span className="text-white/90" style={{ fontSize: "13px", fontWeight: 400, letterSpacing: "0.02em" }}>
                  {actualState === "activeSession" ? "Resume Workout" : "Start Workout"}
                </span>
                {actualState === "activeSession" && null}
              </div>
            </button>

            {actualState === "activeSession" && (
              <button
                className="w-full mt-3 transition-all duration-200"
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "1px",
                  padding: "12px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)"
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.12)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent"
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)"
                }}
                onClick={handleDiscardActiveWorkout}
              >
                <span className="text-white/40" style={{ fontSize: "11px", fontWeight: 400, letterSpacing: "0.02em" }}>
                  Discard Active Workout
                </span>
              </button>
            )}

          </div>
        )}

      </div>

      <div className="px-5 mt-2 flex-shrink-0">
        <div
          className="text-white/25 tracking-widest mb-2"
          style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.18em", fontFamily: "'Archivo Narrow', sans-serif" }}
        >
          TRAINING VOLUME
        </div>
        <button
          className="w-full text-left transition-all duration-200"
          onClick={() => router.push("/volume")}
          style={{ background: "transparent", padding: 0 }}
          type="button"
        >
          <TrainingVolumeCard
            currentWeekVolume={currentWeekVolume}
            previousWeekVolume={previousWeekVolume}
            chartData={weeklyVolumes}
            timeframe="7w"
          />
        </button>
      </div>

      {todayPRs.length > 0 && (
        <div className="flex-shrink-0 pb-6" data-testid="pr-section">
          <div className="px-5 flex items-center justify-between mb-4">
            <h2
              className="text-white/25 tracking-widest"
              style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.18em", fontFamily: "'Archivo Narrow', sans-serif" }}
            >
              PERSONAL RECORDS
            </h2>
          </div>

          <div
            className="flex gap-3 overflow-x-auto px-5"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
          >
            {todayPRs.map((pr) => (
              <PRCard
                key={pr.name}
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
              className="text-white/40"
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
              <span className="text-white/90" style={{ fontSize: "12px", fontWeight: 500, letterSpacing: "0.02em" }}>
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
              <span className="text-white/60" style={{ fontSize: "12px", fontWeight: 400, letterSpacing: "0.02em" }}>
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
              <span className="text-white/40" style={{ fontSize: "11px", fontWeight: 400 }}>
                Cancel
              </span>
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

        <style>{`
        .flex.overflow-x-auto::-webkit-scrollbar {
          display: none;
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

        @keyframes pulse {
          0%, 100% {
            opacity: 0.6;
          }
          50% {
            opacity: 1;
          }
        }
        `}</style>
      </main>
    </>
  )
}

function PRCard({
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
  const chartSeries = chartData.length === 1 ? [chartData[0], chartData[0]] : chartData
  const safeSeries = chartSeries.length > 0 ? chartSeries : [weight]
  const formattedData = safeSeries.map((value, index) => ({ index, value }))
  const changePercent = typeof trendPct === "number" ? trendPct : null
  const isPositive = (changePercent ?? 0) > 0
  const gradientId = `prGradient-${exercise.replace(/\s+/g, "-").toLowerCase()}`

  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 text-left"
      style={{ width: "172px", padding: "0" }}
      type="button"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="text-white/35 pr-2" style={{ fontSize: "9px", fontWeight: 400, lineHeight: "1.3", letterSpacing: "0.005em" }}>
          {exercise}
        </div>

        {changePercent !== null && changePercent !== 0 && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {isPositive ? (
              <ArrowUp size={7} strokeWidth={2.5} style={{ color: "rgba(255, 255, 255, 0.3)" }} />
            ) : (
              <ArrowDown size={7} strokeWidth={2.5} style={{ color: "rgba(255, 255, 255, 0.3)" }} />
            )}
            <span
              style={{
                fontSize: "7px",
                fontWeight: 500,
                color: "rgba(255, 255, 255, 0.3)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {Math.abs(changePercent)}%
            </span>
          </div>
        )}
      </div>

      <div className="mb-5">
        <div className="flex items-baseline gap-2">
          <div
            className="text-white/95"
            style={{ fontSize: "34px", fontWeight: 500, letterSpacing: "-0.04em", lineHeight: "1", fontVariantNumeric: "tabular-nums" }}
          >
            {reps}
          </div>
          <div className="text-white/15" style={{ fontSize: "11px", fontWeight: 400, marginBottom: "3px" }}>
            ×
          </div>
          <div
            className="text-white/95"
            style={{ fontSize: "34px", fontWeight: 500, letterSpacing: "-0.04em", lineHeight: "1", fontVariantNumeric: "tabular-nums" }}
          >
            {weight}
          </div>
        </div>
        <div className="text-white/20 mt-1" style={{ fontSize: "7px", fontWeight: 400, letterSpacing: "0.02em" }}>
          lbs
        </div>
      </div>

      <div className="mb-3" style={{ height: "52px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formattedData} margin={{ top: 8, right: 0, left: 0, bottom: 8 }}>
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgba(255, 255, 255, 0.12)" />
                <stop offset="100%" stopColor="rgba(255, 255, 255, 0.00)" />
              </linearGradient>
            </defs>
            <YAxis hide domain={[(dataMin: number) => dataMin - 15, (dataMax: number) => dataMax + 15]} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="rgba(255, 255, 255, 0.35)"
              strokeWidth={1.5}
              fill={`url(#${gradientId})`}
              dot={(props) => {
                const { cx, cy, index } = props
                if (cx === undefined || cy === undefined) return null
                const isLast = index === formattedData.length - 1
                return (
                  <circle
                    key={`pr-dot-${exercise}-${index}`}
                    cx={cx}
                    cy={cy}
                    r={isLast ? 2 : 1}
                    fill={isLast ? "rgba(255, 255, 255, 0.75)" : "rgba(255, 255, 255, 0.25)"}
                  />
                )
              }}
              activeDot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="text-white/18" style={{ fontSize: "7px", fontWeight: 400, letterSpacing: "0.01em" }}>
        {details}
      </div>
    </button>
  )
}

function TrainingVolumeCard({
  currentWeekVolume,
  previousWeekVolume,
  chartData,
  timeframe,
}: {
  currentWeekVolume: number
  previousWeekVolume: number
  chartData: number[]
  timeframe: string
}) {
  const formattedData = chartData.map((value, index) => ({ week: index + 1, volume: value }))
  const delta = currentWeekVolume - previousWeekVolume
  const percent = previousWeekVolume ? (delta / previousWeekVolume) * 100 : 0
  const isPositive = delta > 0
  const arrowColor = isPositive ? "#FF5733" : "rgba(255, 255, 255, 0.25)"
  const valueColor = isPositive ? "#FF5733" : "rgba(255, 255, 255, 0.25)"
  const percentColor = isPositive ? "rgba(255, 87, 51, 0.6)" : "rgba(255, 255, 255, 0.2)"
  const showWeekCompare = currentWeekVolume > 0 && previousWeekVolume > 0
  const displayVolume = showWeekCompare ? currentWeekVolume : previousWeekVolume
  const formatVolumeK = (value: number) => {
    const abs = Math.abs(value)
    if (abs >= 1000) return `${(abs / 1000).toFixed(1)}k`
    return `${abs.toFixed(0)}`
  }

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          <div
            className="text-white/95"
            style={{
              fontSize: "34px",
              fontWeight: 500,
              letterSpacing: "-0.04em",
              lineHeight: "1",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatVolumeK(displayVolume)}
          </div>
          <div className="text-white/20" style={{ fontSize: "9px", fontWeight: 400, letterSpacing: "0.02em" }}>
            lbs
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <div
          className="text-white/40"
          style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.16em", fontFamily: "'Archivo Narrow', sans-serif" }}
        >
          {showWeekCompare ? "WEEK/WEEK" : "LAST WEEK"}
        </div>
        {showWeekCompare ? (
          <div className="flex items-center gap-1.5">
            {isPositive ? (
              <ArrowUp size={10} strokeWidth={2} style={{ color: arrowColor }} />
            ) : (
              <ArrowDown size={10} strokeWidth={2} style={{ color: arrowColor }} />
            )}
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: valueColor,
                fontVariantNumeric: "tabular-nums",
                fontFamily: "'Archivo Narrow', sans-serif",
              }}
            >
              {formatVolumeK(Math.abs(delta))}
            </div>
            <div
              style={{
                fontSize: "9px",
                fontWeight: 500,
                color: percentColor,
                fontVariantNumeric: "tabular-nums",
                fontFamily: "'Archivo Narrow', sans-serif",
              }}
            >
              ({Math.abs(percent).toFixed(1)}%)
            </div>
          </div>
        ) : (
          <div
            className="text-white/25"
            style={{ fontSize: "9px", fontWeight: 500, fontVariantNumeric: "tabular-nums", fontFamily: "'Archivo Narrow', sans-serif" }}
          >
            {formatVolumeK(previousWeekVolume)} lbs
          </div>
        )}
      </div>

      <div style={{ height: "56px", width: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formattedData} margin={{ top: 5, right: 0, left: -4, bottom: 5 }}>
            <defs>
              <linearGradient id="volumeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgba(255, 255, 255, 0.08)" />
                <stop offset="100%" stopColor="rgba(255, 255, 255, 0.00)" />
              </linearGradient>
            </defs>
            <YAxis hide domain={[(dataMin: number) => dataMin - 5000, (dataMax: number) => dataMax + 5000]} />
            <Area
              type="monotone"
              dataKey="volume"
              stroke="rgba(255, 255, 255, 0.3)"
              strokeWidth={1.5}
              fill="url(#volumeGradient)"
              dot={(props) => {
                const { cx, cy, index } = props
                if (cx === undefined || cy === undefined) return null
                return (
                  <circle
                    key={`vol-dot-${index}`}
                    cx={cx}
                    cy={cy}
                    r={2.5}
                    fill="rgba(255, 255, 255, 0.25)"
                  />
                )
              }}
              activeDot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
