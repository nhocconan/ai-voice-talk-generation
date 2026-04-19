import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    exclude: ["**/node_modules/**", "**/e2e/**", "**/integration/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        lines: 70,
        branches: 65,
        functions: 70,
      },
      exclude: ["**/node_modules/**", "**/*.test.*", "**/e2e/**", "prisma/**", "**/*.config.*"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@contracts": path.resolve(__dirname, "../../packages/contracts/src"),
      "@ui": path.resolve(__dirname, "../../packages/ui/src"),
    },
  },
})
