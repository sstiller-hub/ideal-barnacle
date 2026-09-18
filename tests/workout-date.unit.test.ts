import test from "node:test"
import assert from "node:assert/strict"
import { formatWorkoutDate, parseWorkoutDate, workoutDayKey } from "../lib/workout-date"

const MDY: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }

test("parses the full ISO timestamps that logged sessions and Supabase pulls carry", () => {
  // The regression: splitting this on "-" left a day of "12T12:00:00.000Z",
  // which made a Date of NaN and rendered as "Invalid Date".
  const d = parseWorkoutDate("2026-09-12T12:00:00.000Z")
  assert.notEqual(d, null)
  assert.equal(Number.isNaN(d!.getTime()), false)
  assert.equal(formatWorkoutDate("2026-09-12T12:00:00.000Z", MDY), "Sep 12, 2026")
})

test("parses date-only strings as local days, not UTC midnight", () => {
  // `new Date("2025-04-21")` is UTC midnight, which is Apr 20 west of Greenwich.
  const d = parseWorkoutDate("2025-04-21")
  assert.equal(d!.getFullYear(), 2025)
  assert.equal(d!.getMonth(), 3)
  assert.equal(d!.getDate(), 21)
  assert.equal(formatWorkoutDate("2025-04-21", MDY), "Apr 21, 2025")
})

test("parses month bucket keys", () => {
  const d = parseWorkoutDate("2026-09")
  assert.equal(d!.getFullYear(), 2026)
  assert.equal(d!.getMonth(), 8)
  assert.equal(d!.getDate(), 1)
  assert.equal(formatWorkoutDate("2026-09", { month: "long", year: "numeric" }), "September 2026")
})

test("reports unparseable and missing values instead of formatting them", () => {
  for (const bad of ["", "not a date", null, undefined]) {
    assert.equal(parseWorkoutDate(bad), null)
    assert.equal(formatWorkoutDate(bad, MDY), "—")
    assert.equal(workoutDayKey(bad), null)
  }
  assert.equal(formatWorkoutDate("garbage", MDY, "Undated"), "Undated")
})

test("day keys stay on the local day for both date shapes", () => {
  assert.equal(workoutDayKey("2025-04-21"), "2025-04-21")
  // Local noon is the same local day in every timezone the app runs in.
  assert.equal(workoutDayKey("2026-09-12T12:00:00.000Z"), "2026-09-12")
})
