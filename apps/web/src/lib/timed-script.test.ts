import { describe, expect, it } from "vitest"
import { parseTimedScript } from "./timed-script"

describe("parseTimedScript", () => {
  it("parses valid speaker turns and infers end times", () => {
    const segments = parseTimedScript(`
      [00:00 A] Opening line
      [00:06 B] Response
      [00:11 A] Wrap up
    `)

    expect(segments).toEqual([
      { label: "A", startMs: 0, endMs: 6000, text: "Opening line" },
      { label: "B", startMs: 6000, endMs: 11000, text: "Response" },
      { label: "A", startMs: 11000, endMs: 16000, text: "Wrap up" },
    ])
  })

  it("throws with a precise line reference for malformed input", () => {
    expect(() => parseTimedScript("[oops] invalid")).toThrow("Line 1")
  })
})
