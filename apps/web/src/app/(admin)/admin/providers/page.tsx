import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { ProviderManager } from "@/components/features/admin/ProviderManager"

export const metadata: Metadata = { title: "Admin — Providers" }

export default async function AdminProvidersPage() {
  const t = await getTranslations("admin")
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display-card">{t("page.providersTitle")}</h1>
        <p className="text-body text-[var(--color-text-secondary)] mt-1">
          {t("page.providersSubtitle")}
        </p>
      </div>
      <ProviderManager />
    </div>
  )
}
