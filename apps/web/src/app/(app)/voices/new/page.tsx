import type { Metadata } from "next"
import { EnrollmentWizard } from "@/components/features/voice/EnrollmentWizard"

export const metadata: Metadata = { title: "New Voice Profile" }

export default function NewVoicePage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-display-card mb-2">New Voice Profile</h1>
      <p className="text-body text-[var(--color-text-secondary)] mb-8">
        Record or upload reference audio to create a cloneable voice profile.
      </p>
      <EnrollmentWizard />
    </div>
  )
}
