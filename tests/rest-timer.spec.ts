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

  await page.locator('button[aria-label="Complete Set"]:not([disabled])').first().click()
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

  await page.locator('button[aria-label="Complete Set"]:not([disabled])').first().click()
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

test("rest timer restarts when a set is unchecked and checked again", async ({ page }) => {
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

  const firstSetToggle = page.locator('button[aria-label="Complete Set"]:not([disabled])').first()
  await firstSetToggle.click()
  await expect(page.getByText(/skip/i)).toBeVisible()

  const toSeconds = (value: string) => {
    const match = value.match(/^(\d+):(\d{2})$/)
    if (!match) return null
    return Number(match[1]) * 60 + Number(match[2])
  }

  const firstCycleValue = (await page.locator("text=/^\\d+:\\d{2}$/").first().textContent()) || ""
  await page.waitForTimeout(2100)
  const laterFirstCycleValue = (await page.locator("text=/^\\d+:\\d{2}$/").first().textContent()) || ""
  expect(laterFirstCycleValue).not.toBe(firstCycleValue)
  const laterFirstCycleSeconds = toSeconds(laterFirstCycleValue)
  expect(laterFirstCycleSeconds).not.toBeNull()

  await page.getByRole("button", { name: "Mark Set Incomplete" }).first().click()
  await page.getByRole("button", { name: "Complete Set" }).first().click()

  const secondCycleValue = (await page.locator("text=/^\\d+:\\d{2}$/").first().textContent()) || ""
  const secondCycleSeconds = toSeconds(secondCycleValue)
  expect(secondCycleSeconds).not.toBeNull()
  expect(secondCycleSeconds!).toBeGreaterThanOrEqual(laterFirstCycleSeconds!)
})
