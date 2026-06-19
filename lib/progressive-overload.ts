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

export type StallMetric = "load" | "reps"

export type StallResult = {
  flag: "STALE" | "REGRESSION"
  tier: 1 | 2
  metric: StallMetric
  stalledSessions: number
  bestWeight: number
  bestReps: number
  bestAt: string
  latestWeight: number
  latestReps: number
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

type TopSet = { weight: number; reps: number }

/**
 * The heaviest completed working set of a session, with the best reps achieved
 * at that weight. This is the unit of double progression: you add reps at a
 * weight until the top of your range, then add load and the reps reset down.
 */
function topWorkingSet(sets: StallSetInput[]): TopSet | null {
  let best: TopSet | null = null
  sets.forEach((set) => {
    if (!set.completed) return
    if (typeof set.reps !== "number" || set.reps <= 0) return
    if (typeof set.weight !== "number" || set.weight < 0) return
    if (best === null || set.weight > best.weight || (set.weight === best.weight && set.reps > best.reps)) {
      best = { weight: set.weight, reps: set.reps }
    }
  })
  return best
}

type SessionPoint = {
  performedAt: string
  timestamp: number
  weight: number
  reps: number
}

/**
 * Detect a progressive-overload stall for a single exercise.
 *
 * Progress is judged by double progression on the top working set: a session
 * counts as progress when its top weight beats the running best (by
 * `improvementTolerance`), OR it adds reps at that same weight. Adding load
 * while reps drop is therefore always progress — it never reads as a decline.
 * When every completed set in the history is unweighted (bodyweight work), best
 * reps per session is used instead. A REGRESSION (the working weight actually
 * dropping) is distinguished from a plain STALE (stuck at the same weight
 * without adding reps). Returns null when the exercise is progressing or there
 * is not enough history to judge.
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

  const topSets = windowed.map(({ session, timestamp }) => ({
    timestamp,
    performedAt: session.performedAt,
    top: topWorkingSet(session.sets),
  }))

  const hasWeightedHistory = topSets.some(({ top }) => top !== null && top.weight > 0)
  const metric: StallMetric = hasWeightedHistory ? "load" : "reps"

  const points: SessionPoint[] = []
  topSets.forEach(({ performedAt, timestamp, top }) => {
    if (top === null) return
    points.push({ performedAt, timestamp, weight: top.weight, reps: top.reps })
  })

  if (points.length < config.stallSessionThreshold + 1) return null

  let bestWeight = points[0].weight
  let bestReps = points[0].reps
  let bestAt = points[0].performedAt
  let lastImprovementIndex = 0
  points.forEach((point, index) => {
    if (index === 0) return
    const addedLoad = metric === "load" && point.weight > bestWeight * (1 + config.improvementTolerance)
    // Same working weight (within tolerance) for load lifts; always true for bodyweight.
    const sameWeight = metric === "reps" || point.weight >= bestWeight * (1 - config.improvementTolerance)
    const addedReps = sameWeight && point.reps > bestReps

    if (addedLoad) {
      // New top weight is progress regardless of reps — the user's whole point.
      bestWeight = point.weight
      bestReps = point.reps
      bestAt = point.performedAt
      lastImprovementIndex = index
    } else if (addedReps) {
      // Added a rep at the established weight.
      bestReps = point.reps
      bestAt = point.performedAt
      lastImprovementIndex = index
    }
  })

  const stalledSessions = points.length - 1 - lastImprovementIndex
  if (stalledSessions < config.stallSessionThreshold) return null

  const latest = points[points.length - 1]
  // A regression is the working weight genuinely sliding back, not reps dropping
  // because load went up.
  const regressionValue = metric === "load" ? latest.weight : latest.reps
  const regressionBest = metric === "load" ? bestWeight : bestReps
  const isRegression = regressionValue < regressionBest * (1 - config.regressionThreshold)

  return {
    flag: isRegression ? "REGRESSION" : "STALE",
    tier: isRegression ? 1 : 2,
    metric,
    stalledSessions,
    bestWeight,
    bestReps,
    bestAt,
    latestWeight: latest.weight,
    latestReps: latest.reps,
    latestAt: latest.performedAt,
    sessionsAnalyzed: points.length,
  }
}

function formatTopSet(weight: number, reps: number, metric: StallMetric): string {
  if (metric === "reps") return `${Math.round(reps)} reps`
  return `${Math.round(weight)} lb × ${Math.round(reps)}`
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
  const best = formatTopSet(result.bestWeight, result.bestReps, result.metric)
  const latest = formatTopSet(result.latestWeight, result.latestReps, result.metric)

  if (result.flag === "REGRESSION") {
    return {
      flag: result.flag,
      tier: result.tier,
      message: `${exerciseName} working weight is down: latest ${latest} vs your best ${best} on ${formatDate(result.bestAt)}.`,
      action: "Drop back to your best working weight and rebuild reps before adding load.",
      context: buildContext(exerciseId, result),
    }
  }

  return {
    flag: result.flag,
    tier: result.tier,
    message: `No progression on ${exerciseName} in your last ${result.stalledSessions} sessions — still ${best} since ${formatDate(result.bestAt)}.`,
    action: "Add a rep at this weight, or bump the load and drop reps — either one counts.",
    context: buildContext(exerciseId, result),
  }
}

function buildContext(exerciseId: string, result: StallResult): Record<string, unknown> {
  return {
    source: "progressive_overload_v2",
    exercise_id: exerciseId,
    metric: result.metric,
    stalled_sessions: result.stalledSessions,
    sessions_analyzed: result.sessionsAnalyzed,
    best_weight: Number(result.bestWeight.toFixed(2)),
    best_reps: result.bestReps,
    best_at: result.bestAt,
    latest_weight: Number(result.latestWeight.toFixed(2)),
    latest_reps: result.latestReps,
    latest_at: result.latestAt,
  }
}
