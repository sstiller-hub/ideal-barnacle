import type { CompletedWorkout, Exercise, WorkoutSet } from "./workout-storage"
import type { PersonalRecord } from "./pr-types"

function daysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

function createSet(weight: number, reps: number, completed = true): WorkoutSet {
  return { weight, reps, completed }
}

function createExercise(name: string, sets: WorkoutSet[], targetSets = 3, targetReps = "8-10"): Exercise {
  return {
    id: `ex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    targetSets,
    targetReps,
    restTime: 120,
    completed: sets.every((s) => s.completed),
    sets,
  }
}

export function seedDemoData() {
  console.log("[v0] Starting demo data seed...")

  localStorage.removeItem("workout_history")
  localStorage.removeItem("personal_records")
  localStorage.removeItem("current_session_id")
  localStorage.removeItem("workout_session")

  const workouts: CompletedWorkout[] = []

  // Week 8 - Upper Body Rows, Chest & Arms
  workouts.push({
    id: `w_${Date.now()}_1`,
    name: "Upper Body – Rows, Chest & Arms",
    date: daysAgo(56),
    duration: 58,
    exercises: [
      createExercise("Overhand row (captioned)", [createSet(100, 8), createSet(100, 7)], 2, "6-8"),
      createExercise("Incline dumbbell bench", [createSet(50, 8), createSet(50, 7)], 2, "6-8"),
      createExercise("Rear delt cable fly", [createSet(30, 10), createSet(30, 9)], 2, "8-10"),
      createExercise("Machine chest fly", [createSet(80, 8), createSet(80, 7)], 2, "6-8"),
      createExercise("Tricep dip machine (plate loaded)", [createSet(90, 10), createSet(90, 9)], 2, "8-10"),
      createExercise("Dumbbell hammer curls", [createSet(30, 8), createSet(30, 7)], 2, "6-8"),
    ],
    stats: { totalSets: 12, completedSets: 12, totalVolume: 4560, totalReps: 96 },
  })

  // Week 7 - Upper Body Chest, Back & Shoulders
  workouts.push({
    id: `w_${Date.now()}_2`,
    name: "Upper Body – Chest, Back & Shoulders",
    date: daysAgo(49),
    duration: 60,
    exercises: [
      createExercise("Incline Smith machine bench", [createSet(135, 10), createSet(135, 9)], 2, "8-10"),
      createExercise("Machine chest press", [createSet(180, 8), createSet(180, 7)], 2, "5-8"),
      createExercise("Lat pulldown", [createSet(120, 8), createSet(120, 7)], 2, "6-8"),
      createExercise("Chest dips", [createSet(0, 8), createSet(0, 7)], 2, "6-8"),
      createExercise("Tricep double rope pushdown", [createSet(50, 10), createSet(50, 9), createSet(50, 8)], 3, "8-10"),
    ],
    stats: { totalSets: 11, completedSets: 11, totalVolume: 6120, totalReps: 91 },
  })

  // Week 6 - Upper Body Shoulders, Chest & Arms
  workouts.push({
    id: `w_${Date.now()}_3`,
    name: "Upper Body – Shoulders, Chest & Arms",
    date: daysAgo(42),
    duration: 57,
    exercises: [
      createExercise("Smith machine shoulder press", [createSet(95, 6), createSet(95, 5), createSet(95, 4)], 3, "4-6"),
      createExercise("Incline machine chest press (captioned)", [createSet(140, 7), createSet(140, 6)], 2, "5-7"),
      createExercise("Machine rear delt fly", [createSet(80, 10), createSet(80, 9)], 2, "7-10"),
      createExercise("Cable lateral raise (with wrist strap)", [createSet(15, 7), createSet(15, 6)], 2, "5-7"),
      createExercise(
        "Single arm tricep pushdown (with wrist strap)",
        [createSet(25, 8), createSet(25, 7), createSet(25, 6)],
        3,
        "6-8",
      ),
      createExercise("Bayesian biceps cable curl", [createSet(20, 10), createSet(20, 9), createSet(20, 8)], 3, "6-10"),
    ],
    stats: { totalSets: 15, completedSets: 15, totalVolume: 4985, totalReps: 108 },
  })

  // Week 5 - Legs 1
  workouts.push({
    id: `w_${Date.now()}_4`,
    name: "Lower Body – Quads & Hamstrings (Legs 1)",
    date: daysAgo(35),
    duration: 55,
    exercises: [
      createExercise("Hip adduction", [createSet(100, 15), createSet(100, 14), createSet(100, 13)], 3, "12-15"),
      createExercise("Pendulum squat", [createSet(200, 7), createSet(200, 6)], 2, "5-7"),
      createExercise("Dumbbell split squat (squat rack setup)", [createSet(50, 10), createSet(50, 9)], 2, "8-10"),
      createExercise("Leg extension", [createSet(120, 8), createSet(120, 7), createSet(120, 6)], 3, "6-8"),
      createExercise("Seated hamstring curl", [createSet(90, 8), createSet(90, 7), createSet(90, 6)], 3, "6-8"),
    ],
    stats: { totalSets: 13, completedSets: 13, totalVolume: 11460, totalReps: 122 },
  })

  // Week 4 - Upper Body Rows (with progression)
  workouts.push({
    id: `w_${Date.now()}_5`,
    name: "Upper Body – Rows, Chest & Arms",
    date: daysAgo(28),
    duration: 59,
    exercises: [
      createExercise("Overhand row (captioned)", [createSet(110, 8), createSet(110, 7)], 2, "6-8"),
      createExercise("Incline dumbbell bench", [createSet(55, 8), createSet(55, 7)], 2, "6-8"),
      createExercise("Rear delt cable fly", [createSet(35, 10), createSet(35, 9)], 2, "8-10"),
      createExercise("Machine chest fly", [createSet(90, 8), createSet(90, 7)], 2, "6-8"),
      createExercise("Dumbbell hammer curls", [createSet(35, 8), createSet(35, 7)], 2, "6-8"),
    ],
    stats: { totalSets: 10, completedSets: 10, totalVolume: 4860, totalReps: 80 },
  })

  // Week 3 - Shoulders (with progression)
  workouts.push({
    id: `w_${Date.now()}_6`,
    name: "Upper Body – Shoulders, Chest & Arms",
    date: daysAgo(21),
    duration: 58,
    exercises: [
      createExercise(
        "Smith machine shoulder press",
        [createSet(105, 6), createSet(105, 5), createSet(105, 5)],
        3,
        "4-6",
      ),
      createExercise("Incline machine chest press (captioned)", [createSet(160, 7), createSet(160, 6)], 2, "5-7"),
      createExercise("Machine rear delt fly", [createSet(90, 10), createSet(90, 9)], 2, "7-10"),
      createExercise("Cable lateral raise (with wrist strap)", [createSet(20, 7), createSet(20, 6)], 2, "5-7"),
      createExercise("Bayesian biceps cable curl", [createSet(25, 10), createSet(25, 9), createSet(25, 8)], 3, "6-10"),
    ],
    stats: { totalSets: 12, completedSets: 12, totalVolume: 5725, totalReps: 92 },
  })

  // Week 2 - Legs 2
  workouts.push({
    id: `w_${Date.now()}_7`,
    name: "Lower Body – Glutes & Hamstrings (Legs 2)",
    date: daysAgo(14),
    duration: 62,
    exercises: [
      createExercise("Seated hamstring curl", [createSet(100, 10), createSet(100, 9)], 2, "8-10"),
      createExercise("Belt squat RDL", [createSet(180, 8), createSet(180, 7), createSet(180, 6)], 3, "6-8"),
      createExercise("Hip thrust", [createSet(225, 8), createSet(225, 7), createSet(225, 6)], 3, "6-8"),
      createExercise("Single leg RDL (bench supported)", [createSet(40, 10), createSet(40, 9)], 2, "8-10"),
      createExercise("Leg extension", [createSet(130, 10), createSet(130, 9)], 2, "8-10"),
    ],
    stats: { totalSets: 12, completedSets: 12, totalVolume: 13890, totalReps: 99 },
  })

  // Week 1 - Recent Shoulders workout (best PRs)
  workouts.push({
    id: `w_${Date.now()}_8`,
    name: "Upper Body – Shoulders, Chest & Arms",
    date: daysAgo(7),
    duration: 59,
    exercises: [
      createExercise(
        "Smith machine shoulder press",
        [createSet(115, 6), createSet(115, 6), createSet(115, 5)],
        3,
        "4-6",
      ),
      createExercise("Incline machine chest press (captioned)", [createSet(180, 7), createSet(180, 6)], 2, "5-7"),
      createExercise("Machine rear delt fly", [createSet(100, 10), createSet(100, 9)], 2, "7-10"),
      createExercise("Cable lateral raise (with wrist strap)", [createSet(25, 7), createSet(25, 6)], 2, "5-7"),
      createExercise(
        "Single arm tricep pushdown (with wrist strap)",
        [createSet(30, 8), createSet(30, 8), createSet(30, 7)],
        3,
        "6-8",
      ),
      createExercise("Bayesian biceps cable curl", [createSet(30, 10), createSet(30, 9), createSet(30, 8)], 3, "6-10"),
    ],
    stats: { totalSets: 15, completedSets: 15, totalVolume: 7040, totalReps: 116 },
  })

  // Most recent - Legs 1 workout (best leg PRs)
  workouts.push({
    id: `w_${Date.now()}_9`,
    name: "Lower Body – Quads & Hamstrings (Legs 1)",
    date: daysAgo(3),
    duration: 56,
    exercises: [
      createExercise("Hip adduction", [createSet(120, 15), createSet(120, 14), createSet(120, 13)], 3, "12-15"),
      createExercise("Pendulum squat", [createSet(230, 7), createSet(230, 6)], 2, "5-7"),
      createExercise("Dumbbell split squat (squat rack setup)", [createSet(60, 10), createSet(60, 9)], 2, "8-10"),
      createExercise("Leg extension", [createSet(140, 8), createSet(140, 7), createSet(140, 7)], 3, "6-8"),
      createExercise("Seated hamstring curl", [createSet(110, 8), createSet(110, 7), createSet(110, 7)], 3, "6-8"),
      createExercise("Single leg hamstring curl", [createSet(50, 10), createSet(50, 9)], 2, "8-10"),
    ],
    stats: { totalSets: 15, completedSets: 15, totalVolume: 15460, totalReps: 137 },
  })

  localStorage.setItem("workout_history", JSON.stringify(workouts))
  console.log(`[v0] Saved ${workouts.length} demo workouts`)

  const prs: PersonalRecord[] = [
    {
      id: "pr_1",
      userId: "default_user",
      exerciseId: "smith-machine-shoulder-press",
      exerciseName: "Smith machine shoulder press",
      metric: "weight",
      valueNumber: 115,
      unit: "lb",
      contextJson: { reps: 6, setIndex: 0, workoutId: workouts[7].id },
      achievedAt: workouts[7].date,
      createdAt: workouts[7].date,
      updatedAt: workouts[7].date,
    },
    {
      id: "pr_2",
      userId: "default_user",
      exerciseId: "incline-machine-chest-press",
      exerciseName: "Incline machine chest press (captioned)",
      metric: "weight",
      valueNumber: 180,
      unit: "lb",
      contextJson: { reps: 7, setIndex: 0, workoutId: workouts[7].id },
      achievedAt: workouts[7].date,
      createdAt: workouts[7].date,
      updatedAt: workouts[7].date,
    },
    {
      id: "pr_3",
      userId: "default_user",
      exerciseId: "machine-rear-delt-fly",
      exerciseName: "Machine rear delt fly",
      metric: "weight",
      valueNumber: 100,
      unit: "lb",
      contextJson: { reps: 10, setIndex: 0, workoutId: workouts[7].id },
      achievedAt: workouts[7].date,
      createdAt: workouts[7].date,
      updatedAt: workouts[7].date,
    },
    {
      id: "pr_4",
      userId: "default_user",
      exerciseId: "cable-lateral-raise",
      exerciseName: "Cable lateral raise (with wrist strap)",
      metric: "weight",
      valueNumber: 25,
      unit: "lb",
      contextJson: { reps: 7, setIndex: 0, workoutId: workouts[7].id },
      achievedAt: workouts[7].date,
      createdAt: workouts[7].date,
      updatedAt: workouts[7].date,
    },
    {
      id: "pr_5",
      userId: "default_user",
      exerciseId: "single-arm-tricep-pushdown",
      exerciseName: "Single arm tricep pushdown (with wrist strap)",
      metric: "weight",
      valueNumber: 30,
      unit: "lb",
      contextJson: { reps: 8, setIndex: 0, workoutId: workouts[7].id },
      achievedAt: workouts[7].date,
      createdAt: workouts[7].date,
      updatedAt: workouts[7].date,
    },
    {
      id: "pr_6",
      userId: "default_user",
      exerciseId: "bayesian-biceps-cable-curl",
      exerciseName: "Bayesian biceps cable curl",
      metric: "weight",
      valueNumber: 30,
      unit: "lb",
      contextJson: { reps: 10, setIndex: 0, workoutId: workouts[7].id },
      achievedAt: workouts[7].date,
      createdAt: workouts[7].date,
      updatedAt: workouts[7].date,
    },
    {
      id: "pr_7",
      userId: "default_user",
      exerciseId: "pendulum-squat",
      exerciseName: "Pendulum squat",
      metric: "weight",
      valueNumber: 230,
      unit: "lb",
      contextJson: { reps: 7, setIndex: 0, workoutId: workouts[8].id },
      achievedAt: workouts[8].date,
      createdAt: workouts[8].date,
      updatedAt: workouts[8].date,
    },
    {
      id: "pr_8",
      userId: "default_user",
      exerciseId: "leg-extension",
      exerciseName: "Leg extension",
      metric: "weight",
      valueNumber: 140,
      unit: "lb",
      contextJson: { reps: 8, setIndex: 0, workoutId: workouts[8].id },
      achievedAt: workouts[8].date,
      createdAt: workouts[8].date,
      updatedAt: workouts[8].date,
    },
    {
      id: "pr_9",
      userId: "default_user",
      exerciseId: "seated-hamstring-curl",
      exerciseName: "Seated hamstring curl",
      metric: "weight",
      valueNumber: 110,
      unit: "lb",
      contextJson: { reps: 8, setIndex: 0, workoutId: workouts[8].id },
      achievedAt: workouts[8].date,
      createdAt: workouts[8].date,
      updatedAt: workouts[8].date,
    },
    {
      id: "pr_10",
      userId: "default_user",
      exerciseId: "incline-dumbbell-bench",
      exerciseName: "Incline dumbbell bench",
      metric: "weight",
      valueNumber: 55,
      unit: "lb",
      contextJson: { reps: 8, setIndex: 0, workoutId: workouts[4].id },
      achievedAt: workouts[4].date,
      createdAt: workouts[4].date,
      updatedAt: workouts[4].date,
    },
  ]

  localStorage.setItem("personal_records", JSON.stringify(prs))
  console.log(`[v0] Saved ${prs.length} personal records`)

  console.log("[v0] Demo data seed complete!")
  return { workouts: workouts.length, prs: prs.length }
}
