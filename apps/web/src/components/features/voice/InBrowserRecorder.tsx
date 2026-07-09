"use client"

import { useState, useRef, useEffect } from "react"
import { MicIcon, StopCircleIcon, CheckCircleIcon, AlertCircleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { trpc } from "@/lib/trpc/client"
import { WaveformVisualizer } from "./WaveformVisualizer"

interface Props {
  prompts: string[]
  profileId: string
  onComplete: () => void
}

type RecordState = "idle" | "recording" | "reviewing" | "uploading" | "done" | "error"

interface RecordedClip {
  promptIndex: number
  blob: Blob
  url: string
  durationMs: number
}

const MIN_DURATION_MS = 5000
const MAX_DURATION_MS = 120000

export function InBrowserRecorder({ prompts, profileId, onComplete }: Props) {
  const t = useTranslations("voices")
  const totalPrompts = prompts.length
  const [current, setCurrent] = useState(0)
  const [state, setState] = useState<RecordState>("idle")
  const [clips, setClips] = useState<RecordedClip[]>([])
  const [error, setError] = useState<string | null>(null)
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const requestUploadUrl = trpc.voiceProfile.requestUploadUrl.useMutation()
  const submitSample = trpc.voiceProfile.submitSample.useMutation()

  useEffect(() => {
    return () => {
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const startRecording = async () => {
    setError(null)
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      setAnalyserNode(analyser)

      const mr = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" })
      mediaRecorderRef.current = mr
      chunksRef.current = []

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start(250)
      startTimeRef.current = Date.now()
      setState("recording")

      // Auto-stop at max
      stopTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") stopRecording()
      }, MAX_DURATION_MS)
    } catch {
      setError(t("micDenied"))
    }
  }

  const stopRecording = () => {
    const mr = mediaRecorderRef.current
    if (!mr || mr.state !== "recording") return
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current)
      stopTimeoutRef.current = null
    }
    mr.stop()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    setAnalyserNode(null)

    mr.onstop = () => {
      const duration = Date.now() - startTimeRef.current
      if (duration < MIN_DURATION_MS) {
        setError(t("recordingTooShort", { seconds: (duration / 1000).toFixed(1) }))
        setState("idle")
        return
      }
      const blob = new Blob(chunksRef.current, { type: "audio/webm" })
      const url = URL.createObjectURL(blob)
      setClips((prev) => [...prev, { promptIndex: current, blob, url, durationMs: duration }])
      setState("reviewing")
    }
  }

  const acceptClip = async () => {
    const clip = clips[clips.length - 1]
    if (!clip) return
    setState("uploading")

    try {
      const { uploadUrl, storageKey } = await requestUploadUrl.mutateAsync({
        profileId,
        filename: `clip_${current}.webm`,
        contentType: "audio/webm",
        contentLength: clip.blob.size,
      })

      await fetch(uploadUrl, { method: "PUT", body: clip.blob, headers: { "Content-Type": "audio/webm" } })
      await submitSample.mutateAsync({ profileId, storageKey, notes: `Guided prompt ${current + 1}` })

      if (current + 1 >= totalPrompts) {
        setState("done")
        onComplete()
      } else {
        setCurrent((c) => c + 1)
        setState("idle")
      }
    } catch {
      setError(t("uploadFailedRetry"))
      setState("reviewing")
    }
  }

  const reRecord = () => {
    setClips((prev) => prev.slice(0, -1))
    setState("idle")
  }

  const latestClip = clips[clips.length - 1]
  const acceptedClips = state === "reviewing" ? clips.slice(0, -1) : clips

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-micro text-[var(--color-text-muted)]">{t("promptCounter", { current: current + 1, total: totalPrompts })}</span>
          {Array.from({ length: totalPrompts }).map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full"
              style={{ backgroundColor: i < current ? "var(--color-text-primary)" : i === current ? "var(--color-accent)" : "var(--color-border)" }}
            />
          ))}
        </div>
        <p className="text-body mt-4 leading-relaxed">{prompts[current]}</p>
      </div>

      {/* Waveform */}
      {state === "recording" && analyserNode && (
        <WaveformVisualizer analyser={analyserNode} active />
      )}

      {/* Playback review */}
      {state === "reviewing" && latestClip && (
        <div className="space-y-3">
          <audio controls src={latestClip.url} className="w-full h-10" />
          <p className="text-caption text-[var(--color-text-muted)]">
            {t("clipDuration", { seconds: (latestClip.durationMs / 1000).toFixed(1) })}
          </p>
          <div className="flex gap-2">
            <button onClick={acceptClip} className="flex cursor-pointer items-center gap-2 h-9 px-4 rounded-[var(--radius-pill)] bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] text-button hover:opacity-90">
              <CheckCircleIcon size={15} /> {t("accept")}
            </button>
            <button onClick={reRecord} className="h-9 cursor-pointer px-4 rounded-[var(--radius-pill)] border border-[var(--color-border)] text-button hover:bg-[var(--color-surface-1)]">
              {t("reRecord")}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-body-ui text-[var(--color-danger)] bg-[var(--color-accent-soft)] rounded-[var(--radius-md)] p-3">
          <AlertCircleIcon size={16} />
          {error}
        </div>
      )}

      {(state === "idle" || state === "error") && (
        <button
          onClick={startRecording}
          className="flex cursor-pointer items-center gap-2 h-12 px-6 rounded-[var(--radius-warm-btn)] text-body-med transition-opacity hover:opacity-90"
          style={{ background: "var(--color-surface-warm-tr,var(--color-surface-warm))", boxShadow: "var(--shadow-warm-lift)" }}
        >
          <MicIcon size={18} style={{ color: "var(--color-accent)" }} />
          {t("startRecording")}
        </button>
      )}

      {state === "recording" && (
        <button
          onClick={stopRecording}
          className="flex cursor-pointer items-center gap-2 h-12 px-6 rounded-[var(--radius-pill)] bg-[var(--color-accent)] text-white text-body-med animate-pulse"
        >
          <StopCircleIcon size={18} />
          {t("stopRecording")}
        </button>
      )}

      {state === "uploading" && (
        <p className="text-caption text-[var(--color-text-muted)]">{t("uploadingProcessing")}</p>
      )}

      {state === "done" && (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-1)] p-3 text-caption text-[var(--color-text-secondary)]">
          <CheckCircleIcon size={16} style={{ color: "var(--color-success)" }} />
          {t("recordingComplete")}
        </div>
      )}

      {acceptedClips.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-caption text-[var(--color-text-secondary)]">{t("acceptedClipsTitle")}</h3>
          {acceptedClips.map((clip) => (
            <div key={clip.promptIndex} className="rounded-[var(--radius-md)] bg-[var(--color-surface-1)] p-3">
              <p className="text-micro text-[var(--color-text-muted)] mb-2">
                {t("promptCounter", { current: clip.promptIndex + 1, total: totalPrompts })} · {t("clipDurationShort", { seconds: (clip.durationMs / 1000).toFixed(1) })}
              </p>
              <audio controls src={clip.url} className="w-full h-10" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
