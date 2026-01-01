import { test, expect } from "@playwright/test"

const getVisibleNavItems = async (page: any) => {
  return page.locator("[data-nav-item]").evaluateAll((nodes: HTMLElement[]) => {
    return nodes.filter((node) => {
      const style = window.getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      return (
        style.opacity !== "0" &&
        style.pointerEvents !== "none" &&
        rect.width > 0 &&
        rect.height > 0
      )
    }).length
  })
}

test("collapsed nav shows only the active item", async ({ page }) => {
  await page.goto("/")
  const navRoot = page.locator("[data-nav-root]")
  await expect(navRoot).toHaveAttribute("data-collapsed", "true")
  const visibleCount = await getVisibleNavItems(page)
  expect(visibleCount).toBe(1)
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
