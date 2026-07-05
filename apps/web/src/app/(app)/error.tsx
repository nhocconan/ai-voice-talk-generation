"use client"

import { useEffect } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangleIcon } from "lucide-react"

/**
 * Segment error boundary for the authenticated app. Catches render errors below
 * `(app)/` so a single crashing page degrades gracefully instead of blanking.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common")

  useEffect(() => {
    // Surface for observability; Sentry (if wired) also captures this.
    console.error("App segment error:", error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div
        className="max-w-md rounded-[var(--radius-card)] p-6 text-center"
        style={{ background: "var(--color-surface-0)", boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
        role="alert"
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--color-accent-soft)" }}>
          <AlertTriangleIcon size={22} style={{ color: "var(--color-danger)" }} />
        </div>
        <h1 className="text-body-med">{t("errorTitle")}</h1>
        <p className="text-caption text-[var(--color-text-secondary)] mt-1">{t("errorHelp")}</p>
        <button
          onClick={reset}
          className="mt-5 h-10 px-6 rounded-[var(--radius-pill)] bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] text-button hover:opacity-90 transition-opacity"
        >
          {t("tryAgain")}
        </button>
      </div>
    </div>
  )
}
