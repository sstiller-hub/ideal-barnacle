import { test, expect } from "@playwright/test"

test("loads workout summary by id", async ({ page }) => {
  const workoutId = "workout-summary-1"
  const workout = {
    id: workoutId,
    name: "Upper Body – Rows, Chest & Arms",
    date: new Date().toISOString(),
    duration: 1800,
    exercises: [
      {
        id: "ex-1",
        name: "Overhand Row",
        targetSets: 2,
        targetReps: "6-8",
        restTime: 90,
        completed: true,
        sets: [
          { weight: 100, reps: 8, completed: true },
          { weight: 100, reps: 7, completed: true },
        ],
      },
    ],
    stats: {
      totalSets: 2,
      completedSets: 2,
      totalVolume: 1500,
      totalReps: 15,
    },
  }

  await page.addInitScript((workoutSeed) => {
    localStorage.setItem("workout_history", JSON.stringify([workoutSeed]))
  }, workout)

  await page.goto(`/workout-summary?workoutId=${workoutId}`)
  await expect(page.getByText("Workout Complete")).toBeVisible()
  await expect(page.getByText(workout.name)).toBeVisible()
})
