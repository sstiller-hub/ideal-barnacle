/**
 * Remembers which screen of an active workout the user was last on, so a cold
 * start of the app can put them back there.
 *
 * The PWA manifest's start_url is "/", and iOS/Android drop a backgrounded web
 * app's page out of memory fairly aggressively. When that happens, returning to
 * Akt mid-workout re-launches at the home screen instead of the session screen —
 * the user's place in the active workout is replaced by the home view. The
 * session's own state (current exercise, logged sets, rest timer) survives in
 * localStorage; only the route is lost, so remembering the route is enough to
 * restore the user's place.
 *
 * The breadcrumb is written while the session screen is open and cleared when
 * the user deliberately leaves it (exit button, finishing the workout). That
 * distinction matters: leaving the session to browse other days on the home
 * screen must not bounce the user back into the session on the next cold start,
 * because home is genuinely where they were.
 */

const ACTIVE_WORKOUT_ROUTE_KEY = "aktActiveWorkoutRoute"

export function rememberActiveWorkoutRoute(route: string): void {
  if (typeof window === "undefined") return
  if (!route.startsWith("/workout/session")) return
  try {
    if (localStorage.getItem(ACTIVE_WORKOUT_ROUTE_KEY) === route) return
    localStorage.setItem(ACTIVE_WORKOUT_ROUTE_KEY, route)
  } catch (err) {
    console.warn("[active-workout-route] Failed to persist the active workout route.", err)
  }
}

export function getActiveWorkoutRoute(): string | null {
  if (typeof window === "undefined") return null
  try {
    const stored = localStorage.getItem(ACTIVE_WORKOUT_ROUTE_KEY)
    // Only ever hand back an in-app session route; anything else is stale or
    // tampered-with data and must never be fed to the router.
    if (!stored || !stored.startsWith("/workout/session")) return null
    return stored
  } catch (err) {
    console.warn("[active-workout-route] Failed to read the active workout route.", err)
    return null
  }
}

export function clearActiveWorkoutRoute(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(ACTIVE_WORKOUT_ROUTE_KEY)
  } catch (err) {
    console.warn("[active-workout-route] Failed to clear the active workout route.", err)
  }
}
