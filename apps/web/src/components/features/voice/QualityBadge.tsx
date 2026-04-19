interface Props {
  score: number
  showLabel?: boolean
}

const tiers = [
  { min: 80, label: "Excellent", color: "var(--color-success)" },
  { min: 60, label: "Good", color: "var(--color-info)" },
  { min: 40, label: "Fair", color: "var(--color-warning)" },
  { min: 0, label: "Poor", color: "var(--color-danger)" },
]

export function QualityBadge({ score, showLabel = true }: Props) {
  const tier = tiers.find((t) => score >= t.min) ?? tiers[tiers.length - 1]!

  return (
    <span
      className="inline-flex items-center gap-1 text-micro px-2 py-0.5 rounded-full"
      style={{ backgroundColor: `${tier.color}18`, color: tier.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tier.color }} />
      {showLabel && `${tier.label} · `}{score}/100
    </span>
  )
}
