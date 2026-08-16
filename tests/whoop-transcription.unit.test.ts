import test from "node:test"
import assert from "node:assert/strict"
import {
  buildTranscriptionPlan,
  countVisibleSets,
  formatExerciseAsText,
  visibleExercises,
} from "../lib/whoop-transcription"
import type { CompletedWorkout, Exercise, WorkoutSet } from "../lib/workout-storage"

const set = (weight: number | null, reps: number | null, extra: Partial<WorkoutSet> = {}): WorkoutSet => ({
  weight,
  reps,
  completed: true,
  ...extra,
})

const exercise = (name: string, sets: WorkoutSet[]): Exercise => ({
  id: name,
  name,
  targetSets: sets.length,
  targetReps: "8-12",
  restTime: 90,
  completed: true,
  sets,
})

const workout = (exercises: Exercise[]): CompletedWorkout => ({
  id: "w1",
  name: "Legs 1",
  date: "2026-08-16T12:00:00.000Z",
  startedAt: "2026-08-16T17:02:00.000Z",
  exercises,
  stats: { totalSets: 0, completedSets: 0, totalVolume: 0, totalReps: 0 },
})

test("preserves exercise and set order — Whoop is entered in the order performed", () => {
  const plan = buildTranscriptionPlan(
    workout([
      exercise("Pendulum Squat", [set(180, 10), set(200, 8)]),
      exercise("Leg Extension", [set(120, 15)]),
    ]),
  )
  assert.deepEqual(
    plan.exercises.map((ex) => ex.aktName),
    ["Pendulum Squat", "Leg Extension"],
  )
  assert.deepEqual(
    plan.exercises[0].sets.map((s) => `${s.weight}x${s.reps}`),
    ["180x10", "200x8"],
  )
  assert.equal(plan.totalSets, 3)
})

test("set ids are stable and index-based so checked-off progress survives a reload", () => {
  const plan = buildTranscriptionPlan(
    workout([exercise("Hip Thrust", [set(225, 10), set(225, 9)])]),
  )
  assert.deepEqual(plan.exercises[0].sets.map((s) => s.id), ["0-0", "0-1"])
})

test("keeps a performed-but-flagged set, marked rather than dropped", () => {
  // A rep outlier is excluded from stats, but it still happened — it belongs in Whoop.
  const plan = buildTranscriptionPlan(
    workout([
      exercise("Lat Pulldown", [
        set(150, 10),
        set(150, 30, { validationFlags: ["rep_outlier"], isOutlier: true }),
      ]),
    ]),
  )
  assert.equal(plan.exercises[0].sets.length, 2)
  assert.equal(plan.exercises[0].sets[0].flagged, false)
  assert.equal(plan.exercises[0].sets[1].flagged, true)
})

test("drops sets that were never completed or are missing reps or weight", () => {
  const plan = buildTranscriptionPlan(
    workout([
      exercise("Cable Crunch", [
        set(90, 12),
        set(90, 12, { completed: false }),
        set(null, 12),
        set(90, null),
      ]),
    ]),
  )
  assert.equal(plan.exercises[0].sets.length, 1)
  // The surviving set keeps its original index in the id.
  assert.equal(plan.exercises[0].sets[0].id, "0-0")
  assert.equal(plan.totalSets, 1)
})

test("resolves the Whoop alias by normalized name, so casing drift does not miss", () => {
  const plan = buildTranscriptionPlan(
    workout([exercise("Arsenal  Pendulum Squat", [set(180, 10)])]),
    { "arsenal pendulum squat": "Pendulum Squat" },
  )
  assert.equal(plan.exercises[0].whoopName, "Pendulum Squat")
})

test("leaves whoopName null when the exercise has never been mapped", () => {
  const plan = buildTranscriptionPlan(workout([exercise("Technogym Delts Machine", [set(60, 12)])]))
  assert.equal(plan.exercises[0].whoopName, null)
})

test("hides warm-up exercises by default and counts only what is shown", () => {
  const plan = buildTranscriptionPlan(
    workout([
      exercise("Leg day warmup", [set(45, 10)]),
      exercise("Pendulum Squat", [set(180, 10), set(200, 8)]),
    ]),
  )
  assert.equal(plan.exercises[0].isWarmup, true)

  const hidden = visibleExercises(plan, false)
  assert.deepEqual(hidden.map((ex) => ex.aktName), ["Pendulum Squat"])
  assert.equal(countVisibleSets(hidden), 2)

  const shown = visibleExercises(plan, true)
  assert.equal(shown.length, 2)
  assert.equal(countVisibleSets(shown), 3)
})

test("hides exercises that ended up with no transcribable sets", () => {
  const plan = buildTranscriptionPlan(
    workout([
      exercise("Skipped Machine Row", [set(100, 10, { completed: false })]),
      exercise("Hip Adduction", [set(140, 15)]),
    ]),
  )
  assert.deepEqual(visibleExercises(plan, false).map((ex) => ex.aktName), ["Hip Adduction"])
})

test("copy-one-exercise text uses the Whoop name when mapped", () => {
  const plan = buildTranscriptionPlan(
    workout([exercise("Bayesian Cable Curl", [set(30, 12), set(30, 10)])]),
    { "bayesian cable curl": "Cable Curl" },
  )
  assert.equal(
    formatExerciseAsText(plan.exercises[0]),
    ["Cable Curl", "  Set 1: 30 lbs × 12", "  Set 2: 30 lbs × 10"].join("\n"),
  )
})

test("copy-one-exercise text falls back to the Akt name when unmapped", () => {
  const plan = buildTranscriptionPlan(workout([exercise("Hip Adduction", [set(1, 1)])]))
  // Singular weight uses the singular unit.
  assert.equal(formatExerciseAsText(plan.exercises[0]), "Hip Adduction\n  Set 1: 1 lb × 1")
})
