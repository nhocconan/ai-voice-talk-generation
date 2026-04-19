import type { Metadata } from "next"
import { AuditLogTable } from "@/components/features/admin/AuditLogTable"

export const metadata: Metadata = { title: "Admin — Audit Log" }

export default function AuditPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-display-card">Audit Log</h1>
      <AuditLogTable />
    </div>
  )
}
