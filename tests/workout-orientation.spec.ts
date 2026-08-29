/**
 * Rotating the phone during an active workout.
 *
 * Akt is orientation-locked in software: PortraitLock rotates the portrait
 * layout to fill a landscape screen. Rotating must therefore be a purely visual
 * change — it must not tear down the running workout, and it must not move the
 * user to a different exercise.
 */
import { test, expect } from "@playwright/test"

const PORTRAIT = { width: 390, height: 844 }
const LANDSCAPE = { width: 844, height: 390 }

test.use({ viewport: PORTRAIT, hasTouch: true, isMobile: true })

const routine = {
  id: "orientation-routine",
  name: "Orientation Routine",
  description: "Rotation test routine",
  estimatedTime: "30 min",
  category: "Test",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  exercises: [
    { id: "or-ex-1", name: "Bench Press", type: "strength", targetSets: 2, targetReps: "6-8", notes: "Rest 2m" },
    { id: "or-ex-2", name: "Pull Up", type: "strength", targetSets: 2, targetReps: "6-10", notes: "Rest 2m" },
    { id: "or-ex-3", name: "Overhead Press", type: "strength", targetSets: 2, targetReps: "8-10", notes: "Rest 90s" },
  ],
}

// Mid-workout, parked on the third exercise.
const session = {
  id: "orientation-session",
  routineId: routine.id,
  routineName: routine.name,
  status: "in_progress",
  startedAt: new Date().toISOString(),
  activeDurationSeconds: 600,
  currentExerciseIndex: 2,
  exercises: [
    {
      id: "or-ex-1",
      name: "Bench Press",
      targetSets: 2,
      targetReps: "6-8",
      restTime: 120,
      completed: true,
      sets: [
        { id: "os-1", reps: 8, weight: 135, completed: true },
        { id: "os-2", reps: 7, weight: 135, completed: true },
      ],
    },
    {
      id: "or-ex-2",
      name: "Pull Up",
      targetSets: 2,
      targetReps: "6-10",
      restTime: 120,
      completed: true,
      sets: [
        { id: "os-3", reps: 8, weight: 0, completed: true },
        { id: "os-4", reps: 8, weight: 0, completed: true },
      ],
    },
    {
      id: "or-ex-3",
      name: "Overhead Press",
      targetSets: 2,
      targetReps: "8-10",
      restTime: 90,
      completed: false,
      sets: [
        { id: "os-5", reps: null, weight: null, completed: false },
        { id: "os-6", reps: null, weight: null, completed: false },
      ],
    },
  ],
}

const seed = (page: any) =>
  page.addInitScript(
    ({ routineSeed, sessionSeed }: { routineSeed: any; sessionSeed: any }) => {
      localStorage.clear()
      localStorage.setItem("workout_routines_v2", JSON.stringify([routineSeed]))
      localStorage.setItem("workoutSessions", JSON.stringify([sessionSeed]))
      localStorage.setItem("currentSessionId", sessionSeed.id)
    },
    { routineSeed: routine, sessionSeed: session }
  )

const readExerciseIndex = (page: any) =>
  page.evaluate(() => {
    const sessions = JSON.parse(localStorage.getItem("workoutSessions") || "[]")
    return sessions[0]?.currentExerciseIndex ?? null
  })

test.describe("Active workout: device rotation", () => {
  test("rotating does not tear down and rebuild the workout screen", async ({ page }) => {
    test.slow()
    await seed(page)
    await page.goto(`/workout/session?routineId=${routine.id}`)
    await expect(page.getByText("Overhead Press").first()).toBeVisible()

    // Tag the live DOM node. A remount replaces the element, taking the tag with
    // it, so this is a direct check that the tree survived the rotation.
    await page.evaluate(() => {
      const el = document.querySelector("[data-testid='exercise-pager']")
      ;(window as any).__taggedNode = el
      if (el) (el as any).__aktRotationTag = "before-rotation"
    })

    await page.setViewportSize(LANDSCAPE)
    await expect(page.locator(".portrait-lock-rotated")).toBeVisible()
    await page.setViewportSize(PORTRAIT)
    await expect(page.locator(".portrait-lock-rotated")).toHaveCount(0)

    const survived = await page.evaluate(() => {
      const el = (window as any).__taggedNode
      return Boolean(el && el.isConnected && el.__aktRotationTag === "before-rotation")
    })
    expect(survived).toBe(true)
  })

  test("rotating keeps the field the user was typing in focused", async ({ page }) => {
    test.slow()
    await seed(page)
    await page.goto(`/workout/session?routineId=${routine.id}`)
    await expect(page.getByText("Overhead Press").first()).toBeVisible()

    const weightInput = page.locator("input[type='number']").first()
    await weightInput.focus()
    await expect(weightInput).toBeFocused()

    await page.setViewportSize(LANDSCAPE)
    await expect(page.locator(".portrait-lock-rotated")).toBeVisible()
    await page.setViewportSize(PORTRAIT)
    await expect(page.locator(".portrait-lock-rotated")).toHaveCount(0)

    // A rebuilt tree loses the focused node, which on a phone drops the keyboard
    // mid-set.
    await expect(weightInput).toBeFocused()
  })

  test("rotating keeps the user on the same exercise", async ({ page }) => {
    test.slow()
    await seed(page)
    await page.goto(`/workout/session?routineId=${routine.id}`)
    await expect(page.getByText("Overhead Press").first()).toBeVisible()
    expect(await readExerciseIndex(page)).toBe(2)

    await page.setViewportSize(LANDSCAPE)
    await expect(page.locator(".portrait-lock-rotated")).toBeVisible()
    await page.waitForTimeout(600)

    await page.setViewportSize(PORTRAIT)
    await expect(page.locator(".portrait-lock-rotated")).toHaveCount(0)
    await page.waitForTimeout(600)

    await expect(page.getByText("Overhead Press").first()).toBeVisible()
    expect(await readExerciseIndex(page)).toBe(2)
  })

  test("rotating repeatedly never moves the active exercise", async ({ page }) => {
    test.slow()
    await seed(page)
    await page.goto(`/workout/session?routineId=${routine.id}`)
    await expect(page.getByText("Overhead Press").first()).toBeVisible()

    for (let i = 0; i < 3; i += 1) {
      await page.setViewportSize(LANDSCAPE)
      await page.waitForTimeout(400)
      await page.setViewportSize(PORTRAIT)
      await page.waitForTimeout(400)
    }

    expect(await readExerciseIndex(page)).toBe(2)
    await expect(page.getByText("Overhead Press").first()).toBeVisible()
  })
})
