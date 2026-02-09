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
    ({ routineSeed, historySeed, sessionSeed }) => {
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
  await expect(page.getByText(/sets remaining/i)).toBeVisible()
  await expect(page.getByText(/3 sets remaining/i)).toBeVisible()
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

test("shows NEW PR in active workout set row", async ({ page }) => {
  await seedBaseStorage(page, { history: buildHistory(100, 8) })
  await page.goto(`/workout/session?routineId=${routine.id}`)

  const weightInput = page.locator('input[type="number"]').nth(0)
  const repsInput = page.locator('input[type="number"]').nth(1)
  await weightInput.fill("110")
  await repsInput.fill("8")

  await expect(page.getByText("NEW PR!")).toBeVisible()
})

test("shows Recovery set when below last performance", async ({ page }) => {
  await seedBaseStorage(page, { history: buildHistory(100, 8) })
  await page.goto(`/workout/session?routineId=${routine.id}`)

  const weightInput = page.locator('input[type=\"number\"]').nth(0)
  const repsInput = page.locator('input[type=\"number\"]').nth(1)
  await weightInput.fill("90")
  await repsInput.fill("8")

  await expect(page.getByText("Recovery set")).toBeVisible()
})

test("completed set renders more compact in active exercise", async ({ page }) => {
  await seedBaseStorage(page)
  await page.goto(`/workout/session?routineId=${routine.id}`)

  const weightInput = page.locator('input[type="number"]').nth(0)
  const repsInput = page.locator('input[type="number"]').nth(1)
  const beforeBox = await weightInput.boundingBox()
  await weightInput.fill("100")
  await repsInput.fill("8")

  await page.locator('button[aria-label="Complete Set"]:not([disabled])').first().click()
  await page.waitForTimeout(100)

  const afterBox = await weightInput.boundingBox()
  expect(beforeBox && afterBox).toBeTruthy()
  if (beforeBox && afterBox) {
    expect(afterBox.height).toBeLessThan(beforeBox.height)
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
