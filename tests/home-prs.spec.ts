import { test, expect } from "@playwright/test"

const routine = {
  id: "test-routine",
  name: "Upper Body – Rows, Chest & Arms",
  description: "Demo routine",
  estimatedTime: "45 min",
  category: "Test",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  exercises: [
    { id: "ex-1", name: "Overhand Row", type: "strength", targetSets: 2, targetReps: "6-8" },
    { id: "ex-2", name: "Incline Dumbbell Bench", type: "strength", targetSets: 2, targetReps: "6-8" },
    { id: "ex-3", name: "Rear Delt Cable Fly", type: "strength", targetSets: 2, targetReps: "8-10" },
    { id: "ex-4", name: "Machine Chest Fly", type: "strength", targetSets: 2, targetReps: "6-8" },
    { id: "ex-5", name: "Dumbbell Hammer Curls", type: "strength", targetSets: 2, targetReps: "6-8" },
  ],
}

const workout = {
  id: "workout-1",
  name: routine.name,
  date: new Date().toISOString(),
  duration: 1800,
  exercises: routine.exercises.map((ex) => ({
    id: ex.id,
    name: ex.name,
    targetSets: ex.targetSets,
    targetReps: ex.targetReps,
    restTime: 90,
    completed: true,
    sets: [
      { weight: 50, reps: 8, completed: true },
      { weight: 50, reps: 7, completed: true },
    ],
  })),
  stats: {
    totalSets: 10,
    completedSets: 10,
    totalVolume: 7000,
    totalReps: 75,
  },
}

test("shows PRs and view-all button", async ({ page }) => {
  await page.addInitScript(({ routineSeed, workoutSeed }) => {
    localStorage.setItem("workout_routines_v2", JSON.stringify([routineSeed]))
    localStorage.setItem("workout_history", JSON.stringify([workoutSeed]))
  }, { routineSeed: routine, workoutSeed: workout })

  await page.goto("/")

  await expect(page.getByText(/Personal Records/i)).toBeVisible()
  await expect(page.getByText("Overhand Row")).toBeVisible()

  await expect(page.getByRole("button", { name: "View all" })).toBeVisible()
})

test("PRs appear after schedule change to matching routine", async ({ page }) => {
  const nextWorkout = {
    ...workout,
    id: "workout-2",
    date: new Date().toISOString(),
  }

  await page.addInitScript(({ routineSeed, workoutSeed }) => {
    localStorage.setItem("workout_routines_v2", JSON.stringify([routineSeed]))
    localStorage.setItem("workout_history", JSON.stringify([workoutSeed]))
    localStorage.removeItem("workout_schedule")
  }, { routineSeed: routine, workoutSeed: nextWorkout })

  await page.goto("/schedule")

  const browserDayIndex = await page.evaluate(() => new Date().getDay())
  const dayIndex = (browserDayIndex + 6) % 7
  const select = page.getByRole("combobox").nth(dayIndex)
  await select.selectOption(routine.id)

  await page.getByRole("button", { name: "Save schedule" }).click()
  await expect(page.getByText("Schedule saved.")).toBeVisible()

  await page.goto("/")
  await expect(page.getByText(/Personal Records/i)).toBeVisible()
  await expect(page.getByText("Overhand Row")).toBeVisible()
})
