import test from "node:test"
import assert from "node:assert/strict"
import type { Exercise, WorkoutSet } from "../lib/workout-storage"
import { evaluateWorkoutPRs, formatPRText } from "../lib/pr-evaluation"
import { upsertPR } from "../lib/pr-storage"

// ---------------------------------------------------------------------------
// Mock browser environment so localStorage-backed functions work in Node
// ---------------------------------------------------------------------------

const _store = new Map<string, string>()
;(globalThis as any).window = globalThis
;(globalThis as any).localStorage = {
  getItem: (key: string) => _store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    _store.set(key, value)
  },
  removeItem: (key: string) => {
    _store.delete(key)
  },
  clear: () => {
    _store.clear()
  },
  get length() {
    return _store.size
  },
  key: (i: number) => [..._store.keys()][i] ?? null,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSet(reps: number | null, weight: number | null, completed = true): WorkoutSet {
  return { reps, weight, completed }
}

function makeExercise(id: string, name: string, sets: WorkoutSet[]): Exercise {
  return { id, name, targetSets: sets.length, targetReps: "8-12", restTime: 90, completed: true, sets }
}

// ---------------------------------------------------------------------------
// evaluateWorkoutPRs
// ---------------------------------------------------------------------------

test("evaluateWorkoutPRs returns first_pr for an exercise with no prior record", () => {
  _store.clear()
  const exercise = makeExercise("bench", "Bench Press", [makeSet(8, 135)])
  const results = evaluateWorkoutPRs("w-1", "2025-01-01", [exercise])

  const weightPR = results.find((r) => r.exerciseId === "bench" && r.metric === "weight")
  assert.ok(weightPR)
  assert.equal(weightPR.status, "first_pr")
  assert.equal(weightPR.newRecord.valueNumber, 135)
})

test("evaluateWorkoutPRs returns new_pr when the new value beats the existing record", () => {
  _store.clear()
  upsertPR({
    userId: "default_user",
    exerciseId: "squat",
    exerciseName: "Squat",
    metric: "weight",
    valueNumber: 200,
    unit: "lbs",
    contextJson: {},
    achievedAt: "2025-01-01",
  })

  const exercise = makeExercise("squat", "Squat", [makeSet(5, 225)])
  const results = evaluateWorkoutPRs("w-2", "2025-01-15", [exercise])

  const weightPR = results.find((r) => r.exerciseId === "squat" && r.metric === "weight")
  assert.ok(weightPR)
  assert.equal(weightPR.status, "new_pr")
  assert.equal(weightPR.newRecord.valueNumber, 225)
  assert.equal(weightPR.previousRecord?.valueNumber, 200)
})

test("evaluateWorkoutPRs returns tied_pr when the new value matches the existing record", () => {
  _store.clear()
  upsertPR({
    userId: "default_user",
    exerciseId: "deadlift",
    exerciseName: "Deadlift",
    metric: "weight",
    valueNumber: 315,
    unit: "lbs",
    contextJson: {},
    achievedAt: "2025-01-01",
  })

  const exercise = makeExercise("deadlift", "Deadlift", [makeSet(3, 315)])
  const results = evaluateWorkoutPRs("w-3", "2025-01-20", [exercise])

  const weightPR = results.find((r) => r.exerciseId === "deadlift" && r.metric === "weight")
  assert.ok(weightPR)
  assert.equal(weightPR.status, "tied_pr")
})

test("evaluateWorkoutPRs omits results when the value is below the existing record", () => {
  _store.clear()
  upsertPR({
    userId: "default_user",
    exerciseId: "ohp",
    exerciseName: "OHP",
    metric: "weight",
    valueNumber: 135,
    unit: "lbs",
    contextJson: {},
    achievedAt: "2025-01-01",
  })

  const exercise = makeExercise("ohp", "OHP", [makeSet(5, 115)])
  const results = evaluateWorkoutPRs("w-4", "2025-01-25", [exercise])
  const weightPR = results.find((r) => r.exerciseId === "ohp" && r.metric === "weight")
  assert.equal(weightPR, undefined)
})

test("evaluateWorkoutPRs skips exercises with no eligible completed sets", () => {
  _store.clear()
  const exercise = makeExercise("curl", "Curl", [{ reps: null, weight: null, completed: false }])
  const results = evaluateWorkoutPRs("w-5", "2025-01-30", [exercise])
  assert.equal(results.length, 0)
})

test("evaluateWorkoutPRs checks weight, reps, and volume metrics", () => {
  _store.clear()
  const exercise = makeExercise("row", "Row", [makeSet(10, 100)])
  const results = evaluateWorkoutPRs("w-6", "2025-02-01", [exercise])
  const metrics = results.map((r) => r.metric).sort()
  assert.deepEqual(metrics, ["reps", "volume", "weight"])
})

test("evaluateWorkoutPRs picks the best set per metric across multiple sets", () => {
  _store.clear()
  const exercise = makeExercise("press", "Press", [
    makeSet(5, 185), // highest weight
    makeSet(12, 135), // highest reps
    makeSet(8, 155), // 155*8=1240 volume
  ])
  const results = evaluateWorkoutPRs("w-7", "2025-02-05", [exercise])

  const weightPR = results.find((r) => r.metric === "weight")
  assert.ok(weightPR)
  assert.equal(weightPR.newRecord.valueNumber, 185)

  const repsPR = results.find((r) => r.metric === "reps")
  assert.ok(repsPR)
  assert.equal(repsPR.newRecord.valueNumber, 12)

  const volumePR = results.find((r) => r.metric === "volume")
  assert.ok(volumePR)
  assert.equal(volumePR.newRecord.valueNumber, 12 * 135) // 1620
})

// ---------------------------------------------------------------------------
// formatPRText
// ---------------------------------------------------------------------------

test("formatPRText formats a first_pr weight record correctly", () => {
  const pr = {
    exerciseId: "bench",
    exerciseName: "Bench Press",
    metric: "weight" as const,
    status: "first_pr" as const,
    newRecord: {
      valueNumber: 135,
      unit: "lbs",
      achievedAt: "2025-01-01",
      context: { reps: 8, weight: 135, setIndex: 0, workoutId: "w-1" },
    },
  }
  const text = formatPRText(pr)
  assert.ok(text.includes("First PR"))
  assert.ok(text.includes("Bench Press"))
  assert.ok(text.includes("Heaviest set"))
  assert.ok(text.includes("135 lbs"))
})

test("formatPRText formats a new_pr volume record with locale-formatted number", () => {
  const pr = {
    exerciseId: "squat",
    exerciseName: "Squat",
    metric: "volume" as const,
    status: "new_pr" as const,
    newRecord: {
      valueNumber: 2400,
      unit: "lbs",
      achievedAt: "2025-01-15",
      context: { reps: 8, weight: 300, setIndex: 0, workoutId: "w-2" },
    },
  }
  const text = formatPRText(pr)
  assert.ok(text.includes("New PR"))
  assert.ok(text.includes("Best volume"))
  assert.ok(text.includes("2,400"))
})

test("formatPRText formats a tied_pr reps record correctly", () => {
  const pr = {
    exerciseId: "curl",
    exerciseName: "Curl",
    metric: "reps" as const,
    status: "tied_pr" as const,
    newRecord: {
      valueNumber: 15,
      unit: "reps",
      achievedAt: "2025-01-20",
      context: { reps: 15, weight: 35, setIndex: 1, workoutId: "w-3" },
    },
  }
  const text = formatPRText(pr)
  assert.ok(text.includes("Tied PR"))
  assert.ok(text.includes("Most reps"))
  assert.ok(text.includes("15 reps"))
})
