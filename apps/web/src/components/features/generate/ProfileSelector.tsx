"use client"

import { useEffect, type ReactNode } from "react"
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
  requireProviderVoiceId?: string | undefined
  emptyMessage?: ReactNode | undefined
}

export function ProfileSelector({ selected, onSelect, value, onChange, exclude = [], requireProviderVoiceId, emptyMessage }: Props) {
  const { data: profiles, isLoading } = trpc.voiceProfile.list.useQuery()
  const currentValue = selected ?? value ?? ""
  const handleSelect = onSelect ?? onChange ?? (() => undefined)
  const available = profiles?.filter((p) => {
    if (exclude.includes(p.id)) return false
    if (!requireProviderVoiceId) return true

    const providerVoiceIds = (p.providerVoiceIds ?? {}) as Record<string, unknown>
    const voiceId = providerVoiceIds[requireProviderVoiceId]
    return typeof voiceId === "string" && voiceId.trim().length > 0
  }) ?? []

  useEffect(() => {
    if (!isLoading && currentValue && !available.some((profile) => profile.id === currentValue)) {
      handleSelect("")
    }
  }, [available, currentValue, handleSelect, isLoading])

  if (isLoading) return <div className="h-12 bg-[var(--color-surface-1)] animate-pulse rounded-[var(--radius-md)]" />

  if (!available.length) {
    return (
      <p className="text-caption text-[var(--color-danger)]">
        {emptyMessage ?? <>No voice profiles available. <a href="/voices/new" className="underline">Create one first.</a></>}
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
                ? "border-[var(--color-emphasis)] bg-[var(--color-surface-1)]"
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
                {requireProviderVoiceId ? " · xAI Voice ID" : ""}
              </div>
            </div>
            {currentValue === p.id && <div className="w-2 h-2 rounded-full bg-[var(--color-emphasis)] shrink-0" />}
          </button>
        )
      })}
    </div>
  )
}
