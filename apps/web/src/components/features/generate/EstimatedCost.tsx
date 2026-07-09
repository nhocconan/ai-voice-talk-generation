"use client"

import { useTranslations } from "next-intl"
import { trpc } from "@/lib/trpc/client"
import { getProviderRate } from "@/lib/provider-pricing"

/**
 * Small pre-render cost hint. Resolves the selected (or default) provider to an
 * approximate $/min rate and shows the estimated spend for `minutes`. Local
 * providers show "free". Renders nothing if the provider has no known rate.
 */
export function EstimatedCost({ providerId, minutes }: { providerId?: string | number | undefined; minutes: number }) {
  const t = useTranslations("generate")
  const { data } = trpc.generation.listAvailableProviders.useQuery()
  const normalizedMinutes = typeof minutes === "number" ? minutes : Number(minutes)
  const safeMinutes = Number.isFinite(normalizedMinutes) && normalizedMinutes > 0 ? normalizedMinutes : 0

  const provider = providerId
    ? data?.find((p) => p.id === providerId)
    : data?.find((p) => p.isDefault) ?? data?.[0]
  const rate = provider ? getProviderRate(provider.name) : null
  if (!rate) return null

  const cost = rate.costPerMinuteUsd * safeMinutes
  const costStr = cost < 0.1 ? cost.toFixed(3) : cost.toFixed(2)

  return (
    <p className="text-micro text-[var(--color-text-muted)]">
      {t("estCostLabel")}:{" "}
      <strong className="text-[var(--color-text-secondary)]">
        {rate.isLocal ? t("costLocal") : `~$${costStr}`}
      </strong>
      {!rate.isLocal && (
        <span>
          {" "}
          · {safeMinutes.toFixed(1)} {t("minShort")} × ${rate.costPerMinuteUsd.toFixed(3)}
        </span>
      )}
    </p>
  )
}
