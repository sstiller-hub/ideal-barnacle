import { test, expect } from "@playwright/test"

// Home is a scrolling page (month calendar + day panel + week/all-time bands).
// A leftover mount effect once set overflow:hidden on <html>/<body>, which
// blocked every touch scroll while window.scrollTo() kept working — so only a
// real touch gesture catches it.
test.use({ viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true })

const history = Array.from({ length: 4 }, (_, k) => ({
  id: `w${k}`,
  name: "Upper",
  date: new Date(Date.now() - k * 2 * 86400000 - 3600_000).toISOString(),
  duration: 3600,
  exercises: Array.from({ length: 8 }, (_, i) => ({
    id: `e${i}`,
    name: `Exercise ${i}`,
    targetSets: 3,
    targetReps: "8",
    completed: true,
    sets: [0, 1, 2].map(() => ({ weight: 100, reps: 8, completed: true })),
  })),
  stats: { totalSets: 24, completedSets: 24, totalVolume: 19200, totalReps: 192 },
}))

test("Home scrolls with a touch swipe from the lower half of the screen", async ({ page }) => {
  await page.addInitScript((seed) => {
    if (localStorage.getItem("__home_scroll_seeded") === "true") return
    localStorage.setItem("workout_history", JSON.stringify(seed))
    localStorage.setItem("__home_scroll_seeded", "true")
  }, history)
  await page.goto("/")
  await expect(page.getByTestId("home-day-action")).toBeVisible()

  const overflow = await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)
  expect(overflow).not.toBe("hidden")

  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Input.synthesizeScrollGesture", {
    x: 220,
    y: 760,
    yDistance: -300,
    gestureSourceType: "touch",
    speed: 1200,
  })
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
})
