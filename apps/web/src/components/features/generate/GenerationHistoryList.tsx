"use client";

import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";

const STATUS_COLORS: Record<string, string> = {
  QUEUED: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
  RUNNING: "bg-blue-100 text-blue-800 dark:bg-blue-400/15 dark:text-blue-300",
  DONE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-400/15 dark:text-red-300",
  CANCELLED: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-white/60",
};

const KIND_KEYS: Record<string, string> = {
  PRESENTATION: "kindPresentation",
  PODCAST: "kindPodcast",
  REVOICE: "kindRevoice",
};

const STATUS_KEYS: Record<string, string> = {
  QUEUED: "statusQueued",
  RUNNING: "statusRunning",
  DONE: "statusDone",
  FAILED: "statusFailed",
  CANCELLED: "statusCancelled",
};

function formatMs(ms: number) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export function GenerationHistoryList() {
  const t = useTranslations("history");
  const { data, isLoading } = trpc.generation.list.useQuery({ page: 1, pageSize: 50 });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
      </div>
    );
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] py-20 text-center">
        <p className="text-[var(--color-text-secondary)]">{t("emptyTitle")}</p>
        <a href="/generate" className="mt-3 text-sm text-[var(--color-accent)] hover:underline">
          {t("emptyCta")} →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const canPlay = item.status === "DONE" && Boolean(item.outputMp3Key ?? item.outputWavKey);

        return (
          <div
            key={item.id}
            className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                  {KIND_KEYS[item.kind] ? t(KIND_KEYS[item.kind]) : item.kind}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[item.status] ?? "bg-gray-100"}`}
                >
                  {STATUS_KEYS[item.status] ? t(STATUS_KEYS[item.status]) : item.status}
                </span>
                {item.durationMs && (
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    {formatMs(item.durationMs)}
                  </span>
                )}
                <span className="text-xs text-[var(--color-text-tertiary)]">
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </div>

              <div className="flex items-center gap-3">
                {canPlay && (
                  <a
                    href={`/api/download/${item.id}`}
                    className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--color-accent-hover)]"
                  >
                    {t("download")}
                  </a>
                )}
              </div>
            </div>

            {canPlay && (
              <div className="mt-3">
                <audio
                  controls
                  preload="none"
                  src={`/api/download/${item.id}`}
                  className="h-10 w-full"
                  aria-label={t("preview")}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
