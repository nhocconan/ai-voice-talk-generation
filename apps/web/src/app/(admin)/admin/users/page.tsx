import type { Metadata } from "next"
import { UserManager } from "@/components/features/admin/UserManager"

export const metadata: Metadata = { title: "Admin — Users" }

export default function AdminUsersPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-display-card">Users</h1>
      <UserManager />
    </div>
  )
}
