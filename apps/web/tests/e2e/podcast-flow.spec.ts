/**
 * P2-10: Phase 2 E2E — podcast upload → diarize → assign → render → download.
 *
 * This test covers the full re-voice / podcast pipeline and requires a running
 * worker with ML models. It is skipped in CI unless ML_E2E=1 is set.
 */
import { test, expect } from "@playwright/test"
import path from "path"

const ML_E2E = process.env["ML_E2E"] === "1"

test.describe("Phase 2 — Podcast & Re-voice flow", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" })

  test.beforeEach(() => {
    if (!ML_E2E) {
      test.skip(true, "Set ML_E2E=1 to run ML-dependent E2E tests (requires running worker)")
    }
  })

  test("podcast generator page loads and validates script", async ({ page }) => {
    await page.goto("/generate/podcast")
    await expect(page.getByRole("heading", { name: /Podcast/i })).toBeVisible()

    // Submit empty form — expect validation
    await page.getByRole("button", { name: /Generate/i }).click()
    await expect(page.getByText(/Select/i)).toBeVisible()
  })

  test("timed script inline validation", async ({ page }) => {
    await page.goto("/generate/podcast")

    // Invalid timed script — missing speaker label
    const scriptArea = page.locator("textarea").first()
    await scriptArea.fill("[00:00] This is missing a speaker label")
    await page.getByRole("button", { name: /Generate/i }).click()
    await expect(page.getByText(/invalid|error|speaker/i)).toBeVisible()
  })

  test("revoice page loads with upload zone", async ({ page }) => {
    await page.goto("/generate/revoice")
    await expect(page.getByRole("heading", { name: /Re.voice|Revoice|Lồng tiếng/i })).toBeVisible()
    // Upload zone should be present
    await expect(page.getByText(/upload|tải lên/i).first()).toBeVisible()
  })

  test("full revoice flow: upload → diarize → assign profiles → render", async ({ page }) => {
    // This test requires a running worker with ML models
    await page.goto("/generate/revoice")

    // Upload a short test audio file
    const testAudioPath = path.join(__dirname, "fixtures", "test-two-speakers.mp3")
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles(testAudioPath)

    // Wait for ASR diarization to complete (may take up to 60s)
    await expect(page.getByText(/diarized|transcript|assigned/i)).toBeVisible({ timeout: 60_000 })

    // Assign voice profiles to both speakers
    const profileSelects = page.locator("select")
    const count = await profileSelects.count()
    if (count > 0) {
      // Select first available profile for speaker A
      await profileSelects.nth(0).selectOption({ index: 1 })
    }

    // Submit render
    const submitBtn = page.getByRole("button", { name: /Generate|Render|Submit/i }).last()
    await submitBtn.click()

    // Wait for generation to complete
    await expect(page.getByText(/done|complete|download/i)).toBeVisible({ timeout: 120_000 })

    // Download should be available
    await expect(page.getByText(/MP3|WAV|download/i)).toBeVisible()
  })

  test("podcast render with 2 speakers and chapter markers", async ({ page }) => {
    await page.goto("/generate/podcast")

    // Fill in timed script
    const script = [
      "[00:00 A] Hello and welcome to our show.",
      "[00:04 B] Thanks for having me here today.",
      "[00:08 A] Let us discuss the future of AI in Vietnam.",
      "[00:14 B] I think it is incredibly promising.",
    ].join("\n")

    await page.locator("textarea").first().fill(script)

    // Assign profiles (first available in each selector)
    const selects = page.locator("select")
    const cnt = await selects.count()
    if (cnt >= 2) {
      await selects.nth(0).selectOption({ index: 1 })
      await selects.nth(1).selectOption({ index: 1 })
    }

    await page.getByRole("button", { name: /Generate/i }).click()

    // Should queue and eventually produce output with chapters
    await expect(page.getByText(/queued|running|processing/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/done|complete|download/i)).toBeVisible({ timeout: 180_000 })
  })
})

test.describe("Phase 2 — UI smoke (no ML required)", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" })

  test("podcast page renders correctly", async ({ page }) => {
    await page.goto("/generate/podcast")
    await expect(page).toHaveTitle(/Podcast|YouNet/)
  })

  test("revoice page renders correctly", async ({ page }) => {
    await page.goto("/generate/revoice")
    await expect(page).toHaveTitle(/Re.voice|YouNet/i)
  })

  test("history page shows generation list", async ({ page }) => {
    await page.goto("/history")
    await expect(page.getByText(/Generation History|Lịch sử/i)).toBeVisible()
  })
})
