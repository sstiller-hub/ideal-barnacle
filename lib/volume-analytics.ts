import { isSetEligibleForStats } from "@/lib/set-validation"
import { deriveWorkoutType } from "@/lib/workout-type"
import type { WorkoutType } from "@/lib/workout-type"

export type TimeRange = "4W" | "8W" | "3M" | "6M" | "1Y" | "All"
export type Aggregation = "session" | "week" | "month"
export type WorkoutTypeFilter = "All" | "Upper" | "Lower"

export type VolumeDataPoint = {
  date: string
  volume: number
  workoutId?: string
  workoutName?: string
  sessionCount?: number
  workoutIds?: string[]
}

export type AnnotationTag = {
  kind: "peak" | "dip" | "missed_week"
  label: string
}

export type AnnotatedPoint = VolumeDataPoint & {
  rollingAvg: number | null
  annotation: AnnotationTag | null
}

export const PEAK_THRESHOLD = 1.75
export const DIP_THRESHOLD = 0.6

type MinimalWorkout = {
  id: string
  name: string
  date: string
  exercises: Array<{
    name: string
    sets: Array<{
      reps: number | null
      weight: number | null
      completed: boolean
      validationFlags?: string[]
      isOutlier?: boolean
      isIncomplete?: boolean
    }>
  }>
}

export function filterByTimeRange<T extends MinimalWorkout>(history: T[], range: TimeRange): T[] {
  if (range === "All") return history
  const offsets: Record<Exclude<TimeRange, "All">, number> = {
    "4W": 28,
    "8W": 56,
    "3M": 91,
    "6M": 182,
    "1Y": 365,
  }
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - offsets[range])
  cutoff.setHours(0, 0, 0, 0)
  return history.filter((w) => new Date(w.date).getTime() >= cutoff.getTime())
}

export function filterByWorkoutType<T extends MinimalWorkout>(history: T[], filter: WorkoutTypeFilter): T[] {
  if (filter === "All") return history
  return history.filter((w) => {
    const type: WorkoutType = deriveWorkoutType(w.name)
    return type === filter
  })
}

export function aggregateToSessions(history: MinimalWorkout[], exerciseName?: string): VolumeDataPoint[] {
  const points: VolumeDataPoint[] = []
  const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  for (const workout of sorted) {
    let volume = 0
    if (exerciseName) {
      const ex = workout.exercises.find((e) => e.name === exerciseName)
      if (!ex) continue
      volume = ex.sets
        .filter((s) => isSetEligibleForStats(s))
        .reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0)
      if (volume <= 0) continue
    } else {
      for (const ex of workout.exercises) {
        volume += ex.sets
          .filter((s) => isSetEligibleForStats(s))
          .reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0)
      }
      if (volume <= 0) continue
    }

    points.push({
      date: workout.date,
      volume,
      workoutId: workout.id,
      workoutName: workout.name,
    })
  }

  return points
}

function getMondayOfWeek(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

export function aggregateToWeeks(sessions: VolumeDataPoint[], bounded: boolean): VolumeDataPoint[] {
  const buckets = new Map<string, VolumeDataPoint>()

  for (const s of sessions) {
    const weekKey = getMondayOfWeek(new Date(s.date))
    const existing = buckets.get(weekKey)
    if (existing) {
      existing.volume += s.volume
      existing.sessionCount = (existing.sessionCount ?? 0) + 1
      existing.workoutIds = [...(existing.workoutIds ?? []), ...(s.workoutId ? [s.workoutId] : [])]
    } else {
      buckets.set(weekKey, {
        date: weekKey,
        volume: s.volume,
        sessionCount: 1,
        workoutIds: s.workoutId ? [s.workoutId] : [],
      })
    }
  }

  if (bounded && sessions.length > 0) {
    const firstDate = new Date(sessions[0].date)
    const lastDate = new Date(sessions[sessions.length - 1].date)
    const current = new Date(getMondayOfWeek(firstDate))
    const end = new Date(getMondayOfWeek(lastDate))

    while (current <= end) {
      const key = current.toISOString().slice(0, 10)
      if (!buckets.has(key)) {
        buckets.set(key, { date: key, volume: 0, sessionCount: 0, workoutIds: [] })
      }
      current.setDate(current.getDate() + 7)
    }
  }

  return Array.from(buckets.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

export function aggregateToMonths(sessions: VolumeDataPoint[], bounded: boolean): VolumeDataPoint[] {
  const buckets = new Map<string, VolumeDataPoint>()

  for (const s of sessions) {
    const monthKey = s.date.slice(0, 7) + "-01"
    const existing = buckets.get(monthKey)
    if (existing) {
      existing.volume += s.volume
      existing.sessionCount = (existing.sessionCount ?? 0) + 1
      existing.workoutIds = [...(existing.workoutIds ?? []), ...(s.workoutId ? [s.workoutId] : [])]
    } else {
      buckets.set(monthKey, {
        date: monthKey,
        volume: s.volume,
        sessionCount: 1,
        workoutIds: s.workoutId ? [s.workoutId] : [],
      })
    }
  }

  if (bounded && sessions.length > 0) {
    const firstMonth = sessions[0].date.slice(0, 7)
    const lastMonth = sessions[sessions.length - 1].date.slice(0, 7)
    const [fy, fm] = firstMonth.split("-").map(Number)
    const [ly, lm] = lastMonth.split("-").map(Number)
    let year = fy
    let month = fm
    while (year < ly || (year === ly && month <= lm)) {
      const key = `${year}-${String(month).padStart(2, "0")}-01`
      if (!buckets.has(key)) {
        buckets.set(key, { date: key, volume: 0, sessionCount: 0, workoutIds: [] })
      }
      month++
      if (month > 12) { month = 1; year++ }
    }
  }

  return Array.from(buckets.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

export function computeRollingAvg(points: VolumeDataPoint[], aggregation: Aggregation): (number | null)[] {
  if (points.length === 0) return []

  return points.map((point, i) => {
    if (i === 0) return null

    if (aggregation === "session") {
      // 28-day calendar lookback
      const cutoff = new Date(point.date)
      cutoff.setDate(cutoff.getDate() - 28)
      const window = points.slice(0, i).filter((p) => new Date(p.date).getTime() >= cutoff.getTime())
      if (window.length < 2) return null
      return window.reduce((sum, p) => sum + p.volume, 0) / window.length
    } else if (aggregation === "week") {
      // Rolling 4 prior buckets
      const window = points.slice(Math.max(0, i - 4), i)
      if (window.length < 2) return null
      return window.reduce((sum, p) => sum + p.volume, 0) / window.length
    } else {
      // Rolling 3 prior month buckets
      const window = points.slice(Math.max(0, i - 3), i)
      if (window.length < 2) return null
      return window.reduce((sum, p) => sum + p.volume, 0) / window.length
    }
  })
}

export function detectAnnotations(
  points: VolumeDataPoint[],
  rollingAvgs: (number | null)[],
  aggregation: Aggregation
): (AnnotationTag | null)[] {
  return points.map((point, i) => {
    const avg = rollingAvgs[i]

    if (aggregation === "week" && point.sessionCount === 0) {
      return { kind: "missed_week", label: "Missed week" }
    }

    if (avg === null || avg <= 0) return null

    if (point.volume > avg * PEAK_THRESHOLD) {
      return {
        kind: "peak",
        label: `${(point.volume / avg).toFixed(1)}x 4-week avg`,
      }
    }

    if (point.volume > 0 && point.volume < avg * DIP_THRESHOLD) {
      return {
        kind: "dip",
        label: `${Math.round((1 - point.volume / avg) * 100)}% below avg`,
      }
    }

    return null
  })
}

export function buildAnnotatedSeries(points: VolumeDataPoint[], aggregation: Aggregation): AnnotatedPoint[] {
  const rollingAvgs = computeRollingAvg(points, aggregation)
  const annotations = detectAnnotations(points, rollingAvgs, aggregation)
  return points.map((p, i) => ({
    ...p,
    rollingAvg: rollingAvgs[i],
    annotation: annotations[i],
  }))
}

export function getVolumeSeriesForExercise(
  history: MinimalWorkout[],
  exerciseName: string,
  range: TimeRange,
  aggregation: Aggregation,
  typeFilter: WorkoutTypeFilter
): AnnotatedPoint[] {
  const filtered = filterByWorkoutType(filterByTimeRange(history, range), typeFilter)
  const sessions = aggregateToSessions(filtered, exerciseName)
  const bounded = range !== "All"

  let points: VolumeDataPoint[]
  if (aggregation === "week") {
    points = aggregateToWeeks(sessions, bounded)
  } else if (aggregation === "month") {
    points = aggregateToMonths(sessions, bounded)
  } else {
    points = sessions
  }

  return buildAnnotatedSeries(points, aggregation)
}

export function getVolumeSeriesGlobal(
  history: MinimalWorkout[],
  range: TimeRange,
  aggregation: Aggregation,
  typeFilter: WorkoutTypeFilter
): AnnotatedPoint[] {
  const filtered = filterByWorkoutType(filterByTimeRange(history, range), typeFilter)
  const sessions = aggregateToSessions(filtered)
  const bounded = range !== "All"

  let points: VolumeDataPoint[]
  if (aggregation === "week") {
    points = aggregateToWeeks(sessions, bounded)
  } else if (aggregation === "month") {
    points = aggregateToMonths(sessions, bounded)
  } else {
    points = sessions
  }

  return buildAnnotatedSeries(points, aggregation)
}
