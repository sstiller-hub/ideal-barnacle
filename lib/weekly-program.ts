import { getRoutines, type WorkoutRoutine } from "./routine-storage"
import { getWorkoutHistory } from "./workout-storage"

export type WeeklyProgram = {
  weekNumber: number
  dayIndex: number
  daysThisWeek: number
  workoutsCompleted: number
  nextWorkout: WorkoutRoutine
  scheduledDay?: string
  isScheduledToday: boolean
}

export function getWeeklyProgram(): WeeklyProgram | null {
  const routines = getRoutines()
  if (routines.length === 0) return null

  const history = getWorkoutHistory()

  const firstWorkoutDate = history.length > 0 ? new Date(history[history.length - 1].date) : new Date()

  const today = new Date()
  const daysSinceStart = Math.floor((today.getTime() - firstWorkoutDate.getTime()) / (1000 * 60 * 60 * 24))
  const weekNumber = Math.floor(daysSinceStart / 7) + 1

  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay())
  weekStart.setHours(0, 0, 0, 0)

  const workoutsThisWeek = history.filter((w) => {
    const workoutDate = new Date(w.date)
    return workoutDate >= weekStart && workoutDate <= today
  })

  // Use simple rotation: if last workout was routine[i], next is routine[i+1]
  let nextRoutine = routines[0]

  if (history.length > 0) {
    const lastWorkout = history[0]
    const lastRoutineIndex = routines.findIndex((r) => r.name === lastWorkout.name)

    if (lastRoutineIndex >= 0) {
      const nextIndex = (lastRoutineIndex + 1) % routines.length
      nextRoutine = routines[nextIndex]
    }
  }

  // In a real app, this would come from a schedule configuration
  const dayOfWeek = today.getDay()
  const isRestDay = dayOfWeek === 0 // Sunday as rest day for example

  let scheduledDay: string | undefined
  let isScheduledToday = !isRestDay

  // If last workout was today, schedule next for tomorrow
  if (history.length > 0) {
    const lastWorkoutDate = new Date(history[0].date)
    const isLastWorkoutToday =
      lastWorkoutDate.getDate() === today.getDate() &&
      lastWorkoutDate.getMonth() === today.getMonth() &&
      lastWorkoutDate.getFullYear() === today.getFullYear()

    if (isLastWorkoutToday) {
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      scheduledDay = tomorrow.toLocaleDateString("en-US", { weekday: "long" })
      isScheduledToday = false
    }
  }

  const daysThisWeek = 3 // Default to 3 workout days per week
  const dayIndex = (workoutsThisWeek.length % daysThisWeek) + 1

  return {
    weekNumber,
    dayIndex,
    daysThisWeek,
    workoutsCompleted: workoutsThisWeek.length,
    nextWorkout: nextRoutine,
    scheduledDay,
    isScheduledToday,
  }
}
