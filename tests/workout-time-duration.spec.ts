/**
 * Regression tests for workout time and duration display.
 *
 * These tests guard against the recurring bug where startedAt/endedAt
 * and duration are dropped or not shown across the summary, history list,
 * and history detail pages.
 */
import { test, expect } from "@playwright/test"

const BASE_EXERCISE = {
  id: "ex-1",
  name: "Overhand Row",
  targetSets: 2,
  targetReps: "6-8",
  restTime: 90,
  completed: true,
  sets: [
    { weight: 100, reps: 8, completed: true },
    { weight: 100, reps: 7, completed: true },
  ],
}

const BASE_STATS = {
  totalSets: 2,
  completedSets: 2,
  totalVolume: 1500,
  totalReps: 15,
}

/** Seed localStorage and navigate, returning a test fixture with page. */
const seedWorkouts = (page: any, workouts: any[]) =>
  page.addInitScript((seed: any[]) => {
    localStorage.setItem("workout_history", JSON.stringify(seed))
  }, workouts)

// ---------------------------------------------------------------------------
// Workout Summary page
// ---------------------------------------------------------------------------

test.describe("Workout summary – time and duration", () => {
  test("shows duration when duration field is present", async ({ page }) => {
    const workout = {
      id: "summary-has-duration",
      name: "Push Day",
      date: new Date().toISOString(),
      duration: 2700, // 45 min
      durationUnit: "seconds",
      exercises: [BASE_EXERCISE],
      stats: BASE_STATS,
    }
    await seedWorkouts(page, [workout])

    await page.goto(`/workout-summary?workoutId=${workout.id}`)
    await expect(page.getByText("Workout Complete")).toBeVisible()

    // Duration label and formatted value
    await expect(page.getByText("Duration")).toBeVisible()
    await expect(page.getByText("45 min")).toBeVisible()
  })

  test("shows duration calculated from startedAt/endedAt when no direct duration field", async ({ page }) => {
    const startedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString() // 30 min ago
    const endedAt = new Date().toISOString()
    const workout = {
      id: "summary-timestamps-only",
      name: "Pull Day",
      date: new Date().toISOString(),
      startedAt,
      endedAt,
      // deliberately no duration field
      exercises: [BASE_EXERCISE],
      stats: BASE_STATS,
    }
    await seedWorkouts(page, [workout])

    await page.goto(`/workout-summary?workoutId=${workout.id}`)
    await expect(page.getByText("Workout Complete")).toBeVisible()

    await expect(page.getByText("Duration")).toBeVisible()
    await expect(page.getByText("30 min")).toBeVisible()
  })

  test("shows time range (startedAt – endedAt) when timestamps are present", async ({ page }) => {
    // Use a fixed, known time so we can assert the formatted output
    const startMs = new Date("2026-04-07T10:00:00").getTime()
    const endMs = startMs + 45 * 60 * 1000
    const workout = {
      id: "summary-time-range",
      name: "Leg Day",
      date: new Date(startMs).toISOString(),
      startedAt: new Date(startMs).toISOString(),
      endedAt: new Date(endMs).toISOString(),
      duration: 2700,
      durationUnit: "seconds",
      exercises: [BASE_EXERCISE],
      stats: BASE_STATS,
    }
    await seedWorkouts(page, [workout])

    await page.goto(`/workout-summary?workoutId=${workout.id}`)
    await expect(page.getByText("Workout Complete")).toBeVisible()

    // Time range like "10:00 AM – 10:45 AM"
    await expect(page.locator("text=/\\d+:\\d{2}\\s*(AM|PM)\\s*–\\s*\\d+:\\d{2}\\s*(AM|PM)/")).toBeVisible()
  })

  test("shows Workout date fallback when no timing data is present", async ({ page }) => {
    const workout = {
      id: "summary-no-timing",
      name: "Core Day",
      date: new Date().toISOString(),
      // no duration, no startedAt, no endedAt
      exercises: [BASE_EXERCISE],
      stats: BASE_STATS,
    }
    await seedWorkouts(page, [workout])

    await page.goto(`/workout-summary?workoutId=${workout.id}`)
    await expect(page.getByText("Workout Complete")).toBeVisible()

    // Should NOT show Duration label
    await expect(page.getByText("Duration")).not.toBeVisible()
    // Should show "Workout date" fallback
    await expect(page.getByText("Workout date")).toBeVisible()
  })

  test("shows duration with hours when workout was over 60 minutes", async ({ page }) => {
    const workout = {
      id: "summary-long-duration",
      name: "Full Body",
      date: new Date().toISOString(),
      duration: 5400, // 1h 30m
      durationUnit: "seconds",
      exercises: [BASE_EXERCISE],
      stats: BASE_STATS,
    }
    await seedWorkouts(page, [workout])

    await page.goto(`/workout-summary?workoutId=${workout.id}`)
    await expect(page.getByText("Workout Complete")).toBeVisible()

    await expect(page.getByText("Duration")).toBeVisible()
    await expect(page.getByText("1h 30m")).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// History list page
// ---------------------------------------------------------------------------

test.describe("History list – time and duration", () => {
  test("shows formatted duration when duration field is present", async ({ page }) => {
    const workout = {
      id: "hist-list-has-duration",
      name: "Upper Body",
      date: new Date().toISOString(),
      duration: 1800, // 30 min
      durationUnit: "seconds",
      exercises: [BASE_EXERCISE],
      stats: BASE_STATS,
    }
    await seedWorkouts(page, [workout])

    await page.goto("/history")
    await expect(page.getByText("Upper Body")).toBeVisible()

    await expect(page.getByText("30 min")).toBeVisible()
    await expect(page.getByText("duration")).toBeVisible()
  })

  test("shows calculated duration when only timestamps are present", async ({ page }) => {
    const startedAt = new Date(Date.now() - 45 * 60 * 1000).toISOString()
    const endedAt = new Date().toISOString()
    const workout = {
      id: "hist-list-timestamps-only",
      name: "Lower Body",
      date: new Date().toISOString(),
      startedAt,
      endedAt,
      // no duration field
      exercises: [BASE_EXERCISE],
      stats: BASE_STATS,
    }
    await seedWorkouts(page, [workout])

    await page.goto("/history")
    await expect(page.getByText("Lower Body")).toBeVisible()

    await expect(page.getByText("45 min")).toBeVisible()
    await expect(page.getByText("duration")).toBeVisible()
  })

  test("shows 'completed' fallback when no timing data is present", async ({ page }) => {
    const workout = {
      id: "hist-list-no-timing",
      name: "Cardio Day",
      date: new Date().toISOString(),
      // no duration, no startedAt, no endedAt
      exercises: [BASE_EXERCISE],
      stats: BASE_STATS,
    }
    await seedWorkouts(page, [workout])

    await page.goto("/history")
    await expect(page.getByText("Cardio Day")).toBeVisible()

    await expect(page.getByText("completed", { exact: true })).toBeVisible()
    // Should NOT show a duration label
    await expect(page.getByText("duration", { exact: true })).not.toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// History detail page
// ---------------------------------------------------------------------------

test.describe("History detail – time and duration", () => {
  test("shows duration when duration field is present", async ({ page }) => {
    const workout = {
      id: "hist-detail-has-duration",
      name: "Back Day",
      date: new Date().toISOString(),
      duration: 3600, // 1h
      durationUnit: "seconds",
      exercises: [BASE_EXERCISE],
      stats: BASE_STATS,
    }
    await seedWorkouts(page, [workout])

    await page.goto(`/history/${workout.id}`)
    await expect(page.getByText("Back Day")).toBeVisible()

    await expect(page.getByText("Duration")).toBeVisible()
    await expect(page.getByText("1h 0m")).toBeVisible()
  })

  test("shows time range when startedAt and endedAt are present", async ({ page }) => {
    const startMs = new Date("2026-04-07T08:30:00").getTime()
    const endMs = startMs + 60 * 60 * 1000
    const workout = {
      id: "hist-detail-time-range",
      name: "Shoulder Day",
      date: new Date(startMs).toISOString(),
      startedAt: new Date(startMs).toISOString(),
      endedAt: new Date(endMs).toISOString(),
      duration: 3600,
      durationUnit: "seconds",
      exercises: [BASE_EXERCISE],
      stats: BASE_STATS,
    }
    await seedWorkouts(page, [workout])

    await page.goto(`/history/${workout.id}`)
    await expect(page.getByText("Shoulder Day")).toBeVisible()

    // Time range like "8:30 AM – 9:30 AM"
    await expect(page.locator("text=/\\d+:\\d{2}\\s*(AM|PM)\\s*–\\s*\\d+:\\d{2}\\s*(AM|PM)/")).toBeVisible()
  })

  test("shows calculated duration from timestamps when no direct duration", async ({ page }) => {
    const startedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString()
    const endedAt = new Date().toISOString()
    const workout = {
      id: "hist-detail-timestamps-only",
      name: "Arms Day",
      date: new Date().toISOString(),
      startedAt,
      endedAt,
      // no duration
      exercises: [BASE_EXERCISE],
      stats: BASE_STATS,
    }
    await seedWorkouts(page, [workout])

    await page.goto(`/history/${workout.id}`)
    await expect(page.getByText("Arms Day")).toBeVisible()

    await expect(page.getByText("Duration")).toBeVisible()
    await expect(page.getByText("20 min")).toBeVisible()
  })

  test("shows Workout date fallback in detail when no timing data", async ({ page }) => {
    const workout = {
      id: "hist-detail-no-timing",
      name: "Rest Day Stretch",
      date: new Date().toISOString(),
      // no duration, no startedAt, no endedAt
      exercises: [BASE_EXERCISE],
      stats: BASE_STATS,
    }
    await seedWorkouts(page, [workout])

    await page.goto(`/history/${workout.id}`)
    await expect(page.getByText("Rest Day Stretch")).toBeVisible()

    await expect(page.getByText("Duration")).not.toBeVisible()
    await expect(page.getByText("Workout date")).toBeVisible()
  })

  test("duration and time range are both visible when full timing data is present", async ({ page }) => {
    const startMs = new Date("2026-04-07T07:00:00").getTime()
    const endMs = startMs + 75 * 60 * 1000 // 1h 15m
    const workout = {
      id: "hist-detail-full-timing",
      name: "Full Body Power",
      date: new Date(startMs).toISOString(),
      startedAt: new Date(startMs).toISOString(),
      endedAt: new Date(endMs).toISOString(),
      duration: 4500,
      durationUnit: "seconds",
      exercises: [BASE_EXERCISE],
      stats: BASE_STATS,
    }
    await seedWorkouts(page, [workout])

    await page.goto(`/history/${workout.id}`)
    await expect(page.getByText("Full Body Power")).toBeVisible()

    await expect(page.getByText("Duration")).toBeVisible()
    await expect(page.getByText("1h 15m")).toBeVisible()
    await expect(page.locator("text=/\\d+:\\d{2}\\s*(AM|PM)\\s*–\\s*\\d+:\\d{2}\\s*(AM|PM)/")).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Migration — backfill startedAt from endedAt + duration for old workouts
// ---------------------------------------------------------------------------

test.describe("Migration — backfill startedAt for old workouts", () => {
  test("history detail derives startedAt from endedAt and duration when startedAt is missing", async ({ page }) => {
    // Simulate a workout saved before the fix: has endedAt + duration but no startedAt
    const endedAt = new Date("2026-04-07T11:00:00").toISOString()
    const duration = 2700 // 45 min
    const workout = {
      id: "legacy-no-startedat",
      name: "Legacy Workout",
      date: new Date("2026-04-07T12:00:00").toISOString(),
      // no startedAt
      endedAt,
      duration,
      durationUnit: "seconds",
      exercises: [BASE_EXERCISE],
      stats: BASE_STATS,
    }
    await seedWorkouts(page, [workout])

    await page.goto(`/history/${workout.id}`)
    await expect(page.getByText("Legacy Workout")).toBeVisible()

    // Duration should show (backfilled)
    await expect(page.getByText("Duration")).toBeVisible()
    await expect(page.getByText("45 min")).toBeVisible()
    // Time range should show (startedAt derived as endedAt - duration = 10:15 AM)
    await expect(page.locator("text=/\\d+:\\d{2}\\s*(AM|PM)\\s*–\\s*\\d+:\\d{2}\\s*(AM|PM)/")).toBeVisible()
  })

  test("workout summary derives startedAt from endedAt and duration when startedAt is missing", async ({ page }) => {
    const endedAt = new Date("2026-04-07T09:30:00").toISOString()
    const duration = 1800 // 30 min
    const workout = {
      id: "legacy-summary-no-startedat",
      name: "Legacy Summary Workout",
      date: new Date("2026-04-07T12:00:00").toISOString(),
      // no startedAt
      endedAt,
      duration,
      durationUnit: "seconds",
      exercises: [BASE_EXERCISE],
      stats: BASE_STATS,
    }
    await seedWorkouts(page, [workout])

    await page.goto(`/workout-summary?workoutId=${workout.id}`)
    await expect(page.getByText("Workout Complete")).toBeVisible()

    await expect(page.getByText("Duration")).toBeVisible()
    await expect(page.getByText("30 min")).toBeVisible()
    await expect(page.locator("text=/\\d+:\\d{2}\\s*(AM|PM)\\s*–\\s*\\d+:\\d{2}\\s*(AM|PM)/")).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Session completion regression — missing startedAt on session
// ---------------------------------------------------------------------------

test.describe("Session completion — timing saved correctly", () => {
  const routine = {
    id: "routine-timing-test",
    name: "Timing Regression Routine",
    description: "",
    estimatedTime: "30 min",
    category: "Test",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    exercises: [
      {
        id: "ex-timing-1",
        name: "Squat",
        type: "strength",
        targetSets: 1,
        targetReps: "5",
        restTime: 60,
        notes: "",
      },
    ],
  }

  test("workout completed from a session without startedAt still saves timing data", async ({ page }) => {
    // Simulate the pre-existing bug: a session stored without startedAt
    // (e.g. created before the field was introduced, or via a code path that missed it)
    const sessionId = "session-no-startedAt"
    const workoutId = "workout-from-no-startedat"

    await page.addInitScript(
      ({ routineSeed, sessionSeed }: { routineSeed: any; sessionSeed: any }) => {
        localStorage.setItem("workout_routines_v2", JSON.stringify([routineSeed]))
        localStorage.setItem("workoutSessions", JSON.stringify([sessionSeed]))
        localStorage.setItem("currentSessionId", sessionSeed.id)
      },
      {
        routineSeed: routine,
        sessionSeed: {
          id: sessionId,
          workoutId,
          routineId: routine.id,
          routineName: routine.name,
          status: "in_progress",
          // startedAt intentionally omitted to reproduce the bug
          activeDurationSeconds: 0,
          currentExerciseIndex: 0,
          exercises: [
            {
              id: "ex-timing-1",
              name: "Squat",
              targetSets: 1,
              targetReps: "5",
              restTime: 60,
              completed: false,
              sets: [{ id: "s1", reps: 5, weight: 135, completed: true }],
            },
          ],
        },
      },
    )

    await page.goto(`/workout/session?routineId=${routine.id}`)
    await expect(page.getByText("SQUAT")).toBeVisible()

    // Click the FINISH button (no confirmation dialog — it calls finishWorkout() directly)
    const finishBtn = page.getByRole("button", { name: "FINISH" })
    await expect(finishBtn).toBeVisible({ timeout: 10000 })
    await expect(finishBtn).toBeEnabled()
    await finishBtn.click()

    // Should navigate to workout summary
    await expect(page).toHaveURL(/workout-summary/, { timeout: 15000 })
    await expect(page.getByText("Workout Complete")).toBeVisible()

    // Duration should be shown (0 min is acceptable — session had no prior startedAt
    // so both startedAt and endedAt are set to completion time → 0 min duration)
    // What must NOT happen: "Workout date" fallback (means duration was lost entirely)
    await expect(page.getByText("Workout date")).not.toBeVisible()
    await expect(page.getByText("Duration")).toBeVisible()
  })
})
