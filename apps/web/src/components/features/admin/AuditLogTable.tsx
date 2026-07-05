"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { trpc } from "@/lib/trpc/client"

const PAGE_SIZE = 50

function formatCsvValue(value: string) {
  const sanitized = /^[=+\-@]/.test(value) ? `'${value}` : value
  return `"${sanitized.replaceAll('"', '""')}"`
}

export function AuditLogTable() {
  const t = useTranslations("admin")
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
          placeholder={t("auditLog.actorPlaceholder")}
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-body-ui"
        />
        <input
          value={action}
          onChange={(event) => {
            setPage(1)
            setAction(event.target.value)
          }}
          placeholder={t("auditLog.actionPlaceholder")}
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
            {t("auditLog.exportCsv")}
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
            {t("auditLog.reset")}
          </button>
        </div>
      </div>

      <div
        className="overflow-hidden rounded-[var(--radius-card)]"
        style={{ border: "1px solid var(--color-border)" }}
      >
        <div className="overflow-x-auto"><table className="w-full text-caption">
          <thead style={{ background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}>
            <tr>
              <th className="px-4 py-3 text-left text-[var(--color-text-muted)]">{t("auditLog.colTime")}</th>
              <th className="px-4 py-3 text-left text-[var(--color-text-muted)]">{t("auditLog.colActor")}</th>
              <th className="px-4 py-3 text-left text-[var(--color-text-muted)]">{t("auditLog.colAction")}</th>
              <th className="px-4 py-3 text-left text-[var(--color-text-muted)]">{t("auditLog.colTarget")}</th>
              <th className="px-4 py-3 text-left text-[var(--color-text-muted)]">{t("auditLog.colIp")}</th>
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
                  {t("auditLog.empty")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table></div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          disabled={page === 1}
          onClick={() => setPage((current) => current - 1)}
          className="rounded-[var(--radius-pill)] border border-[var(--color-border)] px-3 py-1.5 text-caption disabled:opacity-40"
        >
          ← {t("auditLog.previous")}
        </button>
        <span className="text-caption text-[var(--color-text-muted)]">
          {t("auditLog.pageLabel", { page })}
          {isFetching ? ` · ${t("auditLog.refreshing")}` : ""}
        </span>
        <button
          disabled={!data || data.logs.length < PAGE_SIZE}
          onClick={() => setPage((current) => current + 1)}
          className="rounded-[var(--radius-pill)] border border-[var(--color-border)] px-3 py-1.5 text-caption disabled:opacity-40"
        >
          {t("auditLog.next")} →
        </button>
      </div>
    </div>
  )
}
