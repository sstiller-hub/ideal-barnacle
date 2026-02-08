import { test, expect } from "@playwright/test"
import fs from "node:fs"

const routine = {
  id: "test-routine",
  name: "Upper Body – Rows, Chest & Arms",
  description: "Demo routine",
  estimatedTime: "45 min",
  category: "Test",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  exercises: [
    { id: "ex-1", name: "Overhand Row", type: "strength", targetSets: 2, targetReps: "6-8", notes: "Rest 5m" },
    { id: "ex-2", name: "Incline Dumbbell Bench", type: "strength", targetSets: 2, targetReps: "6-8", notes: "Rest 5m" },
  ],
}

test("starts rest timer after completing a set", async ({ page }) => {
  await page.addInitScript((routineSeed) => {
    if (localStorage.getItem("__rest_timer_seeded") === "true") return
    localStorage.setItem("workout_routines_v2", JSON.stringify([routineSeed]))
    localStorage.removeItem("workoutSessions")
    localStorage.removeItem("workoutSets")
    localStorage.removeItem("currentSessionId")
    localStorage.setItem("__rest_timer_seeded", "true")
  }, routine)

  await page.goto(`/workout/session?routineId=${routine.id}`)

  const weightInput = page.locator('input[type="number"]').nth(0)
  const repsInput = page.locator('input[type="number"]').nth(1)
  await weightInput.fill("100")
  await repsInput.fill("8")

  await page.getByRole("button", { name: /complete set/i }).click()
  const skipRest = page.getByText(/skip/i)
  await expect(skipRest).toBeVisible()

  const pill = page.locator("text=/^\\d+:\\d{2}$/").first()
  const initial = (await pill.textContent()) || ""
  await page.waitForTimeout(1200)
  const next = (await pill.textContent()) || ""
  expect(initial).not.toBe("")
  expect(next).not.toBe("")
  expect(next).not.toBe(initial)
})

test("rest timer persists after reload", async ({ page }) => {
  await page.addInitScript((routineSeed) => {
    if (localStorage.getItem("__rest_timer_seeded") === "true") return
    localStorage.setItem("workout_routines_v2", JSON.stringify([routineSeed]))
    localStorage.removeItem("workoutSessions")
    localStorage.removeItem("workoutSets")
    localStorage.removeItem("currentSessionId")
    localStorage.setItem("__rest_timer_seeded", "true")
  }, routine)

  await page.goto(`/workout/session?routineId=${routine.id}`)

  const weightInput = page.locator('input[type="number"]').nth(0)
  const repsInput = page.locator('input[type="number"]').nth(1)
  await weightInput.fill("100")
  await repsInput.fill("8")

  await page.getByRole("button", { name: /complete set/i }).click()
  await expect(page.getByText(/skip/i)).toBeVisible()
  await page.waitForFunction(() => {
    try {
      const sessions = JSON.parse(localStorage.getItem("workoutSessions") || "[]")
      return sessions.some((session: any) => session.restTimer?.startedAt)
    } catch {
      return false
    }
  })

  await page.reload()
  const storageSnapshot = await page.evaluate(() => ({
    currentSessionId: localStorage.getItem("currentSessionId"),
    workoutSessions: localStorage.getItem("workoutSessions"),
  }))
  const outputPath = test.info().outputPath("rest-timer-storage.json")
  fs.writeFileSync(outputPath, JSON.stringify(storageSnapshot, null, 2))
  await expect(page.getByText(/skip/i)).toBeVisible({ timeout: 15000 })

  const pill = page.locator("text=/^\\d+:\\d{2}$/").first()
  const initial = (await pill.textContent()) || ""
  await page.waitForTimeout(1200)
  const next = (await pill.textContent()) || ""
  expect(initial).not.toBe("")
  expect(next).not.toBe("")
  expect(next).not.toBe(initial)
})
