import { test, expect } from "@playwright/test"

const routine = {
  id: "growth-v2-upper-1",
  name: "Upper 1 – Chest + Lats",
  description: "Demo routine",
  estimatedTime: "45 min",
  category: "Test",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  exercises: [
    { id: "ex-1", name: "Overhand Row", type: "strength", targetSets: 2, targetReps: "6-8" },
  ],
}

const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

test("schedule editor saves and Home reflects rest day", async ({ page }) => {
  await page.addInitScript((routineSeed) => {
    if (localStorage.getItem("__schedule_seeded") === "true") return
    localStorage.setItem("workout_routines_v2", JSON.stringify([routineSeed]))
    localStorage.removeItem("workout_schedule")
    localStorage.removeItem("workout_history")
    localStorage.removeItem("workoutSessions")
    localStorage.removeItem("workoutSets")
    localStorage.removeItem("currentSessionId")
    localStorage.setItem("__schedule_seeded", "true")
  }, routine)

  await page.goto("/schedule")
  const browserDayIndex = await page.evaluate(() => new Date().getDay())
  const dayIndex = (browserDayIndex + 6) % 7

  const selects = page.getByRole("combobox")
  const count = await selects.count()
  for (let i = 0; i < count; i += 1) {
    await selects.nth(i).selectOption("rest")
  }
  await expect(selects.first()).toHaveValue("rest")
  await expect(selects.nth(count - 1)).toHaveValue("rest")

  await page.getByRole("button", { name: "Save schedule" }).click()
  await expect(page.getByText("Schedule saved.")).toBeVisible()

  const restStored = await page.evaluate(() => {
    const stored = localStorage.getItem("workout_schedule")
    if (!stored) return false
    const map = JSON.parse(stored) as Record<string, { routineId: string; routineName: string } | null>
    const today = new Date()
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`
    return Object.prototype.hasOwnProperty.call(map, key) && map[key] === null
  })
  expect(restStored).toBeTruthy()

  await page.goto("/")
  await page.evaluate(() => window.dispatchEvent(new Event("schedule:updated")))
  await expect(page.getByText(/Rest day/i).first()).toBeVisible()
})

test("scheduled workout shows on Home when set", async ({ page }) => {
  await page.addInitScript((routineSeed) => {
    if (localStorage.getItem("__schedule_seeded") === "true") return
    localStorage.setItem("workout_routines_v2", JSON.stringify([routineSeed]))
    localStorage.removeItem("workout_schedule")
    localStorage.setItem("__schedule_seeded", "true")
  }, routine)

  await page.goto("/schedule")
  const browserDayIndex = await page.evaluate(() => new Date().getDay())
  const dayIndex = (browserDayIndex + 6) % 7

  const select = page.getByRole("combobox").nth(dayIndex)
  await select.selectOption(routine.id)
  await expect(select).toHaveValue(routine.id)

  await page.getByRole("button", { name: "Save schedule" }).click()
  await expect(page.getByText("Schedule saved.")).toBeVisible()

  await page.goto("/")
  await expect(page.getByText(routine.name)).toBeVisible()
})
