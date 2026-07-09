import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { SettingsPanel } from "@/components/features/admin/SettingsPanel"
import { RecaptchaSettings } from "@/components/features/admin/RecaptchaSettings"

export const metadata: Metadata = { title: "Admin — Settings" }

export default async function AdminSettingsPage() {
  const t = await getTranslations("admin")
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-display-card">{t("page.settingsTitle")}</h1>
      <SettingsPanel />
      <RecaptchaSettings />
    </div>
  )
}
