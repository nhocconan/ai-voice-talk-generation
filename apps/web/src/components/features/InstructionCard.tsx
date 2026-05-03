import { InfoIcon } from "lucide-react"

interface Props {
  title: string
  steps: string[]
}

export function InstructionCard({ title, steps }: Props) {
  return (
    <div
      className="rounded-[var(--radius-card)] p-4"
      style={{
        background: "var(--color-surface-1)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center gap-2">
        <InfoIcon size={14} style={{ color: "var(--color-accent)" }} />
        <h3 className="text-body-med">{title}</h3>
      </div>
      <ol className="list-decimal ml-5 mt-2 space-y-1 text-caption text-[var(--color-text-secondary)]">
        {steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
    </div>
  )
}
