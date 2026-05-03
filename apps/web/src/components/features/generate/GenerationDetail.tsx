"use client"

import { useState } from "react"
import { trpc } from "@/lib/trpc/client"

const STATUS_LABELS: Record<string, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  DONE: "Done",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
}

export function GenerationDetail({ generationId }: { generationId: string }) {
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
        <p className="text-body-ui text-[var(--color-text-muted)]">Loading generation…</p>
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
          <p className="text-caption text-[var(--color-text-muted)]">Generation</p>
          <h2 className="text-display-card mt-1">{generation.kind}</h2>
          <p className="mt-2 text-caption text-[var(--color-text-muted)]">
            Provider: {generation.provider.name}
          </p>
        </div>
        <span className="rounded-full border border-[var(--color-border)] px-3 py-1 text-caption">
          {STATUS_LABELS[generation.status] ?? generation.status}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
          <p className="text-caption text-[var(--color-text-muted)]">Created</p>
          <p className="mt-1 text-body-ui">{new Date(generation.createdAt).toLocaleString()}</p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
          <p className="text-caption text-[var(--color-text-muted)]">Duration</p>
          <p className="mt-1 text-body-ui">
            {generation.durationMs ? `${Math.round(generation.durationMs / 1000)}s` : "Pending"}
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
          <p className="text-caption text-[var(--color-text-muted)]">Input Script</p>
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
            className="rounded-[var(--radius-pill)] bg-black px-5 py-2 text-button text-white hover:opacity-90"
          >
            Download MP3
          </a>
        ) : null}
        {downloads?.wavUrl ? (
          <a
            href={downloads.wavUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-[var(--radius-pill)] border border-[var(--color-border)] px-5 py-2 text-button hover:bg-[var(--color-surface-1)]"
          >
            Download WAV
          </a>
        ) : null}
        {generation.status === "DONE" && !shareLink && (
          <button
            onClick={() => createShareLink.mutate({ id: generationId })}
            disabled={createShareLink.isPending}
            className="rounded-[var(--radius-pill)] border border-[var(--color-border)] px-5 py-2 text-button hover:bg-[var(--color-surface-1)] disabled:opacity-50"
          >
            {createShareLink.isPending ? "Creating link…" : "Share"}
          </button>
        )}
        {createShareLink.error && (
          <p className="text-micro text-[var(--color-danger)]">{createShareLink.error.message}</p>
        )}
      </div>

      {shareLink && (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4 space-y-2">
          <p className="text-caption text-[var(--color-text-muted)]">Share link (7 days)</p>
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
              Copy
            </button>
          </div>
          <button
            onClick={() => revokeShareLink.mutate({ id: generationId })}
            disabled={revokeShareLink.isPending}
            className="text-micro text-[var(--color-danger)] hover:underline disabled:opacity-50"
          >
            Revoke link
          </button>
        </div>
      )}
    </div>
  )
}
