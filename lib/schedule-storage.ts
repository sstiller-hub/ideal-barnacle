// Storage for manually scheduled workouts by date
import { GROWTH_V2_WEEKLY } from "@/lib/growth-v2-plan"

const SCHEDULE_KEY = "workout_schedule"

export type ScheduledWorkout = {
  routineId: string
  routineName: string
}

export type DayOfWeek = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"

type ScheduleMap = Record<string, ScheduledWorkout | null> // key is YYYY-MM-DD, null means rest day

function getDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

let hasLoggedScheduleDebug = false
const DAY_ORDER: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const DAY_TO_INDEX: Record<DayOfWeek, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}
const INDEX_TO_DAY: Record<number, DayOfWeek> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
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
  const entry = schedule[key]
  if (!hasLoggedScheduleDebug && process.env.NODE_ENV !== "production") {
    hasLoggedScheduleDebug = true
    console.log("[schedule] todayKey", key, "weekday", date.getDay(), "entry", entry ?? null)
  }
  return entry // undefined means no manual override, null means rest day
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

export function resetScheduleToGrowthV2FixedDays(daysAhead = 365): void {
  if (typeof window === "undefined") return
  const schedule: ScheduleMap = {}
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let offset = 0; offset < daysAhead; offset += 1) {
    const date = new Date(today)
    date.setDate(today.getDate() + offset)
    const key = getDateKey(date)
    const day = date.getDay()
    schedule[key] = GROWTH_V2_WEEKLY[day] ?? null
  }

  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule))
}

export function getWeeklySchedule(): Record<DayOfWeek, ScheduledWorkout | null> {
  const schedule = getSchedule()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const weekly: Record<DayOfWeek, ScheduledWorkout | null> = {
    Mon: null,
    Tue: null,
    Wed: null,
    Thu: null,
    Fri: null,
    Sat: null,
    Sun: null,
  }

  DAY_ORDER.forEach((dayKey) => {
    const targetDay = DAY_TO_INDEX[dayKey]
    const offset = (targetDay - today.getDay() + 7) % 7
    const date = new Date(today)
    date.setDate(today.getDate() + offset)
    const key = getDateKey(date)
    if (Object.prototype.hasOwnProperty.call(schedule, key)) {
      weekly[dayKey] = schedule[key] ?? null
      return
    }
    weekly[dayKey] = GROWTH_V2_WEEKLY[targetDay] ?? null
  })

  return weekly
}

export function setWeeklySchedule(next: Record<DayOfWeek, ScheduledWorkout | null>): void {
  if (typeof window === "undefined") return
  const schedule: ScheduleMap = {}
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let offset = 0; offset < 365; offset += 1) {
    const date = new Date(today)
    date.setDate(today.getDate() + offset)
    const key = getDateKey(date)
    const dayKey = INDEX_TO_DAY[date.getDay()]
    schedule[key] = next[dayKey] ?? null
  }

  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule))
}
