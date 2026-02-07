import { test, expect } from "@playwright/test"

test("shows app version in settings", async ({ page }) => {
  await page.goto("/settings")
  await page.getByRole("button", { name: /about & device/i }).click()
  const version = page.getByTestId("app-version")
  await expect(version).toBeVisible()
  const text = (await version.textContent())?.trim() || ""
  expect(text.length).toBeGreaterThan(0)
})
