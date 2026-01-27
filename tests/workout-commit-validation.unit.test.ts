import test from "node:test"
import assert from "node:assert/strict"
import { validateWorkoutCommitPayload } from "../lib/workout-commit-validation"

test("validateWorkoutCommitPayload accepts a minimal valid payload", () => {
  const payload = {
    workout: {
      workout_id: "550e8400-e29b-41d4-a716-446655440000",
      started_at: "2025-01-01T10:00:00.000Z",
      completed_at: "2025-01-01T11:00:00.000Z",
      updated_at_client: 1710000000000,
      schema_version: 1,
    },
    sets: [
      {
        set_id: "550e8400-e29b-41d4-a716-446655440001",
        exercise_id: "bench",
        exercise_name: "Bench Press",
        set_index: 0,
        reps: 8,
        weight: 135,
        completed: true,
        updated_at_client: 1710000000001,
      },
    ],
  }

  const parsed = validateWorkoutCommitPayload(payload)
  assert.equal(parsed.workout.workout_id, payload.workout.workout_id)
  assert.equal(parsed.sets.length, 1)
})

test("validateWorkoutCommitPayload rejects negative weights", () => {
  const payload = {
    workout: {
      workout_id: "550e8400-e29b-41d4-a716-446655440000",
      started_at: "2025-01-01T10:00:00.000Z",
      completed_at: "2025-01-01T11:00:00.000Z",
      updated_at_client: 1710000000000,
      schema_version: 1,
    },
    sets: [
      {
        set_id: "550e8400-e29b-41d4-a716-446655440001",
        exercise_id: "bench",
        exercise_name: "Bench Press",
        set_index: 0,
        reps: 8,
        weight: -5,
        completed: true,
        updated_at_client: 1710000000001,
      },
    ],
  }

  assert.throws(() => validateWorkoutCommitPayload(payload))
})

