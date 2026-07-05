import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { UserManager } from "@/components/features/admin/UserManager"

export const metadata: Metadata = { title: "Admin — Users" }

export default async function AdminUsersPage() {
  const t = await getTranslations("admin")
  return (
    <div className="space-y-6">
      <h1 className="text-display-card">{t("page.usersTitle")}</h1>
      <UserManager />
    </div>
  )
}
