/**
 * Simple in-memory rate limiter for Next.js API routes.
 *
 * Each serverless instance has its own counter, so this provides
 * per-instance limiting rather than global limiting. It is still
 * effective against single-client abuse on the same instance and
 * adds no external dependencies.
 */

type RateLimitEntry = {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Prune stale entries every 5 minutes to avoid unbounded memory growth.
let pruneTimer: ReturnType<typeof setTimeout> | null = null
function schedulePrune() {
  if (pruneTimer !== null) return
  pruneTimer = setTimeout(() => {
    pruneTimer = null
    const now = Date.now()
    for (const [key, entry] of store) {
      if (entry.resetAt < now) store.delete(key)
    }
  }, 5 * 60 * 1000)
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

/**
 * Check whether the given key is within the rate limit.
 *
 * @param key        - Unique identifier (e.g. user ID + route).
 * @param limit      - Maximum requests allowed per window.
 * @param windowMs   - Window duration in milliseconds.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  schedulePrune()

  const now = Date.now()
  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true }
  }

  if (entry.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    }
  }

  entry.count += 1
  return { allowed: true }
}
