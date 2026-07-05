import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import Link from "next/link"
import { PlusIcon, UploadIcon } from "lucide-react"
import { VoiceProfileList } from "@/components/features/voice/VoiceProfileList"

export const metadata: Metadata = { title: "Voice Profiles" }

export default async function VoicesPage() {
  const t = await getTranslations("voices")
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-display-card">{t("profilesTitle")}</h1>
          <p className="text-body text-[var(--color-text-secondary)] mt-1">
            {t("enrollSubtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/voices/import"
            className="flex items-center gap-2 h-9 px-4 rounded-[var(--radius-pill)] border border-[var(--color-border)] text-button hover:bg-[var(--color-surface-1)] transition-colors"
          >
            <UploadIcon size={15} />
            {t("import")}
          </Link>
          <Link
            href="/voices/new"
            className="flex items-center gap-2 h-9 px-4 rounded-[var(--radius-pill)] bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] text-button hover:opacity-90 transition-opacity"
          >
            <PlusIcon size={15} />
            {t("newProfileShort")}
          </Link>
        </div>
      </div>
      <VoiceProfileList />
    </div>
  )
}
