import test from "node:test"
import assert from "node:assert/strict"
import { applyGrowthV2TemplateOps } from "../lib/growth-v2-template-migration"
import type { WorkoutRoutine } from "../lib/routine-storage"

const nowIso = "2026-08-01T00:00:00.000Z"

/** A Legs 2 / Upper 2 snapshot as it looked before this template change. */
function storedRoutines(): WorkoutRoutine[] {
  return [
    {
      id: "growth-v2-legs-2",
      name: "Legs 2 – Glutes + Hamstrings",
      description: "Posterior chain day (glutes + hamstrings).",
      estimatedTime: "57 min",
      category: "Growth v2",
      createdAt: nowIso,
      updatedAt: nowIso,
      exercises: [
        { id: "legs2-seated-ham", name: "Seated Hamstring Curl", type: "strength", targetSets: 3, targetReps: "8-10" },
        { id: "legs2-hip-thrust", name: "Hip Thrust", type: "strength", targetSets: 4, targetReps: "6-10" },
        { id: "legs2-belt-rdl", name: "Belt Squat RDL", type: "strength", targetSets: 3, targetReps: "8-10" },
        { id: "legs2-single-rdl", name: "Single-Leg RDL (supported)", type: "strength", targetSets: 2, targetReps: "8-10" },
        { id: "legs2-glute-ext", name: "Glute-Biased Extension", type: "strength", targetSets: 3, targetReps: "12-15" },
        { id: "legs2-calf", name: "Machine Calf Raise", type: "strength", targetSets: 4, targetReps: "10-12" },
      ],
    },
    {
      id: "growth-v2-upper-2",
      name: "Upper 2 – Back Thickness + Chest",
      description: "Row-driven upper day + upper chest, arms, core.",
      estimatedTime: "45 min",
      category: "Growth v2",
      createdAt: nowIso,
      updatedAt: nowIso,
      exercises: [
        { id: "upper2-overhand-row", name: "Overhand Row", type: "strength", targetSets: 4, targetReps: "6-9" },
        { id: "upper2-incline-db", name: "Incline Dumbbell Bench", type: "strength", targetSets: 4, targetReps: "6-9" },
        { id: "upper2-preacher-hammer", name: "Preacher-Supported DB Hammer Curl", type: "strength", targetSets: 3, targetReps: "8-12" },
        { id: "upper2-side-crunch", name: "Side Crunch (Roman Chair)", type: "other", targetSets: 3, targetReps: "12-15" },
        { id: "upper2-decline-knee", name: "Decline Bench Knee Raise", type: "other", targetSets: 3, targetReps: "12-15" },
      ],
    },
    {
      id: "my-custom-day",
      name: "Custom Day",
      description: "User created.",
      estimatedTime: "30 min",
      category: "Custom",
      createdAt: nowIso,
      updatedAt: nowIso,
      exercises: [{ id: "custom-1", name: "Single-Leg RDL (supported)", type: "strength", targetSets: 2, targetReps: "8-10" }],
    },
  ]
}

const ids = (routines: WorkoutRoutine[], routineId: string) =>
  routines.find((routine) => routine.id === routineId)!.exercises.map((exercise) => exercise.id)

const names = (routines: WorkoutRoutine[], routineId: string) =>
  routines.find((routine) => routine.id === routineId)!.exercises.map((exercise) => exercise.name)

test("Legs 2 swaps Single-Leg RDL for Seated Hip Abduction in the same slot", () => {
  const { routines, changed } = applyGrowthV2TemplateOps(storedRoutines())
  assert.equal(changed, true)

  assert.deepEqual(ids(routines, "growth-v2-legs-2"), [
    "legs2-seated-ham",
    "legs2-hip-thrust",
    "legs2-belt-rdl",
    "legs2-seated-hip-abduction",
    "legs2-glute-ext",
    "legs2-calf",
  ])

  const added = routines
    .find((routine) => routine.id === "growth-v2-legs-2")!
    .exercises.find((exercise) => exercise.id === "legs2-seated-hip-abduction")!
  assert.equal(added.name, "Seated Hip Abduction")
  assert.equal(added.targetSets, 3)
  assert.equal(added.targetReps, "12-15")
  assert.match(added.notes ?? "", /double progression/i)
})

test("Upper 2 gains Neutral-Grip Row and Bayesian Cable Curl and drops the knee raise", () => {
  const { routines } = applyGrowthV2TemplateOps(storedRoutines())

  assert.deepEqual(ids(routines, "growth-v2-upper-2"), [
    "upper2-overhand-row",
    "upper2-neutral-grip-row",
    "upper2-incline-db",
    "upper2-preacher-hammer",
    "sa-bayesian",
    "upper2-side-crunch",
  ])

  const upper2 = routines.find((routine) => routine.id === "growth-v2-upper-2")!
  const row = upper2.exercises.find((exercise) => exercise.id === "upper2-neutral-grip-row")!
  assert.equal(row.name, "Neutral-Grip Row")
  assert.equal(row.targetSets, 3)
  assert.equal(row.targetReps, "10-12")

  const curl = upper2.exercises.find((exercise) => exercise.id === "sa-bayesian")!
  assert.equal(curl.name, "Bayesian Cable Curl")
  assert.equal(curl.targetSets, 2)
  assert.equal(curl.targetReps, "8-12")

  assert.ok(!names(routines, "growth-v2-upper-2").includes("Decline Bench Knee Raise"))
})

test("Neutral-Grip Row stays a distinct slot from Overhand Row", () => {
  const { routines } = applyGrowthV2TemplateOps(storedRoutines())
  const upper2 = routines.find((routine) => routine.id === "growth-v2-upper-2")!
  const rowIds = upper2.exercises.filter((exercise) => exercise.name.endsWith("Row")).map((ex) => ex.id)
  assert.deepEqual(rowIds, ["upper2-overhand-row", "upper2-neutral-grip-row"])
})

test("the Upper 2 curl reuses the Shoulders & Arms slot id so history unifies", () => {
  const { routines } = applyGrowthV2TemplateOps(storedRoutines())
  const upper2 = routines.find((routine) => routine.id === "growth-v2-upper-2")!
  assert.ok(upper2.exercises.some((exercise) => exercise.id === "sa-bayesian"))
})

test("user-created routines are left untouched", () => {
  const before = storedRoutines()
  const { routines } = applyGrowthV2TemplateOps(before)
  const custom = routines.find((routine) => routine.id === "my-custom-day")!
  assert.deepEqual(custom, before.find((routine) => routine.id === "my-custom-day"))
})

test("re-running is a no-op", () => {
  const first = applyGrowthV2TemplateOps(storedRoutines())
  const second = applyGrowthV2TemplateOps(first.routines)
  assert.equal(second.changed, false)
  assert.deepEqual(ids(second.routines, "growth-v2-upper-2"), ids(first.routines, "growth-v2-upper-2"))
  assert.deepEqual(ids(second.routines, "growth-v2-legs-2"), ids(first.routines, "growth-v2-legs-2"))
})

test("user reordering inside a built-in routine is preserved", () => {
  const routinesIn = storedRoutines()
  const upper2 = routinesIn.find((routine) => routine.id === "growth-v2-upper-2")!
  // User moved the preacher curl to the front.
  upper2.exercises = [upper2.exercises[2], ...upper2.exercises.filter((_, i) => i !== 2)]

  const { routines } = applyGrowthV2TemplateOps(routinesIn)
  assert.deepEqual(ids(routines, "growth-v2-upper-2"), [
    "upper2-preacher-hammer",
    "sa-bayesian",
    "upper2-overhand-row",
    "upper2-neutral-grip-row",
    "upper2-incline-db",
    "upper2-side-crunch",
  ])
})
