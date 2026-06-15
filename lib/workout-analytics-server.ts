import type { getSupabaseAdmin } from "@/lib/supabase-admin"
import {
  computeBestE1rmSet,
  computeExerciseSessionVolumes,
  computeWorkoutVolume,
  isNewBest,
  type CompletedSetRecord,
} from "@/lib/workout-analytics"
import {
  buildStallAlertContent,
  detectProgressStall,
  type DeloadRange,
  type ExerciseSessionInput,
} from "@/lib/progressive-overload"
import { isWarmupExercise } from "@/lib/exercise-heuristics"

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>

type WorkoutExerciseRow = {
  id: string
  exercise_id: string
  name: string
}

type WorkoutSetRow = {
  workout_exercise_id: string
  set_index: number
  reps: number | null
  weight: number | null
  completed: boolean
}

export type WorkoutAnalyticsResult = {
  total_volume_lb: number
  pr_count: number
}

/**
 * Computes and persists a workout's analytics: total volume, personal-record
 * rows, and progressive-overload stall alerts.
 *
 * This is invoked synchronously inside the commit request (the request that
 * writes the sets and always runs to completion server-side) rather than relying
 * on a separate client-initiated /complete call, which on mobile is frequently
 * never dispatched because the app is backgrounded right after finishing — which
 * left total_volume_lb at 0 and produced no PRs for any workout.
 *
 * The volume write is treated as critical (it throws on failure); PR detection
 * and stall alerts are best-effort enrichment and never abort the caller.
 */
export async function runWorkoutAnalytics(
  supabase: SupabaseAdminClient,
  { userId, workoutId }: { userId: string; workoutId: string }
): Promise<WorkoutAnalyticsResult> {
  const { data: exerciseRows, error: exerciseError } = await supabase
    .from("workout_exercises")
    .select("id, exercise_id, name")
    .eq("workout_id", workoutId)

  if (exerciseError) {
    throw new Error(exerciseError.message)
  }

  const exercises = (exerciseRows || []) as WorkoutExerciseRow[]
  const exerciseIds = exercises.map((ex) => ex.id)

  if (exerciseIds.length === 0) {
    await supabase
      .from("workouts")
      .update({ total_volume_lb: 0, pr_count: 0 })
      .eq("id", workoutId)
    return { total_volume_lb: 0, pr_count: 0 }
  }

  const { data: setRows, error: setError } = await supabase
    .from("workout_sets")
    .select("workout_exercise_id, set_index, reps, weight, completed")
    .in("workout_exercise_id", exerciseIds)
    .eq("completed", true)

  if (setError) {
    throw new Error(setError.message)
  }

  const exerciseById = new Map<string, WorkoutExerciseRow>()
  exercises.forEach((ex) => {
    exerciseById.set(ex.id, ex)
  })

  const currentSets: CompletedSetRecord[] = (setRows || []).map((row: WorkoutSetRow) => {
    const exercise = exerciseById.get(row.workout_exercise_id)
    return {
      reps: row.reps,
      weight: row.weight,
      completed: row.completed,
      setIndex: row.set_index,
      exerciseId: exercise?.exercise_id || row.workout_exercise_id,
      exerciseName: exercise?.name || "Exercise",
      workoutId,
    }
  })

  const totalVolume = computeWorkoutVolume(currentSets)
  const currentExerciseVolumes = computeExerciseSessionVolumes(currentSets)

  // The headline volume is critical — persist it first and surface failures.
  const { error: volumeUpdateError } = await supabase
    .from("workouts")
    .update({ total_volume_lb: totalVolume })
    .eq("id", workoutId)

  if (volumeUpdateError) {
    throw new Error(volumeUpdateError.message)
  }

  // PR detection and progressive-overload analysis are best-effort enrichment.
  // A failure here must never undo the volume already persisted above.
  let prCount = 0
  const sessionsByExercise = new Map<string, Map<string, ExerciseSessionInput>>()
  try {
    const uniqueExerciseIds = Array.from(new Set(exercises.map((ex) => ex.exercise_id)))

    const { data: historyExercises, error: historyExerciseError } = await supabase
      .from("workout_exercises")
      .select("id, exercise_id, name, workout_id, workouts!inner(user_id, performed_at)")
      .in("exercise_id", uniqueExerciseIds)
      .eq("workouts.user_id", userId)

    if (historyExerciseError) {
      throw new Error(historyExerciseError.message)
    }

    const historyExercisesList = (historyExercises || []) as unknown as Array<{
      id: string
      exercise_id: string
      name: string
      workout_id: string
      workouts: { user_id: string; performed_at: string }
    }>

    const historyExerciseIds = historyExercisesList.map((ex) => ex.id)
    const { data: historySets, error: historySetError } = await supabase
      .from("workout_sets")
      .select("workout_exercise_id, set_index, reps, weight, completed")
      .in("workout_exercise_id", historyExerciseIds)
      .eq("completed", true)

    if (historySetError) {
      throw new Error(historySetError.message)
    }

    const historyExerciseById = new Map<
      string,
      { exercise_id: string; workout_id: string; performed_at: string }
    >()
    historyExercisesList.forEach((ex) => {
      historyExerciseById.set(ex.id, {
        exercise_id: ex.exercise_id,
        workout_id: ex.workout_id,
        performed_at: ex.workouts?.performed_at ?? "",
      })
    })

    ;(historySets || []).forEach((row: WorkoutSetRow) => {
      const exerciseInfo = historyExerciseById.get(row.workout_exercise_id)
      if (!exerciseInfo || !exerciseInfo.performed_at) return
      let byWorkout = sessionsByExercise.get(exerciseInfo.exercise_id)
      if (!byWorkout) {
        byWorkout = new Map()
        sessionsByExercise.set(exerciseInfo.exercise_id, byWorkout)
      }
      let session = byWorkout.get(exerciseInfo.workout_id)
      if (!session) {
        session = {
          workoutId: exerciseInfo.workout_id,
          performedAt: exerciseInfo.performed_at,
          sets: [],
        }
        byWorkout.set(exerciseInfo.workout_id, session)
      }
      session.sets.push({ reps: row.reps, weight: row.weight, completed: row.completed })
    })

    const previousBestE1rm = new Map<string, { value: number; set: WorkoutSetRow }>()
    const previousBestVolume = new Map<string, number>()
    const volumeByExerciseSession = new Map<string, number>()

    ;(historySets || []).forEach((row: WorkoutSetRow) => {
      if (!row.completed) return
      const exerciseInfo = historyExerciseById.get(row.workout_exercise_id)
      if (!exerciseInfo) return
      if (exerciseInfo.workout_id === workoutId) return
      if (typeof row.reps !== "number" || typeof row.weight !== "number") return
      if (row.reps <= 0 || row.weight <= 0) return

      const e1rmValue = row.weight * (1 + row.reps / 30)
      const currentBest = previousBestE1rm.get(exerciseInfo.exercise_id)
      if (!currentBest || e1rmValue > currentBest.value) {
        previousBestE1rm.set(exerciseInfo.exercise_id, { value: e1rmValue, set: row })
      }

      const volume = row.reps * row.weight
      const sessionKey = `${exerciseInfo.exercise_id}::${exerciseInfo.workout_id}`
      const sessionVolume = volumeByExerciseSession.get(sessionKey) ?? 0
      volumeByExerciseSession.set(sessionKey, sessionVolume + volume)
    })

    volumeByExerciseSession.forEach((volume, sessionKey) => {
      const [exerciseId] = sessionKey.split("::")
      const currentBest = previousBestVolume.get(exerciseId) ?? 0
      if (volume > currentBest) {
        previousBestVolume.set(exerciseId, volume)
      }
    })

    await supabase.from("workout_prs").delete().eq("workout_id", workoutId)

    const prRows: Array<{
      user_id: string
      workout_id: string
      exercise_id: string
      exercise_name: string
      pr_type: "e1rm" | "volume"
      value: number
      previous_value: number | null
      context: Record<string, unknown>
    }> = []

    const currentExerciseGroups = new Map<string, CompletedSetRecord[]>()
    currentSets.forEach((set) => {
      if (!currentExerciseGroups.has(set.exerciseId)) {
        currentExerciseGroups.set(set.exerciseId, [])
      }
      currentExerciseGroups.get(set.exerciseId)?.push(set)
    })

    currentExerciseGroups.forEach((sets, exerciseId) => {
      const exerciseName = sets[0]?.exerciseName || "Exercise"
      const bestSet = computeBestE1rmSet(sets)
      if (bestSet) {
        const previous = previousBestE1rm.get(exerciseId)?.value ?? null
        if (isNewBest(bestSet.value, previous)) {
          prRows.push({
            user_id: userId,
            workout_id: workoutId,
            exercise_id: exerciseId,
            exercise_name: exerciseName,
            pr_type: "e1rm",
            value: bestSet.value,
            previous_value: previous,
            context: {
              weight: bestSet.set.weight,
              reps: bestSet.set.reps,
              setIndex: bestSet.set.setIndex ?? null,
            },
          })
        }
      }

      const currentVolume = currentExerciseVolumes.get(exerciseId) ?? 0
      const previousVolume = previousBestVolume.get(exerciseId) ?? null
      if (currentVolume > 0 && isNewBest(currentVolume, previousVolume)) {
        prRows.push({
          user_id: userId,
          workout_id: workoutId,
          exercise_id: exerciseId,
          exercise_name: exerciseName,
          pr_type: "volume",
          value: currentVolume,
          previous_value: previousVolume,
          context: {
            exercise_session_volume_lb: currentVolume,
          },
        })
      }
    })

    if (prRows.length > 0) {
      const { error: prError } = await supabase.from("workout_prs").insert(prRows)
      if (prError) {
        throw new Error(prError.message)
      }
    }

    prCount = prRows.length
    const { error: prCountUpdateError } = await supabase
      .from("workouts")
      .update({ pr_count: prCount })
      .eq("id", workoutId)

    if (prCountUpdateError) {
      throw new Error(prCountUpdateError.message)
    }
  } catch (error) {
    console.error("PR detection failed:", error)
  }

  // Progressive-overload stall detection. Failures here must never break the
  // caller — the alert is a nudge, not part of the commit path.
  try {
    await generateProgressStallAlerts({
      supabase,
      userId,
      workoutId,
      exercises,
      sessionsByExercise,
    })
  } catch (error) {
    console.error("Progressive overload detection failed:", error)
  }

  return { total_volume_lb: totalVolume, pr_count: prCount }
}

const STALL_FLAGS = ["STALE", "REGRESSION"] as const
const NUDGE_COOLDOWN_DAYS = 7
// Cap nudges per completion so a backlog of stalls doesn't flood the banner;
// the rest surface on later workouts once the cooldown clears the queue.
const MAX_ALERTS_PER_WORKOUT = 3

async function generateProgressStallAlerts(params: {
  supabase: SupabaseAdminClient
  userId: string
  workoutId: string
  exercises: WorkoutExerciseRow[]
  sessionsByExercise: Map<string, Map<string, ExerciseSessionInput>>
}) {
  const { supabase, userId, workoutId, exercises, sessionsByExercise } = params

  const { data: deloadRows, error: deloadError } = await supabase
    .from("deload_weeks")
    .select("started_at, ends_at")
    .eq("user_id", userId)

  if (deloadError) throw new Error(deloadError.message)

  const now = Date.now()
  const deloadRanges: DeloadRange[] = (deloadRows || []).map((row) => ({
    start: row.started_at,
    end: row.ends_at,
  }))
  const inActiveDeload = deloadRanges.some((range) => {
    const start = Date.parse(range.start)
    const end = Date.parse(range.end)
    return !Number.isNaN(start) && !Number.isNaN(end) && now >= start && now <= end
  })
  // During a deload the user is intentionally not progressing — stay quiet.
  if (inActiveDeload) return

  const cooldownStart = new Date(now - NUDGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentAlerts, error: recentError } = await supabase
    .from("workout_alerts")
    .select("exercise_name, context")
    .eq("user_id", userId)
    .in("flag", STALL_FLAGS as unknown as string[])
    .gte("created_at", cooldownStart)

  if (recentError) throw new Error(recentError.message)

  const recentlyNudged = new Set<string>()
  ;(recentAlerts || []).forEach((alert) => {
    const contextExerciseId = (alert.context as Record<string, unknown> | null)?.exercise_id
    if (typeof contextExerciseId === "string") recentlyNudged.add(contextExerciseId)
    if (alert.exercise_name) recentlyNudged.add(alert.exercise_name)
  })

  const evaluated = new Set<string>()
  const candidates: Array<{
    stalledSessions: number
    row: {
      user_id: string
      workout_id: string
      exercise_name: string
      flag: string
      tier: number
      message: string
      action: string
      context: Record<string, unknown>
    }
  }> = []

  exercises.forEach((exercise) => {
    if (evaluated.has(exercise.exercise_id)) return
    evaluated.add(exercise.exercise_id)
    if (isWarmupExercise(exercise.name)) return
    if (recentlyNudged.has(exercise.exercise_id) || recentlyNudged.has(exercise.name)) return

    const sessions = sessionsByExercise.get(exercise.exercise_id)
    if (!sessions) return

    const result = detectProgressStall(Array.from(sessions.values()), { deloadRanges })
    if (!result) return

    const content = buildStallAlertContent(exercise.exercise_id, exercise.name, result)
    candidates.push({
      stalledSessions: result.stalledSessions,
      row: {
        user_id: userId,
        workout_id: workoutId,
        exercise_name: exercise.name,
        flag: content.flag,
        tier: content.tier,
        message: content.message,
        action: content.action,
        context: content.context,
      },
    })
  })

  if (candidates.length === 0) return

  const alertRows = candidates
    .sort((a, b) => a.row.tier - b.row.tier || b.stalledSessions - a.stalledSessions)
    .slice(0, MAX_ALERTS_PER_WORKOUT)
    .map((candidate) => candidate.row)

  const { error: insertError } = await supabase.from("workout_alerts").insert(alertRows)
  if (insertError) throw new Error(insertError.message)
}
