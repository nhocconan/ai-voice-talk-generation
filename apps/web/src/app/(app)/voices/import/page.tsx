import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { ImportWizard } from "@/components/features/voice/ImportWizard"
import { FeatureGate } from "@/components/features/FeatureGate"

export const metadata: Metadata = { title: "Import Voice Profile" }

export default async function ImportVoicePage() {
  const t = await getTranslations("voices")
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-display-card mb-2">{t("importTitle")}</h1>
        <p className="text-body text-[var(--color-text-secondary)]">{t("importSubtitle")}</p>
      </div>
      <FeatureGate featureId="voice.enroll">
        <ImportWizard />
      </FeatureGate>
    </div>
  )
}
