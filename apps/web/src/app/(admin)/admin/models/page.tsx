import type { Metadata } from "next"
import { ModelCatalogManager } from "@/components/features/admin/ModelCatalogManager"

export const metadata: Metadata = { title: "Admin — Models" }

export default function AdminModelsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display-card">Model Catalog</h1>
        <p className="text-body text-[var(--color-text-secondary)] mt-1">
          Pull the latest model list from each provider, then enable, edit, or mark a default.
          For providers without a public listing endpoint (e.g. VieNeu, VoxCPM, VibeVoice) the
          system seeds a curated catalog you can extend.
        </p>
      </div>
      <ModelCatalogManager />
    </div>
  )
}
