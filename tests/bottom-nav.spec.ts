import { test, expect } from "@playwright/test"

test("dock renders 5 tabs with readable labels and is centered", async ({ page }) => {
  await page.goto("/")
  const navRoot = page.locator("[data-nav-root]")
  const labels = page.locator("[data-nav-label]")
  await expect(labels).toHaveCount(5)
  await expect(labels.nth(0)).toHaveText("Home")
  await expect(labels.nth(1)).toHaveText("Workouts")
  await expect(labels.nth(2)).toHaveText("History")
  await expect(labels.nth(3)).toHaveText("PRs")
  await expect(labels.nth(4)).toHaveText("Settings")

  const navBox = await navRoot.boundingBox()
  expect(navBox).not.toBeNull()
  if (!navBox) return
  const viewport = page.viewportSize()
  const viewportWidth = viewport?.width ?? (await page.evaluate(() => window.innerWidth))
  const navCenter = navBox.x + navBox.width / 2
  expect(Math.abs(navCenter - viewportWidth / 2)).toBeLessThanOrEqual(12)
})

test("hold and slide navigates to another tab", async ({ page }) => {
  await page.goto("/")
  const navRoot = page.locator("[data-nav-root]")
  const activeButton = page.locator('[data-nav-item][data-href="/"]')
  const targetButton = page.locator('[data-nav-item][data-href="/workout"]')

  const activeBox = await activeButton.boundingBox()
  expect(activeBox).not.toBeNull()
  if (!activeBox) return

  await page.mouse.move(activeBox.x + activeBox.width / 2, activeBox.y + activeBox.height / 2)
  await page.mouse.down()
  await expect(navRoot).toHaveAttribute("data-expanded", "true")
  await expect(targetButton).toBeVisible()

  const targetBox = await targetButton.boundingBox()
  expect(targetBox).not.toBeNull()
  if (!targetBox) return

  await targetButton.hover()
  await expect(targetButton).toHaveAttribute("data-hovered", "true")
  await page.mouse.up()

  await expect(page).toHaveURL(/\/workout/)
})
