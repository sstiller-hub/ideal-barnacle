import { test, expect } from "@playwright/test"

const routine = {
  id: "test-routine-regressions",
  name: "Upper Body – Rows, Chest & Arms",
  description: "Demo routine",
  estimatedTime: "45 min",
  category: "Test",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  exercises: [
    { id: "ex-1", name: "Overhand Row", type: "strength", targetSets: 2, targetReps: "6-8", notes: "Rest 2m" },
    { id: "ex-2", name: "Incline Dumbbell Bench", type: "strength", targetSets: 2, targetReps: "6-8", notes: "Rest 2m" },
  ],
}

const buildHistory = (weight: number, reps: number) => [
  {
    id: "hist-1",
    name: "Test Workout",
    date: new Date(Date.now() - 86400000).toISOString(),
    exercises: [
      {
        id: "ex-1",
        name: "Overhand Row",
        targetSets: 2,
        targetReps: "6-8",
        restTime: 120,
        completed: true,
        sets: [
          { id: "hist-set-1", reps, weight, completed: true },
          { id: "hist-set-2", reps, weight, completed: true },
        ],
      },
    ],
    stats: {
      totalSets: 2,
      completedSets: 2,
      totalVolume: weight * reps * 2,
      totalReps: reps * 2,
    },
  },
]

const seedBaseStorage = (page: any, options?: { history?: any[]; session?: any }) =>
  page.addInitScript(
    ({ routineSeed, historySeed, sessionSeed }: { routineSeed: any; historySeed: any; sessionSeed: any }) => {
      if (localStorage.getItem("__pw_seeded") === "true") return
      localStorage.clear()
      localStorage.setItem("workout_routines_v2", JSON.stringify([routineSeed]))
      if (historySeed) {
        localStorage.setItem("workout_history", JSON.stringify(historySeed))
      }
      if (sessionSeed) {
        localStorage.setItem("workoutSessions", JSON.stringify([sessionSeed]))
        localStorage.setItem("currentSessionId", sessionSeed.id)
      }
      localStorage.setItem("__pw_seeded", "true")
    },
    { routineSeed: routine, historySeed: options?.history, sessionSeed: options?.session }
  )

test("Home shows sets remaining for active workout", async ({ page }) => {
  const session = {
    id: "session-1",
    routineId: routine.id,
    routineName: routine.name,
    status: "in_progress",
    startedAt: new Date().toISOString(),
    activeDurationSeconds: 0,
    currentExerciseIndex: 0,
    exercises: [
      {
        id: "ex-1",
        name: "Overhand Row",
        targetSets: 2,
        targetReps: "6-8",
        completed: false,
        sets: [
          { id: "s1", reps: 8, weight: 100, completed: true },
          { id: "s2", reps: null, weight: null, completed: false },
        ],
      },
      {
        id: "ex-2",
        name: "Incline Dumbbell Bench",
        targetSets: 2,
        targetReps: "6-8",
        completed: false,
        sets: [
          { id: "s3", reps: null, weight: null, completed: false },
          { id: "s4", reps: null, weight: null, completed: false },
        ],
      },
    ],
  }
  await seedBaseStorage(page, { session })
  await page.goto("/")
  await expect(page.getByText(/in progress · 3 sets left/i)).toBeVisible()
  await expect(page.getByText("SETS LEFT", { exact: true })).toBeVisible()
})

test("Home treats legacy active status as resumable session", async ({ page }) => {
  const session = {
    id: "session-active-legacy",
    routineId: routine.id,
    routineName: routine.name,
    status: "active",
    startedAt: new Date().toISOString(),
    activeDurationSeconds: 0,
    currentExerciseIndex: 0,
    exercises: [
      {
        id: "ex-1",
        name: "Overhand Row",
        targetSets: 2,
        targetReps: "6-8",
        completed: false,
        sets: [
          { id: "s1", reps: 8, weight: 100, completed: true },
          { id: "s2", reps: null, weight: null, completed: false },
        ],
      },
    ],
  }
  await seedBaseStorage(page, { session })
  await page.goto("/")
  await expect(page.getByRole("button", { name: "Resume Workout" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Discard Active Workout" })).toBeVisible()
})

test("Home treats missing status as resumable when session has no end time", async ({ page }) => {
  const session = {
    id: "session-no-status",
    routineId: routine.id,
    routineName: routine.name,
    startedAt: new Date().toISOString(),
    activeDurationSeconds: 0,
    currentExerciseIndex: 0,
    exercises: [
      {
        id: "ex-1",
        name: "Overhand Row",
        targetSets: 2,
        targetReps: "6-8",
        completed: false,
        sets: [
          { id: "s1", reps: 8, weight: 100, completed: true },
          { id: "s2", reps: null, weight: null, completed: false },
        ],
      },
    ],
  }
  await seedBaseStorage(page, { session })
  await page.goto("/")
  await expect(page.getByRole("button", { name: "Resume Workout" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Discard Active Workout" })).toBeVisible()
})

test("Home shows resume for active session started yesterday", async ({ page }) => {
  const startedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const session = {
    id: "session-yesterday",
    routineId: routine.id,
    routineName: routine.name,
    status: "in_progress",
    startedAt,
    activeDurationSeconds: 0,
    currentExerciseIndex: 0,
    exercises: [
      {
        id: "ex-1",
        name: "Overhand Row",
        targetSets: 2,
        targetReps: "6-8",
        completed: false,
        sets: [
          { id: "s1", reps: 8, weight: 100, completed: true },
          { id: "s2", reps: null, weight: null, completed: false },
        ],
      },
    ],
  }
  await seedBaseStorage(page, { session })
  await page.goto("/")
  await expect(page.getByRole("button", { name: "Resume Workout" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Discard Active Workout" })).toBeVisible()
})

test("completed set persists after reload", async ({ page }) => {
  await seedBaseStorage(page)
  await page.goto(`/workout/session?routineId=${routine.id}`)

  const weightInput = page.locator('input[type="number"]').nth(0)
  const repsInput = page.locator('input[type="number"]').nth(1)
  await weightInput.fill("100")
  await repsInput.fill("8")

  await page.locator('button[aria-label="Complete Set"]:not([disabled])').first().click()
  await expect(page.locator('button[aria-label="Mark Set Incomplete"]')).toBeVisible()

  await page.reload()
  await page.waitForFunction(() => {
    try {
      const sessions = JSON.parse(localStorage.getItem("workoutSessions") || "[]")
      return sessions.some((session: any) =>
        Array.isArray(session.exercises) &&
        session.exercises.some((exercise: any) =>
          Array.isArray(exercise.sets) &&
          exercise.sets.some((set: any) => set?.completed)
        )
      )
    } catch {
      return false
    }
  })

  await expect(page.locator('button[aria-label="Mark Set Incomplete"]')).toBeVisible({ timeout: 15000 })
})

test("shows PR chip in active workout set row", async ({ page }) => {
  await seedBaseStorage(page, { history: buildHistory(100, 8) })
  await page.goto(`/workout/session?routineId=${routine.id}`)

  const weightInput = page.locator('input[type="number"]').nth(0)
  const repsInput = page.locator('input[type="number"]').nth(1)
  await weightInput.fill("110")
  await repsInput.fill("8")

  await expect(page.getByText(/PR ·/)).toBeVisible()
})

test("shows RECOVERY chip when below last performance", async ({ page }) => {
  await seedBaseStorage(page, { history: buildHistory(100, 8) })
  await page.goto(`/workout/session?routineId=${routine.id}`)

  const weightInput = page.locator('input[type=\"number\"]').nth(0)
  const repsInput = page.locator('input[type=\"number\"]').nth(1)
  await weightInput.fill("90")
  await repsInput.fill("8")

  await expect(page.getByText("RECOVERY")).toBeVisible()
})

// The ledger redesign expresses set state through ink + the left state-edge only;
// a set row is born at its final geometry and never resizes on completion. A
// completed set's input must match the still-active set's input exactly.
test("completed set keeps fixed geometry (no size morph)", async ({ page }) => {
  await seedBaseStorage(page)
  await page.goto(`/workout/session?routineId=${routine.id}`)

  const set1Weight = page.locator('input[type="number"]').nth(0)
  const set1Reps = page.locator('input[type="number"]').nth(1)
  const set2Weight = page.locator('input[type="number"]').nth(2)
  await set1Weight.fill("100")
  await set1Reps.fill("8")

  await page.locator('button[aria-label="Complete Set"]:not([disabled])').first().click()
  // set 1 is now completed; set 2 is the current set. Both inputs are measured
  // at the same instant (no web-font-load boundary between the two reads).
  await expect(page.locator('button[aria-label="Mark Set Incomplete"]')).toBeVisible()

  const completedBox = await set1Weight.boundingBox()
  const activeBox = await set2Weight.boundingBox()
  expect(completedBox && activeBox).toBeTruthy()
  if (completedBox && activeBox) {
    expect(completedBox.height).toBeCloseTo(activeBox.height, 1)
  }
})

test("plate toggle is single button and flips label", async ({ page }) => {
  await seedBaseStorage(page)
  await page.goto(`/workout/session?routineId=${routine.id}`)

  const weightInput = page.locator('input[type="number"]').nth(0)
  await weightInput.fill("135")

  const toggle = page.getByRole("button", { name: /per side|total/i }).first()
  await expect(toggle).toBeVisible()
  const initialLabel = (await toggle.textContent()) || ""
  await toggle.click()
  const nextLabel = (await toggle.textContent()) || ""
  expect(nextLabel).not.toBe(initialLabel)
})

// Checking off a set should unselect all text boxes (drop the keyboard) and
// must NOT auto-focus the next set's weight — that value is already prefilled
// from progression, so it's left selectable but un-focused.
test("checking a set clears selection and does not auto-focus the next weight", async ({ page }) => {
  const session = {
    id: "auto-select-session",
    routineId: routine.id,
    routineName: routine.name,
    status: "in_progress",
    startedAt: new Date().toISOString(),
    activeDurationSeconds: 0,
    currentExerciseIndex: 0,
    exercises: [
      {
        id: "ex-1",
        name: "Overhand Row",
        targetSets: 2,
        targetReps: "6-8",
        restTime: 120,
        completed: false,
        sets: [
          { id: "s1", reps: 8, weight: 100, completed: false },
          { id: "s2", reps: 8, weight: 105, completed: false },
        ],
      },
    ],
  }
  await seedBaseStorage(page, { session })
  await page.goto("/workout/session?routineId=" + routine.id)

  // Focus set 1's weight so a text box is selected / keyboard is up.
  const set1Weight = page.locator('input[type="number"]').nth(0)
  await set1Weight.focus()
  await expect(set1Weight).toBeFocused()

  // Complete set 1 (already valid: weight + reps filled).
  await page.locator('button[aria-label="Complete Set"]:not([disabled])').first().click()
  await expect(page.locator('button[aria-label="Mark Set Incomplete"]')).toBeVisible()

  // No text box stays selected, and set 2's weight is NOT auto-focused — but its
  // prefilled value is still there, ready to be tapped if the user wants it.
  const set2Weight = page.locator('input[type="number"]').nth(2)
  await expect(set2Weight).not.toBeFocused()
  const activeIsInput = await page.evaluate(() => document.activeElement?.tagName === "INPUT")
  expect(activeIsInput).toBe(false)
  await expect(set2Weight).toHaveValue("105")
})

test("resumes active session when routine is missing from library", async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("__resume_missing_routine_seeded") === "true") return
    localStorage.clear()
    localStorage.setItem("workout_routines_v2", JSON.stringify([]))
    localStorage.setItem(
      "workoutSessions",
      JSON.stringify([
        {
          id: "legacy-session-1",
          routineId: "legacy-routine-id",
          routineName: "Legacy Routine",
          status: "in_progress",
          startedAt: new Date().toISOString(),
          activeDurationSeconds: 0,
          currentExerciseIndex: 0,
          exercises: [
            {
              id: "legacy-ex-1",
              name: "Legacy Row",
              targetSets: 2,
              targetReps: "6-8",
              completed: false,
              sets: [
                { id: "legacy-s1", reps: 8, weight: 100, completed: true },
                { id: "legacy-s2", reps: null, weight: null, completed: false },
              ],
            },
          ],
        },
      ]),
    )
    localStorage.setItem("currentSessionId", "legacy-session-1")
    localStorage.setItem("__resume_missing_routine_seeded", "true")
  })

  await page.goto("/workout/session?routineId=legacy-routine-id")
  await expect(page.getByText("LEGACY ROW")).toBeVisible()
})

test.describe("Browsing other days during an active workout", () => {
  test.use({ hasTouch: true })

  const swipeHeader = async (page: any, direction: "next" | "previous") => {
    await page.evaluate((dir: string) => {
      const header = document.querySelector('[style*="pan-x"]') as HTMLElement | null
      if (!header) throw new Error("day header not found")
      const makeTouch = (x: number) =>
        new Touch({ identifier: 1, target: header, clientX: x, clientY: 200 })
      const fire = (type: string, x: number) => {
        const touch = makeTouch(x)
        header.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: type === "touchend" ? [] : [touch],
            targetTouches: type === "touchend" ? [] : [touch],
            changedTouches: [touch],
          }),
        )
      }
      const startX = dir === "next" ? 300 : 60
      const endX = dir === "next" ? 60 : 300
      fire("touchstart", startX)
      fire("touchmove", endX)
      fire("touchend", endX)
    }, direction)
  }

  const activeSession = {
    id: "session-browse-days",
    routineId: routine.id,
    routineName: routine.name,
    status: "in_progress",
    startedAt: new Date().toISOString(),
    currentExerciseIndex: 0,
    exercises: [
      {
        id: "ex-1",
        name: "Overhand Row",
        targetSets: 2,
        targetReps: "6-8",
        completed: false,
        sets: [
          { id: "s1", reps: 8, weight: 100, completed: true },
          { id: "s2", reps: null, weight: null, completed: false },
        ],
      },
    ],
  }

  test("swiping to another day leaves the active session view and shows a resume bar", async ({ page }) => {
    await seedBaseStorage(page, { session: activeSession })
    await page.goto("/")

    await expect(page.getByRole("button", { name: "Resume Workout" })).toBeVisible()
    await expect(page.getByTestId("selected-day-label")).toHaveText("TODAY")

    await swipeHeader(page, "next")

    await expect(page.getByTestId("selected-day-label")).toHaveText("TOMORROW")
    // The day is no longer rendered as the active session…
    await expect(page.getByRole("button", { name: "Resume Workout" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Discard Active Workout" })).toHaveCount(0)
    // …but the workout stays reachable from the pinned bar.
    await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible()

    await swipeHeader(page, "previous")
    await expect(page.getByTestId("selected-day-label")).toHaveText("TODAY")
    await expect(page.getByRole("button", { name: "Resume Workout" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Resume", exact: true })).toHaveCount(0)
  })

  test("the resume bar returns to the in-progress session", async ({ page }) => {
    await seedBaseStorage(page, { session: activeSession })
    await page.goto("/")
    await swipeHeader(page, "next")

    await page.getByRole("button", { name: "Resume", exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/workout/session\\?routineId=${routine.id}`))
  })

  test("View day returns to the day the session was started on", async ({ page }) => {
    await seedBaseStorage(page, { session: activeSession })
    await page.goto("/")
    await swipeHeader(page, "next")
    await swipeHeader(page, "next")
    await expect(page.getByTestId("selected-day-label")).toHaveText("UPCOMING")

    await page.getByRole("button", { name: "View day" }).click()
    await expect(page.getByTestId("selected-day-label")).toHaveText("TODAY")
    await expect(page.getByRole("button", { name: "Resume Workout" })).toBeVisible()
  })
})
