export type TopSetInput = {
  weight: number | null
  reps: number | null
  completed?: boolean
}

export type TopSetContext = {
  weight: number
  reps: number
  /** 1-based position among the qualifying (completed, weighted) sets, in performed order. */
  ordinal: number
  /** Total qualifying sets in the exercise. */
  total: number
  /**
   * True when this set's weight × reps is a strict, unique maximum — i.e. the
   * top set genuinely stands out from the rest. False for straight sets where
   * every set ties, so callers can suppress an arbitrary, misleading "set N"
   * label.
   */
  standsOut: boolean
}

/**
 * The top set of an exercise: the completed working set with the highest
 * weight × reps. Returns the set's position among the qualifying sets and
 * whether it is a unique standout (as opposed to straight sets, where the
 * "top" set is arbitrary because every set is identical).
 *
 * A set qualifies only when it is completed and has both positive weight and
 * positive reps — matching how the home screen's "to beat" hints are computed.
 */
export function topSetWithContext(sets: TopSetInput[] | undefined | null): TopSetContext | null {
  if (!sets) return null

  let total = 0
  let best: { weight: number; reps: number; product: number; ordinal: number } | null = null
  let tiedAtBest = false

  for (const set of sets) {
    const weight = set?.weight ?? 0
    const reps = set?.reps ?? 0
    if (!set?.completed || weight <= 0 || reps <= 0) continue

    total += 1
    const product = weight * reps
    if (!best || product > best.product) {
      best = { weight, reps, product, ordinal: total }
      tiedAtBest = false
    } else if (product === best.product) {
      tiedAtBest = true
    }
  }

  if (!best) return null

  return {
    weight: best.weight,
    reps: best.reps,
    ordinal: best.ordinal,
    total,
    standsOut: !tiedAtBest,
  }
}
