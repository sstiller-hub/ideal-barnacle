/**
 * Which exercise the carousel is actually showing, across rotation and
 * backgrounding.
 *
 * workout-orientation.spec.ts already covers the persisted index and that the
 * tree survives a rotation. It cannot catch the carousel sitting on the wrong
 * page, though: every exercise lives in one horizontal scroller, so an
 * off-screen page is still "visible" to Playwright and the exercise name
 * assertion passes either way. These tests read the scroll offset instead,
 * which is the thing the user is looking at.
 */
import { test, expect } from "@playwright/test"

const PORTRAIT = { width: 390, height: 844 }
const LANDSCAPE = { width: 844, height: 390 }

test.use({ viewport: PORTRAIT, hasTouch: true, isMobile: true })

const routine = {
  id: "carousel-routine",
  name: "Carousel Routine",
  description: "Carousel test routine",
  estimatedTime: "30 min",
  category: "Test",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  exercises: [
    { id: "c-ex-1", name: "Bench Press", type: "strength", targetSets: 2, targetReps: "6-8", notes: "Rest 2m" },
    { id: "c-ex-2", name: "Pull Up", type: "strength", targetSets: 2, targetReps: "6-10", notes: "Rest 2m" },
    { id: "c-ex-3", name: "Overhead Press", type: "strength", targetSets: 2, targetReps: "8-10", notes: "Rest 90s" },
  ],
}

const session = {
  id: "carousel-session",
  routineId: routine.id,
  routineName: routine.name,
  status: "in_progress",
  startedAt: new Date().toISOString(),
  activeDurationSeconds: 600,
  currentExerciseIndex: 2,
  exercises: [
    {
      id: "c-ex-1", name: "Bench Press", targetSets: 2, targetReps: "6-8", restTime: 120, completed: true,
      sets: [
        { id: "cs-1", reps: 8, weight: 135, completed: true },
        { id: "cs-2", reps: 7, weight: 135, completed: true },
      ],
    },
    {
      id: "c-ex-2", name: "Pull Up", targetSets: 2, targetReps: "6-10", restTime: 120, completed: true,
      sets: [
        { id: "cs-3", reps: 8, weight: 0, completed: true },
        { id: "cs-4", reps: 8, weight: 0, completed: true },
      ],
    },
    {
      id: "c-ex-3", name: "Overhead Press", targetSets: 2, targetReps: "8-10", restTime: 90, completed: false,
      sets: [
        { id: "cs-5", reps: null, weight: null, completed: false },
        { id: "cs-6", reps: null, weight: null, completed: false },
      ],
    },
  ],
}

const seed = (page: any) =>
  page.addInitScript(
    ({ routineSeed, sessionSeed }: any) => {
      localStorage.clear()
      localStorage.setItem("workout_routines_v2", JSON.stringify([routineSeed]))
      localStorage.setItem("workoutSessions", JSON.stringify([sessionSeed]))
      localStorage.setItem("currentSessionId", sessionSeed.id)
    },
    { routineSeed: routine, sessionSeed: session }
  )

// Which carousel page is actually in front of the user, from the scroll offset.
const visiblePage = (page: any) =>
  page.evaluate(() => {
    const el = document.querySelector("[data-testid='exercise-pager']") as HTMLElement | null
    if (!el || !el.clientWidth) return null
    return Math.round(el.scrollLeft / el.clientWidth)
  })

const storedIndex = (page: any) =>
  page.evaluate(() => {
    const sessions = JSON.parse(localStorage.getItem("workoutSessions") || "[]")
    return sessions[0]?.currentExerciseIndex ?? null
  })

test.describe("Active workout: the carousel keeps its place", () => {
  test("on load", async ({ page }) => {
    await seed(page)
    await page.goto(`/workout/session?routineId=${routine.id}`)
    await expect(page.getByText("Overhead Press").first()).toBeVisible()
    await page.waitForTimeout(800)
    expect(await visiblePage(page)).toBe(2)
    expect(await storedIndex(page)).toBe(2)
  })

  test("through a rotation round trip", async ({ page }) => {
    test.slow()
    await seed(page)
    await page.goto(`/workout/session?routineId=${routine.id}`)
    await expect(page.getByText("Overhead Press").first()).toBeVisible()
    await page.waitForTimeout(800)

    await page.setViewportSize(LANDSCAPE)
    await page.waitForTimeout(800)
    expect(await visiblePage(page)).toBe(2)

    await page.setViewportSize(PORTRAIT)
    await page.waitForTimeout(800)
    expect(await visiblePage(page)).toBe(2)
    expect(await storedIndex(page)).toBe(2)
  })

  test("through backgrounding and returning", async ({ page }) => {
    test.slow()
    await seed(page)
    await page.goto(`/workout/session?routineId=${routine.id}`)
    await expect(page.getByText("Overhead Press").first()).toBeVisible()
    await page.waitForTimeout(800)

    // Background: the tab goes hidden, then comes back.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true })
      document.dispatchEvent(new Event("visibilitychange"))
    })
    await page.waitForTimeout(400)
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true })
      document.dispatchEvent(new Event("visibilitychange"))
      window.dispatchEvent(new Event("focus"))
    })
    await page.waitForTimeout(800)

    expect(await visiblePage(page)).toBe(2)
    expect(await storedIndex(page)).toBe(2)
  })

  test("when the browser restores scroll to 0 on return", async ({ page }) => {
    test.slow()
    await seed(page)
    await page.goto(`/workout/session?routineId=${routine.id}`)
    await expect(page.getByText("Overhead Press").first()).toBeVisible()
    await page.waitForTimeout(800)

    // iOS reactivating a backgrounded tab can hand the scroller back at 0.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true })
      document.dispatchEvent(new Event("visibilitychange"))
      const el = document.querySelector("[data-testid='exercise-pager']") as HTMLElement
      el.scrollLeft = 0
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true })
      document.dispatchEvent(new Event("visibilitychange"))
      window.dispatchEvent(new Event("focus"))
    })
    await page.waitForTimeout(1200)

    expect(await visiblePage(page)).toBe(2)
    expect(await storedIndex(page)).toBe(2)
  })

  test("after browsing to another exercise then rotating", async ({ page }) => {
    test.slow()
    await seed(page)
    await page.goto(`/workout/session?routineId=${routine.id}`)
    await expect(page.getByText("Overhead Press").first()).toBeVisible()
    await page.waitForTimeout(800)

    // Swipe back to exercise 1 (index 0).
    await page.evaluate(() => {
      const el = document.querySelector("[data-testid='exercise-pager']") as HTMLElement
      el.scrollTo({ left: 0, behavior: "instant" as ScrollBehavior })
      el.dispatchEvent(new Event("scroll"))
      el.dispatchEvent(new Event("scrollend"))
    })
    await page.waitForTimeout(800)
    expect(await visiblePage(page)).toBe(0)

    await page.setViewportSize(LANDSCAPE)
    await page.waitForTimeout(800)
    await page.setViewportSize(PORTRAIT)
    await page.waitForTimeout(800)

    expect(await visiblePage(page)).toBe(0)
  })
})
