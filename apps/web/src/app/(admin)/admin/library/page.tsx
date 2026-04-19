import type { Metadata } from "next"

export const metadata: Metadata = { title: "Admin — Voice Library" }

export default function AdminLibraryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display-card">Voice Library</h1>
        <p className="mt-1 text-body text-[var(--color-text-secondary)]">
          Org-shared voice library tools land here. The route is live so admin navigation stays intact.
        </p>
      </div>
    </div>
  )
}
