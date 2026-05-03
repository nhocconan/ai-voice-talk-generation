import { test, expect } from "@playwright/test"

const ADMIN_EMAIL = "admin@younetgroup.com"
const ADMIN_PASSWORD = "YouNet@2026"

test.describe("Authentication", () => {
  test("unauthenticated access to /dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/login|\/en\//)
  })

  test("unauthenticated access to /admin redirects to /login", async ({ page }) => {
    await page.goto("/admin")
    await expect(page).toHaveURL(/login|\/en\//)
  })

  test("login page renders", async ({ page }) => {
    await page.goto("/login")
    await expect(page.getByRole("heading")).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
  })

  test("invalid credentials show error", async ({ page }) => {
    await page.goto("/login")
    await page.getByLabel(/email/i).fill("wrong@example.com")
    await page.getByLabel(/password/i).fill("wrongpassword")
    await page.locator("form").getByRole("button", { name: /sign in/i }).click()
    await expect(page.getByText(/invalid|incorrect|failed/i)).toBeVisible({ timeout: 5000 })
  })
})

test.describe("Admin happy path", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login")
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL)
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD)
    await page.locator("form").getByRole("button", { name: /sign in/i }).click()
    // Super admin must change forced password — or has already changed it in the E2E DB
    // We accept either landing on change-password or dashboard/admin
    await page.waitForURL(/\/(dashboard|admin|change-password)/, { timeout: 10_000 })
  })

  test("admin can access /admin after login", async ({ page }) => {
    // If forced password change is required, fill it in
    if (page.url().includes("change-password")) {
      await page.getByLabel(/new password/i).fill("YouNet@E2E2026!")
      await page.getByLabel(/confirm/i).fill("YouNet@E2E2026!")
      await page.getByRole("button", { name: /change|save/i }).click()
      await page.waitForURL(/\/(dashboard|admin)/, { timeout: 10_000 })
    }

    await page.goto("/admin/users")
    await expect(page.getByText(/admin@younetgroup/i)).toBeVisible({ timeout: 10_000 })
  })
})
