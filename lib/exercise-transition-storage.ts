// Learns how long the user actually takes to move from one exercise to the
// next — from checking off the last set of exercise A to logging the first set
// of whatever they do next — so the rest timer after A's final set can be the
// user's real transition time instead of the static per-exercise rest.
//
// Exercise keys are expected to be normalized names (the caller normalizes),
// so the stats carry across sessions and routines.

const SAMPLES_KEY = "exercise_transitions_v1"
const PENDING_KEY = "exercise_transition_pending_v1"
const MAX_SAMPLES = 500
const PRUNE_DAYS = 180

/** Gaps longer than this are a bathroom break or a closed app, not a transition. */
export const MAX_TRANSITION_SECONDS = 15 * 60
/** Anything shorter is a mis-tap or back-filling sets after the fact. */
export const MIN_TRANSITION_SECONDS = 10
/** How many samples a pair needs before its average replaces the static rest. */
export const MIN_SAMPLES_FOR_PREDICTION = 2

export interface TransitionSample {
  from: string
  /** The exercise whose first set was actually logged next. */
  to: string
  /** The exercise that came next in the routine order when `from` finished. */
  planned: string
  seconds: number
  date: string // ISO timestamp
}

export interface PendingTransition {
  workoutId: string
  from: string
  planned: string
  completedAt: number // epoch ms
}

/**
 * Average transition time out of `from`, toward any of `candidates`.
 *
 * A sample counts toward a candidate if that candidate was where the user
 * went (`to`) or where the routine said they'd go (`planned`). So when the user
 * skips from A past B to C, that gap informs both A→B and A→C, and a timer
 * re-targeted mid-rest to C averages the samples for both. Each sample is
 * counted once even when it matches several candidates.
 */
export function predictTransitionSeconds(
  samples: TransitionSample[],
  from: string,
  candidates: string[],
  minSamples = MIN_SAMPLES_FOR_PREDICTION,
): number | null {
  const wanted = new Set(candidates.filter(Boolean))
  if (!from || wanted.size === 0) return null
  const matched = samples.filter(
    (s) => s.from === from && (wanted.has(s.to) || wanted.has(s.planned)),
  )
  if (matched.length < minSamples) return null
  const total = matched.reduce((sum, s) => sum + s.seconds, 0)
  return Math.round(total / matched.length)
}

/** Turns a pending transition plus the moment the next set was logged into a sample, or null if it isn't one. */
export function buildTransitionSample(
  pending: PendingTransition,
  to: string,
  loggedAt: number,
): TransitionSample | null {
  if (!to || to === pending.from) return null
  const seconds = Math.round((loggedAt - pending.completedAt) / 1000)
  if (seconds < MIN_TRANSITION_SECONDS || seconds > MAX_TRANSITION_SECONDS) return null
  return {
    from: pending.from,
    to,
    planned: pending.planned || to,
    seconds,
    date: new Date(loggedAt).toISOString(),
  }
}

// ── Storage ──────────────────────────────────────────────────────────────────

export function loadTransitionSamples(): TransitionSample[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(SAMPLES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(isSample) : []
  } catch {
    return []
  }
}

export function recordTransitionSample(sample: TransitionSample): void {
  if (typeof window === "undefined") return
  const cutoff = Date.now() - PRUNE_DAYS * 24 * 60 * 60 * 1000
  const next = [...loadTransitionSamples(), sample]
    .filter((s) => new Date(s.date).getTime() >= cutoff)
    .slice(-MAX_SAMPLES)
  try {
    localStorage.setItem(SAMPLES_KEY, JSON.stringify(next))
  } catch {
    // storage full or blocked — learning is best-effort
  }
}

export function loadPendingTransition(): PendingTransition | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed.workoutId === "string" &&
      typeof parsed.from === "string" &&
      typeof parsed.completedAt === "number"
    ) {
      return { planned: "", ...parsed }
    }
    return null
  } catch {
    return null
  }
}

export function savePendingTransition(pending: PendingTransition | null): void {
  if (typeof window === "undefined") return
  try {
    if (pending) localStorage.setItem(PENDING_KEY, JSON.stringify(pending))
    else localStorage.removeItem(PENDING_KEY)
  } catch {
    // ignore
  }
}

function isSample(value: any): value is TransitionSample {
  return (
    value &&
    typeof value.from === "string" &&
    typeof value.to === "string" &&
    typeof value.seconds === "number" &&
    Number.isFinite(value.seconds) &&
    typeof value.date === "string"
  )
}
