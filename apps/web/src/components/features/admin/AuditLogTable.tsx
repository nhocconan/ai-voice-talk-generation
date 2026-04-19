"use client"

import { useMemo, useState } from "react"
import { trpc } from "@/lib/trpc/client"

const PAGE_SIZE = 50

function formatCsvValue(value: string) {
  const sanitized = /^[=+\-@]/.test(value) ? `'${value}` : value
  return `"${sanitized.replaceAll('"', '""')}"`
}

export function AuditLogTable() {
  const [page, setPage] = useState(1)
  const [actor, setActor] = useState("")
  const [action, setAction] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const queryInput = {
    page,
    pageSize: PAGE_SIZE,
    actor: actor || undefined,
    action: action || undefined,
    from: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
    to: to ? new Date(`${to}T23:59:59.999Z`) : undefined,
  }

  const { data, isFetching } = trpc.admin.auditLog.useQuery(queryInput)

  const csvContent = useMemo(() => {
    if (!data?.logs.length) return ""

    const header = ["Time", "Actor", "Action", "Target", "IP"]
    const rows = data.logs.map((log) => [
      new Date(log.createdAt).toISOString(),
      log.actor?.email ?? "system",
      log.action,
      `${log.targetType}${log.targetId ? `:${log.targetId}` : ""}`,
      log.ip ?? "",
    ])

    return [header, ...rows]
      .map((row) => row.map((value) => formatCsvValue(value)).join(","))
      .join("\n")
  }, [data?.logs])

  const downloadCsv = () => {
    if (!csvContent) return

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `audit-log-page-${page}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] p-4 sm:grid-cols-2 xl:grid-cols-5">
        <input
          value={actor}
          onChange={(event) => {
            setPage(1)
            setActor(event.target.value)
          }}
          placeholder="Actor email or name"
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-body-ui"
        />
        <input
          value={action}
          onChange={(event) => {
            setPage(1)
            setAction(event.target.value)
          }}
          placeholder="Action contains..."
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-body-ui"
        />
        <input
          type="date"
          value={from}
          onChange={(event) => {
            setPage(1)
            setFrom(event.target.value)
          }}
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-body-ui"
        />
        <input
          type="date"
          value={to}
          onChange={(event) => {
            setPage(1)
            setTo(event.target.value)
          }}
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-body-ui"
        />
        <div className="flex gap-2">
          <button
            onClick={downloadCsv}
            disabled={!data?.logs.length}
            className="flex-1 rounded-[var(--radius-pill)] border border-[var(--color-border)] px-3 py-2 text-caption disabled:opacity-40"
          >
            Export CSV
          </button>
          <button
            onClick={() => {
              setPage(1)
              setActor("")
              setAction("")
              setFrom("")
              setTo("")
            }}
            className="rounded-[var(--radius-pill)] border border-[var(--color-border)] px-3 py-2 text-caption"
          >
            Reset
          </button>
        </div>
      </div>

      <div
        className="overflow-hidden rounded-[var(--radius-card)]"
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
                <td className="whitespace-nowrap px-4 py-2.5 text-[var(--color-text-muted)]">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-2.5">{log.actor?.email ?? "system"}</td>
                <td className="px-4 py-2.5 font-mono text-[0.75rem]">{log.action}</td>
                <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                  {log.targetType}
                  {log.targetId ? ` · ${log.targetId.slice(-8)}` : ""}
                </td>
                <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{log.ip ?? "—"}</td>
              </tr>
            ))}
            {!data?.logs.length && !isFetching ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-text-muted)]">
                  No audit entries match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          disabled={page === 1}
          onClick={() => setPage((current) => current - 1)}
          className="rounded-[var(--radius-pill)] border border-[var(--color-border)] px-3 py-1.5 text-caption disabled:opacity-40"
        >
          ← Previous
        </button>
        <span className="text-caption text-[var(--color-text-muted)]">
          Page {page}
          {isFetching ? " · refreshing..." : ""}
        </span>
        <button
          disabled={!data || data.logs.length < PAGE_SIZE}
          onClick={() => setPage((current) => current + 1)}
          className="rounded-[var(--radius-pill)] border border-[var(--color-border)] px-3 py-1.5 text-caption disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  )
}
