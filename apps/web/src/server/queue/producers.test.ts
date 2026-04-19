import { beforeEach, describe, expect, it, vi } from "vitest"

const xadd = vi.fn()

vi.mock("@/env", () => ({
  env: {
    REDIS_URL: "redis://localhost:6379",
  },
}))

vi.mock("ioredis", () => ({
  default: vi.fn(() => ({
    xadd,
  })),
}))

describe("queue stream producers", () => {
  beforeEach(() => {
    vi.resetModules()
    xadd.mockReset()
    xadd.mockResolvedValue("1713372000000-0")
  })

  it("publishes render jobs to the render stream", async () => {
    const { enqueueRenderJob } = await import("./producers")

    const payload = {
      generationId: "gen_123",
      providerId: "provider_123",
      kind: "PRESENTATION" as const,
      speakers: [{ label: "A", profileId: "profile_123", segments: [], script: "Hello world." }],
      output: { mp3: true, wav: true, chapters: false },
      pacingLock: false,
    }

    await expect(enqueueRenderJob(payload)).resolves.toBe("1713372000000-0")
    expect(xadd).toHaveBeenCalledWith(
      "render",
      "*",
      "job",
      "render.generation",
      "payload",
      JSON.stringify(payload),
    )
  })

  it("publishes ingest jobs to the ingest stream", async () => {
    const { enqueueIngestJob } = await import("./producers")

    const payload = {
      profileId: "profile_123",
      storageKey: "uploads/raw.wav",
      version: 2,
      userId: "user_123",
      notes: "guided mode",
    }

    await expect(enqueueIngestJob(payload)).resolves.toBe("1713372000000-0")
    expect(xadd).toHaveBeenCalledWith(
      "ingest",
      "*",
      "job",
      "ingest.enroll",
      "payload",
      JSON.stringify(payload),
    )
  })
})
