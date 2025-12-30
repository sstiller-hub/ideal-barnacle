import type { CompletedWorkout, Exercise, WorkoutSet } from "./workout-storage"
import type { PersonalRecord } from "./pr-types"
import type { WorkoutRoutine } from "./routine-storage"
import { getRoutines } from "./routine-storage"
import { getScheduledWorkoutForDate } from "./schedule-storage"
import { GROWTH_V2_ROUTINES, GROWTH_V2_WEEKLY } from "./growth-v2-plan"

function createSet(weight: number, reps: number, completed = true): WorkoutSet {
  return { weight, reps, completed }
}

function createExercise(
  exerciseId: string,
  name: string,
  sets: WorkoutSet[],
  targetSets = 3,
  targetReps = "8-10",
): Exercise {
  return {
    id: exerciseId,
    name,
    targetSets,
    targetReps,
    restTime: 120,
    completed: sets.every((s) => s.completed),
    sets,
  }
}

function minutesToSeconds(minutes: number): number {
  return minutes * 60
}

function parseTargetReps(targetReps?: string): number {
  if (!targetReps) return 8
  const segment = targetReps.split("/")[0]?.trim() ?? targetReps
  const match = segment.match(/(\d+)/)
  return match ? Number(match[1]) : 8
}

function hashToWeight(name: string, type: string): number {
  if (type === "other") return 0
  const hash = Array.from(name).reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return 40 + (hash % 8) * 5
}

function getScheduledRoutine(date: Date, routines: WorkoutRoutine[]): WorkoutRoutine | null {
  const routineById = new Map(routines.map((routine) => [routine.id, routine]))
  const growthById = new Map(GROWTH_V2_ROUTINES.map((routine) => [routine.id, routine]))
  const resolveRoutine = (entry: { routineId: string; routineName: string } | null | undefined) => {
    if (!entry) return null
    return (
      routineById.get(entry.routineId) ||
      growthById.get(entry.routineId) ||
      routines.find((routine) => routine.name === entry.routineName) ||
      GROWTH_V2_ROUTINES.find((routine) => routine.name === entry.routineName) ||
      null
    )
  }

  const manualSchedule = getScheduledWorkoutForDate(date)
  if (manualSchedule === null) {
    return null
  }
  if (manualSchedule) {
    return resolveRoutine(manualSchedule)
  }
  const fallback = GROWTH_V2_WEEKLY[date.getDay()] ?? null
  return resolveRoutine(fallback)
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
}

export function seedDemoData() {
  console.log("[v0] Starting demo data seed...")

  localStorage.removeItem("workout_history")
  localStorage.removeItem("personal_records")
  localStorage.removeItem("current_session_id")
  localStorage.removeItem("workout_session")

  const workouts: CompletedWorkout[] = []
  const routines = getRoutines()
  const routinesFallback = routines.length > 0 ? routines : GROWTH_V2_ROUTINES
  const exerciseOccurrences = new Map<string, number>()

  const start = new Date()
  start.setHours(0, 0, 0, 0)

  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date(start)
    date.setDate(start.getDate() - offset)
    const routine = getScheduledRoutine(date, routinesFallback)
    if (!routine) continue

    const exercises: Exercise[] = routine.exercises.map((exercise) => {
      const occurrence = exerciseOccurrences.get(exercise.name) ?? 0
      const baseWeight = hashToWeight(exercise.name, exercise.type)
      const targetReps = parseTargetReps(exercise.targetReps)
      const repsBoost = occurrence > 0 ? 1 : 0
      const setCount = exercise.targetSets ?? 3

      const sets = Array.from({ length: setCount }).map((_, index) => {
        const reps = Math.max(1, targetReps + repsBoost - Math.min(index, 1))
        const weight = Math.max(0, baseWeight + occurrence * 5)
        return createSet(weight, reps, true)
      })

      exerciseOccurrences.set(exercise.name, occurrence + 1)

      return createExercise(
        `ex_${exercise.id}_${date.getTime()}`,
        exercise.name,
        sets,
        setCount,
        exercise.targetReps ?? "8-10",
      )
    })

    const stats = exercises.reduce(
      (acc, exercise) => {
        exercise.sets.forEach((set) => {
          acc.totalSets += 1
          if (set.completed) acc.completedSets += 1
          acc.totalReps += set.reps ?? 0
          acc.totalVolume += (set.weight ?? 0) * (set.reps ?? 0)
        })
        return acc
      },
      { totalSets: 0, completedSets: 0, totalVolume: 0, totalReps: 0 },
    )

    workouts.push({
      id: `w_${date.getTime()}_${routine.id}`,
      name: routine.name,
      date: date.toISOString(),
      duration: minutesToSeconds(45 + routine.exercises.length * 2),
      exercises,
      stats,
    })
  }

  workouts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  localStorage.setItem("workout_history", JSON.stringify(workouts))
  console.log(`[v0] Saved ${workouts.length} demo workouts`)

  const bestByExercise = new Map<
    string,
    { weight: number; reps: number; workoutId: string; workoutDate: string }
  >()

  workouts.forEach((workout) => {
    workout.exercises.forEach((exercise) => {
      exercise.sets.forEach((set, index) => {
        const weight = set.weight ?? 0
        const reps = set.reps ?? 0
        if (weight <= 0 || reps <= 0) return
        const existing = bestByExercise.get(exercise.name)
        if (!existing || weight > existing.weight) {
          bestByExercise.set(exercise.name, {
            weight,
            reps,
            workoutId: workout.id,
            workoutDate: workout.date,
          })
        }
      })
    })
  })

  const prs: PersonalRecord[] = Array.from(bestByExercise.entries()).map(([name, best], index) => ({
    id: `pr_${index + 1}`,
    userId: "default_user",
    exerciseId: slugify(name),
    exerciseName: name,
    metric: "weight",
    valueNumber: best.weight,
    unit: "lb",
    contextJson: { reps: best.reps, setIndex: 0, workoutId: best.workoutId, workoutDate: best.workoutDate },
    achievedAt: best.workoutDate,
    createdAt: best.workoutDate,
    updatedAt: best.workoutDate,
  }))

  localStorage.setItem("personal_records", JSON.stringify(prs))
  console.log(`[v0] Saved ${prs.length} personal records`)

  console.log("[v0] Demo data seed complete!")
  return { workouts: workouts.length, prs: prs.length }
}
