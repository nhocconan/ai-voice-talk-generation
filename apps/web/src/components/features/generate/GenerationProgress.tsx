"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangleIcon } from "lucide-react"

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

  useEffect(() => {
    const es = new EventSource(`/api/jobs/${generationId}/events`)

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as ProgressEvent
        setEvents((prev) => [...prev.slice(-20), data])
        setProgress(Math.round(data.progress * 100))
        setPhase(data.message ?? data.phase)

        if (data.phase === "FAILED") {
          es.close()
          setFailed(true)
          // Don't auto-navigate on failure — let the user read the error.
        } else if (data.phase === "DONE") {
          es.close()
          const callback = onDone ?? onReset
          if (callback) setTimeout(callback, 1000)
        }
      } catch {
        // ignore
      }
    }

    // A dead stream (worker down / network) also surfaces as a failure.
    es.onerror = () => {
      es.close()
      setFailed(true)
    }

    return () => es.close()
  }, [generationId, onDone, onReset])

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
            <p className="text-caption text-[var(--color-text-secondary)] mt-1">{t("failedHelp")}</p>
            {events.length > 0 && (
              <div className="mt-3 max-h-32 overflow-y-auto space-y-0.5">
                {events.slice(-5).map((e, i) => (
                  <p key={i} className="text-micro text-[var(--color-text-muted)]">{e.message}</p>
                ))}
              </div>
            )}
            {(onReset ?? onDone) && (
              <button
                onClick={onReset ?? onDone}
                className="mt-4 h-9 px-4 rounded-[var(--radius-pill)] border border-[var(--color-border)] text-button hover:bg-[var(--color-surface-1)] transition-colors"
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
    >
      <h2 className="text-body-med mb-4">{t("generatingAudio")}</h2>

      <div className="mb-3">
        <div className="flex items-center justify-between text-caption text-[var(--color-text-muted)] mb-2">
          <span>{phase}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 bg-[var(--color-surface-1)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--color-emphasis)] rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {events.length > 0 && (
        <div className="mt-4 max-h-32 overflow-y-auto space-y-0.5">
          {events.slice(-5).map((e, i) => (
            <p key={i} className="text-micro text-[var(--color-text-muted)]">{e.message}</p>
          ))}
        </div>
      )}
    </div>
  )
}
