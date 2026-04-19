"use client"

import { useEffect, useState } from "react"
import { trpc } from "@/lib/trpc/client"

interface Props {
  generationId: string
  onDone: () => void
}

interface ProgressEvent {
  ts: string
  phase: string
  progress: number
  message: string
}

export function GenerationProgress({ generationId, onDone }: Props) {
  const [events, setEvents] = useState<ProgressEvent[]>([])
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState("Queued")

  useEffect(() => {
    const es = new EventSource(`/api/jobs/${generationId}/events`)

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as ProgressEvent
        setEvents((prev) => [...prev.slice(-20), data])
        setProgress(Math.round(data.progress * 100))
        setPhase(data.message ?? data.phase)

        if (data.phase === "DONE" || data.phase === "FAILED") {
          es.close()
          setTimeout(onDone, 1000)
        }
      } catch {
        // ignore
      }
    }

    return () => es.close()
  }, [generationId, onDone])

  return (
    <div
      className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-6"
      style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
    >
      <h2 className="text-body-med mb-4">Generating audio…</h2>

      <div className="mb-3">
        <div className="flex items-center justify-between text-caption text-[var(--color-text-muted)] mb-2">
          <span>{phase}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 bg-[var(--color-surface-1)] rounded-full overflow-hidden">
          <div
            className="h-full bg-black rounded-full transition-all duration-300"
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
