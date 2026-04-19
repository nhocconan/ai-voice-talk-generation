import { beforeEach, describe, expect, it, vi } from "vitest"

const incr = vi.fn()
const expire = vi.fn()

vi.mock("@/env", () => ({
  env: {
    REDIS_URL: "redis://localhost:6379",
  },
}))

vi.mock("ioredis", () => ({
  default: vi.fn(() => ({
    incr,
    expire,
  })),
}))

describe("checkFixedWindowLimit", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-19T10:00:00.000Z"))
    incr.mockReset()
    expire.mockReset()
  })

  it("allows requests below the limit and sets expiry on a new bucket", async () => {
    incr.mockResolvedValue(1)
    expire.mockResolvedValue(1)

    const { checkFixedWindowLimit } = await import("./rate-limit")
    const result = await checkFixedWindowLimit("auth", "127.0.0.1", 5, 900)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
    expect(result.resetAt).toBe(1776593700)
    expect(incr).toHaveBeenCalledWith("ratelimit:auth:127.0.0.1:1776592800")
    expect(expire).toHaveBeenCalledWith("ratelimit:auth:127.0.0.1:1776592800", 900)
  })

  it("blocks requests over the limit", async () => {
    incr.mockResolvedValue(6)

    const { checkFixedWindowLimit } = await import("./rate-limit")
    const result = await checkFixedWindowLimit("auth", "127.0.0.1", 5, 900)

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(expire).not.toHaveBeenCalled()
  })
})
