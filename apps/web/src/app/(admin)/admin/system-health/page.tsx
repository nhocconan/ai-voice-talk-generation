import type { Metadata } from "next"
import { SystemHealthDashboard } from "@/components/features/admin/SystemHealthDashboard"

export const metadata: Metadata = { title: "Admin — System Health" }

export default function SystemHealthPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display-card">System Health</h1>
        <p className="text-body text-[var(--color-text-secondary)] mt-1">
          Live status of every service the app depends on, plus which features are currently available.
        </p>
      </div>
      <SystemHealthDashboard />
    </div>
  )
}
