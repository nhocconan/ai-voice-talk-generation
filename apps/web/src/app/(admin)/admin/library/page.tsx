import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { VoiceLibraryManager } from "@/components/features/admin/VoiceLibraryManager"

export const metadata: Metadata = { title: "Admin — Voice Library" }

export default async function AdminLibraryPage() {
  const t = await getTranslations("admin")
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display-card">{t("page.libraryTitle")}</h1>
        <p className="mt-1 text-body text-[var(--color-text-secondary)]">
          {t("page.librarySubtitle")}
        </p>
      </div>
      <VoiceLibraryManager />
    </div>
  )
}
