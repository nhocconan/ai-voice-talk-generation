import type { Metadata } from "next"

export const metadata: Metadata = { title: "Admin — Generations" }

export default function AdminGenerationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display-card">Generations</h1>
        <p className="mt-1 text-body text-[var(--color-text-secondary)]">
          Admin-wide generation management lands here. The route is live so admin navigation stays intact.
        </p>
      </div>
    </div>
  )
}
