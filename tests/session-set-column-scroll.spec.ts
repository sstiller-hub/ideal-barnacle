import { test, expect, type Page } from "@playwright/test"

// The set column scrolls. A Safari tab on an iPhone leaves ~659pt for the
// page, so a six-set exercise with the plate panel open runs past the fold;
// before this, nothing could reach the last sets. Each exercise page now
// scrolls vertically on its own while the pager keeps the horizontal axis.

test.use({ viewport: { width: 393, height: 659 }, hasTouch: true, isMobile: true })

const routine = {
  id: "scroll-routine",
  name: "Scroll Routine",
  description: "Demo routine",
  estimatedTime: "45 min",
  category: "Test",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  exercises: [
    { id: "ex-1", name: "Barbell Bench Press", type: "strength", targetSets: 6, targetReps: "5", notes: "Rest 3m" },
    { id: "ex-2", name: "Overhand Row", type: "strength", targetSets: 3, targetReps: "8", notes: "Rest 2m" },
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
  await expect(page.getByText("Barbell Bench Press").first()).toBeVisible()
  await page.waitForTimeout(800)
}

const firstPage = (page: Page) => page.getByTestId("exercise-page").first()
const setInputs = (page: Page) =>
  firstPage(page).locator('input[type="number"]:not([aria-label="Bar weight"]):not([aria-label="Seat setting"])')

const pagerState = (page: Page) =>
  page.evaluate(() => {
    const pager = document.querySelector("[data-testid='exercise-pager']") as HTMLElement
    const sessions = JSON.parse(localStorage.getItem("workoutSessions") || "[]")
    const current = sessions.find((s: any) => s.id === localStorage.getItem("currentSessionId")) ?? sessions[0]
    return {
      visible: Math.round(pager.scrollLeft / pager.clientWidth),
      stored: current?.currentExerciseIndex ?? null,
    }
  })

test("the last set below the fold is reachable by scrolling the page, and the exercise stays put", async ({ page }) => {
  await startSession(page)
  await expect(setInputs(page)).toHaveCount(12)

  const lastWeight = setInputs(page).nth(10)
  const pager = page.getByTestId("exercise-pager")
  const pagerBox = (await pager.boundingBox())!
  const before = (await lastWeight.boundingBox())!
  // The precondition that made this a bug: the sixth set starts off-screen.
  expect(before.y).toBeGreaterThan(pagerBox.y + pagerBox.height - 40)

  await pager.hover()
  await page.mouse.wheel(0, 1500)
  await page.waitForTimeout(600)

  expect(await firstPage(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  await expect(lastWeight).toBeInViewport()
  await lastWeight.fill("225")
  await expect(lastWeight).toHaveValue("225")

  // Scrolling down a page is not a swipe.
  expect(await pagerState(page)).toEqual({ visible: 0, stored: 0 })
})

test("a vertical scroll does not leave the pager reading the next layout drift as a swipe", async ({ page }) => {
  await startSession(page)
  await page.getByTestId("exercise-pager").hover()
  await page.mouse.wheel(0, 800)
  await page.waitForTimeout(600)

  // Nothing swiped since; a relayout nudging the pager toward the next
  // exercise must be undone, not persisted.
  // The drift lands exactly on the next snap point and the browser fires its
  // own scroll/scrollend, so the only thing telling it apart from a swipe is
  // whether the pager still believes the user is driving.
  await page.evaluate(() => {
    const el = document.querySelector("[data-testid='exercise-pager']") as HTMLElement
    el.scrollTo({ left: el.clientWidth, behavior: "instant" })
  })
  await page.waitForTimeout(1200)

  expect(await pagerState(page)).toEqual({ visible: 0, stored: 0 })
})

test("a horizontal swipe still changes exercise from a scrolled page", async ({ page }) => {
  await startSession(page)
  const pager = page.getByTestId("exercise-pager")
  await pager.hover()
  await page.mouse.wheel(0, 800)
  await page.waitForTimeout(600)

  await page.mouse.wheel(2000, 0)
  await page.waitForTimeout(1200)

  expect(await pagerState(page)).toEqual({ visible: 1, stored: 1 })
})
