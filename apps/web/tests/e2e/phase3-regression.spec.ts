/**
 * P3-12: Phase 3 E2E regression suite.
 * Verifies key P3 features are wired correctly in the running app.
 */
import { test, expect } from "@playwright/test"

test.describe("Phase 3 regression", () => {
  test.describe("Authenticated", () => {
    test.use({ storageState: "tests/e2e/.auth/admin.json" })

    test("generate page has 'Draft with Gemini' button", async ({ page }) => {
      await page.goto("/generate")
      await expect(page.getByText("Draft with Gemini")).toBeVisible()
    })

    test("Draft with Gemini panel expands on click", async ({ page }) => {
      await page.goto("/generate")
      await page.getByText("Draft with Gemini").click()
      await expect(page.getByPlaceholder(/Introduction to AI/i)).toBeVisible()
    })

    test("admin library page loads with table", async ({ page }) => {
      await page.goto("/admin/library")
      await expect(page.getByRole("heading", { name: "Voice Library" })).toBeVisible()
      // Table header present even if no profiles
      await expect(page.getByRole("columnheader", { name: "Org Shared" })).toBeVisible()
    })

    test("voice enrollment page visible", async ({ page }) => {
      await page.goto("/voices")
      await expect(page.getByText("Voice Library")).toBeVisible()
    })

    test("history page accessible", async ({ page }) => {
      await page.goto("/history")
      await expect(page.getByText(/Generation History|Lịch sử/)).toBeVisible()
    })
  })

  test.describe("Public pages redirect when unauthenticated", () => {
    test("unauthenticated /generate redirects to login", async ({ page }) => {
      await page.goto("/generate")
      await expect(page).toHaveURL(/login|\/en\//)
    })

    test("unauthenticated /admin/library redirects", async ({ page }) => {
      await page.goto("/admin/library")
      await expect(page).toHaveURL(/login|\/en\//)
    })
  })
})
