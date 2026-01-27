import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { validateWorkoutCommitPayload } from "@/lib/workout-commit-validation"

type WorkoutExerciseInsert = {
  workout_id: string
  exercise_id: string
  name: string
  sort_index: number
  updated_at: string
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin()
  const authHeader = request.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null
  if (!token) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 })
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userId = authData.user.id

  let payload: ReturnType<typeof validateWorkoutCommitPayload>
  try {
    payload = validateWorkoutCommitPayload(await request.json())
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const { workout, sets } = payload
  const performedAt = workout.completed_at ?? workout.started_at
  const now = new Date().toISOString()

  const workoutRow = {
    id: workout.workout_id,
    user_id: userId,
    name: workout.routine_name ?? "Workout",
    performed_at: performedAt,
    started_at: workout.started_at,
    completed_at: workout.completed_at ?? null,
    status: workout.completed_at ? "completed" : "draft",
    updated_at: now,
  }

  const { error: workoutError } = await supabase
    .from("workouts")
    .upsert(workoutRow, { onConflict: "id" })

  if (workoutError) {
    return NextResponse.json({ error: workoutError.message }, { status: 500 })
  }

  const { data: existingExercises } = await supabase
    .from("workout_exercises")
    .select("id")
    .eq("workout_id", workout.workout_id)

  const existingExerciseIds = (existingExercises || [])
    .map((row) => row.id)
    .filter(Boolean)

  if (existingExerciseIds.length > 0) {
    await supabase.from("workout_sets").delete().in("workout_exercise_id", existingExerciseIds)
  }

  await supabase.from("workout_exercises").delete().eq("workout_id", workout.workout_id)

  const exerciseMap = new Map<string, string>()
  const exerciseRows: WorkoutExerciseInsert[] = []
  sets.forEach((set) => {
    if (exerciseMap.has(set.exercise_id)) return
    exerciseMap.set(set.exercise_id, set.exercise_name)
  })

  Array.from(exerciseMap.entries()).forEach(([exerciseId, name], index) => {
    exerciseRows.push({
      workout_id: workout.workout_id,
      exercise_id: exerciseId,
      name,
      sort_index: index,
      updated_at: now,
    })
  })

  let insertedExercises: Array<{ id: string; exercise_id: string }> = []
  if (exerciseRows.length > 0) {
    const { data, error } = await supabase
      .from("workout_exercises")
      .insert(exerciseRows)
      .select("id, exercise_id")
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    insertedExercises = (data || []) as Array<{ id: string; exercise_id: string }>
  }

  const exerciseIdLookup = new Map<string, string>()
  insertedExercises.forEach((row) => {
    exerciseIdLookup.set(row.exercise_id, row.id)
  })

  const setRows = sets.map((set) => ({
    id: set.set_id,
    workout_exercise_id: exerciseIdLookup.get(set.exercise_id),
    workout_id: workout.workout_id,
    user_id: userId,
    exercise_id: set.exercise_id,
    exercise_name: set.exercise_name,
    set_index: set.set_index,
    reps: set.reps,
    weight: set.weight,
    completed: set.completed,
    updated_at: now,
  }))

  const invalidExercise = setRows.find((row) => !row.workout_exercise_id)
  if (invalidExercise) {
    return NextResponse.json({ error: "Missing exercise mapping" }, { status: 400 })
  }

  if (setRows.length > 0) {
    const { error: setsError } = await supabase.from("workout_sets").insert(setRows)
    if (setsError) {
      return NextResponse.json({ error: setsError.message }, { status: 500 })
    }
  }

  return NextResponse.json({
    workout_id: workout.workout_id,
    status: workout.completed_at ? "completed" : "draft",
    set_count: setRows.length,
  })
}

