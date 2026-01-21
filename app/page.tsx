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
import { GROWTH_V2_ROUTINES } from "@/lib/growth-v2-plan"
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
import { supabase } from "@/lib/supabase"
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightSmall,
} from "lucide-react"

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
  duration: number
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

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

function getSessionElapsedSeconds(session: WorkoutSession | null, now = Date.now()): number {
  if (!session) return 0
  const baseSeconds = session.activeDurationSeconds || 0
  if (session.status !== "in_progress") return baseSeconds
  if (!session.lastActiveAt) return baseSeconds
  const lastActiveAtMs = new Date(session.lastActiveAt).getTime()
  const deltaSeconds = Math.max(0, Math.floor((now - lastActiveAtMs) / 1000))
  return baseSeconds + deltaSeconds
}

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
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const normalizeExerciseName = (name: string) => formatExerciseName(name).toLowerCase()

  useEffect(() => {
    setRoutines(getRoutines())
    const currentSession = getCurrentInProgressSession()
    if (currentSession?.startedAt) {
      const started = new Date(currentSession.startedAt)
      const today = new Date()
      started.setHours(0, 0, 0, 0)
      today.setHours(0, 0, 0, 0)
      if (started.getTime() !== today.getTime()) {
        saveCurrentSessionId(null)
        setSession(null)
        return
      }
    }
    setSession(currentSession)
  }, [])

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
    if (!session) {
      setElapsedSeconds(0)
      return
    }
    const updateElapsed = () => setElapsedSeconds(getSessionElapsedSeconds(session))
    updateElapsed()
    if (session.status !== "in_progress") return
    const interval = setInterval(updateElapsed, 1000)
    return () => clearInterval(interval)
  }, [session?.id, session?.status, session?.lastActiveAt, session?.activeDurationSeconds])

  useEffect(() => {
    loadDataForDate(selectedDate)
  }, [selectedDate])

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

    const getExerciseVolume = (exercise: any) =>
      exercise.sets
        .filter((s: any) => s.completed && s.weight > 0 && s.reps > 0)
        .reduce((sum: number, s: any) => sum + s.weight * s.reps, 0)

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
      })
    })

    const prSourceExercises =
      scheduledRoutine?.exercises || workoutForDate?.exercises || workoutHistory[0]?.exercises || []
    const exerciseNames = prSourceExercises.map((e: any) => normalizeExerciseName(e.name))
    const filteredPRs = exerciseNames
      .map((name: string) => {
        const pr = prByExerciseName.get(name)
        if (!pr) return null
        const volumes = workoutHistory
          .map((workout) => {
            const exercise = workout.exercises.find((ex: any) => normalizeExerciseName(ex.name) === name)
            if (!exercise) return null
            const volume = getExerciseVolume(exercise)
            return volume > 0 ? volume : null
          })
          .filter((v: number | null): v is number => v !== null)

        const timeline = prTimelineByExercise.get(name) ?? []
        const last = timeline[timeline.length - 1]
        const prev = timeline[timeline.length - 2]
        const trendPct =
          prev && prev.weight > 0 ? Math.round(((last.weight - prev.weight) / prev.weight) * 100) : null

        const chartData = volumes.slice(0, 7).reverse()

        return { ...pr, trendPct, chartData }
      })
      .filter(Boolean) as PersonalRecord[]

    setTodayPRs(filteredPRs)
  }, [workoutHistory, scheduledRoutine, workoutForDate])

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

    let nextRoutine: WorkoutRoutine | null = null
    let restDay = false

    if (manualSchedule === null) {
      restDay = true
    } else if (manualSchedule !== undefined) {
      nextRoutine = resolveRoutineEntry(manualSchedule)
    } else {
      nextRoutine = pool[0] ?? null
      if (history.length > 0 && pool.length > 0) {
        const workoutsBeforeDate = history.filter((w) => new Date(w.date) < date)
        const lastWorkout = workoutsBeforeDate[0]

        if (lastWorkout) {
          const lastRoutineIndex = pool.findIndex((r) => r.name === lastWorkout.name)
          if (lastRoutineIndex >= 0) {
            const nextIndex = (lastRoutineIndex + 1) % pool.length
            nextRoutine = pool[nextIndex]
          }
        }
      }
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
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() - 1)
    setSelectedDate(newDate)
  }

  const goToNextDay = () => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + 1)
    setSelectedDate(newDate)
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

  const isOverridden = scheduleOverride?.isOverride ?? localOverride
  const effectiveRestDay = scheduleOverride?.workout === null ? true : scheduleOverride ? false : baseIsRestDay
  const scheduledWorkoutType = effectiveRestDay
    ? "Rest"
    : scheduleOverride?.workoutType || deriveWorkoutType(scheduledRoutine?.name)
  const actualState = workoutForDate
    ? "completed"
    : effectiveRestDay
      ? "rest"
      : session && isToday()
        ? "activeSession"
        : "scheduled"

  const routineNameById = useMemo(() => new Map(routinePool.map((routine) => [routine.id, routine.name])), [routinePool])

  const workoutOptions = routinePool.map((routine) => ({ id: routine.id, name: routine.name }))

  const selectedTitle = scheduledWorkoutType

  return (
    <>
      <button
        onClick={() => router.push("/settings")}
        className="fixed z-50 text-white/25 hover:text-white/50 transition-colors duration-200"
        style={{
          top: "24px",
          right: "24px",
          background: "transparent",
          border: "none",
          padding: "8px",
          cursor: "pointer",
        }}
        aria-label="Open settings"
        type="button"
      >
        <Settings size={20} strokeWidth={1.5} />
      </button>
      <main className="relative min-h-[100dvh] overflow-hidden bg-[#0A0A0C]">
        <div className="relative z-50 px-5 pt-5 pb-8">
        <div className="flex items-start justify-between gap-4">
          <div className="relative flex-shrink-0">
            <div className="flex items-center gap-2 mb-1">
              <div
                className="text-white/25 tracking-widest"
                style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.18em", fontFamily: "'Archivo Narrow', sans-serif" }}
              >
                SCHEDULED
              </div>
              {isOverridden && (
                <div
                  className="flex items-center gap-1"
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "1px",
                    padding: "2px 5px",
                  }}
                >
                  <ArrowLeftRight size={8} strokeWidth={2} className="text-white/30" />
                  <span
                    className="text-white/30"
                    style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.05em", fontFamily: "'Archivo Narrow', sans-serif" }}
                  >
                    OVERRIDDEN
                  </span>
                </div>
              )}
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

          <div className="flex items-start gap-4">
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
              className="relative z-50 flex gap-3 overflow-x-auto px-5"
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

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div>
                  <div
                    className="text-white/20 mb-1"
                    style={{ fontSize: "7px", fontWeight: 400, letterSpacing: "0.05em", fontFamily: "'Archivo Narrow', sans-serif" }}
                  >
                    DURATION
                  </div>
                  <div
                    className="text-white/90"
                    style={{ fontSize: "16px", fontWeight: 500, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}
                  >
                    {formatElapsed(workoutForDate.duration)}
                  </div>
                </div>
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
          </div>
        )}

        {actualState === "rest" && (
          <div className="px-5 mb-12">
            <div className="text-white/20 text-center" style={{ fontSize: "11px", fontWeight: 400, letterSpacing: "0.01em", padding: "32px 0" }}>
              Rest day — no workout scheduled
            </div>
          </div>
        )}

        {(actualState === "scheduled" || actualState === "activeSession") && scheduledRoutine && (
          <div className="px-5 mb-12">
            <div className="mb-6 space-y-2.5">
              {scheduledRoutine.exercises.map((exercise, index) => (
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
                {actualState === "activeSession" && (
                  <span className="text-white/30" style={{ fontSize: "10px", fontWeight: 400, fontVariantNumeric: "tabular-nums" }}>
                    {formatElapsed(elapsedSeconds)}
                  </span>
                )}
              </div>
            </button>
          </div>
        )}

        {todayPRs.length > 0 && (
          <div className="flex-shrink-0">
            <div className="px-5 flex items-center justify-between mb-4">
              <h2
                className="text-white/25 tracking-widest"
                style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.18em", fontFamily: "'Archivo Narrow', sans-serif" }}
              >
                PERSONAL RECORDS
              </h2>
              <button
                className="flex items-center gap-1 text-white/30 hover:text-white/50 transition-colors duration-200"
                onClick={() => router.push("/prs")}
              >
                <span style={{ fontSize: "10px", fontWeight: 400 }}>View all</span>
                <ChevronRightSmall size={11} strokeWidth={1.5} />
              </button>
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
                  trendPct={pr.trendPct ?? undefined}
                  onClick={pr.workoutId ? () => router.push(`/history/${pr.workoutId}`) : undefined}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Active Workout Detected</AlertDialogTitle>
            <AlertDialogDescription>
              You have an active workout in progress ({session?.routineName || "Workout"}). Would you like to resume it
              or start a new workout? Starting a new workout will discard your current progress.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowConflictDialog(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDiscardExisting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard & Start New
            </AlertDialogAction>
            <AlertDialogAction onClick={handleResumeExisting}>Resume Existing</AlertDialogAction>
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
  trendPct?: number
  onClick?: () => void
}) {
  const maxValue = chartData.length > 0 ? Math.max(...chartData) : 1
  const minValue = chartData.length > 0 ? Math.min(...chartData) : 0
  const range = maxValue - minValue || 1

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

        {trendPct && trendPct !== 0 && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {trendPct > 0 ? (
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
              {Math.abs(trendPct)}%
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

      <div className="mb-3" style={{ height: "42px" }}>
        <svg width="100%" height="100%" viewBox="0 0 100 42" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`grad-${exercise.replace(/\s+/g, "-")}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(255, 255, 255, 0.06)" />
              <stop offset="100%" stopColor="rgba(255, 255, 255, 0.00)" />
            </linearGradient>
          </defs>

          {chartData.length > 0 && (
            <>
              <path
                d={`M 0,42 ${chartData
                  .map((value, index) => {
                    const x = (index / (chartData.length - 1)) * 100
                    const y = 42 - ((value - minValue) / range) * 32
                    return `L ${x},${y}`
                  })
                  .join(" ")} L 100,42 Z`}
                fill={`url(#grad-${exercise.replace(/\s+/g, "-")})`}
              />

              <path
                d={`M ${chartData
                  .map((value, index) => {
                    const x = (index / (chartData.length - 1)) * 100
                    const y = 42 - ((value - minValue) / range) * 32
                    return `${x},${y}`
                  })
                  .join(" L ")}`}
                fill="none"
                stroke="rgba(255, 255, 255, 0.25)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {chartData.length > 1 &&
                chartData.map((value, index) => {
                  const x = (index / (chartData.length - 1)) * 100
                  const y = 42 - ((value - minValue) / range) * 32
                  return (
                    <circle
                      key={`${exercise}-${index}`}
                      cx={x}
                      cy={y}
                      r={index === chartData.length - 1 ? 1.5 : 0.8}
                      fill={index === chartData.length - 1 ? "rgba(255, 255, 255, 0.6)" : "rgba(255, 255, 255, 0.15)"}
                    />
                  )
                })}
            </>
          )}
        </svg>
      </div>

      <div className="text-white/18" style={{ fontSize: "7px", fontWeight: 400, letterSpacing: "0.01em" }}>
        {details}
      </div>
    </button>
  )
}
