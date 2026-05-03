import type { Metadata } from "next"
import { ForgotPasswordForm } from "@/components/features/auth/ForgotPasswordForm"

export const metadata: Metadata = { title: "Forgot Password" }

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen bg-[var(--color-surface-1)] flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          <h1 className="text-display-section text-[var(--color-text-primary)]">
            YouNet<br />
            <span style={{ color: "var(--color-accent)" }}>Voice Studio</span>
          </h1>
          <p className="text-caption text-[var(--color-text-muted)] mt-2">Reset your password</p>
        </div>

        <div
          className="bg-[var(--color-surface-0)] p-8 rounded-[var(--radius-card)]"
          style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
        >
          <ForgotPasswordForm />
        </div>
      </div>
    </main>
  )
}
