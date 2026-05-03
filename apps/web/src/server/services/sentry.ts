/**
 * P3-06: Sentry error reporting — lightweight wrapper.
 * Only initializes when SENTRY_DSN is provided and @sentry/nextjs is installed.
 */

interface SentryLike {
  withScope: (fn: (scope: { setExtras: (ctx: Record<string, unknown>) => void }) => void) => void
  captureException: (err: unknown) => void
  captureMessage: (msg: string, level?: string) => void
}

let sentry: SentryLike | null | undefined

function getSentry(): SentryLike | null {
  if (!process.env["SENTRY_DSN"]) return null
  if (sentry !== undefined) return sentry
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sentry = require("@sentry/nextjs") as SentryLike
  } catch {
    sentry = null
  }
  return sentry
}

export function captureException(err: unknown, context?: Record<string, unknown>) {
  const s = getSentry()
  if (!s) return
  s.withScope((scope) => {
    if (context) scope.setExtras(context)
    s.captureException(err)
  })
}

export function captureMessage(msg: string, level: "info" | "warning" | "error" = "info") {
  const s = getSentry()
  if (!s) return
  s.captureMessage(msg, level)
}
