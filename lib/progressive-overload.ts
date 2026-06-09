import { calculateE1rm } from "@/lib/workout-analytics"

export type StallSetInput = {
  reps: number | null
  weight: number | null
  completed: boolean
}

export type ExerciseSessionInput = {
  workoutId: string
  performedAt: string
  sets: StallSetInput[]
}

export type DeloadRange = {
  start: string
  end: string
}

export type StallDetectionOptions = {
  /** Consecutive non-improving sessions required before flagging a stall. */
  stallSessionThreshold?: number
  /** Relative margin a session must beat the running best by to count as progress. */
  improvementTolerance?: number
  /** Relative drop below the running best that escalates a stall to a regression. */
  regressionThreshold?: number
  /** Sessions older than this are ignored so ancient PRs don't poison the baseline. */
  baselineWindowDays?: number
  /** Sessions inside these ranges (deload weeks) are excluded from the analysis. */
  deloadRanges?: DeloadRange[]
  /** Reference time for the baseline window; defaults to the latest session. */
  now?: Date
}

export type StallMetric = "e1rm" | "reps"

export type StallResult = {
  flag: "STALE" | "REGRESSION"
  tier: 1 | 2
  metric: StallMetric
  stalledSessions: number
  bestValue: number
  bestAt: string
  latestValue: number
  latestAt: string
  sessionsAnalyzed: number
}

const DEFAULT_OPTIONS = {
  stallSessionThreshold: 4,
  improvementTolerance: 0.005,
  regressionThreshold: 0.05,
  baselineWindowDays: 180,
} as const

function isWithinRange(timestamp: number, range: DeloadRange): boolean {
  const start = Date.parse(range.start)
  const end = Date.parse(range.end)
  if (Number.isNaN(start) || Number.isNaN(end)) return false
  return timestamp >= start && timestamp <= end
}

function bestWeightedE1rm(sets: StallSetInput[]): number | null {
  let best: number | null = null
  sets.forEach((set) => {
    if (!set.completed) return
    if (typeof set.reps !== "number" || typeof set.weight !== "number") return
    if (set.reps <= 0 || set.weight <= 0) return
    const value = calculateE1rm(set.weight, set.reps)
    if (best === null || value > best) best = value
  })
  return best
}

function bestReps(sets: StallSetInput[]): number | null {
  let best: number | null = null
  sets.forEach((set) => {
    if (!set.completed) return
    if (typeof set.reps !== "number" || set.reps <= 0) return
    if (best === null || set.reps > best) best = set.reps
  })
  return best
}

type SessionPoint = {
  performedAt: string
  timestamp: number
  value: number
}

/**
 * Detect a progressive-overload stall for a single exercise.
 *
 * A session counts as progress when its best estimated 1RM (Epley) beats the
 * running best of the analyzed window by `improvementTolerance`. When every
 * completed set in the history is unweighted (bodyweight work), best reps per
 * session is used instead. Returns null when the exercise is progressing or
 * there is not enough history to judge.
 */
export function detectProgressStall(
  sessions: ExerciseSessionInput[],
  options: StallDetectionOptions = {}
): StallResult | null {
  const config = { ...DEFAULT_OPTIONS, ...options }
  const deloadRanges = options.deloadRanges ?? []

  const dedupedByWorkout = new Map<string, ExerciseSessionInput>()
  sessions.forEach((session) => {
    const existing = dedupedByWorkout.get(session.workoutId)
    if (!existing) {
      dedupedByWorkout.set(session.workoutId, session)
    } else {
      dedupedByWorkout.set(session.workoutId, {
        ...existing,
        sets: existing.sets.concat(session.sets),
      })
    }
  })

  const ordered = Array.from(dedupedByWorkout.values())
    .map((session) => ({ session, timestamp: Date.parse(session.performedAt) }))
    .filter(({ timestamp }) => !Number.isNaN(timestamp))
    .filter(({ timestamp }) => !deloadRanges.some((range) => isWithinRange(timestamp, range)))
    .sort((a, b) => a.timestamp - b.timestamp)

  if (ordered.length === 0) return null

  const referenceTime = config.now?.getTime() ?? ordered[ordered.length - 1].timestamp
  const windowStart = referenceTime - config.baselineWindowDays * 24 * 60 * 60 * 1000
  const windowed = ordered.filter(({ timestamp }) => timestamp >= windowStart)

  const hasWeightedHistory = windowed.some(({ session }) => bestWeightedE1rm(session.sets) !== null)
  const metric: StallMetric = hasWeightedHistory ? "e1rm" : "reps"

  const points: SessionPoint[] = []
  windowed.forEach(({ session, timestamp }) => {
    const value = metric === "e1rm" ? bestWeightedE1rm(session.sets) : bestReps(session.sets)
    if (value === null) return
    points.push({ performedAt: session.performedAt, timestamp, value })
  })

  if (points.length < config.stallSessionThreshold + 1) return null

  let bestValue = points[0].value
  let bestAt = points[0].performedAt
  let lastImprovementIndex = 0
  points.forEach((point, index) => {
    if (index === 0) return
    if (point.value > bestValue * (1 + config.improvementTolerance)) {
      bestValue = point.value
      bestAt = point.performedAt
      lastImprovementIndex = index
    }
  })

  const stalledSessions = points.length - 1 - lastImprovementIndex
  if (stalledSessions < config.stallSessionThreshold) return null

  const latest = points[points.length - 1]
  const isRegression = latest.value < bestValue * (1 - config.regressionThreshold)

  return {
    flag: isRegression ? "REGRESSION" : "STALE",
    tier: isRegression ? 1 : 2,
    metric,
    stalledSessions,
    bestValue,
    bestAt,
    latestValue: latest.value,
    latestAt: latest.performedAt,
    sessionsAnalyzed: points.length,
  }
}

function formatMetricValue(value: number, metric: StallMetric): string {
  if (metric === "reps") return `${Math.round(value)} reps`
  return `~${Math.round(value)} lb e1RM`
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export type StallAlertContent = {
  flag: StallResult["flag"]
  tier: StallResult["tier"]
  message: string
  action: string
  context: Record<string, unknown>
}

export function buildStallAlertContent(
  exerciseId: string,
  exerciseName: string,
  result: StallResult
): StallAlertContent {
  const best = formatMetricValue(result.bestValue, result.metric)
  const latest = formatMetricValue(result.latestValue, result.metric)

  if (result.flag === "REGRESSION") {
    return {
      flag: result.flag,
      tier: result.tier,
      message: `${exerciseName} is trending down: latest ${latest} vs best ${best} on ${formatDate(result.bestAt)}.`,
      action: "Check recovery and form; repeat the last weight until reps come back before adding load.",
      context: buildContext(exerciseId, result),
    }
  }

  return {
    flag: result.flag,
    tier: result.tier,
    message: `No progression on ${exerciseName} in your last ${result.stalledSessions} sessions (best ${best} on ${formatDate(result.bestAt)}).`,
    action: "Try a small weight bump or +1 rep target next session — or plan a deload if fatigue is high.",
    context: buildContext(exerciseId, result),
  }
}

function buildContext(exerciseId: string, result: StallResult): Record<string, unknown> {
  return {
    source: "progressive_overload_v1",
    exercise_id: exerciseId,
    metric: result.metric,
    stalled_sessions: result.stalledSessions,
    sessions_analyzed: result.sessionsAnalyzed,
    best_value: Number(result.bestValue.toFixed(2)),
    best_at: result.bestAt,
    latest_value: Number(result.latestValue.toFixed(2)),
    latest_at: result.latestAt,
  }
}
