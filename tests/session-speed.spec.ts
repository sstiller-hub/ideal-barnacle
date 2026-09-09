import { test, expect } from "@playwright/test"

const routine = {
  id: "speed-routine",
  name: "Speed Test Routine",
  description: "Demo routine",
  estimatedTime: "45 min",
  category: "Test",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  exercises: [
    { id: "ex-1", name: "Overhand Row", type: "strength", targetSets: 2, targetReps: "8", notes: "Rest 5m" },
    { id: "ex-2", name: "Incline Dumbbell Bench", type: "strength", targetSets: 2, targetReps: "8", notes: "Rest 5m" },
  ],
}

async function startSession(page: import("@playwright/test").Page) {
  await page.addInitScript((routineSeed) => {
    localStorage.setItem("workout_routines_v2", JSON.stringify([routineSeed]))
    localStorage.removeItem("workoutSessions")
    localStorage.removeItem("workoutSets")
    localStorage.removeItem("currentSessionId")
  }, routine)
  await page.goto(`/workout/session?routineId=${routine.id}`)
  await expect(page.getByText("Overhand Row").first()).toBeVisible()
}

const weightOf = (page: import("@playwright/test").Page, n = 0) =>
  page.locator('input[type="number"]').nth(n * 2)
const repsOf = (page: import("@playwright/test").Page, n = 0) =>
  page.locator('input[type="number"]').nth(n * 2 + 1)

test.describe("Steppers on the active set", () => {
  test("increment and decrement adjust weight by 5 and reps by 1", async ({ page }) => {
    await startSession(page)

    await weightOf(page).fill("100")
    await repsOf(page).fill("8")

    await page.getByRole("button", { name: "Increase LB by 5" }).click()
    await expect(weightOf(page)).toHaveValue("105")
    await page.getByRole("button", { name: "Decrease LB by 5" }).click()
    await expect(weightOf(page)).toHaveValue("100")

    await page.getByRole("button", { name: "Increase REPS by 1" }).click()
    await expect(repsOf(page)).toHaveValue("9")
    await page.getByRole("button", { name: "Decrease REPS by 1" }).click()
    await expect(repsOf(page)).toHaveValue("8")
  })

  test("weight cannot be stepped below zero", async ({ page }) => {
    await startSession(page)

    await weightOf(page).fill("5")
    await page.getByRole("button", { name: "Decrease LB by 5" }).click()
    await expect(weightOf(page)).toHaveValue("0")
    await expect(page.getByRole("button", { name: "Decrease LB by 5" })).toBeDisabled()
  })

  test("steppers appear only on the set being performed", async ({ page }) => {
    await startSession(page)
    // Two sets on this exercise, one stepper pair — the active set's.
    await expect(page.getByRole("button", { name: "Increase LB by 5" })).toHaveCount(1)
  })
})

test.describe("Rest dock", () => {
  test("shows the upcoming set and logs it in one tap", async ({ page }) => {
    await startSession(page)

    await weightOf(page).fill("100")
    await repsOf(page).fill("8")
    await page.locator('button[aria-label="Complete Set"]:not([disabled])').first().click()

    await expect(page.getByText(/UP NEXT · SET 02/)).toBeVisible()
    const logSet = page.getByRole("button", { name: /LOG SET/i })
    await expect(logSet).toBeVisible()

    // Set 2 has no weight yet (no history to prefill from), so the dock must
    // say which field is missing rather than silently doing nothing.
    await logSet.click()
    await expect(page.getByText("Enter weight")).toBeVisible()

    await weightOf(page, 1).fill("100")
    await logSet.click()

    // Both sets of exercise 1 are now logged, so the session moves on.
    await expect(page.getByText("Incline Dumbbell Bench").first()).toBeVisible()
  })

  test("-30S shortens the running timer", async ({ page }) => {
    await startSession(page)

    await weightOf(page).fill("100")
    await repsOf(page).fill("8")
    await page.locator('button[aria-label="Complete Set"]:not([disabled])').first().click()

    const clock = page.locator("text=/^\\d+:\\d{2}$/").first()
    await expect(clock).toBeVisible()
    const before = (await clock.textContent()) || ""
    await page.getByRole("button", { name: "−30S" }).click()
    await expect(clock).not.toHaveText(before)

    const toSeconds = (value: string) => {
      const [mins, secs] = value.split(":")
      return Number(mins) * 60 + Number(secs)
    }
    const after = (await clock.textContent()) || ""
    expect(toSeconds(after)).toBeLessThan(toSeconds(before))
  })
})

test.describe("Auto-advance", () => {
  test("completing the last set of an exercise moves to the next one", async ({ page }) => {
    await startSession(page)

    for (const setIndex of [0, 1]) {
      await weightOf(page, setIndex).fill("100")
      await repsOf(page, setIndex).fill("8")
      await page.locator('button[aria-label="Complete Set"]:not([disabled])').first().click()
    }

    await expect(page.getByText("Incline Dumbbell Bench").first()).toBeVisible()
    await expect(page.getByText(/EXERCISE 2 OF 2/)).toBeVisible()
  })
})

test.describe("iOS haptic fallback", () => {
  // iOS has no Vibration API, so tap cues route through a hidden switch input
  // instead. The haptic itself is unobservable; that the toggle happens at all
  // is the part that can regress silently.
  async function withoutVibration(page: import("@playwright/test").Page) {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "vibrate", {
        value: undefined,
        configurable: true,
      })
    })
  }

  const switchState = (page: import("@playwright/test").Page) =>
    page.evaluate(
      () => document.head.querySelector<HTMLInputElement>('input[switch]')?.checked ?? null,
    )

  test("stepper taps toggle the switch when vibration is unavailable", async ({ page }) => {
    await withoutVibration(page)
    await startSession(page)

    expect(await switchState(page)).toBeNull()

    await page.getByRole("button", { name: "Increase REPS by 1" }).click()
    const first = await switchState(page)
    expect(first).not.toBeNull()

    await page.getByRole("button", { name: "Increase REPS by 1" }).click()
    expect(await switchState(page)).toBe(!first)
  })

  test("the switch is built once and stays out of the accessibility tree", async ({ page }) => {
    await withoutVibration(page)
    await startSession(page)

    await page.getByRole("button", { name: "Increase REPS by 1" }).click()
    await page.getByRole("button", { name: "Decrease REPS by 1" }).click()

    expect(await page.locator('input[switch]').count()).toBe(1)
    await expect(page.getByRole("checkbox")).toHaveCount(0)
  })
})
