"use client"

import { useTranslations } from "next-intl"
import { trpc } from "@/lib/trpc/client"
import { CheckCircle2Icon, XCircleIcon, AlertTriangleIcon, MinusCircleIcon, RefreshCwIcon } from "lucide-react"

interface StatusStyle { color: string; labelKey: string; Icon: typeof CheckCircle2Icon }

const STATUS_STYLES: Record<"up" | "down" | "degraded" | "disabled", StatusStyle> = {
  up: { color: "var(--color-success)", labelKey: "systemHealth.statusUp", Icon: CheckCircle2Icon },
  down: { color: "var(--color-error)", labelKey: "systemHealth.statusDown", Icon: XCircleIcon },
  degraded: { color: "var(--color-warning, #d97706)", labelKey: "systemHealth.statusDegraded", Icon: AlertTriangleIcon },
  disabled: { color: "var(--color-text-muted)", labelKey: "systemHealth.statusDisabled", Icon: MinusCircleIcon },
}

export function SystemHealthDashboard() {
  const t = useTranslations("admin")
  const { data, isLoading, refetch, isFetching } = trpc.system.health.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })

  if (isLoading) {
    return <p className="text-body text-[var(--color-text-muted)]">{t("systemHealth.probing")}</p>
  }
  if (!data) {
    return <p className="text-body text-[var(--color-error)]">{t("systemHealth.loadFailed")}</p>
  }

  const { services, summary, features, checkedAt } = data

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 text-caption text-[var(--color-text-muted)]">
          <span>{t("systemHealth.checkedAt", { time: new Date(checkedAt).toLocaleTimeString() })}</span>
          <span>·</span>
          <span style={{ color: "var(--color-success)" }}>{t("systemHealth.countUp", { count: summary.ok })}</span>
          {summary.degraded > 0 && <span style={{ color: "var(--color-warning, #d97706)" }}>{t("systemHealth.countDegraded", { count: summary.degraded })}</span>}
          {summary.down > 0 && <span style={{ color: "var(--color-error)" }}>{t("systemHealth.countDown", { count: summary.down })}</span>}
          {summary.disabled > 0 && <span>{t("systemHealth.countDisabled", { count: summary.disabled })}</span>}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-caption border border-[var(--color-border)] px-3 py-1.5 rounded-[var(--radius-pill)] hover:bg-[var(--color-surface-1)] transition-colors disabled:opacity-50"
        >
          <RefreshCwIcon size={12} className={isFetching ? "animate-spin" : ""} />
          {t("systemHealth.reprobe")}
        </button>
      </div>

      <section className="space-y-3">
        <h2 className="text-body-med">{t("systemHealth.services")}</h2>
        <div className="grid gap-2">
          {services.map((s) => {
            const style = STATUS_STYLES[s.status as keyof typeof STATUS_STYLES] ?? STATUS_STYLES.disabled
            const Icon = style.Icon
            return (
              <div
                key={s.id}
                className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-4"
                style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Icon size={16} style={{ color: style.color, flexShrink: 0, marginTop: 2 }} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-body-med">{s.label}</span>
                        <span
                          className="text-micro px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider"
                          style={{ color: style.color, border: `1px solid ${style.color}` }}
                        >
                          {t(style.labelKey)}
                        </span>
                        {!s.required && (
                          <span className="text-micro text-[var(--color-text-muted)]">{t("systemHealth.optional")}</span>
                        )}
                      </div>
                      {s.detail && (
                        <p className="text-caption text-[var(--color-text-muted)] mt-1 break-all">{s.detail}</p>
                      )}
                      {s.supports.length > 0 && (
                        <p className="text-caption text-[var(--color-text-muted)] mt-1">
                          {t("systemHealth.supports")}: {s.supports.join(", ")}
                        </p>
                      )}
                      {s.setupHint && (
                        <p className="text-caption mt-2" style={{ color: "var(--color-text-secondary)" }}>
                          → {s.setupHint}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-body-med">{t("systemHealth.featureAvailability")}</h2>
        <p className="text-caption text-[var(--color-text-muted)]">
          {t("systemHealth.featureHelp")}
        </p>
        <div className="grid gap-2">
          {features.map((f) => (
            <div
              key={f.id}
              className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-3 flex items-start justify-between gap-3"
              style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                {f.viable ? (
                  <CheckCircle2Icon size={14} style={{ color: "var(--color-success)", flexShrink: 0, marginTop: 3 }} />
                ) : (
                  <XCircleIcon size={14} style={{ color: "var(--color-error)", flexShrink: 0, marginTop: 3 }} />
                )}
                <div className="min-w-0">
                  <div className="text-body-med">{f.label}</div>
                  {f.blockedBy.length > 0 && (
                    <p className="text-caption mt-0.5" style={{ color: "var(--color-error)" }}>
                      {t("systemHealth.blockedBy")}: {f.blockedBy.join(", ")}
                    </p>
                  )}
                  {f.degradedBy.length > 0 && (
                    <p className="text-caption mt-0.5" style={{ color: "var(--color-warning, #d97706)" }}>
                      {t("systemHealth.degradedBy")}: {f.degradedBy.join(", ")}
                    </p>
                  )}
                </div>
              </div>
              <span
                className="text-micro px-2 py-0.5 rounded-full font-medium uppercase tracking-wider shrink-0"
                style={{
                  color: f.viable ? "var(--color-success)" : "var(--color-error)",
                  border: `1px solid ${f.viable ? "var(--color-success)" : "var(--color-error)"}`,
                }}
              >
                {f.viable ? t("systemHealth.available") : t("systemHealth.disabled")}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
