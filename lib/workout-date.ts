// Parsing and formatting for the date strings carried on workouts.
//
// Two shapes reach the UI and they need opposite treatment:
//
//   • `YYYY-MM-DD` — CSV imports and bucket keys (week/month aggregation).
//     `new Date("2025-04-21")` parses as UTC midnight, which renders as the
//     *previous* day anywhere west of Greenwich, so these are built from their
//     parts as a local date instead.
//   • Full ISO timestamps — live sessions (stored at local noon) and the
//     `performed_at` column pulled from Supabase. These are real instants, so
//     `new Date(...)` is right; splitting them on "-" is not, and that is what
//     produced "Invalid Date" on the exercise chart's drill-down card.

/** `YYYY-MM-DD`, with nothing after it. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
/** `YYYY-MM`, the month bucket key. */
const MONTH_ONLY = /^(\d{4})-(\d{2})$/

/**
 * A local `Date` for any workout date string, or `null` when the value is
 * missing or unparseable — so callers can show a fallback rather than the
 * string "Invalid Date".
 */
export function parseWorkoutDate(value: string | null | undefined): Date | null {
  if (!value) return null

  const dateOnly = DATE_ONLY.exec(value)
  if (dateOnly) {
    const [, year, month, day] = dateOnly
    return local(Number(year), Number(month), Number(day))
  }

  const monthOnly = MONTH_ONLY.exec(value)
  if (monthOnly) {
    const [, year, month] = monthOnly
    return local(Number(year), Number(month), 1)
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function local(year: number, month: number, day: number): Date | null {
  const d = new Date(year, month - 1, day)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Format a workout date string for display. Returns `fallback` (an em dash by
 * default) when the value cannot be parsed, so a bad row degrades to a quiet
 * placeholder instead of shouting "Invalid Date" at the user.
 */
export function formatWorkoutDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  fallback = "—"
): string {
  const date = parseWorkoutDate(value)
  if (!date) return fallback
  return date.toLocaleDateString("en-US", options)
}

/** Local `YYYY-MM-DD` key for a workout date string, or `null` if unparseable. */
export function workoutDayKey(value: string | null | undefined): string | null {
  const date = parseWorkoutDate(value)
  if (!date) return null
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}
