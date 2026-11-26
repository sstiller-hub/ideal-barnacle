import test from "node:test"
import assert from "node:assert/strict"

import {
  EQUIPMENT_IDENTIFICATION_SCHEMA,
  effectiveEquipment,
  isExerciseEquipment,
  parseIdentification,
  type ExerciseEquipment,
} from "../lib/equipment"
import { draftExerciseMeta } from "../lib/workout-draft-storage"
import { validateWorkoutCommitPayload } from "../lib/workout-commit-validation"

const sticky: ExerciseEquipment = {
  name: "Hammer Strength Iso-Lateral Row",
  brand: "Hammer Strength",
  kind: "plate_loaded",
  photo: null,
  setAt: "2026-11-20T22:00:00.000Z",
}
const today: ExerciseEquipment = { ...sticky, name: "Cybex Seated Row", brand: "Cybex", kind: "selectorized" }

test("parseIdentification normalizes Claude's JSON", () => {
  const parsed = parseIdentification({
    name: "  Hammer Strength   Iso-Lateral Row ",
    brand: "Hammer Strength",
    kind: "Plate_Loaded",
    confidence: "HIGH",
    matches_exercise: true,
    note: null,
  })
  assert.deepEqual(parsed, {
    name: "Hammer Strength Iso-Lateral Row",
    brand: "Hammer Strength",
    kind: "plate_loaded",
    confidence: "high",
    matchesExercise: true,
    note: null,
  })
})

test("parseIdentification falls back safely on unknown values", () => {
  const parsed = parseIdentification({ name: "Row thing", kind: "spaceship", confidence: "sure", brand: "" })
  assert.equal(parsed?.kind, "other")
  assert.equal(parsed?.confidence, "low")
  assert.equal(parsed?.brand, null)
  assert.equal(parsed?.matchesExercise, true)
})

test("parseIdentification rejects a missing name", () => {
  assert.equal(parseIdentification({ name: "   " }), null)
  assert.equal(parseIdentification(null), null)
  assert.equal(parseIdentification("Hammer"), null)
})

test("today-only wins, sticky is the fallback", () => {
  assert.deepEqual(effectiveEquipment({ equipment: sticky, equipmentToday: today }), { equipment: today, scope: "today" })
  assert.deepEqual(effectiveEquipment({ equipment: sticky }), { equipment: sticky, scope: "sticky" })
  assert.equal(effectiveEquipment({}), null)
})

test("isExerciseEquipment guards stored values", () => {
  assert.equal(isExerciseEquipment(sticky), true)
  assert.equal(isExerciseEquipment({ name: "", setAt: "x" }), false)
  assert.equal(isExerciseEquipment({ name: "Row" }), false)
  assert.equal(isExerciseEquipment(null), false)
})

test("schema keeps every property required and closed, as structured outputs needs", () => {
  assert.equal(EQUIPMENT_IDENTIFICATION_SCHEMA.additionalProperties, false)
  assert.deepEqual(
    [...EQUIPMENT_IDENTIFICATION_SCHEMA.required].sort(),
    Object.keys(EQUIPMENT_IDENTIFICATION_SCHEMA.properties).sort()
  )
})

test("draftExerciseMeta merges ratings and equipment by exercise id", () => {
  assert.equal(draftExerciseMeta({}), undefined)
  assert.deepEqual(draftExerciseMeta({ exercise_ratings: {} }), [])
  const meta = draftExerciseMeta({
    exercise_ratings: { a: "thumbs_up", b: null },
    exercise_equipment: { b: "Cybex Seated Row", c: "Smith machine" },
  })
  assert.deepEqual(meta, [
    { exercise_id: "a", rating: "thumbs_up" },
    { exercise_id: "b", rating: null, equipment: "Cybex Seated Row" },
    { exercise_id: "c", rating: null, equipment: "Smith machine" },
  ])
})

test("commit payload accepts equipment and stays valid without it", () => {
  const base = {
    workout: {
      workout_id: "11111111-1111-4111-8111-111111111111",
      started_at: "2026-11-26T22:00:00.000Z",
      completed_at: "2026-11-26T23:00:00.000Z",
      routine_id: null,
      routine_name: "Pull",
      updated_at_client: 1,
      schema_version: 1,
    },
    sets: [
      {
        set_id: "22222222-2222-4222-8222-222222222222",
        workout_id: "11111111-1111-4111-8111-111111111111",
        exercise_id: "b",
        exercise_name: "Seated Row",
        set_index: 0,
        reps: 10,
        weight: 140,
        completed: true,
      },
    ],
  }
  const withEquipment = validateWorkoutCommitPayload({
    ...base,
    exercises: [{ exercise_id: "b", rating: null, equipment: "Cybex Seated Row" }],
  })
  assert.equal(withEquipment.exercises?.[0]?.equipment, "Cybex Seated Row")
  const without = validateWorkoutCommitPayload({ ...base, exercises: [{ exercise_id: "b", rating: null }] })
  assert.equal(without.exercises?.[0]?.equipment, undefined)
})
