"use client"

import { useLocale, useTranslations } from "next-intl"
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
  const locale = useLocale()
  const t = useTranslations("generate")
  const { data: providers, isLoading } = trpc.generation.listAvailableProviders.useQuery()

  if (isLoading) {
    return <div className="h-10 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-1)]" />
  }

  const selectedProvider =
    (value ? providers?.find((provider) => provider.id === value) : providers?.find((provider) => provider.isDefault)) ??
    providers?.[0]
  const selectedMeta = selectedProvider ? getProviderMeta(selectedProvider.name, locale) : null
  const isApproximateLocalClone = selectedProvider?.name === "VIENEU_TTS" || selectedProvider?.name === "VOXCPM2"

  return (
    <div className="space-y-2">
      <label className="block text-caption">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-0)] px-3 py-2 text-body-ui"
      >
        <option value="">{t("useDefaultProvider")}</option>
        {providers?.map((provider) => {
          const meta = getProviderMeta(provider.name, locale)
          return (
            <option key={provider.id} value={provider.id}>
              {meta?.shortName ?? provider.name}
              {provider.isDefault ? " (default)" : ""}
            </option>
          )
        })}
      </select>
      <p className="text-micro text-[var(--color-text-muted)]">{description}</p>
      {selectedMeta ? (
        <p className="text-micro text-[var(--color-text-muted)]">{selectedMeta.tagline}</p>
      ) : null}
      {isApproximateLocalClone ? (
        <p className="rounded-[var(--radius-md)] border border-amber-300 bg-amber-50 px-3 py-2 text-micro text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200">
          {t("localCloneWarning")}
        </p>
      ) : null}
    </div>
  )
}
