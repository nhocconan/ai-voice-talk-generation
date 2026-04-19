export interface TimedScriptSegment {
  label: "A" | "B"
  startMs: number
  endMs: number
  text: string
}

export const parseTimedScript = (input: string): TimedScriptSegment[] => {
  const lines = input.split("\n").map((line) => line.trim()).filter(Boolean)

  const segments = lines.map((line, index) => {
    const match = /^\[(\d{2}):(\d{2})\s+([AB])\]\s+(.+)$/.exec(line)
    if (!match) {
      throw new Error(`Line ${index + 1} must match [MM:SS A] text`)
    }

    const startMs = (Number(match[1] ?? "0") * 60 + Number(match[2] ?? "0")) * 1000

    return {
      label: (match[3] ?? "A") as "A" | "B",
      startMs,
      endMs: startMs + 5000,
      text: match[4] ?? "",
    }
  })

  return segments.map((segment, index) => ({
    ...segment,
    endMs: segments[index + 1]?.startMs ?? segment.endMs,
  }))
}
