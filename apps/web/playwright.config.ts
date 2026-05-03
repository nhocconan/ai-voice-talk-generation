import { defineConfig, devices } from "@playwright/test"

const BASE_URL = process.env["PLAYWRIGHT_BASE_URL"] ?? "http://localhost:3001"

export default defineConfig({
  globalSetup: "./tests/e2e/global-setup.ts",
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    video: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env["CI"]
    ? {
        command: "node .next/standalone/server.js",
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : {
        command: "PORT=3001 pnpm dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 60_000,
      },
})
