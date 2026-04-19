import type { Metadata } from "next"
import { ProviderManager } from "@/components/features/admin/ProviderManager"

export const metadata: Metadata = { title: "Admin — Providers" }

export default function AdminProvidersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display-card">TTS Providers</h1>
        <p className="text-body text-[var(--color-text-secondary)] mt-1">
          Configure voice synthesis providers. API keys are encrypted at rest.
        </p>
      </div>
      <ProviderManager />
    </div>
  )
}
