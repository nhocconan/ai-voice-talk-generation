"use client"

import { useState } from "react"
import { trpc } from "@/lib/trpc/client"

export function AuditLogTable() {
  const [page, setPage] = useState(1)
  const { data } = trpc.admin.auditLog.useQuery({ page, pageSize: 50 })

  return (
    <div className="space-y-4">
      <div
        className="rounded-[var(--radius-card)] overflow-hidden"
        style={{ border: "1px solid var(--color-border)" }}
      >
        <table className="w-full text-caption">
          <thead style={{ background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}>
            <tr>
              <th className="px-4 py-3 text-left text-[var(--color-text-muted)]">Time</th>
              <th className="px-4 py-3 text-left text-[var(--color-text-muted)]">Actor</th>
              <th className="px-4 py-3 text-left text-[var(--color-text-muted)]">Action</th>
              <th className="px-4 py-3 text-left text-[var(--color-text-muted)]">Target</th>
              <th className="px-4 py-3 text-left text-[var(--color-text-muted)]">IP</th>
            </tr>
          </thead>
          <tbody>
            {data?.logs.map((log) => (
              <tr key={log.id} style={{ borderBottom: "1px solid var(--color-border-subtle,var(--color-border))" }}>
                <td className="px-4 py-2.5 text-[var(--color-text-muted)] whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-2.5">{log.actor?.email ?? "system"}</td>
                <td className="px-4 py-2.5 font-mono text-[0.75rem]">{log.action}</td>
                <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                  {log.targetType}{log.targetId ? ` · ${log.targetId.slice(-8)}` : ""}
                </td>
                <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{log.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center gap-3">
        <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="text-caption px-3 py-1.5 border border-[var(--color-border)] rounded-[var(--radius-pill)] disabled:opacity-40">
          ← Previous
        </button>
        <span className="text-caption text-[var(--color-text-muted)]">Page {page}</span>
        <button disabled={!data || data.logs.length < 50} onClick={() => setPage((p) => p + 1)} className="text-caption px-3 py-1.5 border border-[var(--color-border)] rounded-[var(--radius-pill)] disabled:opacity-40">
          Next →
        </button>
      </div>
    </div>
  )
}
