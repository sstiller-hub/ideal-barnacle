import test from "node:test"
import assert from "node:assert/strict"
import {
  calculateE1rm,
  computeBestE1rmSet,
  computeExerciseSessionVolumes,
  computeWeekOverWeek,
  computeWorkoutVolume,
  isCompletedSet,
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

test("computeWeekOverWeek returns negative delta for volume drop", () => {
  const result = computeWeekOverWeek(800, 1000)
  assert.equal(result.delta, -200)
  assert.ok(Math.abs(result.percent - -20) < 0.001)
})

test("computeExerciseSessionVolumes groups volume by exerciseId", () => {
  const sets: CompletedSetRecord[] = [
    { reps: 10, weight: 100, completed: true, exerciseId: "ex-1", exerciseName: "Bench", workoutId: "w-1" },
    { reps: 8, weight: 100, completed: true, exerciseId: "ex-1", exerciseName: "Bench", workoutId: "w-1" },
    { reps: 5, weight: 200, completed: true, exerciseId: "ex-2", exerciseName: "Squat", workoutId: "w-1" },
    { reps: 0, weight: 100, completed: true, exerciseId: "ex-1", exerciseName: "Bench", workoutId: "w-1" },
  ]
  const volumes = computeExerciseSessionVolumes(sets)
  assert.equal(volumes.get("ex-1"), 10 * 100 + 8 * 100) // zero-rep set excluded
  assert.equal(volumes.get("ex-2"), 5 * 200)
})

test("isCompletedSet rejects sets with zero reps or zero weight", () => {
  assert.equal(
    isCompletedSet({ reps: 0, weight: 100, completed: true, exerciseId: "e", exerciseName: "E", workoutId: "w" }),
    false,
  )
  assert.equal(
    isCompletedSet({ reps: 5, weight: 0, completed: true, exerciseId: "e", exerciseName: "E", workoutId: "w" }),
    false,
  )
  assert.equal(
    isCompletedSet({ reps: 5, weight: 100, completed: true, exerciseId: "e", exerciseName: "E", workoutId: "w" }),
    true,
  )
})
