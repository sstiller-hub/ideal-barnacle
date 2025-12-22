// Storage for manually scheduled workouts by date

const SCHEDULE_KEY = "workout_schedule"

export type ScheduledWorkout = {
  routineId: string
  routineName: string
}

type ScheduleMap = Record<string, ScheduledWorkout | null> // key is YYYY-MM-DD, null means rest day

function getDateKey(date: Date): string {
  return date.toISOString().split("T")[0]
}

export function getSchedule(): ScheduleMap {
  if (typeof window === "undefined") return {}
  const stored = localStorage.getItem(SCHEDULE_KEY)
  if (!stored) return {}
  try {
    return JSON.parse(stored) as ScheduleMap
  } catch {
    return {}
  }
}

export function getScheduledWorkoutForDate(date: Date): ScheduledWorkout | null | undefined {
  const schedule = getSchedule()
  const key = getDateKey(date)
  return schedule[key] // undefined means no manual override, null means rest day
}

export function setScheduledWorkout(date: Date, workout: ScheduledWorkout): void {
  const schedule = getSchedule()
  const key = getDateKey(date)
  schedule[key] = workout
  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule))
}

export function setRestDay(date: Date): void {
  const schedule = getSchedule()
  const key = getDateKey(date)
  schedule[key] = null
  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule))
}

export function removeScheduledWorkout(date: Date): void {
  const schedule = getSchedule()
  const key = getDateKey(date)
  delete schedule[key]
  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule))
}

export function clearSchedule(): void {
  localStorage.removeItem(SCHEDULE_KEY)
}
