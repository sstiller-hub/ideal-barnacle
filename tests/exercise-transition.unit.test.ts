import test from "node:test"
import assert from "node:assert/strict"
import {
  buildTransitionSample,
  predictTransitionSeconds,
  MAX_TRANSITION_SECONDS,
  type TransitionSample,
} from "../lib/exercise-transition-storage"

const sample = (from: string, to: string, planned: string, seconds: number): TransitionSample => ({
  from,
  to,
  planned,
  seconds,
  date: "2026-11-01T12:00:00.000Z",
})

test("averages the learned gaps for a pair", () => {
  const samples = [sample("row", "bench", "bench", 150), sample("row", "bench", "bench", 210)]
  assert.equal(predictTransitionSeconds(samples, "row", ["bench"]), 180)
})

test("needs at least two samples before overriding the static rest", () => {
  assert.equal(predictTransitionSeconds([sample("row", "bench", "bench", 150)], "row", ["bench"]), null)
})

test("a skip counts toward both the exercise actually next and the one skipped to", () => {
  // Routine order row → bench → curl; once the user went row → curl.
  const samples = [
    sample("row", "bench", "bench", 120),
    sample("row", "bench", "bench", 120),
    sample("row", "curl", "bench", 300),
  ]
  // Planned next is bench: the skip sample is included (planned === bench).
  assert.equal(predictTransitionSeconds(samples, "row", ["bench"]), 180)
  // Skipped to curl mid-rest: average over both pairs, each sample once.
  assert.equal(predictTransitionSeconds(samples, "row", ["bench", "curl"]), 180)
})

test("ignores transitions out of other exercises", () => {
  const samples = [sample("row", "bench", "bench", 100), sample("row", "bench", "bench", 100), sample("squat", "bench", "bench", 900)]
  assert.equal(predictTransitionSeconds(samples, "row", ["bench"]), 100)
})

test("builds samples only for real transitions", () => {
  const pending = { workoutId: "w", from: "row", planned: "bench", completedAt: 0 }
  assert.deepEqual(
    { ...buildTransitionSample(pending, "curl", 95_000), date: "" },
    { from: "row", to: "curl", planned: "bench", seconds: 95, date: "" },
  )
  assert.equal(buildTransitionSample(pending, "row", 95_000), null)
  assert.equal(buildTransitionSample(pending, "bench", 3_000), null)
  assert.equal(buildTransitionSample(pending, "bench", (MAX_TRANSITION_SECONDS + 1) * 1000), null)
})
