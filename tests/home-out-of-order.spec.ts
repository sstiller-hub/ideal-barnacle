import { test, expect } from "@playwright/test"

// Home screen behaviour when the workout you did isn't the one the schedule
// planned, and when the caret picker is used to override a day.

const upperRoutine = {
  id: "growth-v2-upper-1",
  name: "Upper 1 – Chest + Lats",
  description: "Demo routine",
  estimatedTime: "45 min",
  category: "Test",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  exercises: [
    { id: "up-1", name: "Incline Press Machine", type: "strength", targetSets: 4, targetReps: "6-9" },
    { id: "up-2", name: "Lat Pulldown", type: "strength", targetSets: 3, targetReps: "8-12" },
  ],
}

const legsRoutine = {
  id: "growth-v2-legs-1",
  name: "Legs 1 – Quad Dominant",
  description: "Demo routine",
  estimatedTime: "60 min",
  category: "Test",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  exercises: [
    { id: "lg-1", name: "Hip Adduction", type: "strength", targetSets: 3, targetReps: "12-15" },
    { id: "lg-2", name: "Arsenal Pendulum Squat", type: "strength", targetSets: 3, targetReps: "6-9" },
  ],
}

const completedLegsWorkout = {
  id: "workout-legs-today",
  name: legsRoutine.name,
  date: new Date().toISOString(),
  duration: 3600,
  exercises: legsRoutine.exercises.map((ex) => ({
    id: ex.id,
    name: ex.name,
    targetSets: ex.targetSets,
    targetReps: ex.targetReps,
    restTime: 90,
    completed: true,
    sets: [
      { weight: 100, reps: 8, completed: true },
      { weight: 100, reps: 8, completed: true },
    ],
  })),
  stats: { totalSets: 4, completedSets: 4, totalVolume: 3200, totalReps: 32 },
}

const todayKey = () => {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`
}

test("a completed day is titled by the workout actually done, not the scheduled one", async ({ page }) => {
  await page.addInitScript(
    ({ routines, workout, scheduleKey, scheduled }) => {
      localStorage.clear()
      localStorage.setItem("workout_routines_v2", JSON.stringify(routines))
      localStorage.setItem("workout_history", JSON.stringify([workout]))
      localStorage.setItem("workout_schedule", JSON.stringify({ [scheduleKey]: scheduled }))
    },
    {
      routines: [upperRoutine, legsRoutine],
      workout: completedLegsWorkout,
      scheduleKey: todayKey(),
      scheduled: { routineId: upperRoutine.id, routineName: upperRoutine.name },
    }
  )

  await page.goto("/")

  await expect(page.getByText("COMPLETE", { exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lower")
  // The exercise also shows up as an all-time PR card, so scope to the list row.
  await expect(page.getByText("Arsenal Pendulum Squat").first()).toBeVisible()
  await expect(page.getByText("Incline Press Machine")).toHaveCount(0)
})

test("caret picker offers the current program and swaps the list when nothing is stored", async ({ page }) => {
  await page.addInitScript((scheduleKey) => {
    localStorage.clear()
    // No routine library stored at all: the picker must still list the
    // current Growth V2 routines rather than the legacy template.
    localStorage.setItem("workout_schedule", JSON.stringify({ [scheduleKey]: null }))
  }, todayKey())

  await page.goto("/")

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rest")
  await page.getByRole("heading", { level: 1 }).click()

  await expect(page.getByRole("button", { name: "Legs 1 – Quad Dominant" })).toBeVisible()
  await expect(page.getByRole("button", { name: /Upper Body – Rows, Chest & Arms/ })).toHaveCount(0)

  await page.getByRole("button", { name: "Legs 1 – Quad Dominant" }).click()

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lower")
  await expect(page.getByText("Arsenal Pendulum Squat")).toBeVisible()
  await expect(page.getByText("Overhand row", { exact: true })).toHaveCount(0)

  // Switch again: the list must follow the new pick, not the previous one.
  await page.getByRole("heading", { level: 1 }).click()
  await page.getByRole("button", { name: "Upper 1 – Chest + Lats" }).click()

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Upper")
  await expect(page.getByText("Incline Press Machine")).toBeVisible()
  await expect(page.getByText("Arsenal Pendulum Squat")).toHaveCount(0)
})
