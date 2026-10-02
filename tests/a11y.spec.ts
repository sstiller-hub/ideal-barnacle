import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

// Entry animations fade sections in from opacity 0; measuring mid-fade would
// report contrast for a frame nobody reads. Reduced motion renders the final
// state immediately, as the design language requires.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
})

const runA11y = async (page: Page, name: string) => {
  // Contrast is enforced: secondary text sits at ink-50 or brighter.
  const results = await new AxeBuilder({ page: page as any }).exclude("nextjs-portal").analyze()
  expect(results.violations, `${name} has accessibility violations`).toEqual([])
}

test("a11y: Home", async ({ page }) => {
  await page.goto("/")
  await runA11y(page, "Home")
})

test("a11y: Schedule", async ({ page }) => {
  await page.goto("/schedule")
  await runA11y(page, "Schedule")
})

test("a11y: Progress", async ({ page }) => {
  await page.goto("/progress")
  await runA11y(page, "Progress")
})

test("a11y: Routines", async ({ page }) => {
  await page.goto("/workout")
  await runA11y(page, "Routines")
})

test("a11y: New routine", async ({ page }) => {
  await page.goto("/workout/routine/create")
  await runA11y(page, "New routine")
})
