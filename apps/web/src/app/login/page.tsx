import type { Metadata } from "next"
import { LoginForm } from "@/components/features/auth/LoginForm"

export const metadata: Metadata = { title: "Sign In" }

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[var(--color-surface-1)] flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        {/* Logo mark */}
        <div className="text-center mb-8">
          <h1 className="text-display-section text-[var(--color-text-primary)]">
            YouNet<br />
            <span style={{ color: "var(--color-accent)" }}>Voice Studio</span>
          </h1>
          <p className="text-caption text-[var(--color-text-muted)] mt-2">Sign in to your account</p>
        </div>

        {/* Card */}
        <div
          className="bg-[var(--color-surface-0)] p-8 rounded-[var(--radius-card)]"
          style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
        >
          <LoginForm />
        </div>
      </div>
    </main>
  )
}
