import type { Metadata } from "next"
import { PresentationGenerator } from "@/components/features/generate/PresentationGenerator"

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
      <PresentationGenerator />
    </div>
  )
}
