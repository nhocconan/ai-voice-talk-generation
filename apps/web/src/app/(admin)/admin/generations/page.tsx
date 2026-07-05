import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

export const metadata: Metadata = { title: "Admin — Generations" }

export default async function AdminGenerationsPage() {
  const t = await getTranslations("admin")
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display-card">{t("page.generationsTitle")}</h1>
        <p className="mt-1 text-body text-[var(--color-text-secondary)]">
          {t("page.generationsSubtitle")}
        </p>
      </div>
    </div>
  )
}
