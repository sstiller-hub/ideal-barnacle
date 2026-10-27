import test from "node:test"
import assert from "node:assert/strict"

// lib/gym reads localStorage only when its functions run, so the mock below
// is in place before any call.

const store: Record<string, string> = {}
;(globalThis as any).window = globalThis
;(globalThis as any).localStorage = {
  getItem: (key: string) => (key in store ? store[key] : null),
  setItem: (key: string, value: string) => {
    store[key] = String(value)
  },
  removeItem: (key: string) => {
    delete store[key]
  },
  clear: () => {
    Object.keys(store).forEach((key) => delete store[key])
  },
}

import {
  buildCapeRoutine,
  capeNoteForExercise,
  detectSessionGym,
  gymMovementKey,
  stripGymSuffix,
  toCapeName,
} from "../lib/gym"
import type { CapeContext, ExerciseVariant, GymCalibration } from "../lib/gym"
import type { WorkoutRoutine } from "../lib/routine-storage"

function context(variants: ExerciseVariant[], calibration: GymCalibration[] = []): CapeContext {
  return {
    variants: new Map(variants.map((v) => [v.movement, v])),
    calibration: new Map(calibration.map((c) => [c.movement, c])),
  }
}

const machine = (movement: string, machine_name: string): ExerciseVariant => ({
  movement,
  machine_name,
  shares_history: false,
  calibration_status: "needs_calibration",
  notes: null,
})

function routine(names: string[]): WorkoutRoutine {
  return {
    id: "legs-2",
    name: "Legs 2",
    description: "",
    estimatedTime: "60 min",
    category: "Legs",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    exercises: names.map((name, i) => ({ id: `ex-${i}`, name, type: "strength" as const, targetSets: 3, targetReps: "8-10" })),
  }
}

function seedHistory(name: string, weight: number) {
  store.workout_history = JSON.stringify([
    {
      id: "w1",
      name: "Legs 2",
      date: "2026-10-22T22:00:00.000Z",
      exercises: [
        {
          id: "ex-0",
          name,
          targetSets: 3,
          targetReps: "8-10",
          restTime: 120,
          completed: true,
          sets: [
            { reps: 9, weight, completed: true },
            { reps: 8, weight, completed: true },
          ],
        },
      ],
      stats: { totalSets: 2, completedSets: 2, totalVolume: 0, totalReps: 17 },
    },
  ])
}

test("Cape names round-trip and key back to the SoWa movement", () => {
  assert.equal(toCapeName("Hip Thrust"), "Hip Thrust [Cape]")
  assert.equal(toCapeName("Hip Thrust [Cape]"), "Hip Thrust [Cape]")
  assert.equal(stripGymSuffix("Hip Thrust [Cape]"), "Hip Thrust")
  assert.equal(gymMovementKey("  Hip Thrust [Cape] "), "hip thrust")
})

test("a session is Cape when any exercise has a Cape name", () => {
  assert.equal(detectSessionGym([{ name: "Incline Dumbbell Bench" }, { name: "Hip Thrust [Cape]" }]), "bodystrong")
  assert.equal(detectSessionGym([{ name: "Hip Thrust" }]), "sowa")
  assert.equal(detectSessionGym(undefined), "sowa")
})

test("machine lifts take Cape names; free weights keep shared history", () => {
  store.workout_history = "[]"
  const ctx = context([
    machine("hip thrust", "Arsenal Hip Thrust"),
    { ...machine("incline dumbbell bench", "Dumbbells"), shares_history: true, calibration_status: "calibrated" },
  ])
  const cape = buildCapeRoutine(routine(["Hip Thrust", "Incline Dumbbell Bench", "Unmapped Lift"]), ctx)
  assert.deepEqual(
    cape.exercises.map((e) => [e.id, e.name]),
    [
      ["ex-0@cape", "Hip Thrust [Cape]"],
      ["ex-1", "Incline Dumbbell Bench"],
      ["ex-2", "Unmapped Lift"],
    ]
  )
})

test("first Cape session starts from the SoWa weight scaled by the ratio", () => {
  seedHistory("Machine Calf Raise", 405)
  const ctx = context(
    [machine("machine calf raise", "Calf Raise Machine")],
    [{ movement: "machine calf raise", cape_sessions: 1, ratio: 1.15 }]
  )
  const [calf] = buildCapeRoutine(routine(["Machine Calf Raise"]), ctx).exercises
  assert.equal(calf.targetWeight, 465)
})

test("with no ratio yet, the SoWa weight is the starting guess", () => {
  seedHistory("Hip Thrust", 225)
  const [thrust] = buildCapeRoutine(routine(["Hip Thrust"]), context([machine("hip thrust", "Arsenal Hip Thrust")]))
    .exercises
  assert.equal(thrust.targetWeight, 225)
})

test("Cape card asks for calibration until two sessions exist", () => {
  const ctx = context(
    [machine("hip thrust", "Arsenal Hip Thrust")],
    [{ movement: "hip thrust", cape_sessions: 1, ratio: 0.97 }]
  )
  const note = capeNoteForExercise("Hip Thrust [Cape]", ctx)
  assert.ok(note)
  assert.equal(note.kind, "flag")
  assert.equal(note.body, "Arsenal Hip Thrust: calibrate")
  assert.match(note.detail ?? "", /1 more Cape session/)
  assert.equal(capeNoteForExercise("Hip Thrust", ctx), null)
})

test("calibrated Cape card states the load difference", () => {
  const ctx = context(
    [machine("seated hip abduction", "Hip Abduction Machine")],
    [{ movement: "seated hip abduction", cape_sessions: 2, ratio: 0.74 }]
  )
  const note = capeNoteForExercise("Seated Hip Abduction [Cape]", ctx)
  assert.equal(note?.kind, "reminder")
  assert.match(note?.detail ?? "", /26% lighter than SoWa/)
})
