"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTrigger,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { getWorkoutHistory } from "@/lib/workout-storage"
import { getRoutines } from "@/lib/routine-storage"
import {
  deleteSession,
  deleteSetsForSession,
  getCurrentInProgressSession,
  saveCurrentSessionId,
} from "@/lib/autosave-workout-storage"
import {
  Play,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Check,
  Plus,
  X,
  Moon,
  Edit,
  ArrowUpRight,
} from "lucide-react"
import { BottomNav } from "@/components/bottom-nav"
import { GROWTH_V2_ROUTINES } from "@/lib/growth-v2-plan"
import { formatExerciseName } from "@/lib/format-exercise-name"
import {
  getScheduledWorkoutForDate,
  setScheduledWorkout as persistScheduledWorkout,
  setRestDay,
} from "@/lib/schedule-storage"
import { supabase } from "@/lib/supabase"

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
}

export default function Home() {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [scheduledWorkout, setScheduledWorkout] = useState<WorkoutRoutine | null>(null)
  const [workoutForDate, setWorkoutForDate] = useState<CompletedWorkout | null>(null)
  const [isRestDay, setIsRestDay] = useState(false)
  const [todayPRs, setTodayPRs] = useState<
    Array<{
      name: string
      weight: number
      reps: number
      workoutId?: string
      achievedAt?: string
      workoutName?: string
      trendPct?: number | null
      chartData?: number[]
    }>
  >([])
  const [isAddWorkoutOpen, setIsAddWorkoutOpen] = useState(false)
  const [showAllPrs, setShowAllPrs] = useState(false)
  const [showConflictDialog, setShowConflictDialog] = useState(false)
  const [pendingRoutineId, setPendingRoutineId] = useState<string | null>(null)
  const [showDiscardSessionDialog, setShowDiscardSessionDialog] = useState(false)
  const [routines, setRoutines] = useState<any[]>([])
  const [showCalendar, setShowCalendar] = useState(false)
  const [session, setSession] = useState<any | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [weightEntries, setWeightEntries] = useState<Array<{ measured_at: string; weight_lb: number }>>([])
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
    loadDataForDate(selectedDate)
  }, [selectedDate])

  useEffect(() => {
    const handleScheduleUpdated = () => {
      loadDataForDate(selectedDate)
    }
    window.addEventListener("schedule:updated", handleScheduleUpdated)
    return () => window.removeEventListener("schedule:updated", handleScheduleUpdated)
  }, [selectedDate])

  useEffect(() => {
    if (!userId) {
      setWeightEntries([])
      return
    }
    const end = new Date(selectedDate)
    end.setHours(23, 59, 59, 999)
    const start = new Date(selectedDate)
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - 29)

    const loadWeights = async () => {
      const { data, error } = await supabase
        .from("body_weight_entries")
        .select("measured_at, weight_lb")
        .eq("user_id", userId)
        .gte("measured_at", start.toISOString())
        .lte("measured_at", end.toISOString())
        .order("measured_at", { ascending: true })
      if (error) {
        setWeightEntries([])
        return
      }
      const filtered = (data ?? []).filter(
        (entry): entry is { measured_at: string; weight_lb: number } =>
          typeof entry.weight_lb === "number" && Number.isFinite(entry.weight_lb),
      )
      setWeightEntries(filtered)
    }

    void loadWeights()
  }, [selectedDate, userId])

  const loadDataForDate = (date: Date) => {
    const history = getWorkoutHistory()
    const allRoutines = getRoutines()
    const routinePool = allRoutines.length > 0 ? allRoutines : GROWTH_V2_ROUTINES
    const routineById = new Map(routinePool.map((routine) => [routine.id, routine]))
    const growthById = new Map(GROWTH_V2_ROUTINES.map((routine) => [routine.id, routine]))
    const resolveRoutine = (entry: { routineId: string; routineName: string } | null | undefined) => {
      if (!entry) return null
      return (
        routineById.get(entry.routineId) ||
        growthById.get(entry.routineId) ||
        routinePool.find((routine) => routine.name === entry.routineName) ||
        GROWTH_V2_ROUTINES.find((routine) => routine.name === entry.routineName) ||
        null
      )
    }

    // Normalize date to midnight for comparison
    const targetDate = new Date(date)
    targetDate.setHours(0, 0, 0, 0)

    // Find completed workout for this date
    const completedWorkout = history.find((w) => {
      const workoutDate = new Date(w.date)
      workoutDate.setHours(0, 0, 0, 0)
      return workoutDate.getTime() === targetDate.getTime()
    })

    setWorkoutForDate(completedWorkout || null)

    const manualSchedule = getScheduledWorkoutForDate(date)

    let scheduledRoutine = null
    let restDay = false

    if (manualSchedule === null) {
      // Explicitly marked as rest day by user
      restDay = true
    } else if (manualSchedule !== undefined) {
      // Has manual schedule
      scheduledRoutine = resolveRoutine(manualSchedule)
    } else {
      // No manual schedule - use rotation
      scheduledRoutine = routinePool[0] ?? null
      if (history.length > 0 && routinePool.length > 0) {
        const workoutsBeforeDate = history.filter((w) => new Date(w.date) < date)
        const lastWorkout = workoutsBeforeDate[0]

        if (lastWorkout) {
          const lastRoutineIndex = routinePool.findIndex((r) => r.name === lastWorkout.name)
          if (lastRoutineIndex >= 0) {
            const nextIndex = (lastRoutineIndex + 1) % routinePool.length
            scheduledRoutine = routinePool[nextIndex]
          }
        }
      }
    }

    setScheduledWorkout(scheduledRoutine)
    setIsRestDay(restDay)

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

    const getExerciseVolume = (exercise: any) =>
      exercise.sets
        .filter((s: any) => s.completed && s.weight > 0 && s.reps > 0)
        .reduce((sum: number, s: any) => sum + s.weight * s.reps, 0)

    history.forEach((workout) => {
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
      })
    })

    // Get PRs for exercises in scheduled workout, or fall back to the most recent workout
    const prSourceExercises =
      scheduledRoutine?.exercises || workoutForDate?.exercises || history[0]?.exercises || []
    const exerciseNames = prSourceExercises.map((e: any) => normalizeExerciseName(e.name))
    const filteredPRs = exerciseNames
      .map((name: string) => {
        const pr = prByExerciseName.get(name)
        if (!pr) return null
        const volumes = history
          .map((workout) => {
            const exercise = workout.exercises.find((ex: any) => normalizeExerciseName(ex.name) === name)
            if (!exercise) return null
            const volume = getExerciseVolume(exercise)
            return volume > 0 ? volume : null
          })
          .filter((v: number | null): v is number => v !== null)

        const trendPct =
          volumes.length >= 2 && volumes[1] > 0 ? Math.round(((volumes[0] - volumes[1]) / volumes[1]) * 100) : null

        const chartData = volumes.slice(0, 7).reverse()

        return { ...pr, trendPct, chartData }
      })
      .filter(Boolean)

    setTodayPRs(filteredPRs as any[])
    setShowAllPrs(false)

  }

  const handleAddWorkout = (routine: any) => {
    persistScheduledWorkout(selectedDate, {
      routineId: routine.id,
      routineName: routine.name,
    })
    setIsAddWorkoutOpen(false)
    loadDataForDate(selectedDate)
  }

  const handleRemoveWorkout = () => {
    setScheduledWorkout(null)
    setRestDay(selectedDate)
    loadDataForDate(selectedDate)
  }

  const handleSetRestDay = () => {
    setRestDay(selectedDate)
    setIsAddWorkoutOpen(false)
    loadDataForDate(selectedDate)
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

  const goToToday = () => {
    setSelectedDate(new Date())
    setShowCalendar(false)
  }

  const isToday = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const selected = new Date(selectedDate)
    selected.setHours(0, 0, 0, 0)
    return today.getTime() === selected.getTime()
  }

  const isFuture = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const selected = new Date(selectedDate)
    selected.setHours(0, 0, 0, 0)
    return selected.getTime() > today.getTime()
  }

  const formatDateHeader = () => {
    if (isToday()) return "Today"

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    const selected = new Date(selectedDate)
    selected.setHours(0, 0, 0, 0)
    if (selected.getTime() === tomorrow.getTime()) return "Tomorrow"

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)
    if (selected.getTime() === yesterday.getTime()) return "Yesterday"

    return selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
  }

  const getExerciseIcon = (exerciseName: string) => {
    const name = exerciseName.toLowerCase()
    if (name.includes("bench")) return "⭐"
    if (name.includes("squat")) return "⭐"
    if (name.includes("deadlift")) return "⭐"
    if (name.includes("press")) return "⭐"
    return "💪"
  }

  const handleStartWorkout = (routineId: string) => {
    if (session) {
      // Show confirmation dialog if there's an active session
      setPendingRoutineId(routineId)
      setShowConflictDialog(true)
    } else {
      // No conflict, start workout directly
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
    // Clear the current session
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

  const handleDiscardSession = () => {
    if (session?.id) {
      deleteSetsForSession(session.id)
      deleteSession(session.id)
    }
    saveCurrentSessionId(null)
    setSession(null)
    setShowDiscardSessionDialog(false)
  }

  const scheduledTotal = scheduledWorkout?.exercises?.length ?? 0
  const scheduledCompleted = 0
  const scheduledProgress = scheduledTotal > 0 ? scheduledCompleted / scheduledTotal : 0

  const weightChartData = weightEntries.map((entry) => entry.weight_lb)
  const latestWeight = weightChartData.length > 0 ? weightChartData[weightChartData.length - 1] : null
  const startWeight = weightChartData.length > 0 ? weightChartData[0] : null

  return (
    <main className="relative min-h-screen pb-[calc(env(safe-area-inset-bottom)+140px)] glass-scope">
      <div className="home-atmosphere" aria-hidden="true">
        <span className="home-particle" />
        <span className="home-particle" />
        <span className="home-particle" />
        <span className="home-particle" />
        <span className="home-particle" />
      </div>
      <header className="sticky top-0 z-10 bg-transparent">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {!isToday() && (
              <Button variant="outline" size="sm" className="h-10 px-3 bg-transparent" onClick={goToToday}>
                Today
              </Button>
            )}
          </div>

          <div className="flex-1 text-left min-w-0 space-y-1">
            <div className="text-white/30 tracking-wider" style={{ fontSize: "10px", fontWeight: 500 }}>
              KOVA FIT
            </div>
            <h1 className="text-white/95" style={{ fontSize: "32px", fontWeight: 700, letterSpacing: "-0.02em" }}>
              {formatDateHeader()}
            </h1>
            <p className="text-white/40" style={{ fontSize: "13px", fontWeight: 500 }}>
              {selectedDate.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10"
              onClick={goToPreviousDay}
              aria-label="Previous day"
            >
              <ChevronLeft className="w-6 h-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10"
              onClick={goToNextDay}
              aria-label="Next day"
            >
              <ChevronRight className="w-6 h-6" />
            </Button>
            <Popover open={showCalendar} onOpenChange={setShowCalendar}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="Open calendar">
                  <Calendar className="w-6 h-6" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <CalendarComponent
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDate(date)
                      setShowCalendar(false)
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      <div className="relative z-10 px-6 pt-4 space-y-8">
        <section>
          {session && session.routineId && (
            <Card className="border-2 border-orange-500 bg-orange-50 dark:bg-orange-950/20">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <Badge
                      variant="secondary"
                      className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 mb-2"
                    >
                      {session.status === "paused" ? "PAUSED" : "IN PROGRESS"}
                    </Badge>
                    <h2 className="text-xl font-bold mb-1">{session.routineName || "Workout"}</h2>
                    <p className="text-sm text-muted-foreground">
                      Started {new Date(session.startedAt!).toLocaleTimeString()}
                    </p>
                  </div>
                  <AlertDialog open={showDiscardSessionDialog} onOpenChange={setShowDiscardSessionDialog}>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        aria-label="Discard workout"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Discard this workout?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will clear the current in-progress workout and remove the resume prompt.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDiscardSession}>Discard workout</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <Button
                  onClick={() => router.push(`/workout/session?routineId=${session.routineId}`)}
                  className="w-full"
                  size="lg"
                >
                  Resume Workout
                </Button>
              </CardContent>
            </Card>
          )}

          {workoutForDate ? (
            <Card className="p-4 bg-green-500/5 border-green-500/20 border-2">
              <div className="flex items-start gap-3 mb-3">
                <div className="mt-1 text-green-600">
                  <Check className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-green-600 uppercase mb-1">Completed</div>
                  <div className="text-lg font-bold">{workoutForDate.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {workoutForDate.stats.totalVolume.toLocaleString()} lbs · {workoutForDate.stats.completedSets} sets
                    · {Math.floor(workoutForDate.duration / 60)}m
                  </div>
                </div>
              </div>
              <Button onClick={() => router.push(`/history/${workoutForDate.id}`)} className="w-full" variant="outline">
                Review Workout
              </Button>
            </Card>
          ) : !session && isRestDay ? (
            <Card className="p-4 bg-muted/30 border-muted">
              <div className="flex items-start gap-3 mb-3">
                <div className="mt-1 text-muted-foreground">
                  <Moon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Rest Day</div>
                  <div className="text-lg font-bold">Recovery Time</div>
                  <div className="text-xs text-muted-foreground">Rest day</div>
                </div>
              </div>
              <Dialog open={isAddWorkoutOpen} onOpenChange={setIsAddWorkoutOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full bg-transparent">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Workout Instead
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Select Workout</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2 mt-4">
                    {routines.map((routine) => (
                      <Button
                        key={routine.id}
                        variant="outline"
                        className="w-full justify-start h-auto py-3 bg-transparent"
                        onClick={() => handleAddWorkout(routine)}
                      >
                        <div className="text-left">
                          <div className="font-semibold">{routine.name}</div>
                          <div className="text-xs text-muted-foreground">{routine.exercises.length} exercises</div>
                        </div>
                      </Button>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            </Card>
          ) : !session && scheduledWorkout ? (
            <Card
              className="relative overflow-hidden rounded-3xl border border-white/10 py-0 gap-0 backdrop-blur-xl"
              style={{
                background:
                  "linear-gradient(135deg, rgba(255, 87, 51, 0.25) 0%, rgba(255, 60, 30, 0.15) 50%, rgba(200, 40, 20, 0.2) 100%)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
              }}
            >
              <CardContent className="relative p-5">
                <Dialog open={isAddWorkoutOpen} onOpenChange={setIsAddWorkoutOpen}>
                  <DialogTrigger asChild>
                    <button
                      className="absolute top-5 right-5 w-9 h-9 rounded-xl flex items-center justify-center"
                      aria-label="Edit scheduled workout"
                      title="Edit scheduled workout"
                      style={{
                        background: "rgba(0, 0, 0, 0.3)",
                        backdropFilter: "blur(10px)",
                      }}
                    >
                      <Edit size={16} strokeWidth={2} style={{ color: "rgba(255, 255, 255, 0.7)" }} />
                    </button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Select Workout</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2 mt-4">
                      {routines.map((routine) => (
                        <Button
                          key={routine.id}
                          variant="outline"
                          className="w-full justify-start h-auto py-3 bg-transparent"
                          onClick={() => handleAddWorkout(routine)}
                        >
                          <div className="text-left">
                            <div className="font-semibold">{routine.name}</div>
                            <div className="text-xs text-muted-foreground">{routine.exercises.length} exercises</div>
                          </div>
                        </Button>
                      ))}
                      <Button
                        variant="ghost"
                        className="w-full justify-start h-auto py-3 text-muted-foreground"
                        onClick={handleSetRestDay}
                      >
                        <Moon className="w-4 h-4 mr-2" />
                        <div className="text-left">
                          <div className="font-semibold">Rest Day</div>
                          <div className="text-xs">Mark as recovery day</div>
                        </div>
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <div className="text-white/40 mb-3 tracking-wider" style={{ fontSize: "10px", fontWeight: 600 }}>
                  {isFuture() ? "SCHEDULED" : isToday() ? "SCHEDULED FOR TODAY" : "MISSED"}
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="relative">
                    <svg
                      width="44"
                      height="44"
                      className="absolute -left-3 -top-3"
                      style={{ transform: "rotate(-90deg)" }}
                      aria-hidden="true"
                    >
                      <circle cx="22" cy="22" r="20" fill="none" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="2" />
                      <circle
                        cx="22"
                        cy="22"
                        r="20"
                        fill="none"
                        stroke="rgb(255, 87, 51)"
                        strokeWidth="2"
                        strokeDasharray={`${scheduledProgress * 126} 126`}
                        strokeLinecap="round"
                        className="kova-ring-pulse"
                        style={{ filter: "drop-shadow(0 0 4px rgba(255, 87, 51, 0.4))" }}
                      />
                    </svg>
                    <Play size={20} strokeWidth={2.5} style={{ color: "rgba(255, 255, 255, 0.7)" }} />
                  </div>
                  <div className="flex-1">
                    <h2
                      className="text-white/95 mb-0.5"
                      style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.01em" }}
                    >
                      {scheduledWorkout.name}
                    </h2>
                    <p className="text-white/50" style={{ fontSize: "13px" }}>
                      {scheduledWorkout.exercises?.length || 0} exercises
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push("/schedule")}
                    aria-label="Edit schedule"
                    title="Edit schedule"
                  >
                    <Calendar size={18} strokeWidth={2} style={{ color: "rgba(255, 255, 255, 0.5)" }} />
                  </button>
                  <button type="button" onClick={handleRemoveWorkout} aria-label="Clear scheduled workout">
                    <X size={18} strokeWidth={2} style={{ color: "rgba(255, 255, 255, 0.5)" }} />
                  </button>
                </div>

                <button
                  className="w-full rounded-2xl py-3.5 transition-all duration-200 active:scale-[0.98]"
                  style={{
                    background: "linear-gradient(135deg, rgb(230, 100, 80) 0%, rgb(200, 80, 65) 100%)",
                    boxShadow: "0 4px 12px rgba(230, 100, 80, 0.28), 0 0 18px rgba(255, 87, 51, 0.12)",
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.boxShadow =
                      "0 6px 16px rgba(230, 100, 80, 0.35), 0 0 24px rgba(255, 87, 51, 0.2)"
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.boxShadow =
                      "0 4px 12px rgba(230, 100, 80, 0.28), 0 0 18px rgba(255, 87, 51, 0.12)"
                  }}
                  onClick={() => handleStartWorkout(scheduledWorkout.id)}
                >
                  <span className="text-white" style={{ fontSize: "15px", fontWeight: 600 }}>
                    {isToday() ? "Start Workout" : "View Workout"}
                  </span>
                </button>
              </CardContent>
            </Card>
          ) : !session ? (
            <Card className="p-4 bg-muted/30 border-dashed border-2 border-muted">
              <div className="text-center py-4">
                <div className="text-muted-foreground mb-4">Rest day</div>
                <Dialog open={isAddWorkoutOpen} onOpenChange={setIsAddWorkoutOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Workout
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Select Workout</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2 mt-4">
                      {routines.map((routine) => (
                        <Button
                          key={routine.id}
                          variant="outline"
                          className="w-full justify-start h-auto py-3 bg-transparent"
                          onClick={() => handleAddWorkout(routine)}
                        >
                          <div className="text-left">
                            <div className="font-semibold">{routine.name}</div>
                            <div className="text-xs text-muted-foreground">{routine.exercises.length} exercises</div>
                          </div>
                        </Button>
                      ))}
                      <Button
                        variant="ghost"
                        className="w-full justify-start h-auto py-3 text-muted-foreground"
                        onClick={handleSetRestDay}
                      >
                        <Moon className="w-4 h-4 mr-2" />
                        <div className="text-left">
                          <div className="font-semibold">Rest Day</div>
                          <div className="text-xs">Mark as recovery day</div>
                        </div>
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </Card>
          ) : null}
        </section>

        {todayPRs.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white/40 tracking-wider" style={{ fontSize: "10px", fontWeight: 600 }}>
                PERSONAL RECORDS
              </h2>
              {todayPRs.length > 4 && (
                <button
                  className="text-white/50"
                  style={{ fontSize: "12px", fontWeight: 500 }}
                  onClick={() => setShowAllPrs((prev) => !prev)}
                >
                  {showAllPrs ? "Hide PRs" : "More PRs"}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {todayPRs.slice(0, showAllPrs ? todayPRs.length : 4).map((pr) => {
                const chartData = pr.chartData || []
                const maxValue = chartData.length > 0 ? Math.max(...chartData) : 1
                const minValue = chartData.length > 0 ? Math.min(...chartData) : 0
                const range = maxValue - minValue || 1
                const chartId = pr.name.replace(/\s+/g, "-")
                const points = chartData.map((value, index) => {
                  const x = (index / Math.max(chartData.length - 1, 1)) * 100
                  const y = 80 - ((value - minValue) / range) * 60
                  return `${x},${y}`
                })
                const linePath = points.length > 0 ? `M ${points.join(" L ")}` : ""
                const areaPath =
                  points.length > 0 ? `M 0,80 ${points.map((p) => `L ${p}`).join(" ")} L 100,80 Z` : ""

                return (
                  <div key={pr.name} className="aspect-square">
                    <div
                      className="rounded-3xl p-4 backdrop-blur-xl relative overflow-hidden h-full cursor-pointer border border-white/10"
                      style={{
                        background: "linear-gradient(135deg, rgba(30, 30, 35, 0.8) 0%, rgba(20, 20, 25, 0.9) 100%)",
                        boxShadow: "0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
                      }}
                      onClick={() => pr.workoutId && router.push(`/history/${pr.workoutId}`)}
                    >
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: "radial-gradient(circle at top right, rgba(255, 87, 51, 0.08) 0%, transparent 60%)",
                          opacity: pr.trendPct && pr.trendPct > 0 ? 1 : 0,
                        }}
                      />

                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-white/45" style={{ fontSize: "11px", fontWeight: 500 }}>
                            {pr.name}
                          </div>
                          {pr.trendPct !== null && pr.trendPct !== 0 && (
                            <div
                              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md"
                              style={{
                                background:
                                  pr.trendPct > 0 ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
                              }}
                            >
                              <ArrowUpRight
                                size={10}
                                strokeWidth={2.5}
                                style={{
                                  color: pr.trendPct > 0 ? "rgba(34, 197, 94, 0.85)" : "rgba(239, 68, 68, 0.85)",
                                  transform: pr.trendPct > 0 ? "none" : "rotate(90deg)",
                                }}
                              />
                              <span
                                style={{
                                  fontSize: "9px",
                                  fontWeight: 600,
                                  color: pr.trendPct > 0 ? "rgba(34, 197, 94, 0.85)" : "rgba(239, 68, 68, 0.85)",
                                }}
                              >
                                {Math.abs(pr.trendPct)}%
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="mb-3">
                          <div className="flex items-baseline gap-2">
                            <div
                              className="text-white/95"
                              style={{ fontSize: "26px", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: "1" }}
                            >
                              {pr.reps}
                            </div>
                            <div className="text-white/45" style={{ fontSize: "12px", fontWeight: 600 }}>
                              reps
                            </div>
                            <X size={12} strokeWidth={2.5} style={{ color: "rgba(255, 87, 51, 0.4)" }} />
                            <div
                              className="text-white/95"
                              style={{ fontSize: "26px", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: "1" }}
                            >
                              {pr.weight}
                            </div>
                            <div className="text-white/45" style={{ fontSize: "12px", fontWeight: 600 }}>
                              lbs
                            </div>
                          </div>
                        </div>

                        {pr.achievedAt && (
                          <div className="text-white/40" style={{ fontSize: "10px", lineHeight: "1.4" }}>
                            {getRelativeDate(pr.achievedAt)}
                          </div>
                        )}
                      </div>

                      <div
                        className="absolute bottom-0 left-0 right-0 pointer-events-none"
                        style={{
                          height: "80px",
                          maskImage: "linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 100%)",
                          WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 100%)",
                        }}
                      >
                        <svg
                          width="100%"
                          height="100%"
                          viewBox="0 0 100 80"
                          preserveAspectRatio="none"
                          style={{
                            opacity: 0.5,
                          }}
                        >
                          <defs>
                            <linearGradient id={`gradient-${chartId}`} x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor="rgb(100, 100, 110)" stopOpacity="0.6" />
                              <stop offset="100%" stopColor="rgb(60, 60, 70)" stopOpacity="0.2" />
                            </linearGradient>
                          </defs>
                          <path d={areaPath} fill={`url(#gradient-${chartId})`} />
                          <path
                            d={linePath}
                            fill="none"
                            stroke="rgba(140, 140, 150, 0.8)"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {weightChartData.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-white/40 tracking-wider" style={{ fontSize: "10px", fontWeight: 600 }}>
                BODY WEIGHT
              </h2>
              <div className="text-white/45" style={{ fontSize: "11px", fontWeight: 500 }}>
                Last 30 days
              </div>
            </div>
            <div
              className="rounded-3xl p-5 backdrop-blur-xl relative overflow-hidden border border-white/10"
              style={{
                background: "linear-gradient(135deg, rgba(30, 30, 35, 0.8) 0%, rgba(20, 20, 25, 0.9) 100%)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
              }}
            >
              <div className="relative z-10 flex items-baseline justify-between gap-6">
                <div>
                  <div className="text-white/40" style={{ fontSize: "11px", fontWeight: 600 }}>
                    30d ago
                  </div>
                  <div className="flex items-baseline gap-2">
                    <div
                      className="text-white/95"
                      style={{ fontSize: "26px", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: "1" }}
                    >
                      {startWeight?.toFixed(1)}
                    </div>
                    <div className="text-white/45" style={{ fontSize: "11px", fontWeight: 600 }}>
                      lbs
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-white/40" style={{ fontSize: "11px", fontWeight: 600 }}>
                    Now
                  </div>
                  <div className="flex items-baseline gap-2">
                    <div
                      className="text-white/95"
                      style={{ fontSize: "26px", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: "1" }}
                    >
                      {latestWeight?.toFixed(1)}
                    </div>
                    <div className="text-white/45" style={{ fontSize: "11px", fontWeight: 600 }}>
                      lbs
                    </div>
                  </div>
                </div>
              </div>

              {(() => {
                const maxValue = Math.max(...weightChartData)
                const minValue = Math.min(...weightChartData)
                const range = maxValue - minValue || 1
                const points = weightChartData.map((value, index) => {
                  const x = (index / Math.max(weightChartData.length - 1, 1)) * 100
                  const y = 80 - ((value - minValue) / range) * 60
                  return `${x},${y}`
                })
                const linePath = points.length > 0 ? `M ${points.join(" L ")}` : ""
                const areaPath =
                  points.length > 0 ? `M 0,80 ${points.map((p) => `L ${p}`).join(" ")} L 100,80 Z` : ""

                return (
                  <div
                    className="absolute bottom-0 left-0 right-0 pointer-events-none"
                    style={{
                      height: "90px",
                      maskImage: "linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 100%)",
                      WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 100%)",
                    }}
                  >
                    <svg
                      width="100%"
                      height="100%"
                      viewBox="0 0 100 80"
                      preserveAspectRatio="none"
                      style={{
                        opacity: 0.5,
                      }}
                    >
                      <defs>
                        <linearGradient id="gradient-body-weight" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="rgb(100, 100, 110)" stopOpacity="0.6" />
                          <stop offset="100%" stopColor="rgb(60, 60, 70)" stopOpacity="0.2" />
                        </linearGradient>
                      </defs>
                      <path d={areaPath} fill="url(#gradient-body-weight)" />
                      <path
                        d={linePath}
                        fill="none"
                        stroke="rgba(140, 140, 150, 0.8)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )
              })()}
            </div>
          </section>
        )}

      </div>

      {/* Conflict Resolution Dialog */}
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

      {/* Bottom Navigation */}
      <BottomNav />
    </main>
  )
}
