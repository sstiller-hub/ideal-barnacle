import { test, expect } from "@playwright/test"

test("settings back button returns home", async ({ page }) => {
  await page.goto("/settings")
  await page.getByRole("button", { name: "Back to home" }).click()
  await expect(page).toHaveURL(/\/$/)
})
