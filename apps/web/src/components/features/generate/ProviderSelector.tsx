"use client"

import { trpc } from "@/lib/trpc/client"
import { getProviderMeta } from "@/lib/providers-meta"

interface ProviderSelectorProps {
  value?: string
  onChange: (providerId: string) => void
  label?: string
  description?: string
}

export function ProviderSelector({
  value = "",
  onChange,
  label = "Provider",
  description = "Leave empty to use the current admin default provider.",
}: ProviderSelectorProps) {
  const { data: providers, isLoading } = trpc.generation.listAvailableProviders.useQuery()

  if (isLoading) {
    return <div className="h-10 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-1)]" />
  }

  return (
    <div className="space-y-2">
      <label className="block text-caption">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 py-2 text-body-ui"
      >
        <option value="">Use default provider</option>
        {providers?.map((provider) => {
          const meta = getProviderMeta(provider.name)
          return (
            <option key={provider.id} value={provider.id}>
              {meta?.shortName ?? provider.name}
              {provider.isDefault ? " (default)" : ""}
            </option>
          )
        })}
      </select>
      <p className="text-micro text-[var(--color-text-muted)]">{description}</p>
    </div>
  )
}
