import type { Metadata } from "next"
import { Suspense } from "react"
import { getTranslations } from "next-intl/server"
import { ResetPasswordForm } from "@/components/features/auth/ResetPasswordForm"

export const metadata: Metadata = { title: "Reset Password" }

export default async function ResetPasswordPage() {
  const t = await getTranslations("auth")
  const tc = await getTranslations("common")
  return (
    <main className="min-h-screen bg-[var(--color-surface-1)] flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          <h1 className="text-display-section text-[var(--color-text-primary)]">
            Demo<br />
            <span style={{ color: "var(--color-accent)" }}>Voice Studio</span>
          </h1>
          <p className="text-caption text-[var(--color-text-muted)] mt-2">{t("setNewPasswordSubtitle")}</p>
        </div>

        <div
          className="bg-[var(--color-surface-0)] p-8 rounded-[var(--radius-card)]"
          style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
        >
          <Suspense fallback={<p className="text-sm text-[var(--color-text-muted)]">{tc("loading")}</p>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </main>
  )
}
