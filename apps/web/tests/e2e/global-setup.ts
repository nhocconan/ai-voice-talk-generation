/**
 * Playwright global setup — logs in as admin and saves auth state.
 * Requires the app server + DB to be running.
 */
import { chromium, FullConfig } from "@playwright/test"
import * as fs from "fs"
import * as path from "path"

const ADMIN_EMAIL = "admin@younetgroup.com"
// Try both seeded password and the E2E-changed one
const PASSWORDS = ["YouNet@2026", "YouNet@E2E2026!"]

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3000"
  const authDir = path.join(__dirname, ".auth")
  const authFile = path.join(authDir, "admin.json")

  // If already exists and recent, skip
  if (fs.existsSync(authFile)) {
    const stat = fs.statSync(authFile)
    const ageMs = Date.now() - stat.mtimeMs
    if (ageMs < 30 * 60 * 1000) return // reuse if < 30 min old
  }

  fs.mkdirSync(authDir, { recursive: true })

  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  let loggedIn = false
  for (const password of PASSWORDS) {
    try {
      await page.goto(`${baseURL}/login`, { timeout: 30_000 })
      await page.getByLabel(/email/i).fill(ADMIN_EMAIL)
      await page.getByLabel(/password/i).fill(password)
      await page.locator("form").getByRole("button", { name: /sign in/i }).click()
      await page.waitForURL(/\/(dashboard|admin|change-password|en\/)/, { timeout: 15_000 })

      // Handle forced password change
      if (page.url().includes("change-password")) {
        const newPw = "YouNet@E2E2026!"
        await page.getByLabel(/new password/i).fill(newPw)
        await page.getByLabel(/confirm/i).fill(newPw)
        await page.getByRole("button", { name: /change|save/i }).click()
        await page.waitForURL(/\/(dashboard|admin)/, { timeout: 10_000 })
      }

      loggedIn = true
      break
    } catch {
      // try next password
    }
  }

  if (loggedIn) {
    await context.storageState({ path: authFile })
    console.log("[globalSetup] Admin auth state saved to", authFile)
  } else {
    console.warn("[globalSetup] Could not log in — auth state not saved; some tests will be skipped")
    // Write empty state so tests don't crash with ENOENT
    fs.writeFileSync(authFile, JSON.stringify({ cookies: [], origins: [] }))
  }

  await browser.close()
}
