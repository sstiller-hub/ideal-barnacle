import test from "node:test"
import assert from "node:assert/strict"
import { plural } from "../lib/utils"

test("plural returns the singular form only when |count| === 1", () => {
  assert.equal(plural(1, "rep", "reps"), "rep")
  assert.equal(plural(-1, "rep", "reps"), "rep")
  assert.equal(plural(0, "rep", "reps"), "reps")
  assert.equal(plural(2, "rep", "reps"), "reps")
})

test("plural defaults the plural form to singular + 's'", () => {
  assert.equal(plural(1, "workout"), "workout")
  assert.equal(plural(3, "workout"), "workouts")
})

test("plural honors an explicit (all-caps / irregular) plural form", () => {
  assert.equal(plural(1, "EXERCISE", "EXERCISES"), "EXERCISE")
  assert.equal(plural(4, "EXERCISE", "EXERCISES"), "EXERCISES")
})

test("plural falls back to the plural form for nullish or NaN counts", () => {
  assert.equal(plural(null, "lb", "lbs"), "lbs")
  assert.equal(plural(undefined, "lb", "lbs"), "lbs")
  assert.equal(plural(Number("10-12"), "REP", "REPS"), "REPS")
})
