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
import { Play, ChevronLeft, ChevronRight, Calendar, Check, Plus, X, Moon, Pencil } from "lucide-react"
import { BottomNav } from "@/components/bottom-nav"
import { GROWTH_V2_ROUTINES } from "@/lib/growth-v2-plan"
import {
  getScheduledWorkoutForDate,
  setScheduledWorkout as persistScheduledWorkout,
  setRestDay,
} from "@/lib/schedule-storage"

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
    loadDataForDate(selectedDate)
  }, [selectedDate])

  useEffect(() => {
    const handleScheduleUpdated = () => {
      loadDataForDate(selectedDate)
    }
    window.addEventListener("schedule:updated", handleScheduleUpdated)
    return () => window.removeEventListener("schedule:updated", handleScheduleUpdated)
  }, [selectedDate])

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

    history.forEach((workout) => {
      workout.exercises.forEach((exercise) => {
        const completedSets = exercise.sets.filter((s: any) => s.completed && s.weight > 0)
        completedSets.forEach((set: any) => {
          const key = exercise.name.toLowerCase()
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

    // Get PRs for exercises in scheduled workout
    const exerciseNames = scheduledRoutine?.exercises.map((e: any) => e.name.toLowerCase()) || []
    const filteredPRs = exerciseNames
      .map((name: string) => prByExerciseName.get(name) || null)
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

  return (
    <main className="min-h-screen bg-background pb-20">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={goToPreviousDay}>
              <ChevronLeft className="w-6 h-6" />
            </Button>
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={goToNextDay}>
              <ChevronRight className="w-6 h-6" />
            </Button>
          </div>

          <div className="flex-1 text-center min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Kova Fit</div>
            <h1 className="text-2xl font-bold leading-tight">{formatDateHeader()}</h1>
            <p className="text-sm text-muted-foreground">
              {selectedDate.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
            </p>
          </div>

          <div className="flex items-center gap-1">
            {!isToday() && (
              <Button variant="outline" size="sm" className="h-10 px-3 bg-transparent" onClick={goToToday}>
                Today
              </Button>
            )}
            <Popover open={showCalendar} onOpenChange={setShowCalendar}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10">
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

      <div className="p-6 space-y-6">
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
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
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
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start gap-3 mb-3">
                  <div className="mt-1 text-muted-foreground">
                    {isFuture() ? <Calendar className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                      {isFuture() ? "Scheduled" : isToday() ? "Scheduled for Today" : "Missed"}
                    </div>
                    <div className="text-lg font-bold">{scheduledWorkout.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {scheduledWorkout.exercises?.length || 0} exercises
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      onClick={() => router.push("/schedule")}
                      aria-label="Edit schedule"
                      title="Edit schedule"
                    >
                      <Calendar className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      onClick={handleRemoveWorkout}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => handleStartWorkout(scheduledWorkout.id)} className="flex-1" size="lg">
                    {isToday() ? "Start Workout" : "View Workout"}
                  </Button>
                  <Dialog open={isAddWorkoutOpen} onOpenChange={setIsAddWorkoutOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="lg" className="w-10 h-10 p-0 bg-transparent">
                        <Pencil className="w-4 h-4" />
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
          <section className="rounded-2xl bg-muted/30 p-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase">Personal Records</h2>
              {todayPRs.length > 4 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => setShowAllPrs((prev) => !prev)}
                >
                  {showAllPrs ? "Hide PRs" : "More PRs"}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {todayPRs.slice(0, showAllPrs ? todayPRs.length : 4).map((pr) => (
                <Card
                  key={pr.name}
                  className="p-2 cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => pr.workoutId && router.push(`/history/${pr.workoutId}`)}
                >
                  <div className="text-[11px] text-muted-foreground mb-1 leading-snug">{pr.name}</div>
                  <div className="text-lg font-bold">{pr.weight > 0 ? `${pr.weight} × ${pr.reps}` : "—"}</div>
                  <div className="text-[11px] text-muted-foreground">lbs</div>
                  {pr.achievedAt && (
                    <div className="text-[11px] text-muted-foreground mt-1 leading-snug">
                      {getRelativeDate(pr.achievedAt)}
                      {pr.workoutName && ` · ${pr.workoutName}`}
                    </div>
                  )}
                </Card>
              ))}
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
