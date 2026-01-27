import { z } from "zod"

const numericOrNull = z
  .number()
  .finite()
  .refine((value) => value >= 0, "Must be non-negative")
  .nullable()

export const workoutCommitSchema = z.object({
  workout: z.object({
    workout_id: z.string().uuid(),
    started_at: z.string().datetime(),
    completed_at: z.string().datetime().nullable().optional(),
    routine_id: z.string().optional().nullable(),
    routine_name: z.string().optional().nullable(),
    updated_at_client: z.number().int(),
    schema_version: z.number().int(),
  }),
  sets: z
    .array(
      z.object({
        set_id: z.string().uuid(),
        exercise_id: z.string().min(1),
        exercise_name: z.string().min(1),
        set_index: z.number().int().min(0),
        reps: numericOrNull,
        weight: numericOrNull,
        notes: z.string().optional().nullable(),
        completed: z.boolean(),
        updated_at_client: z.number().int().optional(),
      })
    )
    .min(1),
})

export type WorkoutCommitPayload = z.infer<typeof workoutCommitSchema>

export function validateWorkoutCommitPayload(payload: unknown): WorkoutCommitPayload {
  const parsed = workoutCommitSchema.parse(payload)

  if (parsed.workout.completed_at) {
    const startedAt = new Date(parsed.workout.started_at).getTime()
    const completedAt = new Date(parsed.workout.completed_at).getTime()
    if (Number.isFinite(startedAt) && Number.isFinite(completedAt) && completedAt < startedAt) {
      throw new Error("completed_at must be after started_at")
    }
  }

  parsed.sets.forEach((set) => {
    if (set.completed && (set.reps === null || set.weight === null)) {
      throw new Error("Completed sets must include reps and weight")
    }
  })

  return parsed
}
