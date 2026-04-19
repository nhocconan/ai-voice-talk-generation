import type { Metadata } from "next"
import { AcceptInviteForm } from "@/components/features/auth/AcceptInviteForm"

export const metadata: Metadata = { title: "Accept Invite" }

export default function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  return (
    <main className="min-h-screen bg-[var(--color-surface-1)] flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          <h1 className="text-display-section">YouNet Voice Studio</h1>
          <p className="text-caption text-[var(--color-text-muted)] mt-2">Create your account</p>
        </div>
        <div
          className="bg-[var(--color-surface-0)] p-8 rounded-[var(--radius-card)]"
          style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
        >
          <AcceptInviteForm searchParams={searchParams} />
        </div>
      </div>
    </main>
  )
}
