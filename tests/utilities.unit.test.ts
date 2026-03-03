import test from "node:test"
import assert from "node:assert/strict"
import { formatExerciseName } from "../lib/format-exercise-name"
import { isWarmupExercise } from "../lib/exercise-heuristics"

// ---------------------------------------------------------------------------
// formatExerciseName
// ---------------------------------------------------------------------------

test("formatExerciseName capitalizes the first letter of each space-separated word", () => {
  assert.equal(formatExerciseName("bench press"), "Bench Press")
  assert.equal(formatExerciseName("overhead press"), "Overhead Press")
})

test("formatExerciseName capitalizes letters that follow a hyphen", () => {
  assert.equal(formatExerciseName("push-up"), "Push-Up")
  assert.equal(formatExerciseName("pull-down"), "Pull-Down")
})

test("formatExerciseName capitalizes letters that follow a forward slash", () => {
  assert.equal(formatExerciseName("dumbbell/barbell curl"), "Dumbbell/Barbell Curl")
})

test("formatExerciseName does not change already-capitalized input", () => {
  assert.equal(formatExerciseName("Bench Press"), "Bench Press")
})

test("formatExerciseName returns empty string unchanged", () => {
  assert.equal(formatExerciseName(""), "")
})

test("formatExerciseName capitalizes letters after an open parenthesis", () => {
  assert.equal(formatExerciseName("row (cable)"), "Row (Cable)")
})

// ---------------------------------------------------------------------------
// isWarmupExercise
// ---------------------------------------------------------------------------

test("isWarmupExercise detects 'warm up' and 'warmup' markers", () => {
  assert.equal(isWarmupExercise("Warm Up Squats"), true)
  assert.equal(isWarmupExercise("warmup sets"), true)
})

test("isWarmupExercise detects 'warm-up' hyphenated marker", () => {
  assert.equal(isWarmupExercise("Warm-Up"), true)
})

test("isWarmupExercise detects 'wu' abbreviation", () => {
  assert.equal(isWarmupExercise("WU Pulldowns"), true)
})

test("isWarmupExercise detects activation and primer markers", () => {
  assert.equal(isWarmupExercise("Hip Activation"), true)
  assert.equal(isWarmupExercise("Glute Primer"), true)
})

test("isWarmupExercise detects ramp and ramping markers", () => {
  assert.equal(isWarmupExercise("Ramp Sets"), true)
  assert.equal(isWarmupExercise("Ramping Volume"), true)
})

test("isWarmupExercise detects prep marker", () => {
  assert.equal(isWarmupExercise("Shoulder Prep"), true)
})

test("isWarmupExercise is case-insensitive", () => {
  assert.equal(isWarmupExercise("WARMUP SETS"), true)
  assert.equal(isWarmupExercise("WARM UP"), true)
})

test("isWarmupExercise returns false for regular exercises", () => {
  assert.equal(isWarmupExercise("Bench Press"), false)
  assert.equal(isWarmupExercise("Squat"), false)
  assert.equal(isWarmupExercise("Deadlift"), false)
})

test("isWarmupExercise returns false for empty string", () => {
  assert.equal(isWarmupExercise(""), false)
})
