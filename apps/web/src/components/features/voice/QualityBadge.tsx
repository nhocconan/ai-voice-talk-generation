interface QualityDetailJson {
  snrDb?: number
  snr_db?: number
  clippingRatio?: number
  clipping_ratio?: number
  noiseFloorDb?: number
  noise_floor_db?: number
  durationS?: number
  duration_s?: number
  pitchStdHz?: number
  pitch_std_hz?: number
}

interface Props {
  score: number
  detail?: QualityDetailJson | null
  showLabel?: boolean
  showHints?: boolean
}

const tiers = [
  { min: 80, label: "Excellent", color: "var(--color-success)" },
  { min: 60, label: "Good", color: "var(--color-info)" },
  { min: 40, label: "Fair", color: "var(--color-warning)" },
  { min: 0, label: "Poor", color: "var(--color-danger)" },
]

function getHints(score: number, detail?: QualityDetailJson | null): string[] {
  if (!detail) return []
  const hints: string[] = []

  const snr = detail.snrDb ?? detail.snr_db ?? 0
  const clipping = detail.clippingRatio ?? detail.clipping_ratio ?? 0
  const noise = detail.noiseFloorDb ?? detail.noise_floor_db ?? 0
  const duration = detail.durationS ?? detail.duration_s ?? 0
  const pitch = detail.pitchStdHz ?? detail.pitch_std_hz ?? 0

  if (snr < 15) hints.push("Increase microphone gain — signal-to-noise ratio is low")
  if (clipping > 0.02) hints.push("Reduce input level — audio is clipping (distorting)")
  if (noise > -30) hints.push("Record in a quieter environment — background noise is high")
  if (duration < 10) hints.push("Record at least 10 seconds for better voice matching")
  if (duration > 60) hints.push("Trim to under 60 seconds — very long samples may reduce quality")
  if (pitch > 80) hints.push("Speak at a consistent pace — pitch variance is high")
  if (score < 40 && hints.length === 0) hints.push("Try re-recording in a quiet room with a closer microphone")

  return hints
}

export function QualityBadge({ score, detail, showLabel = true, showHints = false }: Props) {
  const tier = tiers.find((t) => score >= t.min) ?? tiers[tiers.length - 1]!
  const hints = showHints ? getHints(score, detail) : []

  return (
    <div>
      <span
        className="inline-flex items-center gap-1 text-micro px-2 py-0.5 rounded-full"
        style={{ backgroundColor: `${tier.color}18`, color: tier.color }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tier.color }} />
        {showLabel && `${tier.label} · `}{score}/100
      </span>

      {showHints && hints.length > 0 && (
        <ul className="mt-2 space-y-1">
          {hints.map((hint, i) => (
            <li key={i} className="text-micro text-[var(--color-text-muted)] flex items-start gap-1.5">
              <span className="mt-0.5 shrink-0" style={{ color: tier.color }}>▲</span>
              {hint}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
