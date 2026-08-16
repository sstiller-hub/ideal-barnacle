import { test, expect, type Page } from "@playwright/test"

const workoutId = "whoop-transcribe-1"

const workout = {
  id: workoutId,
  name: "Legs 1 – Quad Dominant",
  date: new Date().toISOString(),
  duration: 3600,
  exercises: [
    {
      id: "ex-warmup",
      name: "Leg day warmup",
      targetSets: 1,
      targetReps: "10",
      restTime: 60,
      completed: true,
      sets: [{ weight: 45, reps: 10, completed: true }],
    },
    {
      id: "ex-1",
      name: "Arsenal Pendulum Squat",
      targetSets: 3,
      targetReps: "8-10",
      restTime: 120,
      completed: true,
      sets: [
        { weight: 180, reps: 10, completed: true },
        { weight: 200, reps: 8, completed: true },
        { weight: 200, reps: 6, completed: true },
      ],
    },
    {
      id: "ex-2",
      name: "Leg Extension",
      targetSets: 2,
      targetReps: "12-15",
      restTime: 90,
      completed: true,
      sets: [
        { weight: 120, reps: 15, completed: true },
        { weight: 120, reps: 12, completed: true },
      ],
    },
  ],
  stats: { totalSets: 6, completedSets: 6, totalVolume: 8000, totalReps: 61 },
}

async function seed(page: Page) {
  await page.addInitScript((workoutSeed) => {
    localStorage.setItem("workout_history", JSON.stringify([workoutSeed]))
  }, workout)
}

test("opens on the first working exercise with warm-ups hidden", async ({ page }) => {
  await seed(page)
  await page.goto(`/workout-summary/transcribe?workoutId=${workoutId}`)

  await expect(page.getByText("Arsenal Pendulum Squat")).toBeVisible()
  await expect(page.getByText("Leg day warmup")).toHaveCount(0)
  // Two working exercises, warm-up excluded.
  await expect(page.getByText("1/2")).toBeVisible()
  await expect(page.getByRole("button", { name: /Set 1, 180 pounds by 10 reps/ })).toBeVisible()
})

test("checking off sets and advancing survives a reload", async ({ page }) => {
  await seed(page)
  await page.goto(`/workout-summary/transcribe?workoutId=${workoutId}`)

  await page.getByRole("button", { name: /Set 1, 180 pounds by 10 reps/ }).click()
  await page.getByRole("button", { name: /Set 2, 200 pounds by 8 reps/ }).click()
  await page.getByRole("button", { name: "Next exercise" }).click()

  await expect(page.getByText("Leg Extension")).toBeVisible()
  await expect(page.getByText("2/2")).toBeVisible()

  await page.reload()

  // Back on the same exercise, with the earlier checks intact.
  await expect(page.getByText("Leg Extension")).toBeVisible()
  await page.getByRole("button", { name: "Previous exercise" }).click()
  await expect(page.getByRole("button", { name: /Set 1, 180 pounds by 10 reps/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await expect(page.getByRole("button", { name: /Set 3, 200 pounds by 6 reps/ })).toHaveAttribute(
    "aria-pressed",
    "false",
  )
})

test("a saved Whoop alias replaces the Akt name and persists", async ({ page }) => {
  await seed(page)
  await page.goto(`/workout-summary/transcribe?workoutId=${workoutId}`)

  await page.getByRole("button", { name: /Map .* to a Whoop exercise/ }).click()
  await page.getByLabel("Whoop exercise name").fill("Pendulum Squat")
  await page.getByLabel("Whoop exercise name").press("Enter")

  await expect(page.getByText("Pendulum Squat", { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByText("Pendulum Squat", { exact: true })).toBeVisible()
  // The Akt name stays visible underneath so the mapping stays auditable.
  await expect(page.getByText("Arsenal Pendulum Squat")).toBeVisible()
})

test("warm-ups can be shown on demand", async ({ page }) => {
  await seed(page)
  await page.goto(`/workout-summary/transcribe?workoutId=${workoutId}`)

  await page.getByRole("button", { name: "Show warm-ups" }).click()
  await expect(page.getByText("Leg day warmup")).toBeVisible()
  await expect(page.getByText("1/3")).toBeVisible()
})

test("the summary screen links into transcription mode", async ({ page }) => {
  await seed(page)
  await page.goto(`/workout-summary?workoutId=${workoutId}`)

  await page.getByRole("button", { name: "Log to Whoop" }).click()
  await expect(page).toHaveURL(/workout-summary\/transcribe/)
  await expect(page.getByText("Log to Whoop")).toBeVisible()
})
