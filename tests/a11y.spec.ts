import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

const runA11y = async (page: Page, name: string) => {
  const results = await new AxeBuilder({ page })
    .disableRules(["color-contrast"])
    .analyze()
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
