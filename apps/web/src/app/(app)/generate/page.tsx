import type { Metadata } from "next"
import { PresentationGenerator } from "@/components/features/generate/PresentationGenerator"
import { FeatureGate } from "@/components/features/FeatureGate"
import { InstructionCard } from "@/components/features/InstructionCard"

export const metadata: Metadata = { title: "Generate Presentation" }

export default function GeneratePage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-display-card">Generate Presentation</h1>
        <p className="text-body text-[var(--color-text-secondary)] mt-1">
          Create single-speaker presentation audio from a script.
        </p>
      </div>
      <InstructionCard
        title="How it works"
        steps={[
          "Pick a voice profile (or enroll a new one on the Voice Profiles page).",
          "Paste or draft your script. Keep sections separated by blank lines for natural pauses.",
          "Optionally preview the first 15 seconds before committing to a full render.",
          "Click Generate — the full MP3 arrives on your History page when rendering finishes.",
        ]}
      />
      <FeatureGate featureId="generate.presentation">
        <PresentationGenerator />
      </FeatureGate>
    </div>
  )
}
