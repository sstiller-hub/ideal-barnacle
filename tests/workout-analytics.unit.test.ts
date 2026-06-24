import test from "node:test"
import assert from "node:assert/strict"
import {
  calculateE1rm,
  computeBestE1rmSet,
  computeWeekOverWeek,
  computeWeeklyPace,
  computeWorkoutVolume,
  getWeekStart,
  isNewBest,
  type CompletedSetRecord,
  type DatedWorkoutVolume,
} from "../lib/workout-analytics"

test("computeWorkoutVolume sums completed set volume only", () => {
  const sets: CompletedSetRecord[] = [
    {
      reps: 8,
      weight: 100,
      completed: true,
      exerciseId: "ex-1",
      exerciseName: "Bench",
      workoutId: "w-1",
    },
    {
      reps: 6,
      weight: 120,
      completed: true,
      exerciseId: "ex-1",
      exerciseName: "Bench",
      workoutId: "w-1",
    },
    {
      reps: 0,
      weight: 100,
      completed: true,
      exerciseId: "ex-1",
      exerciseName: "Bench",
      workoutId: "w-1",
    },
    {
      reps: 10,
      weight: 50,
      completed: false,
      exerciseId: "ex-1",
      exerciseName: "Bench",
      workoutId: "w-1",
    },
  ]

  assert.equal(computeWorkoutVolume(sets), 8 * 100 + 6 * 120)
})

test("calculateE1rm uses Epley formula", () => {
  const value = calculateE1rm(200, 5)
  assert.ok(Math.abs(value - 233.3333) < 0.01)
})

test("computeBestE1rmSet returns the highest e1RM set", () => {
  const sets: CompletedSetRecord[] = [
    {
      reps: 8,
      weight: 100,
      completed: true,
      setIndex: 0,
      exerciseId: "ex-1",
      exerciseName: "Bench",
      workoutId: "w-1",
    },
    {
      reps: 5,
      weight: 140,
      completed: true,
      setIndex: 1,
      exerciseId: "ex-1",
      exerciseName: "Bench",
      workoutId: "w-1",
    },
  ]

  const best = computeBestE1rmSet(sets)
  assert.ok(best)
  assert.equal(best?.set.setIndex, 1)
})

test("isNewBest detects new records", () => {
  assert.equal(isNewBest(200, null), true)
  assert.equal(isNewBest(200, 180), true)
  assert.equal(isNewBest(180, 200), false)
})

test("computeWeekOverWeek handles zero previous volume", () => {
  const result = computeWeekOverWeek(1000, 0)
  assert.equal(result.delta, 1000)
  assert.equal(result.percent, 0)
})

// Local-time date helper (month is 1-indexed here for readability).
const at = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month - 1, day, hour, 0, 0)

test("getWeekStart returns the local-midnight Monday of the week", () => {
  // 2026-06-24 is a Wednesday; its week starts Monday 2026-06-22.
  const start = getWeekStart(at(2026, 6, 24, 9))
  assert.equal(start.getFullYear(), 2026)
  assert.equal(start.getMonth(), 5) // June
  assert.equal(start.getDate(), 22)
  assert.equal(start.getHours(), 0)
  assert.equal(start.getMinutes(), 0)

  // A Sunday belongs to the week that started the previous Monday.
  const fromSunday = getWeekStart(at(2026, 6, 28, 23))
  assert.equal(fromSunday.getDate(), 22)
})

test("computeWeeklyPace compares mid-week against last week's pace, not its full total", () => {
  // Regression test for the "down 59%" bug: a partial week-to-date total was
  // being compared against last week's complete total. With the reference on
  // Wednesday, only last week's Mon-Wed volume should count.
  const workouts: DatedWorkoutVolume[] = [
    // This week so far (through Wednesday): 2 sessions, 2000 total.
    { date: at(2026, 6, 22), volume: 1000 }, // Mon
    { date: at(2026, 6, 23), volume: 1000 }, // Tue
    // Last week, within the Mon-Wed pace window.
    { date: at(2026, 6, 15), volume: 1000 }, // Mon
    { date: at(2026, 6, 16), volume: 1000 }, // Tue
    // Last week, AFTER Wednesday — must be excluded from the pace comparison.
    { date: at(2026, 6, 18), volume: 5000 }, // Thu
    { date: at(2026, 6, 20), volume: 5000 }, // Sat
  ]

  const pace = computeWeeklyPace(workouts, at(2026, 6, 24, 9))

  assert.equal(pace.currentVolume, 2000)
  assert.equal(pace.currentSessions, 2)
  // Only last week's Mon+Tue count — not the full 12000.
  assert.equal(pace.previousVolume, 2000)
  assert.equal(pace.previousSessions, 2)
  // Equal pace, so no drop. The old behavior would have reported ~-83%.
  assert.equal(pace.percent, 0)
  assert.equal(pace.delta, 0)
})

test("computeWeeklyPace on the final day of the week compares full week vs full week", () => {
  const workouts: DatedWorkoutVolume[] = [
    // This week (Mon-Sun): 3 sessions, 3000 total.
    { date: at(2026, 6, 22), volume: 1000 }, // Mon
    { date: at(2026, 6, 24), volume: 1000 }, // Wed
    { date: at(2026, 6, 27), volume: 1000 }, // Sat
    // Last week (Mon-Sun): 2 sessions, 4000 total.
    { date: at(2026, 6, 15), volume: 2000 }, // Mon
    { date: at(2026, 6, 19), volume: 2000 }, // Fri
  ]

  // Reference is Sunday 2026-06-28, the last day of the week.
  const pace = computeWeeklyPace(workouts, at(2026, 6, 28, 20))

  assert.equal(pace.currentVolume, 3000)
  assert.equal(pace.currentSessions, 3)
  assert.equal(pace.previousVolume, 4000)
  assert.equal(pace.previousSessions, 2)
  assert.equal(pace.percent, -25)
})

test("computeWeeklyPace counts the Monday boundary in the current week", () => {
  const workouts: DatedWorkoutVolume[] = [
    // Exactly at the start-of-week boundary (Monday 00:00) — inclusive.
    { date: at(2026, 6, 22, 0), volume: 500 },
  ]
  const pace = computeWeeklyPace(workouts, at(2026, 6, 24, 9))
  assert.equal(pace.currentVolume, 500)
  assert.equal(pace.currentSessions, 1)
})

test("computeWeeklyPace ignores workouts with no date and reports 0% with no prior volume", () => {
  const workouts: DatedWorkoutVolume[] = [
    { date: at(2026, 6, 23), volume: 1500 },
    { date: null, volume: 9999 },
    { date: undefined, volume: 9999 },
  ]
  const pace = computeWeeklyPace(workouts, at(2026, 6, 24, 9))
  assert.equal(pace.currentVolume, 1500)
  assert.equal(pace.currentSessions, 1)
  assert.equal(pace.previousVolume, 0)
  // No previous volume → percent guarded to 0 by computeWeekOverWeek.
  assert.equal(pace.percent, 0)
})
