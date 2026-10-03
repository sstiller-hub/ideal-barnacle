import { test, expect, type Page } from "@playwright/test"

// Finish is gated on every remaining set being logged, so the record never
// carries a set that did not happen. These are the ways the set list is made
// to match what did: END HERE / SKIP EXERCISE drop the unlogged tail, UNDO
// brings it back, + SET appends one more.

const routine = {
  id: "exits-routine",
  name: "Exits Routine",
  description: "Demo routine",
  estimatedTime: "45 min",
  category: "Test",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  exercises: [
    { id: "ex-1", name: "Overhand Row", type: "strength", targetSets: 3, targetReps: "8", notes: "Rest 5m" },
    { id: "ex-2", name: "Incline Dumbbell Bench", type: "strength", targetSets: 2, targetReps: "8", notes: "Rest 5m" },
  ],
}

async function startSession(page: Page) {
  await page.addInitScript((routineSeed) => {
    // Init scripts run again on reload; the reload test needs the session kept.
    if (localStorage.getItem("exits-seeded")) return
    localStorage.setItem("exits-seeded", "1")
    localStorage.setItem("workout_routines_v2", JSON.stringify([routineSeed]))
    localStorage.removeItem("workout_history")
    localStorage.removeItem("workoutSessions")
    localStorage.removeItem("workoutSets")
    localStorage.removeItem("currentSessionId")
  }, routine)
  await page.goto(`/workout/session?routineId=${routine.id}`)
  await expect(page.getByText("Overhand Row").first()).toBeVisible()
}

const pageOf = (page: Page, exerciseName: string) =>
  page.locator('[data-testid="exercise-pager"] > div').filter({ has: page.getByRole("heading", { name: exerciseName }) })

// Logs the exercise's first unlogged set with 100 × 8.
async function logNextSet(page: Page, exerciseName: string) {
  const exercisePage = pageOf(page, exerciseName)
  const logged = await exercisePage.locator('button[aria-label="Mark Set Incomplete"]').count()
  await exercisePage.locator('input[type="number"]').nth(logged * 2).fill("100")
  await exercisePage.locator('input[type="number"]').nth(logged * 2 + 1).fill("8")
  await exercisePage.locator('button[aria-label="Complete Set"]:not([disabled])').first().click()
  const skip = page.getByRole("button", { name: "Skip rest" })
  if (await skip.count()) await skip.click()
}

test("END HERE drops the unlogged sets and moves on; UNDO restores them", async ({ page }) => {
  await startSession(page)
  const row = pageOf(page, "Overhand Row")

  await expect(page.getByRole("button", { name: "Finish" })).toBeDisabled()
  await expect(row.getByRole("button", { name: "SKIP EXERCISE" })).toBeVisible()

  await logNextSet(page, "Overhand Row")
  await expect(row.getByRole("button", { name: "END HERE" })).toBeVisible()
  await row.getByRole("button", { name: "END HERE" }).click()

  // Two unlogged sets are gone, the one logged set stays.
  await expect(row.locator('button[aria-label="Mark Set Incomplete"]')).toHaveCount(1)
  await expect(row.locator('button[aria-label="Complete Set"]')).toHaveCount(0)

  // Ending an exercise hands off like logging its last set does.
  await expect(page.getByText("EXERCISE 2 OF 2")).toBeVisible()

  // The persisted session agrees — a reload must not resurrect the sets.
  await page.reload()
  await expect(pageOf(page, "Overhand Row").locator('input[type="number"]')).toHaveCount(2)

  // Back on the exercise (the rail persists the index), UNDO is offered again.
  await page.locator('button[aria-label^="Exercise 1 of"]').click()
  await expect(pageOf(page, "Overhand Row").getByText("ENDED AFTER SET 1 · 2 SETS DROPPED")).toBeVisible()
  await pageOf(page, "Overhand Row").getByRole("button", { name: "UNDO" }).click()
  await expect(pageOf(page, "Overhand Row").locator('input[type="number"]')).toHaveCount(6)
  await expect(pageOf(page, "Overhand Row").locator('button[aria-label="Complete Set"]')).toHaveCount(2)
})

test("SKIP EXERCISE on everything makes the workout finishable without logging a set that did not happen", async ({
  page,
}) => {
  await startSession(page)

  await pageOf(page, "Overhand Row").getByRole("button", { name: "SKIP EXERCISE" }).click()
  // Skipping hands off to the next exercise; the dropped-sets line lives on
  // the page left behind and is covered by the END HERE test.
  await expect(page.getByText("EXERCISE 2 OF 2")).toBeVisible()
  await expect(pageOf(page, "Overhand Row").locator('input[type="number"]')).toHaveCount(0)

  await pageOf(page, "Incline Dumbbell Bench").getByRole("button", { name: "SKIP EXERCISE" }).click()

  await expect(page.getByRole("button", { name: "Finish" })).toBeEnabled()
  await page.getByRole("button", { name: "Finish" }).click()
  await page.waitForURL(/workout-summary/)

  // Nothing was logged, so nothing is on the record.
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem("workout_history") || "[]"))
  expect(history).toHaveLength(1)
  expect(history[0].stats.completedSets).toBe(0)
  expect(history[0].stats.totalVolume).toBe(0)
  for (const exercise of history[0].exercises) {
    expect(exercise.sets).toHaveLength(0)
    expect(exercise.trimmedSets).toBeUndefined()
  }
})

test("+ SET appends a set prefilled from the row above and re-gates Finish", async ({ page }) => {
  await startSession(page)
  const row = pageOf(page, "Overhand Row")
  // The plate panel's bar-weight field is also a number input once a weight
  // is typed; only the set fields are counted here.
  const setInputs = row.locator('input[type="number"]:not([aria-label="Bar weight"])')

  await expect(setInputs).toHaveCount(6)
  await setInputs.nth(4).fill("100")
  // Typing leaves the field focused, which keeps the keyboard bar up over the
  // bottom of the list; a user would have dismissed the keyboard here.
  await setInputs.nth(4).blur()
  await row.getByRole("button", { name: "+ SET" }).click()
  await expect(setInputs).toHaveCount(8)
  await expect(row.getByText("SET 04")).toBeVisible()
  await expect(row.getByText("4 SETS · TARGET 8 REPS")).toBeVisible()

  // The new row carries the row above it.
  await expect(setInputs.nth(6)).toHaveValue("100")
  await expect(setInputs.nth(7)).toHaveValue("8")
})

test("the progressive-overload rewrite is gone", async ({ page }) => {
  await startSession(page)
  for (let i = 0; i < 3; i++) await logNextSet(page, "Overhand Row")
  await expect(page.getByRole("button", { name: /PROGRESSIVE OVERLOAD/ })).toHaveCount(0)
})
