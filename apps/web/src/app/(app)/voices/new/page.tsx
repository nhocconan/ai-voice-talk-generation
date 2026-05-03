import type { Metadata } from "next"
import { EnrollmentWizard } from "@/components/features/voice/EnrollmentWizard"
import { FeatureGate } from "@/components/features/FeatureGate"
import { InstructionCard } from "@/components/features/InstructionCard"

export const metadata: Metadata = { title: "New Voice Profile" }

export default function NewVoicePage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-display-card mb-2">New Voice Profile</h1>
        <p className="text-body text-[var(--color-text-secondary)]">
          Record or upload reference audio to create a cloneable voice profile.
        </p>
      </div>
      <InstructionCard
        title="How enrollment works"
        steps={[
          "Provide 30–90 seconds of clean speech in a single voice, single language.",
          "Record in-browser or upload a WAV/MP3/M4A file (under 25 MB).",
          "The system checks SNR, duration, and clipping; you'll see a quality badge.",
          "Accept consent and name the profile. It becomes usable for generation immediately.",
        ]}
      />
      <FeatureGate featureId="voice.enroll">
        <EnrollmentWizard />
      </FeatureGate>
    </div>
  )
}
