import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { PresentationGenerator } from "@/components/features/generate/PresentationGenerator"
import { FeatureGate } from "@/components/features/FeatureGate"
import { InstructionCard } from "@/components/features/InstructionCard"

export const metadata: Metadata = { title: "Generate Presentation" }

export default async function GeneratePage() {
  const t = await getTranslations("generateHub")
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-display-card">{t("presentationTitle")}</h1>
        <p className="text-body text-[var(--color-text-secondary)] mt-1">
          {t("presentationSubtitle")}
        </p>
      </div>
      <InstructionCard title={t("howItWorks")} steps={t.raw("presentationSteps")} />
      <FeatureGate featureId="generate.presentation">
        <PresentationGenerator />
      </FeatureGate>
    </div>
  )
}
