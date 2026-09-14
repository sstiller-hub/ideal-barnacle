import { test, expect } from "@playwright/test"

// Settings is a tab root now, not a pushed page, so it has no back button —
// you leave it the way you leave any tab, by picking another one.
test("the tab bar moves between the three roots", async ({ page }) => {
  await page.goto("/settings")
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible()

  await page.getByRole("button", { name: "Home" }).click()
  await expect(page).toHaveURL(/\/$/)

  await page.getByRole("button", { name: "History" }).click()
  await expect(page).toHaveURL(/\/history$/)

  await page.getByRole("button", { name: "Settings" }).click()
  await expect(page).toHaveURL(/\/settings$/)
})

test("the settings root pushes to Account & Sync", async ({ page }) => {
  await page.goto("/settings")
  await page.getByRole("button", { name: /Not signed in|Sign in to sync/ }).first().click()
  await expect(page).toHaveURL(/\/settings\/account$/)
})
