"use client"

import { trpc } from "@/lib/trpc/client"
import { cn } from "@/lib/utils"
import { MicIcon } from "lucide-react"

interface Props {
  selected?: string
  onSelect?: (id: string) => void
  value?: string
  onChange?: (id: string) => void
  placeholder?: string
  required?: boolean
  exclude?: string[]
}

export function ProfileSelector({ selected, onSelect, value, onChange, exclude = [] }: Props) {
  const { data: profiles, isLoading } = trpc.voiceProfile.list.useQuery()
  const currentValue = selected ?? value ?? ""
  const handleSelect = onSelect ?? onChange ?? (() => undefined)
  const available = profiles?.filter((p) => !exclude.includes(p.id)) ?? []

  if (isLoading) return <div className="h-12 bg-[var(--color-surface-1)] animate-pulse rounded-[var(--radius-md)]" />

  if (!available.length) {
    return (
      <p className="text-caption text-[var(--color-danger)]">
        No voice profiles available. <a href="/voices/new" className="underline">Create one first.</a>
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {available.map((p) => {
        const latestScore = p.samples.sort((a, b) => b.version - a.version)[0]?.qualityScore
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => handleSelect(p.id)}
            className={cn(
              "flex items-center gap-3 p-3 rounded-[var(--radius-md)] border text-left transition-colors",
              currentValue === p.id
                ? "border-black bg-[var(--color-surface-1)]"
                : "border-[var(--color-border)] hover:bg-[var(--color-surface-1)]",
            )}
          >
            <div className="w-8 h-8 rounded-full bg-[var(--color-surface-1)] flex items-center justify-center shrink-0">
              <MicIcon size={14} className="text-[var(--color-text-muted)]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-small truncate">{p.name}</div>
              <div className="text-micro text-[var(--color-text-muted)]">
                {p.lang.toUpperCase()} {latestScore !== undefined ? `· ${latestScore}/100` : ""}
              </div>
            </div>
            {currentValue === p.id && <div className="w-2 h-2 rounded-full bg-black shrink-0" />}
          </button>
        )
      })}
    </div>
  )
}
