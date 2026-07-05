import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { ModelCatalogManager } from "@/components/features/admin/ModelCatalogManager"

export const metadata: Metadata = { title: "Admin — Models" }

export default async function AdminModelsPage() {
  const t = await getTranslations("admin")
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display-card">{t("page.modelsTitle")}</h1>
        <p className="text-body text-[var(--color-text-secondary)] mt-1">
          {t("page.modelsSubtitle")}
        </p>
      </div>
      <ModelCatalogManager />
    </div>
  )
}
