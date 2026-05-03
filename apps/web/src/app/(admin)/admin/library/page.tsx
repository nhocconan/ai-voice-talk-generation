import type { Metadata } from "next"
import { VoiceLibraryManager } from "@/components/features/admin/VoiceLibraryManager"

export const metadata: Metadata = { title: "Admin — Voice Library" }

export default function AdminLibraryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display-card">Voice Library</h1>
        <p className="mt-1 text-body text-[var(--color-text-secondary)]">
          Manage org-shared profiles and lock/unlock voice profiles across the organization.
        </p>
      </div>
      <VoiceLibraryManager />
    </div>
  )
}
