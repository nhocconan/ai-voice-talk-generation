import { describe, expect, it } from "vitest"
import { formatDuration, formatFileSize, msToTimestamp, timestampToMs } from "./utils"

describe("utils", () => {
  it("formats durations across minute and hour boundaries", () => {
    expect(formatDuration(65_000)).toBe("1:05")
    expect(formatDuration(3_665_000)).toBe("1:01:05")
  })

  it("formats file sizes and timestamp conversions", () => {
    expect(formatFileSize(999)).toBe("999 B")
    expect(formatFileSize(1_536)).toBe("1.5 KB")
    expect(formatFileSize(2_097_152)).toBe("2.0 MB")
    expect(msToTimestamp(125_000)).toBe("02:05")
    expect(timestampToMs("02:05")).toBe(125_000)
  })
})
