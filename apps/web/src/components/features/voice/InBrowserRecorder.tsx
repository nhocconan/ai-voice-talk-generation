"use client"

import { useState, useRef, useEffect } from "react"
import { MicIcon, StopCircleIcon, CheckCircleIcon, AlertCircleIcon } from "lucide-react"
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
const MAX_DURATION_MS = 60000

export function InBrowserRecorder({ prompts, profileId, onComplete }: Props) {
  const [current, setCurrent] = useState(0)
  const [state, setState] = useState<RecordState>("idle")
  const [clips, setClips] = useState<RecordedClip[]>([])
  const [error, setError] = useState<string | null>(null)
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)

  const requestUploadUrl = trpc.voiceProfile.requestUploadUrl.useMutation()
  const submitSample = trpc.voiceProfile.submitSample.useMutation()

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const startRecording = async () => {
    setError(null)
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
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") stopRecording()
      }, MAX_DURATION_MS)
    } catch {
      setError("Microphone access denied. Please allow microphone in your browser.")
    }
  }

  const stopRecording = () => {
    const mr = mediaRecorderRef.current
    if (!mr || mr.state !== "recording") return
    mr.stop()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    setAnalyserNode(null)

    mr.onstop = () => {
      const duration = Date.now() - startTimeRef.current
      if (duration < MIN_DURATION_MS) {
        setError(`Recording too short (${(duration / 1000).toFixed(1)}s). Need at least 5s.`)
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

      if (current + 1 >= Math.min(3, prompts.length)) {
        setState("done")
        onComplete()
      } else {
        setCurrent((c) => c + 1)
        setState("idle")
      }
    } catch {
      setError("Upload failed. Please try again.")
      setState("reviewing")
    }
  }

  const reRecord = () => {
    setClips((prev) => prev.slice(0, -1))
    setState("idle")
  }

  const latestClip = clips[clips.length - 1]

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-micro text-[var(--color-text-muted)]">PROMPT {current + 1} OF {Math.min(5, prompts.length)}</span>
          {Array.from({ length: Math.min(5, prompts.length) }).map((_, i) => (
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
            Duration: {(latestClip.durationMs / 1000).toFixed(1)}s — sounds good?
          </p>
          <div className="flex gap-2">
            <button onClick={acceptClip} className="flex items-center gap-2 h-9 px-4 rounded-[var(--radius-pill)] bg-black text-white text-button hover:opacity-90">
              <CheckCircleIcon size={15} /> Accept
            </button>
            <button onClick={reRecord} className="h-9 px-4 rounded-[var(--radius-pill)] border border-[var(--color-border)] text-button hover:bg-[var(--color-surface-1)]">
              Re-record
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
          className="flex items-center gap-2 h-12 px-6 rounded-[var(--radius-warm-btn)] text-body-med transition-opacity hover:opacity-90"
          style={{ background: "var(--color-surface-warm-tr,var(--color-surface-warm))", boxShadow: "var(--shadow-warm-lift)" }}
        >
          <MicIcon size={18} style={{ color: "var(--color-accent)" }} />
          Start Recording
        </button>
      )}

      {state === "recording" && (
        <button
          onClick={stopRecording}
          className="flex items-center gap-2 h-12 px-6 rounded-[var(--radius-pill)] bg-[var(--color-accent)] text-white text-body-med animate-pulse"
        >
          <StopCircleIcon size={18} />
          Stop Recording
        </button>
      )}

      {state === "uploading" && (
        <p className="text-caption text-[var(--color-text-muted)]">Uploading and processing…</p>
      )}
    </div>
  )
}
