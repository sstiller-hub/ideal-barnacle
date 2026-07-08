/**
 * Navigation tests for the active workout session.
 *
 * Covers: exit button, FINISH button state, exercise dot navigation,
 * session conflict dialogs (from session page and routines page),
 * direct URL edge cases, and exercise-detail deep links.
 */
import { test, expect } from "@playwright/test"

// ─── Fixtures ────────────────────────────────────────────────────────────────

const routineA = {
  id: "nav-routine-a",
  name: "Routine Alpha",
  description: "Navigation test routine A",
  estimatedTime: "30 min",
  category: "Test",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  exercises: [
    { id: "na-ex-1", name: "Bench Press", type: "strength", targetSets: 2, targetReps: "6-8", notes: "Rest 2m" },
    { id: "na-ex-2", name: "Pull Up", type: "strength", targetSets: 2, targetReps: "6-10", notes: "Rest 2m" },
    { id: "na-ex-3", name: "Overhead Press", type: "strength", targetSets: 2, targetReps: "8-10", notes: "Rest 90s" },
  ],
}

const routineB = {
  id: "nav-routine-b",
  name: "Routine Beta",
  description: "Navigation test routine B",
  estimatedTime: "45 min",
  category: "Test",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  exercises: [
    { id: "nb-ex-1", name: "Squat", type: "strength", targetSets: 3, targetReps: "5", notes: "Rest 3m" },
  ],
}

// Session for routineA — all sets incomplete (FINISH should be disabled)
const partialSession = {
  id: "nav-session-partial",
  routineId: routineA.id,
  routineName: routineA.name,
  status: "in_progress",
  startedAt: new Date().toISOString(),
  activeDurationSeconds: 0,
  currentExerciseIndex: 0,
  exercises: [
    {
      id: "na-ex-1",
      name: "Bench Press",
      targetSets: 2,
      targetReps: "6-8",
      restTime: 120,
      completed: false,
      sets: [
        { id: "nav-s1", reps: null, weight: null, completed: false },
        { id: "nav-s2", reps: null, weight: null, completed: false },
      ],
    },
    {
      id: "na-ex-2",
      name: "Pull Up",
      targetSets: 2,
      targetReps: "6-10",
      restTime: 120,
      completed: false,
      sets: [
        { id: "nav-s3", reps: null, weight: null, completed: false },
        { id: "nav-s4", reps: null, weight: null, completed: false },
      ],
    },
    {
      id: "na-ex-3",
      name: "Overhead Press",
      targetSets: 2,
      targetReps: "8-10",
      restTime: 90,
      completed: false,
      sets: [
        { id: "nav-s5", reps: null, weight: null, completed: false },
        { id: "nav-s6", reps: null, weight: null, completed: false },
      ],
    },
  ],
}

// Session for routineA — all sets completed with valid data (FINISH should be enabled)
const completeSession = {
  id: "nav-session-complete",
  routineId: routineA.id,
  routineName: routineA.name,
  status: "in_progress",
  startedAt: new Date().toISOString(),
  activeDurationSeconds: 300,
  currentExerciseIndex: 2,
  exercises: [
    {
      id: "na-ex-1",
      name: "Bench Press",
      targetSets: 2,
      targetReps: "6-8",
      restTime: 120,
      completed: true,
      sets: [
        { id: "nav-cs1", reps: 8, weight: 135, completed: true },
        { id: "nav-cs2", reps: 7, weight: 135, completed: true },
      ],
    },
    {
      id: "na-ex-2",
      name: "Pull Up",
      targetSets: 2,
      targetReps: "6-10",
      restTime: 120,
      completed: true,
      sets: [
        { id: "nav-cs3", reps: 8, weight: 0, completed: true },
        { id: "nav-cs4", reps: 8, weight: 0, completed: true },
      ],
    },
    {
      id: "na-ex-3",
      name: "Overhead Press",
      targetSets: 2,
      targetReps: "8-10",
      restTime: 90,
      completed: true,
      sets: [
        { id: "nav-cs5", reps: 10, weight: 95, completed: true },
        { id: "nav-cs6", reps: 9, weight: 95, completed: true },
      ],
    },
  ],
}

const seedStorage = (
  page: any,
  options: { routines?: any[]; session?: any } = {}
) =>
  page.addInitScript(
    ({ routinesSeed, sessionSeed }: { routinesSeed: any[]; sessionSeed: any }) => {
      localStorage.clear()
      localStorage.setItem("workout_routines_v2", JSON.stringify(routinesSeed))
      if (sessionSeed) {
        localStorage.setItem("workoutSessions", JSON.stringify([sessionSeed]))
        localStorage.setItem("currentSessionId", sessionSeed.id)
      }
    },
    {
      routinesSeed: options.routines ?? [routineA, routineB],
      sessionSeed: options.session ?? null,
    }
  )

// ─── Exit / back button ───────────────────────────────────────────────────────

test.describe("Active session: exit button", () => {
  test("exit button navigates to home", async ({ page }) => {
    await seedStorage(page, { session: partialSession })
    await page.goto(`/workout/session?routineId=${routineA.id}`)
    await expect(page.getByText("Bench Press")).toBeVisible()

    const exitBtn = page.locator("button:has(svg.lucide-arrow-left)").first()
    await exitBtn.click()

    await expect(page).toHaveURL(/\/$/, { timeout: 10000 })
  })

  test("exit button pauses an in_progress session in storage", async ({ page }) => {
    await seedStorage(page, { session: partialSession })
    await page.goto(`/workout/session?routineId=${routineA.id}`)
    await expect(page.getByText("Bench Press")).toBeVisible()

    const exitBtn = page.locator("button:has(svg.lucide-arrow-left)").first()
    await exitBtn.click()

    await page.waitForFunction(() => {
      try {
        const sessions = JSON.parse(localStorage.getItem("workoutSessions") || "[]")
        return sessions.some((s: any) => s.status === "paused")
      } catch {
        return false
      }
    })
  })

  test("home shows resume button after exiting mid-workout", async ({ page }) => {
    await seedStorage(page, { session: partialSession })
    await page.goto(`/workout/session?routineId=${routineA.id}`)
    await expect(page.getByText("Bench Press")).toBeVisible()

    // Exit via the back button (client-side nav to "/")
    const exitBtn = page.locator("button:has(svg.lucide-arrow-left)").first()
    await exitBtn.click()

    await expect(page).toHaveURL(/\/$/, { timeout: 10000 })
    await expect(page.getByRole("button", { name: "Resume Workout" })).toBeVisible()
  })
})

// ─── FINISH button state ──────────────────────────────────────────────────────

test.describe("Active session: FINISH button", () => {
  test("FINISH is disabled when no sets are completed", async ({ page }) => {
    await seedStorage(page, { session: partialSession })
    await page.goto(`/workout/session?routineId=${routineA.id}`)
    await expect(page.getByText("Bench Press")).toBeVisible()

    // There are two FINISH buttons (header + bottom nav); both should be disabled
    const finishBtns = page.getByRole("button", { name: "FINISH" })
    await expect(finishBtns.first()).toBeDisabled()
  })

  test("FINISH is enabled when all sets are done with valid data", async ({ page }) => {
    await seedStorage(page, { session: completeSession })
    await page.goto(`/workout/session?routineId=${routineA.id}`)
    await expect(page.getByText("Overhead Press")).toBeVisible()

    const finishBtn = page.getByRole("button", { name: "FINISH" }).first()
    await expect(finishBtn).toBeEnabled()
  })

  test("FINISH navigates to workout summary after completing all sets", async ({ page }) => {
    await seedStorage(page, { session: completeSession })
    await page.goto(`/workout/session?routineId=${routineA.id}`)

    const finishBtn = page.getByRole("button", { name: "FINISH" }).first()
    await expect(finishBtn).toBeEnabled({ timeout: 10000 })
    await finishBtn.click()

    await expect(page).toHaveURL(/workout-summary/, { timeout: 15000 })
  })
})

// ─── Exercise navigation dots ─────────────────────────────────────────────────

test.describe("Active session: exercise navigation", () => {
  test("clicking a rail segment updates the session's current exercise index", async ({ page }) => {
    await seedStorage(page, { session: partialSession })
    await page.goto(`/workout/session?routineId=${routineA.id}`)
    await expect(page.getByText("Bench Press")).toBeVisible()

    // Click the 3rd exercise's progress-rail segment (index 2)
    await page.getByRole("button", { name: /^Exercise 3 of/ }).click()

    await page.waitForFunction(() => {
      try {
        const sessions = JSON.parse(localStorage.getItem("workoutSessions") || "[]")
        return sessions.some((s: any) => s.currentExerciseIndex === 2)
      } catch {
        return false
      }
    })
  })

  test("rail shows one segment per exercise", async ({ page }) => {
    // completeSession has all exercises done; uiExerciseIndex starts at 2
    await seedStorage(page, { session: completeSession })
    await page.goto(`/workout/session?routineId=${routineA.id}`)
    await expect(page.getByText("Overhead Press")).toBeVisible()

    // One rail segment button per exercise (aria-label "Exercise N of M: …")
    const segments = page.getByRole("button", { name: /^Exercise \d+ of/ })
    await expect(segments).toHaveCount(routineA.exercises.length)
  })
})

// ─── Session conflict dialog (from /workout/session page) ────────────────────

test.describe("Session conflict dialog (from session page)", () => {
  test("shows conflict dialog when routineId differs from the active session", async ({ page }) => {
    // Active session is for routineA; navigate to routineB
    await seedStorage(page, { session: partialSession })
    await page.goto(`/workout/session?routineId=${routineB.id}`)

    await expect(page.getByText("Active Workout Detected")).toBeVisible()
  })

  test("Resume Existing redirects URL to the active session's routine", async ({ page }) => {
    await seedStorage(page, { session: partialSession })
    await page.goto(`/workout/session?routineId=${routineB.id}`)

    await expect(page.getByText("Active Workout Detected")).toBeVisible()
    await page.getByRole("button", { name: "Resume Existing" }).click()

    await expect(page).toHaveURL(new RegExp(`routineId=${routineA.id}`), { timeout: 10000 })
  })

  test("Discard & Start New removes the old session and loads the new routine", async ({ page }) => {
    await seedStorage(page, { session: partialSession })
    await page.goto(`/workout/session?routineId=${routineB.id}`)

    await expect(page.getByText("Active Workout Detected")).toBeVisible()
    await page.getByRole("button", { name: "Discard & Start New" }).click()

    // Old session should be gone from storage
    await page.waitForFunction((sessionId: string) => {
      try {
        const sessions = JSON.parse(localStorage.getItem("workoutSessions") || "[]")
        return !sessions.some((s: any) => s.id === sessionId)
      } catch {
        return false
      }
    }, partialSession.id)

    // routineB exercise should now be visible
    await expect(page.getByText("Squat")).toBeVisible({ timeout: 10000 })
  })

  test("Cancel closes the conflict dialog without changing the URL", async ({ page }) => {
    await seedStorage(page, { session: partialSession })
    await page.goto(`/workout/session?routineId=${routineB.id}`)

    await expect(page.getByText("Active Workout Detected")).toBeVisible()
    await page.getByRole("button", { name: "Cancel" }).click()

    await expect(page.getByText("Active Workout Detected")).not.toBeVisible()
    // URL stays at routineB (no navigation occurred)
    await expect(page).toHaveURL(new RegExp(`routineId=${routineB.id}`))
  })
})

// ─── Session conflict dialog (from /workout routines page) ───────────────────

test.describe("Session conflict dialog (from routines page)", () => {
  test("clicking a routine while a session is active shows the conflict dialog", async ({ page }) => {
    await seedStorage(page, { session: partialSession })
    await page.goto("/workout")

    await page.getByText(routineB.name).click()

    await expect(page.getByText("Active Workout Detected")).toBeVisible()
  })

  test("Resume Existing navigates to the in-progress session", async ({ page }) => {
    await seedStorage(page, { session: partialSession })
    await page.goto("/workout")

    await page.getByText(routineB.name).click()
    await expect(page.getByText("Active Workout Detected")).toBeVisible()

    await page.getByRole("button", { name: "Resume Existing" }).click()

    await expect(page).toHaveURL(
      new RegExp(`/workout/session\\?routineId=${routineA.id}`),
      { timeout: 10000 }
    )
  })

  test("Discard & Start New discards old session and starts the new routine", async ({ page }) => {
    await seedStorage(page, { session: partialSession })
    await page.goto("/workout")

    await page.getByText(routineB.name).click()
    await expect(page.getByText("Active Workout Detected")).toBeVisible()

    await page.getByRole("button", { name: "Discard & Start New" }).click()

    await expect(page).toHaveURL(
      new RegExp(`/workout/session\\?routineId=${routineB.id}`),
      { timeout: 10000 }
    )
  })

  test("Cancel closes dialog and keeps the user on the routines page", async ({ page }) => {
    await seedStorage(page, { session: partialSession })
    await page.goto("/workout")

    await page.getByText(routineB.name).click()
    await expect(page.getByText("Active Workout Detected")).toBeVisible()

    await page.getByRole("button", { name: "Cancel" }).click()

    await expect(page.getByText("Active Workout Detected")).not.toBeVisible()
    await expect(page).toHaveURL(/\/workout$/)
  })
})

// ─── Direct URL edge cases ────────────────────────────────────────────────────

test.describe("Session page: direct URL edge cases", () => {
  test("navigating without routineId loads exercises from the active session", async ({ page }) => {
    await seedStorage(page, { session: partialSession })
    await page.goto("/workout/session")

    // Session exercises should render without a routineId in the URL
    await expect(page.getByText("Bench Press")).toBeVisible({ timeout: 10000 })
  })

  test("navigating with a routineId that matches the active session resumes without a conflict dialog", async ({
    page,
  }) => {
    await seedStorage(page, { session: partialSession })
    await page.goto(`/workout/session?routineId=${routineA.id}`)

    await expect(page.getByText("Bench Press")).toBeVisible()
    await expect(page.getByText("Active Workout Detected")).not.toBeVisible()
  })

  test("navigating with an unknown routineId and no active session shows a blank loading state", async ({
    page,
  }) => {
    // No session seeded; unknown routine
    await seedStorage(page, { routines: [routineA, routineB] })
    await page.goto("/workout/session?routineId=does-not-exist")

    // No exercises to display — page stays in loading/empty state
    await expect(page.getByText("Bench Press")).not.toBeVisible()
    await expect(page.getByText("Squat")).not.toBeVisible()
  })
})

// ─── Exercise detail deep-link ────────────────────────────────────────────────

test.describe("Active session: exercise detail navigation", () => {
  test("clicking the exercise name navigates to the exercise detail page with from=session", async ({
    page,
  }) => {
    await seedStorage(page, { session: partialSession })
    await page.goto(`/workout/session?routineId=${routineA.id}`)
    await expect(page.getByText("Bench Press")).toBeVisible()

    // Click the large exercise name heading (Bebas Neue h1 in the exercise card)
    await page.getByText("Bench Press").first().click()

    await expect(page).toHaveURL(/\/exercise\/Bench%20Press\?from=session/, { timeout: 10000 })
  })
})
