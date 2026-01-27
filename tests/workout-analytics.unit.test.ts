import test from "node:test"
import assert from "node:assert/strict"
import {
  calculateE1rm,
  computeBestE1rmSet,
  computeWeekOverWeek,
  computeWorkoutVolume,
  isNewBest,
  type CompletedSetRecord,
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
