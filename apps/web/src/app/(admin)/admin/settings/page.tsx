import type { Metadata } from "next"
import { SettingsPanel } from "@/components/features/admin/SettingsPanel"

export const metadata: Metadata = { title: "Admin — Settings" }

export default function AdminSettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-display-card">Settings</h1>
      <SettingsPanel />
    </div>
  )
}
