// Day summaries behind Home's month heat calendar.
//
// One entry per day of the visible month: what was logged (or what is planned),
// plus the heat level the cell paints. Everything is derived from the workout
// history and the schedule that Home already loads — no new storage.

import { GROWTH_V2_WEEKLY } from "@/lib/growth-v2-plan"
import { getScheduledWorkoutForDate } from "@/lib/schedule-storage"
import { isSetEligibleForStats } from "@/lib/set-validation"
import { normalizeExerciseName, type CompletedWorkout } from "@/lib/workout-storage"

/** `completed` = logged; `plan` = future with a routine; `fut` = future, nothing scheduled; `empty` = past with nothing logged. */
export type DayStatus = "completed" | "plan" | "fut" | "empty"

/** 0 = nothing logged; 1–4 = volume bands, 4 being the heaviest. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4

export type DaySummary = {
  dateKey: string
  status: DayStatus
  level: HeatLevel
  volume: number
  sets: number
  durationSeconds: number | null
  /** Exercises that beat their own previous session, and how many were trained. */
  beaten: number
  total: number
  routineId: string | null
  routineName: string | null
  workoutId: string | null
}

/** Local-date key (YYYY-MM-DD). Deliberately not `toISOString`, which shifts across midnight in most timezones. */
export function getDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function startOfDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function workoutVolume(workout: CompletedWorkout): number {
  if (typeof workout.stats?.totalVolume === "number") return workout.stats.totalVolume
  return (workout.exercises ?? [])
    .flatMap((exercise) => exercise.sets ?? [])
    .filter((set) => isSetEligibleForStats(set))
    .reduce((sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0), 0)
}

function workoutSets(workout: CompletedWorkout): number {
  if (typeof workout.stats?.completedSets === "number") return workout.stats.completedSets
  return (workout.exercises ?? []).flatMap((e) => e.sets ?? []).filter((set) => isSetEligibleForStats(set)).length
}

function workoutDuration(workout: CompletedWorkout): number | null {
  if (typeof workout.duration === "number") return workout.duration
  if (workout.startedAt && workout.endedAt) {
    return Math.floor((new Date(workout.endedAt).getTime() - new Date(workout.startedAt).getTime()) / 1000)
  }
  return null
}

function exerciseVolume(exercise: CompletedWorkout["exercises"][number]): number {
  return (exercise.sets ?? [])
    .filter((set) => isSetEligibleForStats(set))
    .reduce((sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0), 0)
}

/**
 * How many exercises in this session moved more volume than the last time that
 * same exercise was trained. This is the "3/7 beat" line on a completed day.
 */
function countBeatenExercises(workout: CompletedWorkout, history: CompletedWorkout[]): { beaten: number; total: number } {
  const workoutTime = new Date(workout.date).getTime()
  const earlier = history
    .filter((candidate) => candidate.id !== workout.id && new Date(candidate.date).getTime() < workoutTime)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const exercises = workout.exercises ?? []
  let beaten = 0
  for (const exercise of exercises) {
    const key = normalizeExerciseName(exercise.name)
    const previous = earlier
      .flatMap((candidate) => candidate.exercises ?? [])
      .find((candidate) => normalizeExerciseName(candidate.name) === key)
    if (!previous) continue
    if (exerciseVolume(exercise) > exerciseVolume(previous)) beaten += 1
  }
  return { beaten, total: exercises.length }
}

/**
 * Volume thresholds for the heat bands, taken over the trailing 12 weeks so the
 * scale tracks the shape a user is in now rather than their all-time best.
 *
 * The handoff calls these quintiles, but it only defines four painted bands for
 * logged days (v1–v4) because v0 is reserved for "nothing logged" — so the
 * logged days are split into four, and v4 is the heaviest quarter.
 */
export function computeHeatThresholds(history: CompletedWorkout[], now = new Date()): number[] {
  const cutoff = startOfDay(now).getTime() - 12 * 7 * 24 * 60 * 60 * 1000
  const volumes = history
    .filter((workout) => new Date(workout.date).getTime() >= cutoff)
    .map(workoutVolume)
    .filter((volume) => volume > 0)
    .sort((a, b) => a - b)

  if (volumes.length === 0) return []

  const at = (fraction: number) => volumes[Math.min(volumes.length - 1, Math.floor(volumes.length * fraction))]
  return [at(0.25), at(0.5), at(0.75)]
}

export function heatLevelFor(volume: number, thresholds: number[]): HeatLevel {
  if (volume <= 0) return 0
  // With too little history to rank against, every logged day reads as mid heat
  // rather than pretending to a precision the data does not support.
  if (thresholds.length < 3) return 2
  if (volume <= thresholds[0]) return 1
  if (volume <= thresholds[1]) return 2
  if (volume <= thresholds[2]) return 3
  return 4
}

/**
 * Build one entry per day of `month`'s calendar grid.
 *
 * `resolveRoutineName` maps a scheduled entry onto the routine library the page
 * already resolved, so the calendar and the day panel never disagree about what
 * a given day is.
 */
export function buildDaySummaries({
  month,
  history,
  today = new Date(),
  resolveRoutineName,
}: {
  month: Date
  history: CompletedWorkout[]
  today?: Date
  resolveRoutineName?: (entry: { routineId: string; routineName: string }) => string | null
}): Record<string, DaySummary> {
  const thresholds = computeHeatThresholds(history, today)
  const todayStart = startOfDay(today).getTime()

  const workoutByDay = new Map<string, CompletedWorkout>()
  for (const workout of history) {
    const key = getDateKey(new Date(workout.date))
    const existing = workoutByDay.get(key)
    // More than one session on a day is rare; the heavier one sets the heat.
    if (!existing || workoutVolume(workout) > workoutVolume(existing)) {
      workoutByDay.set(key, workout)
    }
  }

  const summaries: Record<string, DaySummary> = {}
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, monthIndex, day)
    const key = getDateKey(date)
    const workout = workoutByDay.get(key)

    if (workout) {
      const volume = workoutVolume(workout)
      const { beaten, total } = countBeatenExercises(workout, history)
      summaries[key] = {
        dateKey: key,
        status: "completed",
        level: heatLevelFor(volume, thresholds),
        volume,
        sets: workoutSets(workout),
        durationSeconds: workoutDuration(workout),
        beaten,
        total,
        routineId: null,
        routineName: workout.name ?? null,
        workoutId: workout.id ?? null,
      }
      continue
    }

    const manual = getScheduledWorkoutForDate(date)
    const weekly = GROWTH_V2_WEEKLY[date.getDay()] ?? null
    const scheduled = manual !== undefined ? manual : weekly
    const isFuture = date.getTime() >= todayStart

    summaries[key] = {
      dateKey: key,
      status: isFuture ? (scheduled ? "plan" : "fut") : "empty",
      level: 0,
      volume: 0,
      sets: 0,
      durationSeconds: null,
      beaten: 0,
      total: 0,
      routineId: scheduled?.routineId ?? null,
      routineName: scheduled ? resolveRoutineName?.(scheduled) ?? scheduled.routineName : null,
      workoutId: null,
    }
  }

  return summaries
}

/** Monday-first leading blanks for a month grid. */
export function leadingBlankCount(month: Date): number {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1)
  return (firstOfMonth.getDay() + 6) % 7
}

/** Sessions logged and total volume for the month, for the header's summary line. */
export function summariseMonth(summaries: Record<string, DaySummary>): { sessions: number; volume: number } {
  const entries = Object.values(summaries).filter((entry) => entry.status === "completed")
  return {
    sessions: entries.length,
    volume: entries.reduce((sum, entry) => sum + entry.volume, 0),
  }
}
