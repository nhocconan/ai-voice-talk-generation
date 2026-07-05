import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { WorkspaceManager } from "@/components/features/admin/WorkspaceManager"

export const metadata: Metadata = { title: "Admin — Workspaces" }

export default async function AdminWorkspacesPage() {
  const t = await getTranslations("admin")
  return (
    <div className="space-y-6">
      <h1 className="text-display-card">{t("page.workspacesTitle")}</h1>
      <WorkspaceManager />
    </div>
  )
}
