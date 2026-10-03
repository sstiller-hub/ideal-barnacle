import { test, expect, type Page } from "@playwright/test"

// The keyboard accessory bar: the iOS number pad has no return key, so the
// correction and the commit have to live above the keypad. The bar shows
// while a set field is focused, steps the field, hands focus to the next
// field, and logs the set.

const routine = {
  id: "kb-routine",
  name: "Keyboard Routine",
  description: "Demo routine",
  estimatedTime: "45 min",
  category: "Test",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  exercises: [
    { id: "ex-1", name: "Overhand Row", type: "strength", targetSets: 2, targetReps: "8", notes: "Rest 5m" },
  ],
}

async function startSession(page: Page) {
  await page.addInitScript((routineSeed) => {
    localStorage.setItem("workout_routines_v2", JSON.stringify([routineSeed]))
    localStorage.removeItem("workout_history")
    localStorage.removeItem("workoutSessions")
    localStorage.removeItem("workoutSets")
    localStorage.removeItem("currentSessionId")
  }, routine)
  await page.goto(`/workout/session?routineId=${routine.id}`)
  await expect(page.getByText("Overhand Row").first()).toBeVisible()
}

const setInputs = (page: Page) => page.locator('input[type="number"]:not([aria-label="Bar weight"])')
const bar = (page: Page) => page.getByTestId("set-keyboard-bar")

test("appears on focus, steps the focused field, and goes away on blur", async ({ page }) => {
  await startSession(page)
  await expect(bar(page)).toHaveCount(0)

  await setInputs(page).nth(0).focus()
  await expect(bar(page)).toBeVisible()
  await expect(bar(page)).toContainText("LB")
  await expect(page.getByTestId("kb-step-up")).toHaveText("+5")

  // Stepping keeps the field focused — the keyboard must not drop between taps.
  await page.getByTestId("kb-step-up").click()
  await page.getByTestId("kb-step-up").click()
  await expect(setInputs(page).nth(0)).toHaveValue("10")
  await expect(setInputs(page).nth(0)).toBeFocused()
  await page.getByTestId("kb-step-down").click()
  await expect(setInputs(page).nth(0)).toHaveValue("5")

  await setInputs(page).nth(0).blur()
  await expect(bar(page)).toHaveCount(0)
})

test("NEXT walks weight → reps → next set's weight; reps step by one and stay in range", async ({ page }) => {
  await startSession(page)

  await setInputs(page).nth(0).focus()
  await page.getByTestId("kb-next").click()
  await expect(setInputs(page).nth(1)).toBeFocused()
  await expect(bar(page)).toContainText("REPS")
  await expect(page.getByTestId("kb-step-up")).toHaveText("+1")

  await page.getByTestId("kb-step-up").click()
  await expect(setInputs(page).nth(1)).toHaveValue("9")
  await page.getByTestId("kb-step-down").click()
  await page.getByTestId("kb-step-down").click()
  await expect(setInputs(page).nth(1)).toHaveValue("7")

  await page.getByTestId("kb-next").click()
  await expect(setInputs(page).nth(2)).toBeFocused()
  await expect(bar(page)).toContainText("LB")

  // Last field of the last set: nothing to advance to.
  await page.getByTestId("kb-next").click()
  await expect(setInputs(page).nth(3)).toBeFocused()
  await expect(page.getByTestId("kb-next")).toHaveCount(0)
})

test("LOG SET commits the set from the keyboard and starts rest", async ({ page }) => {
  await startSession(page)

  await setInputs(page).nth(0).focus()
  // Nothing to log yet: weight is empty, so the tap surfaces the validation line.
  await page.getByTestId("kb-log").click()
  await expect(page.getByText("Enter weight")).toBeVisible()
  await expect(setInputs(page).nth(0)).toBeFocused()

  await setInputs(page).nth(0).fill("100")
  await page.getByTestId("kb-log").click()

  await expect(page.locator('button[aria-label="Mark Set Incomplete"]')).toHaveCount(1)
  await expect(page.getByRole("button", { name: "Skip rest" })).toBeVisible()
  // Logging drops the keyboard, and the bar with it.
  await expect(bar(page)).toHaveCount(0)
})
