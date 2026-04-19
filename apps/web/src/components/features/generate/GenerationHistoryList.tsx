"use client";

import { api } from "@/lib/trpc/client";

const STATUS_COLORS: Record<string, string> = {
  QUEUED: "bg-amber-100 text-amber-800",
  RUNNING: "bg-blue-100 text-blue-800",
  DONE: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-600",
};

const KIND_LABELS: Record<string, string> = {
  PRESENTATION: "Presentation",
  PODCAST: "Podcast",
  REVOICE: "Re-voice",
};

function formatMs(ms: number) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export function GenerationHistoryList() {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    api.generation.list.useInfiniteQuery(
      { limit: 20 },
      { getNextPageParam: (last) => last.nextCursor }
    );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
      </div>
    );
  }

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] py-20 text-center">
        <p className="text-[var(--color-text-secondary)]">No generations yet.</p>
        <a href="/generate" className="mt-3 text-sm text-[var(--color-accent)] hover:underline">
          Create your first one →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3"
        >
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              {KIND_LABELS[item.kind] ?? item.kind}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[item.status] ?? "bg-gray-100"}`}
            >
              {item.status}
            </span>
            {item.durationMs && (
              <span className="text-xs text-[var(--color-text-tertiary)]">
                {formatMs(item.durationMs)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {new Date(item.createdAt).toLocaleDateString()}
            </span>
            {item.status === "DONE" && item.outputMp3Key && (
              <a
                href={`/api/download/${item.id}`}
                className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--color-accent-hover)]"
              >
                Download
              </a>
            )}
          </div>
        </div>
      ))}

      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
        >
          {isFetchingNextPage ? "Loading..." : "Load more"}
        </button>
      )}
    </div>
  );
}
