import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { AuditLogTable } from "@/components/features/admin/AuditLogTable"

export const metadata: Metadata = { title: "Admin — Audit Log" }

export default async function AuditPage() {
  const t = await getTranslations("admin")
  return (
    <div className="space-y-6">
      <h1 className="text-display-card">{t("page.auditTitle")}</h1>
      <AuditLogTable />
    </div>
  )
}
