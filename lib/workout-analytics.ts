export type CompletedSetRecord = {
  reps: number | null
  weight: number | null
  completed: boolean
  setIndex?: number
  exerciseId: string
  exerciseName: string
  workoutId: string
}

export type BestSetResult = {
  value: number
  set: CompletedSetRecord
}

export function isCompletedSet(set: CompletedSetRecord): boolean {
  if (!set.completed) return false
  if (typeof set.reps !== "number" || typeof set.weight !== "number") return false
  if (set.reps <= 0 || set.weight <= 0) return false
  return true
}

export function calculateSetVolume(reps: number, weight: number): number {
  return reps * weight
}

export function calculateE1rm(weight: number, reps: number): number {
  return weight * (1 + reps / 30)
}

export function computeWorkoutVolume(sets: CompletedSetRecord[]): number {
  return sets.reduce((sum, set) => {
    if (!isCompletedSet(set)) return sum
    return sum + calculateSetVolume(set.reps as number, set.weight as number)
  }, 0)
}

export function computeExerciseSessionVolumes(
  sets: CompletedSetRecord[]
): Map<string, number> {
  const volumes = new Map<string, number>()
  sets.forEach((set) => {
    if (!isCompletedSet(set)) return
    const current = volumes.get(set.exerciseId) ?? 0
    volumes.set(
      set.exerciseId,
      current + calculateSetVolume(set.reps as number, set.weight as number)
    )
  })
  return volumes
}

export function computeBestE1rmSet(
  sets: CompletedSetRecord[]
): BestSetResult | null {
  let best: BestSetResult | null = null
  sets.forEach((set) => {
    if (!isCompletedSet(set)) return
    const value = calculateE1rm(set.weight as number, set.reps as number)
    if (!best || value > best.value) {
      best = { value, set }
    }
  })
  return best
}

export function computeWeekOverWeek(
  currentVolume: number,
  previousVolume: number
): { delta: number; percent: number } {
  const delta = currentVolume - previousVolume
  const percent = previousVolume > 0 ? (delta / previousVolume) * 100 : 0
  return { delta, percent }
}

export function isNewBest(currentValue: number, previousValue: number | null): boolean {
  if (previousValue === null || Number.isNaN(previousValue)) return true
  return currentValue > previousValue
}

export type PastWorkoutTiming = {
  duration?: number | null
  durationUnit?: "seconds" | "minutes" | null
  stats?: { completedSets?: number } | null
}

/** Average seconds spent per completed set across past workouts, or null if there's no usable timing data. */
export function computeAverageSecondsPerSet(workouts: PastWorkoutTiming[]): number | null {
  let totalSeconds = 0
  let totalSets = 0
  for (const workout of workouts) {
    const completedSets = workout.stats?.completedSets ?? 0
    if (completedSets <= 0) continue
    if (typeof workout.duration !== "number" || workout.duration <= 0) continue
    const seconds = workout.durationUnit === "minutes" ? workout.duration * 60 : workout.duration
    totalSeconds += seconds
    totalSets += completedSets
  }
  return totalSets > 0 ? totalSeconds / totalSets : null
}

export type PaceStatus = "fast" | "on_pace" | "slow"

const PACE_FAST_RATIO = 0.85
const PACE_SLOW_RATIO = 1.15

/** Compares a live in-workout pace (seconds/set) against a historical average to flag rushing or dragging. */
export function classifyPace(currentSecondsPerSet: number, averageSecondsPerSet: number): PaceStatus {
  if (currentSecondsPerSet <= averageSecondsPerSet * PACE_FAST_RATIO) return "fast"
  if (currentSecondsPerSet >= averageSecondsPerSet * PACE_SLOW_RATIO) return "slow"
  return "on_pace"
}

export type DatedWorkoutVolume = {
  date: string | Date | null | undefined
  volume: number
}

export type WeeklyPace = {
  currentVolume: number
  currentSessions: number
  previousVolume: number
  previousSessions: number
  delta: number
  percent: number
}

/** Local-midnight Monday that begins the week containing `date`. */
export function getWeekStart(date: Date): Date {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const day = start.getDay()
  const diffToMonday = (day + 6) % 7
  start.setDate(start.getDate() - diffToMonday)
  return start
}

/**
 * Compares this week's training volume against last week's at the *same point
 * in the week* — "vs last week's pace". Both weeks are capped at the end of the
 * reference day, so a partial week-to-date total (e.g. 2 of N sessions done) is
 * measured against last week through the same day rather than against last
 * week's full total. When `reference` is the final day of the week the cutoff
 * lands at the end of the week, so it naturally becomes a full-week comparison.
 *
 * Each workout is counted in a range that is start-inclusive and end-exclusive.
 */
export function computeWeeklyPace(
  workouts: DatedWorkoutVolume[],
  reference: Date
): WeeklyPace {
  const start = getWeekStart(reference)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)

  const asOf = new Date(reference)
  asOf.setHours(23, 59, 59, 999)
  const currentEnd = asOf < end ? asOf : end

  const previousStart = new Date(start)
  previousStart.setDate(previousStart.getDate() - 7)
  const previousEnd = new Date(asOf)
  previousEnd.setDate(previousEnd.getDate() - 7)

  const statsForRange = (rangeStart: Date, rangeEnd: Date) => {
    let volume = 0
    let sessions = 0
    for (const workout of workouts) {
      if (!workout.date) continue
      const when = new Date(workout.date)
      if (when < rangeStart || when >= rangeEnd) continue
      sessions += 1
      volume += workout.volume
    }
    return { volume, sessions }
  }

  const current = statsForRange(start, currentEnd)
  const previous = statsForRange(previousStart, previousEnd)
  const { delta, percent } = computeWeekOverWeek(current.volume, previous.volume)

  return {
    currentVolume: current.volume,
    currentSessions: current.sessions,
    previousVolume: previous.volume,
    previousSessions: previous.sessions,
    delta,
    percent,
  }
}
