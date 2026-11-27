import { test, expect } from "@playwright/test"

const routine = {
  id: "transition-routine",
  name: "Transition Test",
  description: "Demo routine",
  estimatedTime: "30 min",
  category: "Test",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  exercises: [
    { id: "ex-1", name: "Overhand Row", type: "strength", targetSets: 1, targetReps: "6-8", notes: "Rest 5m" },
    { id: "ex-2", name: "Incline Dumbbell Bench", type: "strength", targetSets: 1, targetReps: "6-8", notes: "Rest 5m" },
    { id: "ex-3", name: "Cable Curl", type: "strength", targetSets: 1, targetReps: "10-12", notes: "Rest 5m" },
  ],
}

const sample = (to: string, planned: string, seconds: number) => ({
  from: "overhand row",
  to,
  planned,
  seconds,
  date: new Date().toISOString(),
})

test("rest after an exercise's last set uses the learned transition time", async ({ page }) => {
  await page.addInitScript(
    ({ routineSeed, samples }) => {
      if (localStorage.getItem("__transition_seeded") === "true") return
      localStorage.setItem("workout_routines_v2", JSON.stringify([routineSeed]))
      localStorage.removeItem("workoutSessions")
      localStorage.removeItem("workoutSets")
      localStorage.removeItem("currentSessionId")
      localStorage.setItem("exercise_transitions_v1", JSON.stringify(samples))
      localStorage.setItem("__transition_seeded", "true")
    },
    {
      routineSeed: routine,
      samples: [
        sample("incline dumbbell bench", "incline dumbbell bench", 120),
        sample("incline dumbbell bench", "incline dumbbell bench", 120),
        sample("cable curl", "cable curl", 360),
        sample("cable curl", "cable curl", 360),
      ],
    },
  )

  await page.goto(`/workout/session?routineId=${routine.id}&gym=sowa`)

  await page.locator('input[type="number"]').nth(0).fill("100")
  await page.locator('input[type="number"]').nth(1).fill("8")
  await page.locator('button[aria-label="Complete Set"]:not([disabled])').first().click()

  await expect(page.getByRole("button", { name: /skip rest/i })).toBeVisible()
  const pill = page.locator("text=/^\\d+:\\d{2}$/").first()
  // 2:00 learned for Row → Bench instead of the static 5:00.
  await expect(pill).toHaveText(/^(2:00|1:5\d)$/)

  // A pending transition is waiting for the next exercise's first logged set.
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem("exercise_transition_pending_v1") || "null"))
  expect(pending?.from).toBe("overhand row")
  expect(pending?.planned).toBe("incline dumbbell bench")

  // Skip past Bench to Curl mid-rest: the countdown becomes the average of the
  // learned Row → Bench and Row → Curl gaps, (120+120+360+360)/4 = 4:00.
  await page.getByRole("button", { name: /^Exercise 3 of/ }).click()
  await expect(pill).toHaveText(/^(4:00|3:5\d)$/)
})
