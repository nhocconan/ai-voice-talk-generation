"use client"

import { useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import type { inferRouterOutputs } from "@trpc/server"
import { Trash2Icon } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import type { AppRouter } from "@/server/routers/_app"

const STATUS_COLORS: Record<string, string> = {
  QUEUED: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
  RUNNING: "bg-blue-100 text-blue-800 dark:bg-blue-400/15 dark:text-blue-300",
  DONE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-400/15 dark:text-red-300",
  CANCELLED: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-white/60",
}

const KIND_KEYS: Record<string, string> = {
  PRESENTATION: "kindPresentation",
  PODCAST: "kindPodcast",
  REVOICE: "kindRevoice",
  VIDEO_REVOICE: "kindVideoRevoice",
}

const STATUS_KEYS: Record<string, string> = {
  QUEUED: "statusQueued",
  RUNNING: "statusRunning",
  DONE: "statusDone",
  FAILED: "statusFailed",
  CANCELLED: "statusCancelled",
}

function formatMs(ms: number) {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

type GenerationListItem = inferRouterOutputs<AppRouter>["generation"]["list"]["items"][number]

function HistoryItemRow({
  item,
  onDeleted,
}: {
  item: GenerationListItem
  onDeleted: () => void
}) {
  const t = useTranslations("history")
  const canPlay = item.status === "DONE" && Boolean(item.outputMp3Key ?? item.outputWavKey)
  const hasVideo = Boolean(item.outputVideoKey) || Boolean(item.sourceVideoKey)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const utils = trpc.useUtils()
  const del = trpc.generation.delete.useMutation({
    onSuccess: async () => {
      setConfirmOpen(false)
      await utils.generation.list.invalidate()
      onDeleted()
    },
  })

  const { data: downloads } = trpc.generation.getDownloadUrls.useQuery(
    { id: item.id },
    { enabled: item.status === "DONE" && Boolean(item.outputVideoKey) },
  )

  function requestDelete() {
    // Always confirm — video gets an extra irreversible warning in the dialog body.
    setConfirmOpen(true)
  }

  function confirmDelete() {
    del.mutate({ id: item.id })
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            {KIND_KEYS[item.kind] ? t(KIND_KEYS[item.kind]!) : item.kind}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[item.status] ?? "bg-gray-100"}`}
          >
            {STATUS_KEYS[item.status] ? t(STATUS_KEYS[item.status]!) : item.status}
          </span>
          {item.durationMs ? (
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {formatMs(item.durationMs)}
            </span>
          ) : null}
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {new Date(item.createdAt).toLocaleDateString()}
          </span>
          {hasVideo ? (
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              {t("hasVideoBadge")}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/history/${item.id}`}
            className="rounded-md border border-[var(--color-border)] px-3 py-1 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-1)]"
          >
            {t("viewDetails")}
          </Link>
          {canPlay ? (
            <a
              href={`/api/download/${item.id}`}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--color-accent-hover)] cursor-pointer"
            >
              {t("download")}
            </a>
          ) : null}
          {item.status === "DONE" && item.outputVideoKey && downloads?.videoUrl ? (
            <a
              href={downloads.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-[var(--color-border)] px-3 py-1 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-1)] cursor-pointer"
            >
              {t("downloadVideo")}
            </a>
          ) : null}
          <button
            type="button"
            onClick={requestDelete}
            disabled={del.isPending}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-3 py-1 text-xs font-medium text-[var(--color-danger)] hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title={t("delete")}
          >
            <Trash2Icon size={12} aria-hidden />
            {del.isPending ? t("deleting") : t("delete")}
          </button>
        </div>
      </div>

      {canPlay ? (
        <div className="mt-3">
          <audio
            controls
            preload="none"
            src={`/api/download/${item.id}`}
            className="h-10 w-full"
            aria-label={t("preview")}
          />
        </div>
      ) : null}

      {item.status === "DONE" && item.outputVideoKey && downloads?.videoUrl ? (
        <div className="mt-3">
          <video
            controls
            preload="none"
            src={downloads.videoUrl}
            className="w-full max-w-sm rounded-[var(--radius-md)]"
            aria-label={t("videoPreview")}
          />
        </div>
      ) : null}

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`del-title-${item.id}`}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50 cursor-pointer"
            aria-label={t("cancel")}
            onClick={() => !del.isPending && setConfirmOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-0)] p-5 shadow-lg">
            <h3 id={`del-title-${item.id}`} className="text-body-med text-[var(--color-text-primary)]">
              {t("deleteConfirmTitle")}
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {hasVideo ? t("deleteConfirmVideoBody") : t("deleteConfirmBody")}
            </p>
            {hasVideo ? (
              <p className="mt-2 rounded-[var(--radius-md)] border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200">
                {t("deleteVideoIrreversible")}
              </p>
            ) : null}
            {del.error ? (
              <p className="mt-2 text-sm text-[var(--color-danger)]">{del.error.message}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={del.isPending}
                onClick={() => setConfirmOpen(false)}
                className="h-9 px-4 rounded-[var(--radius-pill)] border border-[var(--color-border)] text-button cursor-pointer hover:bg-[var(--color-surface-1)] disabled:opacity-50"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                disabled={del.isPending}
                onClick={confirmDelete}
                className="h-9 px-4 rounded-[var(--radius-pill)] bg-[var(--color-danger)] text-white text-button cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {del.isPending ? t("deleting") : t("deleteConfirmAction")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function GenerationHistoryList() {
  const t = useTranslations("history")
  const { data, isLoading, refetch } = trpc.generation.list.useQuery(
    { page: 1, pageSize: 50 },
    {
      refetchInterval: (query) => query.state.data?.items.some(
        (item) => item.status === "QUEUED" || item.status === "RUNNING",
      ) ? 5000 : false,
    },
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
      </div>
    )
  }

  const items = data?.items ?? []

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] py-20 text-center">
        <p className="text-[var(--color-text-secondary)]">{t("emptyTitle")}</p>
        <a href="/generate" className="mt-3 text-sm text-[var(--color-accent)] hover:underline">
          {t("emptyCta")} →
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <HistoryItemRow key={item.id} item={item} onDeleted={() => void refetch()} />
      ))}
    </div>
  )
}
