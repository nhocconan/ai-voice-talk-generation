import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { SystemHealthDashboard } from "@/components/features/admin/SystemHealthDashboard"

export const metadata: Metadata = { title: "Admin — System Health" }

export default async function SystemHealthPage() {
  const t = await getTranslations("admin")
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display-card">{t("page.systemHealthTitle")}</h1>
        <p className="text-body text-[var(--color-text-secondary)] mt-1">
          {t("page.systemHealthSubtitle")}
        </p>
      </div>
      <SystemHealthDashboard />
    </div>
  )
}
