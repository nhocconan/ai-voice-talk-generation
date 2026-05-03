/**
 * P3-10: Accessibility audit — axe-core checks on all public and app pages.
 * Requires: @axe-core/playwright installed as dev dep.
 * Run: pnpm e2e --grep=accessibility
 */
import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

const PUBLIC_PAGES = ["/login"]

const APP_PAGES = [
  "/dashboard",
  "/voices",
  "/generate",
  "/history",
]

async function checkA11y(page: Page, route: string) {
  await page.goto(route)
  const results = await new AxeBuilder({ page })
    .exclude("#__next-route-announcer__")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze()

  const critical = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious"
  )

  if (critical.length > 0) {
    const summary = critical.map((v) => `${v.id}: ${v.description} (${v.impact})`).join("\n")
    expect(critical, `A11y violations on ${route}:\n${summary}`).toHaveLength(0)
  }
}

test.describe("Accessibility — public pages", () => {
  for (const route of PUBLIC_PAGES) {
    test(`${route} has no critical/serious axe violations`, async ({ page }) => {
      await checkA11y(page, route)
    })
  }
})

test.describe("Accessibility — app pages (authenticated)", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" })

  for (const route of APP_PAGES) {
    test(`${route} has no critical/serious axe violations`, async ({ page }) => {
      await checkA11y(page, route)
    })
  }
})
