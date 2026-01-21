import { test, expect } from "@playwright/test"

test("home settings icon navigates to settings", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Open settings" }).click()
  await expect(page).toHaveURL(/\/settings/)
})

test("settings back button returns home", async ({ page }) => {
  await page.goto("/settings")
  await page.getByRole("button", { name: "Back to home" }).click()
  await expect(page).toHaveURL(/\/$/)
})
