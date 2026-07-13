"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangleIcon, Loader2Icon } from "lucide-react"
import { trpc } from "@/lib/trpc/client"

interface Props {
  generationId: string
  onDone?: () => void
  onReset?: () => void
}

interface ProgressEvent {
  ts: string
  phase: string
  progress: number
  message: string
}

export function GenerationProgress({ generationId, onDone, onReset }: Props) {
  const t = useTranslations("history")
  const [events, setEvents] = useState<ProgressEvent[]>([])
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState(t("statusQueued"))
  const [failed, setFailed] = useState(false)
  const [failHint, setFailHint] = useState<string | null>(null)
  const finishedRef = useRef(false)
  const progressRef = useRef(0)
  const queuedSinceRef = useRef(Date.now())

  useEffect(() => {
    progressRef.current = progress
  }, [progress])

  // Durable status from DB — survives SSE drops and silent worker outages.
  const { data: gen } = trpc.generation.get.useQuery(
    { id: generationId },
    {
      refetchInterval: (q) => {
        const status = q.state.data?.status
        if (status === "DONE" || status === "FAILED" || status === "CANCELLED") return false
        return 2000
      },
    },
  )

  useEffect(() => {
    if (!gen || finishedRef.current) return

    if (gen.status === "RUNNING") {
      const snapshot = gen.jobProgress
      setPhase(snapshot?.message ?? t("statusRunning"))
      if (snapshot) {
        setProgress(Math.max(0, Math.min(100, Math.round(snapshot.progress * 100))))
      } else if (progress < 5) {
        setProgress(5)
      }
    } else if (gen.status === "QUEUED") {
      const snapshot = gen.jobProgress
      setPhase(snapshot?.message ?? t("statusQueued"))
      if (snapshot) setProgress(Math.max(0, Math.min(100, Math.round(snapshot.progress * 100))))
      const waitedMs = Date.now() - queuedSinceRef.current
      if (waitedMs > 20_000) {
        setPhase(t("queuedStuckHint"))
      }
    } else if (gen.status === "DONE") {
      finishedRef.current = true
      setProgress(100)
      setPhase(t("statusDone"))
      setFailed(false)
      const callback = onDone ?? onReset
      if (callback) setTimeout(callback, 800)
    } else if (gen.status === "FAILED") {
      finishedRef.current = true
      setFailed(true)
      setFailHint(gen.errorMessage ?? t("failedHelp"))
      setPhase(t("statusFailed"))
    }
  }, [gen, onDone, onReset, progress, t])

  useEffect(() => {
    const es = new EventSource(`/api/jobs/${generationId}/events`)
    let errorCount = 0

    es.onmessage = (e) => {
      errorCount = 0
      try {
        const data = JSON.parse(e.data as string) as ProgressEvent
        setEvents((prev) => [...prev.slice(-20), data])
        if (typeof data.progress === "number" && !Number.isNaN(data.progress)) {
          setProgress(Math.max(0, Math.min(100, Math.round(data.progress * 100))))
        }
        setPhase(data.message ?? data.phase)

        if (data.phase === "FAILED") {
          es.close()
          finishedRef.current = true
          setFailed(true)
          setFailHint(data.message || t("failedHelp"))
        } else if (data.phase === "DONE") {
          es.close()
          finishedRef.current = true
          setProgress(100)
          const callback = onDone ?? onReset
          if (callback) setTimeout(callback, 800)
        }
      } catch {
        // ignore malformed frames
      }
    }

    // EventSource fires onerror on transient reconnects — do NOT hard-fail once.
    // Only mark failed after repeated errors AND durable status is still open.
    es.onerror = () => {
      errorCount += 1
      if (errorCount < 5 || finishedRef.current) return
      // Keep the stream closed; DB polling above continues to drive status.
      es.close()
      setEvents((prev) => [
        ...prev,
        {
          ts: new Date().toISOString(),
          phase: "INFO",
          progress: progressRef.current / 100,
          message: t("sseDroppedHint"),
        },
      ])
    }

    return () => es.close()
  }, [generationId, onDone, onReset, t])

  if (failed) {
    return (
      <div
        className="rounded-[var(--radius-card)] p-6"
        style={{ background: "var(--color-accent-soft)", border: "1px solid var(--color-danger)" }}
        role="alert"
      >
        <div className="flex items-start gap-3">
          <AlertTriangleIcon size={20} style={{ color: "var(--color-danger)", flexShrink: 0, marginTop: 2 }} />
          <div className="min-w-0">
            <h2 className="text-body-med" style={{ color: "var(--color-danger)" }}>{t("generationFailed")}</h2>
            <p className="text-caption text-[var(--color-text-secondary)] mt-1">
              {failHint ?? t("failedHelp")}
            </p>
            {events.length > 0 && (
              <div className="mt-3 max-h-32 overflow-y-auto space-y-0.5">
                {events.slice(-5).map((e, i) => (
                  <p key={i} className="text-micro text-[var(--color-text-muted)]">{e.message}</p>
                ))}
              </div>
            )}
            {(onReset ?? onDone) && (
              <button
                type="button"
                onClick={onReset ?? onDone}
                className="mt-4 h-9 px-4 rounded-[var(--radius-pill)] border border-[var(--color-border)] text-button cursor-pointer hover:bg-[var(--color-surface-1)] transition-colors"
              >
                {t("goBack")}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-6"
      style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center gap-2 mb-4">
        <Loader2Icon size={18} className="animate-spin text-[var(--color-emphasis)]" aria-hidden />
        <h2 className="text-body-med">{t("generatingAudio")}</h2>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between text-caption text-[var(--color-text-muted)] mb-2">
          <span className="min-w-0 truncate pr-3">{phase}</span>
          <span className="shrink-0 tabular-nums">{progress}%</span>
        </div>
        <div className="h-2 bg-[var(--color-surface-1)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--color-emphasis)] rounded-full transition-all duration-300"
            style={{ width: `${Math.max(progress, gen?.status === "RUNNING" ? 5 : 2)}%` }}
          />
        </div>
      </div>

      <p className="text-micro text-[var(--color-text-muted)]">
        {t("progressStayHint")}
      </p>

      {events.length > 0 && (
        <div className="mt-4 max-h-32 overflow-y-auto space-y-0.5">
          {events.slice(-8).map((e, i) => (
            <p key={i} className="text-micro text-[var(--color-text-muted)]">{e.message}</p>
          ))}
        </div>
      )}
    </div>
  )
}
