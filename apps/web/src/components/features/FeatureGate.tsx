"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { trpc } from "@/lib/trpc/client"
import { AlertTriangleIcon, LockIcon } from "lucide-react"

interface Props {
  featureId: string
  children: ReactNode
  title?: string
  /** When true, render children even if degraded (optional-dep missing). Default: true. */
  renderIfDegraded?: boolean
}

/**
 * Gates a feature behind service availability. If required services are down,
 * renders a blocker card instead of children. If only optional services are
 * missing, renders a soft warning above children.
 */
export function FeatureGate({ featureId, children, title, renderIfDegraded = true }: Props) {
  const { data, isLoading } = trpc.system.features.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  })

  if (isLoading || !data) {
    return <div className="text-caption text-[var(--color-text-muted)]">Checking service availability…</div>
  }

  const feature = data.features.find((f) => f.id === featureId)
  if (!feature) return <>{children}</>

  if (!feature.viable) {
    return (
      <div
        className="rounded-[var(--radius-card)] p-5"
        style={{
          background: "rgba(239,68,68,0.05)",
          border: "1px solid var(--color-error)",
        }}
      >
        <div className="flex items-start gap-3">
          <LockIcon size={18} style={{ color: "var(--color-error)", flexShrink: 0, marginTop: 2 }} />
          <div className="min-w-0">
            <h3 className="text-body-med" style={{ color: "var(--color-error)" }}>
              {title ?? feature.label} is currently unavailable
            </h3>
            <p className="text-caption text-[var(--color-text-secondary)] mt-1">
              This feature needs the following service{feature.blockedBy.length === 1 ? "" : "s"} to be running:
            </p>
            <ul className="list-disc ml-5 mt-2 space-y-0.5 text-caption text-[var(--color-text-secondary)]">
              {feature.blockedBy.map((b) => <li key={b}>{b}</li>)}
            </ul>
            <p className="text-caption text-[var(--color-text-muted)] mt-3">
              Ask an administrator to check <Link href="/admin/system-health" className="underline">System Health</Link> for troubleshooting steps.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {feature.degradedBy.length > 0 && renderIfDegraded && (
        <div
          className="rounded-[var(--radius-card)] p-3 flex items-start gap-2"
          style={{
            background: "rgba(217,119,6,0.06)",
            border: "1px solid var(--color-warning, #d97706)",
          }}
        >
          <AlertTriangleIcon size={14} style={{ color: "var(--color-warning, #d97706)", flexShrink: 0, marginTop: 2 }} />
          <p className="text-caption" style={{ color: "var(--color-text-secondary)" }}>
            Running in degraded mode — {feature.degradedBy.join(", ")}.
          </p>
        </div>
      )}
      {children}
    </>
  )
}
