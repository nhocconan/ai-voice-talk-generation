import { describe, it, expect } from "vitest"
import { parseTimedScript } from "@/lib/timed-script"

describe("parseTimedScript — extended", () => {
  it("handles minutes > 9 correctly (10:30 = 630_000 ms)", () => {
    const segments = parseTimedScript("[10:30 A] Long podcast")
    expect(segments[0]?.startMs).toBe(630000)
  })

  it("trims whitespace around text", () => {
    const segments = parseTimedScript("[00:00 A]   Hello with spaces   ")
    expect(segments[0]?.text).toBe("Hello with spaces")
  })

  it("last segment endMs = startMs + 5000", () => {
    const segments = parseTimedScript("[00:05 A] Only line")
    expect(segments[0]?.endMs).toBe(10000)
  })

  it("three segments: A, B, A — endMs chains correctly", () => {
    const segments = parseTimedScript("[00:00 A] First\n[00:10 B] Second\n[00:20 A] Third")
    expect(segments[0]?.endMs).toBe(10000)
    expect(segments[1]?.endMs).toBe(20000)
    expect(segments[2]?.endMs).toBe(25000)
  })

  it("throws with line number on bad format", () => {
    expect(() => parseTimedScript("[00:00 A] Good\nbad line\n[00:10 B] Also good")).toThrow("Line 2")
  })
})
