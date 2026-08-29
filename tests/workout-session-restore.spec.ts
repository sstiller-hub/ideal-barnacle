/**
 * Cold-start restore for an active workout.
 *
 * The PWA's start_url is "/", so when the OS evicts a backgrounded Akt from
 * memory mid-workout, coming back to the app relaunches on the home screen and
 * the user's place in the active workout is gone. The app leaves a breadcrumb
 * while the session screen is open and uses it on the next cold start to put
 * the user back where they were — without breaking the ability to leave the
 * session and browse other days on home.
 *
 * Each test seeds localStorage only on the first document load, so a second
 * page.goto("/") behaves like a real relaunch: whatever the app persisted is
 * still there.
 */
import { test, expect } from "@playwright/test"

const ROUTE_KEY = "aktActiveWorkoutRoute"

const routine = {
  id: "restore-routine",
  name: "Restore Routine",
  description: "Cold-start restore test routine",
  estimatedTime: "30 min",
  category: "Test",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  exercises: [
    { id: "rr-ex-1", name: "Bench Press", type: "strength", targetSets: 2, targetReps: "6-8", notes: "Rest 2m" },
    { id: "rr-ex-2", name: "Pull Up", type: "strength", targetSets: 2, targetReps: "6-10", notes: "Rest 2m" },
    { id: "rr-ex-3", name: "Overhead Press", type: "strength", targetSets: 2, targetReps: "8-10", notes: "Rest 90s" },
  ],
}

// Mid-workout: the user is on the third exercise with the first two logged.
const midWorkoutSession = {
  id: "restore-session",
  routineId: routine.id,
  routineName: routine.name,
  status: "in_progress",
  startedAt: new Date().toISOString(),
  activeDurationSeconds: 600,
  currentExerciseIndex: 2,
  exercises: [
    {
      id: "rr-ex-1",
      name: "Bench Press",
      targetSets: 2,
      targetReps: "6-8",
      restTime: 120,
      completed: true,
      sets: [
        { id: "rs-1", reps: 8, weight: 135, completed: true },
        { id: "rs-2", reps: 7, weight: 135, completed: true },
      ],
    },
    {
      id: "rr-ex-2",
      name: "Pull Up",
      targetSets: 2,
      targetReps: "6-10",
      restTime: 120,
      completed: true,
      sets: [
        { id: "rs-3", reps: 8, weight: 0, completed: true },
        { id: "rs-4", reps: 8, weight: 0, completed: true },
      ],
    },
    {
      id: "rr-ex-3",
      name: "Overhead Press",
      targetSets: 2,
      targetReps: "8-10",
      restTime: 90,
      completed: false,
      sets: [
        { id: "rs-5", reps: null, weight: null, completed: false },
        { id: "rs-6", reps: null, weight: null, completed: false },
      ],
    },
  ],
}

// Seeds on the first document load only. Later loads in the same test keep
// whatever the app wrote, which is what makes a second goto a real cold start.
const seedOnce = (page: any) =>
  page.addInitScript(
    ({ routineSeed, sessionSeed }: { routineSeed: any; sessionSeed: any }) => {
      if (localStorage.getItem("__restoreSpecSeeded")) return
      localStorage.clear()
      localStorage.setItem("__restoreSpecSeeded", "1")
      localStorage.setItem("workout_routines_v2", JSON.stringify([routineSeed]))
      localStorage.setItem("workoutSessions", JSON.stringify([sessionSeed]))
      localStorage.setItem("currentSessionId", sessionSeed.id)
    },
    { routineSeed: routine, sessionSeed: midWorkoutSession }
  )

test.describe("Active workout: cold-start restore", () => {
  test("the session screen records the route it should be restored to", async ({ page }) => {
    await seedOnce(page)
    await page.goto(`/workout/session?routineId=${routine.id}`)
    await expect(page.getByText("Overhead Press").first()).toBeVisible()

    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), ROUTE_KEY))
      .toBe(`/workout/session?routineId=${routine.id}`)
  })

  test("relaunching at / goes back into the active workout, on the same exercise", async ({ page }) => {
    await seedOnce(page)
    await page.goto(`/workout/session?routineId=${routine.id}`)
    await expect(page.getByText("Overhead Press").first()).toBeVisible()
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), ROUTE_KEY)).not.toBeNull()

    // Cold start: the OS relaunched the app at the manifest's start_url.
    await page.goto("/")

    await expect(page).toHaveURL(new RegExp(`/workout/session\\?routineId=${routine.id}`), { timeout: 10000 })
    // Still on the third exercise, not reset to the first.
    await expect(page.getByText("Overhead Press").first()).toBeVisible()
  })

  test("relaunching at / stays on home after the user exited the session", async ({ page }) => {
    await seedOnce(page)
    await page.goto(`/workout/session?routineId=${routine.id}`)
    await expect(page.getByText("Overhead Press").first()).toBeVisible()

    // Leaving via the back button means home is where the user actually is.
    await page.locator("button:has(svg.lucide-arrow-left)").first().click()
    await expect(page).toHaveURL(/\/$/, { timeout: 10000 })

    await page.goto("/")

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole("button", { name: "Resume Workout" })).toBeVisible()
  })

  test("relaunching at / stays on home when the workout is no longer in progress", async ({ page }) => {
    await seedOnce(page)
    await page.goto(`/workout/session?routineId=${routine.id}`)
    await expect(page.getByText("Overhead Press").first()).toBeVisible()
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), ROUTE_KEY)).not.toBeNull()

    // The workout was finished or discarded elsewhere, leaving only the breadcrumb.
    await page.evaluate(() => {
      localStorage.removeItem("currentSessionId")
      localStorage.setItem("workoutSessions", "[]")
    })

    await page.goto("/")

    await expect(page).toHaveURL(/\/$/)
  })

  test("the breadcrumb is consumed, so a second visit to home does not bounce", async ({ page }) => {
    // Four full document loads; the dev server compiles each route on demand.
    test.slow()
    await seedOnce(page)
    await page.goto(`/workout/session?routineId=${routine.id}`)
    await expect(page.getByText("Overhead Press").first()).toBeVisible()

    await page.goto("/")
    await expect(page).toHaveURL(new RegExp(`/workout/session\\?routineId=${routine.id}`), { timeout: 10000 })

    // Leave deliberately, then relaunch again — home must stick.
    await page.locator("button:has(svg.lucide-arrow-left)").first().click()
    await expect(page).toHaveURL(/\/$/, { timeout: 10000 })
    await page.goto("/")
    await expect(page).toHaveURL(/\/$/)
  })
})
