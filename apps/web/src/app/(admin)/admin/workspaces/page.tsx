import type { Metadata } from "next"
import { WorkspaceManager } from "@/components/features/admin/WorkspaceManager"

export const metadata: Metadata = { title: "Admin — Workspaces" }

export default function AdminWorkspacesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-display-card">Workspaces</h1>
      <WorkspaceManager />
    </div>
  )
}
