import test from "node:test"
import assert from "node:assert/strict"
import { normalizeExerciseName } from "../lib/workout-storage"

test("normalizes casing, padding and runs of whitespace", () => {
  assert.equal(normalizeExerciseName("  Overhand   Row "), "overhand row")
})

test("renamed exercises resolve to the name they were renamed to", () => {
  // The rename migration runs once per device, so history that lands after it
  // — a Supabase pull, a Drive restore, an import — still carries the old
  // spelling. Lookups have to see the two as one exercise or the history for
  // the machine reads as empty.
  const canonical = normalizeExerciseName("Wide Chest Press Machine")
  assert.equal(normalizeExerciseName("Incline Machine Chest Press"), canonical)
  assert.equal(normalizeExerciseName("incline machine chest press"), canonical)
  assert.equal(normalizeExerciseName("Incline machine chest press (captioned)"), canonical)
})

test("the other migrated renames resolve too", () => {
  assert.equal(
    normalizeExerciseName("Incline Smith Machine Bench"),
    normalizeExerciseName("Incline Press Machine"),
  )
  assert.equal(
    normalizeExerciseName("Standing / Machine Calf Raise"),
    normalizeExerciseName("Machine Calf Raise"),
  )
})

test("leaves unrelated exercises alone", () => {
  // The flat machine press is a different machine from the wide/incline one.
  assert.notEqual(
    normalizeExerciseName("Machine Chest Press"),
    normalizeExerciseName("Wide Chest Press Machine"),
  )
  assert.equal(normalizeExerciseName("Machine Chest Press"), "machine chest press")
})
