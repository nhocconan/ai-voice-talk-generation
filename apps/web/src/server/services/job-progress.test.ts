import { describe, expect, it, vi } from "vitest"
import { parseJobProgress } from "./job-progress"

vi.mock("@/env", () => ({ env: { REDIS_URL: "redis://localhost:6379" } }))

describe("parseJobProgress", () => {
  it("returns a validated and clamped durable snapshot", () => {
    expect(parseJobProgress(JSON.stringify({
      phase: "CHUNK",
      progress: 1.2,
      message: "Uploading",
      ts: "2026-07-13T16:00:00Z",
    }))).toEqual({
      phase: "CHUNK",
      progress: 1,
      message: "Uploading",
      ts: "2026-07-13T16:00:00Z",
    })
  })

  it("rejects malformed snapshots", () => {
    expect(parseJobProgress("not-json")).toBeNull()
    expect(parseJobProgress(JSON.stringify({ phase: "CHUNK" }))).toBeNull()
  })
})
