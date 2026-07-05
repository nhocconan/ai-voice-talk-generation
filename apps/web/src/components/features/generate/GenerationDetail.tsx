"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { trpc } from "@/lib/trpc/client"

const STATUS_KEYS: Record<string, string> = {
  QUEUED: "statusQueued",
  RUNNING: "statusRunning",
  DONE: "statusDone",
  FAILED: "statusFailed",
  CANCELLED: "statusCancelled",
}

export function GenerationDetail({ generationId }: { generationId: string }) {
  const t = useTranslations("history")
  const [shareLink, setShareLink] = useState<string | null>(null)
  const { data: generation, isLoading } = trpc.generation.get.useQuery({ id: generationId })
  const { data: downloads } = trpc.generation.getDownloadUrls.useQuery(
    { id: generationId },
    { enabled: generation?.status === "DONE" },
  )
  const createShareLink = trpc.generation.createShareLink.useMutation({
    onSuccess: ({ shareToken }) => {
      const url = `${window.location.origin}/share/${shareToken}`
      setShareLink(url)
    },
  })
  const revokeShareLink = trpc.generation.revokeShareLink.useMutation({
    onSuccess: () => setShareLink(null),
  })

  if (isLoading || !generation) {
    return (
      <div className="rounded-[var(--radius-card)] bg-[var(--color-surface-0)] p-6">
        <p className="text-body-ui text-[var(--color-text-muted)]">{t("loading")}</p>
      </div>
    )
  }

  return (
    <div
      className="space-y-6 rounded-[var(--radius-card)] bg-[var(--color-surface-0)] p-6"
      style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-caption text-[var(--color-text-muted)]">{t("generationLabel")}</p>
          <h2 className="text-display-card mt-1">{generation.kind}</h2>
          <p className="mt-2 text-caption text-[var(--color-text-muted)]">
            {t("providerLabel")}: {generation.provider.name}
          </p>
        </div>
        <span className="rounded-full border border-[var(--color-border)] px-3 py-1 text-caption">
          {STATUS_KEYS[generation.status] ? t(STATUS_KEYS[generation.status]) : generation.status}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
          <p className="text-caption text-[var(--color-text-muted)]">{t("created")}</p>
          <p className="mt-1 text-body-ui">{new Date(generation.createdAt).toLocaleString()}</p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
          <p className="text-caption text-[var(--color-text-muted)]">{t("duration")}</p>
          <p className="mt-1 text-body-ui">
            {generation.durationMs
              ? t("durationSeconds", { n: Math.round(generation.durationMs / 1000) })
              : t("pending")}
          </p>
        </div>
      </div>

      {generation.errorMessage ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)] px-4 py-3 text-body-ui text-[var(--color-danger)]">
          {generation.errorMessage}
        </div>
      ) : null}

      {generation.inputScript ? (
        <div>
          <p className="text-caption text-[var(--color-text-muted)]">{t("inputScript")}</p>
          <pre className="mt-2 max-h-96 overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4 text-caption whitespace-pre-wrap">
            {generation.inputScript}
          </pre>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {downloads?.mp3Url ? (
          <a
            href={downloads.mp3Url}
            target="_blank"
            rel="noreferrer"
            className="rounded-[var(--radius-pill)] bg-[var(--color-btn-primary-bg)] px-5 py-2 text-button text-[var(--color-btn-primary-fg)] hover:opacity-90"
          >
            {t("downloadMp3")}
          </a>
        ) : null}
        {downloads?.wavUrl ? (
          <a
            href={downloads.wavUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-[var(--radius-pill)] border border-[var(--color-border)] px-5 py-2 text-button hover:bg-[var(--color-surface-1)]"
          >
            {t("downloadWav")}
          </a>
        ) : null}
        {generation.status === "DONE" && !shareLink && (
          <button
            onClick={() => createShareLink.mutate({ id: generationId })}
            disabled={createShareLink.isPending}
            className="rounded-[var(--radius-pill)] border border-[var(--color-border)] px-5 py-2 text-button hover:bg-[var(--color-surface-1)] disabled:opacity-50"
          >
            {createShareLink.isPending ? t("creatingLink") : t("share")}
          </button>
        )}
        {createShareLink.error && (
          <p className="text-micro text-[var(--color-danger)]">{createShareLink.error.message}</p>
        )}
      </div>

      {shareLink && (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4 space-y-2">
          <p className="text-caption text-[var(--color-text-muted)]">{t("shareLinkTitle")}</p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={shareLink}
              className="flex-1 px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui text-sm bg-[var(--color-surface-1)]"
              onFocus={(e) => e.target.select()}
            />
            <button
              onClick={() => navigator.clipboard.writeText(shareLink)}
              className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-caption hover:bg-[var(--color-surface-2)]"
            >
              {t("copy")}
            </button>
          </div>
          <button
            onClick={() => revokeShareLink.mutate({ id: generationId })}
            disabled={revokeShareLink.isPending}
            className="text-micro text-[var(--color-danger)] hover:underline disabled:opacity-50"
          >
            {t("revokeLink")}
          </button>
        </div>
      )}
    </div>
  )
}
